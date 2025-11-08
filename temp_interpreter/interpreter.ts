// Interpreter for Flick language

import * as AST from './ast.js';
import * as readline from 'node:readline';
import { PluginManager, PluginContext } from './plugin.js';
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';

// Runtime values
type RuntimeValue = any;

interface Environment {
  parent?: Environment;
  vars: Map<string, { value: RuntimeValue; mutable: boolean }>;
}

interface GroupDefinition {
  name: string;
  fields: AST.VariableDeclarationNode[];
  methods: Map<string, AST.TaskDeclarationNode>;
  implementations: Map<string, Map<string, AST.TaskDeclarationNode>>; // blueprint -> method map
}

interface BlueprintDefinition {
  name: string;
  methods: Map<string, AST.TaskSignatureNode>;
}

export class Interpreter {
  private globalEnv: Environment;
  private groups: Map<string, GroupDefinition> = new Map();
  private blueprints: Map<string, BlueprintDefinition> = new Map();
  private output: string[] = [];
  private pluginManager: PluginManager;
  private programAST: AST.ProgramNode | null = null;
  private currentFilePath: string = '';
  private loadedModules: Map<string, any> = new Map();

  constructor(pluginManager: PluginManager, filePath?: string) {
    this.globalEnv = { vars: new Map() };
    this.pluginManager = pluginManager;
    this.currentFilePath = filePath || '';

    // Add built-in functions
    this.globalEnv.vars.set('num', {
      value: (val: any) => {
        const parsed = parseFloat(val);
        return isNaN(parsed) ? 0 : parsed;
      },
      mutable: false
    });

    this.globalEnv.vars.set('str', {
      value: (val: any) => String(val),
      mutable: false
    });

    // Add JSON object for parsing and stringifying
    this.globalEnv.vars.set('JSON', {
      value: {
        stringify: async (val: any, space?: number) => JSON.stringify(val, null, space),
        parse: async (str: string) => JSON.parse(str),
      },
      mutable: false
    });
  }

  public async interpret(ast: AST.ProgramNode): Promise<void> {
    this.programAST = ast;

    // Store references for plugins
    (this.globalEnv as any).__interpreter = this;
    (this.globalEnv as any).__program = ast;

    for (const statement of ast.body) {
      await this.evaluateStatement(statement, this.globalEnv);
    }

    // Run plugin completion hooks
    const context: PluginContext = {
      declaredPlugins: this.pluginManager.getDeclaredPlugins(),
      env: this.globalEnv
    };

    await this.pluginManager.runFileCompleteHooks(context);
  }

  public getOutput(): string[] {
    return this.output;
  }

  public async evaluateStatement(node: AST.ASTNode, env: Environment): Promise<RuntimeValue> {
    switch (node.type) {
      case 'Program':
        for (const statement of node.body) {
          await this.evaluateStatement(statement, env);
        }
        return null;

      case 'DeclareStatement':
        return this.handleDeclare(node, env);

      case 'UseStatement':
        return await this.handleUse(node, env);

      case 'ImportStatement':
        return await this.handleImport(node, env);

      case 'RouteStatement':
        return this.handleRoute(node, env);

      case 'RespondStatement':
        return this.handleRespond(node, env);

      case 'GroupDeclaration':
        return this.defineGroup(node, env);

      case 'BlueprintDeclaration':
        return this.defineBlueprint(node, env);

      case 'DoImplementation':
        return this.implementBlueprint(node, env);

      case 'TaskDeclaration':
        return this.defineTask(node, env);

      case 'VariableDeclaration':
        return this.declareVariable(node, env);

      case 'Assignment':
        return this.assignVariable(node, env);

      case 'PrintStatement':
        return await this.executePrint(node, env);

      case 'IfStatement':
        return await this.executeIf(node, env);

      case 'EachLoop':
        return await this.executeEachLoop(node, env);

      case 'MarchLoop':
        return await this.executeMarchLoop(node, env);

      case 'SelectStatement':
        return await this.executeSelect(node, env);

      case 'ReturnStatement':
        const returnValue = node.value ? await this.evaluateExpression(node.value, env) : undefined;
        // Throw a special return object that will be caught by task execution
        throw { __return: true, value: returnValue };

      case 'ExpressionStatement':
        // If the expression is a MemberExpression (like player.greet), treat it as a call
        if (node.expression.type === 'MemberExpression') {
          const obj = await this.evaluateExpression(node.expression.object, env);
          const prop = node.expression.computed
            ? await this.evaluateExpression(node.expression.property, env)
            : (node.expression.property as AST.IdentifierNode).name;

          const method = obj[prop];
          if (typeof method === 'function') {
            return await method();
          }
          return method;
        }

        // Auto-call tasks when used as bare identifiers (e.g., "main" instead of "main()")
        if (node.expression.type === 'Identifier') {
          const value = await this.evaluateExpression(node.expression, env);
          // If it's a function (task), call it with no arguments
          if (typeof value === 'function') {
            return await value();
          }
          return value;
        }

        return await this.evaluateExpression(node.expression, env);

      default:
        throw new Error(`Unknown statement type: ${(node as any).type}`);
    }
  }

