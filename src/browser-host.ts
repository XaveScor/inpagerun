import { randomBytes } from "node:crypto";
import { access, mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { spawn } from "node:child_process";
import { type Browser, chromium } from "playwright";
import {
  type BrowserState,
  type ExtensionState,
  getInpagerunTmpDir,
  isProcessAlive,
} from "./state";

const require = createRequire(import.meta.url);
const playwrightPackage = require("playwright/package.json") as { version: string };

export interface StartDetachedBrowserOptions {
  debug?: (message: string) => Promise<void> | void;
  extensions?: ExtensionState[];
  headed: boolean;
  tmpdir?: string;
}

export async function connectDetachedBrowser(browser: BrowserState): Promise<Browser> {
  return await chromium.connectOverCDP(browser.wsEndpoint);
}

export async function closeDetachedBrowser(browserState: BrowserState): Promise<void> {
  try {
    const browser = await connectDetachedBrowser(browserState);
    const session = await browser.newBrowserCDPSession();
    await session.send("Browser.close");
    await browser.close().catch(() => {});
  } catch {}

  await waitForProcessExit(browserState.pid);
  await cleanupBrowserFiles(browserState);
}

export async function startDetachedBrowser(
  options: StartDetachedBrowserOptions,
): Promise<BrowserState> {
  const port = await getFreePort();
  const rootDir = getInpagerunTmpDir(options.tmpdir);
  const executablePath = await getChromiumExecutablePath();
  await mkdir(rootDir, { recursive: true });
  await validateExtensionDirectories(options.extensions ?? []);

  const userDataDir = await mkdtemp(path.join(rootDir, "profile-"));
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--password-store=basic",
    "--use-mock-keychain",
  ];
  const extensionPaths = options.extensions?.map((extension) => extension.path) ?? [];

  if (extensionPaths.length > 0) {
    const joined = extensionPaths.join(",");
    args.push(`--disable-extensions-except=${joined}`, `--load-extension=${joined}`);
  }

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

async function validateExtensionDirectories(extensions: ExtensionState[]): Promise<void> {
  for (const extension of extensions) {
    let stats;

    try {
      stats = await stat(extension.path);
    } catch {
      throw new Error(`Extension path does not exist: ${extension.path}`);
    }

    if (!stats.isDirectory()) {
      throw new Error(`Extension path must be a directory: ${extension.path}`);
    }
  }
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

async function cleanupBrowserFiles(browser: BrowserState): Promise<void> {
  await rm(browser.userDataDir, {
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

export function createSessionId(): string {
  return `session_${randomBytes(3).toString("hex")}`;
}
