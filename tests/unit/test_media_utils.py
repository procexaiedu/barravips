"""Testa as utilidades que protegem upload e leitura de midia."""
from __future__ import annotations

from pathlib import Path

import pytest

from barra_vips_api.media import MEDIA_TYPES, MIME_EXTENSIONS, detect_mime, ensure_inside


PNG_HEADER = b"\x89PNG\r\n\x1a\n" + b"\x00" * 8
JPEG_HEADER = b"\xff\xd8\xff\xe0" + b"\x00" * 8
GIF87_HEADER = b"GIF87a" + b"\x00" * 10
GIF89_HEADER = b"GIF89a" + b"\x00" * 10
WEBP_HEADER = b"RIFF" + b"\x00\x00\x00\x00" + b"WEBP" + b"\x00" * 4
MP4_HEADER = b"\x00" * 4 + b"ftyp" + b"isom" + b"\x00" * 8


class TestDetectMime:
    @pytest.mark.parametrize(
        "data,expected",
        [
            (PNG_HEADER, "image/png"),
            (JPEG_HEADER, "image/jpeg"),
            (GIF87_HEADER, "image/gif"),
            (GIF89_HEADER, "image/gif"),
            (WEBP_HEADER, "image/webp"),
            (MP4_HEADER, "video/mp4"),
        ],
    )
    def test_recognizes_supported_signatures(self, data: bytes, expected: str) -> None:
        assert detect_mime(data) == expected

    def test_rejects_unknown_bytes(self) -> None:
        assert detect_mime(b"not a real image at all") is None

    def test_rejects_empty_bytes(self) -> None:
        assert detect_mime(b"") is None

    def test_does_not_trust_declared_extension(self) -> None:
        # bytes que parecem PDF ainda nao sao suportados, mesmo que cliente declare image/png
        pdf_bytes = b"%PDF-1.5\n%\xe2\xe3\xcf\xd3\n"
        assert detect_mime(pdf_bytes) is None

    def test_extensions_table_is_aligned_with_mime_table(self) -> None:
        assert set(MIME_EXTENSIONS.keys()) == set(MEDIA_TYPES.keys())


class TestEnsureInside:
    def test_allows_path_inside_base(self, tmp_path: Path) -> None:
        target = tmp_path / "sub" / "file.png"
        target.parent.mkdir(parents=True)
        target.write_bytes(b"x")
        resolved = ensure_inside(tmp_path, target)
        assert resolved == target.resolve()

    def test_allows_base_itself(self, tmp_path: Path) -> None:
        resolved = ensure_inside(tmp_path, tmp_path)
        assert resolved == tmp_path.resolve()

    def test_rejects_parent_traversal(self, tmp_path: Path) -> None:
        outside = tmp_path.parent / "etc" / "passwd"
        with pytest.raises(ValueError):
            ensure_inside(tmp_path, outside)

    def test_rejects_explicit_dotdot(self, tmp_path: Path) -> None:
        candidate = tmp_path / ".." / "outside.png"
        with pytest.raises(ValueError):
            ensure_inside(tmp_path, candidate)
