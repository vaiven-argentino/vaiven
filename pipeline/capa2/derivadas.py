"""Variantes derivadas de otras (capa 2): saldo comercial, TCR bilateral, PIB en dólares, cocientes y diferencias.

Una variante con `empalme: derivar` declara la `operacion` y sus `operandos`, que pueden ser variantes de capa 2
(«exportaciones.oficial») o series de capa 1 («f.indec...»). Las fechas que no están en todos los operandos
quedan afuera: nunca se completa un dato.
"""

from __future__ import annotations

import pandas as pd

from pipeline.comun import ErrorPipeline, a_fecha


def operandos_de(variante: dict) -> list[str]:
    if "segmentos" in variante:
        return list(dict.fromkeys(o for seg in variante["segmentos"] for o in seg["operandos"]))
    return [o for o in variante.get("operandos", [])]


def _alinear(series: list[pd.Series]) -> list[pd.Series]:
    comun = series[0].dropna().index
    for s in series[1:]:
        comun = comun.intersection(s.dropna().index)
    return [s.loc[comun] for s in series]


def _promedio_por_periodo(s: pd.Series, fechas: pd.DatetimeIndex, frecuencia: str) -> pd.Series:
    """Promedio de una serie mensual en cada período (anual o trimestral) de `fechas`, solo con períodos completos."""
    meses = {"anual": 12, "trimestral": 3}[frecuencia]
    clave = s.index.year if frecuencia == "anual" else s.index.year * 10 + (s.index.month - 1) // 3
    grupos = s.dropna().groupby(clave[s.notna()])
    completos = grupos.count() == meses
    promedio = grupos.mean()[completos]
    salida = {}
    for f in fechas:
        k = f.year if frecuencia == "anual" else f.year * 10 + (f.month - 1) // 3
        if k in promedio.index:
            salida[f] = promedio.loc[k]
    return pd.Series(salida, dtype=float)


def derivar(variante: dict, disponibles: dict[str, pd.Series], frecuencia: str) -> pd.Series:
    if "segmentos" in variante:
        # La misma operación, con operandos distintos en cada período (por ejemplo, un cociente dentro de cada
        # base de las cuentas nacionales). Los segmentos no pueden superponerse.
        partes = []
        for seg in variante["segmentos"]:
            partes.append(_segmento(variante, seg, disponibles, frecuencia))
        r = pd.concat(partes)
        if r.index.duplicated().any():
            raise ErrorPipeline(f"{variante['id']}: los segmentos se superponen.")
        return r.sort_index()
    op = variante.get("operacion")
    nombres = operandos_de(variante)
    faltan = [n for n in nombres if n not in disponibles]
    if faltan:
        raise ErrorPipeline(f"{variante['id']}: faltan los operandos {', '.join(faltan)}.")
    xs = [disponibles[n] for n in nombres]

    if op == "resta":
        # El primero menos la suma de los demás (por ejemplo, pasivos externos − inversión directa − acciones).
        a, *resto = _alinear(xs)
        r = a - sum(resto[1:], resto[0])
    elif op == "suma":
        partes = _alinear(xs)
        r = sum(partes[1:], partes[0])
    elif op == "cociente":
        a, b = _alinear(xs)
        r = a / b * float(variante.get("por", 1))
    elif op == "tcr":
        # Tipo de cambio × precios externos ÷ precios internos, con base = 100 en `base`.
        tc, externo, interno = _alinear(xs)
        r = tc * externo / interno
        base = a_fecha(variante["base"])
        if base not in r.index:
            raise ErrorPipeline(f"{variante['id']}: no hay dato en la fecha base {variante['base']}.")
        r = r / r.loc[base] * 100
    elif op == "dividir_por_promedio":
        # Por ejemplo, el PIB en pesos ÷ el promedio del tipo de cambio de cada año o trimestre.
        a, b = xs
        promedio = _promedio_por_periodo(b, a.index, frecuencia)
        a, promedio = _alinear([a, promedio])
        r = a / promedio
    elif op == "diferencia":
        # Variación entre observaciones consecutivas de un stock (por ejemplo, de activos externos).
        (a,) = xs
        a = a.dropna()
        r = (a - a.shift(1)).iloc[1:]
    else:
        raise ErrorPipeline(f"{variante['id']}: operación desconocida «{op}».")

    if "desde" in variante:
        r = r.loc[a_fecha(variante["desde"]):]
    r = r.dropna()
    if r.empty:
        raise ErrorPipeline(f"{variante['id']}: la operación {op} no dejó datos.")
    r.index.name = "fecha"
    r.name = "valor"
    return r


def _segmento(variante: dict, seg: dict, disponibles: dict[str, pd.Series], frecuencia: str) -> pd.Series:
    sub = {k: v for k, v in variante.items() if k != "segmentos"}
    sub.update({"operandos": seg["operandos"]})
    sub.pop("desde", None)
    r = derivar(sub, disponibles, frecuencia)
    r = r.loc[a_fecha(seg["desde"]):]
    if seg.get("hasta"):
        r = r.loc[:a_fecha(seg["hasta"])]
    return r
