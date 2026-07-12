"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerManager = void 0;

const { accessSync, constants: fsConstants, existsSync, readFileSync, unlinkSync } = require("node:fs");
const { homedir } = require("node:os");
const { delimiter, dirname, join } = require("node:path");
const { spawn } = require("node:child_process");

class ServerManager {
  static DEFAULT_PORT = 3847;
  static ensurePromise = null;

  constructor(options = {}) {
    this.baseUrl = options.baseUrl || `http://localhost:${ServerManager.DEFAULT_PORT}`;
    this.maxRetries = options.maxRetries || 30;
    this.retryDelayMs = options.retryDelayMs || 1000;
    this.lockPath = join(homedir(), ".pmxt", "server.lock");
  }

  getServerInfo() {
    try {
      if (!existsSync(this.lockPath)) return null;
      return JSON.parse(readFileSync(this.lockPath, "utf8"));
    } catch {
      return null;
    }
  }

  getRunningPort() {
    return this.getServerInfo()?.port || ServerManager.DEFAULT_PORT;
  }

  getAccessToken() {
    return this.getServerInfo()?.accessToken;
  }

  async isServerRunning() {
    const info = this.getServerInfo();
    if (!info?.port) return false;

    try {
      const response = await fetch(`http://localhost:${info.port}/health`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) return false;
      const data = await response.json();
      return data?.status === "ok";
    } catch {
      return false;
    }
  }

  async waitForServer() {
    for (let i = 0; i < this.maxRetries; i += 1) {
      const info = this.getServerInfo();
      if (info?.port) {
        try {
          const response = await fetch(`http://localhost:${info.port}/health`, {
            signal: AbortSignal.timeout(5_000),
          });
          if (response.ok) {
            const data = await response.json();
            if (data?.status === "ok") return;
          }
        } catch {
          // Server is still booting.
        }
      }
      await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
    }
    throw new Error(`Server did not start within ${(this.maxRetries * this.retryDelayMs) / 1000}s`);
  }

  async ensureServerRunning() {
    if (ServerManager.ensurePromise) return ServerManager.ensurePromise;
    ServerManager.ensurePromise = this.doEnsureServerRunning().finally(() => {
      ServerManager.ensurePromise = null;
    });
    return ServerManager.ensurePromise;
  }

  async doEnsureServerRunning() {
    if (process.env.PMXT_ALWAYS_RESTART === "1") {
      await this.killOldServer();
    }

    if (await this.isServerRunning()) {
      if (await this.isVersionMismatch()) {
        await this.killOldServer();
      } else {
        return;
      }
    }

    const launcherPath = this.resolveLauncherPath();
    if (!launcherPath) {
      throw new Error(localInstallMessage());
    }
    const spawnCmd = launcherPath.endsWith(".js") ? process.execPath : launcherPath;
    const spawnArgs = launcherPath.endsWith(".js") ? [launcherPath] : [];

    try {
      await new Promise((resolve, reject) => {
        const proc = spawn(spawnCmd, spawnArgs, { detached: true, stdio: "ignore" });
        proc.once("error", reject);
        proc.once("spawn", () => {
          proc.unref();
          resolve();
        });
      });
      await this.waitForServer();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error([
        `Failed to start local PMXT instance: ${detail}`,
        "",
        "Local PMXT commands require pmxt-core to be installed.",
        "Install it with: npm install -g pmxt-core",
        "Or use the hosted API with: pmxt auth login --api-key <pmxt_api_key>",
      ].join("\n"));
    }
  }

  resolveLauncherPath() {
    const launcherName = process.platform === "win32" ? "pmxt-ensure-server.js" : "pmxt-ensure-server";
    try {
      const corePackageJson = require.resolve("pmxt-core/package.json");
      const candidate = join(dirname(corePackageJson), "bin", launcherName);
      if (existsSync(candidate)) return candidate;
    } catch {
      // Fall back to PATH.
    }
    return findExecutableOnPath(launcherName);
  }

  async isVersionMismatch() {
    const info = this.getServerInfo();
    if (!info?.version) return true;
    try {
      const corePackageJsonPath = require.resolve("pmxt-core/package.json");
      const pkg = JSON.parse(readFileSync(corePackageJsonPath, "utf8"));
      return Boolean(pkg.version && !String(info.version).startsWith(pkg.version));
    } catch {
      return false;
    }
  }

  async start() {
    await this.ensureServerRunning();
  }

  async stop() {
    await this.killOldServer();
  }

  async restart() {
    await this.stop();
    await this.start();
  }

  async status() {
    const info = this.getServerInfo();
    const running = await this.isServerRunning();
    let uptimeSeconds = null;
    if (typeof info?.timestamp === "number") {
      const tsSeconds = info.timestamp > 1e12 ? info.timestamp / 1000 : info.timestamp;
      const delta = Date.now() / 1000 - tsSeconds;
      if (delta >= 0) uptimeSeconds = delta;
    }
    return {
      running,
      pid: info?.pid ?? null,
      port: info?.port ?? null,
      version: info?.version ?? null,
      uptimeSeconds,
      lockFile: this.lockPath,
    };
  }

  async health() {
    return this.isServerRunning();
  }

  logs(n = 50) {
    if (n <= 0) return [];
    const logPath = join(dirname(this.lockPath), "server.log");
    try {
      if (!existsSync(logPath)) return [];
      const lines = readFileSync(logPath, "utf8").split(/\r?\n/);
      if (lines.at(-1) === "") lines.pop();
      return lines.length > n ? lines.slice(lines.length - n) : lines;
    } catch {
      return [];
    }
  }

  async killOldServer() {
    const info = this.getServerInfo();
    if (info?.pid) {
      try {
        process.kill(info.pid, "SIGTERM");
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch {
        // Already stopped.
      }
      try {
        process.kill(info.pid, 0);
        try {
          process.kill(info.pid, "SIGKILL");
          await new Promise((resolve) => setTimeout(resolve, 200));
        } catch {
          // Process exited between checks.
        }
      } catch {
        // Process is gone.
      }
    }
    try {
      unlinkSync(this.lockPath);
    } catch {
      // Best-effort lock cleanup.
    }
  }
}

function findExecutableOnPath(command) {
  const pathValue = process.env.PATH || "";
  const extensions = process.platform === "win32"
    ? (process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";")
    : [""];
  const candidates = process.platform === "win32" && !/\.[^\\/]+$/.test(command)
    ? extensions.map((ext) => `${command}${ext}`)
    : [command];
  for (const dir of pathValue.split(delimiter)) {
    if (!dir) continue;
    for (const name of candidates) {
      const candidate = join(dir, name);
      try {
        accessSync(candidate, fsConstants.X_OK);
        return candidate;
      } catch {
        // Keep searching.
      }
    }
  }
  return undefined;
}

function localInstallMessage() {
  return [
    "Local PMXT is not installed.",
    "",
    "Install the local runtime:",
    "  npm install -g pmxt-core",
    "",
    "Or use hosted PMXT:",
    "  pmxt auth login --api-key <pmxt_api_key>",
    "  pmxt <exchange> <command> --hosted",
  ].join("\n");
}

exports.ServerManager = ServerManager;
