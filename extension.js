const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

const logChannel = vscode.window.createOutputChannel("GreyHack ImportMgr Debug");

function log(msg) {
    logChannel.appendLine(`[${new Date().toLocaleTimeString()}]${msg}`);
}

function expandPlaceholders(input) {
    const wsf = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
    let result = input.replace(/\$\{workspaceFolder\}/g, wsf);
    result = result.replace(/\$\{env:([^}]+)\}/g, (match, envVar) => {
        return process.env[envVar] || match;
    });
    return result;
}

function findExistingFileIgnoreCase(filePath) {
    if (fs.existsSync(filePath)) return filePath;
    
    const dir = path.dirname(filePath);
    const base = path.basename(filePath);
    if (!fs.existsSync(dir)) return null;

    try {
        const files = fs.readdirSync(dir);
        const found = files.find(f => f.toLowerCase() === base.toLowerCase());
        if (found) {
            return path.join(dir, found);
        }
    } catch (e) {}
    
    return null;
}

function mapGamePathToFs(importPath) {
    const cfg = vscode.workspace.getConfiguration("greyhack");
    const mappings = cfg.get("importMappings") || [];
    const wsf = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
    if (!wsf) return null;

    const lowerImportPath = importPath.toLowerCase();

    for (const m of mappings) {
        let gameRoot = expandPlaceholders(m.gameRoot || "").toLowerCase();
        if (!gameRoot) continue;
        
        if (lowerImportPath.startsWith(gameRoot)) {
            const rel = importPath.substring(gameRoot.length);
            const vsRoot = expandPlaceholders(m.vscodeRoot || "");
            let candidate = path.normalize(path.join(vsRoot, rel));
            
            let resolved = findExistingFileIgnoreCase(candidate);
            if (resolved) return resolved;
            
            resolved = findExistingFileIgnoreCase(candidate + ".src");
            if (resolved) return resolved;
            
            resolved = findExistingFileIgnoreCase(candidate + ".gh");
            if (resolved) return resolved;

            const relNoSlash = rel.startsWith('/') || rel.startsWith('\\') ? rel.substring(1) : rel;
            candidate = path.normalize(path.join(vsRoot, relNoSlash));
            
            resolved = findExistingFileIgnoreCase(candidate);
            if (resolved) return resolved;
            
            resolved = findExistingFileIgnoreCase(candidate + ".src");
            if (resolved) return resolved;
        }
    }

    const currentWorkspaceName = path.basename(wsf); 
    const lowerWorkspaceName = currentWorkspaceName.toLowerCase();
    const projSearch = "/" + lowerWorkspaceName + "/";
    const projIndex = lowerImportPath.indexOf(projSearch);

    if (projIndex !== -1) {
        const relPath = importPath.substring(projIndex + projSearch.length);
        let candidate = path.normalize(path.join(wsf, relPath));
        
        let resolved = findExistingFileIgnoreCase(candidate);
        if (resolved) return resolved;
        
        resolved = findExistingFileIgnoreCase(candidate + ".src");
        if (resolved) return resolved;
        
        resolved = findExistingFileIgnoreCase(candidate + ".gh");
        if (resolved) return resolved;
    }

    const baseName = path.basename(importPath);
    let fallbackCandidate = path.normalize(path.join(wsf, baseName));
    if (!fallbackCandidate.toLowerCase().endsWith('.src') && !fallbackCandidate.toLowerCase().endsWith('.gh')) {
        fallbackCandidate += '.src';
    }
    
    let resolved = findExistingFileIgnoreCase(fallbackCandidate);
    if (resolved) return resolved;

    return null;
}

function tryResolveImportString(importPath, currentFileDir) {
    const mapped = mapGamePathToFs(importPath);
    if (mapped) return mapped;
    
    if (path.isAbsolute(importPath)) {
        let resolved = findExistingFileIgnoreCase(importPath);
        if (resolved) return resolved;
        resolved = findExistingFileIgnoreCase(importPath + ".src");
        if (resolved) return resolved;
    }
    
    if (currentFileDir) {
        let candidate = path.resolve(currentFileDir, importPath);
        let resolved = findExistingFileIgnoreCase(candidate);
        if (resolved) return resolved;
        resolved = findExistingFileIgnoreCase(candidate + ".src");
        if (resolved) return resolved;
    }
    return null;
}

