# Seed Data for Marketplace Engagement

## Overview

This seed script adds realistic likes and bookmarks to marketplace assets to make the platform feel established and provide social proof.

## What It Does

**Adds engagement data for 16 curated models:**

### Top Tier (1,200-2,100 likes)
- **Sora** - 2,134 likes (48% bookmarked) - Most popular
- **GPT-5** - 1,847 likes (42% bookmarked)
- **ElevenLabs V3** - 1,823 likes (44% bookmarked)
- **Claude 3.5 Sonnet** - 1,632 likes (38% bookmarked)
- **DeepSeek-R1** - 1,456 likes (52% bookmarked) - Trending in quant
- **Gemini 2.0** - 1,289 likes (35% bookmarked)

### Mid Tier (500-1,400 likes)
- **DALL-E 3** - 1,456 likes (42% bookmarked)
- **Veo 3** - 1,124 likes (40% bookmarked)
- **Flux.1 Pro** - 945 likes (38% bookmarked)
- **Llama 3.1 70B** - 876 likes (36% bookmarked)
- **Mistral Large 2** - 623 likes (32% bookmarked)
- **QuantConnect LEAN** - 534 likes (48% bookmarked)

### Niche (80-230 likes)
- **Grok 4** - 234 likes (28% bookmarked)
- **Qwen 2.5** - 178 likes (32% bookmarked)
- **Command R+** - 156 likes (34% bookmarked)
- **Phi-4** - 89 likes (30% bookmarked)

## How To Run

### Option 1: Via Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Open `migrations/020_seed_likes_bookmarks.sql`
4. Copy the entire content
5. Paste into SQL Editor
6. Click **Run**

### Option 2: Via Supabase CLI

```bash
# If using Supabase CLI
supabase db push
```

### Option 3: Direct PostgreSQL

```bash
# Connect to your database
psql your_connection_string

# Run the migration
\i migrations/020_seed_likes_bookmarks.sql
```

## Expected Output

```
NOTICE:  ✅ Seed data added successfully!
NOTICE:     - Top tier models: 6 models with 1200-2100 likes each
NOTICE:     - Mid tier models: 6 models with 500-1400 likes each
NOTICE:     - Niche models: 4 models with 80-230 likes each
NOTICE:     - Bookmarks: 30-52% of likes
NOTICE:     - Time range: Last 30-120 days
```

## Important Notes

### Safe to Re-Run
- Uses `ON CONFLICT DO NOTHING` - won't create duplicates
- Safe to run multiple times
- Won't affect real user likes/bookmarks

### Dummy Users
- Creates 20 random user IDs for seed data
- These are NOT real users in your system
- Just for engagement count display

### Time Distribution
- Engagement spread over last 30-120 days
- Creates realistic growth curves
- More recent for trending models

## Customization

Want to add more models or change counts? Edit the script:

```sql
-- Add a new model
v_like_count := 500;  -- Change this number
v_bookmark_ratio := 0.40;  -- 40% will bookmark
FOR i IN 1..v_like_count LOOP
  -- ... insert logic
END LOOP;
```

## Removing Seed Data

To remove all seed data:

```sql
-- This will remove ALL likes and bookmarks (including real ones!)
-- Use with caution in production!
DELETE FROM public.asset_likes;
DELETE FROM public.bookmarks;
```

## Benefits

✅ **Social Proof** - New users see active marketplace  
✅ **Trust Building** - Popular models have engagement  
✅ **Decision Making** - Users can see what others like  
✅ **Realistic Feel** - Platform doesn't feel empty  
✅ **Trend Indicators** - Recent models have recent engagement  

## Next Steps

After running this seed:

1. **Verify counts** - Check cards show like/bookmark counts
2. **Test interactivity** - Real users can still add their own
3. **Monitor growth** - Seed + real engagement = healthy metrics
4. **Add more** - Easy to extend with more models

## Questions?

- Seed data is in `asset_likes` and `bookmarks` tables
- User interactions work on top of seed data
- Won't interfere with real user engagement
- Can be cleared anytime if needed
