import * as vscode from 'vscode';
import * as unityproject from './unityproject';
import * as solution from './solution';
import Server, { ServerStartError } from './server';

const activeWorkspaces = new Map<vscode.WorkspaceFolder, ActiveWorkspace>();

type ActiveWorkspace = {
    server: Server
    projects: solution.Project[]
};

export async function activateAllWorkspaces() {
    if (vscode.workspace.workspaceFolders === undefined) {
        console.log("No workspace folders");
        return;
    }

    await Promise.all(vscode.workspace.workspaceFolders.map(async (workspaceFolder) => {
        const isUnityProject = await unityproject.hasUnityProject(workspaceFolder.uri);

        if (!isUnityProject) {
            console.log(`Workspace ${workspaceFolder.name} does not have a unity project`);
            return;
        }

        await activateWorkspace(workspaceFolder);
    }));
}

export async function activateWorkspace(workspace: vscode.WorkspaceFolder) {
    const solutionFile = await unityproject.findSolutionFile(workspace);

    if (solutionFile === undefined) {
        vscode.window.showErrorMessage(`Unity workspace ${workspace.name} does not have a solution file. Its files will not be scanned for Unity references`);
        return;
    }

    if (activeWorkspaces.has(workspace)) {
        throw new Error(`Workspace ${workspace.name} already active`);
    }

    const serverPromise = Server
        .start(workspace)
        .then((result) => {
            if (result instanceof Server) {
                return result as Server;
            } else {
                throw Error(`Error starting server: ${result as ServerStartError}`);
            }
        });

    const projectsPromise = solution.getSolutionProjects(solutionFile);

    const [server, projects] = await Promise.all([serverPromise, projectsPromise]);

    activeWorkspaces.set(workspace, {
        server,
        projects
    });
}

export async function removeWorkspace(workspace: vscode.WorkspaceFolder) {
    const activeWorkspace = activeWorkspaces.get(workspace);

    if (activeWorkspace === undefined) {
        return;
    }

    activeWorkspace.server.dispose();
    activeWorkspaces.delete(workspace);
}

export async function disposeAll() {
    for (const activeWorkspace of activeWorkspaces.entries()) {
        activeWorkspace[1].server.dispose();
    }

    activeWorkspaces.clear();
}

export async function workspaceFolderChanged(changed: vscode.WorkspaceFoldersChangeEvent) {
    await Promise.all(changed.removed.map(removeWorkspace));
    await Promise.all(changed.added.map(activateWorkspace));
}

export function getFileServer(file: vscode.Uri): Server | undefined {
    const fileWorkspace = vscode.workspace.getWorkspaceFolder(file);

    if (fileWorkspace === undefined) {
        return undefined;
    }

    return getWorkspaceServer(fileWorkspace);
}

export function getWorkspaceServer(workspace: vscode.WorkspaceFolder): Server | undefined {
    const activeWorkspace = activeWorkspaces.get(workspace);

    if (activeWorkspace === undefined) {
        return undefined;
    }

    return activeWorkspace.server;
}

export function getFileAssembly(file: vscode.Uri): string | undefined {
    const workspace = vscode.workspace.getWorkspaceFolder(file);

    if (workspace === undefined) {
        console.warn(`File ${file.fsPath} does not have a workspace`);
        return workspace;
    }

    const activeWorkspace = activeWorkspaces.get(workspace);

    if (activeWorkspace === undefined) {
        console.warn(`Workspace ${workspace.name} for file ${file.fsPath} not active`);
        return undefined;
    }

    for (const project of activeWorkspace.projects) {
        for (const projFile of project.files) {
            if (projFile.fsPath === file.fsPath) {
                return project.assembly;
            }
        }
    }

    console.warn(`Unknown file in workspace ${workspace.name}.`);
    return undefined;
}
