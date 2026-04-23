from __future__ import annotations

import uuid
from typing import Any

from barra_vips_api.db import connect

SEED_CONVERSATION_ID = uuid.UUID("30000000-0000-0000-0000-000000000001")
SEED_MODEL_ID = uuid.UUID("10000000-0000-0000-0000-000000000001")


def restore_seed_conversation() -> None:
    with connect() as conn:
        conn.execute(
            """
            DELETE FROM app.handoff_events
            WHERE conversation_id = %(id)s
            """,
            {"id": SEED_CONVERSATION_ID},
        )
        conn.execute(
            """
            UPDATE app.conversations
            SET state = 'NOVO',
                state_before_escalation = NULL,
                handoff_status = 'NONE',
                updated_at = now()
            WHERE id = %(id)s
            """,
            {"id": SEED_CONVERSATION_ID},
        )


def open_handoff_for_seed(reason: str | None = "test") -> None:
    """Abre handoff diretamente no banco para preparar testes de acknowledge/release."""
    with connect() as conn:
        conn.execute(
            """
            UPDATE app.conversations
            SET state = 'ESCALADO',
                state_before_escalation = COALESCE(state_before_escalation, state),
                handoff_status = 'OPENED',
                last_handoff_at = now(),
                updated_at = now()
            WHERE id = %(id)s
            """,
            {"id": SEED_CONVERSATION_ID},
        )
        conn.execute(
            """
            INSERT INTO app.handoff_events (
              conversation_id, event_type, previous_handoff_status, source, actor_label, reason
            ) VALUES (
              %(id)s, 'handoff_opened', 'NONE', 'system', 'test', %(reason)s
            )
            """,
            {"id": SEED_CONVERSATION_ID, "reason": reason},
        )


def fetch_conversation_handoff_status() -> dict[str, Any]:
    with connect() as conn:
        row = conn.execute(
            """
            SELECT state, state_before_escalation, handoff_status
            FROM app.conversations
            WHERE id = %(id)s
            """,
            {"id": SEED_CONVERSATION_ID},
        ).fetchone()
    return row or {}
