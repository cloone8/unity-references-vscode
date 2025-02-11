export interface SemVer {
    major: number,
    minor: number,
    patch: number
};

export function fromGitTag(tag: string): SemVer | undefined {
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
/**
 * Compares two semantic versions in reverse (large to small) order.
 * 
 * @param a The first semver
 * @param b The second semver
 * @returns A number that can be used in Array.sort()
 */
export function compare(a: SemVer, b: SemVer): number {
    // Sort large to small
    if (a.major !== b.major) {
        return b.major - a.major;
    } else {
        if (a.minor !== b.minor) {
            return b.minor - a.minor;
        } else {
            return b.patch - a.patch;
        }
    }
}

export function isNewer(current: SemVer, other: SemVer): boolean {
    return compare(current, other) >= 1;
}
