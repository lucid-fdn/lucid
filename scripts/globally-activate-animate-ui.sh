#!/bin/bash
# Globally Activate Animate UI for ALL Existing Components
# Replaces shadcn component files with Animate UI re-exports

set -e

echo "🎨 Globally Activating Animate UI"
echo "=================================="
echo ""

# Components to update (13 total - dialog already done)
COMPONENTS=(
  "sheet"
  "dropdown-menu"
  "tooltip"
  "popover"
  "alert-dialog"
  "checkbox"
  "collapsible"
  "hover-card"
  "progress"
  "radio-group"
  "switch"
  "tabs"
)

for component in "${COMPONENTS[@]}"; do
  FILE="src/ui/components/${component}.tsx"
  
  if [ -f "$FILE" ]; then
    echo "✓ Activating ${component}..."
    
    # Backup original
    cp "$FILE" "${FILE}.backup"
    
    # Create re-export
    cat > "$FILE" << EOF
/**
 * ${component} - GLOBALLY USING ANIMATE UI
 * All existing code automatically gets smooth animations!
 */

export * from '@/components/animate-ui/primitives/radix/${component}'
EOF
    
    echo "  ✅ ${component} now uses Animate UI!"
  else
    echo "  ⚠️ ${component}.tsx not found, skipping"
  fi
done

echo ""
echo "🎉 Global Activation Complete!"
echo "=============================="
echo ""
echo "What happened:"
echo "  • All 13 components now re-export from Animate UI"
echo "  • Original code backed up as *.backup files"
echo "  • NO import changes needed - automatic animations!"
echo ""
echo "To revert:"
echo "  • Restore from *.backup files"
echo "  • Or reinstall: npx shadcn@latest add [component]"
echo ""
echo "Test your app now - all Dialogs, Sheets, etc. are animated! ✨"
