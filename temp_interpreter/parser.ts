// Parser for Flick language

import { Token, TokenType } from './lexer.js';
import * as AST from './ast.js';
import { PluginManager } from './plugin.js';

export class Parser {
  private tokens: Token[];
  private position: number = 0;
  private pluginManager: PluginManager;

  constructor(tokens: Token[], pluginManager: PluginManager) {
    // Filter out newline tokens for easier parsing
    this.tokens = tokens.filter(t => t.type !== TokenType.NEWLINE);
    this.pluginManager = pluginManager;
  }

  private peek(offset: number = 0): Token {
    const pos = this.position + offset;
    return pos < this.tokens.length ? this.tokens[pos] : this.tokens[this.tokens.length - 1];
  }

  private advance(): Token {
    return this.tokens[this.position++];
  }

  private expect(type: TokenType): Token {
    const token = this.peek();
    if (token.type !== type) {
      throw new Error(`Expected ${type} but got ${token.type} at line ${token.line}, column ${token.column}`);
    }
    return this.advance();
  }

  private match(...types: TokenType[]): boolean {
    return types.includes(this.peek().type);
  }

  public parse(): AST.ProgramNode {
    const body: AST.ASTNode[] = [];

    // Parse declare statements first (must be at top of file)
    while (this.match(TokenType.DECLARE)) {
      body.push(this.parseDeclareStatement());
    }

    // Parse import statements (for JS/TS modules)
    while (this.match(TokenType.IMPORT)) {
      body.push(this.parseImportStatement());
    }

    // Parse use statements (imports)
    while (this.match(TokenType.USE)) {
      body.push(this.parseUseStatement());
    }

    while (!this.match(TokenType.EOF)) {
      body.push(this.parseTopLevelStatement());
    }

    return { type: 'Program', body };
  }

  private parseTopLevelStatement(): AST.ASTNode {
    // Check for plugin-specific statements
    if (this.match(TokenType.ROUTE)) {
      if (!this.pluginManager.isDeclared('web')) {
        throw new Error(`Feature 'route' requires declare web at top of file`);
      }
      return this.parseRouteStatement();
    }

    if (this.match(TokenType.GROUP)) {
      return this.parseGroupDeclaration();
    }
    if (this.match(TokenType.BLUEPRINT)) {
      return this.parseBlueprintDeclaration();
    }
    if (this.match(TokenType.DO)) {
      return this.parseDoImplementation();
    }
    if (this.match(TokenType.TASK)) {
      return this.parseTaskDeclaration();
    }
    if (this.match(TokenType.FREE, TokenType.LOCK)) {
      return this.parseVariableDeclaration();
    }
    return this.parseStatement();
  }

  private parseDeclareStatement(): AST.DeclareStatementNode {
    this.expect(TokenType.DECLARE);
    const plugin = this.expect(TokenType.IDENTIFIER).value;

    let argument: AST.ASTNode | undefined;
    if (this.match(TokenType.AT)) {
      this.advance();
      // Parse the argument (could be number, string, or identifier)
      if (this.match(TokenType.NUMBER)) {
        const value = parseFloat(this.advance().value);
        argument = { type: 'Literal', value, raw: String(value) };
      } else if (this.match(TokenType.STRING)) {
        const value = this.advance().value;
        argument = { type: 'Literal', value, raw: value };
      } else if (this.match(TokenType.IDENTIFIER)) {
        // Treat identifier as a string literal (e.g., @module)
        const name = this.advance().value;
        argument = { type: 'Literal', value: name, raw: name };
      }
    }

    // Register with plugin manager
    this.pluginManager.declarePlugin(plugin, argument);

    return { type: 'DeclareStatement', plugin, argument };
  }

  private parseUseStatement(): AST.UseStatementNode {
    this.expect(TokenType.USE);
    const name = this.expect(TokenType.IDENTIFIER).value;

    let path: string | undefined;
    if (this.match(TokenType.STRING)) {
      path = this.advance().value;
    }

    return { type: 'UseStatement', name, path };
  }

