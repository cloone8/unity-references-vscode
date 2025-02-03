// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as config from './config';
import * as updater from './updater';
import Server, { ServerStartError } from './server';

export const SERVER_DIRECTORY = "server";
export const SERVER_EXECUTABLE = process.platform === "win32" || process.platform === "cygwin" ? "unity-reference-server.exe" : "unity-reference-server";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "unity-references" is now active!');
    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    const helloWorld = vscode.commands.registerCommand('unity-references.helloWorld', async () => {
        // The code you place here will be executed every time your command is executed
        // Display a message box to the user

        const customServerPath = config.customServerPath();

        let serverExecutablePath;

        if (customServerPath.trim().length !== 0) {
            serverExecutablePath = vscode.Uri.file(customServerPath);
        } else {
            await updater.ensureLatest(context);
            serverExecutablePath = vscode.Uri.joinPath(context.globalStorageUri, SERVER_DIRECTORY + "/" + SERVER_EXECUTABLE);
        }

        if (vscode.workspace.workspaceFolders === undefined) {
            console.log("No workspace folders");
            return;
        }

        for (const workspaceFolder of vscode.workspace.workspaceFolders) {

            const serverInstance = await Server.start(serverExecutablePath, workspaceFolder.uri);

            if (!(serverInstance instanceof Server)) {
                vscode.window.showErrorMessage(`Error starting the server: ${serverInstance as ServerStartError}`);
                continue;
            }

            context.subscriptions.push(serverInstance);
            vscode.window.showInformationMessage(await serverInstance.status());
        }
    });

    context.subscriptions.push(helloWorld);

    const symbols = vscode.commands.registerCommand('unity-references.findSymbols', async () => {
        const doc = vscode.window.activeTextEditor?.document.uri;
        const symbols = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', doc) as vscode.DocumentSymbol[];

        const methods = symbols.map(s => dumpSymbolRecursive(s)).reduce((a, b) => {
            return { ...a, ...b };
        }, {});

        vscode.window.showInformationMessage(JSON.stringify(methods));
    });

    context.subscriptions.push(symbols);
}

function dumpSymbolRecursive(symbol: vscode.DocumentSymbol): any {
    let obj: any = {};

    if (symbol.kind === vscode.SymbolKind.Class) {
        vscode.window.showInformationMessage(symbol.detail);
    }

    obj[symbol.name] = symbol.children.map(ch => dumpSymbolRecursive(ch));

    return obj;
}

// This method is called when your extension is deactivated
export function deactivate() { }
