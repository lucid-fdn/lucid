#!/usr/bin/env python3
"""Check AI tools pages and logo status in docs repo."""
import os
import subprocess

os.chdir("c:/docs")

# Check AI tools pages
print("=== AI Tools Pages ===")
ai_tools = [
    "ai-tools/cursor.mdx",
    "ai-tools/claude-code.mdx",
    "ai-tools/windsurf.mdx",
    "sdks/mcp-server.mdx",
]
for f in ai_tools:
    path = os.path.join("c:/docs", f)
    exists = os.path.exists(path)
    size = os.path.getsize(path) if exists else 0
    status = "EXISTS" if exists else "MISSING"
    print(f"  {f}: {status} ({size}b)")

# Check logo
print("\n=== Logo Files ===")
r = subprocess.run(["git", "ls-files", "logo/"], capture_output=True, text=True)
print(f"  In git: {r.stdout.strip()}")

r2 = subprocess.run(["git", "status", "logo/", "--short"], capture_output=True, text=True)
print(f"  Status: {r2.stdout.strip() if r2.stdout.strip() else 'Clean (tracked)'}")

logo_path = "c:/docs/logo/lucid_w.png"
if os.path.exists(logo_path):
    size = os.path.getsize(logo_path)
    print(f"  lucid_w.png size: {size} bytes")
    # Check if it's a valid PNG
    with open(logo_path, "rb") as f:
        header = f.read(8)
        is_png = header[:4] == b"\x89PNG"
        print(f"  Valid PNG header: {is_png}")
else:
    print("  lucid_w.png: NOT FOUND")

# Check if ai-tools directory exists
print("\n=== ai-tools directory ===")
if os.path.exists("c:/docs/ai-tools"):
    print(f"  Files: {os.listdir('c:/docs/ai-tools')}")
else:
    print("  Directory does NOT exist")

# Show first few lines of each AI tools file if they exist
for f in ai_tools:
    path = os.path.join("c:/docs", f)
    if os.path.exists(path):
        print(f"\n=== {f} (first 5 lines) ===")
        with open(path, "r", encoding="utf-8") as fh:
            for i, line in enumerate(fh):
                if i >= 5:
                    break
                print(f"  {line.rstrip()}")