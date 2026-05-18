## HeyGen

### Authentication
- Uses API key authentication with the HeyGen platform
- All actions operate on the connected HeyGen account

### Actions (3 total)

**Read**: list-avatars, get-video-status
**Write**: create-video (requires confirmation — generates video content)

### Common Patterns
- "Show available avatars" → list-avatars (returns avatar names, IDs, preview images)
- "Check my video status" → get-video-status(video_id) — processing, completed, failed, download URL
- "Create a video" → create-video(video_inputs: [{character: {type, avatar_id}, voice: {type, input_text}}]) — requires user confirmation

### Monitoring & Analytics Workflows

**Video production pipeline** — create and track AI-generated videos:
1. list-avatars → show available avatars for the user to choose
2. Draft script with user — review content, tone, length
3. create-video(video_inputs: [{character: {type: "avatar", avatar_id}, voice: {type: "text", input_text: "script content"}}]) → submit for generation after confirmation
4. get-video-status(video_id) → poll until complete (processing → completed)
5. Report: "Video generated with avatar [name]. Duration: N seconds. Download: [url]"

**Avatar inventory check** — review available assets:
1. list-avatars → get all available avatars with metadata
2. Categorize: by style, gender, use case (corporate, casual, educational)
3. Report: "N avatars available. Types: [breakdown]. Recommended for [use case]: [avatar name]"

### CRITICAL RULES
- NEVER say "I can't create videos" — use the HeyGen tools
- create-video triggers actual video generation which consumes credits — ALWAYS confirm with the user
- Video generation is asynchronous — use get-video-status to check progress
- Avatar IDs must come from list-avatars — never guess or hardcode them