  private parseImportStatement(): AST.ImportStatementNode {
    this.expect(TokenType.IMPORT);

    const names: string[] = [];
    let alias: string | undefined;
    let isDefaultImport = false;

    // Handle different import patterns:
    // import fs from "fs"                    - default import
    // import {readFile, writeFile} from "fs" - named imports
    // import * from "lodash"                 - namespace import

    if (this.match(TokenType.MULTIPLY)) {
      // import * from "module"
      this.advance();
      names.push('*');
    } else if (this.match(TokenType.LBRACE)) {
      // import {a, b, c} from "module"
      this.advance();
      while (!this.match(TokenType.RBRACE)) {
        names.push(this.expect(TokenType.IDENTIFIER).value);
        if (this.match(TokenType.COMMA)) {
          this.advance();
        }
      }
      this.expect(TokenType.RBRACE);
      isDefaultImport = false;
    } else {
      // import defaultExport from "module"
      names.push(this.expect(TokenType.IDENTIFIER).value);
      isDefaultImport = true;
    }

    this.expect(TokenType.FROM);
    const from = this.expect(TokenType.STRING).value;

    return { type: 'ImportStatement', names, from, alias, isDefaultImport };
  }

  private parseRouteStatement(): AST.RouteStatementNode {
    this.expect(TokenType.ROUTE);

    // Check for HTTP method (GET, POST, etc.)
    let method: string | undefined;
    if (this.match(TokenType.GET, TokenType.POST, TokenType.PUT, TokenType.DELETE, TokenType.PATCH)) {
      method = this.advance().value;
    }

    const path = this.expect(TokenType.STRING).value;

    // Check for forwarding syntax: route "/auth" -> AuthRoutes
    if (this.match(TokenType.MINUS) && this.peek(1).type === TokenType.GREATER_THAN) {
      this.advance(); // consume -
      this.advance(); // consume >
      const forward = this.expect(TokenType.IDENTIFIER).value;
      return { type: 'RouteStatement', method, path, forward };
    }

    this.expect(TokenType.ARROW);

    const body: AST.ASTNode[] = [];
    while (!this.match(TokenType.END)) {
      body.push(this.parseStatement());
    }

    this.expect(TokenType.END);

    return { type: 'RouteStatement', method, path, body };
  }

  private parseGroupDeclaration(): AST.GroupDeclarationNode {
    this.expect(TokenType.GROUP);
    const name = this.expect(TokenType.IDENTIFIER).value;
    this.expect(TokenType.LBRACE);

    const fields: AST.VariableDeclarationNode[] = [];
    const methods: AST.TaskDeclarationNode[] = [];

    while (!this.match(TokenType.RBRACE)) {
      if (this.match(TokenType.TASK)) {
        methods.push(this.parseTaskDeclaration());
      } else if (this.match(TokenType.FREE, TokenType.LOCK)) {
        fields.push(this.parseVariableDeclaration());
      } else {
        throw new Error(`Unexpected token in group: ${this.peek().value}`);
      }
    }

    this.expect(TokenType.RBRACE);

    return { type: 'GroupDeclaration', name, fields, methods };
  }

  private parseBlueprintDeclaration(): AST.BlueprintDeclarationNode {
    this.expect(TokenType.BLUEPRINT);
    const name = this.expect(TokenType.IDENTIFIER).value;
    this.expect(TokenType.LBRACE);

    const methods: AST.TaskSignatureNode[] = [];

    while (!this.match(TokenType.RBRACE)) {
      this.expect(TokenType.TASK);
      const methodName = this.expect(TokenType.IDENTIFIER).value;
      const parameters: AST.ParameterNode[] = [];

      if (this.match(TokenType.WITH)) {
        this.advance();
        parameters.push(...this.parseParameters());
      }

      methods.push({ name: methodName, parameters });
    }

    this.expect(TokenType.RBRACE);

    return { type: 'BlueprintDeclaration', name, methods };
  }

  private parseDoImplementation(): AST.DoImplementationNode {
    this.expect(TokenType.DO);
    const blueprintName = this.expect(TokenType.IDENTIFIER).value;
    this.expect(TokenType.FOR);
    const groupName = this.expect(TokenType.IDENTIFIER).value;
    this.expect(TokenType.ARROW);

    const methods: AST.TaskDeclarationNode[] = [];

    while (!this.match(TokenType.END)) {
      methods.push(this.parseTaskDeclaration());
    }

    this.expect(TokenType.END);

    return { type: 'DoImplementation', blueprintName, groupName, methods };
  }