  public async evaluateExpression(node: AST.ASTNode, env: Environment): Promise<RuntimeValue> {
    switch (node.type) {
      case 'Literal':
        return node.value;

      case 'Identifier':
        return this.lookupVariable(node.name, env);

      case 'BinaryExpression':
        return await this.evaluateBinaryExpression(node, env);

      case 'UnaryExpression':
        return await this.evaluateUnaryExpression(node, env);

      case 'CallExpression':
        return await this.evaluateCall(node, env);

      case 'MemberExpression':
        return await this.evaluateMemberExpression(node, env);

      case 'ArrayLiteral':
        const elements = [];
        for (const elem of node.elements) {
          elements.push(await this.evaluateExpression(elem, env));
        }
        return elements;

      case 'ObjectLiteral':
        const obj: any = {};
        for (const prop of node.properties) {
          obj[prop.key] = await this.evaluateExpression(prop.value, env);
        }
        return obj;

      case 'AskExpression':
        return await this.evaluateAsk(node, env);

      case 'TernaryExpression':
        return await this.evaluateTernaryExpression(node, env);

      default:
        throw new Error(`Unknown statement type: ${(node as any).type}`);
    }
  }

  private async handleImport(node: AST.ImportStatementNode, env: Environment): Promise<RuntimeValue> {
    try {
      let modulePath = node.from;

      // If it's a relative path, resolve it relative to current file
      if (modulePath.startsWith('.')) {
        const baseDir = dirname(this.currentFilePath);
        modulePath = resolve(baseDir, modulePath);
      }

      // Dynamically import the module
      const importedModule = await import(modulePath);

      // Handle different import patterns
      if (node.names.includes('*')) {
        // import * from "module" - import entire module
        const moduleName = node.names[0] === '*' && node.names.length === 1
          ? modulePath.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'module'
          : node.names[0];

        // Wrap the module so functions can be called with Flick syntax
        const wrappedModule = this.wrapModuleExports(importedModule);
        env.vars.set(moduleName, { value: wrappedModule, mutable: false });
      } else if (node.isDefaultImport) {
        // Default import: import fs from "fs"
        const name = node.names[0];
        const defaultExport = importedModule.default || importedModule;
        const wrapped = this.wrapModuleExports(defaultExport);
        env.vars.set(name, { value: wrapped, mutable: false });
      } else {
        // Named imports: import {readFile, writeFile} from "fs"
        for (const name of node.names) {
          if (importedModule[name] !== undefined) {
            const wrapped = typeof importedModule[name] === 'function'
              ? this.wrapFunction(importedModule[name])
              : importedModule[name];
            env.vars.set(name, { value: wrapped, mutable: false });
          }
        }
      }

      return null;
    } catch (error) {
      throw new Error(`Failed to import module ${node.from}: ${error instanceof Error ? error.message : error}`);
    }
  }

