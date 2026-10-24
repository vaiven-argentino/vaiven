"""API SDMX de la OCDE (https://sdmx.oecd.org/public/rest/), en CSV. Los datos de la OCDE tienen licencia CC BY 4.0
desde el 1/7/2024.
"""

from __future__ import annotations

import io

import pandas as pd

from pipeline.comun import ErrorPipeline
from pipeline.fuentes.base import Archivo, descargar


def bajar(fuente: dict) -> list[Archivo]:
    return [Archivo("datos.csv", fuente["url_descarga"], descargar(fuente["url_descarga"], timeout=120))]


def normalizar(archivos: list[tuple[str, bytes]], columna: str | None = None) -> pd.DataFrame:
    (_, contenido), = archivos
    df = pd.read_csv(io.BytesIO(contenido), dtype={"TIME_PERIOD": str})
    if df["REF_AREA"].nunique() != 1 or df["FREQ"].nunique() != 1:
        raise ErrorPipeline("La consulta a la OCDE trajo más de una serie.")
    df = df[["TIME_PERIOD", "OBS_VALUE"]].dropna().rename(columns={"TIME_PERIOD": "fecha", "OBS_VALUE": "valor"})
    df["fecha"] = pd.to_datetime(df["fecha"])
    df["valor"] = df["valor"].astype(float)
    return df.sort_values("fecha").reset_index(drop=True)
