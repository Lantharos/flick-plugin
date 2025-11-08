import { readFileSync } from 'node:fs';
import { Lexer } from './lexer';
import { Parser } from './parser';
import { PluginManager } from './plugin';

const code = `lock test = JSON.stringify {"message": outputStr}
write "flick_demo_output.txt", test`;

const lexer = new Lexer(code);
const tokens = lexer.tokenize();

console.log('Tokens:');
tokens.forEach((t, i) => {
    console.log(`${i}: ${t.type} = "${t.value}"`);
});

const pluginManager = new PluginManager();
const parser = new Parser(tokens, pluginManager);

try {
    const ast = parser.parse();
    console.log('\nAST:');
    console.log(JSON.stringify(ast, null, 2));
} catch (error) {
    console.error('Parse error:', error);
}

