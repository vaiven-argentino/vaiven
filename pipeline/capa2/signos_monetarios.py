"""Conversión entre la moneda de cada época y pesos actuales (SPEC, sección 4)."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from pipeline.comun import a_fecha, leer_yaml


def cargar_signos(ruta: Path) -> list[dict]:
    signos = leer_yaml(ruta)
    for s in signos:
        s["desde"] = a_fecha(s["desde"])
    return sorted(signos, key=lambda s: s["desde"])


def factor_a_pesos_actuales(fecha: pd.Timestamp, signos: list[dict]) -> float:
    """Cuántas unidades del signo vigente en `fecha` equivalen a un peso actual.

    Por ejemplo, 1e11 para una fecha de 1975 (peso ley 18.188): 10.000 × 1.000 × 10.000.
    """
    factor = 1.0
    for s in signos:
        if s["desde"] > fecha and s["equivale"]:
            factor *= s["equivale"]
    return factor


def _factores(serie: pd.Series, signos: list[dict], fin_de_mes: bool) -> pd.Series:
    """Factor de cada fecha. Con `fin_de_mes`, se usa el signo vigente el último día del mes
    (para valores de fin de período: por ejemplo, junio de 1985 ya está en australes)."""
    fechas = serie.index + pd.offsets.MonthEnd(0) if fin_de_mes else serie.index
    return pd.Series([factor_a_pesos_actuales(f, signos) for f in fechas], index=serie.index)


def a_pesos_actuales(serie: pd.Series, signos: list[dict], fin_de_mes: bool = False) -> pd.Series:
    """Pasa una serie en moneda de cada época a pesos actuales (divide por el factor de cada fecha)."""
    return serie / _factores(serie, signos, fin_de_mes)


def a_moneda_de_epoca(serie: pd.Series, signos: list[dict], fin_de_mes: bool = False) -> pd.Series:
    """Inversa de `a_pesos_actuales`."""
    return serie * _factores(serie, signos, fin_de_mes)
