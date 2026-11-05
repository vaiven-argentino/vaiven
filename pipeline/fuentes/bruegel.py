"""Base de tipos de cambio reales efectivos de Bruegel (Darvas, 2012, actualizada): un xls de unos 10 MB por versión.

El snapshot no guarda el zip (es grande y cambia de nombre con cada versión): guarda la columna que usa Vaivén,
extraída tal cual, y en `meta.json` el nombre, el tamaño y el checksum del zip del que salió. Es una diferencia
con la regla general del snapshot, anotada en docs/NOTAS_FASE4.md.
"""

from __future__ import annotations

import hashlib
import io
import re
import zipfile
from urllib.parse import urljoin

import pandas as pd

from pipeline.comun import ErrorPipeline
from pipeline.fuentes.base import Archivo, descargar

ENLACE = re.compile(r'href="([^"]*REER_database_ver[^"]*\.zip)"')


def ultima_version(url_pagina: str) -> str:
    """URL del zip vigente, tomada de la página del conjunto de datos."""
    pagina = descargar(url_pagina).decode("utf-8", errors="replace")
    enlaces = ENLACE.findall(pagina)
    if not enlaces:
        raise ErrorPipeline(f"No se encontró el enlace al zip de la base REER en {url_pagina}.")
    return urljoin(url_pagina, enlaces[0])


def extraer(contenido_zip: bytes, hoja: str, columna: str) -> bytes:
    """La columna de una hoja del xls, como CSV fecha,valor (fechas AAAA-MM-01; las celdas vacías quedan afuera)."""
    import xlrd

    with zipfile.ZipFile(io.BytesIO(contenido_zip)) as z:
        nombres = [n for n in z.namelist() if n.lower().endswith(".xls")]
        if len(nombres) != 1:
            raise ErrorPipeline(f"El zip de la base REER tiene {len(nombres)} archivos xls (se esperaba uno).")
        libro = xlrd.open_workbook(file_contents=z.read(nombres[0]))
    s = libro.sheet_by_name(hoja)
    cabecera = s.row_values(0)
    if columna not in cabecera:
        raise ErrorPipeline(f"La hoja {hoja} de la base REER no tiene la columna {columna}.")
    j = cabecera.index(columna)
    filas = ["fecha,valor"]
    for r in range(1, s.nrows):
        periodo, valor = str(s.cell_value(r, 0)), s.cell_value(r, j)
        m = re.fullmatch(r"(\d{4})M(\d{2})", periodo)
        if not m:
            raise ErrorPipeline(f"Período desconocido en la hoja {hoja}: «{periodo}».")
        if valor != "":
            filas.append(f"{m[1]}-{m[2]}-01,{float(valor)!r}")
    return ("\n".join(filas) + "\n").encode()


def bajar(fuente: dict) -> list[Archivo]:
    url_zip = ultima_version(fuente["url_pagina"])
    contenido = descargar(url_zip, timeout=180)
    extraido = extraer(contenido, fuente["hoja"], fuente["columna"])
    origen = {"archivo": url_zip.rsplit("/", 1)[-1], "bytes": len(contenido), "sha256": hashlib.sha256(contenido).hexdigest()}
    return [Archivo(f"{fuente['hoja']}_{fuente['columna']}.csv", url_zip, extraido, origen)]


def normalizar(archivos: list[tuple[str, bytes]], columna: str | None = None) -> pd.DataFrame:
    (_, contenido), = archivos
    df = pd.read_csv(io.BytesIO(contenido))
    df["fecha"] = pd.to_datetime(df["fecha"])
    df["valor"] = df["valor"].astype(float)
    return df.sort_values("fecha").reset_index(drop=True)