  private parseTaskDeclaration(): AST.TaskDeclarationNode {
    this.expect(TokenType.TASK);
    const name = this.expect(TokenType.IDENTIFIER).value;

    const parameters: AST.ParameterNode[] = [];
    if (this.match(TokenType.WITH)) {
      this.advance();
      parameters.push(...this.parseParameters());
    }

    this.expect(TokenType.ARROW);

    const body: AST.ASTNode[] = [];
    while (!this.match(TokenType.END)) {
      body.push(this.parseStatement());
    }

    this.expect(TokenType.END);

    return { type: 'TaskDeclaration', name, parameters, body };
  }

  private parseParameters(): AST.ParameterNode[] {
    const parameters: AST.ParameterNode[] = [];

    do {
      if (this.match(TokenType.COMMA)) {
        this.advance();
      }

      // Accept num, literal, or identifier as type
      let paramType: string;
      if (this.match(TokenType.NUM, TokenType.LITERAL, TokenType.IDENTIFIER)) {
        paramType = this.advance().value;
      } else {
        throw new Error(`Expected type name at line ${this.peek().line}`);
      }

      this.expect(TokenType.LPAREN);
      const name = this.expect(TokenType.IDENTIFIER).value;
      this.expect(TokenType.RPAREN);

      parameters.push({ name, paramType });
    } while (this.match(TokenType.COMMA));

    return parameters;
  }

  private parseVariableDeclaration(): AST.VariableDeclarationNode {
    const mutable = this.match(TokenType.FREE);
    this.advance(); // consume FREE or LOCK

    let varType: string | undefined;
    let name: string;

    // Check if there's a type annotation (could be num, literal, or identifier)
    const firstToken = this.peek();
    const secondToken = this.peek(1);

    if (
      (this.match(TokenType.NUM, TokenType.LITERAL, TokenType.IDENTIFIER)) &&
      (secondToken.type === TokenType.IDENTIFIER)
    ) {
      varType = this.advance().value;
      name = this.advance().value;
    } else {
      name = this.expect(TokenType.IDENTIFIER).value;
    }

    let initializer: AST.ASTNode | undefined;
    if (this.match(TokenType.ASSIGN)) {
      this.advance();
      initializer = this.parseExpression();
    } else if (this.peek().type !== TokenType.RBRACE && this.peek().type !== TokenType.EOF) {
      // Allow '=' for initialization
      if (this.peek().value === '=') {
        this.advance();
        initializer = this.parseExpression();
      }
    }

    return { type: 'VariableDeclaration', name, mutable, varType, initializer };
  }

  private parseStatement(): AST.ASTNode {
    if (this.match(TokenType.RESPOND)) {
      if (!this.pluginManager.isDeclared('web')) {
        throw new Error(`Feature 'respond' requires declare web at top of file`);
      }
      return this.parseRespondStatement();
    }

    if (this.match(TokenType.GIVE)) {
      return this.parseReturnStatement();
    }

    if (this.match(TokenType.PRINT)) {
      return this.parsePrintStatement();
    }

    if (this.match(TokenType.FREE, TokenType.LOCK)) {
      return this.parseVariableDeclaration();
    }

    if (this.match(TokenType.ASSUME)) {
      return this.parseIfStatement();
    }

    if (this.match(TokenType.EACH)) {
      return this.parseEachLoop();
    }
    if (this.match(TokenType.MARCH)) {
      return this.parseMarchLoop();
    }
    if (this.match(TokenType.SELECT)) {
      return this.parseSelectStatement();
    }

    // Check for assignment or expression statement
    const expr = this.parseExpression();

    // Check if this is an assignment
    if (this.match(TokenType.ASSIGN)) {
      this.advance();
      const value = this.parseExpression();
      return { type: 'Assignment', target: expr, value };
    }

    return { type: 'ExpressionStatement', expression: expr };
  }

