"""Capa 1: series fuente normalizadas (fecha ISO, valor numérico), sin transformaciones de contenido."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from pipeline.comun import ErrorPipeline, Rutas, escribir_csv_serie, escribir_json, serie_desde_df
from pipeline.fuentes import base, bcra, bruegel, datos_gob_ar, datos_gob_ar_csv

MODULOS = {"datos.gob.ar": datos_gob_ar, "datos.gob.ar-csv": datos_gob_ar_csv, "bcra": bcra, "bruegel": bruegel}


def modulo(fuente: dict):
    try:
        return MODULOS[fuente["api"]]
    except KeyError:
        raise ErrorPipeline(f"La fuente {fuente['id']} no tiene un módulo de descarga para la API «{fuente['api']}».")


def dir_capa1(rutas: Rutas, fuente: dict) -> Path:
    """Las fuentes no redistribuibles se normalizan fuera de Git (en `.crudos/`)."""
    if fuente.get("redistribuible", True):
        return rutas.capa1
    return rutas.raiz / ".crudos" / "capa1"


def normalizar(rutas: Rutas, fuente: dict, dir_snapshot: Path) -> pd.Series:
    archivos = base.leer_archivos(rutas.snapshots, dir_snapshot)
    mod = modulo(fuente)
    df = mod.normalizar(archivos, fuente["columna"]) if "columna" in fuente else mod.normalizar(archivos)
    serie = serie_desde_df(df)
    destino = dir_capa1(rutas, fuente)
    escribir_csv_serie(destino / f"{fuente['id']}.csv", serie)
    meta = base.leer_meta(dir_snapshot)
    escribir_json(destino / f"{fuente['id']}.json", {
        "fuente": fuente["id"],
        "unidad": fuente["unidad"],
        "frecuencia": fuente["frecuencia"],
        "snapshot": dir_snapshot.relative_to(rutas.raiz).as_posix(),
        "descargado": meta["descargado"],
        "sha256": meta["sha256"],
        "observaciones": len(serie),
        "desde": serie.index[0].strftime("%Y-%m-%d") if len(serie) else None,
        "hasta": serie.index[-1].strftime("%Y-%m-%d") if len(serie) else None,
    })
    return serie
