"""Estado de las fuentes entre corridas: desde cuándo no responde cada una (SPEC 5.2).

`snapshots/estado-fuentes.json` guarda, por fuente que está fallando, el primer día en que no respondió. Se escribe el
día que una fuente empieza a fallar y se borra el día que vuelve a responder: el archivo solo cambia en esas
transiciones, así que no agrega commits diarios. Una corrida sin red no lo toca.
"""

from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path

from pipeline.comun import escribir_json

ARCHIVO = "estado-fuentes.json"
# Una fuente que no responde hace más de estos días abre un issue (revisión del 07/11/2026).
DIAS_SIN_RESPONDER = 7
# Una fuente de descarga manual sin versión nueva hace más de estos días (unos 3 meses) también.
DIAS_VERSION_MANUAL = 92


class EstadoFuentes:
    def __init__(self, dir_snapshots: Path):
        self.ruta = dir_snapshots / ARCHIVO
        self.datos: dict[str, dict] = (
            json.loads(self.ruta.read_text(encoding="utf-8")) if self.ruta.exists() else {}
        )
        self._original = json.dumps(self.datos, sort_keys=True)

    def fallando_desde(self, fid: str) -> str | None:
        return self.datos.get(fid, {}).get("fallando_desde")

    def fallo(self, fid: str, hoy: date) -> str:
        """Registra que la fuente no respondió hoy. Devuelve desde cuándo falla."""
        if fid not in self.datos:
            self.datos[fid] = {"fallando_desde": hoy.isoformat()}
        return self.datos[fid]["fallando_desde"]

    def respondio(self, fid: str) -> None:
        self.datos.pop(fid, None)

    def guardar(self) -> bool:
        """Escribe el archivo si cambió. Devuelve si lo escribió."""
        if json.dumps(self.datos, sort_keys=True) == self._original:
            return False
        if self.datos:
            escribir_json(self.ruta, dict(sorted(self.datos.items())))
        else:
            self.ruta.unlink(missing_ok=True)
        self._original = json.dumps(self.datos, sort_keys=True)
        return True


def dias_desde(fecha: str, hoy: date) -> int:
    return (hoy - date.fromisoformat(fecha[:10])).days


def vencimiento_manual(version: str) -> str:
    """Fecha desde la que una versión manual se considera vieja (y la variante, desactualizada)."""
    return (date.fromisoformat(version) + timedelta(days=DIAS_VERSION_MANUAL)).isoformat()