  private parseRespondStatement(): AST.RespondStatementNode {
    this.expect(TokenType.RESPOND);

    let content: AST.ASTNode;
    let options: { json?: AST.ASTNode; status?: AST.ASTNode } = {};

    // Check if we have json= or just a regular expression
    if (this.match(TokenType.IDENTIFIER) && this.peek().value === 'json' && this.peek(1).type === TokenType.ASSIGN) {
      this.advance(); // consume 'json'
      this.advance(); // consume '='
      options.json = this.parseExpression();
      content = { type: 'Literal', value: '', raw: '' }; // dummy content
    } else {
      content = this.parseExpression();
    }

    // Check for status=
    if (this.match(TokenType.COMMA)) {
      this.advance();
      if (this.match(TokenType.IDENTIFIER) && this.peek().value === 'status' && this.peek(1).type === TokenType.ASSIGN) {
        this.advance(); // consume 'status'
        this.advance(); // consume '='
        options.status = this.parseExpression();
      }
    }

    return { type: 'RespondStatement', content, options };
  }

  private parsePrintStatement(): AST.PrintStatementNode {
    this.expect(TokenType.PRINT);

    const expressions: AST.ASTNode[] = [];
    expressions.push(this.parseExpression());

    while (this.match(TokenType.AND)) {
      this.advance();
      expressions.push(this.parseExpression());
    }

    return { type: 'PrintStatement', expressions };
  }

  private parseIfStatement(): AST.IfStatementNode {
    const conditions: Array<{ condition: AST.ASTNode | null; body: AST.ASTNode[] }> = [];

    // assume
    this.expect(TokenType.ASSUME);
    const assumeCondition = this.parseExpression();
    this.expect(TokenType.ARROW);

    const assumeBody: AST.ASTNode[] = [];
    while (!this.match(TokenType.MAYBE, TokenType.OTHERWISE, TokenType.END)) {
      assumeBody.push(this.parseStatement());
    }
    conditions.push({ condition: assumeCondition, body: assumeBody });

    // maybe (elif)
    while (this.match(TokenType.MAYBE)) {
      this.advance();
      const maybeCondition = this.parseExpression();
      this.expect(TokenType.ARROW);

      const maybeBody: AST.ASTNode[] = [];
      while (!this.match(TokenType.MAYBE, TokenType.OTHERWISE, TokenType.END)) {
        maybeBody.push(this.parseStatement());
      }
      conditions.push({ condition: maybeCondition, body: maybeBody });
    }

    // otherwise (else)
    if (this.match(TokenType.OTHERWISE)) {
      this.advance();
      this.expect(TokenType.ARROW);

      const otherwiseBody: AST.ASTNode[] = [];
      while (!this.match(TokenType.END)) {
        otherwiseBody.push(this.parseStatement());
      }
      conditions.push({ condition: null, body: otherwiseBody });
    }

    this.expect(TokenType.END);

    return { type: 'IfStatement', conditions };
  }

  private parseEachLoop(): AST.EachLoopNode {
    this.expect(TokenType.EACH);
    const variable = this.expect(TokenType.IDENTIFIER).value;
    this.expect(TokenType.IN);
    const iterable = this.parseExpression();
    this.expect(TokenType.ARROW);

    const body: AST.ASTNode[] = [];
    while (!this.match(TokenType.END)) {
      body.push(this.parseStatement());
    }

    this.expect(TokenType.END);

    return { type: 'EachLoop', variable, iterable, body };
  }

  private parseMarchLoop(): AST.MarchLoopNode {
    this.expect(TokenType.MARCH);
    const variable = this.expect(TokenType.IDENTIFIER).value;
    this.expect(TokenType.FROM);
    const start = this.parseExpression();
    this.expect(TokenType.TO);
    const end = this.parseExpression();
    this.expect(TokenType.ARROW);

    const body: AST.ASTNode[] = [];
    while (!this.match(TokenType.END)) {
      body.push(this.parseStatement());
    }

    this.expect(TokenType.END);

    return { type: 'MarchLoop', variable, start, end, body };
  }

