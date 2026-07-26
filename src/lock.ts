import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { getLocksDir, isProcessAlive } from "./state";

export interface LockOptions {
  busyMessage: string;
  timeoutMs?: number;
  tmpdir?: string;
  wait?: boolean;
}

export async function withLock<T>(
  name: string,
  options: LockOptions,
  run: () => Promise<T>,
): Promise<T> {
  await acquireLock(name, options);

  try {
    return await run();
  } finally {
    await releaseLock(name, options.tmpdir);
  }
}

async function acquireLock(name: string, options: LockOptions): Promise<void> {
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? 10_000;

  await mkdir(getLocksDir(options.tmpdir), { recursive: true });

  while (true) {
    const acquired = await tryAcquireLock(name, options.busyMessage, options.tmpdir);

    if (acquired) {
      return;
    }

    if (!options.wait || Date.now() - startedAt >= timeoutMs) {
      throw new Error(options.busyMessage);
    }

    await delay(50);
  }
}

async function tryAcquireLock(
  name: string,
  busyMessage: string,
  tmpdir?: string,
): Promise<boolean> {
  const lockFile = getLockFile(name, tmpdir);
  const existingPid = await readLockPid(lockFile);

  if (existingPid !== undefined && isProcessAlive(existingPid)) {
    return false;
  }

  if (existingPid !== undefined) {
    await rm(lockFile, { force: true });
  }

  try {
    await writeFile(lockFile, String(process.pid), { flag: "wx" });
    return true;
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      return false;
    }

    throw error instanceof Error ? error : new Error(busyMessage);
  }
}

async function releaseLock(name: string, tmpdir?: string): Promise<void> {
  await rm(getLockFile(name, tmpdir), { force: true });
}

async function readLockPid(lockFile: string): Promise<number | undefined> {
  try {
    const value = Number.parseInt(await readFile(lockFile, "utf8"), 10);
    return Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function getLockFile(name: string, tmpdir?: string): string {
  return path.join(getLocksDir(tmpdir), `${name.replaceAll(/[^a-zA-Z0-9._-]/g, "_")}.lock`);
}

function isAlreadyExistsError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}
