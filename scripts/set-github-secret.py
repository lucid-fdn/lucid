#!/usr/bin/env python3
"""Set DOCS_SYNC_PAT secret on raijinlabs/lucid-ai-sdk via GitHub API."""
import subprocess
import urllib.request
import json
import base64
from nacl import encoding, public

REPO_OWNER = "raijinlabs"
REPO_NAME = "lucid-ai-sdk"
SECRET_NAME = "DOCS_SYNC_PAT"

# Step 1: Get git credential token
print("1. Getting git credential...")
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
    print("ERROR: Could not get token")
    exit(1)
print(f"   Token: {token[:10]}...")

# Step 2: Get repo public key for secret encryption
print("\n2. Getting repo public key...")
req = urllib.request.Request(
    f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/actions/secrets/public-key",
    headers={
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "Mozilla/5.0",
    },
)
try:
    resp = urllib.request.urlopen(req)
    key_data = json.loads(resp.read().decode())
    public_key = key_data["key"]
    key_id = key_data["key_id"]
    print(f"   Key ID: {key_id}")
except Exception as e:
    print(f"   ERROR: {e}")
    exit(1)

# Step 3: Encrypt the secret value
print("\n3. Encrypting secret...")
public_key_bytes = base64.b64decode(public_key)
sealed_box = public.SealedBox(public.PublicKey(public_key_bytes))
encrypted = sealed_box.encrypt(token.encode("utf-8"))
encrypted_b64 = base64.b64encode(encrypted).decode("utf-8")
print("   Encrypted successfully")

# Step 4: Set the secret
print(f"\n4. Setting {SECRET_NAME} on {REPO_OWNER}/{REPO_NAME}...")
body = json.dumps({
    "encrypted_value": encrypted_b64,
    "key_id": key_id,
}).encode("utf-8")

req = urllib.request.Request(
    f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/actions/secrets/{SECRET_NAME}",
    data=body,
    method="PUT",
    headers={
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0",
    },
)
try:
    resp = urllib.request.urlopen(req)
    status = resp.status
    print(f"   Response: {status}")
    if status in (201, 204):
        print(f"\n✅ {SECRET_NAME} set successfully on {REPO_OWNER}/{REPO_NAME}!")
        print("   SDK repo will now trigger instant docs sync on changes.")
    else:
        print(f"\n⚠️  Unexpected status: {status}")
except urllib.error.HTTPError as e:
    print(f"   ERROR: {e.code} - {e.read().decode()}")
    exit(1)