  private parseSelectStatement(): AST.SelectStatementNode {
    this.expect(TokenType.SELECT);
    const expression = this.parseExpression();
    this.expect(TokenType.ARROW);

    const cases: Array<{ key: string; conditions: AST.ASTNode[]; body: AST.ASTNode[] }> = [];

    while (this.match(TokenType.WHEN)) {
      this.advance();
      const key = this.expect(TokenType.STRING).value;
      this.expect(TokenType.ARROW);

      const conditions: AST.ASTNode[] = [];
      const body: AST.ASTNode[] = [];

      // Check if there's a suppose statement
      if (this.match(TokenType.SUPPOSE)) {
        this.advance();
        const condition = this.parseExpression();
        this.expect(TokenType.ARROW);
        conditions.push(condition);
      }

      // Parse body until next when or end
      while (!this.match(TokenType.WHEN, TokenType.END)) {
        body.push(this.parseStatement());
      }

      cases.push({ key, conditions, body });
    }

    this.expect(TokenType.END);

    return { type: 'SelectStatement', expression, cases };
  }

  private parseReturnStatement(): AST.ReturnStatementNode {
    this.expect(TokenType.GIVE);

    // Check if there's a return value
    if (this.match(TokenType.END, TokenType.MAYBE, TokenType.OTHERWISE, TokenType.RBRACE, TokenType.EOF)) {
      return { type: 'ReturnStatement', value: undefined };
    }

    const value = this.parseExpression();
    return { type: 'ReturnStatement', value };
  }

  private parseExpression(): AST.ASTNode {
    return this.parseAssignmentExpression();
  }

  private parseAssignmentExpression(): AST.ASTNode {
    // Check for inline assume (ternary expression)
    if (this.match(TokenType.ASSUME)) {
      return this.parseTernaryExpression();
    }

    return this.parseLogicalExpression();
  }

  private parseTernaryExpression(): AST.TernaryExpressionNode {
    this.expect(TokenType.ASSUME);
    const condition = this.parseLogicalExpression();
    this.expect(TokenType.ARROW);
    const consequent = this.parseLogicalExpression();

    let alternate: AST.ASTNode | undefined;
    if (this.match(TokenType.COMMA)) {
      this.advance();
      if (this.match(TokenType.OTHERWISE)) {
        this.advance();
        this.expect(TokenType.ARROW);
        // Allow nested ternaries by calling parseAssignmentExpression
        alternate = this.parseAssignmentExpression();
      }
    }

    return { type: 'TernaryExpression', condition, consequent, alternate };
  }

  private parseLogicalExpression(): AST.ASTNode {
    let left = this.parseComparisonExpression();

    while (this.match(TokenType.AND) && this.peek(-1).type !== TokenType.PRINT) {
      // Skip AND if it's part of print statement
      break;
    }

    return left;
  }

  private parseComparisonExpression(): AST.ASTNode {
    let left = this.parseAdditiveExpression();

    while (this.match(
      TokenType.EQUALS,
      TokenType.NOT_EQUALS,
      TokenType.LESS_THAN,
      TokenType.GREATER_THAN,
      TokenType.LESS_EQUAL,
      TokenType.GREATER_EQUAL
    )) {
      const operator = this.advance().value;
      const right = this.parseAdditiveExpression();
      left = { type: 'BinaryExpression', operator, left, right };
    }

    return left;
  }

  private parseAdditiveExpression(): AST.ASTNode {
    let left = this.parseMultiplicativeExpression();

    while (this.match(TokenType.PLUS, TokenType.MINUS)) {
      const operator = this.advance().value;
      const right = this.parseMultiplicativeExpression();
      left = { type: 'BinaryExpression', operator, left, right };
    }

    return left;
  }

  private parseMultiplicativeExpression(): AST.ASTNode {
    let left = this.parseUnaryExpression();

    while (this.match(TokenType.MULTIPLY, TokenType.DIVIDE)) {
      const operator = this.advance().value;
      const right = this.parseUnaryExpression();
      left = { type: 'BinaryExpression', operator, left, right };
    }

    return left;
  }

  private parseUnaryExpression(): AST.ASTNode {
    if (this.match(TokenType.MINUS)) {
      const operator = this.advance().value;
      const operand = this.parseUnaryExpression();
      return { type: 'UnaryExpression', operator, operand };
    }

    return this.parsePostfixExpression();
  }

