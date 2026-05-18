# LucidMerged - Log Capture Script (PowerShell)
# Captures both Worker and Next.js logs to timestamped files

# Create logs directory
New-Item -ItemType Directory -Force -Path "logs" | Out-Null

# Timestamp
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

Write-Host "📝 LucidMerged Log Capture" -ForegroundColor Blue
Write-Host "Capturing logs to:" -ForegroundColor Green
Write-Host "   📄 logs/$timestamp-worker.log"
Write-Host "   📄 logs/$timestamp-nextjs.log"
Write-Host ""

# Start worker in background with log capture
Write-Host "Starting worker log capture..." -ForegroundColor Green
$workerJob = Start-Job -ScriptBlock {
    Set-Location worker
    npm run dev *>&1 | Tee-Object -FilePath "../logs/$using:timestamp-worker.log"
}

# Give worker a moment to start
Start-Sleep -Seconds 2

# Start Next.js in background with log capture
Write-Host "Starting Next.js log capture..." -ForegroundColor Green
$nextjsJob = Start-Job -ScriptBlock {
    npm run dev *>&1 | Tee-Object -FilePath "logs/$using:timestamp-nextjs.log"
}

Write-Host ""
Write-Host "✅ Logging started!" -ForegroundColor Green
Write-Host ""
Write-Host "Commands:"
Write-Host "  - Press Ctrl+C to stop and save logs"
Write-Host "  - In another terminal, run: .\scripts\search-logs.ps1 error"
Write-Host "  - View logs: Get-Content logs\$timestamp-worker.log -Wait"
Write-Host ""

# Wait for Ctrl+C
try {
    while ($true) {
        Start-Sleep -Seconds 1
        
        # Check if jobs are still running
        if ($workerJob.State -ne 'Running' -and $nextjsJob.State -ne 'Running') {
            break
        }
    }
}
finally {
    Write-Host ""
    Write-Host "Stopping services and saving logs..." -ForegroundColor Blue
    Stop-Job $workerJob -ErrorAction SilentlyContinue
    Stop-Job $nextjsJob -ErrorAction SilentlyContinue
    Remove-Job $workerJob -ErrorAction SilentlyContinue
    Remove-Job $nextjsJob -ErrorAction SilentlyContinue
    Write-Host "✅ Logs saved!" -ForegroundColor Green
}