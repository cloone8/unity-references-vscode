import * as vscode from 'vscode';
import { MethodResponse } from './requests';

export async function showReferences(references: References) {
    const actualReferences = references;

    switch (actualReferences.kind) {
        case "method":
            await showMethodReferences(actualReferences);
            break;
        default:
            console.error(`Unknown reference kind: ${actualReferences.kind}`);
            break;
    }
}

async function showMethodReferences(references: MethodReferences) {
    const chosen = await vscode.window.showQuickPick(references.references.map(ref => ref.file));

    if (chosen === undefined) {
        return;
    }

    vscode.window.showTextDocument(await vscode.workspace.openTextDocument(chosen));
}

export type References = MethodReferences;

export interface MethodReferences {
    kind: "method",
    references: MethodResponse
}
