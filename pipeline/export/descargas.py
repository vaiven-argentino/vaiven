"""Descarga completa (SPEC 2.5): `export/descargas/vaiven_<version>.parquet` y `.zip` con un CSV por variante.

No se versionan en Git (son binarios que cambiarían en cada actualización): se generan al publicar.
"""

from __future__ import annotations

import json
import zipfile
from pathlib import Path

import pandas as pd


def tabla_larga(dir_export: Path) -> pd.DataFrame:
    filas = []
    for ruta in sorted((dir_export / "series").glob("*/*.json")):
        doc = json.loads(ruta.read_text(encoding="utf-8"))
        filas += [(doc["serie"], doc["variante"], doc["frecuencia"], doc["unidad"], f, v) for f, v in doc["datos"]]
    return pd.DataFrame(filas, columns=["serie", "variante", "frecuencia", "unidad", "fecha", "valor"])


def generar(dir_export: Path, parquet: bool = True) -> list[Path]:
    catalogo = json.loads((dir_export / "catalogo.json").read_text(encoding="utf-8"))
    version = catalogo["version_datos"][:10]
    destino = dir_export / "descargas"
    destino.mkdir(parents=True, exist_ok=True)
    generados = []

    ruta_zip = destino / f"vaiven_{version}.zip"
    with zipfile.ZipFile(ruta_zip, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for csv in sorted((destino / "csv").glob("*/*.csv")):
            z.write(csv, f"{csv.parent.name}/{csv.name}")
        for nombre in ("catalogo.json", "datapackage.json", "quiebres.json"):
            z.write(dir_export / nombre, nombre)
        licencia = dir_export.parent / "LICENSE-DATOS"
        if licencia.exists():
            z.write(licencia, "LICENSE-DATOS")
    generados.append(ruta_zip)

    if parquet:
        ruta_parquet = destino / f"vaiven_{version}.parquet"
        tabla_larga(dir_export).to_parquet(ruta_parquet, index=False)
        generados.append(ruta_parquet)
    return generados
