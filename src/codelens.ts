import * as vscode from 'vscode';
import * as workspaces from './workspaces';

export default class UnityReferences implements vscode.CodeLensProvider<vscode.CodeLens> {
    onDidChangeCodeLenses?: vscode.Event<void> | undefined;

    provideCodeLenses(doc: vscode.TextDocument, cancelToken: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeLens[]> {
        return new Promise(async (resolve) => {
            console.log(`Codelensing document: ${doc.uri}`);

            const server = workspaces.getFileServer(doc.uri);

            if (server === undefined) {
                console.error(`Could not find server for file ${doc.uri}`);
                return;
            }

            const assembly = workspaces.getFileAssembly(doc.uri);

            if (assembly === undefined) {
                console.error(`Could not find assembly for file ${doc.uri}`);
                return;
            }

            console.log(`File assembly is ${assembly}`);

            const rootSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>("vscode.executeDocumentSymbolProvider", doc.uri);
            const documentMethods = (await Promise.all(rootSymbols.map(s => findMethods(s, undefined)))).flat();

            console.log(`Found ${documentMethods.length} methods`);

            const methodReferences = await Promise.all(documentMethods.map(async (m) => {
                let methodReferences = await server.method({
                    method_assembly: assembly,
                    method_name: m.name,
                    method_typename: m.class
                });

                return {
                    method: m,
                    references: methodReferences
                };
            }));

            const codeLenses = methodReferences.map(methodAndRefs => {
                const method = methodAndRefs.method;
                const refs = methodAndRefs.references;
                const command: vscode.Command = {
                    title: `${refs.length} editor references`,
                    command: ""
                };

                const codelens = new vscode.CodeLens(method.range, command);

                return codelens;
            });

            resolve(codeLenses);
        });
    }

    // resolveCodeLens?(codeLens: vscode.CodeLens, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeLens> {
    //     throw new Error('Method not implemented.');
    // }

}

async function findMethods(symbol: vscode.DocumentSymbol, clazz?: string): Promise<Method[]> {
    // const docUri = doc.uri;
    // const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', docUri);

    let found: Method[] = [];

    let actualClass = clazz;

    if (symbol.kind === vscode.SymbolKind.Method) {
        if (actualClass === undefined) {
            console.error(`Unknown class for method ${symbol.name}, skipping`);
        } else {
            found.push({
                range: new vscode.Range(symbol.range.start, symbol.range.end),
                name: symbol.name,
                class: actualClass
            });
        }
    } else if (symbol.kind === vscode.SymbolKind.Class) {
        actualClass = symbol.detail;
    }

    const childMethodPromises = Promise.all(symbol.children.map(child => findMethods(child, actualClass)));
    const childMethods = (await childMethodPromises).flat();

    return [...found, ...childMethods];
}

interface Method {
    name: string,
    class: string
    range: vscode.Range,
}
