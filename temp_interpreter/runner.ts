// Runner for Flick interpreter

import { readFileSync } from 'node:fs';
import { Lexer } from './lexer.js';
import { Parser } from './parser.js';
import { Interpreter } from './interpreter.js';
import { PluginManager } from './plugin.js';
import { WebPlugin, FilesPlugin, TimePlugin, RandomPlugin } from './plugins/builtins.js';

export async function runFlick(filePath: string): Promise<void> {
  try {
    // Read the source code
    const sourceCode = readFileSync(filePath, 'utf-8');

    // Initialize plugin manager
    const pluginManager = new PluginManager();

    // Register built-in plugins
    pluginManager.registerPlugin(WebPlugin);
    pluginManager.registerPlugin(FilesPlugin);
    pluginManager.registerPlugin(TimePlugin);
    pluginManager.registerPlugin(RandomPlugin);

    // Tokenize
    const lexer = new Lexer(sourceCode);
    const tokens = lexer.tokenize();

    // Parse
    const parser = new Parser(tokens, pluginManager);
    const ast = parser.parse();

    // Interpret
    const interpreter = new Interpreter(pluginManager, filePath);
    await interpreter.interpret(ast);

  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

