"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlickDiagnostics = void 0;
const vscode = __importStar(require("vscode"));
// Simple token types for basic lexical analysis
var TokenType;
(function (TokenType) {
    TokenType["LBRACE"] = "LBRACE";
    TokenType["RBRACE"] = "RBRACE";
    TokenType["LBRACKET"] = "LBRACKET";
    TokenType["RBRACKET"] = "RBRACKET";
    TokenType["LPAREN"] = "LPAREN";
    TokenType["RPAREN"] = "RPAREN";
})(TokenType || (TokenType = {}));
// Simple lexer for basic validation
class SimpleLexer {
    input;
    position = 0;
    line = 1;
    column = 1;
    constructor(input) {
        this.input = input;
    }
    peek() {
        return this.position < this.input.length ? this.input[this.position] : '';
    }
    advance() {
        const char = this.peek();
        this.position++;
        if (char === '\n') {
            this.line++;
            this.column = 1;
        }
        else {
            this.column++;
        }
        return char;
    }
    tokenize() {
        const tokens = [];
        while (this.position < this.input.length) {
            const char = this.peek();
            const line = this.line;
            const column = this.column;
            // Skip whitespace
            if (/\s/.test(char)) {
                this.advance();
                continue;
            }
            // Skip comments
            if (char === '#') {
                while (this.peek() && this.peek() !== '\n') {
                    this.advance();
                }
                continue;
            }
            // Skip strings
            if (char === '"' || char === "'") {
                const quote = char;
                this.advance();
                while (this.peek() && this.peek() !== quote) {
                    if (this.peek() === '\\') {
                        this.advance();
                    }
                    this.advance();
                }
                if (this.peek() === quote) {
                    this.advance();
                }
                continue;
            }
            // Track brackets
            switch (char) {
                case '{':
                    tokens.push({ type: TokenType.LBRACE, line, column });
                    this.advance();
                    break;
                case '}':
                    tokens.push({ type: TokenType.RBRACE, line, column });
                    this.advance();
                    break;
                case '[':
                    tokens.push({ type: TokenType.LBRACKET, line, column });
                    this.advance();
                    break;
                case ']':
                    tokens.push({ type: TokenType.RBRACKET, line, column });
                    this.advance();
                    break;
                case '(':
                    tokens.push({ type: TokenType.LPAREN, line, column });
                    this.advance();
                    break;
                case ')':
                    tokens.push({ type: TokenType.RPAREN, line, column });
                    this.advance();
                    break;
                default:
                    this.advance();
            }
        }
        return tokens;
    }
}
class FlickDiagnostics {
    diagnosticCollection;
    enableDiagnostics = true;
    languageServer;
    constructor(languageServer) {
        this.languageServer = languageServer;
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('flick');
        // Load configuration
        const config = vscode.workspace.getConfiguration('flick');
        this.enableDiagnostics = config.get('enableDiagnostics', true);
        // Watch for configuration changes
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('flick.enableDiagnostics')) {
                const config = vscode.workspace.getConfiguration('flick');
                this.enableDiagnostics = config.get('enableDiagnostics', true);
                // Clear diagnostics if disabled
                if (!this.enableDiagnostics) {
                    this.diagnosticCollection.clear();
                }
            }
        });
    }
    updateDiagnostics(document) {
        if (!this.enableDiagnostics || document.languageId !== 'flick') {
            return;
        }
        const diagnostics = [];
        const text = document.getText();
        try {
            // Run simple lexer to check for syntax errors
            const lexer = new SimpleLexer(text);
            const tokens = lexer.tokenize();
            // Basic validation
            let openBraces = 0;
            let openBrackets = 0;
            let openParens = 0;
            for (const token of tokens) {
                // Check for unbalanced delimiters
                if (token.type === TokenType.LBRACE) {
                    openBraces++;
                }
                else if (token.type === TokenType.RBRACE) {
                    openBraces--;
                    if (openBraces < 0) {
                        const range = new vscode.Range(token.line - 1, token.column - 1, token.line - 1, token.column);
                        diagnostics.push(new vscode.Diagnostic(range, 'Unexpected closing brace }', vscode.DiagnosticSeverity.Error));
                    }
                }
                if (token.type === TokenType.LBRACKET) {
                    openBrackets++;
                }
                else if (token.type === TokenType.RBRACKET) {
                    openBrackets--;
                    if (openBrackets < 0) {
                        const range = new vscode.Range(token.line - 1, token.column - 1, token.line - 1, token.column);
                        diagnostics.push(new vscode.Diagnostic(range, 'Unexpected closing bracket ]', vscode.DiagnosticSeverity.Error));
                    }
                }
                if (token.type === TokenType.LPAREN) {
                    openParens++;
                }
                else if (token.type === TokenType.RPAREN) {
                    openParens--;
                    if (openParens < 0) {
                        const range = new vscode.Range(token.line - 1, token.column - 1, token.line - 1, token.column);
                        diagnostics.push(new vscode.Diagnostic(range, 'Unexpected closing parenthesis )', vscode.DiagnosticSeverity.Error));
                    }
                }
            }
            // Check for unclosed delimiters at end of file
            if (openBraces > 0) {
                const lastLine = document.lineCount - 1;
                const lastLineLength = document.lineAt(lastLine).text.length;
                const range = new vscode.Range(lastLine, lastLineLength, lastLine, lastLineLength);
                diagnostics.push(new vscode.Diagnostic(range, `Missing ${openBraces} closing brace(s) }`, vscode.DiagnosticSeverity.Error));
            }
            if (openBrackets > 0) {
                const lastLine = document.lineCount - 1;
                const lastLineLength = document.lineAt(lastLine).text.length;
                const range = new vscode.Range(lastLine, lastLineLength, lastLine, lastLineLength);
                diagnostics.push(new vscode.Diagnostic(range, `Missing ${openBrackets} closing bracket(s) ]`, vscode.DiagnosticSeverity.Error));
            }
            if (openParens > 0) {
                const lastLine = document.lineCount - 1;
                const lastLineLength = document.lineAt(lastLine).text.length;
                const range = new vscode.Range(lastLine, lastLineLength, lastLine, lastLineLength);
                diagnostics.push(new vscode.Diagnostic(range, `Missing ${openParens} closing parenthesis(es) )`, vscode.DiagnosticSeverity.Error));
            }
        }
        catch (error) {
            // Lexer error
            const range = new vscode.Range(0, 0, 0, 1);
            diagnostics.push(new vscode.Diagnostic(range, error.message, vscode.DiagnosticSeverity.Error));
        }
        // Add language server diagnostics (undefined variables, etc.)
        if (this.languageServer) {
            const lsDiagnostics = this.languageServer.validateDocument(document);
            diagnostics.push(...lsDiagnostics);
        }
        this.diagnosticCollection.set(document.uri, diagnostics);
    }
    clearDiagnostics(uri) {
        this.diagnosticCollection.delete(uri);
    }
    dispose() {
        this.diagnosticCollection.dispose();
    }
}
exports.FlickDiagnostics = FlickDiagnostics;
//# sourceMappingURL=diagnostics.js.map