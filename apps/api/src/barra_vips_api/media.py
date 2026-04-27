from __future__ import annotations

from pathlib import Path


MIME_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
}

MEDIA_TYPES = {
    "image/jpeg": "image",
    "image/png": "image",
    "image/gif": "image",
    "image/webp": "image",
    "video/mp4": "video",
}


MEDIA_TAGS: tuple[tuple[str, str, int], ...] = (
    ("rosto",         "Rosto",           10),
    ("corpo",         "Corpo",           20),
    ("casual",        "Casual",          30),
    ("sensual",       "Sensual",         40),
    ("elegante",      "Elegante",        50),
    ("lingerie",      "Lingerie",        60),
    ("praia-piscina", "Praia / piscina", 70),
    ("ambiente",      "Ambiente",        80),
)

MEDIA_TAG_VALUES: frozenset[str] = frozenset(tag for tag, _, _ in MEDIA_TAGS)


def detect_mime(data: bytes) -> str | None:
    head = data[:32]
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head.startswith(b"GIF87a") or head.startswith(b"GIF89a"):
        return "image/gif"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    if len(head) >= 12 and head[4:8] == b"ftyp":
        brand = head[8:12]
        if brand in {b"isom", b"iso2", b"mp41", b"mp42", b"avc1"}:
            return "video/mp4"
    return None


def ensure_inside(base_dir: Path, candidate: Path) -> Path:
    base = base_dir.resolve()
    resolved = candidate.resolve()
    if base != resolved and base not in resolved.parents:
        raise ValueError("media path is outside storage directory")
    return resolved
