"""Fuentes de descarga manual (`descarga: manual` en `metadatos/fuentes.yaml`).

Son las que no se pueden bajar desde GitHub Actions: Bruegel responde a esos servidores con el desafío anti-bots de
Cloudflare (HTTP 403, «Just a moment...»), y no corresponde esquivarlo. La corrida automática usa su último snapshot;
este comando las baja desde otra red (la Mac o una sesión de Claude Code) y guarda un snapshot si hay una versión
nueva. La corrida siguiente del pipeline lo publica.

Uso: `uv run python -m pipeline bajar-manual [ids de fuentes]`.
"""

from __future__ import annotations

from pipeline.capa1 import normalizar as capa1
from pipeline.comun import ErrorPipeline, Rutas, leer_yaml
from pipeline.fuentes import base


def bajar_manuales(rutas: Rutas, ids: list[str] | None = None) -> list[str]:
    fuentes = {f["id"]: f for f in leer_yaml(rutas.metadatos / "fuentes.yaml")}
    manuales = [fid for fid, f in fuentes.items() if f.get("descarga") == "manual"]
    pedidas = ids or manuales
    otras = [fid for fid in pedidas if fid not in manuales]
    if otras:
        raise ErrorPipeline(f"No son fuentes de descarga manual: {', '.join(otras)}.")
    salida = []
    for fid in pedidas:
        fuente = fuentes[fid]
        mod = capa1.modulo(fuente)
        archivos = mod.bajar(fuente)
        anterior = base.ultimo_snapshot(rutas.snapshots / fid)
        version_anterior = getattr(mod, "version_de_meta", lambda m: m.get("version"))(base.leer_meta(anterior)) if anterior else None
        version = None
        if hasattr(mod, "version_de_archivo"):
            version = next((v for a in archivos if a.origen and (v := mod.version_de_archivo(a.origen["archivo"]))), None)
        snapshot, nuevo = base.guardar_snapshot(rutas.snapshots, fuente, archivos, version,
                                                canonizar=getattr(mod, "canonizar", None))
        ruta = snapshot.relative_to(rutas.raiz).as_posix()
        if nuevo:
            salida.append(f"{fid}: snapshot nuevo en {ruta} (versión {version or 'sin fecha'}; la anterior era "
                          f"{version_anterior or 'ninguna'}). Subilo y la próxima corrida lo publica.")
        else:
            salida.append(f"{fid}: sin cambios (versión {version_anterior or version or 'sin fecha'}, en {ruta}).")
    return salida
