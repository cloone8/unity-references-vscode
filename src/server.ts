import * as vscode from 'vscode';
import * as os from 'os';
import { Endpoints } from "@octokit/types";
import { assert } from 'console';
import * as yauzl from 'yauzl';
import * as stream from 'stream';
import * as util from 'util';

export const SERVER_MAJOR_VERSION: number = 0;
const SERVER_REPO_OWNER: string = "cloone8";
const SERVER_REPO_NAME: string = "unity-reference-server";

export async function ensureServer(ctx: vscode.ExtensionContext) {
    const latestRelease = await fetchLatestRelease();

    if (latestRelease !== undefined) {
        vscode.window.showInformationMessage(`Latest release: ${latestRelease.tag} @ ${latestRelease.platformAssetUrl}`);

        await downloadAndInstallRelease(latestRelease.tag, latestRelease.platformAssetUrl, latestRelease.platformAssetName, vscode.Uri.joinPath(ctx.globalStorageUri, "server"));
    } else {
        vscode.window.showErrorMessage("Latest release not found");
    }

}

async function downloadAndInstallRelease(tag: string, url: string, name: string, installdir: vscode.Uri) {
    let fetchResult = await fetch(url);

    if (!fetchResult.ok) {
        vscode.window.showErrorMessage(`Download not OK: ${fetchResult.status}, ${await fetchResult.text()}`);
        return;
    }

    const tempfile = os.tmpdir() + `/unity-references-vscode/${name}`;

    console.log(`Writing download to ${tempfile}`);
    console.log(`Installing download to ${installdir.fsPath}`);

    await vscode.workspace.fs.writeFile(vscode.Uri.file(tempfile), new Uint8Array(await fetchResult.arrayBuffer()));
    await vscode.workspace.fs.createDirectory(installdir);

    if (name.endsWith(".zip")) {
        console.log("unzipping");
        await unzip(tempfile, installdir);
    } else if (name.endsWith(".tar.xz")) {

    } else if (name.endsWith(".tar.gz")) {

    } else {
        throw Error(`Unknown file format: ${name}`);
    }
}

interface LatestRelease {
    tag: string,
    platformAssetName: string,
    platformAssetUrl: string
}

type GithubReleases = Endpoints["GET /repos/{owner}/{repo}/releases"]["response"]["data"];

async function fetchLatestRelease(): Promise<LatestRelease | undefined> {
    const latestReleaseUrl = `https://api.github.com/repos/${SERVER_REPO_OWNER}/${SERVER_REPO_NAME}/releases`;

    const response = await fetch(latestReleaseUrl);

    if (!response.ok) {
        console.error("Error retrieving latest releases from github");
        return undefined;
    }

    const returnedReleases = await response.json() as GithubReleases;

    const compatibleReleases = returnedReleases.map(rel => {
        const version = parseTag(rel.tag_name);
        return {
            release: rel,
            platformSpecificAsset: findPlatformSpecificAsset(rel),
            version: version
        };
    })
        .filter(rel => rel.version !== undefined)
        .filter(rel => rel.platformSpecificAsset !== undefined)
        .filter(rel => rel.version!.major === SERVER_MAJOR_VERSION);

    console.log(`Found ${compatibleReleases.length} compatible releases with assets for this platform`);

    compatibleReleases.sort((a, b) => {
        const aVer = a.version!;
        const bVer = b.version!;

        if (aVer.major !== bVer.major) {
            return aVer.major - bVer.major;
        } else {
            if (aVer.minor !== bVer.minor) {
                return aVer.minor - bVer.minor;
            } else {
                return aVer.patch - bVer.patch;
            }
        }
    });

    if (compatibleReleases.length === 0) {
        console.error("No compatible releases found");
        return undefined;
    }

    const latest = compatibleReleases[0];

    return {
        tag: latest.release.tag_name,
        platformAssetUrl: latest.platformSpecificAsset!.url,
        platformAssetName: latest.platformSpecificAsset!.name,
    };
}

interface SemVer {
    major: number,
    minor: number,
    patch: number
};

function parseTag(tag: string): SemVer | undefined {
    if (!tag.startsWith("v")) {
        return undefined;
    }

    const numbersOnly = tag.substring(1);


    const splitNumbers = numbersOnly.split(".");

    if (splitNumbers.length !== 3) {
        return undefined;
    }

    return {
        major: Number(splitNumbers[0]),
        minor: Number(splitNumbers[1]),
        patch: Number(splitNumbers[2]),
    };
}

function findPlatformSpecificAsset(release: GithubReleases[0]): { url: string, name: string } | undefined {
    // Filter out the checksums first
    const noChecksums = release.assets.filter(asset => !asset.name.endsWith(".sha256"));

    const osStr = nodeOsToBuildStr(process.platform);
    const archStr = nodeArchToBuildStr(process.arch);

    if (osStr === undefined || archStr === undefined) {
        console.log(`No OS or Arch strs ${osStr} ${archStr}`);
        return undefined;
    }

    const matchingPlatform = noChecksums.filter(asset => asset.name.includes(osStr) && asset.name.includes(archStr));

    if (matchingPlatform.length === 0) {
        return undefined;
    }

    assert(matchingPlatform.length === 1);

    return { url: matchingPlatform[0].browser_download_url, name: matchingPlatform[0].name };
}

function nodeOsToBuildStr(platform: NodeJS.Platform): string | undefined {
    switch (platform) {
        case "darwin":
            return "apple-darwin";
        case "android":
        case "linux":
            return "linux";
        case "win32":
        case "cygwin":
            return "pc-windows";
        default:
            console.error("Current platform has no server target");
            return undefined;
    }
};

function nodeArchToBuildStr(arch: NodeJS.Architecture): string | undefined {
    switch (arch) {
        case "arm64":
            return "aarch64";
        case "x64":
            return "x86_64";
        default:
            console.error("Current architecture has no server target");
            return undefined;
    }
}

const open: (file: string, options: yauzl.Options) => Promise<yauzl.ZipFile> = util.promisify(yauzl.open);

async function unzip(zipfile: string, targetdir: vscode.Uri) {
    const zip = await open(zipfile, { lazyEntries: true });
    zip.readEntry();

    zip.on("entry", async (entry: yauzl.Entry) => {
        if (entry.fileName.endsWith("/")) {
            console.log("Dir entry");
            zip.readEntry();
        } else {
            console.log("File entry");
            const targetFile = vscode.Uri.joinPath(targetdir, entry.fileName);
            console.log(targetFile.fsPath);

            const openReadStream = util.promisify(zip.openReadStream.bind(zip));

            const readStream = await openReadStream(entry);
            const buffers: Buffer[] = [];

            const fullBufferPromise = new Promise<void>((resolve, reject) => {
                readStream.on("data", (chunk) => {
                    buffers.push(chunk);
                });

                readStream.on("end", () => {

                    const fullBuffer = Buffer.concat(buffers);
                    console.log(`Buffer has ${fullBuffer.byteLength} bytes`);

                    vscode.workspace.fs.writeFile(targetFile, fullBuffer).then(() => {

                        zip.readEntry();
                        resolve();
                    });
                });

                readStream.on("error", reject);
            });

            await fullBufferPromise;
        }
    });

    return new Promise((resolve, reject) => {
        zip.on("end", resolve);
        zip.on("error", reject);
    });
}
