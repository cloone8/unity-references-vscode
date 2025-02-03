import { Endpoints } from "@octokit/types";
import assert from "assert";
import { SERVER_MAJOR_VERSION } from ".";
import * as semver from "../semver";

const SERVER_REPO_OWNER: string = "cloone8";
const SERVER_REPO_NAME: string = "unity-reference-server";

type GithubReleases = Endpoints["GET /repos/{owner}/{repo}/releases"]["response"]["data"];

export interface LatestRelease {
    tag: string,
    platformAssetName: string,
    platformAssetUrl: string
}

export async function fetchLatestRelease(): Promise<LatestRelease | undefined> {
    const latestReleaseUrl = `https://api.github.com/repos/${SERVER_REPO_OWNER}/${SERVER_REPO_NAME}/releases`;

    const response = await fetch(latestReleaseUrl);

    if (!response.ok) {
        console.error("Error retrieving latest releases from github");
        return undefined;
    }

    const returnedReleases = await response.json() as GithubReleases;

    const compatibleReleases = returnedReleases.map(rel => {
        return {
            release: rel,
            platformSpecificAsset: findPlatformSpecificAsset(rel),
            version: semver.fromGitTag(rel.tag_name)
        };
    })
        .filter(rel => rel.version !== undefined)
        .filter(rel => rel.platformSpecificAsset !== undefined)
        .filter(rel => rel.version!.major === SERVER_MAJOR_VERSION);

    console.log(`Found ${compatibleReleases.length} compatible releases with assets for this platform`);

    compatibleReleases.sort((a, b) => {
        const aVer = a.version!;
        const bVer = b.version!;

        return semver.compare(aVer, bVer);
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
            return "linux-gnu";
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
