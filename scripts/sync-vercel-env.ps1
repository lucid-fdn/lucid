# Sync Vercel Environment Variables Across All Environments
# This script copies all environment variables from one environment to all others
# Usage: .\scripts\sync-vercel-env.ps1 [-SourceEnv production]
# Example: .\scripts\sync-vercel-env.ps1 -SourceEnv production

param(
    [string]$SourceEnv = "production",
    [string]$ProjectName = "lucidmerged"
)

# Colors for output
function Write-ColorOutput($ForegroundColor) {
    $fc = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    if ($args) {
        Write-Output $args
    }
    $host.UI.RawUI.ForegroundColor = $fc
}

Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Blue
Write-Host "   Vercel Environment Variables Sync Tool" -ForegroundColor Blue
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Blue
Write-Host ""

# Check if Vercel CLI is installed
try {
    $null = vercel --version
    Write-Host "✓ Vercel CLI found" -ForegroundColor Green
} catch {
    Write-Host "✗ Vercel CLI is not installed" -ForegroundColor Red
    Write-Host "Install with: npm i -g vercel" -ForegroundColor Yellow
    exit 1
}

# Check if logged in
try {
    $user = vercel whoami 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✗ Not logged in to Vercel" -ForegroundColor Red
        Write-Host "Run: vercel login" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "✓ Logged in to Vercel" -ForegroundColor Green
} catch {
    Write-Host "✗ Not logged in to Vercel" -ForegroundColor Red
    Write-Host "Run: vercel login" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Fetching project information..." -ForegroundColor Blue
Write-Host "✓ User: $user" -ForegroundColor Green
Write-Host ""
Write-Host "Source Environment: $SourceEnv" -ForegroundColor Blue
Write-Host ""

# Get list of all environment variables
Write-Host "Step 1: Fetching environment variables from $SourceEnv..." -ForegroundColor Blue

# Create temp file
$tempFile = [System.IO.Path]::GetTempFileName()
vercel env ls | Out-File -FilePath $tempFile -Encoding UTF8

# Read and parse the file
$content = Get-Content $tempFile
$envVars = @()

foreach ($line in $content) {
    # Skip header lines and empty lines
    if ($line -match '^\s*$' -or $line -match 'Fetching' -or $line -match 'Environment Variables') {
        continue
    }
    
    # Extract variable name (first column)
    $parts = $line -split '\s+'
    if ($parts.Length -gt 0 -and $parts[0] -ne '') {
        $envVars += $parts[0]
    }
}

# Remove duplicates
$envVars = $envVars | Select-Object -Unique

if ($envVars.Count -eq 0) {
    Write-Host "✗ No environment variables found" -ForegroundColor Red
    Remove-Item $tempFile
    exit 1
}

Write-Host "✓ Found $($envVars.Count) environment variables" -ForegroundColor Green
Write-Host ""

# List variables
Write-Host "Variables to sync:" -ForegroundColor Blue
foreach ($var in $envVars) {
    Write-Host "  - $var"
}
Write-Host ""

# Confirmation
$confirmation = Read-Host "Continue with sync to all environments? [y/N]"
if ($confirmation -ne 'y' -and $confirmation -ne 'Y') {
    Write-Host "Sync cancelled" -ForegroundColor Yellow
    Remove-Item $tempFile
    exit 0
}

Write-Host ""
Write-Host "Step 2: Syncing variables to all environments..." -ForegroundColor Blue

# Target environments
$targets = @("production", "preview", "development")

# Pull current environment variables
$envTempFile = ".env.temp"
vercel env pull $envTempFile --environment=$SourceEnv 2>&1 | Out-Null

if (-not (Test-Path $envTempFile)) {
    Write-Host "✗ Failed to pull environment variables" -ForegroundColor Red
    Remove-Item $tempFile
    exit 1
}

# Read the .env file
$envContent = @{}
Get-Content $envTempFile | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') {
        $envContent[$matches[1]] = $matches[2]
    }
}

# Sync each variable
$synced = 0
$failed = 0

foreach ($var in $envVars) {
    Write-Host "Syncing: $var" -ForegroundColor Blue
    
    if (-not $envContent.ContainsKey($var)) {
        Write-Host "  ⚠ Could not get value for $var" -ForegroundColor Yellow
        continue
    }
    
    $value = $envContent[$var]
    
    # Remove surrounding quotes if they exist to avoid double-quoting
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or 
        ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
    }
    
    # Add to each target environment
    foreach ($target in $targets) {
        if ($target -ne $SourceEnv) {
            Write-Host "  → Adding to $target..."
            
            # Remove if exists first
            try {
                vercel env rm $var $target --yes 2>$null | Out-Null
            } catch {
                # Ignore errors (variable might not exist)
            }
            
            # Add the variable
            try {
                $value | vercel env add $var $target --force 2>&1 | Out-Null
                
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "    ✓ Synced to $target" -ForegroundColor Green
                    $synced++
                } else {
                    Write-Host "    ✗ Failed to sync to $target" -ForegroundColor Red
                    $failed++
                }
            } catch {
                Write-Host "    ✗ Failed to sync to $target" -ForegroundColor Red
                $failed++
            }
        }
    }
    
    Write-Host ""
}

# Cleanup
Remove-Item $tempFile -ErrorAction SilentlyContinue
Remove-Item $envTempFile -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Blue
Write-Host "✓ Sync Complete!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Blue
Write-Host ""
Write-Host "Synced: $synced variables" -ForegroundColor Green
if ($failed -gt 0) {
    Write-Host "Failed: $failed variables" -ForegroundColor Red
}
Write-Host ""
Write-Host "Note: Deployments will use the new environment variables" -ForegroundColor Yellow
Write-Host "Redeploy to apply changes to existing deployments" -ForegroundColor Yellow
Write-Host ""
