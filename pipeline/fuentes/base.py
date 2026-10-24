"""Descarga de fuentes y registro de snapshots (SPEC 2.1 y 5.1, paso 2).

Un snapshot es el conjunto de archivos tal como los devolvió la fuente, en
`snapshots/<id de la fuente>/<fecha>/`, con un `meta.json` que guarda URL, fecha de descarga,
checksum y licencia. Nunca se modifica: si la fuente cambia, se guarda uno nuevo.
"""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass
from pathlib import Path

import httpx

from pipeline.comun import ErrorPipeline, ahora_utc, escribir_json

AGENTE = "Vaiven/0.1 (+https://github.com/vaiven-argentino/vaiven)"
REINTENTOS = 4
ESPERA_INICIAL = 2.0


@dataclass
class Archivo:
    nombre: str
    url: str
    contenido: bytes
    # Si el archivo se extrajo de otro más grande que no se guarda (por ejemplo, el zip de Bruegel): de dónde salió.
    origen: dict | None = None


def descargar(url: str, params: dict | None = None, timeout: float = 60.0) -> bytes:
    """GET con reintentos y espera exponencial (2, 4, 8, 16 s)."""
    espera = ESPERA_INICIAL
    ultimo_error = None
    for intento in range(1, REINTENTOS + 1):
        try:
            r = httpx.get(url, params=params, timeout=timeout, headers={"User-Agent": AGENTE}, follow_redirects=True)
            if r.status_code == 200:
                return r.content
            ultimo_error = f"HTTP {r.status_code}: {r.text[:300]}"
            if 400 <= r.status_code < 500 and r.status_code != 429:
                break
        except httpx.HTTPError as e:
            ultimo_error = f"{type(e).__name__}: {e}"
        if intento < REINTENTOS:
            time.sleep(espera)
            espera *= 2
    raise ErrorPipeline(f"No se pudo descargar {url} (params={params}): {ultimo_error}")


def checksum(archivos: list[Archivo]) -> str:
    h = hashlib.sha256()
    for a in sorted(archivos, key=lambda a: a.nombre):
        h.update(a.nombre.encode())
        h.update(b"\0")
        h.update(hashlib.sha256(a.contenido).digest())
    return h.hexdigest()


def ultimo_snapshot(dir_fuente: Path) -> Path | None:
    if not dir_fuente.exists():
        return None
    fechas = sorted(d for d in dir_fuente.iterdir() if (d / "meta.json").exists())
    return fechas[-1] if fechas else None


def leer_meta(dir_snapshot: Path) -> dict:
    return json.loads((dir_snapshot / "meta.json").read_text(encoding="utf-8"))


def guardar_snapshot(dir_snapshots: Path, fuente: dict, archivos: list[Archivo]) -> tuple[Path, bool]:
    """Guarda el snapshot si el contenido cambió. Devuelve (carpeta del snapshot vigente, si es nuevo).

    Si la fuente no permite redistribuir (`redistribuible: false`), se guarda solo `meta.json`
    y los archivos quedan en `.crudos/` (fuera de Git) para poder normalizarlos.
    """
    suma = checksum(archivos)
    dir_fuente = dir_snapshots / fuente["id"]
    previo = ultimo_snapshot(dir_fuente)
    if previo is not None and leer_meta(previo)["sha256"] == suma:
        return previo, False

    momento = ahora_utc()
    nombre = momento.strftime("%Y-%m-%d")
    if (dir_fuente / nombre).exists():
        nombre = momento.strftime("%Y-%m-%dT%H%M%SZ")
    destino = dir_fuente / nombre
    redistribuible = fuente.get("redistribuible", True)
    dir_archivos = destino if redistribuible else dir_snapshots.parent / ".crudos" / fuente["id"] / nombre
    dir_archivos.mkdir(parents=True, exist_ok=True)
    for a in archivos:
        (dir_archivos / a.nombre).write_bytes(a.contenido)
    escribir_json(
        destino / "meta.json",
        {
            "fuente": fuente["id"],
            "descargado": momento.isoformat().replace("+00:00", "Z"),
            "sha256": suma,
            "licencia": fuente.get("licencia"),
            "redistribuible": redistribuible,
            "archivos": [
                {"nombre": a.nombre, "url": a.url, "bytes": len(a.contenido), "sha256": hashlib.sha256(a.contenido).hexdigest(),
                 **({"extraido_de": a.origen} if a.origen else {})}
                for a in archivos
            ],
        },
    )
    return destino, True


def leer_archivos(dir_snapshots: Path, dir_snapshot: Path) -> list[tuple[str, bytes]]:
    """Archivos de un snapshot (de `.crudos/` si la fuente no es redistribuible)."""
    meta = leer_meta(dir_snapshot)
    base = dir_snapshot
    if not meta.get("redistribuible", True):
        base = dir_snapshots.parent / ".crudos" / meta["fuente"] / dir_snapshot.name
    return [(a["nombre"], (base / a["nombre"]).read_bytes()) for a in meta["archivos"]]
