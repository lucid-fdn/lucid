#!/usr/bin/env python3
"""Authenticate gh CLI and set DOCS_SYNC_PAT secret on the SDK repo."""
import subprocess
import os
import sys

# Get the git credential token
p = subprocess.Popen(
    ["git", "credential", "fill"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
)
out, _ = p.communicate(b"protocol=https\nhost=github.com\n\n")
cred_lines = out.decode().strip().split("\n")
token = None
for line in cred_lines:
    if line.startswith("password="):
        token = line.split("=", 1)[1]
        break

if not token:
    print("ERROR: Could not extract git credential token")
    sys.exit(1)

print(f"Got token: {token[:10]}...")

# Find gh CLI path
gh_path = None
for path_dir in os.environ.get("Path", "").split(";"):
    candidate = os.path.join(path_dir, "gh.exe")
    if os.path.exists(candidate):
        gh_path = candidate
        break

if not gh_path:
    # Try common install locations
    for candidate in [
        r"C:\Program Files\GitHub CLI\gh.exe",
        r"C:\Program Files (x86)\GitHub CLI\gh.exe",
        os.path.expanduser(r"~\AppData\Local\Programs\GitHub CLI\gh.exe"),
    ]:
        if os.path.exists(candidate):
            gh_path = candidate
            break

if not gh_path:
    # Search in PATH from system env
    import winreg
    try:
        key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment")
        sys_path = winreg.QueryValueEx(key, "Path")[0]
        winreg.CloseKey(key)
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Environment")
        usr_path = winreg.QueryValueEx(key, "Path")[0]
        winreg.CloseKey(key)
        full_path = sys_path + ";" + usr_path
        for path_dir in full_path.split(";"):
            candidate = os.path.join(path_dir, "gh.exe")
            if os.path.exists(candidate):
                gh_path = candidate
                break
    except Exception:
        pass

if not gh_path:
    print("ERROR: Could not find gh CLI. Try reopening terminal.")
    sys.exit(1)

print(f"Found gh at: {gh_path}")

# Step 1: Authenticate gh CLI
print("\n1. Authenticating gh CLI...")
p = subprocess.Popen(
    [gh_path, "auth", "login", "--with-token"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
)
out, err = p.communicate(token.encode())
if p.returncode != 0:
    print(f"Auth error: {err.decode()}")
    # Try anyway, might already be authenticated
else:
    print("   Authenticated successfully!")

# Step 2: Verify auth
print("\n2. Verifying auth...")
p = subprocess.run([gh_path, "auth", "status"], capture_output=True, text=True)
print(f"   {p.stdout.strip()}")
if p.stderr:
    print(f"   {p.stderr.strip()}")

# Step 3: Set DOCS_SYNC_PAT secret on SDK repo
print("\n3. Setting DOCS_SYNC_PAT secret on raijinlabs/lucid-ai-sdk...")
p = subprocess.Popen(
    [gh_path, "secret", "set", "DOCS_SYNC_PAT", "--repo", "raijinlabs/lucid-ai-sdk"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
)
out, err = p.communicate(token.encode())
print(f"   stdout: {out.decode().strip()}")
if err.decode().strip():
    print(f"   stderr: {err.decode().strip()}")
print(f"   Return code: {p.returncode}")

if p.returncode == 0:
    print("\n✅ DOCS_SYNC_PAT secret set successfully!")
    print("   The SDK repo will now trigger instant docs sync on changes.")
else:
    print("\n❌ Failed to set secret. You may need to set it manually.")
    print("   Go to: https://github.com/raijinlabs/lucid-ai-sdk/settings/secrets/actions")