  // Wrap JS/TS functions to work with Flick's calling convention
  private wrapFunction(fn: Function): Function {
    return async (...args: any[]) => {
      try {
        const result = fn(...args);
        // Handle promises
        if (result && typeof result.then === 'function') {
          return await result;
        }
        return result;
      } catch (error) {
        throw error;
      }
    };
  }

  // Wrap entire module exports
  private wrapModuleExports(moduleExports: any): any {
    if (typeof moduleExports === 'function') {
      return this.wrapFunction(moduleExports);
    }

    if (typeof moduleExports === 'object' && moduleExports !== null) {
      const wrapped: any = {};
      for (const key in moduleExports) {
        if (typeof moduleExports[key] === 'function') {
          wrapped[key] = this.wrapFunction(moduleExports[key]);
        } else {
          wrapped[key] = moduleExports[key];
        }
      }
      return wrapped;
    }

    return moduleExports;
  }

  private async handleUse(node: AST.UseStatementNode, env: Environment): Promise<RuntimeValue> {
    let modulePath: string;

    if (node.path) {
      // Explicit path provided
      const baseDir = dirname(this.currentFilePath);
      modulePath = resolve(baseDir, node.path);
    } else {
      // Infer from name (same directory, name.fk)
      const baseDir = dirname(this.currentFilePath);
      modulePath = join(baseDir, `${node.name}.fk`);
    }

    // Check if already loaded
    if (this.loadedModules.has(modulePath)) {
      const moduleExports = this.loadedModules.get(modulePath);
      env.vars.set(node.name, { value: moduleExports, mutable: false });
      return null;
    }

    // Load and parse the module
    try {
      const { Lexer } = await import('./lexer.js');
      const { Parser } = await import('./parser.js');

      const sourceCode = readFileSync(modulePath, 'utf-8');
      const lexer = new Lexer(sourceCode);
      const tokens = lexer.tokenize();

      // Create a new plugin manager for the module (inherits declared plugins)
      const modulePluginManager = new PluginManager();
      // Copy plugins from current manager
      for (const [name, plugin] of (this.pluginManager as any).plugins) {
        modulePluginManager.registerPlugin(plugin);
      }

      const parser = new Parser(tokens, modulePluginManager);
      const ast = parser.parse();

      // Create a new interpreter for the module (without running completion hooks)
      const moduleInterpreter = new Interpreter(modulePluginManager, modulePath);

      // Execute the module AST but don't run plugin completion hooks
      (moduleInterpreter as any).programAST = ast;
      (moduleInterpreter as any).globalEnv.__interpreter = moduleInterpreter;
      (moduleInterpreter as any).globalEnv.__program = ast;

      for (const statement of ast.body) {
        await moduleInterpreter.evaluateStatement(statement, (moduleInterpreter as any).globalEnv);
      }

      // Export the module's environment/program
      const moduleExports = {
        __routes: ast.body.filter((n: any) => n.type === 'RouteStatement'),
        __env: (moduleInterpreter as any).globalEnv,
        __ast: ast,
      };

      this.loadedModules.set(modulePath, moduleExports);
      env.vars.set(node.name, { value: moduleExports, mutable: false });

      return null;
    } catch (error) {
      throw new Error(`Failed to load module ${modulePath}: ${error instanceof Error ? error.message : error}`);
    }
  }

  private async handleDeclare(node: AST.DeclareStatementNode, env: Environment): Promise<RuntimeValue> {
    const plugin = this.pluginManager.getPlugin(node.plugin);
    if (!plugin) {
      throw new Error(`Unknown plugin: ${node.plugin}`);
    }

    // Extract argument value if present
    let argValue = null;
    if (node.argument) {
      argValue = await this.evaluateExpression(node.argument, env);
    }

    // Register plugin built-ins
    if (plugin.registerBuiltins) {
      plugin.registerBuiltins(env, argValue);
    }

    return null;
  }

  private async handleRoute(node: AST.RouteStatementNode, env: Environment): Promise<RuntimeValue> {
    // Routes are collected by the web plugin during onFileComplete
    // Just return null here
    return null;
  }

