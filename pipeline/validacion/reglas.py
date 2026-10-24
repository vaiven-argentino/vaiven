"""Validaciones de las series (SPEC 5.1, paso 5): esquema, huecos, rangos, continuidad en los empalmes.

Cada regla devuelve una lista de `Problema`. Los de severidad «error» frenan la publicación;
los «aviso» se informan en el resumen pero no la frenan.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
import pandera.pandas as pa

from pipeline.capa2.empalmes import comparar_superposicion, tasas
from pipeline.comun import a_fecha, calendario, df_desde_serie


@dataclass
class Problema:
    serie: str
    regla: str
    detalle: str
    severidad: str = "error"
    valores: list = field(default_factory=list)

    def como_texto(self) -> str:
        texto = f"[{self.severidad}] {self.serie} · {self.regla}: {self.detalle}"
        if self.valores:
            texto += "\n" + "\n".join(f"    {v}" for v in self.valores[:20])
            if len(self.valores) > 20:
                texto += f"\n    … y {len(self.valores) - 20} más"
        return texto


ESQUEMA_SERIE = pa.DataFrameSchema(
    {
        "fecha": pa.Column("datetime64[ns]", unique=True, coerce=True),
        "valor": pa.Column(
            float,
            nullable=False,
            coerce=True,
            checks=pa.Check(lambda s: np.isfinite(s), error="valor no finito"),
        ),
    },
    checks=pa.Check(lambda df: df["fecha"].is_monotonic_increasing, error="fechas desordenadas"),
    strict=True,
)


def esquema(nombre: str, serie: pd.Series) -> list[Problema]:
    try:
        ESQUEMA_SERIE.validate(df_desde_serie(serie), lazy=True)
    except pa.errors.SchemaErrors as e:
        casos = e.failure_cases[["column", "check", "failure_case"]].values.tolist()
        return [Problema(nombre, "esquema", "la serie no cumple el esquema",
                         valores=[" | ".join(str(x) for x in c) for c in casos])]
    if serie.empty:
        return [Problema(nombre, "esquema", "la serie está vacía")]
    return []


def huecos(nombre: str, serie: pd.Series, frecuencia: str, permitidos: list | None = None, meses: list[int] | None = None) -> list[Problema]:
    """Fechas que faltan entre la primera y la última observación, salvo las declaradas como huecos esperados."""
    if frecuencia not in ("mensual", "trimestral", "semestral", "anual") or serie.empty:
        # Las diarias no tienen calendario fijo; las variantes de frecuencia mixta se controlan por tramo, en la capa 1.
        return []
    esperadas = calendario(frecuencia, serie.index[0], serie.index[-1], meses)
    faltan = esperadas.difference(serie.index)
    aceptadas = set()
    for h in permitidos or []:
        desde, hasta = a_fecha(h["desde"]), a_fecha(h.get("hasta", h["desde"]))
        aceptadas.update(f for f in faltan if desde <= f <= hasta)
    faltan = [f for f in faltan if f not in aceptadas]
    if not faltan:
        return []
    return [Problema(nombre, "huecos", f"faltan {len(faltan)} períodos", valores=[f.strftime("%Y-%m-%d") for f in faltan])]


def rangos(nombre: str, serie: pd.Series, reglas: dict | None) -> list[Problema]:
    """Rangos plausibles del nivel (`min`, `max`) y de la variación entre observaciones en % (`var_min`, `var_max`)."""
    if not reglas:
        return []
    problemas = []
    if "min" in reglas or "max" in reglas:
        lo, hi = reglas.get("min", -np.inf), reglas.get("max", np.inf)
        fuera = serie[(serie < lo) | (serie > hi)]
        if not fuera.empty:
            problemas.append(
                Problema(nombre, "rango", f"{len(fuera)} valores fuera de [{lo}, {hi}]",
                         valores=[f"{f.date()}: {v!r}" for f, v in fuera.items()])
            )
    if "var_min" in reglas or "var_max" in reglas:
        lo, hi = reglas.get("var_min", -np.inf), reglas.get("var_max", np.inf)
        r = (tasas(serie) * 100).dropna()
        fuera = r[(r < lo) | (r > hi)]
        if not fuera.empty:
            problemas.append(
                Problema(nombre, "rango", f"{len(fuera)} variaciones fuera de [{lo} %, {hi} %]",
                         valores=[f"{f.date()}: {v!r} %" for f, v in fuera.items()])
            )
    return problemas


def continuidad(nombre: str, a: pd.Series, b: pd.Series, etiqueta: str, tolerancia: float, en: str = "tasas",
                severidad: str = "error", desde: pd.Timestamp | None = None,
                hasta: pd.Timestamp | None = None, excepciones: list | None = None) -> list[Problema]:
    """Compara dos tramos donde se superponen; informa las diferencias que superan la tolerancia.

    En tasas, la tolerancia está en puntos porcentuales; en niveles, en % del valor de `a`.
    `excepciones` son fechas con diferencias conocidas y documentadas en los metadatos, que no se cuentan.
    """
    df = comparar_superposicion(a, b, en=en)
    if desde is not None:
        df = df.loc[df.index >= desde]
    if hasta is not None:
        df = df.loc[df.index <= hasta]
    if excepciones:
        df = df.drop(index=[a_fecha(f) for f in excepciones], errors="ignore")
    if df.empty:
        return []
    if en == "niveles":
        df["diferencia"] = (df["b"] / df["a"] - 1) * 100
    grandes = df[df["diferencia"].abs() > tolerancia]
    if grandes.empty:
        return []
    return [
        Problema(
            nombre,
            "continuidad",
            f"{etiqueta}: {len(grandes)} de {len(df)} períodos superpuestos difieren en más de {tolerancia}"
            + (" p. p." if en == "tasas" else " %"),
            severidad=severidad,
            valores=[f"{f.date()}: a={float(r.a)!r} b={float(r.b)!r} dif={float(r.diferencia)!r}" for f, r in grandes.iterrows()],
        )
    ]


def coherencia_anual(nombre: str, mensual: pd.Series, anual: pd.Series, etiqueta: str, agregacion: str,
                     tolerancia_pct: float, severidad: str = "error") -> list[Problema]:
    """Compara la serie anual publicada con la agregación de la mensual en los años completos (12 meses)."""
    grupos = mensual.groupby(mensual.index.year)
    completos = grupos.count()[lambda c: c == 12].index
    funciones = {"suma": grupos.sum(), "promedio": grupos.mean(), "fin_de_periodo": grupos.last()}
    agregada = funciones[agregacion].loc[completos]
    anual_por_anio = pd.Series(anual.to_numpy(), index=anual.index.year)
    comun = agregada.index.intersection(anual_por_anio.index)
    dif = (agregada.loc[comun] / anual_por_anio.loc[comun] - 1) * 100
    grandes = dif[dif.abs() > tolerancia_pct]
    if grandes.empty:
        return []
    return [Problema(nombre, "coherencia", f"{etiqueta}: {len(grandes)} de {len(comun)} años difieren en más de {tolerancia_pct} %",
                     severidad=severidad,
                     valores=[f"{a}: agregada={float(agregada.loc[a])!r} anual={float(anual_por_anio.loc[a])!r} dif={float(d)!r} %"
                              for a, d in grandes.items()])]
