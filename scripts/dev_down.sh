#!/usr/bin/env bash
# Para o stack iniciado por dev_up.sh. Idempotente.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RUN_DIR="$REPO_ROOT/.run"

# No MSYS/Git Bash em Windows, "kill" POSIX so ve processos da propria sessao.
# Usar taskkill como fallback para processos nativos do Windows.
is_windows_bash() {
    case "${OSTYPE:-}" in
        msys*|cygwin*) return 0 ;;
        *) return 1 ;;
    esac
}

kill_pid() {
    local proc_pid="$1"
    if is_windows_bash; then
        taskkill //F //PID "$proc_pid" >/dev/null 2>&1
        return $?
    fi
    if kill -0 "$proc_pid" 2>/dev/null; then
        kill "$proc_pid" 2>/dev/null
        sleep 1
        kill -0 "$proc_pid" 2>/dev/null && kill -9 "$proc_pid" 2>/dev/null
    fi
    return 0
}

pid_alive() {
    local proc_pid="$1"
    if is_windows_bash; then
        tasklist //FI "PID eq $proc_pid" //NH 2>/dev/null | grep -q "$proc_pid"
        return $?
    fi
    kill -0 "$proc_pid" 2>/dev/null
}

stop_from_pidfile() {
    local pidfile="$1" label="$2"
    if [ ! -f "$pidfile" ]; then
        echo "[dev_down] $label nao tinha PID registrado."
        return
    fi
    local proc_pid
    proc_pid=$(tr -d ' \r\n' < "$pidfile")
    if [ -z "$proc_pid" ]; then
        rm -f "$pidfile"
        return
    fi
    if pid_alive "$proc_pid"; then
        kill_pid "$proc_pid"
        echo "[dev_down] $label parado (pid $proc_pid)."
    else
        echo "[dev_down] $label ja nao estava rodando (pid $proc_pid)."
    fi
    rm -f "$pidfile"
}

if [ ! -d "$RUN_DIR" ]; then
    echo "[dev_down] Nada a fazer: $RUN_DIR nao existe."
    exit 0
fi

stop_from_pidfile "$RUN_DIR/api.pid" "FastAPI"
stop_from_pidfile "$RUN_DIR/web.pid" "Next.js"

# Varrer orfaos nas portas (npm dev respawna o filho real em outro pid).
for port in 8000 3000; do
    if command -v netstat >/dev/null 2>&1; then
        pids=$(netstat -ano 2>/dev/null | awk -v p=":$port" '$0 ~ /LISTEN/ && $0 ~ p {print $NF}' | sort -u)
        for pid in $pids; do
            if pid_alive "$pid"; then
                kill_pid "$pid" && echo "[dev_down] Matado processo orfao na porta $port (pid $pid)."
            fi
        done
    fi
done
