"""Empalmes de la capa 2 con casos conocidos."""

import pandas as pd
import pytest

from pipeline.capa2.empalmes import Tramo, encadenar_tasas, tasas, yuxtaponer
from pipeline.comun import ErrorPipeline
from tests.conftest import mensual


def t(fuente, serie, desde, hasta=None, **kw):
    return Tramo(fuente, serie, pd.Timestamp(desde), pd.Timestamp(hasta) if hasta else None, **kw)


def test_encadenar_conserva_las_tasas_de_cada_tramo():
    # Tramo viejo: crece 10 % por mes. Tramo nuevo (otra base): crece 1 % por mes.
    viejo = mensual("2000-01", [100, 110, 121, 133.1])
    nuevo = mensual("2000-03", [50, 50.5, 51.005, 51.51505])
    r = encadenar_tasas([t("viejo", viejo, "2000-01", "2000-03"), t("nuevo", nuevo, "2000-04")])
    variaciones = (tasas(r) * 100).dropna().round(10).tolist()
    assert variaciones == [10.0, 10.0, 1.0, 1.0, 1.0]


def test_encadenar_ancla_en_el_ultimo_tramo():
    viejo = mensual("2000-01", [100, 110, 121])
    nuevo = mensual("2000-03", [50, 50.5, 51.005])
    r = encadenar_tasas([t("viejo", viejo, "2000-01", "2000-03"), t("nuevo", nuevo, "2000-04")])
    # Desde el tramo más reciente, los niveles coinciden con los de su propia fuente.
    assert r.loc["2000-04-01"] == pytest.approx(50.5)
    assert r.loc["2000-05-01"] == pytest.approx(51.005)
    # Y hacia atrás se retropola con las tasas del tramo viejo: 50 / 1.1 / 1.1.
    assert r.loc["2000-01-01"] == pytest.approx(50 / 1.21)


def test_encadenar_ancla_en_el_primer_tramo():
    viejo = mensual("2000-01", [100, 110, 121])
    nuevo = mensual("2000-03", [50, 50.5, 51.005])
    r = encadenar_tasas([t("viejo", viejo, "2000-01", "2000-03"), t("nuevo", nuevo, "2000-04")], ancla="primero")
    assert r.loc["2000-01-01"] == pytest.approx(100)
    assert r.loc["2000-05-01"] == pytest.approx(121 * 1.01 * 1.01)


def test_puente_con_otra_fuente_en_el_hueco():
    # Como el IPC en la emergencia estadística: la fuente principal no tiene datos en el medio.
    antes = mensual("2015-08", [100, 101, 102])                  # hasta 2015-10
    puente = mensual("2015-10", [200, 204, 208.08, 212.2416])     # 2 % mensual
    despues = mensual("2016-01", [10, 10.1, 10.201])              # empieza en 2016-01; la primera tasa es la de 2016-02
    r = encadenar_tasas([
        t("antes", antes, "2015-08", "2015-10"),
        t("puente", puente, "2015-11", "2016-01"),
        t("despues", despues, "2016-02"),
    ])
    variaciones = (tasas(r) * 100).dropna().round(8).tolist()
    assert variaciones[2:5] == [2.0, 2.0, 2.0]
    assert variaciones[5:] == [1.0, 1.0]


def test_encadenar_falla_si_falta_el_periodo_anterior():
    viejo = mensual("2000-01", [100, 110])
    nuevo = mensual("2000-03", [50, 51])  # no tiene 2000-02: no se puede calcular la tasa de 2000-03
    with pytest.raises(ErrorPipeline, match="período anterior"):
        encadenar_tasas([t("viejo", viejo, "2000-01", "2000-02"), t("nuevo", nuevo, "2000-03")])


def test_encadenar_falla_si_hay_hueco_entre_tramos():
    viejo = mensual("2000-01", [100, 110, 120])
    nuevo = mensual("2000-01", [50, 51, 52, 53, 54])
    with pytest.raises(ErrorPipeline, match="Hueco entre tramos"):
        encadenar_tasas([t("viejo", viejo, "2000-01", "2000-02"), t("nuevo", nuevo, "2000-04")])


def test_yuxtaponer_sin_ajuste_y_con_coeficiente():
    a = mensual("2000-01", [1, 2])
    b = mensual("2000-03", [10, 20])
    assert yuxtaponer([t("a", a, "2000-01"), t("b", b, "2000-03")]).tolist() == [1, 2, 10, 20]
    assert yuxtaponer([t("a", a, "2000-01", coeficiente=1.5), t("b", b, "2000-03")]).tolist() == [1.5, 3, 10, 20]


def test_yuxtaponer_rechaza_superposiciones():
    a = mensual("2000-01", [1, 2, 3])
    b = mensual("2000-03", [10, 20])
    with pytest.raises(ErrorPipeline, match="superpuestos"):
        yuxtaponer([t("a", a, "2000-01"), t("b", b, "2000-03")])


def test_tramo_vacio_es_error():
    a = mensual("2000-01", [1, 2])
    with pytest.raises(ErrorPipeline, match="no tiene datos"):
        encadenar_tasas([t("a", a, "2001-01")])
