"""Reglas de validación: casos que tienen que pasar y casos que tienen que fallar."""

import numpy as np
import pandas as pd

from pipeline.validacion import reglas
from tests.conftest import mensual


def test_esquema_ok():
    assert reglas.esquema("x", mensual("2000-01", [1, 2, 3])) == []


def test_esquema_rechaza_nulos_e_infinitos():
    probs = reglas.esquema("x", mensual("2000-01", [1, np.nan, np.inf]))
    assert len(probs) == 1 and probs[0].regla == "esquema"


def test_esquema_rechaza_fechas_duplicadas_y_desordenadas():
    s = pd.Series([1.0, 2.0, 3.0], index=pd.to_datetime(["2000-02-01", "2000-01-01", "2000-01-01"]))
    probs = reglas.esquema("x", s)
    texto = probs[0].como_texto()
    assert "fechas desordenadas" in texto
    assert "field_uniqueness" in texto or "unique" in texto


def test_huecos_detecta_y_acepta_declarados():
    s = mensual("2000-01", [1, 2, 3, 4, 5]).drop(pd.Timestamp("2000-03-01"))
    probs = reglas.huecos("x", s, "mensual")
    assert probs and probs[0].valores == ["2000-03-01"]
    assert reglas.huecos("x", s, "mensual", permitidos=[{"desde": "2000-03"}]) == []


def test_huecos_semestral_con_meses_de_onda():
    s = pd.Series([1.0, 2.0, 3.0], index=pd.to_datetime(["1980-05-01", "1980-10-01", "1981-10-01"]))
    probs = reglas.huecos("x", s, "semestral", meses=[5, 10])
    assert probs[0].valores == ["1981-05-01"]


def test_rangos():
    s = mensual("2000-01", [100, 101, 300, 299])
    assert reglas.rangos("x", s, {"min": 0, "max": 1000, "var_min": -5, "var_max": 210}) == []
    probs = reglas.rangos("x", s, {"max": 200, "var_max": 50})
    assert [p.detalle for p in probs] == ["2 valores fuera de [-inf, 200]", "1 variaciones fuera de [-inf %, 50 %]"]
    assert "2000-03-01: 197.02970297029702 %" in probs[1].valores[0]


def test_continuidad_informa_valores_literales():
    a = mensual("2000-01", [100, 101, 102.01])
    b = mensual("2000-01", [100, 101, 103])
    assert reglas.continuidad("x", a, a, "a vs a", 0.01) == []
    probs = reglas.continuidad("x", a, b, "a vs b", 0.1)
    assert probs[0].severidad == "error"
    assert probs[0].valores[0].startswith("2000-03-01: a=")
