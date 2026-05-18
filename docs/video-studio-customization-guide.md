# Lucid Video Studio — Customization Guide

> **Audience:** Marketing team, sales engineers, solution architects
> **Last updated:** February 2025

---

## Overview

Lucid Video Studio lets users generate branded, data-driven videos programmatically — no editing software required. Videos are composed from modular **scenes**, styled with **brand kits**, and rendered in multiple **output formats** optimized for every distribution channel.

This document covers every customization dimension available today, plus schema-ready capabilities shipping soon.

---

## 1. Templates

Pre-built starting points that define a default scene lineup and category. Users pick a template, then customize everything below.

| Template | Category | Default Scenes | Use Case |
|----------|----------|---------------|----------|
| **Weekly Metrics Report** | Data Report | Title → Data Chart → CTA | Weekly KPI recaps, investor updates |
| **Social Clip** | Marketing | Title → Text Overlay → Image Showcase → CTA | Social media ads, product teasers |
| **Personalized Outreach** | Outreach | Title → Text Overlay → CTA | Sales prospecting, ABM campaigns |
| **Changelog Video** | Product | Title → Image Showcase → CTA | Release notes, feature announcements |
| **Team Update** | Internal | Title → Text Overlay → CTA | All-hands recaps, team standups |

Templates are fully extensible — new templates can be added to the database with custom schema definitions for field-level control.

---

## 2. Scene Types

Videos are built from an ordered sequence of scenes. Users can add, remove, reorder, and configure each scene independently.

### Title Scene
The opening hero screen. Large headline with an optional subtitle.

| Field | Description |
|-------|-------------|
| **Text** | Main headline (e.g., "Q4 Revenue Report") |
| **Subtitle** | Secondary line (e.g., "Prepared for the Board of Directors") |

*Animation: Title fades in and slides upward, decorative accent line grows across, subtitle fades in with stagger.*

### Text Overlay Scene
A content card for delivering key messages or talking points.

| Field | Description |
|-------|-------------|
| **Heading** | Bold heading text |
| **Text** | Body paragraph content |
| **Position** | Horizontal alignment: `Left`, `Center`, or `Right` |

*Animation: Card slides in from the left with fade. Heading uses the brand secondary color.*

### Call-to-Action (CTA) Scene
A closing screen designed to drive action.

| Field | Description |
|-------|-------------|
| **Text** | Headline (e.g., "Get Started Today") |
| **Button Text** | CTA label (e.g., "Book a Demo", "Learn More") |
| **URL** | Destination link (embedded in metadata for interactive players) |

*Animation: Headline fades in, button scales in with bounce easing, then pulses continuously to draw attention.*

### Image Showcase Scene
Feature a product screenshot, photo, or visual asset.

| Field | Description |
|-------|-------------|
| **Image URL** | URL to the image asset |
| **Caption** | Optional caption text below the image |

*Animation: Container fades in, image applies a subtle Ken Burns zoom effect, caption fades in.*

### Data Chart Scene
Visualize metrics with animated bar charts — perfect for KPI reports and performance recaps.

| Field | Description |
|-------|-------------|
| **Title** | Chart title (e.g., "Revenue by Quarter") |
| **Labels** | Category labels (e.g., `["Q1", "Q2", "Q3", "Q4"]`) |
| **Values** | Numeric values for each bar (e.g., `[45, 72, 58, 90]`) |

*Animation: Bars grow upward sequentially with staggered timing. Bar colors cycle through brand primary, brand secondary, and complementary accent palette.*

### Per-Scene Timing

Every scene has an independent **duration** control (1–10 seconds, default 3s). Total video length is the sum of all scene durations.

---

## 3. Brand Kit

Every video inherits a brand kit that ensures visual consistency across all scenes.

### Available Today

| Option | Description | Example |
|--------|-------------|---------|
| **Primary Color** | Accent color for headlines, buttons, chart bars, decorative lines | `#6C63FF` (Lucid purple) |
| **Secondary Color** | Supporting color for subheadings, image borders, alternating chart bars | `#FF6584` (coral) |
| **Background Color** | Base background for all scenes | `#0F0F1A` (dark navy) |

All three colors are set via color pickers in the creation form.

### Coming Soon (Schema-Ready)

These fields are already defined in the data schema and will be exposed in the UI in upcoming releases:

| Option | Description |
|--------|-------------|
| **Heading Font** | Custom font family for titles and headings |
| **Body Font** | Custom font family for body text |
| **Logo URL** | Brand logo displayed on title and CTA scenes |
| **Watermark** | Toggle to overlay a subtle brand watermark on all frames |

---

## 4. Output Settings

### Format

| Format | Best For |
|--------|----------|
| **MP4** (H.264) | Universal — social media, email, websites, presentations |
| **WebM** (VP8/VP9) | Web-native playback, smaller file sizes |
| **GIF** | Lightweight loops for email signatures, Slack, documentation |

