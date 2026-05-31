$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$NpmCli = "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js"

foreach ($port in 5173, 8765) {
  $pids = netstat -ano | Select-String ":$port\s" | ForEach-Object { ($_ -split "\s+")[-1] } | Where-Object { $_ -match "^\d+$" -and $_ -ne "0" } | Sort-Object -Unique
  foreach ($pidValue in $pids) {
    Stop-Process -Id ([int]$pidValue) -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "Starting Life System API at http://127.0.0.1:8765 ..."
Start-Process -WindowStyle Hidden -FilePath python -ArgumentList "backend\server.py" -WorkingDirectory $Root

Start-Sleep -Seconds 2

Write-Host "Starting React app at http://127.0.0.1:5173 ..."
Start-Process -WindowStyle Hidden -FilePath node -ArgumentList "node_modules\vite\bin\vite.js", "--host", "0.0.0.0", "--port", "5173" -WorkingDirectory $Root

Start-Sleep -Seconds 4

Write-Host ""
Write-Host "Life System is ready:"
Write-Host "http://127.0.0.1:5173"
Write-Host ""
Write-Host "Database:"
Write-Host "$Root\data\life_system.sqlite3"
