"""Cobertura dos endpoints de midia no modelo simplificado: tags, is_active, busca, validacao MIME.

Criterios:
- `POST /api/media` valida MIME real, tamanho maximo e existencia das tags antes de gravar.
- `PATCH /api/media/{id}` aceita is_active (com deactivated_at) e tags (substituicao completa, validada).
- `GET /api/media` filtra por model_id, type, is_active, tag, q (filename) e never_sent.
- `GET /api/media/tags` retorna o vocabulario controlado.
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
        response = client.post(
            "/api/media",
            headers=api_headers,
            files={"file": ("fake.png", b"%PDF-1.5\n", "image/png")},
        )
        assert response.status_code == 415

    def test_accepts_real_png_default_active_no_tags(self, client, api_headers, created_media_ids):
        response = client.post(
            "/api/media",
            headers=api_headers,
            files={"file": ("real.png", PNG_1X1, "image/png")},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        media_id = uuid.UUID(body["id"])
        created_media_ids.append(media_id)
        assert body["media_type"] == "image"
        assert body["is_active"] is True
        assert body["deactivated_at"] is None
        assert body["tags"] == []

    def test_accepts_upload_with_known_tags(self, client, api_headers, created_media_ids):
        response = client.post(
            "/api/media",
            headers=api_headers,
            files={"file": ("real.png", PNG_1X1, "image/png")},
            data={"tags": ["casual", "rosto"]},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        created_media_ids.append(uuid.UUID(body["id"]))
        assert sorted(body["tags"]) == ["casual", "rosto"]

    def test_rejects_upload_with_unknown_tag(self, client, api_headers, created_media_ids):
        response = client.post(
            "/api/media",
            headers=api_headers,
            files={"file": ("real.png", PNG_1X1, "image/png")},
            data={"tags": ["nao-existe"]},
        )
        assert response.status_code == 422, response.text

    def test_size_limit_enforced_when_configured(
        self, client, api_headers, created_media_ids, monkeypatch: pytest.MonkeyPatch
    ):
        monkeypatch.setattr(settings, "max_media_upload_bytes", 50)
        assert len(PNG_1X1) > 50
        response = client.post(
            "/api/media",
            headers=api_headers,
            files={"file": ("real.png", PNG_1X1, "image/png")},
        )
        assert response.status_code == 413, response.text


class TestPatchSemantics:
    def _create_media(self, client, api_headers, created_media_ids) -> str:
        upload = client.post(
            "/api/media",
            headers=api_headers,
            files={"file": ("real.png", PNG_1X1, "image/png")},
            data={"tags": ["casual"]},
        )
        assert upload.status_code == 200, upload.text
        media_id = upload.json()["id"]
        created_media_ids.append(uuid.UUID(media_id))
        return media_id

    def test_patch_is_active_false_sets_deactivated_at(
        self, client, api_headers, created_media_ids
    ):
        media_id = self._create_media(client, api_headers, created_media_ids)

        patched = client.patch(
            f"/api/media/{media_id}",
            headers=api_headers,
            json={"is_active": False},
        )
        assert patched.status_code == 200, patched.text
        body = patched.json()
        assert body["is_active"] is False
        assert body["deactivated_at"] is not None
        assert sorted(body["tags"]) == ["casual"]

    def test_patch_is_active_true_clears_deactivated_at(
        self, client, api_headers, created_media_ids
    ):
        media_id = self._create_media(client, api_headers, created_media_ids)
        client.patch(
            f"/api/media/{media_id}",
            headers=api_headers,
            json={"is_active": False},
        )
        reactivated = client.patch(
            f"/api/media/{media_id}",
            headers=api_headers,
            json={"is_active": True},
        )
        assert reactivated.status_code == 200
        body = reactivated.json()
        assert body["is_active"] is True
        assert body["deactivated_at"] is None

    def test_patch_tags_replaces_full_set(self, client, api_headers, created_media_ids):
        media_id = self._create_media(client, api_headers, created_media_ids)

        patched = client.patch(
            f"/api/media/{media_id}",
            headers=api_headers,
            json={"tags": ["lingerie", "sensual"]},
        )
        assert patched.status_code == 200, patched.text
        body = patched.json()
        assert sorted(body["tags"]) == ["lingerie", "sensual"]

    def test_patch_tags_with_unknown_tag_returns_422(
        self, client, api_headers, created_media_ids
    ):
        media_id = self._create_media(client, api_headers, created_media_ids)
        response = client.patch(
            f"/api/media/{media_id}",
            headers=api_headers,
            json={"tags": ["nao-existe"]},
        )
        assert response.status_code == 422, response.text

    def test_patch_with_empty_body_returns_400(self, client, api_headers, created_media_ids):
        media_id = self._create_media(client, api_headers, created_media_ids)
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
            json={"is_active": False},
        )
        assert response.status_code == 404


class TestListAndFilters:
    def test_filter_by_tag(self, client, api_headers, created_media_ids):
        a = client.post(
            "/api/media",
            headers=api_headers,
            files={"file": ("a.png", PNG_1X1, "image/png")},
            data={"tags": ["casual"]},
        ).json()
        b = client.post(
            "/api/media",
            headers=api_headers,
            files={"file": ("b.png", PNG_1X1, "image/png")},
            data={"tags": ["sensual"]},
        ).json()
        created_media_ids.extend([uuid.UUID(a["id"]), uuid.UUID(b["id"])])

        response = client.get("/api/media?tag=casual", headers=api_headers)
        assert response.status_code == 200
        ids = {item["id"] for item in response.json()["items"]}
        assert a["id"] in ids
        assert b["id"] not in ids

    def test_filter_by_is_active(self, client, api_headers, created_media_ids):
        a = client.post(
            "/api/media",
            headers=api_headers,
            files={"file": ("a.png", PNG_1X1, "image/png")},
        ).json()
        created_media_ids.append(uuid.UUID(a["id"]))
        client.patch(
            f"/api/media/{a['id']}",
            headers=api_headers,
            json={"is_active": False},
        )

        actives = client.get("/api/media?is_active=true", headers=api_headers).json()
        assert a["id"] not in {item["id"] for item in actives["items"]}

        inactives = client.get("/api/media?is_active=false", headers=api_headers).json()
        assert a["id"] in {item["id"] for item in inactives["items"]}

    def test_filter_by_filename_q(self, client, api_headers, created_media_ids):
        a = client.post(
            "/api/media",
            headers=api_headers,
            files={"file": ("tabela-2025.png", PNG_1X1, "image/png")},
        ).json()
        b = client.post(
            "/api/media",
            headers=api_headers,
            files={"file": ("outro.png", PNG_1X1, "image/png")},
        ).json()
        created_media_ids.extend([uuid.UUID(a["id"]), uuid.UUID(b["id"])])

        response = client.get("/api/media?q=tabela", headers=api_headers)
        assert response.status_code == 200
        ids = {item["id"] for item in response.json()["items"]}
        assert a["id"] in ids
        assert b["id"] not in ids

    def test_filter_never_sent(self, client, api_headers, created_media_ids):
        # Mídia nunca enviada (sem mensagem associada) deve aparecer.
        a = client.post(
            "/api/media",
            headers=api_headers,
            files={"file": ("a.png", PNG_1X1, "image/png")},
        ).json()
        created_media_ids.append(uuid.UUID(a["id"]))

        response = client.get("/api/media?never_sent=true", headers=api_headers)
        assert response.status_code == 200
        ids = {item["id"] for item in response.json()["items"]}
        assert a["id"] in ids


class TestMediaTagsVocabulary:
    def test_lists_seeded_vocabulary(self, client, api_headers):
        response = client.get("/api/media/tags", headers=api_headers)
        assert response.status_code == 200
        tags = response.json()
        slugs = {item["tag"] for item in tags}
        # Seed da migration 004 (vocabulario do dominio acompanhantes).
        for expected in [
            "rosto",
            "corpo",
            "casual",
            "sensual",
            "elegante",
            "lingerie",
            "praia-piscina",
            "ambiente",
        ]:
            assert expected in slugs


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
        unknown = "00000000-0000-0000-0000-0000000000bb"
        response = client.get(f"/api/media/{unknown}/content")
        assert response.status_code == 401

    def test_traversal_storage_path_in_db_is_blocked(self, client, api_headers, created_media_ids):
        media_id = uuid.uuid4()
        with connect() as conn:
            conn.execute(
                """
                INSERT INTO app.media_assets (id, model_id, media_type, storage_path)
                VALUES (
                  %(id)s,
                  (SELECT id FROM app.escorts WHERE is_active LIMIT 1),
                  'image',
                  '../../etc/passwd'
                )
                """,
                {"id": media_id},
            )
        created_media_ids.append(media_id)
        response = client.get(f"/api/media/{media_id}/content", headers=api_headers)
        assert response.status_code == 404
        assert response.json()["detail"] == "media path is not accessible"
