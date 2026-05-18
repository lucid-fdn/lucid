#!/usr/bin/env python3
"""Remove fake AI tools pages and their navigation entries from docs."""
import json
import os

os.chdir("c:/docs")

# 1. Remove fake AI tools pages
removed = []
for f in ["ai-tools/cursor.mdx", "ai-tools/claude-code.mdx", "ai-tools/windsurf.mdx"]:
    if os.path.exists(f):
        os.remove(f)
        removed.append(f)
        print(f"Removed: {f}")

# Remove empty ai-tools dir
if os.path.exists("ai-tools") and not os.listdir("ai-tools"):
    os.rmdir("ai-tools")
    print("Removed: ai-tools/ (empty dir)")

# 2. Remove AI Tools group from docs.json navigation
with open("docs.json", "r") as f:
    data = json.load(f)

tabs = data.get("navigation", {}).get("tabs", [])
for tab in tabs:
    if tab.get("tab") == "SDKs & Tools":
        groups = tab.get("groups", [])
        original_count = len(groups)
        tab["groups"] = [g for g in groups if g.get("group") != "AI Tools"]
        new_count = len(tab["groups"])
        if new_count < original_count:
            print(f"Removed AI Tools group from SDKs & Tools tab ({original_count} -> {new_count} groups)")
        for g in tab["groups"]:
            group_name = g.get("group", "unnamed")
            page_count = len(g.get("pages", []))
            print(f"  Kept: {group_name} ({page_count} pages)")

with open("docs.json", "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")

print(f"\nDone - removed {len(removed)} fake AI tools files")