  private async handleRespond(node: AST.RespondStatementNode, env: Environment): Promise<RuntimeValue> {
    const plugin = this.pluginManager.getPlugin('web');
    if (plugin?.execute) {
      return await plugin.execute(node, this, env);
    }
    return null;
  }

  private defineGroup(node: AST.GroupDeclarationNode, env: Environment): RuntimeValue {
    const methods = new Map<string, AST.TaskDeclarationNode>();

    for (const method of node.methods) {
      methods.set(method.name, method);
    }

    this.groups.set(node.name, {
      name: node.name,
      fields: node.fields,
      methods,
      implementations: new Map(),
    });

    // Create a constructor function
    const constructor = (...args: any[]) => {
      return this.instantiateGroup(node.name, args);
    };

    env.vars.set(node.name, { value: constructor, mutable: false });

    return null;
  }

  private instantiateGroup(groupName: string, args: any[]): any {
    const groupDef = this.groups.get(groupName);
    if (!groupDef) {
      throw new Error(`Unknown group: ${groupName}`);
    }

    const instance: any = {
      __groupName: groupName,
      __env: { vars: new Map(), parent: this.globalEnv },
    };

    // Initialize fields
    let argIndex = 0;
    for (const field of groupDef.fields) {
      let value: any;

      if (field.initializer) {
        value = this.evaluateExpressionSync(field.initializer, instance.__env);
      } else if (argIndex < args.length) {
        value = args[argIndex++];
      } else {
        value = null;
      }

      instance.__env.vars.set(field.name, { value, mutable: field.mutable });

      // Also add as direct property for easier access
      Object.defineProperty(instance, field.name, {
        get: () => instance.__env.vars.get(field.name)?.value,
        set: (newValue) => {
          const varInfo = instance.__env.vars.get(field.name);
          if (!varInfo?.mutable) {
            throw new Error(`Cannot reassign immutable variable: ${field.name}`);
          }
          instance.__env.vars.set(field.name, { value: newValue, mutable: true });
        },
        enumerable: true,
      });
    }

    // Bind methods
    for (const [methodName, methodNode] of groupDef.methods) {
      instance[methodName] = async (...args: any[]) => {
        return await this.executeTaskWithEnv(methodNode, args, instance.__env);
      };
    }

    // Bind blueprint implementations
    for (const [blueprintName, methods] of groupDef.implementations) {
      for (const [methodName, methodNode] of methods) {
        instance[methodName] = async (...args: any[]) => {
          return await this.executeTaskWithEnv(methodNode, args, instance.__env);
        };
      }
    }

    return instance;
  }

  private defineBlueprint(node: AST.BlueprintDeclarationNode, env: Environment): RuntimeValue {
    const methods = new Map<string, AST.TaskSignatureNode>();

    for (const method of node.methods) {
      methods.set(method.name, method);
    }

    this.blueprints.set(node.name, {
      name: node.name,
      methods,
    });

    return null;
  }

  private implementBlueprint(node: AST.DoImplementationNode, env: Environment): RuntimeValue {
    const groupDef = this.groups.get(node.groupName);
    if (!groupDef) {
      throw new Error(`Unknown group: ${node.groupName}`);
    }

    const methods = new Map<string, AST.TaskDeclarationNode>();
    for (const method of node.methods) {
      methods.set(method.name, method);
    }

    groupDef.implementations.set(node.blueprintName, methods);

    return null;
  }

  private defineTask(node: AST.TaskDeclarationNode, env: Environment): RuntimeValue {
    const task = async (...args: any[]) => {
      return await this.executeTask(node, args, env);
    };

    env.vars.set(node.name, { value: task, mutable: false });

    return null;
  }

  private async executeTask(
    node: AST.TaskDeclarationNode,
    args: any[],
    parentEnv: Environment
  ): Promise<RuntimeValue> {
    const taskEnv: Environment = { vars: new Map(), parent: parentEnv };

    // Bind parameters
    for (let i = 0; i < node.parameters.length; i++) {
      const param = node.parameters[i];
      const value = i < args.length ? args[i] : null;
      taskEnv.vars.set(param.name, { value, mutable: true });
    }

    // Execute body
    try {
      for (const statement of node.body) {
        await this.evaluateStatement(statement, taskEnv);
      }
    } catch (error: any) {
      // Check if this is a return statement
      if (error && error.__return) {
        return error.value;
      }
      throw error;
    }

    return null;
  }

