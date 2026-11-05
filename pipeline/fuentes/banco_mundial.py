"""API de indicadores del Banco Mundial, v2 (https://api.worldbank.org/v2/), licencia CC BY 4.0.

Una fuente es un indicador para una entidad (`pais`) o para varias (`paises`, series con dimensión pais).
"""

from __future__ import annotations

import json

import pandas as pd

from pipeline.comun import ErrorPipeline
from pipeline.fuentes.base import Archivo, descargar

URL = "https://api.worldbank.org/v2/country/{paises}/indicator/{indicador}"


def bajar(fuente: dict) -> list[Archivo]:
    paises = ";".join(fuente.get("paises") or [fuente["pais"]])
    url = URL.format(paises=paises, indicador=fuente["id_api"])
    params = {"format": "json", "per_page": 20000}
    contenido = descargar(url, params)
    datos = json.loads(contenido)
    if not isinstance(datos, list) or len(datos) < 2 or datos[1] is None:
        raise ErrorPipeline(f"{fuente['id']}: respuesta inesperada del Banco Mundial: {contenido[:300]!r}")
    return [Archivo("pagina-001.json", f"{url}?format=json&per_page=20000", contenido)]


def normalizar_largo(archivos: list[tuple[str, bytes]]) -> pd.DataFrame:
    """fecha, pais (ISO3), valor; los años sin dato quedan afuera."""
    filas = []
    for _, contenido in archivos:
        meta, datos = json.loads(contenido)
        if meta.get("pages", 1) != 1:
            raise ErrorPipeline("La respuesta del Banco Mundial vino paginada: subí per_page.")
        for d in datos:
            if d["value"] is not None:
                filas.append((pd.Timestamp(year=int(d["date"]), month=1, day=1), d["countryiso3code"], float(d["value"])))
    df = pd.DataFrame(filas, columns=["fecha", "pais", "valor"])
    return df.sort_values(["pais", "fecha"]).reset_index(drop=True)


def normalizar(archivos: list[tuple[str, bytes]], columna: str | None = None) -> pd.DataFrame:
    df = normalizar_largo(archivos)
    if df["pais"].nunique() > 1:
        raise ErrorPipeline("Una fuente del Banco Mundial de una sola serie trajo varias entidades.")
    return df[["fecha", "valor"]]
