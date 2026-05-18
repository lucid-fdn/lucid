#!/bin/bsash

# Vercel Automated Setup Script
# This script configures your Vercel project with proper environment variables and settings

set -e  # Exit on error

echo "🚀 Vercel Automated Setup"
echo "========================="
echo ""

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "📦 Installing Vercel CLI..."
    npm install -g vercel@latest
fi

# Login to Vercel
echo "🔐 Logging into Vercel..."
echo "Please log in with your Vercel account in the browser window that opens."
vercel login

# Link project
echo ""
echo "🔗 Linking project to Vercel..."
echo "When prompted, select your existing project or create a new one."
vercel link

# Set environment variables for Production
echo ""
echo "⚙️  Setting up Production environment variables..."

# NEXT_PUBLIC_ENVIRONMENT
vercel env add NEXT_PUBLIC_ENVIRONMENT production << EOF
production
EOF

echo "✅ Set NEXT_PUBLIC_ENVIRONMENT=production"

# Set environment variables for Preview (Staging)
echo ""
echo "⚙️  Setting up Preview/Staging environment variables..."

vercel env add NEXT_PUBLIC_ENVIRONMENT preview << EOF
staging
EOF

echo "✅ Set NEXT_PUBLIC_ENVIRONMENT=staging for preview deployments"

# Set Git integration settings
echo ""
echo "📝 Configuring Git integration..."
echo "Setting production branch to 'main'..."

# Note: These settings need to be configured in Vercel dashboard
# The CLI doesn't have commands for these yet
echo ""
echo "⚠️  Manual steps required in Vercel Dashboard:"
echo "   1. Go to: Settings → Git"
echo "   2. Set Production Branch: main"
echo "   3. Enable Branch Deployments: ✅"
echo ""

# Deploy to staging for testing
echo "🧪 Deploying to staging for testing..."
git checkout staging
vercel --yes

echo ""
echo "✨ Setup Complete!"
echo "=================="
echo ""
echo "📊 Your deployment pipeline:"
echo "   • main branch → Production (lucidmerged.com)"
echo "   • staging branch → Preview URL"
echo "   • develop branch → Preview URL"
echo "   • feature/* branches → Preview URLs"
echo ""
echo "🔍 Next steps:"
echo "   1. Visit Vercel dashboard to verify settings"
echo "   2. Push to staging branch to test"
echo "   3. Check Sentry dashboard for environment filtering"
echo ""
echo "📚 Full documentation: docs/DEPLOYMENT_PIPELINE_SETUP.md"
