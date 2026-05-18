# LucidMerged - Log Search Script (PowerShell)
# Quick search across all log files

param(
    [Parameter(Mandatory=$true)]
    [string]$SearchTerm,
    [int]$Context = 0,
    [switch]$CaseSensitive
)

Write-Host "🔍 Searching logs for: $SearchTerm" -ForegroundColor Blue
Write-Host ""

# Check if logs directory exists
if (-not (Test-Path "logs")) {
    Write-Host "❌ No logs directory found" -ForegroundColor Red
    Write-Host "Run .\scripts\capture-logs.ps1 first to generate logs"
    exit 1
}

# Count total log files
$logFiles = Get-ChildItem -Path "logs" -Filter "*.log" -Recurse
$logCount = $logFiles.Count

Write-Host "Found $logCount log file(s)" -ForegroundColor Green
Write-Host ""

# Perform search
Write-Host "Searching all logs..." -ForegroundColor Blue
Write-Host ""

$results = @()

if ($Context -gt 0) {
    # Search with context
    $results = Select-String -Path "logs\*.log" -Pattern $SearchTerm -Context $Context,$Context -CaseSensitive:$CaseSensitive
} else {
    # Simple search
    $results = Select-String -Path "logs\*.log" -Pattern $SearchTerm -CaseSensitive:$CaseSensitive
}

# Display results
if ($results.Count -eq 0) {
    Write-Host "No matches found" -ForegroundColor Yellow
} else {
    $results | ForEach-Object {
        Write-Host "$($_.Filename):$($_.LineNumber)" -ForegroundColor Cyan
        Write-Host $_.Line
        
        if ($Context -gt 0 -and $_.Context) {
            Write-Host "Context:" -ForegroundColor DarkGray
            $_.Context.PreContext | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
            Write-Host "  $($_.Line)" -ForegroundColor White
            $_.Context.PostContext | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
        }
        
        Write-Host ""
    }
    
    Write-Host "Found $($results.Count) match(es)" -ForegroundColor Green
}

Write-Host ""
Write-Host "💡 Tips:" -ForegroundColor Blue
Write-Host "  - Add -Context 5 to see 5 lines before/after each match"
Write-Host "  - Add -CaseSensitive for case-sensitive search"
Write-Host "  - Use regex: .\scripts\search-logs.ps1 'error|warning|fatal'"
Write-Host "  - Search specific file: Select-String -Path 'logs\*worker*.log' -Pattern 'error'"