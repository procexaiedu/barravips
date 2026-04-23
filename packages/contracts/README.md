# Contracts

Contratos versionados da Fase 1.

- `barra_vips_contracts.v1.evolution`: payload minimo Evolution `messages.upsert` e `connection.update`.
- `barra_vips_contracts.v1.messages`: mensagem interna normalizada.
- `barra_vips_contracts.v1.read_models`: read models da API operacional.
- `barra_vips_contracts.v1.handoff`: eventos de handoff.
- `barra_vips_contracts.v1.receipts`: contrato de comprovante.
- `barra_vips_contracts.v1.tools`: contrato inicial de tool calls do agente.

Validar fixtures:

```powershell
python packages/contracts/scripts/validate_fixtures.py
```
