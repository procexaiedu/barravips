#!/usr/bin/env bash
# Sobe o stack de desenvolvimento (FastAPI + Next.js) em background, desacoplado
# da sessao do shell pai. PID e logs vao para .run/.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

RUN_DIR="$REPO_ROOT/.run"
mkdir -p "$RUN_DIR"

port_in_use() {
    local port="$1"
    if command -v ss >/dev/null 2>&1; then
        ss -ltn "sport = :$port" 2>/dev/null | tail -n +2 | grep -q .
    elif command -v netstat >/dev/null 2>&1; then
        netstat -ano 2>/dev/null | grep -E "LISTEN(ING)?" | grep -E ":$port[[:space:]]" >/dev/null
    else
        return 1
    fi
}

assert_port_free() {
    local port="$1" label="$2"
    if port_in_use "$port"; then
        echo "[dev_up] Porta $port ocupada. Rode scripts/dev_down.sh ou mate o processo antes de subir $label." >&2
        exit 1
    fi
}

wait_http() {
    local url="$1" label="$2" timeout="${3:-60}"
    local deadline=$(( $(date +%s) + timeout ))
    while [ "$(date +%s)" -lt "$deadline" ]; do
        local code
        code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "$url" || echo "000")
        if [[ "$code" =~ ^[2-4][0-9][0-9]$ ]]; then
            echo "[dev_up] $label respondeu HTTP $code em $url"
            return 0
        fi
        sleep 0.8
    done
    echo "[dev_up] Timeout esperando $label em $url. Veja os logs em $RUN_DIR." >&2
    return 1
}

assert_port_free 8000 "FastAPI"
assert_port_free 3000 "Next.js"

# ----- Backend FastAPI -----
API_LOG="$RUN_DIR/api.log"
API_PID_FILE="$RUN_DIR/api.pid"

export PYTHONPATH="apps/api/src;packages/contracts/src"

nohup python -m uvicorn barra_vips_api.main:app --host 127.0.0.1 --port 8000 \
    >"$API_LOG" 2>&1 &
API_PID=$!
disown "$API_PID" 2>/dev/null || true
echo "$API_PID" > "$API_PID_FILE"
echo "[dev_up] FastAPI iniciado (pid $API_PID). Log: $API_LOG"

# ----- Frontend Next.js -----
WEB_LOG="$RUN_DIR/web.log"
WEB_PID_FILE="$RUN_DIR/web.pid"
WEB_DIR="$REPO_ROOT/apps/operator-web"

if [ ! -d "$WEB_DIR/node_modules" ]; then
    echo "[dev_up] node_modules ausente em apps/operator-web. Rodando npm install..."
    (cd "$WEB_DIR" && npm install)
fi

(
    cd "$WEB_DIR"
    nohup npm run dev >"$WEB_LOG" 2>&1 &
    echo $! > "$WEB_PID_FILE"
    disown 2>/dev/null || true
)
WEB_PID=$(cat "$WEB_PID_FILE")
echo "[dev_up] Next.js iniciado (pid $WEB_PID). Log: $WEB_LOG"

# ----- Healthcheck -----
api_ok=1
web_ok=1
wait_http "http://127.0.0.1:8000/docs" "FastAPI" 60 || api_ok=0
wait_http "http://127.0.0.1:3000" "Next.js" 90 || web_ok=0

if [ "$api_ok" = "1" ] && [ "$web_ok" = "1" ]; then
    echo
    echo "[dev_up] Stack no ar:"
    echo "  FastAPI  -> http://127.0.0.1:8000"
    echo "  Next.js  -> http://localhost:3000"
    echo "  Parar    -> scripts/dev_down.sh"
    exit 0
else
    echo "[dev_up] Pelo menos um servico nao ficou saudavel. Conferir $RUN_DIR." >&2
    exit 2
fi
