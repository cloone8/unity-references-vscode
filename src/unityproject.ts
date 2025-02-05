import * as vscode from 'vscode';

export async function hasUnityProject(folder: vscode.Uri): Promise<boolean> {
    const fs = vscode.workspace.fs;

    const versionFile = isFulfilled(fs.stat(vscode.Uri.joinPath(folder, "/ProjectSettings/ProjectVersion.txt")));
    const settingsFile = isFulfilled(fs.stat(vscode.Uri.joinPath(folder, "/ProjectSettings/ProjectSettings.asset")));
    const assetsFolder = isFulfilled(fs.stat(vscode.Uri.joinPath(folder, "/Assets")));

    const allFilesExist = (await Promise.all([versionFile, settingsFile, assetsFolder])).reduce((a, b) => (a && b), true);

    return allFilesExist;
}

export async function findSolutionFile(workspace: vscode.WorkspaceFolder): Promise<vscode.Uri | undefined> {
    const fs = vscode.workspace.fs;

    const entries = await fs.readDirectory(workspace.uri);

    const solutions = entries.filter(entry => {
        const name = entry[0];
        const filetype = entry[1];

        return name.endsWith(".sln") && filetype === vscode.FileType.File;
    });

    if (solutions.length === 0) {
        return undefined;
    }

    const solution = solutions[0][0];

    if (solutions.length > 1) {
        vscode.window.showWarningMessage(`Multiple solutions detected in workspace ${workspace.name}, selecting the first: ${solution}`);
    }

    return vscode.Uri.joinPath(workspace.uri, solution);
}

async function isFulfilled(promise: Thenable<any>): Promise<boolean> {
    return new Promise((resolve) => {
        promise.then(() => {
            resolve(true);
        }, () => {
            resolve(false);
        });
    });
}