  private parsePostfixExpression(): AST.ASTNode {
    let expr = this.parsePrimaryExpression();

    while (true) {
      // Check for member access: . or / followed by identifier
      if (this.match(TokenType.DOT) ||
          (this.match(TokenType.DIVIDE) && this.peek(1).type === TokenType.IDENTIFIER)) {
        this.advance();
        const property = this.expect(TokenType.IDENTIFIER).value;
        expr = {
          type: 'MemberExpression',
          object: expr,
          property: { type: 'Identifier', name: property },
          computed: false,
        };
      } else if (this.match(TokenType.LBRACKET)) {
        this.advance();
        const property = this.parseExpression();
        this.expect(TokenType.RBRACKET);
        expr = {
          type: 'MemberExpression',
          object: expr,
          property,
          computed: true,
        };
      } else if (
        this.match(TokenType.LPAREN) ||
        (this.match(TokenType.STRING, TokenType.NUMBER, TokenType.IDENTIFIER, TokenType.LBRACE, TokenType.LBRACKET) &&
          (expr.type === 'Identifier' || expr.type === 'MemberExpression'))
      ) {
        // Function call
        const args: AST.ASTNode[] = [];

        if (this.match(TokenType.LPAREN)) {
          this.advance();
          while (!this.match(TokenType.RPAREN)) {
            args.push(this.parseExpression());
            if (this.match(TokenType.COMMA)) {
              this.advance();
            }
          }
          this.expect(TokenType.RPAREN);
        } else {
          // Space-separated arguments (without parentheses)
          // Keep parsing while we see valid argument tokens
          // Stop at statement keywords or structural tokens
          while (this.match(TokenType.STRING, TokenType.NUMBER, TokenType.IDENTIFIER, TokenType.LBRACE, TokenType.LBRACKET)) {
            // Before consuming the token, check if it's a statement keyword
            if (this.match(TokenType.FREE, TokenType.LOCK, TokenType.PRINT, TokenType.ASSUME,
                          TokenType.EACH, TokenType.MARCH, TokenType.SELECT, TokenType.ROUTE,
                          TokenType.RESPOND, TokenType.TASK, TokenType.GROUP, TokenType.BLUEPRINT,
                          TokenType.DO, TokenType.DECLARE, TokenType.USE)) {
              break;
            }

            // Check for structural/ending tokens BEFORE consuming
            if (this.match(TokenType.ARROW, TokenType.ASSIGN, TokenType.EOF, TokenType.END,
                          TokenType.MAYBE, TokenType.OTHERWISE, TokenType.RBRACE)) {
              break;
            }

            // BEFORE parsing as an argument, check if this looks like a new statement
            // An identifier followed by / or . is likely starting a new member expression, not an argument
            if (this.match(TokenType.IDENTIFIER)) {
              const followingToken = this.peek(1);
              if (followingToken.type === TokenType.DIVIDE || followingToken.type === TokenType.DOT) {
                // This identifier starts a member expression, not an argument
                break;
              }
            }

            args.push(this.parsePrimaryExpression());

            // After parsing an arg, check if we should continue
            if (this.match(TokenType.COMMA)) {
              this.advance();
              continue;
            }

            // Before continuing, check if the current token (which would be the next arg)
            // is followed by a stopping point (like = in variable declarations)
            // or if it looks like a function call (identifier followed by string/number/identifier/object/array)
            if (this.match(TokenType.IDENTIFIER)) {
              const followingToken = this.peek(1);
              if (followingToken.type === TokenType.ASSIGN ||
                  followingToken.type === TokenType.ARROW ||
                  followingToken.type === TokenType.COLON) {
                break;
              }
              // If identifier is followed by argument-like tokens, it's likely a function call
              // e.g., "write "file.txt", data" should not be parsed as args to previous call
              if (followingToken.type === TokenType.STRING ||
                  followingToken.type === TokenType.NUMBER ||
                  followingToken.type === TokenType.LBRACE ||
                  followingToken.type === TokenType.LBRACKET) {
                break;
              }
            }

            // Stop if next token is not an argument-like token
            if (!this.match(TokenType.STRING, TokenType.NUMBER, TokenType.IDENTIFIER, TokenType.LBRACE, TokenType.LBRACKET)) {
              break;
            }
          }
        }

        expr = { type: 'CallExpression', callee: expr, args };
      } else {
        break;
      }
    }

    return expr;
  }

