#Requires -Version 5.1
<#
Sobe o stack de desenvolvimento (FastAPI + Next.js) em background, desacoplado
da sessao do terminal pai. PID e logs vao para .run/. Rodar novamente eh seguro:
portas ocupadas sao detectadas cedo.
#>

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$runDir = Join-Path $repoRoot ".run"
if (-not (Test-Path $runDir)) { New-Item -ItemType Directory -Path $runDir | Out-Null }

function Test-Port($port) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    return ($conn -ne $null)
}

function Assert-PortFree($port, $label) {
    if (Test-Port $port) {
        Write-Host "[dev_up] Porta $port ocupada. Rode scripts\dev_down.ps1 ou mate o processo antes de subir $label." -ForegroundColor Red
        exit 1
    }
}

function Wait-Http($url, $label, $timeoutSec = 60) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
            if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) {
                Write-Host "[dev_up] $label respondeu HTTP $($r.StatusCode) em $url" -ForegroundColor Green
                return $true
            }
        } catch {
            Start-Sleep -Milliseconds 800
        }
    }
    Write-Host "[dev_up] Timeout esperando $label em $url. Veja os logs em $runDir." -ForegroundColor Red
    return $false
}

Assert-PortFree 8000 "FastAPI"
Assert-PortFree 3000 "Next.js"

# ----- Backend FastAPI -----
$apiLog = Join-Path $runDir "api.log"
$apiErr = Join-Path $runDir "api.err.log"
$apiPidFile = Join-Path $runDir "api.pid"

$env:PYTHONPATH = "apps\api\src;packages\contracts\src"

$apiProc = Start-Process `
    -FilePath "python" `
    -ArgumentList @("-m","uvicorn","barra_vips_api.main:app","--host","127.0.0.1","--port","8000") `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $apiLog `
    -RedirectStandardError $apiErr `
    -PassThru

$apiProc.Id | Out-File -Encoding ascii -FilePath $apiPidFile
Write-Host "[dev_up] FastAPI iniciado (pid $($apiProc.Id)). Log: $apiLog"

# ----- Frontend Next.js -----
$webLog = Join-Path $runDir "web.log"
$webErr = Join-Path $runDir "web.err.log"
$webPidFile = Join-Path $runDir "web.pid"
$webDir = Join-Path $repoRoot "apps\operator-web"

if (-not (Test-Path (Join-Path $webDir "node_modules"))) {
    Write-Host "[dev_up] node_modules ausente em apps\operator-web. Rodando npm install..." -ForegroundColor Yellow
    Push-Location $webDir
    npm install
    Pop-Location
}

$webProc = Start-Process `
    -FilePath "cmd.exe" `
    -ArgumentList @("/c","npm","run","dev") `
    -WorkingDirectory $webDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $webLog `
    -RedirectStandardError $webErr `
    -PassThru

$webProc.Id | Out-File -Encoding ascii -FilePath $webPidFile
Write-Host "[dev_up] Next.js iniciado (pid $($webProc.Id)). Log: $webLog"

# ----- Healthcheck -----
$apiOk = Wait-Http "http://127.0.0.1:8000/docs" "FastAPI"
$webOk = Wait-Http "http://127.0.0.1:3000" "Next.js" 90

if ($apiOk -and $webOk) {
    Write-Host ""
    Write-Host "[dev_up] Stack no ar:" -ForegroundColor Green
    Write-Host "  FastAPI  -> http://127.0.0.1:8000"
    Write-Host "  Next.js  -> http://localhost:3000"
    Write-Host "  Parar    -> scripts\dev_down.ps1"
    exit 0
} else {
    Write-Host "[dev_up] Pelo menos um servico nao ficou saudavel. Conferir $runDir." -ForegroundColor Red
    exit 2
}
