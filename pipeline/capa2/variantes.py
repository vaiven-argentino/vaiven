"""Construcción de las variantes de capa 2 a partir de su declaración en `metadatos/series/<slug>.yaml`."""

from __future__ import annotations

import pandas as pd

from pipeline.capa2 import empalmes, signos_monetarios
from pipeline.comun import ErrorPipeline, a_fecha

METODOS = {
    "encadenar_tasas": empalmes.encadenar_tasas,
    "yuxtaponer": empalmes.yuxtaponer,
}


def tramos(variante: dict, capa1: dict[str, pd.Series], fuentes: dict[str, dict] | None = None) -> list[empalmes.Tramo]:
    salida = []
    for t in variante["tramos"]:
        if t["fuente"] not in capa1:
            raise ErrorPipeline(f"La variante {variante['id']} usa {t['fuente']}, que no está en la capa 1.")
        serie = capa1[t["fuente"]]
        if "agregar" in t:
            # Tramo que entra con otra frecuencia (por ejemplo, la cuenta corriente anual armada con la trimestral).
            if t["agregar"].get("a") != "anual" or fuentes is None:
                raise ErrorPipeline(f"{variante['id']}: solo se puede agregar a anual un tramo de una fuente declarada.")
            serie = empalmes.agregar_anual(serie, fuentes[t["fuente"]]["frecuencia"], t["agregar"].get("con", "suma"))
        salida.append(
            empalmes.Tramo(
                fuente=t["fuente"],
                serie=serie,
                desde=a_fecha(t["desde"]),
                hasta=a_fecha(t["hasta"]) if t.get("hasta") not in (None, "hoy") else None,
                coeficiente=float(t.get("coeficiente", 1.0)),
            )
        )
    return salida


def construir(variante: dict, capa1: dict[str, pd.Series], signos: list[dict],
              fuentes: dict[str, dict] | None = None) -> pd.Series:
    metodo = variante.get("empalme", "yuxtaponer")
    if metodo not in METODOS:
        raise ErrorPipeline(f"Método de empalme desconocido en {variante['id']}: {metodo}")
    partes = tramos(variante, capa1, fuentes)
    if metodo == "encadenar_tasas":
        serie = empalmes.encadenar_tasas(partes, enlace=variante.get("enlace", "periodo"))
    else:
        serie = METODOS[metodo](partes)
    excluir = [a_fecha(e["fecha"]) for e in variante.get("excluir", [])]
    if excluir:
        # Observaciones de la fuente con errores evidentes, documentadas una por una en los metadatos.
        serie = serie.drop(index=excluir, errors="ignore")
    if "invertir" in variante:
        # Índice dado vuelta (k ÷ valor), declarado: por ejemplo, para que un aumento del TCR sea depreciación.
        serie = float(variante["invertir"]) / serie
    if "escala" in variante:
        # Cambio de unidad declarado (por ejemplo, de fracción a porcentaje).
        serie = serie * float(variante["escala"])
    conversion = variante.get("conversion")
    fin_de_mes = variante.get("fecha_conversion") == "fin_de_mes"
    if conversion == "a_pesos_actuales":
        serie = signos_monetarios.a_pesos_actuales(serie, signos, fin_de_mes)
    elif conversion == "a_moneda_de_epoca":
        serie = signos_monetarios.a_moneda_de_epoca(serie, signos, fin_de_mes)
    elif conversion is not None:
        raise ErrorPipeline(f"Conversión desconocida en {variante['id']}: {conversion}")
    return serie
