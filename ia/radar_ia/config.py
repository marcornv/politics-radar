"""Settings shared with the Next.js app.

The Configurações screen writes keys to `.config/chaves.json` at the project root (see `src/lib/config.ts`);
this service only reads that file. A value saved there wins over the same variable in `.env.local`.
"""

import json
import os
from pathlib import Path

from dotenv import load_dotenv

RAIZ = Path(os.environ.get("RADAR_DIR") or Path(__file__).resolve().parents[2])
ARQUIVO = RAIZ / ".config" / "chaves.json"
CACHE_DIR = RAIZ / ".cache" / "resumos"

# Same files Next.js loads; variables already in the environment win, as they do there.
load_dotenv(RAIZ / ".env.local")
load_dotenv(RAIZ / ".env")


def _ler() -> dict[str, str]:
    # Read on every call: the screen can change a key while the service runs.
    try:
        dados = json.loads(ARQUIVO.read_text(encoding="utf-8"))
        return dados if isinstance(dados, dict) else {}
    except (OSError, ValueError):
        return {}


def chave(nome: str) -> str | None:
    valor = _ler().get(nome)
    if isinstance(valor, str) and valor.strip():
        return valor.strip()
    return (os.environ.get(nome) or "").strip() or None
