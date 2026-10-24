"""Métodos de empalme de la capa 2.

Todos reciben tramos de capa 1 (series de nivel indexadas por fecha) y devuelven una sola serie.
No hay transformaciones de contenido fuera de las que declara cada método.
"""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from pipeline.comun import ErrorPipeline


@dataclass
class Tramo:
    """Un pedazo de una serie de capa 1 que entra en una variante."""

    fuente: str
    serie: pd.Series
    desde: pd.Timestamp
    hasta: pd.Timestamp | None = None
    coeficiente: float = 1.0

    def recorte(self) -> pd.Series:
        s = self.serie.loc[self.desde :]
        if self.hasta is not None:
            s = s.loc[: self.hasta]
        if s.empty:
            raise ErrorPipeline(
                f"El tramo de {self.fuente} entre {self.desde.date()} y "
                f"{self.hasta.date() if self.hasta is not None else 'hoy'} no tiene datos."
            )
        return s

    def descripcion(self) -> str:
        hasta = self.hasta.date() if self.hasta is not None else "hoy"
        return f"{self.fuente} ({self.desde.date()} a {hasta})"


def tasas(nivel: pd.Series) -> pd.Series:
    """Variación relativa entre observaciones consecutivas: xₜ / xₜ₋₁ − 1."""
    return nivel / nivel.shift(1) - 1


def _observacion_anterior(serie: pd.Series, fecha: pd.Timestamp) -> pd.Timestamp | None:
    anteriores = serie.index[serie.index < fecha]
    return anteriores[-1] if len(anteriores) else None


def encadenar_tasas(tramos: list[Tramo], ancla: str = "ultimo", enlace: str = "periodo") -> pd.Series:
    """Empalme por tasas de variación (retropolación).

    El primer tramo aporta sus niveles; cada tramo siguiente aporta solo sus tasas de variación,
    calculadas con sus propios datos (la tasa del primer período del tramo usa el período anterior
    de la misma fuente). Después se reescala todo para que coincida con los niveles del tramo que
    indica `ancla`: "ultimo" (el más reciente, el habitual) o "primero".

    Exige que los tramos sean contiguos: el período anterior al inicio de cada tramo, en su propia
    fuente, tiene que ser el último período del tramo previo.
    """
    if not tramos:
        raise ErrorPipeline("encadenar_tasas necesita al menos un tramo.")
    if enlace == "anual":
        return _encadenar_por_anio(tramos)
    if enlace != "periodo":
        raise ErrorPipeline(f"Enlace desconocido: {enlace}")

    resultado = tramos[0].recorte().copy()
    for tramo in tramos[1:]:
        propio = tramo.recorte()
        inicio = propio.index[0]
        previa = _observacion_anterior(tramo.serie, inicio)
        if previa is None:
            raise ErrorPipeline(
                f"No se puede empalmar {tramo.descripcion()}: la fuente no tiene el período anterior "
                f"a {inicio.date()}, que hace falta para calcular la primera tasa."
            )
        if previa != resultado.index[-1]:
            raise ErrorPipeline(
                f"Hueco entre tramos: el anterior termina en {resultado.index[-1].date()} y "
                f"{tramo.descripcion()} empalma desde {previa.date()}."
            )
        # Tasas del tramo, incluida la del primer período (contra el período anterior de la misma fuente).
        con_previa = tramo.serie.loc[previa : propio.index[-1]]
        r = tasas(con_previa).iloc[1:]
        nivel = resultado.iloc[-1]
        nuevos = []
        for valor in r:
            nivel = nivel * (1 + valor)
            nuevos.append(nivel)
        resultado = pd.concat([resultado, pd.Series(nuevos, index=r.index)])

    referencia = tramos[-1] if ancla == "ultimo" else tramos[0]
    propio = referencia.recorte()
    fecha_ref = propio.index[0]
    factor = propio.loc[fecha_ref] / resultado.loc[fecha_ref]
    resultado = resultado * factor
    resultado.index.name = "fecha"
    resultado.name = "valor"
    return resultado


