"""
Server Manager for PMXT Python SDK

This module handles automatic server lifecycle management.
The pattern implemented here is universal and can be replicated in any language SDK.

Universal Pattern:
1. Check if server is running (via lock file + process check)
2. If not running, call pmxt-ensure-server launcher
3. Wait for health check to confirm server is ready
4. Proceed with API calls

This ensures zero-configuration usage across all SDKs.
"""

import os
import json
import time
import subprocess
import shutil
import threading
from pathlib import Path
from typing import List, Optional, Dict, Any
import urllib.request
import urllib.error


class ServerManager:
    """
    Manages the PMXT sidecar server lifecycle.
    
    This class implements the universal server management pattern that
    should be replicated in all language SDKs (Java, C#, Go, etc.)
    """
    
    DEFAULT_PORT = 3847
    HEALTH_CHECK_TIMEOUT = 10  # seconds
    HEALTH_CHECK_INTERVAL = 0.1  # seconds

    # Process-wide coalescing of concurrent ensure_server_running() calls.
    #
    # Each Exchange instance constructs its own ServerManager and each one
    # may call ensure_server_running() from a different thread. Without a
    # shared lock, N concurrent threads all see "no server running", all
    # spawn their own sidecar via pmxt-ensure-server, and the lock file
    # ends up pointing at whichever spawn wrote last. Each Exchange has
    # already captured its own base URL, so most requests end up hitting a
    # sidecar whose access token does NOT match the token read from the
    # lock file, and every request returns 401 Unauthorized.
    #
    # This lock is class-level on purpose — all ServerManager instances in
    # the process share the same sidecar and the same lock file, so they
    # must share the same critical section.
    _ensure_lock = threading.Lock()

    def __init__(self, base_url: str = "http://localhost:3847") -> None:
        """
        Initialize the server manager.
        
        Args:
            base_url: Base URL where server should be running
        """
        self.base_url = base_url
        self.lock_path = Path.home() / '.pmxt' / 'server.lock'
        self._port = self._extract_port_from_url(base_url)
    
    def _extract_port_from_url(self, url: str) -> int:
        """Extract port number from URL."""
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            return parsed.port or self.DEFAULT_PORT
        except (ValueError, AttributeError):
            return self.DEFAULT_PORT
    
    def ensure_server_running(self) -> None:
        """
        Ensure the PMXT server is running.

        This is the main entry point that SDKs should call.
        It implements the universal pattern:
        1. Check if server is alive
        2. If not, start it via launcher
        3. Wait for health check

        Concurrent calls across all ServerManager instances in the process
        are serialized through a class-level lock so that only one spawn
        attempt happens at a time. See the comment on
        ``ServerManager._ensure_lock`` for why this matters.

        Raises:
            Exception: If server fails to start or become healthy
        """
        with ServerManager._ensure_lock:
            # Step 1: Check if force restart is requested (DEV MODE)
            if os.getenv('PMXT_ALWAYS_RESTART') == '1':
                self._kill_old_server()

            # Step 2: Check if server is already running and matches version.
            # This re-check INSIDE the lock is critical: the thread that won
            # the race will have spawned the sidecar and written the lock
            # file by the time later threads acquire the lock, so they must
            # observe "already running" and return without spawning again.
            if self.is_server_alive():
                if self._is_version_mismatch():
                    self._kill_old_server()
                else:
                    return

            # Step 3: Kill orphan sidecars so the new one can bind the default port
            self._kill_orphan_sidecars()

            # Step 4: Start server via launcher
            self._start_server_via_launcher()

            # Step 5: Wait for health check
            self._wait_for_health()

    def _is_version_mismatch(self) -> bool:
        """Check if running server version matches expected version."""
        server_info = self.get_server_info()
        if not server_info or 'version' not in server_info:
            return True # Old server without version

        # Get expected version
        # 1. Check production path (bundled)
        pkg_path = Path(__file__).parent / '_server' / 'package.json'

        # 2. Check dev path (monorepo)
        if not pkg_path.exists():
            pkg_path = Path(__file__).parent.parent.parent.parent / 'core' / 'package.json'

        if pkg_path.exists():
            try:
                data = json.loads(pkg_path.read_text())
                expected_version = data.get('version')
                server_version = server_info['version']

                if expected_version:
                    # Extract major.minor.patch (ignore prerelease/dev suffixes)
                    def normalize_version(v: str) -> str:
                        """Extract major.minor.patch, ignoring -dev, -b4, etc."""
                        # Remove -dev.xxx or -b4 suffixes
                        base = v.split('-')[0]
                        # Get major.minor.patch
                        parts = base.split('.')[:3]
                        return '.'.join(parts)

                    expected_base = normalize_version(expected_version)
                    server_base = normalize_version(server_version)

                    # Only restart if major.minor.patch differs
                    # This allows 1.0.0 and 1.0.0-b4 to coexist in dev
                    if expected_base != server_base:
                        return True
            except (OSError, json.JSONDecodeError, AttributeError, KeyError, TypeError, ValueError):
                pass

        return False

    def stop(self) -> None:
        """
        Stop the currently running server.

        This reads the lock file to find the process ID and sends a SIGTERM.
        """
        self._kill_old_server()

    def restart(self) -> None:
        """
        Restart the server.

        Stops the current server if running, and starts a fresh one.
        """
        self.stop()
        self.ensure_server_running()

    def start(self) -> None:
        """
        Start the server if it is not already running.

        This is idempotent: if the server is already running and healthy,
        this method returns immediately without restarting.
        """
        self.ensure_server_running()

    def status(self) -> Dict[str, Any]:
        """
        Get a structured snapshot of the sidecar server state.

        Returns a new dict on every call (no shared mutable state). Fields:
            running:        True if the server is alive and responding to /health
            pid:            Process ID from the lock file (None if not running)
            port:           Port the server is listening on (None if not running)
            version:        Server version reported in the lock file (None if absent)
            uptime_seconds: Seconds since the lock file was created (None if absent)
            lock_file:      Absolute path to the lock file
        """
        info = self.get_server_info() or {}
        running = self.is_server_alive()

        timestamp = info.get('timestamp')
        uptime: Optional[float] = None
        if isinstance(timestamp, (int, float)):
            # Lock file timestamps may be epoch seconds or epoch milliseconds.
            now_seconds = time.time()
            ts_seconds = timestamp / 1000.0 if timestamp > 1e12 else float(timestamp)
            delta = now_seconds - ts_seconds
            if delta >= 0:
                uptime = delta

        return {
            'running': running,
            'pid': info.get('pid'),
            'port': info.get('port'),
            'version': info.get('version'),
            'uptime_seconds': uptime,
            'lock_file': str(self.lock_path),
        }

    def health(self) -> bool:
        """
        Check whether the server's /health endpoint is currently responsive.

        Returns:
            True if the server responds with status "ok", False otherwise.
        """
        return self.is_server_alive()

    def logs(self, n: int = 50) -> List[str]:
        """
        Return the last `n` lines from the sidecar server log file.

        The launcher writes server stdout/stderr to ~/.pmxt/server.log.
        If the log file does not exist (older launcher, never started, or
        log was cleared), returns an empty list.

        Args:
            n: Maximum number of trailing lines to return (default 50).

        Returns:
            A new list of log line strings (newlines stripped). Returns an
            empty list if no log file is present.
        """
        if n <= 0:
            return []
        log_path = self.lock_path.parent / 'server.log'
        if not log_path.exists():
            return []
        try:
            with log_path.open('r', encoding='utf-8', errors='replace') as f:
                lines = f.readlines()
        except OSError:
            return []
        tail = lines[-n:] if len(lines) > n else list(lines)
        return [line.rstrip('\n') for line in tail]

    def _kill_orphan_sidecars(self) -> None:
        """Kill any orphaned pmxt sidecar processes.

        Orphans accumulate when Python processes exit without stopping their
        detached sidecar.  They occupy ports and can confuse the health check.
        Called before spawning a new sidecar so it can bind the default port.
        """
        import signal as _signal

        try:
            if os.name == 'nt':
                result = subprocess.run(
                    ['wmic', 'process', 'where',
                     "commandline like '%pmxt%bundled.js%'",
                     'get', 'processid'],
                    capture_output=True, text=True, timeout=5,
                )
                for line in result.stdout.strip().splitlines():
                    line = line.strip()
                    if line.isdigit():
                        subprocess.run(
                            ['taskkill', '/PID', line, '/F'],
                            capture_output=True, timeout=5,
                        )
            else:
                result = subprocess.run(
                    ['pgrep', '-f', 'pmxt.*bundled[.]js'],
                    capture_output=True, text=True, timeout=5,
                )
                for line in result.stdout.strip().splitlines():
                    pid = int(line.strip())
                    try:
                        os.kill(pid, _signal.SIGTERM)
                    except (OSError, ProcessLookupError):
                        pass

                if result.stdout.strip():
                    time.sleep(0.5)
        except (OSError, subprocess.TimeoutExpired, ValueError):
            pass

    def _kill_old_server(self) -> None:
        """Kill the currently running server (Internal)."""
        server_info = self.get_server_info()
        if server_info and 'pid' in server_info:
            pid = server_info['pid']
            try:
                if os.name == 'nt':
                    subprocess.run(
                        ['taskkill', '/PID', str(pid), '/F'],
                        capture_output=True, timeout=5
                    )
                else:
                    import signal
                    os.kill(pid, signal.SIGTERM)
                time.sleep(0.5)
            except (OSError, subprocess.TimeoutExpired):
                pass

            # Verify the process is actually dead; escalate to SIGKILL if not
            if os.name != 'nt':
                try:
                    os.kill(pid, 0)  # raises if dead
                    # Still alive — force kill
                    import signal
                    try:
                        os.kill(pid, signal.SIGKILL)
                        time.sleep(0.2)
                    except OSError:
                        pass
                except (OSError, ProcessLookupError):
                    pass  # Process is dead — good
        self._remove_stale_lock()
    
    def is_server_alive(self) -> bool:
        """
        Check if the server is currently running and healthy.
        
        This implements the universal alive check:
        1. Read lock file
        2. Check if process exists
        3. Optionally verify health endpoint
        
        Returns:
            True if server is running and healthy, False otherwise
        """
        # Check lock file exists
        if not self.lock_path.exists():
            return False
        
        try:
            # Read lock file
            lock_data = json.loads(self.lock_path.read_text())
            pid = lock_data.get('pid')
            port = lock_data.get('port', self.DEFAULT_PORT)
            
            if not pid:
                return False
            
            # Check if process exists (cross-platform)
            if not self._is_process_running(pid):
                # Process doesn't exist, remove stale lock file
                self._remove_stale_lock()
                return False
            
            # Quick health check to verify server is responsive
            return self._check_health(port, timeout=1)
                
        except (json.JSONDecodeError, OSError):
            return False
    
    def _is_process_running(self, pid: int) -> bool:
        """
        Check if a process with given PID is running.

        Cross-platform implementation.
        """
        if os.name == 'nt':
            # Windows: signal 0 doesn't work reliably, use tasklist instead
            try:
                result = subprocess.run(
                    ['tasklist', '/FI', f'PID eq {pid}', '/NH'],
                    capture_output=True, text=True, timeout=5
                )
                return str(pid) in result.stdout
            except Exception:
                return False
        else:
            try:
                os.kill(pid, 0)
                return True
            except (OSError, ProcessLookupError):
                return False
    
    def _remove_stale_lock(self) -> None:
        """Remove stale lock file."""
        try:
            self.lock_path.unlink()
        except OSError:
            pass
    
    def _start_server_via_launcher(self) -> None:
        """
        Start the server using the pmxt-ensure-server launcher.
        """
        # 1. Check for bundled server (PRODUCTION - installed via pip)
        launcher_filename = 'pmxt-ensure-server'
        if os.name == "nt": # Check if running Windows
            launcher_filename += ".js"

        bundled_launcher = Path(__file__).parent / '_server' / 'bin' / launcher_filename

        # 2. Check for monorepo structure (DEVELOPMENT)
        current_file = Path(__file__).resolve()
        local_launcher = current_file.parent.parent.parent.parent / 'core' / 'bin' / launcher_filename

        # 3. Check PATH (GLOBAL INSTALL)
        path_launcher = shutil.which(launcher_filename)

        # Priority order: bundled > local dev > PATH
        if bundled_launcher.exists():
            launcher = str(bundled_launcher)
        elif local_launcher.exists():
            launcher = str(local_launcher)
        elif path_launcher:
            launcher = path_launcher
        else:
            raise Exception(
                "pmxt-ensure-server not found.\n"
                "This should have been bundled with the package.\n"
                "Please reinstall: pip install --force-reinstall pmxt\n"
                "Or install the server manually: npm install -g pmxt-core"
            )
        
        # Call the launcher
        try:
            # If it's a JS file, and we are calling it directly, might need node
            cmd = [launcher]
            if launcher.endswith('.js') or not os.access(launcher, os.X_OK):
                cmd = ['node', launcher]

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=self.HEALTH_CHECK_TIMEOUT
            )
            
            if result.returncode != 0:
                raise Exception(
                    f"Failed to start server: {result.stderr or result.stdout}"
                )
        except subprocess.TimeoutExpired:
            raise Exception("Server startup timeout")
        except Exception as e:
            raise Exception(f"Failed to start server: {e}")
    
    def _wait_for_health(self) -> None:
        """
        Wait for the server to respond to health checks.

        Reads the port from the lock file on each iteration so that we
        health-check the actual sidecar, not a stale orphan on the default
        port.
        """
        start_time = time.time()

        while time.time() - start_time < self.HEALTH_CHECK_TIMEOUT:
            info = self.get_server_info()
            port = info.get('port') if info else None
            if port and self._check_health(port):
                return

            time.sleep(self.HEALTH_CHECK_INTERVAL)

        raise Exception(
            f"Server failed to become healthy within {self.HEALTH_CHECK_TIMEOUT}s"
        )
    
    def _check_health(self, port: int, timeout: int = 2) -> bool:
        """
        Check if server is healthy by calling /health endpoint.
        
        Args:
            port: Port to check
            timeout: Request timeout in seconds
            
        Returns:
            True if server responds with 200 OK
        """
        try:
            url = f"http://localhost:{port}/health"
            req = urllib.request.Request(url)
            
            with urllib.request.urlopen(req, timeout=timeout) as response:
                if response.status == 200:
                    data = json.loads(response.read().decode())
                    return data.get('status') == 'ok'
            
            return False
        except (urllib.error.URLError, urllib.error.HTTPError, Exception):
            return False
    
    def get_server_info(self) -> Optional[Dict[str, Any]]:
        """
        Get information about the running server from lock file.
        
        Returns:
            Dictionary with server info (port, pid, timestamp) or None
        """
        if not self.lock_path.exists():
            return None
        
        try:
            return json.loads(self.lock_path.read_text())
        except (OSError, json.JSONDecodeError):
            return None
    
    def get_running_port(self) -> int:
        """
        Get the actual port the server is running on.
        
        This reads the lock file to determine the actual port,
        which may differ from the default if the default port was busy.
        
        Returns:
            Port number the server is running on, or DEFAULT_PORT if unknown
        """
        info = self.get_server_info()
        if info and 'port' in info:
            return info['port']
        return self.DEFAULT_PORT