  private async executeTaskWithEnv(
    node: AST.TaskDeclarationNode,
    args: any[],
    instanceEnv: Environment
  ): Promise<RuntimeValue> {
    const taskEnv: Environment = { vars: new Map(), parent: instanceEnv };

    // Bind parameters
    for (let i = 0; i < node.parameters.length; i++) {
      const param = node.parameters[i];
      const value = i < args.length ? args[i] : null;
      taskEnv.vars.set(param.name, { value, mutable: true });
    }

    // Execute body
    try {
      for (const statement of node.body) {
        await this.evaluateStatement(statement, taskEnv);
      }
    } catch (error: any) {
      // Check if this is a return statement
      if (error && error.__return) {
        return error.value;
      }
      throw error;
    }

    return null;
  }

  private async declareVariable(node: AST.VariableDeclarationNode, env: Environment): Promise<RuntimeValue> {
    let value: RuntimeValue = null;

    if (node.initializer) {
      value = await this.evaluateExpression(node.initializer, env);

      // Auto-call group constructors with no args when assigning bare constructor
      // e.g., "free Player p = Player" should be equivalent to "free Player p = Player()"
      if (node.varType &&
          this.groups.has(node.varType) &&
          node.initializer.type === 'Identifier' &&
          (node.initializer as AST.IdentifierNode).name === node.varType &&
          typeof value === 'function') {
        // Call the constructor with no arguments
        value = value();
      }
    }

    env.vars.set(node.name, { value, mutable: node.mutable });

    return null;
  }

  private async assignVariable(node: AST.AssignmentNode, env: Environment): Promise<RuntimeValue> {
    const value = await this.evaluateExpression(node.value, env);

    if (node.target.type === 'Identifier') {
      this.setVariable(node.target.name, value, env);
    } else if (node.target.type === 'MemberExpression') {
      const obj = await this.evaluateExpression(node.target.object, env);
      const prop = node.target.computed
        ? await this.evaluateExpression(node.target.property, env)
        : (node.target.property as AST.IdentifierNode).name;

      obj[prop] = value;
    }

    return value;
  }

  private async executePrint(node: AST.PrintStatementNode, env: Environment): Promise<RuntimeValue> {
    const parts: string[] = [];

    for (const expr of node.expressions) {
      let value = await this.evaluateExpression(expr, env);

      // If the value is a function and the expression is just an identifier, call it with no args
      if (typeof value === 'function' && expr.type === 'Identifier') {
        value = await value();
      }

      parts.push(this.stringify(value));
    }

    const output = parts.join('');
    console.log(output);
    this.output.push(output);

    return null;
  }

  private async executeIf(node: AST.IfStatementNode, env: Environment): Promise<RuntimeValue> {
    for (const branch of node.conditions) {
      if (branch.condition === null) {
        // otherwise branch
        for (const statement of branch.body) {
          const result = await this.evaluateStatement(statement, env);
          // Propagate respond results
          if (result && result.__respond) {
            return result;
          }
        }
        break;
      } else {
        const condition = await this.evaluateExpression(branch.condition, env);
        if (this.isTruthy(condition)) {
          for (const statement of branch.body) {
            const result = await this.evaluateStatement(statement, env);
            // Propagate respond results
            if (result && result.__respond) {
              return result;
            }
          }
          break;
        }
      }
    }

    return null;
  }

  private async executeEachLoop(node: AST.EachLoopNode, env: Environment): Promise<RuntimeValue> {
    const iterable = await this.evaluateExpression(node.iterable, env);

    if (!Array.isArray(iterable)) {
      throw new Error(`each loop requires an array`);
    }

    for (const item of iterable) {
      const loopEnv: Environment = { vars: new Map(), parent: env };
      loopEnv.vars.set(node.variable, { value: item, mutable: false });

      for (const statement of node.body) {
        await this.evaluateStatement(statement, loopEnv);
      }
    }

    return null;
  }

