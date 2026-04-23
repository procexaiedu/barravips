from __future__ import annotations

from collections.abc import Generator
from contextlib import contextmanager
from typing import Any

import psycopg
from psycopg.rows import dict_row

from .config import settings


@contextmanager
def connect() -> Generator[psycopg.Connection[dict[str, Any]], None, None]:
    with psycopg.connect(settings.database_url, row_factory=dict_row) as conn:
        yield conn


def get_conn() -> Generator[psycopg.Connection[dict[str, Any]], None, None]:
    with connect() as conn:
        yield conn
