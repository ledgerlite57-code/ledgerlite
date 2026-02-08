param(
  [switch]$NoDockerReset,
  [switch]$SkipTests,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)][string]$Command
  )

  Write-Host ""
  Write-Host "==> $Command" -ForegroundColor Cyan

  if ($DryRun) {
    return
  }

  Invoke-Expression $Command
}

Set-Location -Path $PSScriptRoot

if (-not $NoDockerReset) {
  Invoke-Step "docker compose down -v"
  Invoke-Step "docker compose up -d db redis"
}

Invoke-Step "pnpm --filter @ledgerlite/web typecheck"
Invoke-Step "pnpm --filter @ledgerlite/api typecheck"
Invoke-Step "pnpm --filter @ledgerlite/api db:migrate"
Invoke-Step "pnpm --filter @ledgerlite/api db:seed"
Invoke-Step "pnpm --filter @ledgerlite/api db:generate"
Invoke-Step "pnpm --filter @ledgerlite/web lint"
Invoke-Step "pnpm --filter @ledgerlite/api lint"

if (-not $SkipTests) {
  Invoke-Step "pnpm --filter @ledgerlite/api run test -- --runInBand --cacheDirectory C:\temp\jest-cache"
}

Write-Host ""
Write-Host "All requested steps completed." -ForegroundColor Green
