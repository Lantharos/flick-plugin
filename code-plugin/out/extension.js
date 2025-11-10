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
const path = __importStar(require("path"));
const vscode_1 = require("vscode");
const node_1 = require("vscode-languageclient/node");
let client;
function activate(context) {
    console.log('Flick extension is now active!');
    // The server is implemented in node
    const serverModule = context.asAbsolutePath(path.join('out', 'languageServer.js'));
    // If the extension is launched in debug mode then the debug server options are used
    // Otherwise the run options are used
    const serverOptions = {
        run: { module: serverModule, transport: node_1.TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: node_1.TransportKind.ipc,
        }
    };
    // Options to control the language client
    const clientOptions = {
        // Register the server for flick documents
        documentSelector: [{ scheme: 'file', language: 'flick' }],
        synchronize: {
            // Notify the server about file changes to '.clientrc files contained in the workspace
            fileEvents: vscode_1.workspace.createFileSystemWatcher('**/.clientrc')
        }
    };
    // Create the language client and start the client.
    client = new node_1.LanguageClient('flickLanguageServer', 'Flick Language Server', serverOptions, clientOptions);
    // Start the client. This will also launch the server
    client.start();
    context.subscriptions.push(vscode_1.commands.registerCommand('flick.runFile', async () => {
        const editor = vscode_1.window.activeTextEditor;
        if (!editor) {
            vscode_1.window.showErrorMessage('No active editor to run.');
            return;
        }
        const document = editor.document;
        if (document.languageId !== 'flick') {
            vscode_1.window.showErrorMessage('The active file is not a Flick file.');
            return;
        }
        if (document.isDirty) {
            await document.save();
        }
        runFlickFile(document);
    }));
    context.subscriptions.push(vscode_1.commands.registerCommand('flick.runSelection', async () => {
        const editor = vscode_1.window.activeTextEditor;
        if (!editor) {
            vscode_1.window.showErrorMessage('No active editor to run.');
            return;
        }
        const document = editor.document;
        if (document.languageId !== 'flick') {
            vscode_1.window.showErrorMessage('The active file is not a Flick file.');
            return;
        }
        vscode_1.window.showInformationMessage('Running selection is not supported yet. Running entire file instead.');
        if (document.isDirty) {
            await document.save();
        }
        runFlickFile(document);
    }));
}
function deactivate() {
    if (!client) {
        return undefined;
    }
    return client.stop();
}
function getOrCreateTerminal() {
    const existing = vscode_1.window.terminals.find(t => t.name === 'Flick');
    return existing ?? vscode_1.window.createTerminal({ name: 'Flick' });
}
function getInterpreterPath() {
    const config = vscode_1.workspace.getConfiguration('flick');
    const configured = config.get('interpreterPath');
    return configured && configured.trim().length > 0 ? configured : 'flick';
}
function buildRunFileCommand(interpreter, relativePath) {
    return `${quote(interpreter)} run ${quote(relativePath)}`;
}
function runFlickFile(document) {
    const interpreter = getInterpreterPath();
    const folder = vscode_1.workspace.getWorkspaceFolder(document.uri);
    const filePath = document.uri.fsPath;
    const basePath = folder?.uri.fsPath;
    const relativePath = basePath ? path.relative(basePath, filePath) : filePath;
    const terminal = getOrCreateTerminal();
    terminal.show(true);
    if (basePath) {
        terminal.sendText(`cd ${quote(basePath)}`, true);
    }
    const command = buildRunFileCommand(interpreter, relativePath);
    terminal.sendText(command, true);
}
function quote(value) {
    if (/^[^\s"']+$/.test(value)) {
        return value;
    }
    const escaped = value.replace(/"/g, '\\"');
    return `"${escaped}"`;
}
//# sourceMappingURL=extension.js.map