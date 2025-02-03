import * as vscode from 'vscode';
import * as os from 'os';
import * as yauzl from 'yauzl';
import * as util from 'util';

export async function downloadAndInstallRelease(url: string, name: string, installdir: vscode.Uri) {
    let fetchResult = await fetch(url);

    if (!fetchResult.ok) {
        vscode.window.showErrorMessage(`Download not OK: ${fetchResult.status}, ${await fetchResult.text()}`);
        return;
    }

    const tempfile = os.tmpdir() + `/unity-references-vscode/${name}`;

    console.log(`Writing download to ${tempfile}`);
    console.log(`Installing download to ${installdir.fsPath}`);

    await vscode.workspace.fs.writeFile(vscode.Uri.file(tempfile), new Uint8Array(await fetchResult.arrayBuffer()));

    // If we find out the installdir is empty or doesn't exist, then we don't
    // need to delete anything anyway
    try {
        await vscode.workspace.fs.delete(installdir, { useTrash: false, recursive: true });
    } catch (e) {
        if (!(e instanceof vscode.FileSystemError)) {
            throw e;
        }

        if (e.code !== "FileNotFound") {
            throw e;
        }
    }

    await vscode.workspace.fs.createDirectory(installdir);

    if (!name.endsWith(".zip")) {
        throw Error("Downloaded file not a zip");
    }

    await unzip(tempfile, installdir);
}

const open: (file: string, options: yauzl.Options) => Promise<yauzl.ZipFile> = util.promisify(yauzl.open);

async function unzip(zipfile: string, targetdir: vscode.Uri) {
    const zip = await open(zipfile, { lazyEntries: true });
    zip.readEntry();

    zip.on("entry", async (entry: yauzl.Entry) => {
        if (entry.fileName.endsWith("/")) {
            zip.readEntry();
        } else {
            const targetFile = vscode.Uri.joinPath(targetdir, entry.fileName);

            const openReadStream = util.promisify(zip.openReadStream.bind(zip));

            const readStream = await openReadStream(entry);
            const buffers: Buffer[] = [];

            const fullBufferPromise = new Promise<void>((resolve, reject) => {
                readStream.on("data", (chunk) => {
                    buffers.push(chunk);
                });

                readStream.on("end", () => {

                    const fullBuffer = Buffer.concat(buffers);

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
