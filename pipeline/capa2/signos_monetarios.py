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


def a_pesos_actuales(serie: pd.Series, signos: list[dict]) -> pd.Series:
    """Pasa una serie en moneda de cada época a pesos actuales (divide por el factor de cada fecha)."""
    factores = pd.Series([factor_a_pesos_actuales(f, signos) for f in serie.index], index=serie.index)
    return serie / factores


def a_moneda_de_epoca(serie: pd.Series, signos: list[dict]) -> pd.Series:
    """Inversa de `a_pesos_actuales`."""
    factores = pd.Series([factor_a_pesos_actuales(f, signos) for f in serie.index], index=serie.index)
    return serie * factores
