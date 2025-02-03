import * as vscode from 'vscode';
import { fetchLatestRelease } from './latest';
import * as semver from '../semver';
import { downloadAndInstallRelease } from './download';
import { SERVER_DIRECTORY } from '../extension';

export const SERVER_MAJOR_VERSION: number = 0;

const SERVER_TAG_STORAGE_KEY: string = "server_tag";

export async function ensureLatest(ctx: vscode.ExtensionContext, force: boolean = false) {
    const latestRelease = await fetchLatestRelease();

    if (latestRelease === undefined) {
        vscode.window.showWarningMessage("Could not fetch latest server release. Not updating.");
        return;
    }

    const storedServerTag = ctx.globalState.get<string>(SERVER_TAG_STORAGE_KEY);

    let currentVersion: semver.SemVer | undefined;

    if (storedServerTag === undefined) {
        currentVersion = undefined;
    } else {
        currentVersion = semver.fromGitTag(storedServerTag);
    }

    const needsInstall = currentVersion === undefined || (semver.isNewer(currentVersion, semver.fromGitTag(latestRelease.tag)!));

    if (!force && !needsInstall) {
        console.log("Server already up to date, not downloading latest");
        return;
    }

    vscode.window.showInformationMessage(`Downloading latest server release: ${latestRelease.tag}`);

    try {
        // Download and unpack
        await downloadAndInstallRelease(latestRelease.platformAssetUrl, latestRelease.platformAssetName, vscode.Uri.joinPath(ctx.globalStorageUri, SERVER_DIRECTORY));

        // Update the latest installed version in the global state
        await ctx.globalState.update(SERVER_TAG_STORAGE_KEY, latestRelease.tag);

        vscode.window.showInformationMessage(`Succesfully installed server version ${latestRelease.tag}`);
    } catch (e: any) {
        vscode.window.showErrorMessage("Could not download latest server release");
        console.error(`Could not download latest server release. Error: ${e}`);
    }

}
