"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlickLanguageServer = void 0;
const node_1 = require("vscode-languageserver/node");
const vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
// Plugin-specific keywords and functions
const WEB_PLUGIN_KEYWORDS = new Set(['route', 'respond', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH']);
const WEB_ROUTE_ONLY_KEYWORDS = new Set(['query', 'body', 'headers', 'req']);
const FILE_PLUGIN_KEYWORDS = new Set(['read', 'write', 'exists', 'listdir']);
const TIME_PLUGIN_KEYWORDS = new Set(['now', 'timestamp', 'sleep']);
const NAMED_PARAM_CONTEXTS = new Set(['respond']); // Contexts where named params like json=, status= are valid
class FlickLanguageServer {
    connection = (0, node_1.createConnection)(node_1.ProposedFeatures.all);
    documents = new node_1.TextDocuments(vscode_languageserver_textdocument_1.TextDocument);
    documentScopes = new Map();
    documentPlugins = new Map();
    constructor() {
        this.connection.onInitialize((params) => {
            const result = {
                capabilities: {
                    textDocumentSync: node_1.TextDocumentSyncKind.Incremental,
                    completionProvider: {
                        resolveProvider: true
                    },
                    hoverProvider: true
                }
            };
            return result;
        });
        this.documents.onDidChangeContent((change) => {
            this.validateTextDocument(change.document);
        });
        this.connection.onCompletion((textDocumentPosition) => {
            const document = this.documents.get(textDocumentPosition.textDocument.uri);
            if (!document) {
                return [];
            }
            return this.provideCompletionItems(document, textDocumentPosition.position);
        });
        this.connection.onCompletionResolve((item) => {
            return item;
        });
        this.connection.onHover((textDocumentPosition) => {
            const document = this.documents.get(textDocumentPosition.textDocument.uri);
            if (!document) {
                return null;
            }
            return this.provideHover(document, textDocumentPosition.position);
        });
        this.documents.listen(this.connection);
        this.documents.onDidClose((e) => {
            this.documentScopes.delete(e.document.uri);
        });
        this.connection.listen();
    }
    getDocumentSettings(uri) {
        return Promise.resolve({});
    }
    provideCompletionItems(document, position) {
        const rootScope = this.buildScopeTree(document);
        const currentScope = this.findScopeAtPosition(rootScope, position.line);
        const completions = [];
        // Check if we're in a member access context (after / or .)
        const line = document.getText({ start: { line: position.line, character: 0 }, end: { line: position.line, character: position.character } });
        const memberAccessMatch = line.match(/([a-zA-Z_][a-zA-Z0-9_]*)\s*[/.]\s*([a-zA-Z_][a-zA-Z0-9_]*)?$/);
        if (memberAccessMatch) {
            // We're completing members of an object
            const objectName = memberAccessMatch[1];
            const partialMember = memberAccessMatch[2] || '';
            const visibleSymbols = this.getVisibleSymbols(currentScope);
            const objectSymbol = visibleSymbols.find(s => s.name === objectName);
            if (objectSymbol) {
                // Get members based on the object's type
                const members = this.getMembersOfSymbol(objectSymbol, rootScope);
                for (const member of members) {
                    // Filter by partial match
                    if (partialMember && !member.name.startsWith(partialMember)) {
                        continue;
                    }
                    const item = node_1.CompletionItem.create(member.name);
                    if (member.type === 'task') {
                        item.kind = node_1.CompletionItemKind.Method;
                        item.detail = `task ${member.name}`;
                        if (member.params) {
                            item.detail += ` with ${member.params.map((p) => `${p.type}(${p.name})`).join(', ')}`;
                        }
                    }
                    else {
                        item.kind = node_1.CompletionItemKind.Property;
                        item.detail = `${member.mutable ? 'free' : 'lock'} ${member.varType || ''} ${member.name}`;
                    }
                    completions.push(item);
                }
                return completions; // Only show member completions
            }
        }
        // Normal completions (not in member access context)
        const visibleSymbols = this.getVisibleSymbols(currentScope);
        for (const symbol of visibleSymbols) {
            const item = node_1.CompletionItem.create(symbol.name);
            switch (symbol.type) {
                case 'task':
                    item.kind = node_1.CompletionItemKind.Function;
                    item.detail = `task ${symbol.name}`;
                    if (symbol.params) {
                        item.detail += ` with ${symbol.params.map(p => `${p.type}(${p.name})`).join(', ')}`;
                    }
                    break;
                case 'variable':
                case 'parameter':
                case 'loop-var':
                case 'field':
                    item.kind = node_1.CompletionItemKind.Variable;
                    const prefix = symbol.mutable ? 'free' : 'lock';
                    item.detail = `${prefix} ${symbol.varType || ''} ${symbol.name}`;
                    break;
                case 'group':
                    item.kind = node_1.CompletionItemKind.Class;
                    item.detail = `group ${symbol.name}`;
                    break;
                case 'blueprint':
                    item.kind = node_1.CompletionItemKind.Interface;
                    item.detail = `blueprint ${symbol.name}`;
                    break;
            }
            completions.push(item);
        }
        // Add keywords
        const keywords = [
            'task', 'free', 'lock', 'group', 'blueprint', 'assume', 'maybe',
            'otherwise', 'each', 'march', 'select', 'when', 'suppose', 'end',
            'print', 'ask', 'give', 'route', 'respond', 'declare', 'import',
            'use', 'do', 'for', 'with', 'in', 'from', 'to', 'as', 'and'
        ];
        for (const keyword of keywords) {
            const item = node_1.CompletionItem.create(keyword);
            item.kind = node_1.CompletionItemKind.Keyword;
            completions.push(item);
        }
        // Add built-ins
        const builtins = [
            { name: 'num', kind: node_1.CompletionItemKind.TypeParameter },
            { name: 'literal', kind: node_1.CompletionItemKind.TypeParameter },
            { name: 'yes', kind: node_1.CompletionItemKind.Constant },
            { name: 'no', kind: node_1.CompletionItemKind.Constant },
            { name: 'JSON', kind: node_1.CompletionItemKind.Module },
        ];
        for (const builtin of builtins) {
            const item = node_1.CompletionItem.create(builtin.name);
            item.kind = builtin.kind;
            completions.push(item);
        }
        return completions;
    }
    provideHover(document, position) {
        const wordRange = this.getWordRangeAtPosition(document, position);
        if (!wordRange)
            return null;
        const word = document.getText(wordRange);
        const rootScope = this.buildScopeTree(document);
        const currentScope = this.findScopeAtPosition(rootScope, position.line);
        const visibleSymbols = this.getVisibleSymbols(currentScope);
        const symbol = visibleSymbols.find(s => s.name === word);
        if (!symbol)
            return null;
        let markdown = '';
        switch (symbol.type) {
            case 'task':
                markdown = `**task** \`${symbol.name}\``;
                if (symbol.params) {
                    markdown += `\n\nParameters: ${symbol.params.map(p => `\`${p.type}(${p.name})\``).join(', ')}`;
                }
                break;
            case 'variable':
            case 'parameter':
            case 'loop-var':
            case 'field':
                markdown = `**${symbol.mutable ? 'free' : 'lock'}** \`${symbol.name}\``;
                if (symbol.varType) {
                    markdown += `\n\nType: \`${symbol.varType}\``;
                }
                if (symbol.type === 'parameter') {
                    markdown += `\n\n_(task parameter)_`;
                }
                else if (symbol.type === 'loop-var') {
                    markdown += `\n\n_(loop variable)_`;
                }
                else if (symbol.type === 'field') {
                    markdown += `\n\n_(group field)_`;
                }
                break;
            case 'group':
                markdown = `**group** \`${symbol.name}\``;
                break;
            case 'blueprint':
                markdown = `**blueprint** \`${symbol.name}\``;
                break;
        }
        return {
            contents: {
                kind: node_1.MarkupKind.Markdown,
                value: markdown
            }
        };
    }
    getWordRangeAtPosition(document, position) {
        const line = document.getText({ start: { line: position.line, character: 0 }, end: { line: position.line + 1, character: 0 } });
        const wordRegex = /[\w\d_]+/g;
        let match;
        while (match = wordRegex.exec(line)) {
            const start = match.index;
            const end = start + match[0].length;
            if (position.character >= start && position.character <= end) {
                return { start: { line: position.line, character: start }, end: { line: position.line, character: end } };
            }
        }
        return undefined;
    }
    validateDocument(document) {
        const diagnostics = [];
        const rootScope = this.buildScopeTree(document);
        const plugins = this.documentPlugins.get(document.uri.toString()) || [];
        const text = document.getText();
        const lines = text.split('\n');
        // Validate file imports (use and import statements)
        this.validateFileImports(document, lines, diagnostics);
        // Build set of plugin keywords available
        const pluginKeywords = new Set();
        for (const plugin of plugins) {
            if (plugin.name === 'web') {
                WEB_PLUGIN_KEYWORDS.forEach(k => pluginKeywords.add(k));
            }
            else if (plugin.name === 'files') {
                FILE_PLUGIN_KEYWORDS.forEach(k => pluginKeywords.add(k));
            }
            else if (plugin.name === 'time') {
                TIME_PLUGIN_KEYWORDS.forEach(k => pluginKeywords.add(k));
            }
        }
        const keywords = new Set([
            'task', 'free', 'lock', 'group', 'blueprint', 'assume', 'maybe',
            'otherwise', 'each', 'march', 'select', 'when', 'suppose', 'end',
            'print', 'ask', 'give', 'route', 'respond', 'declare', 'import',
            'use', 'do', 'for', 'with', 'in', 'from', 'to', 'as', 'and',
            'num', 'literal', 'yes', 'no', 'JSON', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH',
            ...pluginKeywords
        ]);
        const identifierPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
        // Built-in functions/identifiers that should not be treated as undefined
        const BUILTIN_FUNCTIONS = new Set(['str', 'print', 'ask', 'give', 'yes', 'no', 'num', 'literal', 'JSON', 'Window']);
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            if (trimmed.startsWith('#'))
                continue;
            const currentScope = this.findScopeAtPosition(rootScope, i);
            // Skip validation inside blueprint blocks (signatures only)
            if (currentScope.type === 'blueprint')
                continue;
            // Remove strings AND comments from the line before validation
            let withoutStrings = line.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '');
            // Remove everything after # (comment)
            const commentIndex = withoutStrings.indexOf('#');
            if (commentIndex !== -1) {
                withoutStrings = withoutStrings.substring(0, commentIndex);
            }
            const visibleSymbols = this.getVisibleSymbols(currentScope);
            const visibleNames = new Set(visibleSymbols.map(s => s.name));
            let match;
            identifierPattern.lastIndex = 0;
            while ((match = identifierPattern.exec(withoutStrings)) !== null) {
                const identifier = match[1];
                const column = match.index;
                if (keywords.has(identifier))
                    continue;
                if (visibleNames.has(identifier))
                    continue;
                // Check if it's being defined on this line
                const lineUpToIdentifier = withoutStrings.substring(0, column);
                // Skip if it's a declaration
                if (/(free|lock|task|group|blueprint)\s+$/.test(lineUpToIdentifier))
                    continue;
                if (/\b(with|each|march)\s+$/.test(lineUpToIdentifier))
                    continue;
                if (/^\s*do\s+[a-zA-Z_][a-zA-Z0-9_]*\s+for\s+$/.test(lineUpToIdentifier))
                    continue;
                if (/^\s*declare\s+$/.test(lineUpToIdentifier))
                    continue;
                if (/^\s*declare\s+[a-zA-Z_][a-zA-Z0-9_]*@$/.test(lineUpToIdentifier))
                    continue; // Skip @argument
                if (/^\s*use\s+$/.test(lineUpToIdentifier))
                    continue;
                // Skip type annotations
                if (/\b(num|literal|[A-Z][a-zA-Z0-9_]*)\s*$/.test(lineUpToIdentifier) && /^\s*\(/.test(withoutStrings.substring(column + identifier.length))) {
                    continue;
                }
                // Skip type annotations in variable declarations (free Type name)
                if (/(free|lock)\s+$/.test(lineUpToIdentifier))
                    continue;
                // Skip named parameters (json=, status=, style=, etc.)
                const afterIdentifier = withoutStrings.substring(column + identifier.length);
                if (/^\s*=/.test(afterIdentifier) && !/^\s*==/.test(afterIdentifier)) {
                    // Allow named params in a few contexts:
                    // - respond calls
                    // - when the identifier comes after a comma (e.g. Window.print "x", style={...})
                    // - when it's used as a named argument to a member call (e.g. Window.print ... style=...)
                    if (/\b(respond)\s+.*$/.test(lineUpToIdentifier) || /,\s*$/.test(lineUpToIdentifier) || /[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*\s*$/.test(lineUpToIdentifier)) {
                        continue;
                    }
                }
                // Skip object literal keys like {width: 0} — treat identifier followed by ':' as a key, not variable usage
                if (/^\s*:/.test(afterIdentifier)) {
                    continue;
                }
                // Skip member access (obj/method or obj.property)
                // Check if this identifier comes after a / or .
                const beforeIdentifier = withoutStrings.substring(0, column);
                if (/[/.]$/.test(beforeIdentifier.trimEnd())) {
                    // This is a property/method access - validate it exists
                    // Find the object identifier before the / or .
                    const objectMatch = beforeIdentifier.match(/([a-zA-Z_][a-zA-Z0-9_]*)\s*[/.]$/);
                    if (objectMatch) {
                        const objectName = objectMatch[1];
                        const objectSymbol = visibleSymbols.find(s => s.name === objectName);
                        if (objectSymbol) {
                            // Check if the member exists on this type
                            const members = this.getMembersOfSymbol(objectSymbol, rootScope);
                            const memberExists = members.some(m => m.name === identifier);
                            if (!memberExists) {
                                const range = { start: { line: i, character: column }, end: { line: i, character: column + identifier.length } };
                                const typeName = objectSymbol.varType || objectSymbol.name;
                                diagnostics.push({
                                    range,
                                    message: `Property or method '${identifier}' does not exist on type '${typeName}'`,
                                    severity: node_1.DiagnosticSeverity.Error
                                });
                            }
                        }
                    }
                    continue;
                }
                // Also skip if this identifier is followed by / or . (it's the object being accessed)
                if (/^\s*[/.]/.test(afterIdentifier)) {
                    // Don't skip - we need to validate the object itself exists
                    // Continue to normal validation below
                }
                // Check for route-only keywords used outside route blocks
                if (WEB_ROUTE_ONLY_KEYWORDS.has(identifier)) {
                    if (currentScope.type !== 'route') {
                        const range = { start: { line: i, character: column }, end: { line: i, character: column + identifier.length } };
                        diagnostics.push({
                            range,
                            message: `'${identifier}' can only be used inside route blocks`,
                            severity: node_1.DiagnosticSeverity.Error
                        });
                        continue;
                    }
                    else {
                        // It's in a route block, so it's valid
                        continue;
                    }
                }
                // Validate route forwarding
                if (/^\s*route\s+(?:GET|POST|PUT|DELETE|PATCH)?\s*"[^"]+"\s*->\s*$/.test(lineUpToIdentifier)) {
                    // This is a module being forwarded to
                    const moduleSymbol = visibleSymbols.find(s => s.name === identifier && s.type === 'module');
                    if (!moduleSymbol) {
                        const range = { start: { line: i, character: column }, end: { line: i, character: column + identifier.length } };
                        diagnostics.push({
                            range,
                            message: `Module '${identifier}' is not imported. Use 'use ${identifier}' to import it.`,
                            severity: node_1.DiagnosticSeverity.Error
                        });
                    }
                    continue;
                }
                // If it's a call to a builtin function (like str(...)) treat as defined
                const afterIdent = withoutStrings.substring(column + identifier.length);
                if (BUILTIN_FUNCTIONS.has(identifier)) {
                    continue;
                }
                const range = { start: { line: i, character: column }, end: { line: i, character: column + identifier.length } };
                diagnostics.push({
                    range,
                    message: `Variable '${identifier}' is used outside its scope or is undefined`,
                    severity: node_1.DiagnosticSeverity.Error
                });
            }
        }
        // Check for unclosed blocks
        diagnostics.push(...this.validateBlockStructure(lines));
        return diagnostics;
    }
    buildScopeTree(document) {
        this.documentScopes.delete(document.uri.toString());
        this.documentPlugins.delete(document.uri.toString());
        const text = document.getText();
        const lines = text.split('\n');
        const globalScope = {
            type: 'global',
            startLine: 0,
            endLine: lines.length - 1,
            symbols: new Map(),
            children: [],
            parent: undefined
        };
        const scopeStack = [globalScope];
        const plugins = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            let currentScope = scopeStack[scopeStack.length - 1];
            if (trimmed.startsWith('#'))
                continue;
            let strippedLine = line.replace(/"[^"\\]*(?:\\.[^"\\]*)*"/g, '""');
            strippedLine = strippedLine.replace(/'[^'\\]*(?:\\.[^'\\]*)*'/g, "''");
            const cidx = strippedLine.indexOf('#');
            if (cidx !== -1)
                strippedLine = strippedLine.substring(0, cidx);
            const declareMatch = line.match(/^\s*declare\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:@([a-zA-Z0-9_]+))?\s*$/);
            if (declareMatch) {
                const pluginName = declareMatch[1];
                const argument = declareMatch[2];
                plugins.push({ name: pluginName, argument, line: i });
                const pluginSymbol = {
                    name: pluginName,
                    type: 'plugin',
                    range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
                };
                currentScope.symbols.set(pluginName, pluginSymbol);
                if (pluginName.toLowerCase() === 'window') {
                    const windowSymbol = {
                        name: 'Window',
                        type: 'plugin',
                        varType: 'Window',
                        range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
                    };
                    currentScope.symbols.set('Window', windowSymbol);
                    const windowGroupScope = {
                        type: 'group',
                        name: 'Window',
                        startLine: i,
                        endLine: i,
                        parent: globalScope,
                        symbols: new Map(),
                        children: []
                    };
                    const windowMethods = [
                        { name: 'open', type: 'task' }, { name: 'print', type: 'task' },
                        { name: 'heading', type: 'task' }, { name: 'button', type: 'task' },
                        { name: 'input', type: 'task' }, { name: 'getInputValue', type: 'task' },
                        { name: 'image', type: 'task' }, { name: 'canvas', type: 'task', dataType: 'Canvas' },
                        { name: 'grid', type: 'task' }, { name: 'card', type: 'task' },
                        { name: 'divider', type: 'task' }, { name: 'alert', type: 'task' },
                        { name: 'prompt', type: 'task' }, { name: 'clear', type: 'task' },
                        { name: 'close', type: 'task' }
                    ];
                    const canvasScope = {
                        type: 'group',
                        name: 'Canvas',
                        startLine: i,
                        endLine: i,
                        parent: globalScope,
                        symbols: new Map(),
                        children: []
                    };
                    const canvasMethods = [
                        { name: 'rect', type: 'task' },
                        { name: 'circle', type: 'task' },
                        { name: 'line', type: 'task' },
                        { name: 'text', type: 'task' }
                    ];
                    for (const method of canvasMethods) {
                        const canvasSymbol = {
                            name: method.name,
                            type: method.type === 'task' ? 'task' : 'variable',
                            range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } }
                        };
                        canvasScope.symbols.set(method.name, canvasSymbol);
                    }
                    for (const m of windowMethods) {
                        const sym = {
                            name: m.name,
                            type: m.type === 'task' ? 'task' : 'variable',
                            range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
                        };
                        if (m.dataType) {
                            sym.dataType = m.dataType;
                        }
                        windowGroupScope.symbols.set(m.name, sym);
                    }
                    globalScope.children.push(windowGroupScope);
                    globalScope.children.push(canvasScope);
                }
                continue;
            }
            const useMatch = line.match(/^\s*use\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\s+"([^"]+)")?\s*$/);
            if (useMatch) {
                const moduleName = useMatch[1];
                const moduleSymbol = {
                    name: moduleName,
                    type: 'module',
                    range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } },
                };
                currentScope.symbols.set(moduleName, moduleSymbol);
                continue;
            }
            const isArrowBlock = /=>\s*$/.test(trimmed);
            const isBraceBlock = /\{\s*$/.test(trimmed);
            const isWindowCanvasBlock = isArrowBlock && /\bWindow[\/.]canvas\b/.test(strippedLine);
            if (/^\s*end\b/.test(trimmed)) {
                if (scopeStack.length > 1 && currentScope.type !== 'global' && currentScope.type !== 'group' && currentScope.type !== 'blueprint') {
                    currentScope.endLine = i;
                    scopeStack.pop();
                }
                continue;
            }
            if (/^\s*\}\s*$/.test(trimmed)) {
                if (scopeStack.length > 1 && (currentScope.type === 'group' || currentScope.type === 'blueprint')) {
                    currentScope.endLine = i;
                    scopeStack.pop();
                }
                continue;
            }
            let newScope = null;
            const taskMatch = isArrowBlock && line.match(/^\s*task\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
            if (taskMatch) {
                const taskName = taskMatch[1];
                const params = [];
                const withMatch = line.match(/with\s+(.+?)\s*=>/);
                if (withMatch) {
                    const paramStr = withMatch[1];
                    const paramMatches = paramStr.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)/g);
                    for (const pm of paramMatches) {
                        params.push({ type: pm[1], name: pm[2] });
                    }
                }
                const taskSymbol = { name: taskName, type: 'task', params, range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } } };
                currentScope.symbols.set(taskName, taskSymbol);
                newScope = { type: 'task', name: taskName, startLine: i, parent: currentScope, symbols: new Map(), children: [] };
                for (const param of params) {
                    const paramSymbol = { name: param.name, type: 'parameter', varType: param.type, mutable: true, range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } } };
                    newScope.symbols.set(param.name, paramSymbol);
                }
            }
            const groupMatch = isBraceBlock && line.match(/^\s*group\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
            if (groupMatch) {
                const groupName = groupMatch[1];
                const groupSymbol = { name: groupName, type: 'group', range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } } };
                currentScope.symbols.set(groupName, groupSymbol);
                newScope = { type: 'group', name: groupName, startLine: i, parent: currentScope, symbols: new Map(), children: [] };
            }
            const blueprintMatch = isBraceBlock && line.match(/^\s*blueprint\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
            if (blueprintMatch) {
                const blueprintName = blueprintMatch[1];
                const blueprintSymbol = { name: blueprintName, type: 'blueprint', range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } } };
                currentScope.symbols.set(blueprintName, blueprintSymbol);
                newScope = { type: 'blueprint', name: blueprintName, startLine: i, parent: currentScope, symbols: new Map(), children: [] };
            }
            const loopMatch = isArrowBlock && line.match(/^\s*(each|march)\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
            if (loopMatch) {
                const loopVar = loopMatch[2];
                newScope = { type: 'loop', startLine: i, parent: currentScope, symbols: new Map(), children: [] };
                const loopSymbol = { name: loopVar, type: 'loop-var', mutable: false, range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } } };
                newScope.symbols.set(loopVar, loopSymbol);
            }
            const controlFlowMatch = isArrowBlock && /^\s*(assume|maybe|otherwise|select|route)\b/.test(line);
            if (controlFlowMatch) {
                const keyword = /^\s*([a-zA-Z_]+)/.exec(line)[1];
                if (keyword === 'maybe' || keyword === 'otherwise') {
                    if (scopeStack.length > 1 && (currentScope.type === 'loop' || currentScope.type === 'lambda')) {
                        currentScope.endLine = i - 1;
                        scopeStack.pop();
                        currentScope = scopeStack[scopeStack.length - 1];
                    }
                }
                if (!line.match(/^\s*route\s+(?:GET|POST|PUT|DELETE|PATCH)?\s*"[^"]+"\s*->/)) {
                    newScope = { type: 'loop', startLine: i, parent: currentScope, symbols: new Map(), children: [] };
                }
            }
            const doMatch = isArrowBlock && line.match(/^\s*do\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+for\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
            if (doMatch) {
                const blueprintName = doMatch[1];
                const groupName = doMatch[2];
                const doScope = {
                    type: 'do-block',
                    name: `${blueprintName}:${groupName}`,
                    startLine: i,
                    parent: currentScope,
                    symbols: new Map(),
                    children: []
                };
                doScope.targetGroupName = groupName;
                const targetGroupScope = this.findScopeByName(globalScope, groupName);
                if (targetGroupScope) {
                    doScope.targetGroupScope = targetGroupScope;
                    for (const [name, symbol] of targetGroupScope.symbols.entries()) {
                        doScope.symbols.set(name, symbol);
                    }
                }
                currentScope.children.push(doScope);
                scopeStack.push(doScope);
                continue;
            }
            const varMatch = line.match(/^\s*(free|lock)\s+(?:([a-zA-Z_][a-zA-Z0-9_]*)\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/);
            if (varMatch) {
                const mutable = varMatch[1] === 'free';
                const varType = varMatch[2];
                const varName = varMatch[3];
                const symbolType = currentScope.type === 'group' ? 'field' : 'variable';
                const varSymbol = { name: varName, type: symbolType, mutable, varType, range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } } };
                currentScope.symbols.set(varName, varSymbol);
                if (/=\s*Window[\/.]canvas\b/.test(strippedLine)) {
                    if (!varSymbol.varType) {
                        varSymbol.varType = 'Canvas';
                    }
                    varSymbol.dataType = 'Canvas';
                }
            }
            if (isArrowBlock && !taskMatch && !loopMatch && !controlFlowMatch) {
                newScope = { type: 'lambda', startLine: i, parent: currentScope, symbols: new Map(), children: [] };
                if (isWindowCanvasBlock) {
                    const canvasSymbol = {
                        name: 'canvas',
                        type: 'variable',
                        mutable: false,
                        varType: 'Canvas',
                        range: { start: { line: i, character: 0 }, end: { line: i, character: line.length } }
                    };
                    newScope.symbols.set('canvas', canvasSymbol);
                }
            }
            if (newScope) {
                currentScope.children.push(newScope);
                scopeStack.push(newScope);
            }
        }
        this.documentScopes.set(document.uri.toString(), globalScope);
        this.documentPlugins.set(document.uri.toString(), plugins);
        this.linkDoBlocksToGroups(globalScope);
        return globalScope;
    }
    linkDoBlocksToGroups(rootScope) {
        const findAllDoBlocks = (scope, doBlocks = []) => {
            if (scope.type === 'do-block') {
                doBlocks.push(scope);
            }
            for (const child of scope.children) {
                findAllDoBlocks(child, doBlocks);
            }
            return doBlocks;
        };
        const doBlocks = findAllDoBlocks(rootScope);
        for (const doBlock of doBlocks) {
            const targetGroupName = doBlock.targetGroupName;
            if (targetGroupName) {
                const groupScope = this.findScopeByName(rootScope, targetGroupName);
                if (groupScope) {
                    // Add all tasks from do-block to the group scope
                    for (const [name, symbol] of doBlock.symbols.entries()) {
                        if (symbol.type === 'task') {
                            groupScope.symbols.set(name, symbol);
                        }
                    }
                }
            }
        }
    }
    findScopeAtPosition(scope, line) {
        for (const child of scope.children) {
            if (line >= child.startLine && (child.endLine === undefined || line <= child.endLine)) {
                const found = this.findScopeAtPosition(child, line);
                if (found)
                    return found;
            }
        }
        return scope;
    }
    getVisibleSymbols(scope) {
        const symbols = new Map();
        let current = scope;
        while (current) {
            for (const [name, symbol] of current.symbols.entries()) {
                if (!symbols.has(name)) {
                    symbols.set(name, symbol);
                }
            }
            current = current.parent;
        }
        return Array.from(symbols.values());
    }
    getMembersOfSymbol(symbol, rootScope) {
        if (symbol.type === 'module' && symbol.moduleScope) {
            return Array.from(symbol.moduleScope.symbols.values());
        }
        if (symbol.type === 'object' && symbol.value) {
            // This is a simplification. We might need a more robust way to handle object members.
            const members = [];
            for (const key in symbol.value) {
                members.push({ name: key, type: 'property', value: symbol.value[key], line: symbol.line, range: symbol.range });
            }
            return members;
        }
        const typeName = symbol.dataType || symbol.varType;
        if (typeName) {
            const groupOrBlueprintScope = this.findScopeByName(rootScope, typeName);
            if (groupOrBlueprintScope) {
                return Array.from(groupOrBlueprintScope.symbols.values());
            }
        }
        return [];
    }
    findScopeByName(scope, name) {
        if ((scope.type === 'group' || scope.type === 'blueprint') && scope.name === name) {
            return scope;
        }
        for (const child of scope.children) {
            const found = this.findScopeByName(child, name);
            if (found) {
                return found;
            }
        }
        return undefined;
    }
    validateFileImports(document, lines, diagnostics) {
        // Placeholder for import validation logic
    }
    validateBlockStructure(lines) {
        const diagnostics = [];
        const blockStack = [];
        const openers = [
            { type: 'task', regex: /^\s*task\b.*=\>\s*$/, closer: 'end' },
            { type: 'group', regex: /^\s*group\b.*\{\s*$/, closer: '}' },
            { type: 'blueprint', regex: /^\s*blueprint\b.*\{\s*$/, closer: '}' },
            { type: 'loop', regex: /^\s*(each|march)\b.*=\>\s*$/, closer: 'end' },
            { type: 'assume', regex: /^\s*assume\b.*=\>\s*$/, closer: 'end' },
            { type: 'select', regex: /^\s*select\b.*=\>\s*$/, closer: 'end' },
            { type: 'route', regex: /^\s*route\b(?!.*-\>).*=\>\s*$/, closer: 'end' },
            { type: 'do', regex: /^\s*do\b.*=\>\s*$/, closer: 'end' }
        ];
        for (let i = 0; i < lines.length; i++) {
            const rawLine = lines[i];
            let trimmed = rawLine.trim();
            if (trimmed === '' || trimmed.startsWith('#')) {
                continue;
            }
            const hashIndex = trimmed.indexOf('#');
            if (hashIndex !== -1) {
                trimmed = trimmed.slice(0, hashIndex).trim();
            }
            if (trimmed === '') {
                continue;
            }
            if (/^\s*end\b/.test(trimmed)) {
                if (blockStack.length === 0) {
                    diagnostics.push({
                        severity: node_1.DiagnosticSeverity.Error,
                        range: { start: { line: i, character: 0 }, end: { line: i, character: rawLine.length } },
                        message: "Unexpected 'end' keyword.",
                        source: 'flick'
                    });
                }
                else {
                    const last = blockStack.pop();
                    if (last.closer !== 'end') {
                        diagnostics.push({
                            severity: node_1.DiagnosticSeverity.Error,
                            range: { start: { line: i, character: 0 }, end: { line: i, character: rawLine.length } },
                            message: `Unexpected 'end'. Expected '${last.closer}' to close '${last.opener}' block opened on line ${last.line + 1}.`,
                            source: 'flick'
                        });
                    }
                }
                continue;
            }
            if (/^\s*\}\s*$/.test(trimmed)) {
                if (blockStack.length === 0) {
                    diagnostics.push({
                        severity: node_1.DiagnosticSeverity.Error,
                        range: { start: { line: i, character: 0 }, end: { line: i, character: rawLine.length } },
                        message: "Unexpected '}' keyword.",
                        source: 'flick'
                    });
                }
                else {
                    const last = blockStack.pop();
                    if (last.closer !== '}') {
                        diagnostics.push({
                            severity: node_1.DiagnosticSeverity.Error,
                            range: { start: { line: i, character: 0 }, end: { line: i, character: rawLine.length } },
                            message: `Unexpected '}'. Expected '${last.closer}' to close '${last.opener}' block opened on line ${last.line + 1}.`,
                            source: 'flick'
                        });
                    }
                }
                continue;
            }
            const branchMatch = trimmed.match(/^\s*(maybe|otherwise)\b.*=\>\s*$/);
            if (branchMatch) {
                const last = blockStack[blockStack.length - 1];
                if (!last || (last.type !== 'assume' && last.type !== 'select' && last.type !== 'route')) {
                    diagnostics.push({
                        severity: node_1.DiagnosticSeverity.Error,
                        range: { start: { line: i, character: 0 }, end: { line: i, character: rawLine.length } },
                        message: `'${branchMatch[1]}' without a matching control block.`,
                        source: 'flick'
                    });
                }
                continue;
            }
            let matched = false;
            for (const opener of openers) {
                if (opener.regex.test(trimmed)) {
                    const openerWord = trimmed.match(/^\s*([a-zA-Z_]+)/)?.[1] ?? opener.type;
                    blockStack.push({ type: opener.type, line: i, closer: opener.closer, opener: openerWord });
                    matched = true;
                    break;
                }
            }
            if (matched) {
                continue;
            }
            if (/=\>\s*$/.test(trimmed)) {
                blockStack.push({ type: 'lambda', line: i, closer: 'end', opener: 'lambda' });
            }
        }
        for (const block of blockStack) {
            diagnostics.push({
                severity: node_1.DiagnosticSeverity.Error,
                range: { start: { line: block.line, character: 0 }, end: { line: block.line, character: lines[block.line].length } },
                message: `Unclosed '${block.opener}' block. Expected '${block.closer}'.`,
                source: 'flick'
            });
        }
        return diagnostics;
    }
    async validateTextDocument(textDocument) {
        const settings = await this.getDocumentSettings(textDocument.uri);
        const text = textDocument.getText();
        const lines = text.split('\n');
        // Clear previous scopes
        this.documentScopes.delete(textDocument.uri.toString());
        // Build scope tree
        const rootScope = this.buildScopeTree(textDocument);
        // Validate imports
        const diagnostics = [];
        this.validateFileImports(textDocument, lines, diagnostics);
        // Collect diagnostics from scope analysis
        const scopeDiagnostics = this.validateDocument(textDocument);
        diagnostics.push(...scopeDiagnostics);
        // Send diagnostics to client
        this.connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
    }
    clearCache(uri) {
        this.documentScopes.delete(uri);
        this.documentPlugins.delete(uri);
    }
}
exports.FlickLanguageServer = FlickLanguageServer;
new FlickLanguageServer();
//# sourceMappingURL=languageServer.js.map