"""Construcción de las variantes de capa 2 a partir de su declaración en `metadatos/series/<slug>.yaml`."""

from __future__ import annotations

import pandas as pd

from pipeline.capa2 import empalmes, signos_monetarios
from pipeline.comun import ErrorPipeline, a_fecha

METODOS = {
    "encadenar_tasas": empalmes.encadenar_tasas,
    "yuxtaponer": empalmes.yuxtaponer,
}


def tramos(variante: dict, capa1: dict[str, pd.Series]) -> list[empalmes.Tramo]:
    salida = []
    for t in variante["tramos"]:
        if t["fuente"] not in capa1:
            raise ErrorPipeline(f"La variante {variante['id']} usa {t['fuente']}, que no está en la capa 1.")
        salida.append(
            empalmes.Tramo(
                fuente=t["fuente"],
                serie=capa1[t["fuente"]],
                desde=a_fecha(t["desde"]),
                hasta=a_fecha(t["hasta"]) if t.get("hasta") not in (None, "hoy") else None,
                coeficiente=float(t.get("coeficiente", 1.0)),
            )
        )
    return salida


def construir(variante: dict, capa1: dict[str, pd.Series], signos: list[dict]) -> pd.Series:
    metodo = variante.get("empalme", "yuxtaponer")
    if metodo not in METODOS:
        raise ErrorPipeline(f"Método de empalme desconocido en {variante['id']}: {metodo}")
    serie = METODOS[metodo](tramos(variante, capa1))
    conversion = variante.get("conversion")
    if conversion == "a_pesos_actuales":
        serie = signos_monetarios.a_pesos_actuales(serie, signos)
    elif conversion == "a_moneda_de_epoca":
        serie = signos_monetarios.a_moneda_de_epoca(serie, signos)
    elif conversion is not None:
        raise ErrorPipeline(f"Conversión desconocida en {variante['id']}: {conversion}")
    return serie
