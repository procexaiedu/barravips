from __future__ import annotations

import json
import sys
from pathlib import Path
from uuid import UUID

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "packages" / "contracts" / "src"
FIXTURES = ROOT / "tests" / "fixtures" / "evolution"

sys.path.insert(0, str(SRC))

from barra_vips_contracts.v1 import (  # noqa: E402
    EvolutionConnectionUpdate,
    EvolutionMessagesUpsert,
    normalize_evolution_message,
)

TRACE_ID = UUID("40000000-0000-0000-0000-000000000001")
RAW_EVENT_ID = UUID("50000000-0000-0000-0000-000000000001")


def main() -> int:
    message_fixtures = [
        "messages_upsert_text.json",
        "messages_upsert_image.json",
        "messages_upsert_audio.json",
        "messages_upsert_from_me.json",
    ]
    connection_fixtures = [
        "connection_update_connected.json",
        "connection_update_disconnected.json",
    ]

    for fixture in message_fixtures:
        payload = _load(fixture)
        parsed = EvolutionMessagesUpsert.model_validate(payload)
        normalized = normalize_evolution_message(
            parsed,
            trace_id=TRACE_ID,
            raw_event_id=RAW_EVENT_ID,
        )
        print(f"OK {fixture}: {normalized.message_type} from_me={normalized.from_me}")

    for fixture in connection_fixtures:
        payload = _load(fixture)
        parsed = EvolutionConnectionUpdate.model_validate(payload)
        status = parsed.data.status or parsed.data.state or "UNKNOWN"
        print(f"OK {fixture}: {status}")

    return 0


def _load(name: str) -> dict:
    with (FIXTURES / name).open("r", encoding="utf-8") as handle:
        return json.load(handle)


if __name__ == "__main__":
    raise SystemExit(main())
