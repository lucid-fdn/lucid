# Final Animation Migration - All 37 Files
## Adding Explicit Durations to Remaining Files

**Target:** Add explicit durations to all transition classes  
**Pattern:** `transition-[type]` → `transition-[type] duration-[n]`

---

## Duration Rules:

| Transition Type | Duration | Use Case |
|----------------|----------|----------|
| `transition-colors` | `duration-120` | Instant color changes (hover) |
| `transition-opacity` | `duration-200` | Fade effects |
| `transition-shadow` | `duration-200` | Shadow elevation |
| `transition-transform` | `duration-120` | Scale, rotate (instant) |
| `transition-all` | `duration-200` | Multiple properties |

---

## Files to Update (37 total):

### Batch 1: UI Components (10 files)
1. src/ui/components/breadcrumb.tsx - transition-colors
2. src/ui/components/AgentMenu.tsx - transition-colors (2x)
3. src/ui/components/AgentIcon.tsx - transition-opacity (2x)
4. src/ui/components/sheet.tsx - transition-opacity
5. src/ui/components/sidebar.tsx - transition-transform
6. src/ui/components/slider.tsx - Already has duration ✅
7. src/ui/components/dialog.tsx - transition-opacity
8. src/components/ui/AgentMenu.tsx - transition-colors (2x)
9. src/components/ui/AgentIcon.tsx - transition-opacity (2x)
10. src/components/ui/dialog.tsx - transition-opacity

### Batch 2: Chat Components (4 files)
11. src/components/Chat/ChatInput.tsx - transition-colors (4x)
12. src/components/Chat/ChatBubble.tsx - transition-colors (10x)

### Batch 3: Forms & Interactions (5 files)
13. src/components/forms/username-field.tsx - transition-colors
14. src/components/forms/avatar-upload-v2.tsx - transition-opacity
15. src/components/interactions/RatingStars.tsx - transition-transform

### Batch 4: Navigation (6 files)
16. src/components/navigation/nav-logo.tsx - transition-transform
17. src/components/navigation/nav-org-switcher.tsx - transition-colors (2x)
18. src/components/navigation/nav-user-menu.tsx - transition-all
19. src/components/navigation/nav-notifications.tsx - transition-colors
20. src/components/navigation/secondary-nav.tsx - transition-opacity
21. src/components/navigation/unified-navbar.tsx - transition-colors (4x)

### Batch 5: Marketplace & Workflow (6 files)
22. src/components/marketplace/CompanyHoverCard.tsx - transition-colors
23. src/components/marketplace/CompanyFollowCard.tsx - transition-colors
24. src/components/marketplace/AssetCard.tsx - transition-colors (2x), transition
25. src/components/workflow/nodes/custom-node.tsx - transition-all
26. src/components/workflow/execution/execution-history.tsx - transition-shadow
27. src/components/workflow/ai-workflow-dialog.tsx - transition-colors

### Batch 6: Settings & Workspace (6 files)
28. src/components/settings/advanced-security-card.tsx - transition-colors
29. src/components/settings/organizations-settings.tsx - transition-colors
30. src/components/settings/notification-preferences-form.tsx - transition-colors (2x)
31. src/components/settings/team-settings.tsx - transition-colors
32. src/components/workspace-onboarding/* - transition-all (4 files)

---

## Status: Ready to execute
