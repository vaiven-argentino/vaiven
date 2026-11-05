"""Conversión de signos monetarios (SPEC, sección 4)."""

import pandas as pd
import pytest

from pipeline.capa2.signos_monetarios import a_moneda_de_epoca, a_pesos_actuales, cargar_signos, factor_a_pesos_actuales
from pipeline.comun import RAIZ

SIGNOS = cargar_signos(RAIZ / "metadatos" / "signos_monetarios.yaml")


@pytest.mark.parametrize(
    "fecha, factor",
    [
        ("1975-01-01", 1e11),   # peso ley 18.188: 10.000 × 1.000 × 10.000
        ("1983-05-31", 1e11),
        ("1983-06-01", 1e7),    # peso argentino
        ("1985-06-14", 1e7),
        ("1985-06-15", 1e4),    # austral
        ("1991-12-31", 1e4),
        ("1992-01-01", 1.0),    # peso
        ("2026-10-24", 1.0),
        ("1969-12-31", 1e13),   # peso moneda nacional: 100 × 1e11
    ],
)
def test_factores(fecha, factor):
    assert factor_a_pesos_actuales(pd.Timestamp(fecha), SIGNOS) == factor


def test_ida_y_vuelta():
    s = pd.Series([0.5, 1.0, 10.0], index=pd.to_datetime(["1975-01-01", "1990-01-01", "2002-06-01"]))
    actuales = a_pesos_actuales(s, SIGNOS)
    assert actuales.tolist() == pytest.approx([0.5e-11, 1e-4, 10.0])
    assert a_moneda_de_epoca(actuales, SIGNOS).tolist() == pytest.approx(s.tolist())


def test_por_defecto_vale_el_signo_del_ultimo_dia_del_mes():
    # Criterio único (revisión de la 4a): junio de 1983 ya está en pesos argentinos (desde el 1/6) y junio de 1985,
    # en australes (desde el 15/6), igual que en la librería de transformaciones.
    s = pd.Series([1.0, 1.0], index=pd.to_datetime(["1983-06-01", "1985-06-01"]))
    assert a_pesos_actuales(s, SIGNOS).tolist() == pytest.approx([1e-7, 1e-4])
    assert a_pesos_actuales(s, SIGNOS, fin_de_mes=False).tolist() == pytest.approx([1e-7, 1e-7])


def test_excluir_una_fecha_que_no_esta_es_un_error():
    from pipeline.capa2.variantes import construir
    from pipeline.comun import ErrorPipeline
    capa1 = {"f.x": pd.Series([1.0, 2.0], index=pd.to_datetime(["2000-01-01", "2000-02-01"]))}
    variante = {"id": "prueba", "empalme": "yuxtaponer", "tramos": [{"fuente": "f.x", "desde": "2000-01"}],
                "excluir": [{"fecha": "2000-03", "motivo": "no existe"}]}
    with pytest.raises(ErrorPipeline, match="2000-03"):
        construir(variante, capa1, SIGNOS, {"f.x": {"frecuencia": "mensual"}}, None, "mensual")
