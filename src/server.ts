import * as vscode from "vscode";
import * as jayson from "jayson/promise";

import { ChildProcess, spawn } from 'child_process';
import { WebSocket } from "ws";
import * as requests from "./requests";

export default class Server implements vscode.Disposable {
    public static serverExecutablePath?: vscode.Uri;

    private process: ChildProcess;
    private client: jayson.Client;
    private outputChannel: vscode.LogOutputChannel;

    private constructor(process: ChildProcess, client: jayson.Client, outputChannel: vscode.LogOutputChannel) {
        this.process = process;
        this.client = client;
        this.outputChannel = outputChannel;
    }

    static async start(workspace: vscode.WorkspaceFolder): Promise<Server | ServerStartError> {
        console.log("Starting executable");

        if (this.serverExecutablePath === undefined) {
            return ServerStartError.EXECUTABLE_NOT_SET;
        }

        let executableStat: vscode.FileStat;

        try {
            executableStat = await vscode.workspace.fs.stat(this.serverExecutablePath);
        } catch (e) {
            if (e instanceof vscode.FileSystemError && e.code === "FileNotFound") {
                return ServerStartError.MISSING_EXECUTABLE;
            } else {
                throw e;
            }
        }

        const spawned = spawn(this.serverExecutablePath.fsPath, [workspace.uri.fsPath, '--json-logs']);

        const localAddr = "127.0.0.1";

        const portPromise = new Promise<string>((resolve) => {
            spawned.stdout.once('data', (data) => {
                resolve(data as string);
            });
        });

        const outputChannel = vscode.window.createOutputChannel(`Unity References Server (${workspace.name})`, { log: true });

        let logBuf = "";
        spawned.stderr.on('data', (data: Buffer) => {
            logBuf += data.toString('utf-8');

            while (logBuf.includes("\n")) {
                const newlinePos = logBuf.indexOf("\n");

                const chunk = logBuf.substring(0, newlinePos + 1);
                writeLog(outputChannel, chunk);

                logBuf = logBuf.substring(newlinePos + 1);
            }

        });

        spawned.on("close", (code) => {
            vscode.window.showInformationMessage(`Server exited with status ${code}`);
        });

        const localPort = await portPromise;
        const addr = `${localAddr}:${localPort}`;

        console.log(`Server address: ${addr}`);

        const socket = new WebSocket(`ws://${addr}`);

        const clientPromise = new Promise<jayson.Client>((resolve, reject) => {
            socket.once("error", reject);
            socket.once("open", () => {
                socket.removeListener("error", reject);

                resolve(jayson.client.websocket({
                    ws: socket
                }));
            });
        });

        return new Server(spawned, await clientPromise, outputChannel);
    }

    dispose() {

        if (this.process.exitCode === null) {
            // Process is still running, kill it
            this.process.kill();
        }

        this.outputChannel.dispose();
    }

    public async status(): Promise<requests.StatusResponse> {
        const response = await this.doRawRequest<undefined, requests.StatusResponse, void>("status");

        if (response.isOk) {
            return response.result;
        } else {
            throw new Error(`RPC Error: ${response.error}`);
        }
    }

    public async method(method: requests.MethodParam): Promise<requests.MethodResponse> {
        const response = await this.doRawRequest<requests.MethodParam, requests.MethodResponse, void>("method", method);

        if (response.isOk) {
            return response.result;
        } else {
            throw new Error(`RPC Error: ${response.error}`);
        }
    }

    private async doRawRequest<P extends jayson.RequestParamsLike, R, E>(method: string, params?: P): Promise<RpcResponse<R, E>> {
        const rawResponse = await this.client.request(method, params);

        if (!Object.hasOwn(rawResponse, "jsonrpc") && rawResponse["jsonrpc"] === "2.0") {
            throw new Error("JsonRPC 1.0 response returned!");
        }

        const response = rawResponse as jayson.JSONRPCVersionTwoResponse;

        if (Object.hasOwn(response, "error")) {
            const errorResponse = response as jayson.JSONRPCVersionTwoResponseWithError;

            return {
                isOk: false,
                error: {
                    code: errorResponse.error.code,
                    message: errorResponse.error.message,
                    data: errorResponse.error.data as E
                }
            };
        } else {
            const okResponse = response as jayson.JSONRPCVersionTwoResponseWithResult;

            return {
                isOk: true,
                result: okResponse.result as R
            };
        }
    }
}

export type RpcResponse<R, E> =
    {
        isOk: true,
        result: R
    } | {
        isOk: false, error: {
            code: number,
            message: string,
            data: E
        }
    };

export enum ServerStartError {
    EXECUTABLE_NOT_SET = "Executable path not set",
    MISSING_EXECUTABLE = "Missing executable"
}

interface ServerLog {
    level: "trace" | "debug" | "info" | "warn" | "error",
    timestamp: string,
    message: string,
    file?: string,
    line?: number
}

function formatServerLog(log: ServerLog): string {
    return `${log.message}`;
}

function writeLog(outputChannel: vscode.LogOutputChannel, rawLog: string) {
    try {
        const parsed = JSON.parse(rawLog) as ServerLog;

        switch (parsed.level) {
            case "trace":
                outputChannel.trace(formatServerLog(parsed));
                break;
            case "debug":
                outputChannel.debug(formatServerLog(parsed));
                break;
            case "info":
                outputChannel.info(formatServerLog(parsed));
                break;
            case "warn":
                outputChannel.warn(formatServerLog(parsed));
                break;
            case "error":
                outputChannel.error(formatServerLog(parsed));
                break;
            default:
                throw Error(`Unknown log level: ${parsed.level}. Message: ${parsed.message}`);
        }
    } catch (e) {
        const msg = `Unparsable log: ${rawLog}`;
        console.error(msg);
        outputChannel.error(msg);
    }
}
