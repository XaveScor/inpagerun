import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir as osTmpdir } from "node:os";
import path from "node:path";

export interface BrowserState {
  headed: boolean;
  pid: number;
  port: number;
  userDataDir: string;
  wsEndpoint: string;
}

export interface ExtensionState {
  path: string;
}

export interface SessionState {
  browser: BrowserState;
  createdAt: number;
  extensions: ExtensionState[];
  pageTargetId: string;
  url: string;
}

export interface InpagerunState {
  sessions: Record<string, SessionState>;
}

export function getInpagerunTmpDir(tmpdir?: string): string {
  return path.join(tmpdir ?? osTmpdir(), "inpagerun");
}

export function getStateFile(tmpdir?: string): string {
  return path.join(getInpagerunTmpDir(tmpdir), "state.json");
}

export function getLocksDir(tmpdir?: string): string {
  return path.join(getInpagerunTmpDir(tmpdir), "locks");
}

export async function readState(tmpdir?: string): Promise<InpagerunState | undefined> {
  try {
    return JSON.parse(await readFile(getStateFile(tmpdir), "utf8")) as InpagerunState;
  } catch (error) {
    if (isNotFoundError(error)) {
      return undefined;
    }

    throw error;
  }
}

export async function writeState(state: InpagerunState, tmpdir?: string): Promise<void> {
  const stateFile = getStateFile(tmpdir);
  await mkdir(path.dirname(stateFile), { recursive: true });

  const tempFile = `${stateFile}.${process.pid}.tmp`;
  await writeFile(tempFile, JSON.stringify(state, null, 2));
  await rename(tempFile, stateFile);
}

export async function removeState(tmpdir?: string): Promise<void> {
  await rm(getStateFile(tmpdir), { force: true });
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
