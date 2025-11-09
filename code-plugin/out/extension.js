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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
const diagnostics_1 = require("./diagnostics");
const languageServer_1 = require("./languageServer");
let diagnosticsProvider;
let languageServer;
function activate(context) {
    console.log('Flick extension is now active!');
    // Initialize language server first
    languageServer = new languageServer_1.FlickLanguageServer();
    // Initialize diagnostics provider with language server
    diagnosticsProvider = new diagnostics_1.FlickDiagnostics(languageServer);
    context.subscriptions.push(diagnosticsProvider);
    // Register completion provider
    const completionProvider = vscode.languages.registerCompletionItemProvider('flick', {
        provideCompletionItems(document, position) {
            return languageServer?.provideCompletionItems(document, position);
        }
    }, '/', '.', ' ' // Trigger characters for member access and general typing
    );
    context.subscriptions.push(completionProvider);
    // Register hover provider
    context.subscriptions.push(vscode.languages.registerHoverProvider('flick', {
        provideHover(document, position) {
            return languageServer?.provideHover(document, position);
        }
    }));
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
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.document.languageId === 'flick') {
            diagnosticsProvider?.updateDiagnostics(event.document);
            languageServer?.clearCache(event.document.uri);
        }
    }));
    // Update diagnostics on open
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument((document) => {
        if (document.languageId === 'flick') {
            diagnosticsProvider?.updateDiagnostics(document);
            languageServer?.clearCache(document.uri);
        }
    }));
    // Clear diagnostics on close
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument((document) => {
        if (document.languageId === 'flick') {
            diagnosticsProvider?.clearDiagnostics(document.uri);
            languageServer?.clearCache(document.uri);
        }
    }));
    context.subscriptions.push(runFileCommand, runSelectionCommand);
}
async function runFlickFile(filePath, context) {
    const config = vscode.workspace.getConfiguration('flick');
    const interpreterPath = config.get('interpreterPath');
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
        const process = (0, child_process_1.spawn)(flickCommand, ['run', filePath], {
            cwd: path.dirname(filePath),
            shell: true
        });
        process.stdout.on('data', (data) => {
            outputChannel.append(data.toString());
        });
        process.stderr.on('data', (data) => {
            outputChannel.append(data.toString());
        });
        process.on('error', (error) => {
            outputChannel.appendLine(`\nError: ${error.message}`);
            vscode.window.showErrorMessage(`Failed to run Flick file: ${error.message}`);
        });
        process.on('close', (code) => {
            outputChannel.appendLine('');
            outputChannel.appendLine('═'.repeat(50));
            outputChannel.appendLine(`Process exited with code ${code}`);
            if (code !== 0) {
                vscode.window.showErrorMessage(`Flick execution failed with code ${code}`);
            }
        });
    }
    catch (error) {
        outputChannel.appendLine(`Error: ${error.message}`);
        vscode.window.showErrorMessage(`Failed to run Flick file: ${error.message}`);
    }
}
async function runFlickCode(code, context) {
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
    }
    catch (error) {
        outputChannel.appendLine(`Error: ${error.message}`);
        vscode.window.showErrorMessage(`Failed to run Flick code: ${error.message}`);
    }
}
function deactivate() {
    if (diagnosticsProvider) {
        diagnosticsProvider.dispose();
    }
}
//# sourceMappingURL=extension.js.map