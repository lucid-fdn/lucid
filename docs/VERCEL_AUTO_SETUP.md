# Vercel Automated Setup Guide

## Yes! Automated Setup Available 🎉

I've created automated setup scripts that configure your Vercel project with one command!

## Quick Start (Choose Your OS)

### Windows (PowerShell)
```powershell
# Run the automated setup
.\scripts\setup-vercel.ps1
```

### Mac/Linux (Bash)
```bash
# Make script executable
chmod +x scripts/setup-vercel.sh

# Run the automated setup
./scripts/setup-vercel.sh
```

## What the Script Does Automatically

✅ **Installs Vercel CLI** (if not already installed)
✅ **Logs you into Vercel** (browser authentication)
✅ **Links your project** (connects to existing or creates new)
✅ **Sets environment variables:**
   - `NEXT_PUBLIC_ENVIRONMENT=production` (for main branch)
   - `NEXT_PUBLIC_ENVIRONMENT=staging` (for preview branches)
✅ **Deploys to staging** (tests the setup)
✅ **Provides next steps**

## What's Automated

### 1. Vercel CLI Installation
```bash
npm install -g vercel@latest
```

### 2. Project Linking
```bash
vercel link
```
Links your local project to Vercel dashboard.

### 3. Environment Variables
Automatically adds:
- Production: `NEXT_PUBLIC_ENVIRONMENT=production`
- Preview/Staging: `NEXT_PUBLIC_ENVIRONMENT=staging`

### 4. Test Deployment
Deploys to staging branch to verify everything works.

## Manual Steps (Required)

Due to Vercel CLI limitations, you still need to manually:

**1. Set Production Branch**
   - Go to: Vercel Dashboard → Settings → Git
   - Set Production Branch: `main`
   - Takes 30 seconds

**2. Enable Branch Deployments**
   - Same location: Settings → Git
   - Enable automatic deployments: ✅

That's it! Everything else is automated.

## Full Automated Workflow

### Step 1: Run Setup Script (5 minutes)

**Windows:**
```powershell
.\scripts\setup-vercel.ps1
```

**Mac/Linux:**
```bash
chmod +x scripts/setup-vercel.sh
./scripts/setup-vercel.sh
```

### Step 2: Follow Prompts

The script will:
1. Install Vercel CLI
2. Open browser for login
3. Ask you to select/create project
4. Set environment variables
5. Deploy to staging

### Step 3: Manual Configuration (30 seconds)

1. Open: https://vercel.com/dashboard
2. Go to: Your Project → Settings → Git
3. Set Production Branch: `main`
4. Enable Branch Deployments: ✅

### Step 4: Test (2 minutes)

```bash
# Test staging deployment
git checkout staging
git commit -m "test: automated setup" --allow-empty
git push origin staging

# Check Vercel dashboard for preview URL
```

Done! 🎉

## What's Already Configured

### Git Branches (Already Created) ✅
```
main     → Production
staging  → Preview
develop  → Preview
```

### Sentry Integration ✅
All config files include:
```typescript
environment: process.env.NEXT_PUBLIC_ENVIRONMENT
```

Errors automatically tagged by environment!

### vercel.json Configuration ✅
```json
{
  "git": {
    "deploymentEnabled": {
      "main": true,
      "staging": true,
      "develop": true
    }
  }
}
```

## Troubleshooting

### Script Won't Run (Windows)

**Error:** "Execution policy prevents script"

**Fix:**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Vercel CLI Not Found

**Fix:**
```bash
npm install -g vercel@latest
```

Then run script again.

### Login Fails

**Fix:**
1. Close browser
2. Run script again
3. Use the browser link provided

### Environment Variables Not Set

**Check with:**
```bash
vercel env ls
```

**Manual add if needed:**
```bash
# Production
echo "production" | vercel env add NEXT_PUBLIC_ENVIRONMENT production

# Preview
echo "staging" | vercel env add NEXT_PUBLIC_ENVIRONMENT preview
```

## Alternative: Manual Setup

If you prefer manual setup, follow:
**`docs/DEPLOYMENT_PIPELINE_SETUP.md`**

Complete step-by-step instructions.

## Comparison

### Automated (This Guide)
- ⏱️ **Time:** 5 minutes + 2 manual steps
- 🎯 **Difficulty:** Easy
- ✅ **Best for:** Quick setup, beginners

### Manual (Full Guide)
- ⏱️ **Time:** 15-20 minutes
- 🎯 **Difficulty:** Moderate
- ✅ **Best for:** Learning process, custom needs

## What You Get

After running the automated setup:

### Deployment Pipeline
```
Local → Staging → Production
  ↓        ↓          ↓
dev    preview   lucidmerged.com
```

### Automatic Deployments
- Push to `main` → Production
- Push to `staging` → Preview URL
- Push to `develop` → Preview URL
- Push to `feature/*` → Preview URL

### Environment Tracking
- Sentry filters by environment
- Different configs per environment
- Proper monitoring separation

## Verification Checklist

After running the script:

- [ ] Vercel CLI installed
- [ ] Project linked to Vercel
- [ ] Environment variables set:
  - [ ] Production: `production`
  - [ ] Preview: `staging`
- [ ] Staging deployed successfully
- [ ] Manual steps completed:
  - [ ] Production branch set to `main`
  - [ ] Branch deployments enabled

## Next Steps

1. **Test staging:**
   ```bash
   git checkout staging
   git push origin staging
   # Check Vercel dashboard for URL
   ```

2. **Test production:**
   ```bash
   git checkout main
   git merge staging
   git push origin main
   # Deploys to lucidmerged.com
   ```

3. **Monitor errors:**
   - Check Sentry dashboard
   - Filter by environment
   - See separate dev/staging/prod errors

## Script Locations

- **Windows:** `scripts/setup-vercel.ps1`
- **Mac/Linux:** `scripts/setup-vercel.sh`
- **Config:** `vercel.json`

## Support

### Issues with Script?
1. Check error message
2. See troubleshooting section above
3. Fallback to manual setup

### Manual Setup?
See: `docs/DEPLOYMENT_PIPELINE_SETUP.md`

### Vercel CLI Docs
https://vercel.com/docs/cli

## Summary

✅ **Automated setup script created**
✅ **5-minute setup process**
✅ **Handles environment variables**
✅ **Tests deployment automatically**
✅ **Works on Windows, Mac, Linux**

**Only 2 manual steps remain:**
1. Set production branch (30 seconds)
2. Enable branch deployments (click checkbox)

This is as automated as Vercel allows! 🚀

Run the script now:
```powershell
# Windows
.\scripts\setup-vercel.ps1

# Mac/Linux  
./scripts/setup-vercel.sh
