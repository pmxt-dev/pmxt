import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { ServerManager } from "../pmxt/server-manager";

function okHealthResponse(): Response {
  return new Response(JSON.stringify({ status: "ok" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function withTempHome(run: (home: string) => Promise<void>): Promise<void> {
  const previousHome = process.env.HOME;
  const home = mkdtempSync(join(tmpdir(), "pmxt-ts-server-manager-"));

  process.env.HOME = home;
  try {
    await run(home);
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    rmSync(home, { recursive: true, force: true });
  }
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("ServerManager lock ownership", () => {
  it("does not treat a healthy default-port server as running without the current HOME lock", async () => {
    await withTempHome(async (home) => {
      const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue(okHealthResponse());
      const manager = new ServerManager({ maxRetries: 1, retryDelayMs: 1 });
      const managerWithLockPath = manager as unknown as { lockPath: string };
      managerWithLockPath.lockPath = join(home, ".pmxt", "server.lock");

      await expect(manager.isServerRunning()).resolves.toBe(false);
      await expect(manager.health()).resolves.toBe(false);
      await expect(manager.status()).resolves.toMatchObject({
        running: false,
        pid: null,
        port: null,
        version: null,
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
