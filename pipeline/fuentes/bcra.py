"""API de estadísticas monetarias del BCRA, v4.0 (https://api.bcra.gob.ar/estadisticas/v4.0/)."""

from __future__ import annotations

import json
from datetime import date

import pandas as pd

from pipeline.fuentes.base import Archivo, descargar

URL = "https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/{id}"
LIMITE = 3000


def bajar(fuente: dict) -> list[Archivo]:
    """Baja la variable completa desde la fecha de inicio declarada, paginando de a 3000 observaciones."""
    url = URL.format(id=fuente["id_api"])
    desde = str(fuente.get("cobertura", {}).get("desde", "1990-01-01"))
    if len(desde) == 7:
        desde += "-01"
    archivos = []
    offset = 0
    while True:
        params = {"desde": desde, "hasta": date.today().isoformat(), "limit": LIMITE, "offset": offset}
        contenido = descargar(url, params)
        pagina = json.loads(contenido)
        archivos.append(Archivo(f"pagina-{len(archivos) + 1:03d}.json", url + "?" + "&".join(f"{k}={v}" for k, v in params.items()), contenido))
        offset += LIMITE
        if offset >= pagina["metadata"]["resultset"]["count"]:
            return archivos


def normalizar(archivos: list[tuple[str, bytes]]) -> pd.DataFrame:
    filas = []
    for _, contenido in sorted(archivos):
        for resultado in json.loads(contenido)["results"]:
            filas.extend((d["fecha"], d["valor"]) for d in resultado["detalle"])
    df = pd.DataFrame(filas, columns=["fecha", "valor"]).dropna(subset=["valor"])
    df["fecha"] = pd.to_datetime(df["fecha"])
    df["valor"] = df["valor"].astype(float)
    return df.drop_duplicates("fecha").sort_values("fecha").reset_index(drop=True)
