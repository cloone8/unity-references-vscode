import * as vscode from 'vscode';
import * as workspaces from './workspaces';

export async function restart() {
    await workspaces.disposeAll();
    await workspaces.activateAllWorkspaces();
}

export async function findSymbols() {
    const doc = vscode.window.activeTextEditor?.document.uri;
    const symbols = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', doc) as vscode.DocumentSymbol[];

    const methods = symbols.map(s => dumpSymbolRecursive(s)).reduce((a, b) => {
        return { ...a, ...b };
    }, {});

    vscode.window.showInformationMessage(JSON.stringify(methods));
}

function dumpSymbolRecursive(symbol: vscode.DocumentSymbol): any {
    let obj: any = {};

    if (symbol.kind === vscode.SymbolKind.Class) {
        vscode.window.showInformationMessage(symbol.detail);
    }

    obj[symbol.name] = symbol.children.map(ch => dumpSymbolRecursive(ch));

    return obj;
}
