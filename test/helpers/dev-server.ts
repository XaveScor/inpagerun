import type { OutgoingHttpHeaders } from "node:http";
import { type ViteDevServer, createServer } from "vite";

export interface TestDevServer {
  url: string;
  close: () => Promise<void>;
}

export async function startDevServer(options: {
  root: string;
  headers?: OutgoingHttpHeaders;
}): Promise<TestDevServer> {
  const server = await createServer({
    appType: "spa",
    configFile: false,
    logLevel: "silent",
    publicDir: false,
    root: options.root,
    server: {
      headers: options.headers,
      host: "127.0.0.1",
    },
  });

  await server.listen(0);

  return {
    close() {
      return server.close();
    },
    url: getLocalServerUrl(server),
  };
}

function getLocalServerUrl(server: ViteDevServer): string {
  const url = server.resolvedUrls?.local[0];

  if (!url) {
    throw new Error("Vite dev server did not expose a local URL.");
  }

  return url;
}
