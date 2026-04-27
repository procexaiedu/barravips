from __future__ import annotations

import os
import shutil
import sys
import uuid
from pathlib import Path
from typing import Iterator

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tests"))
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

from barra_vips_api.main import app as fastapi_app  # noqa: E402
from helpers import SEED_CONVERSATION_ID, SEED_MODEL_ID, restore_seed_conversation  # noqa: E402


@pytest.fixture(scope="session")
def app():
    return fastapi_app


@pytest.fixture()
def client(app) -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def api_headers() -> dict[str, str]:
    return {"x-operator-api-key": os.environ["OPERATOR_API_KEY"]}


@pytest.fixture()
def evolution_headers() -> dict[str, str]:
    return {"apikey": os.environ["EVOLUTION_WEBHOOK_SECRET"]}


@pytest.fixture()
def chatwoot_headers() -> dict[str, str]:
    return {"x-chatwoot-webhook-secret": os.environ["CHATWOOT_WEBHOOK_SECRET"]}


@pytest.fixture()
def tmp_path(request) -> Iterator[Path]:
    """Workspace tempdir that avoids pytest's 0o700 basetemp on Windows sandbox."""
    safe_name = "".join(
        char if char.isalnum() or char in "-_" else "_"
        for char in request.node.name
    )[:80]
    path = ROOT / "tmp" / "pytest-work" / f"{safe_name}-{uuid.uuid4().hex}"
    path.mkdir(parents=True)
    try:
        yield path
    finally:
        shutil.rmtree(path, ignore_errors=True)


@pytest.fixture()
def seed_conversation_id() -> uuid.UUID:
    return SEED_CONVERSATION_ID


@pytest.fixture()
def seed_escort_id() -> uuid.UUID:
    return SEED_MODEL_ID


@pytest.fixture()
def reset_seed_conversation() -> Iterator[None]:
    """Restaura a conversa do seed para o estado pre-handoff antes e depois do teste."""
    restore_seed_conversation()
    try:
        yield
    finally:
        restore_seed_conversation()
