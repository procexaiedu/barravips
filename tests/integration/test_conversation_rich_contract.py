from __future__ import annotations

from decimal import Decimal

from barra_vips_contracts.v1 import ConversationRead


def test_conversation_read_serializes_optional_rich_fields():
    payload = {
        "id": "30000000-0000-0000-0000-000000000001",
        "client": {
            "id": "20000000-0000-0000-0000-000000000001",
            "display_name": "Cliente de exemplo",
            "whatsapp_jid": "5521999999999@s.whatsapp.net",
            "client_status": "VIP",
            "profile_summary": "Cliente objetivo.",
            "language_hint": "pt-BR",
        },
        "model": {
            "id": "10000000-0000-0000-0000-000000000001",
            "display_name": "Modelo em cadastro",
        },
        "state": "NEGOCIANDO",
        "flow_type": "INTERNAL",
        "handoff_status": "OPENED",
        "summary": "Cliente avaliando horario.",
        "pending_action": None,
        "awaiting_input_type": None,
        "awaiting_client_decision": True,
        "urgency_profile": "IMMEDIATE",
        "expected_amount": "750.00",
        "last_handoff_at": "2026-04-22T12:00:00Z",
        "last_message": None,
        "last_message_at": "2026-04-22T12:05:00Z",
    }

    parsed = ConversationRead.model_validate(payload)
    dumped = parsed.model_dump(mode="json")

    assert parsed.expected_amount == Decimal("750.00")
    assert dumped["client"]["client_status"] == "VIP"
    assert dumped["client"]["language_hint"] == "pt-BR"
    assert dumped["awaiting_client_decision"] is True
    assert dumped["urgency_profile"] == "IMMEDIATE"
    assert dumped["expected_amount"] == "750.00"
    assert dumped["last_handoff_at"] == "2026-04-22T12:00:00Z"
