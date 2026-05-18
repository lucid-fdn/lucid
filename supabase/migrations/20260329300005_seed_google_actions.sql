-- Migration: Seed Google (Gmail + Drive) actions into oauth_action_catalog
-- 16 actions total: 10 read + 5 write + 1 destructive

INSERT INTO oauth_action_catalog (provider, provider_display_name, action_name, description, endpoint, method, provider_config_key, parameter_schema, danger_level, idempotent, read_only, sort_order) VALUES

-- Gmail read actions
('google', 'Google', 'list_emails',
 'List Gmail messages with optional filtering by label or search query.',
 'https://gmail.googleapis.com/gmail/v1/users/me/messages', 'GET', 'google',
 '{"type":"object","properties":{"maxResults":{"type":"number","description":"Maximum number of messages to return"},"labelIds":{"type":"array","items":{"type":"string"},"description":"Filter by label IDs"},"query":{"type":"string","description":"Gmail search query string"},"pageToken":{"type":"string","description":"Page token for pagination"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 0),

('google', 'Google', 'read_email',
 'Read a specific Gmail message including body, headers, and attachment metadata.',
 'https://gmail.googleapis.com/gmail/v1/users/me/messages/:messageId', 'GET', 'google',
 '{"type":"object","properties":{"messageId":{"type":"string","description":"The ID of the message to read"}},"required":["messageId"],"additionalProperties":false}'::jsonb,
 'read', true, true, 1),

('google', 'Google', 'search_emails',
 'Search Gmail messages using Gmail search syntax.',
 'https://gmail.googleapis.com/gmail/v1/users/me/messages', 'GET', 'google',
 '{"type":"object","properties":{"query":{"type":"string","description":"Gmail search query (supports from:, to:, subject:, has: operators)"},"maxResults":{"type":"number","description":"Maximum number of results to return"},"pageToken":{"type":"string","description":"Page token for pagination"}},"required":["query"],"additionalProperties":false}'::jsonb,
 'read', true, true, 2),

('google', 'Google', 'fetch_attachment',
 'Fetch the content of a Gmail attachment.',
 'https://gmail.googleapis.com/gmail/v1/users/me/messages/:messageId/attachments/:attachmentId', 'GET', 'google',
 '{"type":"object","properties":{"messageId":{"type":"string","description":"The ID of the message containing the attachment"},"attachmentId":{"type":"string","description":"The ID of the attachment to fetch"}},"required":["messageId","attachmentId"],"additionalProperties":false}'::jsonb,
 'read', true, true, 3),

-- Gmail write actions
('google', 'Google', 'send_email',
 'Send an email using Gmail.',
 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', 'POST', 'google',
 '{"type":"object","properties":{"to":{"type":"string","description":"Recipient email address"},"subject":{"type":"string","description":"Email subject line"},"body":{"type":"string","description":"Email body content"},"from":{"type":"string","description":"Sender email address (optional, uses default)"}},"required":["to","subject","body"],"additionalProperties":false}'::jsonb,
 'write', false, false, 4),

('google', 'Google', 'reply_to_email',
 'Reply to an existing Gmail message in the same thread.',
 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', 'POST', 'google',
 '{"type":"object","properties":{"messageId":{"type":"string","description":"The ID of the message to reply to"},"body":{"type":"string","description":"Reply body content"},"cc":{"type":"string","description":"CC recipient email address"}},"required":["messageId","body"],"additionalProperties":false}'::jsonb,
 'write', false, false, 5),

-- Drive read actions
('google', 'Google', 'find_file',
 'Search for files by name or query in Google Drive.',
 'https://www.googleapis.com/drive/v3/files', 'GET', 'google',
 '{"type":"object","properties":{"query":{"type":"string","description":"Drive search query string"},"cursor":{"type":"string","description":"Page token for pagination"},"pageSize":{"type":"number","description":"Maximum number of results to return"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 6),

('google', 'Google', 'find_folder',
 'Search for a folder by name or query.',
 'https://www.googleapis.com/drive/v3/files', 'GET', 'google',
 '{"type":"object","properties":{"name":{"type":"string","description":"Folder name to search for"}},"required":["name"],"additionalProperties":false}'::jsonb,
 'read', true, true, 7),

('google', 'Google', 'list_files',
 'List immediate files and folders for a folder ID, or root when omitted.',
 'https://www.googleapis.com/drive/v3/files', 'GET', 'google',
 '{"type":"object","properties":{"folderId":{"type":"string","description":"Folder ID to list contents of (omit for root)"},"cursor":{"type":"string","description":"Page token for pagination"},"limit":{"type":"number","description":"Maximum number of results to return"},"includeSharedDrives":{"type":"boolean","description":"Whether to include shared drive items"}},"additionalProperties":false}'::jsonb,
 'read', true, true, 8),

('google', 'Google', 'get_file_metadata',
 'Get detailed metadata and permissions for a Google Drive file.',
 'https://www.googleapis.com/drive/v3/files/:fileId', 'GET', 'google',
 '{"type":"object","properties":{"fileId":{"type":"string","description":"The ID of the file to get metadata for"}},"required":["fileId"],"additionalProperties":false}'::jsonb,
 'read', true, true, 9),

-- Drive write actions
('google', 'Google', 'create_folder',
 'Create a new folder in Google Drive.',
 'https://www.googleapis.com/drive/v3/files', 'POST', 'google',
 '{"type":"object","properties":{"name":{"type":"string","description":"Name of the new folder"},"parentId":{"type":"string","description":"Parent folder ID (omit for root)"}},"required":["name"],"additionalProperties":false}'::jsonb,
 'write', false, false, 10),

('google', 'Google', 'upload_document',
 'Upload plain text or base64 file content up to 5 MB.',
 'https://www.googleapis.com/upload/drive/v3/files', 'POST', 'google',
 '{"type":"object","properties":{"name":{"type":"string","description":"File name"},"content":{"type":"string","description":"File content (plain text or base64)"},"mimeType":{"type":"string","description":"MIME type of the file"},"isBase64":{"type":"boolean","description":"Whether content is base64-encoded"},"folderId":{"type":"string","description":"Destination folder ID"},"description":{"type":"string","description":"File description"}},"required":["name","content","mimeType"],"additionalProperties":false}'::jsonb,
 'write', false, false, 11),

('google', 'Google', 'copy_file',
 'Copy a file to a destination.',
 'https://www.googleapis.com/drive/v3/files/:fileId/copy', 'POST', 'google',
 '{"type":"object","properties":{"fileId":{"type":"string","description":"The ID of the file to copy"},"name":{"type":"string","description":"Name for the copy"},"destinationFolderId":{"type":"string","description":"Destination folder ID"}},"required":["fileId"],"additionalProperties":false}'::jsonb,
 'write', false, false, 12),

('google', 'Google', 'move_file',
 'Move a file to a different folder.',
 'https://www.googleapis.com/drive/v3/files/:fileId', 'PATCH', 'google',
 '{"type":"object","properties":{"fileId":{"type":"string","description":"The ID of the file to move"},"fromFolderId":{"type":"string","description":"Current parent folder ID"},"toFolderId":{"type":"string","description":"Destination folder ID"}},"required":["fileId","fromFolderId","toFolderId"],"additionalProperties":false}'::jsonb,
 'write', true, false, 13),

('google', 'Google', 'share_file',
 'Share a Google Drive file with a specific person.',
 'https://www.googleapis.com/drive/v3/files/:fileId/permissions', 'POST', 'google',
 '{"type":"object","properties":{"fileId":{"type":"string","description":"The ID of the file to share"},"email":{"type":"string","description":"Email address of the person to share with"},"role":{"type":"string","description":"Permission role","enum":["reader","writer","commenter"]},"sendNotification":{"type":"boolean","description":"Whether to send a notification email"}},"required":["fileId","email","role"],"additionalProperties":false}'::jsonb,
 'write', true, false, 14),

-- Drive destructive actions
('google', 'Google', 'delete_file',
 'Delete a file or folder from Google Drive.',
 'https://www.googleapis.com/drive/v3/files/:fileId', 'DELETE', 'google',
 '{"type":"object","properties":{"fileId":{"type":"string","description":"The ID of the file or folder to delete"}},"required":["fileId"],"additionalProperties":false}'::jsonb,
 'destructive', false, false, 15)

ON CONFLICT (provider, action_name) DO NOTHING;
