"""API Series de Tiempo de datos.gob.ar (https://apis.datos.gob.ar/series/api/)."""

from __future__ import annotations

import json
from datetime import date, timedelta

import pandas as pd

from pipeline.fuentes.base import Archivo, descargar

URL = "https://apis.datos.gob.ar/series/api/series/"
LIMITE = 5000
# En las series que la API pasa a mensuales (`colapsar`): el último dato diario del período bajado.
ULTIMO_DIARIO = "ultimo-diario.json"


def bajar(fuente: dict) -> list[Archivo]:
    """Baja la serie completa, paginando de a 5000 observaciones. La primera página trae los metadatos completos.

    Con `colapsar: {a: month, con: end_of_period | avg}` (series diarias del BCRA, segunda revisión de la 4a), la API
    la pasa a mensual hasta el último día del mes anterior a la descarga (así el snapshot no cambia todos los días), y
    se baja aparte el último dato diario de ese período para saber si el último mes está completo.
    """
    colapsar = fuente.get("colapsar")
    extra = {}
    if colapsar:
        fin = (date.today().replace(day=1) - timedelta(days=1)).isoformat()
        extra = {"collapse": colapsar["a"], "collapse_aggregation": colapsar["con"], "end_date": fin}
    archivos = []
    inicio = 0
    while True:
        params = {"ids": fuente["id_api"], "format": "json", "limit": LIMITE, "start": inicio,
                  "metadata": "full" if inicio == 0 else "none", **extra}
        contenido = descargar(URL, params)
        pagina = json.loads(contenido)
        url = f"{URL}?" + "&".join(f"{k}={v}" for k, v in params.items())
        archivos.append(Archivo(f"pagina-{len(archivos) + 1:03d}.json", url, contenido))
        inicio += LIMITE
        if inicio >= pagina.get("count", 0):
            break
    if colapsar:
        params = {"ids": fuente["id_api"], "format": "json", "limit": 1, "sort": "desc", "metadata": "none",
                  "end_date": extra["end_date"]}
        contenido = descargar(URL, params)
        url = f"{URL}?" + "&".join(f"{k}={v}" for k, v in params.items())
        archivos.append(Archivo(ULTIMO_DIARIO, url, contenido))
    return archivos


def normalizar(archivos: list[tuple[str, bytes]]) -> pd.DataFrame:
    filas = []
    ultimo_diario = None
    for nombre, contenido in sorted(archivos):
        if nombre == ULTIMO_DIARIO:
            datos = json.loads(contenido)["data"]
            ultimo_diario = pd.Timestamp(datos[0][0]) if datos else None
            continue
        filas.extend(json.loads(contenido)["data"])
    df = pd.DataFrame(filas, columns=["fecha", "valor"])
    df = df.dropna(subset=["valor"])
    df["fecha"] = pd.to_datetime(df["fecha"])
    df["valor"] = df["valor"].astype(float)
    df = df.sort_values("fecha").reset_index(drop=True)
    if ultimo_diario is not None:
        # Serie diaria pasada a mensual: el último mes entra solo si la diaria tiene dato de su último día.
        df = df[df["fecha"] + pd.offsets.MonthEnd(0) <= ultimo_diario].reset_index(drop=True)
    return df
