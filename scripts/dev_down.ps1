#Requires -Version 5.1
<#
Para o stack de desenvolvimento iniciado por dev_up.ps1. Idempotente: se o PID
do arquivo nao existir mais, apenas limpa o arquivo.
#>

$ErrorActionPreference = "Continue"

$repoRoot = Split-Path -Parent $PSScriptRoot
$runDir = Join-Path $repoRoot ".run"

function Stop-FromPidFile($pidFile, $label) {
    if (-not (Test-Path $pidFile)) {
        Write-Host "[dev_down] $label nao tinha PID registrado."
        return
    }
    $raw = Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $raw) {
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
        return
    }
    $processId = [int]$raw.Trim()
    $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($proc) {
        try {
            Stop-Process -Id $processId -Force -ErrorAction Stop
            Write-Host "[dev_down] $label parado (pid $processId)." -ForegroundColor Green
        } catch {
            Write-Host "[dev_down] Falha ao parar $label (pid $processId): $_" -ForegroundColor Red
        }
    } else {
        Write-Host "[dev_down] $label ja nao estava rodando (pid $processId)."
    }
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}

if (-not (Test-Path $runDir)) {
    Write-Host "[dev_down] Nada a fazer: $runDir nao existe."
    exit 0
}

Stop-FromPidFile (Join-Path $runDir "api.pid") "FastAPI"
Stop-FromPidFile (Join-Path $runDir "web.pid") "Next.js"

# cmd.exe e npm criam filhos; varre leftovers pelas portas.
foreach ($port in 8000, 3000) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
        try {
            Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop
            Write-Host "[dev_down] Matado processo orfao na porta $port (pid $($c.OwningProcess))." -ForegroundColor Yellow
        } catch {}
    }
}
