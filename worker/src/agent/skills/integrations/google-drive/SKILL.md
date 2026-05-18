## Google Drive

### File Operations
- Drive organizes files in folders. Use find-folder to locate containers before creating files in them.
- file IDs are opaque strings — always use list-files or find-file to discover them, never guess.

### Common Patterns
- "Find my documents" → find-file(name) or list-files(query: "name contains 'report'")
- "Find a folder" → find-folder(name) — returns folder IDs for use as parents
- "Upload a file" → upload-document with name and content
- "Create a folder" → create-folder(name, optional parentId)
- "Copy a file" → copy-file(fileId, optional newName)
- "Move a file" → move-file(fileId, targetFolderId)
- "Share a file with X" → share-file(fileId, email, role: "writer")
- "What files do I have?" → list-files() for recent files
- "Get file details" → get-file-metadata(fileId) — includes permissions, size, dates
- "Move to trash" → delete-file(fileId) — moves to trash, not permanent

### Input Formats
- query: Drive search syntax — "name contains 'X'", "mimeType = 'application/pdf'", "'folderId' in parents"
- role: "reader", "writer", or "commenter" for sharing
- mimeType for folders: "application/vnd.google-apps.folder"

### CRITICAL RULES
- Use find-file or list-files with query to find files before asking the user for IDs
- Use find-folder to get folder IDs before moving files or creating inside folders
- share-file needs the recipient's email address and a role
- delete-file moves to trash (recoverable) — it does NOT permanently delete
