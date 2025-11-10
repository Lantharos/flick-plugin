import * as path from 'path';
import {
    workspace,
    ExtensionContext,
    commands,
    window,
    TextDocument,
    Terminal
} from 'vscode';

import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    TransportKind
} from 'vscode-languageclient/node';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
    console.log('Flick extension is now active!');

    // The server is implemented in node
    const serverModule = context.asAbsolutePath(
        path.join('out', 'languageServer.js')
    );

    // If the extension is launched in debug mode then the debug server options are used
    // Otherwise the run options are used
    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
        }
    };

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        // Register the server for flick documents
        documentSelector: [{ scheme: 'file', language: 'flick' }],
        synchronize: {
            // Notify the server about file changes to '.clientrc files contained in the workspace
            fileEvents: workspace.createFileSystemWatcher('**/.clientrc')
        }
    };

    // Create the language client and start the client.
    client = new LanguageClient(
        'flickLanguageServer',
        'Flick Language Server',
        serverOptions,
        clientOptions
    );

    // Start the client. This will also launch the server
    client.start();

    context.subscriptions.push(
        commands.registerCommand('flick.runFile', async () => {
            const editor = window.activeTextEditor;
            if (!editor) {
                window.showErrorMessage('No active editor to run.');
                return;
            }

            const document = editor.document;
            if (document.languageId !== 'flick') {
                window.showErrorMessage('The active file is not a Flick file.');
                return;
            }

            if (document.isDirty) {
                await document.save();
            }

            runFlickFile(document);
        })
    );

    context.subscriptions.push(
        commands.registerCommand('flick.runSelection', async () => {
            const editor = window.activeTextEditor;
            if (!editor) {
                window.showErrorMessage('No active editor to run.');
                return;
            }

            const document = editor.document;
            if (document.languageId !== 'flick') {
                window.showErrorMessage('The active file is not a Flick file.');
                return;
            }

            window.showInformationMessage('Running selection is not supported yet. Running entire file instead.');
            if (document.isDirty) {
                await document.save();
            }
            runFlickFile(document);
        })
    );
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) {
        return undefined;
    }
    return client.stop();
}

function getOrCreateTerminal(): Terminal {
    const existing = window.terminals.find(t => t.name === 'Flick');
    return existing ?? window.createTerminal({ name: 'Flick' });
}

function getInterpreterPath(): string {
    const config = workspace.getConfiguration('flick');
    const configured = config.get<string>('interpreterPath');
    return configured && configured.trim().length > 0 ? configured : 'flick';
}

function buildRunFileCommand(interpreter: string, relativePath: string): string {
    return `${quote(interpreter)} run ${quote(relativePath)}`;
}

function runFlickFile(document: TextDocument): void {
    const interpreter = getInterpreterPath();
    const folder = workspace.getWorkspaceFolder(document.uri);
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

function quote(value: string): string {
    if (/^[^\s"']+$/.test(value)) {
        return value;
    }
    const escaped = value.replace(/"/g, '\\"');
    return `"${escaped}"`;
}
