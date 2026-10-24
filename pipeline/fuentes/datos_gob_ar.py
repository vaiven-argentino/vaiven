"""API Series de Tiempo de datos.gob.ar (https://apis.datos.gob.ar/series/api/)."""

from __future__ import annotations

import json

import pandas as pd

from pipeline.fuentes.base import Archivo, descargar

URL = "https://apis.datos.gob.ar/series/api/series/"
LIMITE = 5000


def bajar(fuente: dict) -> list[Archivo]:
    """Baja la serie completa, paginando de a 5000 observaciones. La primera página trae los metadatos completos."""
    archivos = []
    inicio = 0
    while True:
        params = {"ids": fuente["id_api"], "format": "json", "limit": LIMITE, "start": inicio,
                  "metadata": "full" if inicio == 0 else "none"}
        contenido = descargar(URL, params)
        pagina = json.loads(contenido)
        url = f"{URL}?" + "&".join(f"{k}={v}" for k, v in params.items())
        archivos.append(Archivo(f"pagina-{len(archivos) + 1:03d}.json", url, contenido))
        inicio += LIMITE
        if inicio >= pagina.get("count", 0):
            return archivos


def normalizar(archivos: list[tuple[str, bytes]]) -> pd.DataFrame:
    filas = []
    for _, contenido in sorted(archivos):
        filas.extend(json.loads(contenido)["data"])
    df = pd.DataFrame(filas, columns=["fecha", "valor"])
    df = df.dropna(subset=["valor"])
    df["fecha"] = pd.to_datetime(df["fecha"])
    df["valor"] = df["valor"].astype(float)
    return df.sort_values("fecha").reset_index(drop=True)