def _encadenar_por_anio(tramos: list[Tramo]) -> pd.Series:
    """Retropolación enlazada en un año completo: para series trimestrales o mensuales sin desestacionalizar.

    Cada tramo conserva sus tasas de variación. El enlace entre un tramo y el siguiente es el primer año del
    tramo nuevo: el tramo viejo se reescala con el cociente entre los totales de ese año en las dos fuentes, así
    que el crecimiento anual del año de enlace es el de la fuente vieja y el del año siguiente, el de la nueva.
    Enlazar en un solo período mezclaría la estacionalidad distinta de cada base. El nivel es el del tramo más
    reciente. Exige que cada tramo empiece en enero y que la fuente vieja tenga completo el año de enlace.
    """
    resultado = tramos[-1].recorte().copy()
    for viejo, nuevo in zip(reversed(tramos[:-1]), reversed(tramos[1:])):
        inicio = nuevo.recorte().index[0]
        if inicio.month != 1:
            raise ErrorPipeline(f"{nuevo.descripcion()}: con enlace anual, el tramo tiene que empezar en enero.")
        anio = inicio.year
        en_nuevo = resultado[resultado.index.year == anio]
        en_viejo = viejo.serie[viejo.serie.index.year == anio]
        if len(en_viejo) == 0 or len(en_viejo) != len(en_nuevo) or en_viejo.isna().any():
            raise ErrorPipeline(
                f"No se puede enlazar {viejo.descripcion()} con {nuevo.descripcion()}: la fuente vieja no tiene "
                f"completo el año {anio} ({len(en_viejo)} observaciones contra {len(en_nuevo)})."
            )
        propio = viejo.recorte()
        if propio.index[-1] >= inicio:
            raise ErrorPipeline(f"Tramos superpuestos: {viejo.descripcion()} llega hasta el enlace ({inicio.date()}).")
        factor = en_nuevo.sum() / en_viejo.sum()
        resultado = pd.concat([propio * factor, resultado])
    resultado.index.name = "fecha"
    resultado.name = "valor"
    return resultado


def yuxtaponer(tramos: list[Tramo]) -> pd.Series:
    """Une tramos sin ajustarlos entre sí, salvo el coeficiente declarado de cada uno (por defecto, 1).

    Sirve para las variantes «sin empalmar» y para los empalmes por coeficientes publicados
    (por ejemplo, los del INDEC entre la EPH puntual y la continua). Los tramos no pueden superponerse.
    """
    partes = []
    ultimo = None
    for tramo in tramos:
        propio = tramo.recorte() * tramo.coeficiente
        if ultimo is not None and propio.index[0] <= ultimo:
            raise ErrorPipeline(
                f"Tramos superpuestos: {tramo.descripcion()} empieza antes del fin del tramo anterior ({ultimo.date()})."
            )
        partes.append(propio)
        ultimo = propio.index[-1]
    resultado = pd.concat(partes)
    resultado.index.name = "fecha"
    resultado.name = "valor"
    return resultado


def comparar_superposicion(a: pd.Series, b: pd.Series, en: str = "tasas") -> pd.DataFrame:
    """Compara dos series en las fechas que comparten: tasas de variación (en %) o niveles."""
    if en == "tasas":
        a, b = tasas(a) * 100, tasas(b) * 100
    comun = a.index.intersection(b.index)
    df = pd.DataFrame({"a": a.loc[comun], "b": b.loc[comun]}).dropna()
    df["diferencia"] = df["b"] - df["a"]
    return df


SUBPERIODOS = {"mensual": 12, "trimestral": 4, "semestral": 2}


def agregar_anual(serie: pd.Series, frecuencia: str, con: str = "suma") -> pd.Series:
    """Pasa una serie mensual, trimestral o semestral a anual, solo con los años completos.

    Un año al que le falta un subperíodo (por ejemplo, el año en curso) queda afuera: no se estima.
    """
    if frecuencia not in SUBPERIODOS:
        raise ErrorPipeline(f"No se puede agregar a anual una serie {frecuencia}.")
    if con not in ("suma", "promedio", "fin_de_periodo"):
        raise ErrorPipeline(f"Agregación desconocida: {con}")
    grupos = serie.dropna().groupby(serie.dropna().index.year)
    completos = grupos.filter(lambda g: len(g) == SUBPERIODOS[frecuencia])
    por_anio = completos.groupby(completos.index.year)
    r = por_anio.sum() if con == "suma" else por_anio.mean() if con == "promedio" else por_anio.last()
    r.index = pd.DatetimeIndex([pd.Timestamp(year=int(a), month=1, day=1) for a in r.index], name="fecha")
    r.name = "valor"
    return r
