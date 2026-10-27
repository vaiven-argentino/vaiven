"""Revisiones: compara la serie nueva contra la versión publicada y registra los valores históricos que cambiaron."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from pipeline.comun import etiqueta_fecha, redondear


def leer_publicada(ruta_json: Path) -> dict[str, float] | dict[str, dict[str, float]] | None:
    """Lo publicado, por fecha. En las series con dimensión pais, por entidad y por fecha."""
    if not ruta_json.exists():
        return None
    contenido = json.loads(ruta_json.read_text(encoding="utf-8"))
    if isinstance(contenido["datos"], dict):
        return {ent: {fecha: valor for fecha, valor in filas} for ent, filas in contenido["datos"].items()}
    return {fecha: valor for fecha, valor in contenido["datos"]}


def comparar_entidades(por_entidad: dict[str, pd.Series], frecuencia: str, publicada: dict | None,
                       umbral_pct: float) -> dict:
    """Como `comparar`, entidad por entidad; las fechas del resultado llevan la entidad adelante («ARG 1990»)."""
    total = {"cambios": [], "sobre_umbral": [], "nuevas": 0, "quitadas": []}
    for ent, serie in sorted(por_entidad.items()):
        previa = None if publicada is None else publicada.get(ent, {})
        r = comparar(serie, frecuencia, previa, umbral_pct)
        for clave in ("cambios", "sobre_umbral"):
            total[clave] += [{**c, "fecha": f"{ent} {c['fecha']}"} for c in r[clave]]
        total["quitadas"] += [f"{ent} {f}" for f in r["quitadas"]]
        total["nuevas"] += r["nuevas"]
    return total


def comparar(serie: pd.Series, frecuencia: str, publicada: dict[str, float] | None, umbral_pct: float) -> dict:
    """Devuelve las fechas ya publicadas cuyo valor cambió y cuáles superan el umbral (en %)."""
    if publicada is None:
        return {"cambios": [], "sobre_umbral": [], "nuevas": len(serie), "quitadas": []}
    # Se compara con el mismo redondeo con el que se publica, para no contar ruido de punto flotante.
    nueva = {etiqueta_fecha(f, frecuencia): redondear(float(v)) for f, v in serie.items()}
    cambios, sobre_umbral = [], []
    for fecha, anterior in publicada.items():
        if fecha not in nueva:
            continue
        actual = nueva[fecha]
        if actual == anterior:
            continue
        variacion = (actual / anterior - 1) * 100 if anterior else float("inf")
        registro = {"fecha": fecha, "anterior": anterior, "nuevo": actual, "variacion_pct": round(variacion, 6)}
        cambios.append(registro)
        if abs(variacion) > umbral_pct:
            sobre_umbral.append(registro)
    quitadas = sorted(set(publicada) - set(nueva))
    nuevas = len(set(nueva) - set(publicada))
    return {"cambios": cambios, "sobre_umbral": sobre_umbral, "nuevas": nuevas, "quitadas": quitadas}
