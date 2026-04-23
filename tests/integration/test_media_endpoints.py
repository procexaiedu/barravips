"""Cobertura dos endpoints de midia: validacao real de MIME, limite de tamanho, PATCH parcial.

Criterios de aceite Fase 2:
- `POST /api/media` valida MIME real e tamanho maximo antes de gravar.
- `PATCH /api/media/{id}` aplica patch parcial: apenas campos enviados sao atualizados.
- `GET /api/media/{id}/content` resolve caminho pelo banco e serve via backend autenticado.
"""
from __future__ import annotations

import uuid
from typing import Iterator

import pytest

from barra_vips_api.config import settings
from barra_vips_api.db import connect


PNG_1X1 = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01"
    b"\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


@pytest.fixture()
def created_media_ids() -> Iterator[list[uuid.UUID]]:
    ids: list[uuid.UUID] = []
    yield ids
    if not ids:
        return
    with connect() as conn:
        for media_id in ids:
            row = conn.execute(
                "SELECT storage_path FROM app.media_assets WHERE id = %(id)s",
                {"id": media_id},
            ).fetchone()
            if row:
                target = settings.media_storage_dir / row["storage_path"]
                if target.exists():
                    target.unlink()
            conn.execute("DELETE FROM app.media_assets WHERE id = %(id)s", {"id": media_id})


class TestUploadValidation:
    def test_rejects_unsupported_mime_with_415(self, client, api_headers, created_media_ids):
        response = client.post(
            "/api/media",
            headers=api_headers,
            files={"file": ("fake.png", b"NOT A REAL IMAGE", "image/png")},
        )
        assert response.status_code == 415, response.text

    def test_ignores_declared_content_type_uses_real_bytes(self, client, api_headers, created_media_ids):
        # cliente mente sobre Content-Type, mas a API rejeita pelo magic bytes.
        response = client.post(
            "/api/media",
            headers=api_headers,
            files={"file": ("fake.png", b"%PDF-1.5\n", "image/png")},
        )
        assert response.status_code == 415

    def test_accepts_real_png(self, client, api_headers, created_media_ids):
        response = client.post(
            "/api/media",
            headers=api_headers,
            files={"file": ("real.png", PNG_1X1, "image/png")},
            data={"category": "unit-test"},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        media_id = uuid.UUID(body["id"])
        created_media_ids.append(media_id)
        assert body["media_type"] == "image"
        assert body["category"] == "unit-test"
        assert body["approval_status"] == "PENDING"
        assert body["send_constraints_json"]["send_only_when_requested"] is True

    def test_video_default_send_constraints_include_view_once(self, client, api_headers, created_media_ids):
        # Construimos minimal mp4 com ftypisom; nao precisa ser tocavel, so reconhecivel.
        mp4_min = b"\x00\x00\x00\x18ftypisom\x00\x00\x00\x00mp42isomavc1"
        response = client.post(
            "/api/media",
            headers=api_headers,
            files={"file": ("clip.mp4", mp4_min, "video/mp4")},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        created_media_ids.append(uuid.UUID(body["id"]))
        assert body["media_type"] == "video"
        assert body["send_constraints_json"]["view_once"] is True

    def test_size_limit_enforced_when_configured(
        self, client, api_headers, created_media_ids, monkeypatch: pytest.MonkeyPatch
    ):
        monkeypatch.setattr(settings, "max_media_upload_bytes", 50)
        # PNG_1X1 tem ~67 bytes, acima do limite simulado.
        assert len(PNG_1X1) > 50
        response = client.post(
            "/api/media",
            headers=api_headers,
            files={"file": ("real.png", PNG_1X1, "image/png")},
        )
        assert response.status_code == 413, response.text


class TestPatchPartialSemantics:
    def test_patch_only_updates_sent_fields(self, client, api_headers, created_media_ids):
        upload = client.post(
            "/api/media",
            headers=api_headers,
            files={"file": ("real.png", PNG_1X1, "image/png")},
            data={"category": "before-patch"},
        )
        assert upload.status_code == 200
        media_id = upload.json()["id"]
        created_media_ids.append(uuid.UUID(media_id))

        before = upload.json()
        assert before["approval_status"] == "PENDING"
        assert before["send_constraints_json"]["send_only_when_requested"] is True

        patched = client.patch(
            f"/api/media/{media_id}",
            headers=api_headers,
            json={"approval_status": "APPROVED"},
        )
        assert patched.status_code == 200, patched.text
        after = patched.json()
        # Apenas approval_status mudou; demais permanecem.
        assert after["approval_status"] == "APPROVED"
        assert after["category"] == "before-patch"
        assert after["send_constraints_json"] == before["send_constraints_json"]
        assert after["metadata_json"] == before["metadata_json"]

    def test_patch_with_empty_body_returns_400(self, client, api_headers, created_media_ids):
        upload = client.post(
            "/api/media",
            headers=api_headers,
            files={"file": ("real.png", PNG_1X1, "image/png")},
        )
        media_id = upload.json()["id"]
        created_media_ids.append(uuid.UUID(media_id))

        response = client.patch(
            f"/api/media/{media_id}",
            headers=api_headers,
            json={},
        )
        assert response.status_code == 400

    def test_patch_unknown_id_returns_404(self, client, api_headers):
        unknown = "00000000-0000-0000-0000-0000000000ff"
        response = client.patch(
            f"/api/media/{unknown}",
            headers=api_headers,
            json={"category": "x"},
        )
        assert response.status_code == 404


class TestMediaContent:
    def test_content_resolved_from_db_only(self, client, api_headers, created_media_ids):
        upload = client.post(
            "/api/media",
            headers=api_headers,
            files={"file": ("real.png", PNG_1X1, "image/png")},
        )
        media_id = upload.json()["id"]
        created_media_ids.append(uuid.UUID(media_id))

        response = client.get(f"/api/media/{media_id}/content", headers=api_headers)
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/png"
        assert response.content == PNG_1X1

    def test_unknown_id_returns_404(self, client, api_headers):
        unknown = "00000000-0000-0000-0000-0000000000aa"
        response = client.get(f"/api/media/{unknown}/content", headers=api_headers)
        assert response.status_code == 404

    def test_content_requires_operator_api_key(self, client, created_media_ids):
        # Mesmo com id valido, sem chave nao serve.
        unknown = "00000000-0000-0000-0000-0000000000bb"
        response = client.get(f"/api/media/{unknown}/content")
        assert response.status_code == 401

    def test_traversal_storage_path_in_db_is_blocked(self, client, api_headers, created_media_ids):
        # Forja registro com storage_path malicioso e verifica que ensure_inside protege.
        media_id = uuid.uuid4()
        with connect() as conn:
            conn.execute(
                """
                INSERT INTO app.media_assets (id, model_id, media_type, storage_path, approval_status)
                VALUES (
                  %(id)s,
                  (SELECT id FROM app.models WHERE is_active LIMIT 1),
                  'image',
                  '../../etc/passwd',
                  'PENDING'
                )
                """,
                {"id": media_id},
            )
        created_media_ids.append(media_id)
        response = client.get(f"/api/media/{media_id}/content", headers=api_headers)
        # storage_path corrompido nao pode vazar arquivo arbitrario; resposta segura e 404.
        assert response.status_code == 404
        assert response.json()["detail"] == "media path is not accessible"
