"""Casos de la bibliografía (SPEC, sección 10): forma de cada cuadro o gráfico y, cuando están cargados, valores."""

import csv
import json

import pandas as pd
import pytest
import yaml

from pipeline.comun import RAIZ

EXPORT = RAIZ / "export" / "series"
DIR_CASOS = RAIZ / "tests" / "casos_bibliografia"
CASOS = yaml.safe_load((DIR_CASOS / "casos.yaml").read_text(encoding="utf-8"))


def serie(slug: str, variante: str) -> pd.Series:
    doc = json.loads((EXPORT / slug / f"{variante}.json").read_text(encoding="utf-8"))
    fechas = pd.to_datetime([f if len(f) > 4 else f + "-01" for f, _ in doc["datos"]])
    return pd.Series([v for _, v in doc["datos"]], index=fechas, dtype=float)


def var_interanual(s: pd.Series) -> pd.Series:
    return (s / s.shift(12) - 1) * 100


def var_dic_dic(s: pd.Series) -> pd.Series:
    dic = s[s.index.month == 12]
    dic.index = dic.index.year
    return (dic / dic.shift(1) - 1) * 100


def promedio_anual(s: pd.Series) -> pd.Series:
    return s.groupby(s.index.year).mean()


# ── De forma ───────────────────────────────────────────────────────────────────

def test_DF2013_G2_desinflacion_2002_2003_y_brecha_desde_2007():
    oficial = var_interanual(serie("ipc", "oficial"))
    provincias = var_interanual(serie("ipc", "provincias"))
    assert oficial["2002"].max() > 30            # salida de la Convertibilidad
    assert oficial.loc["2003-12-01"] < 5         # desinflación de 2003
    # Desde 2007, la medición alternativa queda por encima de la oficial (en promedio).
    assert provincias["2007":"2013"].mean() > oficial["2007":"2013"].mean() + 5


def test_DF1990_C1_hiperinflacion_de_1989_y_austral():
    dd = var_dic_dic(serie("ipc", "oficial"))
    assert dd.loc[1970:1989].idxmax() == 1989
    assert dd.loc[1989] > 1000
    assert dd.loc[1986] < dd.loc[1985] < dd.loc[1984]   # el Plan Austral baja la inflación


def test_DF1990_C1_estancamiento_y_viraje_al_superavit_comercial():
    pib = serie("pib", "retropolada")
    pib = pib.groupby(pib.index.year).mean()
    crecimiento = (pib / pib.shift(1) - 1) * 100
    assert pib.loc[1989] < pib.loc[1980]                         # la década perdida
    assert (crecimiento.loc[1981:1982] < 0).all() and (crecimiento.loc[1988:1989] < 0).all()
    saldo = anual("exportaciones", "oficial") - anual("importaciones", "oficial")
    assert saldo.loc[1981] < saldo.loc[1982] and (saldo.loc[1982:1989] > 0).all()


def test_OS2006_G3_deterioro_del_mercado_de_trabajo_en_los_ochenta():
    anual = promedio_anual(serie("desocupacion", "total-urbano"))
    assert anual.loc[1989] > 2 * anual.loc[1980]


def anual(slug: str, variante: str) -> pd.Series:
    s = serie(slug, variante)
    s.index = s.index.year
    return s


def test_SCH1998c2_C8_atraso_cambiario_y_deficit_comercial_de_1980():
    expo, impo = anual("exportaciones", "oficial"), anual("importaciones", "oficial")
    saldo = expo - impo
    assert impo.loc[1980] > 2 * impo.loc[1978]          # las importaciones se disparan con la «tablita»
    assert (saldo.loc[1976:1979] > 0).all()
    assert saldo.loc[1980] < 0                            # déficit comercial de 1980


def test_CENDA2010_G5_de_deficits_a_superavits():
    expo, impo = anual("exportaciones", "oficial"), anual("importaciones", "oficial")
    saldo = (expo - impo).dropna()
    assert (saldo.loc[1992:1994] < 0).all()
    assert (saldo.loc[2002:2009] > 0).all()
    assert expo.loc[2009] > 2 * expo.loc[1990]


def test_CENDA2010_G8_acumulacion_de_reservas_en_la_posconvertibilidad():
    r = serie("reservas", "brutas")
    assert r.loc["2010-01-01"] > 2 * r.loc["2003-01-01"]
    assert r["1996":"2010-01"].idxmin().year == 2002


# ── De valores ─────────────────────────────────────────────────────────────────

TRANSFORMACIONES = {"nivel": lambda s: s, "var_interanual": var_interanual, "var_dic_dic": var_dic_dic,
                    "promedio_anual": promedio_anual}


def _referencias(ficha: str) -> list[dict]:
    with (DIR_CASOS / f"{ficha}.csv").open(encoding="utf-8") as f:
        return [fila for fila in csv.DictReader(f) if fila.get("valor", "").strip()]


def _fechas(slug: str, variante: str) -> list[str]:
    doc = json.loads((EXPORT / slug / f"{variante}.json").read_text(encoding="utf-8"))
    return [f for f, _ in doc["datos"]]


def _clave(anio: str, indice) -> object:
    if isinstance(indice, pd.DatetimeIndex):
        return pd.Timestamp(anio if len(anio) > 4 else anio + "-01")
    return int(anio[:4])


@pytest.mark.parametrize("ficha", sorted(CASOS))
def test_valores_de_referencia(ficha):
    filas = _referencias(ficha)
    if not filas:
        pytest.skip("pendiente: faltan valores de referencia")
    caso = CASOS[ficha]
    fallas = []
    for fila in filas:
        # Una ficha con varias series dice en `variable` cuál es cada valor (por ejemplo, «importaciones.oficial»).
        slug, variante = (fila.get("variable") or "").strip().split(".") if (fila.get("variable") or "").strip() \
            else (caso["serie"], caso["variante"])
        s = TRANSFORMACIONES[caso["transformacion"]](serie(slug, variante))
        if caso["transformacion"] == "nivel" and all(len(f) == 4 for f in _fechas(slug, variante)):
            s.index = s.index.year
        clave = _clave(fila["anio"].strip(), s.index)
        esperado = float(fila["valor"])
        obtenido = float(s.loc[clave])
        if "pp" in caso["tolerancia"]:
            ok = abs(obtenido - esperado) <= caso["tolerancia"]["pp"]
        else:
            ok = abs(obtenido / esperado - 1) * 100 <= caso["tolerancia"]["pct"]
        if not ok:
            fallas.append(f"{fila['anio']}: esperado={esperado!r} obtenido={obtenido!r} (pág. {fila['pagina']})")
    assert not fallas, f"{ficha}: " + "; ".join(fallas)
