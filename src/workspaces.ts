import * as vscode from 'vscode';
import * as unityproject from './unityproject';
import * as solution from './solution';
import Server, { ServerStartError } from './server';

const activeWorkspaces = new Map<vscode.WorkspaceFolder, ActiveWorkspace>();

type ActiveWorkspace = {
    server: Server
    projects: solution.Project[]
};

export async function activateWorkspace(workspace: vscode.WorkspaceFolder, serverExecutable: vscode.Uri) {
    const solutionFile = await unityproject.findSolutionFile(workspace);

    if (solutionFile === undefined) {
        vscode.window.showErrorMessage(`Unity workspace ${workspace.name} does not have a solution file. Its files will not be scanned for Unity references`);
        return;
    }

    if (activeWorkspaces.has(workspace)) {
        throw new Error(`Workspace ${workspace.name} already active`);
    }

    const serverPromise = Server
        .start(serverExecutable, workspace)
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
