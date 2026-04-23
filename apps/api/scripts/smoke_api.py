from __future__ import annotations

import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "apps" / "api" / "src"))
sys.path.insert(0, str(ROOT / "packages" / "contracts" / "src"))

os.environ.setdefault("OPERATOR_API_KEY", "dev-operator-api-key")
os.environ.setdefault("EVOLUTION_WEBHOOK_SECRET", "dev-evolution-webhook-secret")
os.environ.setdefault("CHATWOOT_WEBHOOK_SECRET", "dev-chatwoot-webhook-secret")
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql://barra_vips:barra_vips_dev_password@localhost:5432/barra_vips",
)

from fastapi.testclient import TestClient  # noqa: E402

from barra_vips_api.main import app  # noqa: E402


def main() -> int:
    client = TestClient(app)
    api_headers = {"x-operator-api-key": os.environ["OPERATOR_API_KEY"]}

    unauthorized = client.get("/api/status/health")
    assert unauthorized.status_code == 401, unauthorized.text

    health = client.get("/api/status/health", headers=api_headers)
    assert health.status_code == 200, health.text

    conversations = client.get("/api/conversations", headers=api_headers)
    assert conversations.status_code == 200, conversations.text
    body = conversations.json()
    assert body["total"] >= 1
    conversation_id = body["items"][0]["id"]

    detail = client.get(f"/api/conversations/{conversation_id}", headers=api_headers)
    assert detail.status_code == 200, detail.text

    connection = client.post(
        "/webhooks/evolution",
        headers={"apikey": os.environ["EVOLUTION_WEBHOOK_SECRET"]},
        json={
            "event": "connection.update",
            "instance": "barra-vips-main",
            "data": {"state": "open", "status": "CONNECTED"},
        },
    )
    assert connection.status_code == 200, connection.text

    status = client.get("/api/status/evolution", headers=api_headers)
    assert status.status_code == 200, status.text
    assert status.json()["status"] == "CONNECTED"

    message = client.post(
        "/webhooks/evolution",
        headers={"apikey": os.environ["EVOLUTION_WEBHOOK_SECRET"]},
        json={
            "event": "messages.upsert",
            "instance": "barra-vips-main",
            "data": {
                "key": {
                    "remoteJid": "5521999999999@s.whatsapp.net",
                    "fromMe": False,
                    "id": f"MSG_SMOKE_{time.time_ns()}",
                },
                "pushName": "Cliente Smoke",
                "messageType": "conversation",
                "message": {"conversation": "Smoke API"},
                "messageTimestamp": int(time.time()),
            },
        },
    )
    assert message.status_code == 200, message.text
    assert message.json()["status"] == "processed"

    starts_at = datetime.now(timezone.utc) + timedelta(
        days=60,
        minutes=time.time_ns() % 10000,
    )
    ends_at = starts_at + timedelta(minutes=5)
    slot = client.post(
        "/api/schedule/slots/block",
        headers=api_headers,
        json={
            "starts_at": starts_at.isoformat(),
            "ends_at": ends_at.isoformat(),
            "reason": "smoke_api",
        },
    )
    assert slot.status_code == 200, slot.text

    png_1x1 = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01"
        b"\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    media = client.post(
        "/api/media",
        headers=api_headers,
        files={"file": ("smoke.png", png_1x1, "image/png")},
        data={"category": "smoke"},
    )
    assert media.status_code == 200, media.text
    media_id = media.json()["id"]

    content = client.get(f"/api/media/{media_id}/content", headers=api_headers)
    assert content.status_code == 200, content.text

    print("OK api smoke")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
