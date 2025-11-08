// Plugin system for Flick

import * as AST from './ast.js';
import { TokenType } from './lexer.js';

export interface PluginContext {
  declaredPlugins: Map<string, any>; // plugin name -> arguments
  env: any; // runtime environment
}

export interface Plugin {
  name: string;
  keywords?: TokenType[]; // Additional keywords this plugin adds

  // Parse plugin-specific syntax
  parseStatement?(parser: any, context: PluginContext): AST.ASTNode | null;

  // Register built-in functions and values
  registerBuiltins?(env: any, args: any): void;

  // Execute plugin-specific AST nodes
  execute?(node: AST.ASTNode, interpreter: any, env: any): Promise<any>;

  // Called when plugin is declared
  onDeclare?(args: any): void;

  // Called at end of file (e.g., to start web server)
  onFileComplete?(context: PluginContext): Promise<void>;
}

export class PluginManager {
  public plugins: Map<string, Plugin> = new Map();
  private declaredPlugins: Map<string, any> = new Map();

  registerPlugin(plugin: Plugin): void {
    this.plugins.set(plugin.name, plugin);
  }

  getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  declarePlugin(name: string, args: any = null): void {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Unknown plugin: ${name}`);
    }

    this.declaredPlugins.set(name, args);

    if (plugin.onDeclare) {
      plugin.onDeclare(args);
    }
  }

  isDeclared(name: string): boolean {
    return this.declaredPlugins.has(name);
  }

  getPluginArgs(name: string): any {
    return this.declaredPlugins.get(name);
  }

  getDeclaredPlugins(): Map<string, any> {
    return this.declaredPlugins;
  }

  async runFileCompleteHooks(context: PluginContext): Promise<void> {
    for (const [name, args] of this.declaredPlugins) {
      const plugin = this.plugins.get(name);
      if (plugin?.onFileComplete) {
        await plugin.onFileComplete(context);
      }
    }
  }

  reset(): void {
    this.declaredPlugins.clear();
  }
}

