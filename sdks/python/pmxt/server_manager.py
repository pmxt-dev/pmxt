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
from pathlib import Path
from typing import Optional, Dict, Any
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
    
    def __init__(self, base_url: str = "http://localhost:3847"):
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
        except:
            return self.DEFAULT_PORT
    
    def ensure_server_running(self) -> None:
        """
        Ensure the PMXT server is running.
        
        This is the main entry point that SDKs should call.
        It implements the universal pattern:
        1. Check if server is alive
        2. If not, start it via launcher
        3. Wait for health check
        
        Raises:
            Exception: If server fails to start or become healthy
        """
        # Step 1: Check if force restart is requested (DEV MODE)
        if os.getenv('PMXT_ALWAYS_RESTART') == '1':
            self._kill_old_server()

        # Step 2: Check if server is already running and matches version
        if self.is_server_alive():
            if self._is_version_mismatch():
                # print("PMXT: Version mismatch detected. Restarting server...")
                self._kill_old_server()
            else:
                return
        
        # Step 3: Start server via launcher
        self._start_server_via_launcher()
        
        # Step 4: Wait for health check
        self._wait_for_health()

    def _is_version_mismatch(self) -> bool:
        """Check if running server version matches expected version."""
        server_info = self.get_server_info()
        if not server_info or 'version' not in server_info:
            return True # Old server without version
        
        # Get expected version
        try:
            # 1. Check production path (bundled)
            pkg_path = Path(__file__).parent / '_server' / 'package.json'
            
            # 2. Check dev path (monorepo)
            if not pkg_path.exists():
                # Traverse up to find core/package.json
                pkg_path = Path(__file__).parent.parent.parent.parent / 'core' / 'package.json'

            if pkg_path.exists():
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
        except:
            pass
            
        return False

    def _kill_old_server(self) -> None:
        """Kill the currently running server."""
        server_info = self.get_server_info()
        if server_info and 'pid' in server_info:
            import signal
            try:
                os.kill(server_info['pid'], signal.SIGTERM)
                # Brief wait for cleanup
                time.sleep(0.5)
            except:
                pass
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
            try:
                return self._check_health(port, timeout=1)
            except:
                # Process exists but not responding
                return False
                
        except (json.JSONDecodeError, OSError):
            return False
    
    def _is_process_running(self, pid: int) -> bool:
        """
        Check if a process with given PID is running.
        
        Cross-platform implementation.
        """
        try:
            # Signal 0 doesn't kill the process, just checks if it exists
            os.kill(pid, 0)
            return True
        except (OSError, ProcessLookupError):
            return False
    
    def _remove_stale_lock(self) -> None:
        """Remove stale lock file."""
        try:
            self.lock_path.unlink()
        except:
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
        
        Universal pattern: Poll /health endpoint until it responds or timeout.
        """
        start_time = time.time()
        
        while time.time() - start_time < self.HEALTH_CHECK_TIMEOUT:
            try:
                if self._check_health(self._port):
                    return
            except:
                pass
            
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
        except:
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
