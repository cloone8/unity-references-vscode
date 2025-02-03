import * as vscode from 'vscode';
const CONFIG_SECTION: string = "unity-references";
const CUSTOM_SERVER_PATH: string = "customServerPath";

export function customServerPath(): string {
    return vscode.workspace.getConfiguration(CONFIG_SECTION)[CUSTOM_SERVER_PATH];
}