function parseImportsFromText(text) {
    const re = /import_code\s*\(\s*["']([^"']+)["']\s*\)/g;
    const res = [];
    let m;
    while ((m = re.exec(text)) !== null) {
        res.push(m[1]);
    }
    return res;
}

function extractSymbolsFromText(text, filePath) {
    const lines = text.split(/\r?\n/);
    const syms = [];
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];

        // 1. Real Objects-Methods / Parameter-Detection (CommandManager.Help = function(arg1, arg2))
        let m = /([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*=\s*function\s*\(([^)]*)\)/.exec(l);
        if (m) {
            const objName = m[1];
            const methodName = m[2];
            const params = m[3].trim();
            const col = l.indexOf(methodName);
            syms.push({ 
                name: methodName, 
                object: objName, 
                params: params,
                range: new vscode.Range(i, col, i, col + methodName.length), 
                type: 'method', 
                source: path.basename(filePath),
                filePath: filePath
            });
            continue;
        }

        m = /([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*=\s*function\b/.exec(l);
        if (m) {
            const objName = m[1];
            const methodName = m[2];
            const col = l.indexOf(methodName);
            syms.push({ 
                name: methodName, 
                object: objName, 
                params: '',
                range: new vscode.Range(i, col, i, col + methodName.length), 
                type: 'method', 
                source: path.basename(filePath),
                filePath: filePath
            });
            continue;
        }

        // 2. Real Objects-Properties / Arrays / Variables
        m = /([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(l);
        if (m) {
            const objName = m[1];
            const propName = m[2];
            const col = l.indexOf(propName);
            syms.push({ 
                name: propName, 
                object: objName, 
                params: '',
                range: new vscode.Range(i, col, i, col + propName.length), 
                type: 'property', 
                source: path.basename(filePath),
                filePath: filePath
            });
            continue;
        }

        // 3. Global Functions
        m = /function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/.exec(l);
        if (m) {
            const funcName = m[1];
            const params = m[2].trim();
            const col = l.indexOf(funcName);
            syms.push({ 
                name: funcName, 
                object: null, 
                params: params,
                range: new vscode.Range(i, col, i, col + funcName.length), 
                type: 'function', 
                source: path.basename(filePath),
                filePath: filePath
            });
            continue;
        }

        // 4. Real Objects/Classes (e.g., CommandManager = {} OR SessionManager = getSessionManager())
        m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\{\}|[A-Za-z_][A-Za-z0-9_]*\(.*\))/.exec(l);
        if (m) {
            const varName = m[1];
            const col = l.indexOf(varName);
            syms.push({ 
                name: varName, 
                object: null, 
                params: '',
                range: new vscode.Range(i, col, i, col + varName.length), 
                type: 'object', 
                source: path.basename(filePath),
                filePath: filePath
            });
            continue;
        }

        // 5. Local Variables (local, var, const)
        m = /(local|var|const)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(l);
        if (m) {
            const varName = m[2];
            const col = l.indexOf(varName);
            syms.push({ 
                name: varName, 
                object: null, 
                params: '',
                range: new vscode.Range(i, col, i, col + varName.length), 
                type: 'variable', 
                source: path.basename(filePath),
                filePath: filePath
            });
        }
    }
    return syms;
}

function collectAllSymbols(document) {
    try {
        const currentPath = document.uri.fsPath;
        const currentText = document.getText();
        const syms = [...extractSymbolsFromText(currentText, currentPath)];
        const visitedFiles = new Set([currentPath.toLowerCase()]);
        let parsedFilesCount = 0;
        const MAX_FILES = 50;

        function resolveRecursively(docText, currentDir) {
            if (parsedFilesCount >= MAX_FILES) return;
            const imports = parseImportsFromText(docText);
            
            for (const imp of imports) {
                if (parsedFilesCount >= MAX_FILES) break;
                const resolved = tryResolveImportString(imp, currentDir);
                
                if (resolved && fs.existsSync(resolved)) {
                    const resolvedLower = resolved.toLowerCase();
                    if (!visitedFiles.has(resolvedLower)) {
                        visitedFiles.add(resolvedLower);
                        parsedFilesCount++;
                        try {
                            const fileText = fs.readFileSync(resolved, "utf8");
                            const importedSyms = extractSymbolsFromText(fileText, resolved);
                            importedSyms.forEach(s => s.source = path.basename(resolved));
                            syms.push(...importedSyms);
                            resolveRecursively(fileText, path.dirname(resolved));
                        } catch (err) {}
                    }
                }
            }
        }

        resolveRecursively(currentText, path.dirname(currentPath));
        
        const wsf = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (wsf) {
            function scanWorkspaceForMain(dir, depth = 0) {
                if (depth > 3 || parsedFilesCount >= MAX_FILES) return;
                if (!fs.existsSync(dir)) return;
                
                try {
                    const files = fs.readdirSync(dir);
                    for (const file of files) {
                        if (parsedFilesCount >= MAX_FILES) break;
                        const fullPath = path.join(dir, file);
                        const stat = fs.statSync(fullPath);
                        
                        if (stat.isDirectory()) {
                            if (file !== 'node_modules' && !file.startsWith('.')) {
                                scanWorkspaceForMain(fullPath, depth + 1);
                            }
                        } else if ((file.endsWith('.src') || file.endsWith('.gh'))) {
                            try {
                                const mainText = fs.readFileSync(fullPath, "utf8");
                                let isRelevant = false;
                                
                                function checkSubChain(txt, dPath, subDepth = 0) {
                                    if (subDepth > 10) return;
                                    const imps = parseImportsFromText(txt);
                                    for (const imp of imps) {
                                        const res = tryResolveImportString(imp, dPath);
                                        if (res && (res.toLowerCase() === currentPath.toLowerCase() || visitedFiles.has(res.toLowerCase()))) {
                                            isRelevant = true;
                                        }
                                        if (res && fs.existsSync(res) && !visitedFiles.has(res.toLowerCase())) {
                                            checkSubChain(fs.readFileSync(res, "utf8"), path.dirname(res), subDepth + 1);
                                        }
                                    }
                                }
                                checkSubChain(mainText, path.dirname(fullPath));

                                if (isRelevant) {
                                    resolveRecursively(mainText, path.dirname(fullPath));
                                    const mainSyms = extractSymbolsFromText(mainText, fullPath);
                                    mainSyms.forEach(s => {
                                        if (!syms.some(existing => existing.name === s.name && existing.object === s.object)) {
                                            syms.push(s);
                                        }
                                    });
                                }
                            } catch (e) {}
                        }
                    }
                } catch (e) {}
            }
            scanWorkspaceForMain(wsf);
        }
        
        const uniqueMap = new Map();
        syms.forEach(s => {
            const key = `${s.object} ${s.name}`.toLowerCase();
            if (!uniqueMap.has(key)) {
                uniqueMap.set(key, s);
            }
        });

        return Array.from(uniqueMap.values());
    } catch (e) {
        log(`Error in collectAllSymbols: ${e.message}`);
        return [];
    }
}

function activate(context) {
    log("GreyHack ImportMgr Extension started!");

    const documentSelector = { scheme: 'file', pattern: '**/*.{src,gh}' };

    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(doc => {
            log(`File ${doc.fileName} saved – Cache & Autocompletion updated.`);
        })
    );

    // 1. Definition Provider (Click to go to definition)
    const defProv = vscode.languages.registerDefinitionProvider(documentSelector, {
        async provideDefinition(document, position) {
            const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
            if (!wordRange) return null;
            const word = document.getText(wordRange);

            const lineText = document.lineAt(position.line).text;
            const subLine = lineText.substring(0, wordRange.start.character);
            const objMatch = subLine.match(/([A-Za-z_][A-Za-z0-9_]*)\.$/);
            const targetObj = objMatch ? objMatch[1] : null;

            const syms = collectAllSymbols(document);
            let found = syms.find(s => s.name === word && (!targetObj || s.object === targetObj));
            
            if (found && found.filePath) {
                return new vscode.Location(vscode.Uri.file(found.filePath), found.range);
            }

            return null;
        }
    });
    context.subscriptions.push(defProv);

    // Hover Probider for clean Class- and Methos Infos instead of "ClassName: any"
    const hoverProv = vscode.languages.registerHoverProvider(documentSelector, {
        provideHover(document, position) {
            const wordRange = document.getWordRangeAtPosition(position, /[A-Za-z_][A-Za-z0-9_]*/);
            if (!wordRange) return null;
            const word = document.getText(wordRange);

            const lineText = document.lineAt(position.line).text;
            const subLine = lineText.substring(0, wordRange.start.character);
            const objMatch = subLine.match(/([A-Za-z_][A-Za-z0-9_]*)\.$/);
            const targetObj = objMatch ? objMatch[1] : null;

            const syms = collectAllSymbols(document);
            let found = syms.find(s => s.name === word && (!targetObj || s.object === targetObj));

            if (!found) {
                found = syms.find(s => s.name === word && !s.object);
            }

            if (found) {
                const md = new vscode.MarkdownString();
                md.isTrusted = true;

                if (found.object) {
                    md.appendCodeblock(`${found.object}.${found.name}(${found.params || ''})`, 'greyscript');
                    md.appendMarkdown(`*Type:* \`${found.type}\` (Class/Object: **${found.object}**)\n\n`);
                } else if (found.type === 'object') {
                    md.appendCodeblock(`${found.name} = {}`, 'greyscript');
                    md.appendMarkdown(`*Type:* \`Class / Object Instance\`\n\n`);
                } else if (found.type === 'function') {
                    md.appendCodeblock(`function ${found.name}(${found.params || ''})`, 'greyscript');
                    md.appendMarkdown(`*Type:* \`Global Function\`\n\n`);
                } else {
                    md.appendCodeblock(`${found.name}`, 'greyscript');
                    md.appendMarkdown(`*Type:* \`${found.type}\`\n\n`);
                }

                if (found.source) {
                    md.appendMarkdown(`*Defined in:* \`${found.source}\``);
                }

                return new vscode.Hover(md, wordRange);
            }

            return null;
        }
    });
    context.subscriptions.push(hoverProv);

    // 2. Completion Item Provider
    const completionProv = vscode.languages.registerCompletionItemProvider(
        documentSelector,
        {
            provideCompletionItems(document, position) {
                const linePrefix = document.lineAt(position.line).text.substr(0, position.character);
                const match = linePrefix.match(/\b([A-Za-z_][A-Za-z0-9_]*)\.$/);

                const syms = collectAllSymbols(document);
                const items = [];
                
                // A: Point completion (e.g., CommandManager.)
                if (match) {
                    const objName = match[1];
                    const objMembers = syms.filter(s => s.object && s.object.toLowerCase() === objName.toLowerCase());
                    
                    objMembers.forEach(m => {
                        const item = new vscode.CompletionItem(m.name);
                        if (m.type === 'method') {
                            item.kind = vscode.CompletionItemKind.Method;
                            item.detail = `Method of ${objName}` + (m.source ? ` (${m.source})` : '');
                            item.sortText = '1_' + m.name; 
                        } else {
                            item.kind = vscode.CompletionItemKind.Property;
                            item.detail = `Property of ${objName}` + (m.source ? ` (${m.source})` : '');
                            item.sortText = '0_' + m.name; 
                        }
                        items.push(item);
                    });
                    return items;
                }

                // B: Global completion (e.g., print, get_shell, etc.)
                syms.forEach(s => {
                    const item = new vscode.CompletionItem(s.name);
                    
                    if (s.type === 'object') {
                        item.kind = vscode.CompletionItemKind.Class;
                        item.detail = s.source ? `Class from ${s.source}` : 'Local Object';
                        item.sortText = (s.source ? '1_' : '2_') + '0_' + s.name;
                    } else if (s.type === 'function') {
                        item.kind = vscode.CompletionItemKind.Function;
                        item.detail = s.source ? `Function from ${s.source}` : 'Local Function';
                        item.sortText = (s.source ? '1_' : '2_') + '1_' + s.name;
                    } else if (s.type === 'variable' || s.type === 'property') {
                        item.kind = vscode.CompletionItemKind.Variable;
                        item.detail = s.source ? `Variable from ${s.source}` : 'Local Variable';
                        item.sortText = (s.source ? '1_' : '2_') + '2_' + s.name;
                    }

                    items.push(item);
                });

                // Built-ins to end
                const builtins = ['print', 'get_shell', 'get_router', 'import_code', 'user_input', 'include_lib', 'current_path'];
                builtins.forEach(b => {
                    const item = new vscode.CompletionItem(b, vscode.CompletionItemKind.Function);
                    item.detail = 'GreyHack Built-in';
                    item.sortText = '3_' + b;
                    items.push(item);
                });

                return items;
            }
        },
        '.'
    );
    context.subscriptions.push(completionProv);
}

function deactivate() {}

module.exports = { activate, deactivate };
