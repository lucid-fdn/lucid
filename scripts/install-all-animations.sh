#!/bin/bash
# Complete Animation Library Installation Script
# Installs ALL Animate UI + Magic UI components at once

set -e  # Exit on error

echo "🎨 Installing Complete Animation System"
echo "========================================"
echo ""

# Part 1: Magic UI Components (User Priority)
echo "📦 Part 1: Magic UI Components (3 components)"
echo "----------------------------------------------"

echo "Installing typing-animation..."
npx @magicui/cli@latest add typing-animation

echo "Installing shine-border..."
npx @magicui/cli@latest add shine-border

echo "Installing animated-list..."
npx @magicui/cli@latest add animated-list

echo "✅ Magic UI components installed!"
echo ""

# Part 2: Animate UI Radix Components (ALL 17)
echo "📦 Part 2: Animate UI Radix Components (17 components)"
echo "------------------------------------------------------"

echo "Installing Accordion..."
npx shadcn@latest add @animate-ui/radix-accordion

echo "Installing Alert Dialog..."
npx shadcn@latest add @animate-ui/radix-alert-dialog

echo "Installing Checkbox..."
npx shadcn@latest add @animate-ui/radix-checkbox

echo "Installing Collapsible..."
npx shadcn@latest add @animate-ui/radix-collapsible

echo "Installing Dialog..."
npx shadcn@latest add @animate-ui/radix-dialog

echo "Installing Dropdown Menu..."
npx shadcn@latest add @animate-ui/radix-dropdown-menu

echo "Installing Files..."
npx shadcn@latest add @animate-ui/radix-files

echo "Installing Hover Card..."
npx shadcn@latest add @animate-ui/radix-hover-card

echo "Installing Popover..."
npx shadcn@latest add @animate-ui/radix-popover

echo "Installing Progress..."
npx shadcn@latest add @animate-ui/radix-progress

echo "Installing Radio Group..."
npx shadcn@latest add @animate-ui/radix-radio-group

echo "Installing Sheet..."
npx shadcn@latest add @animate-ui/radix-sheet

echo "Installing Switch..."
npx shadcn@latest add @animate-ui/radix-switch

echo "Installing Tabs..."
npx shadcn@latest add @animate-ui/radix-tabs

echo "Installing Toggle..."
npx shadcn@latest add @animate-ui/radix-toggle

echo "Installing Toggle Group..."
npx shadcn@latest add @animate-ui/radix-toggle-group

echo "Installing Tooltip..."
npx shadcn@latest add @animate-ui/radix-tooltip

echo "✅ All Animate UI Radix components installed!"
echo ""

# Summary
echo "🎉 Installation Complete!"
echo "========================="
echo ""
echo "Installed:"
echo "  • 3 Magic UI components"
echo "  • 17 Animate UI Radix components"
echo "  • Total: 20 animated components"
echo ""
echo "Next steps:"
echo "  1. Review docs/ANIMATE_UI_IMPLEMENTATION_GUIDE.md"
echo "  2. Update imports in your components"
echo "  3. Test all animations"
echo "  4. Enjoy beautiful animations! ✨"
echo ""
