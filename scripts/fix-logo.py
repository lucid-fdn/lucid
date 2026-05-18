#!/usr/bin/env python3
"""Fix logo config in docs.json to use SVGs and create missing favicon."""
import json
import os
import shutil

os.chdir("c:/docs")

# 1. Update docs.json logo to use SVGs
with open("docs.json", "r") as f:
    data = json.load(f)

data["logo"] = {
    "light": "/logo/light.svg",
    "dark": "/logo/dark.svg",
}
data["favicon"] = "/logo/lucid_w.png"

with open("docs.json", "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")

print("Updated docs.json:")
print(f"  logo.light = /logo/light.svg")
print(f"  logo.dark = /logo/dark.svg")
print(f"  favicon = /logo/lucid_w.png")

print("\nDone! Logo will now use SVGs (better quality, no S3 403 issues).")