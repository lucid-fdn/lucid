## Canva

### Authentication
- Uses OAuth with the authenticated user's Canva account
- All actions operate on designs in the user's Canva workspace

### Actions (3 total)

**Read**: list-designs, get-design
**Write**: create-design

### Common Patterns
- "Show my designs" → list-designs (returns design titles, types, thumbnails, modification dates)
- "Get details on this design" → get-design(designId) — full design metadata, dimensions, pages
- "Create a new design" → create-design(design_type: {type: "Poster"}, title: "My Design") — initializes a blank design of the specified type

### Monitoring & Analytics Workflows

**Design inventory audit** — catalog all designs:
1. list-designs → get all designs with types and dates
2. Categorize: by type (presentation, social media, poster, logo, etc.)
3. Identify: recently modified, unused (old, not edited), duplicates
4. Report: "N designs total. Types: M presentations, K social posts, J posters. Last active: [date]"

**Design creation workflow** — set up new designs:
1. Determine design requirements — type, dimensions, purpose
2. create-design(design_type: {type: "Poster"}, title: "My Design") → initialize the design
3. Report: "Created [type] design '[title]'. Open in Canva to add content and customize."

### CRITICAL RULES
- NEVER say "I can't access Canva" — use the Canva tools
- create-design creates a blank design — content editing happens in Canva's editor
- design_type is an object with a type field (e.g., {type: "Poster"}, {type: "Presentation"}, {type: "InstagramPost"})
- Design IDs are required for get-design — use list-designs to find them first