  private async executeMarchLoop(node: AST.MarchLoopNode, env: Environment): Promise<RuntimeValue> {
    const start = await this.evaluateExpression(node.start, env);
    const end = await this.evaluateExpression(node.end, env);

    for (let i = start; i <= end; i++) {
      const loopEnv: Environment = { vars: new Map(), parent: env };
      loopEnv.vars.set(node.variable, { value: i, mutable: false });

      for (const statement of node.body) {
        await this.evaluateStatement(statement, loopEnv);
      }
    }

    return null;
  }

  private async executeSelect(node: AST.SelectStatementNode, env: Environment): Promise<RuntimeValue> {
    const obj = await this.evaluateExpression(node.expression, env);

    for (const caseNode of node.cases) {
      if (obj.hasOwnProperty(caseNode.key)) {
        // Execute conditions if any
        let shouldExecute = true;
        for (const condition of caseNode.conditions) {
          const result = await this.evaluateExpression(condition, env);
          if (!this.isTruthy(result)) {
            shouldExecute = false;
            break;
          }
        }

        if (shouldExecute) {
          for (const statement of caseNode.body) {
            await this.evaluateStatement(statement, env);
          }
        }
      }
    }

    return null;
  }

  private async evaluateBinaryExpression(node: AST.BinaryExpressionNode, env: Environment): Promise<RuntimeValue> {
    const left = await this.evaluateExpression(node.left, env);
    const right = await this.evaluateExpression(node.right, env);

    switch (node.operator) {
      case '+':
        // If both operands are numeric strings or numbers, do numeric addition
        const leftNum = typeof left === 'string' ? parseFloat(left) : left;
        const rightNum = typeof right === 'string' ? parseFloat(right) : right;

        if (typeof leftNum === 'number' && typeof rightNum === 'number' &&
            !isNaN(leftNum) && !isNaN(rightNum)) {
          return leftNum + rightNum;
        }
        // Otherwise, concatenate as strings
        return String(left) + String(right);
      case '-':
        return Number(left) - Number(right);
      case '*':
        return Number(left) * Number(right);
      case '/':
        return Number(left) / Number(right);
      case '==':
        return left === right;
      case '!=':
        return left !== right;
      case '<':
        return Number(left) < Number(right);
      case '>':
        return Number(left) > Number(right);
      case '<=':
        return Number(left) <= Number(right);
      case '>=':
        return Number(left) >= Number(right);
      default:
        throw new Error(`Unknown binary operator: ${node.operator}`);
    }
  }

  private async evaluateUnaryExpression(node: AST.UnaryExpressionNode, env: Environment): Promise<RuntimeValue> {
    const operand = await this.evaluateExpression(node.operand, env);

    switch (node.operator) {
      case '-':
        return -operand;
      default:
        throw new Error(`Unknown unary operator: ${node.operator}`);
    }
  }

  private async evaluateCall(node: AST.CallExpressionNode, env: Environment): Promise<RuntimeValue> {
    const callee = await this.evaluateExpression(node.callee, env);
    const args: any[] = [];

    for (const arg of node.args) {
      args.push(await this.evaluateExpression(arg, env));
    }

    if (typeof callee === 'function') {
      return await callee(...args);
    }

    throw new Error(`Not a function`);
  }

  private async evaluateMemberExpression(node: AST.MemberExpressionNode, env: Environment): Promise<RuntimeValue> {
    const obj = await this.evaluateExpression(node.object, env);
    const prop = node.computed
      ? await this.evaluateExpression(node.property, env)
      : (node.property as AST.IdentifierNode).name;

    return obj[prop];
  }

