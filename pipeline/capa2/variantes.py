"""Construcción de las variantes de capa 2 a partir de su declaración en `metadatos/series/<slug>.yaml`."""

from __future__ import annotations

import pandas as pd

from pipeline.capa2 import derivadas, empalmes, signos_monetarios
from pipeline.comun import ErrorPipeline, a_fecha

METODOS = {
    "encadenar_tasas": empalmes.encadenar_tasas,
    "yuxtaponer": empalmes.yuxtaponer,
}


def resolver_completa(variante: dict, capa1: dict[str, pd.Series]) -> dict:
    """Copia de la variante con el tramo `completa: true` resuelto (segunda revisión de la 4a, 2.2).

    Un tramo que completa toma solo las fechas posteriores al último dato del tramo anterior: por ejemplo, las
    reservas de la serie diaria del BCRA para los meses que la mensual todavía no tiene. Su `desde` pasa a ser el mes
    siguiente a ese último dato. Si no aporta nada (la mensual ya se puso al día), el tramo se quita, y también los
    quiebres que dependen de él (`desde: tramo-completa` en quiebres.yaml), que se marcan en `_quitar_quiebres`.
    """
    if not any(t.get("completa") for t in variante["tramos"]):
        return variante
    nuevos = []
    for k, t in enumerate(variante["tramos"]):
        if not t.get("completa"):
            nuevos.append(t)
            continue
        if k == 0 or k != len(variante["tramos"]) - 1:
            raise ErrorPipeline(f"{variante['id']}: un tramo que completa tiene que ser el último y no el único.")
        anterior = variante["tramos"][k - 1]
        if anterior["fuente"] not in capa1 or t["fuente"] not in capa1:
            raise ErrorPipeline(f"La variante {variante['id']} usa una fuente que no está en la capa 1.")
        previa = capa1[anterior["fuente"]].loc[a_fecha(anterior["desde"]):]
        if anterior.get("hasta") not in (None, "hoy"):
            previa = previa.loc[: a_fecha(anterior["hasta"])]
        propia = capa1[t["fuente"]]
        aporta = propia[propia.index > previa.index[-1]]
        if aporta.empty:
            return {**variante, "tramos": nuevos, "_sin_completa": True}
        nuevos.append({**t, "desde": aporta.index[0].strftime("%Y-%m")})
    return {**variante, "tramos": nuevos}


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
              fuentes: dict[str, dict] | None = None, operandos: dict[str, pd.Series] | None = None,
              frecuencia: str | None = None) -> pd.Series:
    metodo = variante.get("empalme", "yuxtaponer")
    if metodo not in METODOS and metodo != "derivar":
        raise ErrorPipeline(f"Método de empalme desconocido en {variante['id']}: {metodo}")
    variante = resolver_completa(variante, capa1)
    # El tramo que completa se pega al final tal cual: no participa del empalme de los demás (en encadenar_tasas, el
    # nivel sigue siendo el de la serie mensual, no el del tramo reciente).
    completa = [t for t in variante["tramos"] if t.get("completa")]
    principal = {**variante, "tramos": [t for t in variante["tramos"] if not t.get("completa")]}
    if metodo == "derivar":
        serie = derivadas.derivar(variante, operandos or {}, frecuencia or "mensual")
    elif metodo == "encadenar_tasas":
        partes = tramos(principal, capa1, fuentes)
        serie = empalmes.encadenar_tasas(partes, enlace=principal.get("enlace", "periodo"))
    else:
        serie = METODOS[metodo](tramos(principal, capa1, fuentes))
    if completa:
        reciente = tramos({**variante, "tramos": completa}, capa1, fuentes)[0].recorte()
        serie = pd.concat([serie, reciente])
        serie.index.name, serie.name = "fecha", "valor"
    for r in variante.get("reemplazar", []):
        # Un dato de la fuente con un error comprobado se reemplaza por el de otra fuente declarada (por ejemplo, las
        # reservas de marzo de 2026: la mensual trae el saldo del 30/03 y no el del 31/03). Como `excluir`, es
        # estricto: si la fecha no está, si la otra fuente no la tiene o si ya dan lo mismo, el reemplazo sobra.
        fecha = a_fecha(r["fecha"])
        if r["fuente"] not in capa1:
            raise ErrorPipeline(f"{variante['id']}: `reemplazar` usa {r['fuente']}, que no está en la capa 1.")
        otra = capa1[r["fuente"]]
        if fecha not in serie.index or fecha not in otra.index:
            raise ErrorPipeline(f"{variante['id']}: `reemplazar` nombra {r['fecha']}, que no está en la serie o en {r['fuente']}.")
        if abs(serie.loc[fecha] - otra.loc[fecha]) <= 1e-9 * max(1.0, abs(otra.loc[fecha])):
            raise ErrorPipeline(f"{variante['id']}: el reemplazo de {r['fecha']} sobra: la serie ya da lo mismo que {r['fuente']}.")
        serie = serie.copy()
        serie.loc[fecha] = otra.loc[fecha]
    excluir = [a_fecha(e["fecha"]) for e in variante.get("excluir", [])]
    if excluir:
        # Observaciones de la fuente con errores evidentes, documentadas una por una en los metadatos. Una fecha que
        # no está en la serie es un error: mal escrita, o la fuente ya la corrigió y la exclusión sobra.
        faltan = [f.date().isoformat()[:7] for f in excluir if f not in serie.index]
        if faltan:
            raise ErrorPipeline(f"{variante['id']}: `excluir` nombra fechas que no están en la serie: {', '.join(faltan)}.")
        serie = serie.drop(index=excluir)
    if "invertir" in variante:
        # Índice dado vuelta (k ÷ valor), declarado: por ejemplo, para que un aumento del TCR sea depreciación.
        serie = float(variante["invertir"]) / serie
    if "rebase" in variante:
        # Lleva el índice a una base declarada: `rebase: {fecha: 2015-12, valor: 100}` (Bruegel, que no declara base;
        # tercera revisión de la 4a). La fecha tiene que estar en la serie.
        fecha = a_fecha(variante["rebase"]["fecha"])
        if fecha not in serie.index:
            raise ErrorPipeline(f"{variante['id']}: `rebase` usa {variante['rebase']['fecha']}, que no está en la serie.")
        serie = serie / serie.loc[fecha] * float(variante["rebase"].get("valor", 100))
    if "escala" in variante:
        # Cambio de unidad declarado (por ejemplo, de fracción a porcentaje).
        serie = serie * float(variante["escala"])
    conversion = variante.get("conversion")
    if conversion is not None and frecuencia not in (None, "mensual"):
        # La fecha de conversión es el último día del mes del índice: en otras frecuencias no sería el del período.
        raise ErrorPipeline(f"{variante['id']}: la conversión de signos monetarios solo está definida para series mensuales.")
    # Criterio único de Vaivén (revisión de la 4a, 05/11/2026): el signo vigente el último día del período, como en
    # la librería de transformaciones. `fecha_conversion: inicio` lo cambia al primer día.
    fin_de_mes = variante.get("fecha_conversion", "fin_de_mes") == "fin_de_mes"
    if conversion == "a_pesos_actuales":
        serie = signos_monetarios.a_pesos_actuales(serie, signos, fin_de_mes)
    elif conversion == "a_moneda_de_epoca":
        serie = signos_monetarios.a_moneda_de_epoca(serie, signos, fin_de_mes)
    elif conversion is not None:
        raise ErrorPipeline(f"Conversión desconocida en {variante['id']}: {conversion}")
    return serie
