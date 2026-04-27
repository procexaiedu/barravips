from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

_REPO_ROOT = Path(__file__).resolve().parents[4]
load_dotenv(_REPO_ROOT / ".env")


@dataclass
class Settings:
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql://barra_vips:barra_vips_dev_password@localhost:5432/barra_vips",
    )
    operator_api_key: str = os.getenv("OPERATOR_API_KEY", "dev-operator-api-key")
    evolution_webhook_secret: str = os.getenv(
        "EVOLUTION_WEBHOOK_SECRET",
        "dev-evolution-webhook-secret",
    )
    chatwoot_webhook_secret: str = os.getenv(
        "CHATWOOT_WEBHOOK_SECRET",
        "dev-chatwoot-webhook-secret",
    )
    evolution_instance: str = os.getenv("EVOLUTION_INSTANCE", "barra-vips-main")
    evolution_api_base_url: str = os.getenv("EVOLUTION_API_BASE_URL", "")
    evolution_api_key: str = os.getenv("EVOLUTION_API_KEY", "")
    evolution_outbound_timeout_seconds: float = float(
        os.getenv("EVOLUTION_OUTBOUND_TIMEOUT_SECONDS", "15")
    )
    calendar_instance: str = os.getenv("CALENDAR_INSTANCE", "default")
    media_storage_dir: Path = Path(os.getenv("MEDIA_STORAGE_DIR", "storage/media"))
    max_media_upload_bytes: int = int(os.getenv("MAX_MEDIA_UPLOAD_BYTES", "0"))
    cors_origins: tuple[str, ...] = tuple(
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
        if origin.strip()
    )


settings = Settings()
