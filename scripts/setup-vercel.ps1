# Vercel Automated Setup Script (PowerShell)
# This script configures your Vercel project with proper environment variables and settings

Write-Host "Vercel Automated Setup" -ForegroundColor Cyan
Write-Host "=========================" -ForegroundColor Cyan
Write-Host ""

# Check if Vercel CLI is installed
$vercelInstalled = Get-Command vercel -ErrorAction SilentlyContinue
if (-not $vercelInstalled) {
    Write-Host "Installing Vercel CLI..." -ForegroundColor Yellow
    npm install -g vercel@latest
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install Vercel CLI" -ForegroundColor Red
        exit 1
    }
}

# Login to Vercel
Write-Host "Logging into Vercel..." -ForegroundColor Yellow
Write-Host "Please log in with your Vercel account in the browser window that opens." -ForegroundColor Gray
vercel login
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to login to Vercel" -ForegroundColor Red
    exit 1
}

# Link project
Write-Host ""
Write-Host "Linking project to Vercel..." -ForegroundColor Yellow
Write-Host "When prompted, select your existing project or create a new one." -ForegroundColor Gray
vercel link
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to link project" -ForegroundColor Red
    exit 1
}

# Set environment variables for Production
Write-Host ""
Write-Host "Setting up Production environment variables..." -ForegroundColor Yellow

# Create temporary file for environment variable value
$tempFile = New-TemporaryFile
"production" | Out-File -FilePath $tempFile -Encoding utf8 -NoNewline

# Add NEXT_PUBLIC_ENVIRONMENT for production
Write-Host "   Setting NEXT_PUBLIC_ENVIRONMENT=production..." -ForegroundColor Gray
Get-Content $tempFile | vercel env add NEXT_PUBLIC_ENVIRONMENT production
Remove-Item $tempFile

Write-Host "Set NEXT_PUBLIC_ENVIRONMENT=production" -ForegroundColor Green

# Set environment variables for Preview (Staging)
Write-Host ""
Write-Host "Setting up Preview/Staging environment variables..." -ForegroundColor Yellow

# Create temporary file for staging value
$tempFile = New-TemporaryFile
"staging" | Out-File -FilePath $tempFile -Encoding utf8 -NoNewline

Write-Host "   Setting NEXT_PUBLIC_ENVIRONMENT=staging..." -ForegroundColor Gray
Get-Content $tempFile | vercel env add NEXT_PUBLIC_ENVIRONMENT preview
Remove-Item $tempFile

Write-Host "Set NEXT_PUBLIC_ENVIRONMENT=staging for preview deployments" -ForegroundColor Green

# Set Git integration settings
Write-Host ""
Write-Host "Configuring Git integration..." -ForegroundColor Yellow
Write-Host "Setting production branch to main..." -ForegroundColor Gray

# Note: These settings need to be configured in Vercel dashboard
# The CLI doesn't have commands for these yet
Write-Host ""
Write-Host "Manual steps required in Vercel Dashboard:" -ForegroundColor Yellow
Write-Host "   1. Go to: Settings -> Git" -ForegroundColor White
Write-Host "   2. Set Production Branch: main" -ForegroundColor White
Write-Host "   3. Enable Branch Deployments" -ForegroundColor White
Write-Host ""

# Deploy to staging for testing
Write-Host "Deploying to staging for testing..." -ForegroundColor Yellow
git checkout staging
vercel --yes
if ($LASTEXITCODE -ne 0) {
    Write-Host "Deployment failed, but configuration is complete" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "==================" -ForegroundColor Green
Write-Host ""
Write-Host "Your deployment pipeline:" -ForegroundColor Cyan
Write-Host "   main branch -> Production (lucidmerged.com)" -ForegroundColor White
Write-Host "   staging branch -> Preview URL" -ForegroundColor White
Write-Host "   develop branch -> Preview URL" -ForegroundColor White
Write-Host "   feature/* branches -> Preview URLs" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "   1. Visit Vercel dashboard to verify settings" -ForegroundColor White
Write-Host "   2. Push to staging branch to test" -ForegroundColor White
Write-Host "   3. Check Sentry dashboard for environment filtering" -ForegroundColor White
Write-Host ""
Write-Host "Full documentation: docs/DEPLOYMENT_PIPELINE_SETUP.md" -ForegroundColor Gray
