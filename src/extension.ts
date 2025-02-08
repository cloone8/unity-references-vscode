// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as workspaces from './workspaces';
import * as commands from './commands';
import * as config from './config';
import * as updater from './updater';
import Server from './server';
import UnityReferences from './codelens';

export const SERVER_STORAGE_DIR = "server";
export const SERVER_BIN_NAME = process.platform === "win32" || process.platform === "cygwin" ? "unity-reference-server.exe" : "unity-reference-server";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
    const customServerPath = config.customServerPath();

    if (customServerPath.trim().length !== 0) {
        Server.serverExecutablePath = vscode.Uri.file(customServerPath);
    } else {
        await updater.ensureLatest(context);
        Server.serverExecutablePath = vscode.Uri.joinPath(context.globalStorageUri, SERVER_STORAGE_DIR + "/" + SERVER_BIN_NAME);
    }

    await workspaces.activateAllWorkspaces();

    // CodeLens
    const filter: vscode.DocumentFilter = {
        language: "csharp"
    };

    context.subscriptions.push(vscode.languages.registerCodeLensProvider(filter, new UnityReferences()));

    // Commands
    context.subscriptions.push(vscode.commands.registerCommand('unity-references.showReferences', commands.showReferences));

    // Listeners
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(workspaces.workspaceFolderChanged));

    // Cleanup
    context.subscriptions.push({ dispose: workspaces.disposeAll });
}

// This method is called when your extension is deactivated
export function deactivate() { }
