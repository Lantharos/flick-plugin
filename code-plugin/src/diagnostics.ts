import * as vscode from 'vscode';
import { FlickLanguageServer } from './languageServer';

// Simple token types for basic lexical analysis
enum TokenType {
    LBRACE = 'LBRACE',
    RBRACE = 'RBRACE',
    LBRACKET = 'LBRACKET',
    RBRACKET = 'RBRACKET',
    LPAREN = 'LPAREN',
    RPAREN = 'RPAREN',
}

interface Token {
    type: TokenType;
    line: number;
    column: number;
}

// Simple lexer for basic validation
class SimpleLexer {
    private input: string;
    private position: number = 0;
    private line: number = 1;
    private column: number = 1;

    constructor(input: string) {
        this.input = input;
    }

    private peek(): string {
        return this.position < this.input.length ? this.input[this.position] : '';
    }

    private advance(): string {
        const char = this.peek();
        this.position++;
        if (char === '\n') {
            this.line++;
            this.column = 1;
        } else {
            this.column++;
        }
        return char;
    }

    public tokenize(): Token[] {
        const tokens: Token[] = [];

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

export class FlickDiagnostics {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private enableDiagnostics: boolean = true;
    private languageServer: FlickLanguageServer | undefined;

    constructor(languageServer?: FlickLanguageServer) {
        this.languageServer = languageServer;
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('flick');
        
        // Load configuration
        const config = vscode.workspace.getConfiguration('flick');
        this.enableDiagnostics = config.get<boolean>('enableDiagnostics', true);

        // Watch for configuration changes
        vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent) => {
            if (e.affectsConfiguration('flick.enableDiagnostics')) {
                const config = vscode.workspace.getConfiguration('flick');
                this.enableDiagnostics = config.get<boolean>('enableDiagnostics', true);
                
                // Clear diagnostics if disabled
                if (!this.enableDiagnostics) {
                    this.diagnosticCollection.clear();
                }
            }
        });
    }

    public updateDiagnostics(document: vscode.TextDocument): void {
        if (!this.enableDiagnostics || document.languageId !== 'flick') {
            return;
        }

        const diagnostics: vscode.Diagnostic[] = [];
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
                } else if (token.type === TokenType.RBRACE) {
                    openBraces--;
                    if (openBraces < 0) {
                        const range = new vscode.Range(
                            token.line - 1,
                            token.column - 1,
                            token.line - 1,
                            token.column
                        );
                        diagnostics.push(
                            new vscode.Diagnostic(
                                range,
                                'Unexpected closing brace }',
                                vscode.DiagnosticSeverity.Error
                            )
                        );
                    }
                }

                if (token.type === TokenType.LBRACKET) {
                    openBrackets++;
                } else if (token.type === TokenType.RBRACKET) {
                    openBrackets--;
                    if (openBrackets < 0) {
                        const range = new vscode.Range(
                            token.line - 1,
                            token.column - 1,
                            token.line - 1,
                            token.column
                        );
                        diagnostics.push(
                            new vscode.Diagnostic(
                                range,
                                'Unexpected closing bracket ]',
                                vscode.DiagnosticSeverity.Error
                            )
                        );
                    }
                }

                if (token.type === TokenType.LPAREN) {
                    openParens++;
                } else if (token.type === TokenType.RPAREN) {
                    openParens--;
                    if (openParens < 0) {
                        const range = new vscode.Range(
                            token.line - 1,
                            token.column - 1,
                            token.line - 1,
                            token.column
                        );
                        diagnostics.push(
                            new vscode.Diagnostic(
                                range,
                                'Unexpected closing parenthesis )',
                                vscode.DiagnosticSeverity.Error
                            )
                        );
                    }
                }
            }

            // Check for unclosed delimiters at end of file
            if (openBraces > 0) {
                const lastLine = document.lineCount - 1;
                const lastLineLength = document.lineAt(lastLine).text.length;
                const range = new vscode.Range(lastLine, lastLineLength, lastLine, lastLineLength);
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        `Missing ${openBraces} closing brace(s) }`,
                        vscode.DiagnosticSeverity.Error
                    )
                );
            }

            if (openBrackets > 0) {
                const lastLine = document.lineCount - 1;
                const lastLineLength = document.lineAt(lastLine).text.length;
                const range = new vscode.Range(lastLine, lastLineLength, lastLine, lastLineLength);
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        `Missing ${openBrackets} closing bracket(s) ]`,
                        vscode.DiagnosticSeverity.Error
                    )
                );
            }

            if (openParens > 0) {
                const lastLine = document.lineCount - 1;
                const lastLineLength = document.lineAt(lastLine).text.length;
                const range = new vscode.Range(lastLine, lastLineLength, lastLine, lastLineLength);
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        `Missing ${openParens} closing parenthesis(es) )`,
                        vscode.DiagnosticSeverity.Error
                    )
                );
            }

        } catch (error: any) {
            // Lexer error
            const range = new vscode.Range(0, 0, 0, 1);
            diagnostics.push(
                new vscode.Diagnostic(
                    range,
                    error.message,
                    vscode.DiagnosticSeverity.Error
                )
            );
        }

        // Add language server diagnostics (undefined variables, etc.)
        if (this.languageServer) {
            const lsDiagnostics = this.languageServer.validateDocument(document);
            diagnostics.push(...lsDiagnostics);
        }

        this.diagnosticCollection.set(document.uri, diagnostics);
    }

    public clearDiagnostics(uri: vscode.Uri): void {
        this.diagnosticCollection.delete(uri);
    }

    public dispose(): void {
        this.diagnosticCollection.dispose();
    }
}
