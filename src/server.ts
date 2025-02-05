import * as vscode from "vscode";
import * as jayson from "jayson/promise";

import { ChildProcess, spawn } from 'child_process';
import { WebSocket } from "ws";
import { StatusResponse } from "./requests";

export default class Server implements vscode.Disposable {
    private process: ChildProcess;
    private client: jayson.Client;
    private outputChannel: vscode.LogOutputChannel;

    private constructor(process: ChildProcess, client: jayson.Client, outputChannel: vscode.LogOutputChannel) {
        this.process = process;
        this.client = client;
        this.outputChannel = outputChannel;
    }

    static async start(serverExecutable: vscode.Uri, workspace: vscode.WorkspaceFolder): Promise<Server | ServerStartError> {
        console.log("Starting executable");
        console.log(serverExecutable.fsPath);

        let executableStat: vscode.FileStat;

        try {
            executableStat = await vscode.workspace.fs.stat(serverExecutable);
        } catch (e) {
            if (e instanceof vscode.FileSystemError && e.code === "FileNotFound") {
                return ServerStartError.MISSING_EXECUTABLE;
            } else {
                throw e;
            }
        }

        const spawned = spawn(serverExecutable.fsPath, [workspace.uri.fsPath, '--json-logs']);

        const localAddr = "127.0.0.1";

        const portPromise = new Promise<string>((resolve) => {
            spawned.stdout.once('data', (data) => {
                resolve(data as string);
            });
        });

        const outputChannel = vscode.window.createOutputChannel(`Unity References Server (${workspace.name})`, { log: true });

        spawned.stderr.on('data', (data: Buffer) => {
            const parsed = JSON.parse(data.toString()) as ServerLog;

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

    public async status(): Promise<StatusResponse> {
        const response = await this.doRawRequest<undefined, StatusResponse, void>("status");

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
    MISSING_EXECUTABLE = "Missing Executable"
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