  private async evaluateAsk(node: AST.AskExpressionNode, env: Environment): Promise<RuntimeValue> {
    const prompt = await this.evaluateExpression(node.prompt, env);

    return new Promise<string>((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question(this.stringify(prompt) + ' ', (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }

  private async evaluateTernaryExpression(node: AST.TernaryExpressionNode, env: Environment): Promise<RuntimeValue> {
    const condition = await this.evaluateExpression(node.condition, env);

    if (this.isTruthy(condition)) {
      return await this.evaluateExpression(node.consequent, env);
    } else if (node.alternate) {
      return await this.evaluateExpression(node.alternate, env);
    }

    return null;
  }

  private lookupVariable(name: string, env: Environment): RuntimeValue {
    let currentEnv: Environment | undefined = env;

    while (currentEnv) {
      if (currentEnv.vars.has(name)) {
        return currentEnv.vars.get(name)!.value;
      }
      currentEnv = currentEnv.parent;
    }

    throw new Error(`Undefined variable: ${name}`);
  }

  private setVariable(name: string, value: RuntimeValue, env: Environment): void {
    let currentEnv: Environment | undefined = env;

    while (currentEnv) {
      if (currentEnv.vars.has(name)) {
        const varInfo = currentEnv.vars.get(name)!;
        if (!varInfo.mutable) {
          throw new Error(`Cannot reassign immutable variable: ${name}`);
        }
        currentEnv.vars.set(name, { value, mutable: true });
        return;
      }
      currentEnv = currentEnv.parent;
    }

    throw new Error(`Undefined variable: ${name}`);
  }

  private isTruthy(value: RuntimeValue): boolean {
    if (value === null || value === undefined || value === false) {
      return false;
    }

    // Empty string is falsy
    if (value === '') {
      return false;
    }

    // Empty array is falsy
    if (Array.isArray(value) && value.length === 0) {
      return false;
    }

    // Empty object is falsy
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      if (Object.keys(value).length === 0) {
        return false;
      }
    }

    return true;
  }

  public stringify(value: RuntimeValue): string {
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number') {
      return value.toString();
    }
    if (typeof value === 'boolean') {
      return value ? 'yes' : 'no';
    }
    if (value === null || value === undefined) {
      return 'null';
    }
    if (Array.isArray(value)) {
      return JSON.stringify(value);
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  // Synchronous version for certain contexts
  private evaluateExpressionSync(node: AST.ASTNode, env: Environment): RuntimeValue {
    switch (node.type) {
      case 'Literal':
        return node.value;

      case 'Identifier':
        return this.lookupVariable(node.name, env);

      case 'BinaryExpression':
        const left = this.evaluateExpressionSync(node.left, env);
        const right = this.evaluateExpressionSync(node.right, env);

        switch (node.operator) {
          case '+': {
            // If both operands are numeric strings or numbers, do numeric addition
            const leftNum = typeof left === 'string' ? parseFloat(left) : left;
            const rightNum = typeof right === 'string' ? parseFloat(right) : right;

            if (typeof leftNum === 'number' && typeof rightNum === 'number' &&
                !isNaN(leftNum) && !isNaN(rightNum)) {
              return leftNum + rightNum;
            }
            // Otherwise, concatenate as strings
            return String(left) + String(right);
          }
          case '-': return Number(left) - Number(right);
          case '*': return Number(left) * Number(right);
          case '/': return Number(left) / Number(right);
          case '==': return left === right;
          case '!=': return left !== right;
          case '<': return Number(left) < Number(right);
          case '>': return Number(left) > Number(right);
          case '<=': return Number(left) <= Number(right);
          case '>=': return Number(left) >= Number(right);
          default:
            throw new Error(`Unknown binary operator: ${node.operator}`);
        }

      case 'ArrayLiteral':
        return node.elements.map(elem => this.evaluateExpressionSync(elem, env));

      case 'ObjectLiteral':
        const obj: any = {};
        for (const prop of node.properties) {
          obj[prop.key] = this.evaluateExpressionSync(prop.value, env);
        }
        return obj;

      case 'CallExpression':
        const callee = this.evaluateExpressionSync(node.callee, env);
        const args = node.args.map(arg => this.evaluateExpressionSync(arg, env));
        if (typeof callee === 'function') {
          return callee(...args);
        }
        throw new Error(`Not a function`);

      default:
        throw new Error(`Cannot evaluate ${(node as any).type} synchronously`);
    }
  }
}

