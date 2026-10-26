"""Disk cache shared by the summaries and the agenda ranking, one JSON file per key."""

import asyncio
import hashlib
import json
import logging
import time
from pathlib import Path
from typing import Awaitable, Callable

from . import config

log = logging.getLogger("radar_ia")

WEEK = 7 * 24 * 3600
_in_flight: dict[str, asyncio.Task] = {}


def _file(key: str, directory: Path) -> Path:
    return directory / f"{hashlib.sha1(key.encode()).hexdigest()}.json"


def read(key: str, directory: Path) -> dict | None:
    """The stored entry, {"at": timestamp, "value": ...}, or None."""
    try:
        return json.loads(_file(key, directory).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def write(key: str, directory: Path, value: dict) -> None:
    try:
        directory.mkdir(parents=True, exist_ok=True)
        _file(key, directory).write_text(json.dumps({"at": time.time(), "value": value}, ensure_ascii=False), encoding="utf-8")
    except OSError:
        log.warning("não deu para gravar o cache de %s", key)


async def cached(
    key: str, load: Callable[[], Awaitable[dict]], ttl: float = WEEK, directory: Path | None = None
) -> dict:
    """Disk cache with a TTL. Concurrent callers share one load; on failure a stale value is served.

    `directory` defaults to the summaries' folder, read at call time so tests can point it elsewhere."""
    directory = directory or config.CACHE_DIR
    old = read(key, directory)
    if old and time.time() - old["at"] < ttl:
        log.info("cache hit %s", key)
        return old["value"]
    if key not in _in_flight:
        _in_flight[key] = asyncio.create_task(load())
        _in_flight[key].add_done_callback(lambda _: _in_flight.pop(key, None))
    try:
        value = await asyncio.shield(_in_flight[key])
    except Exception:
        if old:
            log.warning("falha ao gerar %s; usando o valor antigo", key)
            return old["value"]
        raise
    write(key, directory, value)
    return value
