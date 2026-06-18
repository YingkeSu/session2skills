import { join } from "node:path";
import { app, BrowserWindow } from "electron";

import { loadSettings } from "./settings.js";

type RequestHandler = (req: Request) => Promise<Response>;
type HonoApp = { fetch: RequestHandler };
type CreateServerFn = (runsDir: string, opts: { projectDirectory: string }) => HonoApp;
type ServeOptions = { fetch: RequestHandler; port: number; hostname: string };
type ServerHandle = { close: (cb?: () => void) => void };
type ServeFn = (opts: ServeOptions, cb: (info: { port: number }) => void) => ServerHandle;

const preloadPath = join(__dirname, "preload.js");

let mainWindow: BrowserWindow | null = null;
let serverInstance: ServerHandle | null = null;

async function startApp(): Promise<void> {
  const settings = loadSettings();
  const projectDirectory = settings.projectDirectory || process.cwd();

  const serverModule = await import(join(__dirname, "../dist/server/app.js")) as Record<string, unknown>;
  const honoNodeServer = await import("@hono/node-server") as Record<string, unknown>;

  const createServer = serverModule.createServer as CreateServerFn;
  const serve = honoNodeServer.serve as ServeFn;

  const runsDirectory = join(projectDirectory, "generated-skills");
  const honoApp = createServer(runsDirectory, { projectDirectory });

  const server = serve(
    { fetch: honoApp.fetch, port: 0, hostname: "127.0.0.1" },
    (info: { port: number }) => {
      console.log(`Electron server running at http://localhost:${info.port}`);

      mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
          preload: preloadPath,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });

      mainWindow.loadURL(`http://localhost:${info.port}`);

      mainWindow.on("closed", () => {
        mainWindow = null;
      });
    },
  );

  serverInstance = server;
}

app.whenReady().then(startApp).catch((err: unknown) => {
  console.error("Failed to start Electron app:", err);
  app.quit();
});

app.on("window-all-closed", () => {
  if (serverInstance) {
    serverInstance.close(() => {
      app.quit();
    });
  } else {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (serverInstance) {
    serverInstance.close();
    serverInstance = null;
  }
});
