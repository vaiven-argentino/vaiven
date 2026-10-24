"""Archivos CSV de las distribuciones del catálogo de datos.gob.ar (infra.datos.gob.ar).

Se usa cuando la API Series de Tiempo no devuelve datos de una serie que sí está en el CSV de su
distribución (por ejemplo, la desocupación por aglomerado 1974–2003). El snapshot guarda el CSV
completo; `columna` indica qué columna es la serie fuente.
"""

from __future__ import annotations

import io

import pandas as pd

from pipeline.fuentes.base import Archivo, descargar


def bajar(fuente: dict) -> list[Archivo]:
    return [Archivo("distribucion.csv", fuente["url_descarga"], descargar(fuente["url_descarga"]))]


def normalizar(archivos: list[tuple[str, bytes]], columna: str) -> pd.DataFrame:
    (_, contenido), = archivos
    df = pd.read_csv(io.BytesIO(contenido), encoding="utf-8-sig")
    df = df[["indice_tiempo", columna]].rename(columns={"indice_tiempo": "fecha", columna: "valor"})
    df = df.dropna(subset=["valor"])
    df["fecha"] = pd.to_datetime(df["fecha"])
    df["valor"] = df["valor"].astype(float)
    return df.sort_values("fecha").reset_index(drop=True)