  private parsePrimaryExpression(): AST.ASTNode {
    // String
    if (this.match(TokenType.STRING)) {
      const value = this.advance().value;
      return { type: 'Literal', value, raw: value };
    }

    // Number
    if (this.match(TokenType.NUMBER)) {
      const raw = this.advance().value;
      const value = parseFloat(raw);
      return { type: 'Literal', value, raw };
    }

    // Boolean
    if (this.match(TokenType.YES)) {
      this.advance();
      return { type: 'Literal', value: true, raw: 'yes' };
    }

    if (this.match(TokenType.NO)) {
      this.advance();
      return { type: 'Literal', value: false, raw: 'no' };
    }

    // Ask expression
    if (this.match(TokenType.ASK)) {
      this.advance();

      // Check if there's an argument for the prompt, or if we should use empty string
      let prompt: AST.ASTNode;

      // If next token is a statement keyword or assignment or EOF, use empty prompt
      if (this.match(TokenType.FREE, TokenType.LOCK, TokenType.PRINT, TokenType.ASSUME,
                    TokenType.EACH, TokenType.MARCH, TokenType.SELECT, TokenType.ROUTE,
                    TokenType.RESPOND, TokenType.TASK, TokenType.GROUP, TokenType.BLUEPRINT,
                    TokenType.DO, TokenType.DECLARE, TokenType.USE, TokenType.EOF,
                    TokenType.END, TokenType.MAYBE, TokenType.OTHERWISE, TokenType.RBRACE,
                    TokenType.PLUS, TokenType.MINUS, TokenType.MULTIPLY, TokenType.DIVIDE,
                    TokenType.EQUALS, TokenType.NOT_EQUALS, TokenType.LESS_THAN, TokenType.GREATER_THAN,
                    TokenType.LESS_EQUAL, TokenType.GREATER_EQUAL, TokenType.AND,
                    TokenType.RPAREN, TokenType.RBRACKET, TokenType.COMMA, TokenType.ASSIGN)) {
        prompt = { type: 'Literal', value: '', raw: '' };
      } else if (this.match(TokenType.IDENTIFIER) && this.peek(1).type === TokenType.ASSIGN) {
        // Identifier followed by = means it's a new variable declaration, not an argument
        prompt = { type: 'Literal', value: '', raw: '' };
      } else {
        prompt = this.parseExpression();
      }

      return { type: 'AskExpression', prompt };
    }

    // Array literal
    if (this.match(TokenType.LBRACKET)) {
      this.advance();
      const elements: AST.ASTNode[] = [];

      while (!this.match(TokenType.RBRACKET)) {
        elements.push(this.parseExpression());
        if (this.match(TokenType.COMMA)) {
          this.advance();
        }
      }

      this.expect(TokenType.RBRACKET);
      return { type: 'ArrayLiteral', elements };
    }

    // Object literal
    if (this.match(TokenType.LBRACE)) {
      this.advance();
      const properties: Array<{ key: string; value: AST.ASTNode }> = [];

      while (!this.match(TokenType.RBRACE)) {
        const key = this.expect(TokenType.STRING).value;
        this.expect(TokenType.COLON);
        const value = this.parseExpression();
        properties.push({ key, value });

        if (this.match(TokenType.COMMA)) {
          this.advance();
        }
      }

      this.expect(TokenType.RBRACE);
      return { type: 'ObjectLiteral', properties };
    }

    // Parenthesized expression
    if (this.match(TokenType.LPAREN)) {
      this.advance();
      const expr = this.parseExpression();
      this.expect(TokenType.RPAREN);
      return expr;
    }

    // Identifier (including type names like 'Player')
    if (this.match(TokenType.IDENTIFIER)) {
      const name = this.advance().value;
      return { type: 'Identifier', name };
    }

    throw new Error(`Unexpected token: ${this.peek().value} at line ${this.peek().line}`);
  }
}