### Resolution Presets

| Preset | Dimensions | Aspect Ratio | Best For |
|--------|-----------|--------------|----------|
| **1080p** | 1920 × 1080 | 16:9 | YouTube, LinkedIn, presentations |
| **720p** | 1280 × 720 | 16:9 | Email embeds, faster renders |
| **Square** | 1080 × 1080 | 1:1 | Instagram feed, Facebook feed |
| **Story** | 1080 × 1920 | 9:16 | Instagram Stories, TikTok, YouTube Shorts |
| **Reel** | 1080 × 1350 | 4:5 | Instagram Reels, Facebook Reels |

### Frame Rate (Schema-Ready)

30 FPS (default) or 60 FPS — available via API, UI toggle coming soon.

---

## 5. Render Priority

| Tier | Infrastructure | Estimated Time | Best For |
|------|---------------|----------------|----------|
| **Standard** | Cloud server (Railway) | ~3–5 minutes | Batch generation, async workflows |
| **Burst** | Serverless (AWS Lambda) | ~1–2 minutes | Real-time demos, time-sensitive campaigns |

---

## 6. Audio (Coming Soon)

Audio customization is schema-defined and will be available in upcoming releases:

| Option | Description |
|--------|-------------|
| **Background Track** | Select or upload background music |
| **Voiceover Text** | Provide text for AI-generated voiceover (TTS) |
| **Volume** | Master volume control (0–100%) |

---

## 7. Dynamic Data Bindings (Coming Soon)

The `data_bindings` field accepts arbitrary key-value data that can be injected into scenes at render time. This enables:

- **Personalization at scale** — Merge fields like `{{recipient_name}}`, `{{company}}`, `{{metric_value}}`
- **Live data dashboards** — Pull real-time KPIs into Data Chart scenes
- **CRM integration** — Auto-populate outreach videos from contact records
- **A/B testing** — Generate variant videos with different copy, colors, or CTAs

---

## 8. Workflow Summary

```
1. Pick a template (or start blank)
2. Add and arrange scenes
3. Customize each scene's content
4. Apply brand colors
5. Choose output format and resolution
6. Submit render → track progress → download video
```

The entire flow is available through both the **Video Studio UI** (point-and-click) and the **REST API** (programmatic / agent-driven).

---

## 9. API-Driven Generation

For programmatic and agent-driven workflows, the full customization surface is available via API:

```
POST /api/video/renders
```

**Payload structure:**

```json
{
  "template_id": "social-clip-v1",
  "scenes": [
    { "type": "title", "text": "Q4 Results", "subtitle": "Record Growth", "duration": 4 },
    { "type": "data-chart", "title": "Revenue", "labels": ["Q1","Q2","Q3","Q4"], "values": [12,18,15,27], "duration": 5 },
    { "type": "cta", "text": "See the Full Report", "button_text": "Read More", "url": "https://...", "duration": 3 }
  ],
  "brand": {
    "colors": { "primary": "#6C63FF", "secondary": "#FF6584", "background": "#0F0F1A" }
  },
  "output": {
    "format": "mp4",
    "resolution": "1080p"
  },
  "priority": "standard"
}
```

Every field documented above maps directly to an API parameter.

---

## 10. Quick Reference — All Customization Dimensions

| # | Dimension | Options | Status |
|---|-----------|---------|--------|
| 1 | Template | 5 built-in + extensible via DB | Live |
| 2 | Scene types | Title, Text Overlay, CTA, Image Showcase, Data Chart | Live |
| 3 | Scene order | Drag-and-drop reorder, add/remove | Live |
| 4 | Scene duration | 1–10 seconds per scene | Live |
| 5 | Scene content | Type-specific text, URLs, data arrays | Live |
| 6 | Primary color | Any hex color | Live |
| 7 | Secondary color | Any hex color | Live |
| 8 | Background color | Any hex color | Live |
| 9 | Output format | MP4, WebM, GIF | Live |
| 10 | Output resolution | 1080p, 720p, Square, Story, Reel | Live |
| 11 | Render priority | Standard (~5min), Burst (~2min) | Live |
| 12 | Heading font | Custom font family | Schema-ready |
| 13 | Body font | Custom font family | Schema-ready |
| 14 | Logo | Brand logo URL | Schema-ready |
| 15 | Watermark | On/off toggle | Schema-ready |
| 16 | Background audio | Music track URL | Schema-ready |
| 17 | AI voiceover | Text-to-speech from script | Schema-ready |
| 18 | Volume control | 0–100% | Schema-ready |
| 19 | Frame rate | 30 or 60 FPS | Schema-ready |
| 20 | Data bindings | Dynamic merge fields for personalization | Schema-ready |
