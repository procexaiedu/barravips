# Barra Vips API

Backend operacional da Fase 2.

## Executar localmente

O caminho padrao sobe API + frontend juntos, desacoplados do terminal atual:

```powershell
# Windows
scripts\dev_up.ps1
```

```bash
# bash / WSL / Linux / macOS
scripts/dev_up.sh
```

Ao final, `FastAPI -> http://127.0.0.1:8000` e `Next.js -> http://localhost:3000`. Logs e PIDs ficam em `.run/`. Para parar: `scripts\dev_down.ps1` (ou `.sh`).

### Execucao manual (sem scripts)

`config.py` carrega automaticamente o `.env` da raiz do repositorio via `python-dotenv`, entao nao eh preciso exportar secrets nem passar `--env-file`:

```powershell
$env:PYTHONPATH='apps/api/src;packages/contracts/src'
python -m uvicorn barra_vips_api.main:app --reload --port 8000
```

Se quiser sobrescrever algum valor do `.env` pontualmente, basta exportar a variavel antes do comando — `load_dotenv(..., override=False)` preserva o que ja estiver no ambiente.

## Autenticacao

Todos os endpoints `/api/*` exigem `x-operator-api-key` ou `Authorization: Bearer ...`.
Os webhooks usam secrets separados.
