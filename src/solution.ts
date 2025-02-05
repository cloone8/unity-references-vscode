import * as vscode from 'vscode';

const solutionCsharpProjectsRegex = /^Project\(".*"\) = "(.*)", "(.*)", ".*"$/gm;
const projectFilesRegex = /^\s*<Compile\s*Include="(.*\.cs)"\s*\/>$/gm;

export async function getSolutionProjects(solutionFile: vscode.Uri): Promise<Project[]> {
    const solutionParentDir = vscode.Uri.joinPath(solutionFile, '..');
    const fs = vscode.workspace.fs;

    const solutionContent = (await fs.readFile(solutionFile)).toString();

    const projectMatches = Array.from(solutionContent.matchAll(solutionCsharpProjectsRegex));

    return await Promise.all(projectMatches.map(async (match) => {
        const assembly = match[1];
        const file = vscode.Uri.joinPath(solutionParentDir, match[2]);
        const files = await getProjectFiles(solutionParentDir, file);

        return {
            assembly,
            projectMetaFile: file,
            files
        };
    }));
}

async function getProjectFiles(rootDir: vscode.Uri, projectMetaFile: vscode.Uri): Promise<vscode.Uri[]> {
    const fs = vscode.workspace.fs;

    const projectMetaFileContent = (await fs.readFile(projectMetaFile)).toString();

    const fileMatches = Array.from(projectMetaFileContent.matchAll(projectFilesRegex));

    return fileMatches.map(match => vscode.Uri.joinPath(rootDir, match[1]));
}

export interface Project {
    projectMetaFile: vscode.Uri,
    assembly: string
    files: vscode.Uri[]
};
