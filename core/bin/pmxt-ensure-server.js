#!/usr/bin/env node

/**
 * PMXT Server Launcher
 * 
 * This script ensures the PMXT sidecar server is running.
 * It's designed to be called by SDKs in any language (Python, Java, C#, Go, etc.)
 * 
 * Behavior:
 * 1. Check if server is already running (via lock file)
 * 2. If running, exit successfully
 * 3. If not running, spawn the server and wait for health check
 * 4. Exit with code 0 on success, 1 on failure
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const http = require('http');

const LOCK_FILE = path.join(os.homedir(), '.pmxt', 'server.lock');
const DEFAULT_PORT = 3847;
const HEALTH_CHECK_TIMEOUT = 10000; // 10 seconds
const HEALTH_CHECK_INTERVAL = 100; // 100ms

/**
 * Check if the server is currently running
 */
function isServerRunning() {
    try {
        if (!fs.existsSync(LOCK_FILE)) {
            return false;
        }

        const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf-8'));
        const { pid, port } = lockData;

        // Check if process exists
        try {
            process.kill(pid, 0); // Signal 0 checks existence without killing
            return { running: true, pid, port };
        } catch (err) {
            // Process doesn't exist, remove stale lock file
            fs.unlinkSync(LOCK_FILE);
            return false;
        }
    } catch (err) {
        return false;
    }
}

/**
 * Remove the lock we just proved unhealthy, without deleting a newer sidecar's
 * lock if another launcher won the race and replaced it first.
 */
function removeLockFileIfMatches(staleLock) {
    try {
        if (!fs.existsSync(LOCK_FILE)) {
            return false;
        }
        const currentLock = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf-8'));
        if (currentLock.pid === staleLock.pid && currentLock.port === staleLock.port) {
            fs.unlinkSync(LOCK_FILE);
            return true;
        }
    } catch (err) {
        return false;
    }
    return false;
}

/**
 * Wait for server to respond to health check
 */
function waitForHealth(port, timeout = HEALTH_CHECK_TIMEOUT) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();

        const checkHealth = () => {
            const req = http.get(`http://localhost:${port}/health`, (res) => {
                if (res.statusCode === 200) {
                    resolve(true);
                } else {
                    scheduleNextCheck();
                }
            });

            req.on('error', () => {
                scheduleNextCheck();
            });

            req.setTimeout(1000);
        };

        const scheduleNextCheck = () => {
            if (Date.now() - startTime > timeout) {
                reject(new Error('Server health check timeout'));
            } else {
                setTimeout(checkHealth, HEALTH_CHECK_INTERVAL);
            }
        };

        checkHealth();
    });
}

/**
 * Wait for the lock file to appear, then health-check the port it specifies.
 *
 * The sidecar may bind a non-default port when the default is occupied by an
 * orphan.  Polling DEFAULT_PORT would be fooled by the orphan, so we wait for
 * the new sidecar to write its lock file and health-check THAT port.
 */
function waitForLockAndHealth(timeout = HEALTH_CHECK_TIMEOUT) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();

        const poll = () => {
            if (Date.now() - startTime > timeout) {
                return reject(new Error('Server health check timeout (lock file never appeared)'));
            }

            try {
                if (fs.existsSync(LOCK_FILE)) {
                    const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf-8'));
                    const port = lockData.port || DEFAULT_PORT;
                    // Lock file appeared — now health-check the actual port
                    const remaining = timeout - (Date.now() - startTime);
                    waitForHealth(port, Math.max(remaining, 1000))
                        .then(resolve)
                        .catch(reject);
                    return;
                }
            } catch (err) {
                // Lock file partially written or unreadable — retry
            }

            setTimeout(poll, HEALTH_CHECK_INTERVAL);
        };

        poll();
    });
}

/**
 * Start the PMXT server
 */
async function startServer() {
    // 1. Try to find the server binary/script
    let serverCmd = 'pmxt-server';
    let args = [];

    // Check for Python-bundled server (when bundled in pip package)
    const pythonBundledServer = path.join(__dirname, '..', 'server', 'bundled.js');
    // Check for local dev bundled server
    const localBundledServer = path.join(__dirname, '..', 'dist', 'server', 'bundled.js');
    const localDistServer = path.join(__dirname, '..', 'dist', 'server', 'index.js');
    const localBinServer = path.join(__dirname, 'pmxt-server');

    if (fs.existsSync(pythonBundledServer)) {
        serverCmd = 'node';
        args = [pythonBundledServer];
    } else if (fs.existsSync(localBundledServer)) {
        serverCmd = 'node';
        args = [localBundledServer];
    } else if (fs.existsSync(localDistServer)) {
        serverCmd = 'node';
        args = [localDistServer];
    } else if (fs.existsSync(localBinServer)) {
        serverCmd = localBinServer;
    }

    // Open a log file for the sidecar so SDK consumers can call
    // `pmxt.server.logs()` and see real output. Falls back to 'ignore' if the
    // file cannot be opened (e.g. read-only home directory).
    const logFile = path.join(os.homedir(), '.pmxt', 'server.log');
    let stdio = 'ignore';
    try {
        fs.mkdirSync(path.dirname(logFile), { recursive: true });
        const fd = fs.openSync(logFile, 'a');
        stdio = ['ignore', fd, fd];
    } catch (err) {
        // Keep stdio: 'ignore' on failure - logging is best-effort.
    }

    // Spawn server as detached process
    const serverProcess = spawn(serverCmd, args, {
        detached: true,
        stdio,
        env: process.env
    });

    // Detach from parent process
    serverProcess.unref();

    // Wait for the sidecar to write its lock file, then health-check
    // the actual port it bound (which may differ from DEFAULT_PORT if
    // an orphan sidecar is occupying it).
    await waitForLockAndHealth();
}

/**
 * Main entry point
 */
async function main() {
    try {
        // Check if server is already running
        const serverStatus = isServerRunning();

        if (serverStatus && serverStatus.running) {
            // Server is running, verify it's healthy
            try {
                await waitForHealth(serverStatus.port, 2000);
                process.exit(0);
            } catch (err) {
                // Server process exists but not responding, try to start fresh
                console.error('Server process exists but not responding, starting fresh...');
                removeLockFileIfMatches(serverStatus);
            }
        }

        // Start the server
        await startServer();
        process.exit(0);
    } catch (err) {
        console.error('Failed to ensure server is running:', err.message);
        process.exit(1);
    }
}

main();
