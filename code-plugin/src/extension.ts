import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { FlickDiagnostics } from './diagnostics';
import { FlickLanguageServer } from './languageServer';

let diagnosticsProvider: FlickDiagnostics | undefined;
let languageServer: FlickLanguageServer | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('Flick extension is now active!');

    // Initialize language server first
    languageServer = new FlickLanguageServer();

    // Initialize diagnostics provider with language server
    diagnosticsProvider = new FlickDiagnostics(languageServer);
    context.subscriptions.push(diagnosticsProvider);

    // Register completion provider
    const completionProvider = vscode.languages.registerCompletionItemProvider(
        'flick', 
        {
            provideCompletionItems(document, position) {
                return languageServer?.provideCompletionItems(document, position);
            }
        },
        '/', '.', ' '  // Trigger characters for member access and general typing
    );
    context.subscriptions.push(completionProvider);

    // Register hover provider
    context.subscriptions.push(
        vscode.languages.registerHoverProvider('flick', {
            provideHover(document, position) {
                return languageServer?.provideHover(document, position);
            }
        })
    );

    // Register run file command
    const runFileCommand = vscode.commands.registerCommand('flick.runFile', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }

        if (editor.document.languageId !== 'flick') {
            vscode.window.showErrorMessage('Current file is not a Flick file');
            return;
        }

        // Save the file first
        await editor.document.save();

        runFlickFile(editor.document.uri.fsPath, context);
    });

    // Register run selection command
    const runSelectionCommand = vscode.commands.registerCommand('flick.runSelection', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor');
            return;
        }

        if (editor.document.languageId !== 'flick') {
            vscode.window.showErrorMessage('Current file is not a Flick file');
            return;
        }

        const selection = editor.selection;
        const text = editor.document.getText(selection);

        if (!text.trim()) {
            vscode.window.showWarningMessage('No code selected');
            return;
        }

        runFlickCode(text, context);
    });

    // Watch for document changes for diagnostics
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((event: vscode.TextDocumentChangeEvent) => {
            if (event.document.languageId === 'flick') {
                diagnosticsProvider?.updateDiagnostics(event.document);
                languageServer?.clearCache(event.document.uri);
            }
        })
    );

    // Update diagnostics on open
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument((document: vscode.TextDocument) => {
            if (document.languageId === 'flick') {
                diagnosticsProvider?.updateDiagnostics(document);
                languageServer?.clearCache(document.uri);
            }
        })
    );

    // Clear diagnostics on close
    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument((document: vscode.TextDocument) => {
            if (document.languageId === 'flick') {
                diagnosticsProvider?.clearDiagnostics(document.uri);
                languageServer?.clearCache(document.uri);
            }
        })
    );

    context.subscriptions.push(runFileCommand, runSelectionCommand);
}

async function runFlickFile(filePath: string, context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('flick');
    const interpreterPath = config.get<string>('interpreterPath');

    // Find the interpreter
    const extensionPath = context.extensionPath;
    const bundledInterpreterPath = path.join(extensionPath, 'temp_interpreter', 'cli.ts');

    // Create output channel for results
    const outputChannel = vscode.window.createOutputChannel('Flick Output');
    outputChannel.show(true);
    outputChannel.clear();
    outputChannel.appendLine(`Running: ${path.basename(filePath)}`);
    outputChannel.appendLine('═'.repeat(50));

    try {
        // Use flick run command
        const flickCommand = interpreterPath || 'flick';

        const process = spawn(flickCommand, ['run', filePath], {
            cwd: path.dirname(filePath),
            shell: true
        });

        process.stdout.on('data', (data: Buffer) => {
            outputChannel.append(data.toString());
        });

        process.stderr.on('data', (data: Buffer) => {
            outputChannel.append(data.toString());
        });

        process.on('error', (error: Error) => {
            outputChannel.appendLine(`\nError: ${error.message}`);
            vscode.window.showErrorMessage(`Failed to run Flick file: ${error.message}`);
        });

        process.on('close', (code: number | null) => {
            outputChannel.appendLine('');
            outputChannel.appendLine('═'.repeat(50));
            outputChannel.appendLine(`Process exited with code ${code}`);
            
            if (code !== 0) {
                vscode.window.showErrorMessage(`Flick execution failed with code ${code}`);
            }
        });
    } catch (error: any) {
        outputChannel.appendLine(`Error: ${error.message}`);
        vscode.window.showErrorMessage(`Failed to run Flick file: ${error.message}`);
    }
}

async function runFlickCode(code: string, context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel('Flick Output');
    outputChannel.show(true);
    outputChannel.clear();
    outputChannel.appendLine('Running selected code:');
    outputChannel.appendLine('═'.repeat(50));
    outputChannel.appendLine(code);
    outputChannel.appendLine('═'.repeat(50));

    // Create a temporary file
    const tempDir = context.globalStorageUri.fsPath;
    
    try {
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const tempFile = path.join(tempDir, 'temp.fk');
        fs.writeFileSync(tempFile, code);

        await runFlickFile(tempFile, context);
    } catch (error: any) {
        outputChannel.appendLine(`Error: ${error.message}`);
        vscode.window.showErrorMessage(`Failed to run Flick code: ${error.message}`);
    }
}

export function deactivate() {
    if (diagnosticsProvider) {
        diagnosticsProvider.dispose();
    }
}
