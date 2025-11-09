import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

// Advanced symbol tracking with proper scoping
interface FlickSymbol {
    name: string;
    type: 'variable' | 'task' | 'group' | 'blueprint' | 'parameter' | 'loop-var' | 'field' | 'plugin' | 'module' | 'route-builtin';
    mutable?: boolean;
    varType?: string;
    params?: Array<{ name: string; type: string }>;
    range: vscode.Range;
}

interface Scope {
    type: 'global' | 'group' | 'task' | 'loop' | 'do-block' | 'blueprint' | 'route';
    name?: string;
    startLine: number;
    endLine?: number;
    parent?: Scope;
    children: Scope[];
    symbols: Map<string, FlickSymbol>;
}

interface PluginDeclaration {
    name: string;
    argument?: string | number;
    line: number;
}

// Plugin-specific keywords and functions
const WEB_PLUGIN_KEYWORDS = new Set(['route', 'respond', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH']);
const WEB_ROUTE_ONLY_KEYWORDS = new Set(['query', 'body', 'headers', 'req']);
const FILE_PLUGIN_KEYWORDS = new Set(['read', 'write', 'exists', 'listdir']);
const TIME_PLUGIN_KEYWORDS = new Set(['now', 'timestamp', 'sleep']);

const NAMED_PARAM_CONTEXTS = new Set(['respond']); // Contexts where named params like json=, status= are valid

export class FlickLanguageServer {
    private documentScopes: Map<string, Scope> = new Map();
    private documentPlugins: Map<string, PluginDeclaration[]> = new Map();

    public provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.CompletionItem[] {
        const rootScope = this.buildScopeTree(document);
        const currentScope = this.findScopeAtPosition(rootScope, position.line);
        const completions: vscode.CompletionItem[] = [];

        // Check if we're in a member access context (after / or .)
        const line = document.lineAt(position.line).text;
        const textBeforeCursor = line.substring(0, position.character);
        const memberAccessMatch = textBeforeCursor.match(/([a-zA-Z_][a-zA-Z0-9_]*)\s*[/.]\s*([a-zA-Z_][a-zA-Z0-9_]*)?$/);
        
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
                    
                    const item = new vscode.CompletionItem(member.name);
                    if (member.type === 'task') {
                        item.kind = vscode.CompletionItemKind.Method;
                        item.detail = `task ${member.name}`;
                        if (member.params) {
                            item.detail += ` with ${member.params.map((p: { type: string; name: string }) => `${p.type}(${p.name})`).join(', ')}`;
                        }
                    } else {
                        item.kind = vscode.CompletionItemKind.Property;
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
            const item = new vscode.CompletionItem(symbol.name);
            
            switch (symbol.type) {
                case 'task':
                    item.kind = vscode.CompletionItemKind.Function;
                    item.detail = `task ${symbol.name}`;
                    if (symbol.params) {
                        item.detail += ` with ${symbol.params.map(p => `${p.type}(${p.name})`).join(', ')}`;
                    }
                    break;
                case 'variable':
                case 'parameter':
                case 'loop-var':
                case 'field':
                    item.kind = vscode.CompletionItemKind.Variable;
                    const prefix = symbol.mutable ? 'free' : 'lock';
                    item.detail = `${prefix} ${symbol.varType || ''} ${symbol.name}`;
                    break;
                case 'group':
                    item.kind = vscode.CompletionItemKind.Class;
                    item.detail = `group ${symbol.name}`;
                    break;
                case 'blueprint':
                    item.kind = vscode.CompletionItemKind.Interface;
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
            const item = new vscode.CompletionItem(keyword);
            item.kind = vscode.CompletionItemKind.Keyword;
            completions.push(item);
        }

        // Add built-ins
        const builtins = [
            { name: 'num', kind: vscode.CompletionItemKind.TypeParameter },
            { name: 'literal', kind: vscode.CompletionItemKind.TypeParameter },
            { name: 'yes', kind: vscode.CompletionItemKind.Constant },
            { name: 'no', kind: vscode.CompletionItemKind.Constant },
            { name: 'JSON', kind: vscode.CompletionItemKind.Module },
        ];

        for (const builtin of builtins) {
            const item = new vscode.CompletionItem(builtin.name);
            item.kind = builtin.kind;
            completions.push(item);
        }

        return completions;
    }

    public provideHover(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.Hover | null {
        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) return null;

        const word = document.getText(wordRange);
        const rootScope = this.buildScopeTree(document);
        const currentScope = this.findScopeAtPosition(rootScope, position.line);
        const visibleSymbols = this.getVisibleSymbols(currentScope);
        
        const symbol = visibleSymbols.find(s => s.name === word);
        if (!symbol) return null;

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
                } else if (symbol.type === 'loop-var') {
                    markdown += `\n\n_(loop variable)_`;
                } else if (symbol.type === 'field') {
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

        return new vscode.Hover(new vscode.MarkdownString(markdown));
    }

    public validateDocument(document: vscode.TextDocument): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];
        const rootScope = this.buildScopeTree(document);
        const plugins = this.documentPlugins.get(document.uri.toString()) || [];
        const text = document.getText();
        const lines = text.split('\n');

        // Validate file imports (use and import statements)
        this.validateFileImports(document, lines, diagnostics);

        // Build set of plugin keywords available
        const pluginKeywords = new Set<string>();
        for (const plugin of plugins) {
            if (plugin.name === 'web') {
                WEB_PLUGIN_KEYWORDS.forEach(k => pluginKeywords.add(k));
            } else if (plugin.name === 'files') {
                FILE_PLUGIN_KEYWORDS.forEach(k => pluginKeywords.add(k));
            } else if (plugin.name === 'time') {
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

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            
            if (trimmed.startsWith('#')) continue;
            
            const currentScope = this.findScopeAtPosition(rootScope, i);
            
            // Skip validation inside blueprint blocks (signatures only)
            if (currentScope.type === 'blueprint') continue;

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
                
                if (keywords.has(identifier)) continue;
                if (visibleNames.has(identifier)) continue;
                
                // Check if it's being defined on this line
                const lineUpToIdentifier = withoutStrings.substring(0, column);
                
                // Skip if it's a declaration
                if (/(free|lock|task|group|blueprint)\s+$/.test(lineUpToIdentifier)) continue;
                if (/\b(with|each|march)\s+$/.test(lineUpToIdentifier)) continue;
                if (/^\s*do\s+[a-zA-Z_][a-zA-Z0-9_]*\s+for\s+$/.test(lineUpToIdentifier)) continue;
                if (/^\s*declare\s+$/.test(lineUpToIdentifier)) continue;
                if (/^\s*declare\s+[a-zA-Z_][a-zA-Z0-9_]*@$/.test(lineUpToIdentifier)) continue; // Skip @argument
                if (/^\s*use\s+$/.test(lineUpToIdentifier)) continue;
                
                // Skip type annotations
                if (/\b(num|literal|[A-Z][a-zA-Z0-9_]*)\s*$/.test(lineUpToIdentifier) && /^\s*\(/.test(withoutStrings.substring(column + identifier.length))) {
                    continue;
                }

                // Skip type annotations in variable declarations (free Type name)
                if (/(free|lock)\s+$/.test(lineUpToIdentifier)) continue;

                // Skip named parameters (json=, status=, etc.)
                const afterIdentifier = withoutStrings.substring(column + identifier.length);
                if (/^\s*=/.test(afterIdentifier) && !/^\s*==/.test(afterIdentifier)) {
                    // Check if we're in a context that allows named params
                    if (/\b(respond)\s+.*$/.test(lineUpToIdentifier)) {
                        continue;
                    }
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
                                const range = new vscode.Range(i, column, i, column + identifier.length);
                                const typeName = objectSymbol.varType || objectSymbol.name;
                                diagnostics.push(new vscode.Diagnostic(
                                    range,
                                    `Property or method '${identifier}' does not exist on type '${typeName}'`,
                                    vscode.DiagnosticSeverity.Error
                                ));
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
                        const range = new vscode.Range(i, column, i, column + identifier.length);
                        diagnostics.push(new vscode.Diagnostic(
                            range,
                            `'${identifier}' can only be used inside route blocks`,
                            vscode.DiagnosticSeverity.Error
                        ));
                        continue;
                    } else {
                        // It's in a route block, so it's valid
                        continue;
                    }
                }

                // Validate route forwarding
                if (/^\s*route\s+(?:GET|POST|PUT|DELETE|PATCH)?\s*"[^"]+"\s*->\s*$/.test(lineUpToIdentifier)) {
                    // This is a module being forwarded to
                    const moduleSymbol = visibleSymbols.find(s => s.name === identifier && s.type === 'module');
                    if (!moduleSymbol) {
                        const range = new vscode.Range(i, column, i, column + identifier.length);
                        diagnostics.push(new vscode.Diagnostic(
                            range,
                            `Module '${identifier}' is not imported. Use 'use ${identifier}' to import it.`,
                            vscode.DiagnosticSeverity.Error
                        ));
                    }
                    continue;
                }

                const range = new vscode.Range(i, column, i, column + identifier.length);
                diagnostics.push(new vscode.Diagnostic(
                    range,
                    `Variable '${identifier}' is used outside its scope or is undefined`,
                    vscode.DiagnosticSeverity.Error
                ));
            }
        }

        // Check for unclosed blocks
        diagnostics.push(...this.validateBlockStructure(lines));

        return diagnostics;
    }

    private buildScopeTree(document: vscode.TextDocument): Scope {
        const cached = this.documentScopes.get(document.uri.toString());
        if (cached) return cached;

        const text = document.getText();
        const lines = text.split('\n');

        const globalScope: Scope = {
            type: 'global',
            startLine: 0,
            endLine: lines.length - 1,
            symbols: new Map(),
            children: []
        };

        const scopeStack: Scope[] = [globalScope];
        let currentScope = globalScope;
        const plugins: PluginDeclaration[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            if (trimmed.startsWith('#')) continue;

            // Parse declare statements (plugins)
            const declareMatch = line.match(/^\s*declare\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:@([a-zA-Z0-9_]+))?\s*$/);
            if (declareMatch) {
                const pluginName = declareMatch[1];
                const argument = declareMatch[2];
                plugins.push({ name: pluginName, argument, line: i });
                
                // Add plugin as a symbol
                const pluginSymbol: FlickSymbol = {
                    name: pluginName,
                    type: 'plugin',
                    range: new vscode.Range(i, 0, i, line.length),
                };
                globalScope.symbols.set(pluginName, pluginSymbol);
                continue;
            }

            // Parse use statements (Flick imports)
            const useMatch = line.match(/^\s*use\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\s+"([^"]+)")?\s*$/);
            if (useMatch) {
                const moduleName = useMatch[1];
                const modulePath = useMatch[2];
                
                // Add imported module as a symbol
                const moduleSymbol: FlickSymbol = {
                    name: moduleName,
                    type: 'module',
                    range: new vscode.Range(i, 0, i, line.length),
                };
                globalScope.symbols.set(moduleName, moduleSymbol);
                continue;
            }

            // Route statements (create route scope with built-in variables)
            if (/^\s*route\b/.test(line)) {
                // Check for forwarding syntax: route "/path" -> Module
                const forwardMatch = line.match(/^\s*route\s+(?:GET|POST|PUT|DELETE|PATCH)?\s*"[^"]+"\s*->\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*$/);
                if (forwardMatch) {
                    // Route forwarding - just continue, no scope needed
                    continue;
                }
                
                // Regular route with =>
                if (/=>\s*$/.test(trimmed)) {
                    const routeScope: Scope = {
                        type: 'route',
                        startLine: i,
                        parent: currentScope,
                        symbols: new Map(),
                        children: []
                    };
                    
                    // Add route-only built-in variables if web plugin is declared
                    if (plugins.some(p => p.name === 'web')) {
                        for (const keyword of WEB_ROUTE_ONLY_KEYWORDS) {
                            const builtinSymbol: FlickSymbol = {
                                name: keyword,
                                type: 'route-builtin',
                                mutable: false,
                                range: new vscode.Range(i, 0, i, line.length),
                            };
                            routeScope.symbols.set(keyword, builtinSymbol);
                        }
                    }
                    
                    currentScope.children.push(routeScope);
                    scopeStack.push(routeScope);
                    currentScope = routeScope;
                    continue;
                }
            }

            // Group declaration
            const groupMatch = line.match(/^\s*group\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\{/);
            if (groupMatch) {
                const groupName = groupMatch[1];
                const groupSymbol: FlickSymbol = {
                    name: groupName,
                    type: 'group',
                    range: new vscode.Range(i, 0, i, line.length),
                };
                currentScope.symbols.set(groupName, groupSymbol);

                const groupScope: Scope = {
                    type: 'group',
                    name: groupName,
                    startLine: i,
                    parent: currentScope,
                    symbols: new Map(),
                    children: []
                };
                currentScope.children.push(groupScope);
                scopeStack.push(groupScope);
                currentScope = groupScope;
                continue;
            }

            // Blueprint declaration
            const blueprintMatch = line.match(/^\s*blueprint\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\{/);
            if (blueprintMatch) {
                const blueprintName = blueprintMatch[1];
                const blueprintSymbol: FlickSymbol = {
                    name: blueprintName,
                    type: 'blueprint',
                    range: new vscode.Range(i, 0, i, line.length),
                };
                currentScope.symbols.set(blueprintName, blueprintSymbol);

                const blueprintScope: Scope = {
                    type: 'blueprint',
                    name: blueprintName,
                    startLine: i,
                    parent: currentScope,
                    symbols: new Map(),
                    children: []
                };
                currentScope.children.push(blueprintScope);
                scopeStack.push(blueprintScope);
                currentScope = blueprintScope;
                continue;
            }

            // Do implementation
            const doMatch = line.match(/^\s*do\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+for\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=>/);
            if (doMatch) {
                const blueprintName = doMatch[1];
                const groupName = doMatch[2];
                
                const doScope: Scope = {
                    type: 'do-block',
                    name: `${blueprintName}:${groupName}`,
                    startLine: i,
                    parent: currentScope,
                    symbols: new Map(),
                    children: []
                };
                
                // Store reference to the group scope so we can add methods to it later
                (doScope as any).targetGroupName = groupName;
                
                // Inherit fields and methods from the group being extended
                // We need to find the group scope in the tree
                const findGroupScope = (root: Scope): Scope | undefined => {
                    // Check if this scope is the group we're looking for
                    if (root.type === 'group' && root.name === groupName) {
                        return root;
                    }
                    // Search children
                    for (const child of root.children) {
                        const found = findGroupScope(child);
                        if (found) return found;
                    }
                    return undefined;
                };
                
                const groupScope = findGroupScope(globalScope);
                if (groupScope) {
                    // Copy all fields and tasks from the group
                    for (const [name, symbol] of groupScope.symbols.entries()) {
                        if (symbol.type === 'field' || symbol.type === 'task') {
                            doScope.symbols.set(name, symbol);
                        }
                    }
                    
                    // Store reference to group scope for adding tasks later
                    (doScope as any).targetGroupScope = groupScope;
                }
                
                currentScope.children.push(doScope);
                scopeStack.push(doScope);
                currentScope = doScope;
                continue;
            }

            // Task declaration
            const taskMatch = line.match(/^\s*task\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
            if (taskMatch && /=>\s*$/.test(trimmed)) {
                const taskName = taskMatch[1];
                const params: Array<{ name: string; type: string }> = [];
                
                const withMatch = line.match(/with\s+(.+?)\s*=>/);
                if (withMatch) {
                    const paramStr = withMatch[1];
                    const paramMatches = paramStr.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)/g);
                    for (const pm of paramMatches) {
                        params.push({ type: pm[1], name: pm[2] });
                    }
                }
                
                const taskSymbol: FlickSymbol = {
                    name: taskName,
                    type: 'task',
                    params,
                    range: new vscode.Range(i, 0, i, line.length),
                };
                currentScope.symbols.set(taskName, taskSymbol);

                const taskScope: Scope = {
                    type: 'task',
                    name: taskName,
                    startLine: i,
                    parent: currentScope,
                    symbols: new Map(),
                    children: []
                };
                
                // Add parameters to task scope
                for (const param of params) {
                    const paramSymbol: FlickSymbol = {
                        name: param.name,
                        type: 'parameter',
                        varType: param.type,
                        mutable: true,
                        range: new vscode.Range(i, 0, i, line.length),
                    };
                    taskScope.symbols.set(param.name, paramSymbol);
                }
                
                currentScope.children.push(taskScope);
                scopeStack.push(taskScope);
                currentScope = taskScope;
                continue;
            }

            // Each loop
            const eachMatch = line.match(/^\s*each\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+in/);
            if (eachMatch && /=>\s*$/.test(trimmed)) {
                const loopVar = eachMatch[1];
                const loopScope: Scope = {
                    type: 'loop',
                    startLine: i,
                    parent: currentScope,
                    symbols: new Map(),
                    children: []
                };
                
                const loopSymbol: FlickSymbol = {
                    name: loopVar,
                    type: 'loop-var',
                    mutable: false,
                    range: new vscode.Range(i, 0, i, line.length),
                };
                loopScope.symbols.set(loopVar, loopSymbol);
                
                currentScope.children.push(loopScope);
                scopeStack.push(loopScope);
                currentScope = loopScope;
                continue;
            }

            // March loop
            const marchMatch = line.match(/^\s*march\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+from/);
            if (marchMatch && /=>\s*$/.test(trimmed)) {
                const loopVar = marchMatch[1];
                const loopScope: Scope = {
                    type: 'loop',
                    startLine: i,
                    parent: currentScope,
                    symbols: new Map(),
                    children: []
                };
                
                const loopSymbol: FlickSymbol = {
                    name: loopVar,
                    type: 'loop-var',
                    mutable: false,
                    range: new vscode.Range(i, 0, i, line.length),
                };
                loopScope.symbols.set(loopVar, loopSymbol);
                
                currentScope.children.push(loopScope);
                scopeStack.push(loopScope);
                currentScope = loopScope;
                continue;
            }

            // Assume (if) statements
            if (/^\s*assume\b/.test(line) && /=>\s*$/.test(trimmed)) {
                const assumeScope: Scope = {
                    type: 'loop', // Use 'loop' type for simple control flow scopes
                    startLine: i,
                    parent: currentScope,
                    symbols: new Map(),
                    children: []
                };
                currentScope.children.push(assumeScope);
                scopeStack.push(assumeScope);
                currentScope = assumeScope;
                continue;
            }

            // Maybe (else-if) - continues the assume block
            if (/^\s*maybe\b/.test(line) && /=>\s*$/.test(trimmed)) {
                // Close previous branch, open new one at same level
                if (scopeStack.length > 1 && currentScope.parent) {
                    currentScope.endLine = i - 1;
                    scopeStack.pop();
                    currentScope = scopeStack[scopeStack.length - 1];
                }
                const maybeScope: Scope = {
                    type: 'loop',
                    startLine: i,
                    parent: currentScope,
                    symbols: new Map(),
                    children: []
                };
                currentScope.children.push(maybeScope);
                scopeStack.push(maybeScope);
                currentScope = maybeScope;
                continue;
            }

            // Otherwise (else)
            if (/^\s*otherwise\b/.test(line) && /=>\s*$/.test(trimmed)) {
                // Close previous branch, open new one at same level
                if (scopeStack.length > 1 && currentScope.parent) {
                    currentScope.endLine = i - 1;
                    scopeStack.pop();
                    currentScope = scopeStack[scopeStack.length - 1];
                }
                const otherwiseScope: Scope = {
                    type: 'loop',
                    startLine: i,
                    parent: currentScope,
                    symbols: new Map(),
                    children: []
                };
                currentScope.children.push(otherwiseScope);
                scopeStack.push(otherwiseScope);
                currentScope = otherwiseScope;
                continue;
            }

            // Select (switch) statements
            if (/^\s*select\b/.test(line) && /=>\s*$/.test(trimmed)) {
                const selectScope: Scope = {
                    type: 'loop',
                    startLine: i,
                    parent: currentScope,
                    symbols: new Map(),
                    children: []
                };
                currentScope.children.push(selectScope);
                scopeStack.push(selectScope);
                currentScope = selectScope;
                continue;
            }

            // Route statements
            if (/^\s*route\b/.test(line) && /=>\s*$/.test(trimmed)) {
                const routeScope: Scope = {
                    type: 'loop',
                    startLine: i,
                    parent: currentScope,
                    symbols: new Map(),
                    children: []
                };
                currentScope.children.push(routeScope);
                scopeStack.push(routeScope);
                currentScope = routeScope;
                continue;
            }

            // Variable declaration
            const varMatch = line.match(/^\s*(free|lock)\s+(?:([a-zA-Z_][a-zA-Z0-9_]*)\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/);
            if (varMatch) {
                const mutable = varMatch[1] === 'free';
                const varType = varMatch[2];
                const varName = varMatch[3];
                
                const symbolType = currentScope.type === 'group' ? 'field' : 'variable';
                const varSymbol: FlickSymbol = {
                    name: varName,
                    type: symbolType,
                    mutable,
                    varType,
                    range: new vscode.Range(i, 0, i, line.length),
                };
                currentScope.symbols.set(varName, varSymbol);
            }

            // Closing braces
            if (/^\s*\}/.test(line)) {
                if (scopeStack.length > 1 && (currentScope.type === 'group' || currentScope.type === 'blueprint')) {
                    currentScope.endLine = i;
                    scopeStack.pop();
                    currentScope = scopeStack[scopeStack.length - 1];
                }
            }

            // End keyword
            if (/^\s*end\b/.test(line)) {
                if (scopeStack.length > 1 && currentScope.type !== 'group' && currentScope.type !== 'blueprint') {
                    currentScope.endLine = i;
                    scopeStack.pop();
                    currentScope = scopeStack[scopeStack.length - 1];
                }
            }
        }

        this.documentScopes.set(document.uri.toString(), globalScope);
        this.documentPlugins.set(document.uri.toString(), plugins);
        
        // Second pass: Add do-block tasks to their target group scopes
        // This is necessary because do-blocks come after groups in the file
        this.linkDoBlocksToGroups(globalScope);
        
        return globalScope;
    }

    private linkDoBlocksToGroups(rootScope: Scope): void {
        const findAllDoBlocks = (scope: Scope, doBlocks: Scope[] = []): Scope[] => {
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
            const targetGroupName = (doBlock as any).targetGroupName as string;
            if (targetGroupName) {
                const groupScope = this.findGroupByName(rootScope, targetGroupName);
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

    private findScopeAtPosition(scope: Scope, line: number): Scope {
        if (line < scope.startLine || (scope.endLine !== undefined && line > scope.endLine)) {
            return scope;
        }

        for (const child of scope.children) {
            if (line >= child.startLine && (child.endLine === undefined || line <= child.endLine)) {
                return this.findScopeAtPosition(child, line);
            }
        }

        return scope;
    }

    private getVisibleSymbols(scope: Scope): FlickSymbol[] {
        const visible: FlickSymbol[] = [];
        const seen = new Set<string>();
        let current: Scope | undefined = scope;
        
        while (current) {
            for (const [name, symbol] of current.symbols.entries()) {
                // Skip if we've already seen this symbol name
                if (seen.has(name)) continue;
                seen.add(name);
                
                // Fields are visible in:
                // 1. The group itself
                // 2. Tasks that are direct children of the group
                // 3. Do-blocks implementing for that group (inherited)
                if (symbol.type === 'field') {
                    // If we're in a do-block, fields are inherited automatically
                    if (scope.type === 'do-block' || 
                        (scope.type === 'task' && scope.parent?.type === 'do-block')) {
                        visible.push(symbol);
                        continue;
                    }
                    
                    // If we're in a group task, check if it's a method of the group that owns the field
                    if (scope.type === 'task' && scope.parent?.type === 'group') {
                        if (scope.parent === current) {
                            visible.push(symbol);
                        }
                        continue;
                    }
                    
                    // If we're directly in the group scope
                    if (scope === current && current.type === 'group') {
                        visible.push(symbol);
                        continue;
                    }
                    
                    // Otherwise, skip this field
                    continue;
                }
                
                // All other symbol types are visible normally
                visible.push(symbol);
            }
            current = current.parent;
        }
        
        return visible;
    }

    private validateBlockStructure(lines: string[]): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];
        const blockStack: Array<{ type: string; line: number; usesBraces: boolean }> = [];
        
        const blockStarters = new Set(['task', 'assume', 'each', 'march', 'select', 'route', 'do']);
        const braceBlocks = new Set(['group', 'blueprint']);

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            
            if (trimmed.startsWith('#')) continue;
            
            // Brace blocks
            for (const braceBlock of braceBlocks) {
                const pattern = new RegExp(`^\\s*${braceBlock}\\s+[a-zA-Z_][a-zA-Z0-9_]*\\s*\\{`);
                if (pattern.test(line)) {
                    blockStack.push({ type: braceBlock, line: i, usesBraces: true });
                }
            }

            if (/^\s*\}/.test(line)) {
                if (blockStack.length > 0 && blockStack[blockStack.length - 1].usesBraces) {
                    blockStack.pop();
                }
            }

            // Arrow blocks (need 'end')
            for (const starter of blockStarters) {
                const blockPattern = new RegExp(`^\\s*${starter}\\b`);
                if (blockPattern.test(line) && /=>\s*$/.test(trimmed)) {
                    blockStack.push({ type: starter, line: i, usesBraces: false });
                }
            }

            if (/^\s*end\b/.test(line)) {
                if (blockStack.length === 0) {
                    diagnostics.push(new vscode.Diagnostic(
                        new vscode.Range(i, 0, i, line.length),
                        "Unexpected 'end' statement - no matching block to close",
                        vscode.DiagnosticSeverity.Error
                    ));
                } else {
                    const popped = blockStack.pop();
                    if (popped && popped.usesBraces) {
                        diagnostics.push(new vscode.Diagnostic(
                            new vscode.Range(i, 0, i, line.length),
                            `'${popped.type}' blocks use braces {}, not 'end'`,
                            vscode.DiagnosticSeverity.Error
                        ));
                    }
                }
            }
        }

        for (const block of blockStack) {
            diagnostics.push(new vscode.Diagnostic(
                new vscode.Range(block.line, 0, block.line, lines[block.line].length),
                block.usesBraces 
                    ? `Missing closing brace '}' for '${block.type}' block`
                    : `Missing 'end' statement for '${block.type}' block`,
                vscode.DiagnosticSeverity.Error
            ));
        }

        return diagnostics;
    }

    private getMembersOfSymbol(symbol: FlickSymbol, rootScope: Scope): FlickSymbol[] {
        const members: FlickSymbol[] = [];
        
        // If it's a group type variable, find the group scope and get its members
        if (symbol.varType) {
            const groupScope = this.findGroupByName(rootScope, symbol.varType);
            if (groupScope) {
                // Return all fields and methods from the group
                // This automatically includes do-block implementations since they're added to the group scope
                for (const [name, member] of groupScope.symbols.entries()) {
                    if (member.type === 'field' || member.type === 'task') {
                        members.push(member);
                    }
                }
            }
        }
        
        // If it's a group constructor itself, also return its members
        if (symbol.type === 'group') {
            const groupScope = this.findGroupByName(rootScope, symbol.name);
            if (groupScope) {
                for (const [name, member] of groupScope.symbols.entries()) {
                    if (member.type === 'field' || member.type === 'task') {
                        members.push(member);
                    }
                }
            }
        }
        
        return members;
    }

    private findGroupByName(scope: Scope, name: string): Scope | undefined {
        if (scope.type === 'group' && scope.name === name) {
            return scope;
        }
        for (const child of scope.children) {
            const found = this.findGroupByName(child, name);
            if (found) return found;
        }
        return undefined;
    }

    private validateFileImports(
        document: vscode.TextDocument,
        lines: string[],
        diagnostics: vscode.Diagnostic[]
    ): void {
        const documentDir = path.dirname(document.uri.fsPath);

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // Validate 'use' statements (Flick imports)
            const useMatch = line.match(/^\s*use\s+([a-zA-Z_][a-zA-Z0-9_]*)(?:\s+"([^"]+)")?\s*$/);
            if (useMatch) {
                const moduleName = useMatch[1];
                const explicitPath = useMatch[2];
                
                let filePath: string;
                if (explicitPath) {
                    // Explicit path provided
                    filePath = path.resolve(documentDir, explicitPath);
                } else {
                    // Infer from name (same directory, name.fk)
                    filePath = path.join(documentDir, `${moduleName}.fk`);
                }

                // Check if file exists
                if (!fs.existsSync(filePath)) {
                    const range = new vscode.Range(i, 0, i, line.length);
                    const message = explicitPath
                        ? `Cannot find Flick module '${explicitPath}'`
                        : `Cannot find Flick module '${moduleName}.fk' in current directory`;
                    diagnostics.push(new vscode.Diagnostic(
                        range,
                        message,
                        vscode.DiagnosticSeverity.Error
                    ));
                }
                continue;
            }

            // Validate 'import' statements (JS/TS imports)
            const importMatch = line.match(/^\s*import\s+(.+?)\s+from\s+"([^"]+)"\s*$/);
            if (importMatch) {
                const modulePath = importMatch[2];
                
                // Only validate relative imports (starting with ./ or ../)
                if (modulePath.startsWith('.')) {
                    let fullPath = path.resolve(documentDir, modulePath);
                    
                    // Try common extensions if no extension provided
                    const extensions = ['', '.js', '.ts', '.mjs', '.cjs'];
                    let found = false;
                    
                    for (const ext of extensions) {
                        const testPath = fullPath + ext;
                        if (fs.existsSync(testPath)) {
                            found = true;
                            break;
                        }
                    }
                    
                    if (!found) {
                        const range = new vscode.Range(i, 0, i, line.length);
                        diagnostics.push(new vscode.Diagnostic(
                            range,
                            `Cannot find module '${modulePath}'`,
                            vscode.DiagnosticSeverity.Error
                        ));
                    }
                }
                // For non-relative imports (packages), we don't validate since they might be in node_modules
                continue;
            }
        }
    }

    public clearCache(uri: vscode.Uri): void {
        this.documentScopes.delete(uri.toString());
        this.documentPlugins.delete(uri.toString());
    }
}
