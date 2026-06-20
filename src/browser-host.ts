import { randomBytes } from "node:crypto";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { spawn } from "node:child_process";
import { chromium, type Browser } from "playwright";
import {
  getInpagerunTmpDir,
  isProcessAlive,
  readState,
  removeState,
  type BrowserState,
  type InpagerunState,
  writeState,
} from "./state";

const require = createRequire(import.meta.url);
const playwrightPackage = require("playwright/package.json") as { version: string };

export type EnsureBrowserOptions = {
  debug?(message: string): Promise<void> | void;
  headed: boolean;
  tmpdir?: string;
};

export async function ensureDetachedBrowser(
  options: EnsureBrowserOptions,
): Promise<InpagerunState> {
  const existingState = await readState(options.tmpdir);

  if (existingState && (await isBrowserStateUsable(existingState.browser))) {
    await options.debug?.(
      `Using existing ${existingState.browser.headed ? "headed" : "headless"} Chromium at port ${existingState.browser.port}`,
    );
    return existingState;
  }

  if (existingState) {
    await options.debug?.("Removing stale Chromium state");
    await cleanupBrowserFiles(existingState.browser, options.tmpdir);
    await removeState(options.tmpdir);
  }

  const browser = await startDetachedBrowser(options);
  const state: InpagerunState = { browser, pages: {} };
  await writeState(state, options.tmpdir);

  return state;
}

export async function requireDetachedBrowser(tmpdir?: string): Promise<InpagerunState> {
  const state = await readState(tmpdir);

  if (!state) {
    throw new Error("Browser is not running; page id is no longer valid.");
  }

  if (!(await isBrowserStateUsable(state.browser))) {
    await cleanupBrowserFiles(state.browser, tmpdir);
    await removeState(tmpdir);
    throw new Error("Browser is not running; page id is no longer valid.");
  }

  return state;
}

export async function connectDetachedBrowser(browser: BrowserState): Promise<Browser> {
  return await chromium.connectOverCDP(browser.wsEndpoint);
}

export async function closeDetachedBrowser(state: InpagerunState, tmpdir?: string): Promise<void> {
  try {
    const browser = await connectDetachedBrowser(state.browser);
    const session = await browser.newBrowserCDPSession();
    await session.send("Browser.close");
    await browser.close().catch(() => {});
  } catch {}

  await waitForProcessExit(state.browser.pid);
  await cleanupBrowserFiles(state.browser, tmpdir);
  await removeState(tmpdir);
}

async function startDetachedBrowser(options: EnsureBrowserOptions): Promise<BrowserState> {
  const port = await getFreePort();
  const rootDir = getInpagerunTmpDir(options.tmpdir);
  const executablePath = await getChromiumExecutablePath();
  await mkdir(rootDir, { recursive: true });

  const userDataDir = await mkdtemp(join(rootDir, "profile-"));
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--password-store=basic",
    "--use-mock-keychain",
  ];

  if (!options.headed) {
    args.push("--headless=new");
  }

  await options.debug?.(
    `Starting ${options.headed ? "headed" : "headless"} Chromium at port ${port}`,
  );

  const child = spawn(executablePath, args, {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  const wsEndpoint = await waitForWebSocketEndpoint(port);

  return {
    headed: options.headed,
    pid: child.pid ?? 0,
    port,
    userDataDir,
    wsEndpoint,
  };
}

async function getChromiumExecutablePath(): Promise<string> {
  const executablePath = chromium.executablePath();

  try {
    await access(executablePath);
    return executablePath;
  } catch {
    throw new Error(
      [
        `Chromium executable for Playwright ${playwrightPackage.version} was not found:`,
        executablePath,
        "",
        "Install it with:",
        `  npx playwright@${playwrightPackage.version} install chromium`,
        "",
        "To inspect installed Playwright browsers:",
        `  npx playwright@${playwrightPackage.version} install --list`,
      ].join("\n"),
    );
  }
}

async function isBrowserStateUsable(browser: BrowserState): Promise<boolean> {
  if (!isProcessAlive(browser.pid)) {
    return false;
  }

  try {
    const response = await fetch(`http://127.0.0.1:${browser.port}/json/version`);
    if (!response.ok) {
      return false;
    }

    const payload = (await response.json()) as { webSocketDebuggerUrl?: string };
    return payload.webSocketDebuggerUrl === browser.wsEndpoint;
  } catch {
    return false;
  }
}

async function waitForWebSocketEndpoint(port: number): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        const payload = (await response.json()) as { webSocketDebuggerUrl?: string };

        if (payload.webSocketDebuggerUrl) {
          return payload.webSocketDebuggerUrl;
        }
      }
    } catch {}

    await delay(100);
  }

  throw new Error("Timed out waiting for Chromium remote debugging endpoint.");
}

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (typeof address !== "object" || address === null) {
        reject(new Error("Could not allocate a local port."));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(address.port);
      });
    });
  });
}

async function cleanupBrowserFiles(browser: BrowserState, tmpdir?: string): Promise<void> {
  await rm(browser.userDataDir, {
    force: true,
    maxRetries: 10,
    recursive: true,
    retryDelay: 100,
  });
  await rm(getInpagerunTmpDir(tmpdir), {
    force: true,
    maxRetries: 10,
    recursive: true,
    retryDelay: 100,
  });
}

async function waitForProcessExit(pid: number): Promise<void> {
  if (pid <= 0) {
    return;
  }

  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (!isProcessAlive(pid)) {
      return;
    }

    await delay(100);
  }
}

export function createPageId(): string {
  return `page_${randomBytes(3).toString("hex")}`;
}
