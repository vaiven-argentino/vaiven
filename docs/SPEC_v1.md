# Vaivén · Series económicas argentinas, 1970–hoy · SPEC v1.9

*v1: 22/10/2026 · v1.1: 05/11/2026, incorpora lo decidido en las fases 1 a 4a · v1.2: 07/11/2026, segunda revisión de la 4a · v1.3: 12/11/2026, períodos y eventos de la 4b · v1.4: 12/11/2026, correcciones de la revisión externa de la 4b (datos y método) · v1.5: 12/11/2026, correcciones de la revisión externa de la 4b (interfaz) · v1.6: 13/11/2026, cierre de la 4b · v1.7: 13/11/2026, comparación de series (4c/4d) y gráfico interactivo en el MCP (4e) · v1.8: 14/11/2026, medición de la CPU de `especificacion_grafico` · v1.9: 14/11/2026, explorador con varias series (PR B de la 4c/4d) (ver «Historial de versiones», al final; el detalle de cada decisión queda en `NOTAS_FASE1.md` a `NOTAS_FASE4.md`) · Documentos relacionados: `DECISIONES_v0.md`, `ARQUITECTURA_v0.md`, `planificacion/catalogo_mvp_propuesta.csv`, `planificacion/inventario_graficos.csv`*

---

## 1. Propósito, públicos y alcance

### Propósito
Vaivén es una base histórica **curada** de series económicas argentinas desde 1970, pensada para estudiar las políticas económicas del período democrático. Cada serie viene con su contexto: de dónde sale, qué quiebres tiene, qué alternativas existen para empalmarla y cómo citarla. No compite con los agregadores generales (datos.gob.ar, ArgenData, Almanac, El Tablero): los usa como fuentes y agrega curaduría histórica y metodológica.

### Públicos
| Público | Qué necesita |
|---|---|
| Estudiantes y docentes (la cátedra, la comisión) | Encontrar rápido la serie de un texto, graficarla por período de gobierno, descargarla y citarla. |
| Investigadores y público general | Series largas con advertencias claras, variantes explícitas y licencia abierta. |
| Agentes de IA (vía MCP) | Buscar, describir y obtener series con metadatos y advertencias legibles por máquina. |

### Alcance del MVP
- 39 series del catálogo aprobado (sección 3): 37 argentinas, de 1970 a hoy, y 2 de contexto internacional (crecimiento del PIB total y per cápita de países seleccionados, desde 1961). Más las series auxiliares que necesitan las transformaciones.
- Capa 1 (series fuente) y capa 2 (empalmes y variantes con nombre propio).
- Web en español: catálogo, ficha por serie, explorador, períodos, metodología, citación.
- MCP remoto (Cloudflare Workers) y la variante local del mismo código.
- Actualización automática, validada y versionada.

### Fuera del MVP
- Interfaz en inglés (la estructura queda preparada).
- Cuentas de usuario, comentarios o personalización guardada en el servidor.
- Consultas SQL en el navegador (DuckDB-WASM).
- Datos de firmas, microdatos de la EPH y series específicas de 2019 en adelante.
- Variables que no están en el catálogo. En particular, la comparación internacional se limita al crecimiento del PIB: otros indicadores de otros países (inflación, deuda, desempleo) quedan para después.

---

## 2. Modelo de datos

### 2.1 Capas
| Capa | Qué guarda | Regla |
|---|---|---|
| **Snapshot** | El archivo tal como lo devolvió la fuente, con fecha de descarga, URL, checksum, licencia y, si la fuente la declara, su versión. | Nunca se modifica, salvo para borrar copias con contenido idéntico (por ejemplo, la misma respuesta en otro orden); si la fuente cambia, se guarda un snapshot nuevo. Las fuentes de **descarga manual** (sección 5.1) se bajan fuera de la corrida automática. |
| **Capa 1: series fuente** | Cada serie de cada fuente, normalizada (fecha ISO, valor numérico, unidad, frecuencia). Una serie fuente = un tramo publicado por un organismo. | Sin transformaciones de contenido: solo formato. |
| **Capa 2: series curadas** | La serie de Vaivén, con una o más **variantes**. Cada variante declara qué tramos de capa 1 usa, cómo los une y qué advertencias tiene. | Toda operación queda documentada en los metadatos. |
| **Export** | Lo que consumen la web y el MCP: JSON por serie y variante, archivos de descarga, `datapackage.json`, especificaciones de Vega-Lite. | Se regenera completo en cada actualización. |

### 2.2 Identificadores
- **Serie:** código del catálogo y un *slug* legible. Ejemplo: `PRE-01` / `ipc`.
- **Variante:** `<slug>.<variante>`. Ejemplo: `ipc.oficial`, `ipc.cavallo-bertolotto`, `ipc.provincias`.
- **Serie fuente (capa 1):** `f.<organismo>.<nombre>`. Ejemplo: `f.indec.ipc-historico-1943-2008`.
- **Período y evento:** `p.<tipo>.<slug>` y `e.<fecha>.<slug>`. Ejemplo: `p.plan.austral`, `e.1991-03-27.convertibilidad` (la fecha del evento es la del hecho que nombra: aquí, la sanción de la ley).
- **Entidad (país o agregado):** código ISO3 del Banco Mundial. Ejemplos: `ARG`, `BRA`, `USA`, `WLD` (Mundo), `LCN` (América Latina y el Caribe), `EUU` (Unión Europea), `EMU` (Zona del euro). Solo lo usan las series con dimensión `pais` (bloque Contexto internacional); las series argentinas no la llevan.
- Los identificadores son estables: nunca se reutilizan ni se renombran; si una serie se retira, queda marcada como discontinuada.

### 2.3 Metadatos por serie (`metadatos/series/<slug>.yaml`)
```yaml
id: ipc
codigo: PRE-01
nombre: Inflación minorista (IPC)
bloque: Precios
prioridad: A
definicion: Índice de precios al consumidor, nivel general.
unidad: índice
tipo: precio            # precio | flujo | stock | tasa | cociente | tasa_de_variacion
agregacion: promedio    # cómo pasar a frecuencias más bajas: promedio | suma | fin_de_periodo
frecuencia: mensual
cobertura: {desde: 1970-01, hasta: hoy}
variante_por_defecto: oficial
variantes:
  - id: oficial
    nombre: Oficial INDEC, sin corregir
    metodo: Encadenamiento de tasas de variación entre tramos oficiales.
    tramos:
      - {fuente: f.indec.ipc-historico-1943-2008, desde: 1970-01, hasta: 2006-12}
      - ...
      # Un último tramo con `completa: true` (sin `desde`) solo agrega los meses posteriores al último dato del
      # anterior, sin reescalar: por ejemplo, las series diarias del BCRA para los meses que la mensual no tiene.
    advertencias: [q.ipc.2007-2015, q.ipc.emergencia-2016]
  - id: cavallo-bertolotto
    nombre: Cavallo–Bertolotto (San Luis + PriceStats)
    ...
quiebres: [q.ipc.2007-2015, q.ipc.emergencia-2016, q.ipc.cobertura-2016]
transformaciones: [var_mensual, var_interanual, var_dic_dic, acumulada_anio, base_100, frecuencia]
fuentes: [f.indec.ipc-historico-1943-2008, ...]
bibliografia: [DF2013-G2, OS2006-C1, CENDA2010-G11, ...]   # ids del inventario
licencia_derivado: CC-BY-4.0
cita_sugerida: "Vaivén (2026). Inflación minorista (IPC), variante «oficial». Versión de datos AAAA-MM-DD. <URL>"
```

Las series de contexto internacional agregan una dimensión `pais`:
```yaml
id: int-pib
codigo: INT-01
nombre: Crecimiento del PIB, países seleccionados
bloque: Contexto internacional
tipo: tasa_de_variacion
frecuencia: anual
dimensiones: [pais]
entidades: [ARG, USA, CHN, MEX, BRA, BOL, CHL, COL, ECU, GUY, PRY, PER, SUR, URY, VEN, WLD, LCN, EUU, EMU]
entidades_por_defecto: [ARG, BRA, USA, LCN, WLD]
variante_por_defecto: banco-mundial
variantes:
  - id: banco-mundial
    tramos:
      - {fuente: f.bm.wdi.ny-gdp-mktp-kd-zg, desde: 1961, hasta: hoy}
transformaciones: [nivel, indice_desde_tasas, media_movil]
```

### 2.4 Registros compartidos (`metadatos/`)
| Archivo | Contenido |
|---|---|
| `fuentes.yaml` | Una entrada por serie fuente: organismo, conjunto de datos, ID en la API, URL, licencia, frecuencia, cobertura, fecha de último acceso. |
| `quiebres.yaml` | Una entrada por quiebre: id, fecha o rango, tipo (cambio de base, cobertura, intervención, metodología, signo monetario), descripción, series y variantes afectadas, fuente y, en las series con dimensión `pais`, las `entidades` a las que se aplica (sin el campo, a todas; por ejemplo, el de Venezuela desde 2015 solo se avisa si Venezuela está entre los países que se ven). |
| `periodos.yaml` | Gobiernos (con sus mandatos), ministros de Economía, planes de estabilización, regímenes cambiarios, etapas de la política económica del curso y episodios (con sus fases), con fechas de inicio y fin, la fuente y la confianza de cada fecha. |
| `eventos.yaml` | Hitos puntuales económicos o institucionales con efecto económico (por ejemplo, la sanción de la Convertibilidad o el anuncio del default de 2001), con fecha del hecho, vigencia si es otra, categoría, descripción y fuente. |
| `glosario.yaml` | Definiciones de conceptos (balanza de pagos, FAE, reservas netas, etc.), reutilizando el material de la cátedra cuando corresponda. |

Ejemplo de período:
```yaml
- id: p.gobierno.alfonsin
  tipo: gobierno            # gobierno | ministro | plan | regimen_cambiario | catedra | episodio
  nombre: Raúl Ricardo Alfonsín
  nombre_corto: Alfonsín
  desde: 1983-12-10
  hasta: 1989-07-08         # vacío = vigente
  caracter: constitucional  # solo gobiernos: constitucional | de_facto | interino
  confianza: {desde: alta, hasta: alta}
  fuentes:
    - {para: desde, tipo: norma, referencia: "Decreto …", publicado: 1983-12-12, url: "https://…"}
    - {para: hasta, tipo: norma, referencia: "Decreto …", url: "https://…"}
- id: p.plan.austral
  tipo: plan
  nombre: Plan Austral
  desde: 1985-06-15         # el Decreto 1096/85 rige «a partir del 15 de junio»; se anunció el 14
  hasta: 1988-08-04
  fuentes:
    - {para: desde, tipo: norma, referencia: "Decreto 1096/1985"}
    - {para: hasta, tipo: convencional, nota: "Fin convencional: reemplazo por el Plan Primavera."}
- id: p.regimen.convertibilidad
  tipo: regimen_cambiario
  desde: 1991-04-01
  hasta: 2002-01-07         # publicación de la Ley 25.561 en el Boletín Oficial
- id: p.episodio.hiperinflacion-1989-1990
  tipo: episodio
  desde: 1989-02-06
  hasta: 1990-04-01
  confianza: {desde: media, hasta: alta}
  fases:                    # misma estructura y reglas que los mandatos
    - {id: p.episodio.hiperinflacion-1989, nombre: Primer brote, desde: 1989-02-06, hasta: 1989-08-01, …}       # fin convencional
    - {id: p.episodio.hiperinflacion-1989-tregua, nombre: Tregua del Plan Bunge y Born, desde: 1989-08-01, hasta: 1989-12-12, …}
    - {id: p.episodio.hiperinflacion-1990, nombre: Segundo brote, desde: 1989-12-12, hasta: 1990-04-01, …}
```
Reglas (las controla `pipeline/validacion/periodos.py`; un error frena la publicación):
- Intervalos semiabiertos [desde, hasta): el día del traspaso es del período que empieza. Solo el último de cada tipo puede quedar abierto.
- Cada extremo con fecha lleva su fuente: primaria cuando existe (norma con número y publicación, comunicación del BCRA, acta) y, si no, secundaria académica con página. Un fin sin hecho fechado se declara con una fuente `convencional` y su justificación («corte convencional de Vaivén»).
- Sin superposiciones en gobiernos, ministros, regímenes y etapas; sin huecos en los gobiernos desde el 1/1/1970. Los ministros pueden tener huecos cortos; los planes y los episodios pueden superponerse.
- **Confianza** (`confianza: {desde, hasta}`, en cada extremo con fecha propia, también en mandatos y fases; las etapas la heredan con `igual_a`):
  - **alta:** norma, comunicación del BCRA o acta, o dos fuentes independientes que coinciden;
  - **media:** una sola fuente secundaria u oficial sin norma, o una fecha que el revisor independiente no pudo verificar;
  - **baja:** las fuentes no coinciden. La web la muestra como «fecha a confirmar» y el MCP la avisa en `advertencias`.
  Se toma de `planificacion/periodos_tabla.csv`, que tiene una confianza por fila: los dos extremos llevan la de la fila, salvo donde la tabla distingue el extremo dudoso.
- **Episodios:** procesos de varios meses que la historiografía trata como una unidad (por ejemplo, la hiperinflación de 1989–1990). Llevan `fases`, con la misma estructura y las mismas reglas que los `mandatos` (dos o más, contiguas, cubren el episodio). Sus fechas salen de la historiografía, con fuente académica con página; un criterio cuantitativo (como el de Cagan, más de 50 % mensual) va como nota, con las cifras de la serie. Un proceso no es un evento: no se carga en `eventos.yaml`.
- Los gobiernos de más de un mandato (Menem, Fernández de Kirchner) llevan `mandatos`, que cubren el gobierno entero: el sombreado, la página de períodos y el MCP permiten ver por persona o por mandato. Las licencias del titular (Luder en 1975, Liendo en 1981) no son cambio de gobierno: van como nota.
- Ministros: el titular de la cartera de Hacienda o Economía de cada época (en 1971–1973, Hacienda y Finanzas; en 2017–2019, Hacienda). También es ministro **todo interino designado por decreto durante una vacante** entre dos titulares, cualquiera sea la fórmula («ministro interino», «a cargo del despacho», «delegado de la Junta Militar»), con la fórmula textual en `cargo`. Los encargos durante una ausencia temporal de un titular en funciones (viajes, licencias) van como nota. Los días sin titular ni interino se ven como «sin ministro titular».
- Los regímenes cambiarios cambian cuando se crea o se elimina un mercado o cambia la forma de fijar el tipo de cambio; una devaluación dentro del mismo esquema (por ejemplo, el Rodrigazo) no abre un tramo.
- Las etapas del curso toman sus fechas de otros períodos (`igual_a: p.gobierno.menem.desde`) y heredan su fuente.
- **Qué entra como evento** (`eventos.yaml`). Tiene que cumplir las cinco condiciones:
  1. es un **hecho fechado**: una norma, un anuncio oficial, una operación cerrada o un resultado. Un proceso de semanas o meses no es un evento; si importa, es un episodio;
  2. es **económico, o institucional con efecto económico directo**. Un hecho político o electoral entra solo si movió de forma documentada una serie del catálogo ese día o el siguiente;
  3. **cambia una regla o un saldo** (régimen cambiario, monetario o financiero, deuda, impuestos, estadísticas oficiales) o provoca un **quiebre visible** en al menos una serie del catálogo;
  4. lo nombra como hito al menos una fuente académica o un organismo oficial;
  5. si ya es el inicio de un plan o de un régimen, entra como evento solo si su fecha es otra (por ejemplo, el anuncio frente a la vigencia).

**Ubicación de cada dato en el tiempo.** Una sola función de la librería (`ubicacion.ts`) fija la fecha de cada observación. La usan el gráfico, la tabla, las descargas, el resumen textual y el MCP:
- **Instante:** un saldo a fin de período (`agregacion: fin_de_periodo`) mostrado en nivel (nivel o base 100, con cualquier medida, sin media móvil) se ubica en el último día de la observación. Se dibuja ese día y se asigna al período vigente ese día.
- **Intervalo:** todo lo demás (promedios, sumas y cualquier variación, también la de un saldo) se ubica en el intervalo de la observación: el mes, el trimestre o el año; en las semestrales de la EPH puntual, el mes de la onda. Se dibuja en el punto medio y se asigna al período que contiene el punto medio.
- **Asignación y reparto:**
  - Si un período cubre más de la mitad del intervalo, contiene el punto medio. Si el del punto medio no pasa del 50 %, la asignación dice «(sin mayoría)».
  - Además se calcula el reparto por días: `periodo_proporcion` (de 0 a 1) y `otros_periodos` («Alfonsín (23 %)»).
  - Planes y episodios superpuestos van todos, separados por punto y coma.
  - Los días sin período tienen nombre: «sin ministro titular», «sin régimen cambiario».
- **Límite:** una variación interanual compara con 12 meses antes, y una media móvil promedia meses anteriores, pero las dos se asignan al período de la observación.
- El signo monetario de los pesos actuales sigue tomándose el último día del período (sección 4): es una unidad de medida, no una atribución.

La periodización de la cátedra (sección 6.4) se arma sobre estas tablas. Las fechas se cargaron con fuente y las contrastó un revisor independiente; las fuentes de trabajo y el contraste están en `planificacion/periodos_tabla.md`.

### 2.5 Formato de exportación
- `export/series/<slug>/<variante>.json`: metadatos resumidos + `datos: [["1970-01", 0.0123], ...]` + `version_datos`. En las series con dimensión `pais`, `datos` es un objeto por entidad: `{"ARG": [["1961", 5.4], ...], "BRA": [...]}`.
  - Fechas: `AAAA-MM` en mensuales, trimestrales (mes de inicio) y semestrales (mes de la onda); `AAAA` en anuales.
  - Cada JSON declara su versión de esquema en `esquema`. La vigente es la **1.3** (`tests/contrato/serie-1.3.schema.json`, publicada en `/esquemas/`): suma a las fuentes `descarga` y `version` (descarga manual), `desfase_esperado` y `cita` (la que recomienda la fuente); a las advertencias, `entidades`; y acepta `licencia: other-at` (sección 9). La 1.2 sumó `moneda`, `insumos` (qué series necesita cada medida, con su `denominador` en el % del PIB), `auxiliar`, `vista_inicial` (transformación, medida, frecuencia y período con que arranca la ficha) y los campos de la dimensión `pais`. Las versiones anteriores siguen publicadas y la web, el MCP y la librería las leen.
  - **Regla de versión de los esquemas** (series, períodos y eventos):
    - **menor** (1.x → 1.x+1): agrega campos opcionales o valores nuevos a una lista cerrada, sin cambiar el sentido de lo que ya está;
    - **mayor** (1.x → 2.0): quita o renombra un campo, lo vuelve obligatorio o cambia su sentido.
    En los dos casos, la versión anterior sigue publicada en `/esquemas/`.
  - `desactualizada_desde`: la fecha desde la que la variante no se actualiza: el primer día en que la fuente no respondió, la versión anterior si la variante quedó retenida por la validación, o la fecha en que la versión de una fuente de descarga manual cumplió 3 meses (sección 5.2).
- `export/catalogo.json` (con las entidades de las series con `pais` y la frecuencia del último dato de cada variante; las fichas de la bibliografía no se publican hasta que la cátedra responda, sección 12), `export/periodos.json` y `export/eventos.json` (esquemas `periodos-1.1` y `eventos-1.0`, publicados en `/esquemas/`; también como CSV en la descarga completa, con `confianza_desde` y `confianza_hasta`, y como tablas del `datapackage.json`; la 1.1 es menor: suma el tipo `episodio`, `fases` y `confianza`, y la 1.0 sigue publicada), `export/quiebres.json`, `export/revisiones.json`.
- `export/auxiliares/<slug>/<variante>.json` y su índice `export/auxiliares.json` (sección 2.6), más `export/auxiliares/signos-monetarios.json`.
- `export/datapackage.json` (Frictionless Data Package v2) que describe todos los recursos.
- `export/descargas/vaiven_<version>.parquet` y `.zip` con CSV por serie, para descarga completa.
- `export/vega/<slug>.json`: especificación de Vega-Lite por defecto de cada serie.

Este conjunto de archivos estáticos funciona además como **API pública de solo lectura**, documentada en la web y servida en `/datos/` (por ejemplo, `/datos/series/ipc/oficial.json`). En las series con dimensión `pais`, el CSV es largo (`fecha,pais,valor`) y la clave primaria del datapackage es `[fecha, pais]`.

### 2.6 Series auxiliares
No figuran en el catálogo, pero las transformaciones las necesitan. Tienen los mismos metadatos (en `metadatos/auxiliares/`) y la misma validación que el resto, y códigos propios:

| Código | Serie | Variantes |
|---|---|---|
| AUX-01 | PIB nominal en pesos | **Publicado en cada base** (por defecto: Banco Mundial hasta 1992, base 1993 en 1993–2003, base 2004 desde 2004, sin empalmar, como en los cuadros de la bibliografía) y retropolado desde la base 2004 (sin saltos; antes de 2004 da un PIB unos 8 % mayor). Anual y trimestral. |
| AUX-02 | PIB en dólares | El PIB de cada base o el retropolado ÷ el promedio del tipo de cambio oficial (CAM-01), y el del Banco Mundial (que en 1971–1981 y 2012–2015 usa un factor de conversión alternativo). |
| AUX-03 | Población | Banco Mundial. |
| AUX-04 | IPC de EE.UU. | OCDE (CC BY 4.0), que lo toma del BLS; para el TCR bilateral. |
| AUX-05 | Signos monetarios | Los factores acumulados de la sección 4. |

---

## 3. Catálogo del MVP

39 series aprobadas: 20 de prioridad A y 19 de prioridad B (37 argentinas y 2 de contexto internacional). La columna de documentos cuenta cuántos documentos del inventario usan la variable (o el concepto, en el caso del EMAE, que comparte el concepto de actividad con el PIB). El detalle por serie (fuentes con sus tramos, variantes de la capa 2, quiebres y estado de verificación) está en `planificacion/catalogo_mvp_propuesta.csv`, que es la fuente de verdad de esta sección.

| Código | Serie | Prioridad | Frecuencia | Documentos que usan la variable | Estado de las fuentes |
|---|---|---|---|---|---|
| ACT-01 | PIB real | A | anual y trimestral | 9 | Tramos confirmados en la API (22/10/2026) |
| ACT-02 | Actividad mensual (EMAE) | B | mensual | 9 | Tramos confirmados en la API |
| ACT-03 | Inversión bruta interna fija | A | anual y trimestral | 7 | Tramos confirmados en la API |
| PRE-01 | Inflación minorista (IPC) | A | mensual | 11 | Tramos oficiales confirmados en la API; variante Cavallo–Bertolotto localizada, licencia sin confirmar |
| PRE-02 | Precios mayoristas | B | mensual | 2 | A determinar |
| EXT-01 | Exportaciones | A | mensual y anual | 8 | Confirmado en la API |
| EXT-02 | Importaciones | A | mensual y anual | 7 | Confirmado en la API |
| EXT-03 | Saldo comercial | A | mensual y anual | 7 | Derivada |
| EXT-04 | Cuenta corriente | A | anual y trimestral | 7 | Tramos confirmados en la API |
| EXT-05 | Términos del intercambio | B | anual y trimestral | 2 | Parcial: 1970–1985 a determinar |
| EXT-06 | Reservas internacionales | A | diaria, mensual y anual | 9 | Confirmado en la API |
| EXT-07 | Deuda externa total | A | anual y trimestral | 9 | Parcial: tramo 1970–1990 a determinar |
| EXT-08 | Fuga de capitales | A | anual (mensual desde 2003) | 8 | Fuentes oficiales confirmadas; método residual a reconstruir |
| EXT-09 | Rentas: intereses y utilidades | B | anual | 5 | Parcial |
| EXT-10 | Riesgo país | B | diaria | 3 | Consulta en vivo (ver sección 8) |
| CAM-01 | Tipo de cambio nominal oficial | A | diaria, mensual y anual | 8 | Confirmado en la API |
| CAM-02 | Tipo de cambio paralelo | B | diaria y mensual | 2 | Parcial: tramo informal sin fuente abierta confirmada |
| CAM-03 | Tipo de cambio real multilateral | A | diaria y mensual | 4 | Parcial: 1970–1990 a reconstruir |
| CAM-04 | Tipo de cambio real bilateral con EE.UU. | A | mensual | 6 | Derivada |
| MON-01 | Base monetaria | A | mensual | 3 | Confirmado en la API |
| MON-02 | Agregados M1/M2/M3 | A | mensual | 6 | Confirmado en la API |
| MON-03 | Tasa de interés pasiva | A | mensual | 6 | Confirmado en la API |
| MON-04 | Crédito al sector privado | B | mensual | 2 | A verificar la serie exacta |
| MON-05 | Pasivos remunerados del BCRA | B | mensual | 2 | Parcial |
| FIS-01 | Resultado primario y financiero | A | anual (mensual desde 1993) | 8 | Tramos confirmados en la API |
| FIS-02 | Gasto público | B | anual | 5 | Confirmado en la API (hasta 2023) |
| FIS-03 | Ingresos públicos | B | anual | 4 | Parcial |
| FIS-04 | Deuda pública (por ahora, «Deuda pública externa (Banco Mundial)») | A | anual y trimestral | 3 | Publicada solo la deuda externa pública del Banco Mundial; la total (Secretaría de Finanzas, FMI), pendiente de licencia |
| FIS-05 | Intereses de la deuda pública | B | anual | 5 | Parcial |
| TRA-01 | Tasa de desocupación | A | semestral (1974–2003) y trimestral (2003–hoy) | 5 | Confirmado en la API |
| TRA-02 | Tasas de actividad y empleo | B | semestral y trimestral | 2 | Confirmado en la API |
| TRA-03 | Salario real | A | mensual o anual | 8 | Parcial: hueco 1976–1984; serie académica sin confirmar |
| TRA-04 | Participación asalariada en el ingreso | B | anual | 2 | A determinar |
| TRA-05 | Pobreza e indigencia | B | semestral | 1 | Parcial |
| TRA-06 | Desigualdad (Gini) | B | trimestral | 1 | A determinar |
| SEC-01 | Producción industrial | B | mensual y anual | 2 | Parcial |
| SEC-02 | Precios internacionales de materias primas | B | mensual | 2 | A verificar |
| INT-01 | Crecimiento del PIB, países seleccionados | B | anual | 4 | Confirmado en la API del Banco Mundial, 1961–2025 (22/10/2026) |
| INT-02 | Crecimiento del PIB per cápita, países seleccionados | B | anual | 4 | Confirmado en la API del Banco Mundial, 1961–2025 (22/10/2026) |

**Contexto internacional (INT-01 e INT-02).** Fuente: Banco Mundial, Indicadores del Desarrollo Mundial (`NY.GDP.MKTP.KD.ZG` y `NY.GDP.PCAP.KD.ZG`), licencia CC BY 4.0. Entidades: Argentina, Estados Unidos, China, México, Brasil y el resto de Sudamérica (Bolivia, Chile, Colombia, Ecuador, Guyana, Paraguay, Perú, Surinam, Uruguay y Venezuela), más cuatro agregados: Mundo, América Latina y el Caribe, Unión Europea y Zona del euro. Todas tienen datos completos de 1961 a 2025. Argentina se incluye con la serie del Banco Mundial para comparar con la misma metodología; su serie propia sigue siendo ACT-01 (INDEC), y la ficha avisa que las dos pueden diferir. El Banco Mundial también publica el agregado Europa y Asia Central; no se incluye porque abarca Rusia, Turquía y Asia Central y se aleja de la comparación con Europa occidental.

**Tramos pendientes de localizar** (no bloquean el MVP; se publican con cobertura parcial y aviso):
- Deuda externa total 1970–1990.
- Salario real 1976–1984.
- TCR multilateral antes de 1991 (a reconstruir).
- Términos del intercambio 1970–1985.
- Precios mayoristas, deuda pública, participación asalariada y Gini: tramos completos.
- Tipo de cambio paralelo: tramo informal sin fuente abierta confirmada.

---

## 4. Transformaciones

Se implementan **una sola vez**, en una librería de TypeScript (`paquetes/transformaciones`) que usan la web y el MCP. Los empalmes (capa 2) se hacen en el pipeline de Python; las transformaciones operan siempre sobre una variante ya armada.

| Transformación | Definición | Aplica a |
|---|---|---|
| `nivel` | Valor tal cual. | todas |
| `var_mensual` | (xₜ / xₜ₋₁ − 1) × 100 | mensuales |
| `var_interanual` | (xₜ / xₜ₋₁₂ − 1) × 100 en mensuales; equivalente en trimestrales y anuales | todas las de nivel |
| `var_dic_dic` | Variación entre diciembres consecutivos | precios |
| `acumulada_anio` | Variación desde diciembre del año anterior | precios |
| `base_100` | xₜ / x̄ₚ × 100, con x̄ₚ = valor en una fecha o promedio de un período elegido | todas las de nivel |
| `real` | Valor nominal ÷ IPC (variante elegida) × IPC de la fecha base (un año o un mes; por defecto, el último con dato en la serie y en el IPC) | montos en pesos |
| `en_dolares` | Valor en pesos ÷ promedio del tipo de cambio oficial (fin de mes) del período | montos en pesos |
| `pct_pib` | Valor ÷ PIB nominal (misma moneda y frecuencia) × 100. El PIB se elige con `denominador`: el publicado en cada base (por defecto), el retropolado o, en dólares, el del Banco Mundial | flujos (anual o trimestral) y stocks (solo anual: valor de fin de año ÷ PIB del año) |
| `pesos_actuales` | Convierte montos de signos monetarios anteriores a pesos actuales, con el signo vigente el último día de cada período | montos en moneda de cada época |
| `frecuencia` | Pasa a trimestral o anual según `agregacion` (promedio, suma o fin de período) | todas |
| `media_movil` | Media móvil de *n* períodos | todas |
| `indice_desde_tasas` | Encadena tasas de variación anuales en un índice: Iₜ = Iₜ₋₁ × (1 + gₜ/100), con I = 100 en el año base elegido | tasas de variación (contexto internacional) |

**Conversión de signos monetarios** (factores acumulativos para `pesos_actuales`):
| Desde | Signo | Equivalencia |
|---|---|---|
| 1970-01-01 | Peso ley 18.188 | 1 = 100 pesos moneda nacional |
| 1983-06-01 | Peso argentino | 1 = 10.000 pesos ley 18.188 |
| 1985-06-15 | Austral | 1 = 1.000 pesos argentinos |
| 1992-01-01 | Peso | 1 = 10.000 australes |

Reglas:
- Toda transformación que cruce un quiebre devuelve la advertencia correspondiente, también los quiebres de los insumos de una medida (por ejemplo, la intervención del INDEC al deflactar con el IPC oficial).
- `real` con IPC exige elegir la variante de IPC; por defecto se usa la variante por defecto del IPC, y la elección queda visible en el gráfico, la descarga y la cita. Lo mismo con el PIB de `pct_pib`.
- Las transformaciones se encadenan en un orden fijo: pesos_actuales → frecuencia → una medida (real, en_dolares o pct_pib, excluyentes) → base_100, variaciones o indice_desde_tasas → media_movil → período. Los pesos actuales van primero para no promediar ni comparar valores en signos monetarios distintos; en moneda de cada época, sin pasar a pesos actuales solo queda el nivel.
- Nunca se interpola: un dato faltante o excluido da `null` en todo lo que lo usa, y un insumo con un subperíodo faltante también. `indice_desde_tasas` corta la cadena en un año sin dato.
- Las medidas se ofrecen solo si el export trae sus insumos; la web y el MCP los leen recién cuando se piden.

### 4.1 Comparación de series
Un módulo de la librería (`paquetes/transformaciones/alinear.ts`) combina hasta 4 series ya transformadas. Lo usan el explorador, las descargas de la vista, `comparar_series` y `especificacion_grafico`. Igual que `ubicacion.ts`, no tiene una segunda implementación.

- **Cada serie con su cadena.** Cada serie aplica su propia cadena de transformaciones (sección 4, en el orden fijo) antes de combinarse. La combinación no transforma nada: solo agrupa, alinea y avisa.
- **Rango común.** `desde` y `hasta` valen para todas las series. Las fechas sin dato de una serie dan `null`, y nunca se interpola.
- **Unidad resultante.** Es la unidad de cada serie después de su cadena (por ejemplo, «% de variación interanual» o «índice, base 2004 = 100»). Dos series comparten panel solo si su unidad resultante es idéntica.
- **Disposición.** La decide la cantidad de unidades resultantes:
  - **Una unidad:** un solo gráfico.
  - **Dos unidades:** doble eje por defecto.
    - El eje izquierdo es el de la unidad de la primera serie. Cada eje lleva, junto a su título, una muestra del trazo de sus series.
    - Cada eje toma un rango automático que incluye todos los datos visibles. Si los dos rangos incluyen el cero, los ceros se alinean, para que una serie no parezca negativa cuando la otra cruza el cero.
    - El gráfico lleva fijo el aviso: «Las escalas de los dos ejes son independientes: que las líneas se crucen o se acerquen no indica una relación entre las series».
    - Los paneles son la alternativa: `ejes=paneles` en la URL y `ejes: "paneles"` en el MCP.
  - **Tres o cuatro unidades, o una serie internacional junto con otra serie:** paneles, sin alternativa. Un doble eje no puede mostrar tres unidades, y 8 países en un eje con otra serie en el segundo no se leen.
  - **Paneles:**
    - uno por unidad resultante, en el orden en que aparece la primera serie de cada unidad, hasta 4;
    - comparten el eje temporal, el sombreado y los eventos;
    - con una sola unidad, `ejes=paneles` se ignora con un aviso.
- **Frecuencias distintas.**
  - **En el gráfico:** cada serie en su frecuencia, ubicada con `ubicacion.ts` (sección 2.4).
  - **Alineación a frecuencia común** (tabla de la vista, XLSX en formato ancho y `comparar_series` por defecto): todas las series pasan a la frecuencia más baja del conjunto, con la `agregacion` de cada una y solo con períodos completos (como `frecuencia`). El orden es mensual < trimestral < anual. Una serie semestral (EPH puntual) lleva la frecuencia común a anual, porque la onda no es un semestre calendario. Una serie diaria cuenta como mensual.
  - **Límite:** la alineación usa la transformación `frecuencia` de cada serie, y solo después aplica la medida y la variación. Por eso una variación interanual alineada a anual es la variación del promedio anual, y no el promedio de las variaciones mensuales. Se avisa.
- **Serie internacional.** Como máximo una por vista. Si hay otras series, la vista va en paneles, y la internacional ocupa uno propio con sus países (hasta 8, sección 6.2), aunque otra serie tenga la misma unidad resultante. Para el límite de 4, cuenta como una serie.
- **Advertencias.** Cada serie trae las suyas, también las de sus insumos. La combinación agrega las propias: frecuencia común aplicada, una serie sin datos en el rango, `ejes=paneles` ignorado.
- **Límite de observaciones:** 10.000 en total, sumando las series y los países (sección 7.3).

---

## 5. Pipeline

### 5.1 Pasos
1. **Disparo:** un Cron Trigger de Cloudflare llama a diario al `workflow_dispatch` de GitHub. El `schedule` propio de GitHub Actions queda como respaldo semanal. También se puede ejecutar a mano.
2. **Snapshot:** descarga cada fuente; si el checksum no cambió, no hace nada más con ella. Una fuente que devuelve lo mismo en otro orden (la OCDE) se compara por contenido y no por bytes. Las fuentes de **descarga manual** (`descarga: manual` en `fuentes.yaml`; hoy, Bruegel, cuyo sitio bloquea a los servidores de GitHub Actions) no se descargan acá: se usa su último snapshot, y se bajan con `python -m pipeline bajar-manual` desde otra red.
3. **Capa 1:** normaliza las fuentes que cambiaron.
4. **Capa 2:** reconstruye las variantes afectadas.
5. **Validación** (pandera y reglas propias):
   - esquema (tipos, fechas, unidades);
   - huecos inesperados en la serie;
   - rangos plausibles por serie;
   - continuidad en los puntos de empalme;
   - revisiones: compara contra la versión publicada y registra los valores históricos que cambiaron.
6. **Export:** regenera los JSON, descargas, `datapackage.json` y especificaciones de Vega-Lite.
7. **Publicación:** commit al repositorio con el informe entero del pipeline (retenidas, avisos, cambios y snapshots) y despliegue del Worker (`wrangler deploy`).

### 5.2 Manejo de errores
- Si una fuente no responde: se reintenta; si sigue fallando, se publica con los datos anteriores y la serie queda marcada como «desactualizada desde <fecha>», el primer día en que no respondió (se guarda en `snapshots/estado-fuentes.json`). Una corrida sin red conserva la marca. Si pasan **más de 7 días**, se abre un issue por fuente, que se cierra solo cuando vuelve a responder.
- Una fuente de descarga manual sin versión nueva hace **más de 3 meses** queda desactualizada desde ese día y abre el mismo issue.
- Si la validación falla: el error se atribuye a la fuente o a la variante que lo produjo. Esa variante (y las derivadas que dependen de ella) queda **retenida**: conserva su versión anterior, marcada «desactualizada desde <fecha>», y el resto se publica. Se abre un issue en GitHub con el detalle y se notifica por mail. Solo un error que no se puede atribuir frena toda la publicación.
- Si una fuente recorta su historia (pierde más de 12 fechas que ya tenía, o la variante empieza más de un año después de lo declarado): se trata como un error de validación de esa fuente.
- Una variante que pasa a `pendiente` en los metadatos se quita del export.
- Si una revisión supera un umbral por serie: se publica, pero queda registrada en `revisiones.json` y se muestra en la ficha.

### 5.3 Versionado
- Cada publicación tiene `version_datos` (fecha y hora) y queda como commit.
- Release trimestral en GitHub, archivada en Zenodo con DOI; el DOI de concepto apunta siempre a la última versión.
- `CITATION.cff` en el repositorio.

### 5.4 Estructura del repositorio
```
vaiven/
├── metadatos/          series/*.yaml, auxiliares/*.yaml, fuentes.yaml, quiebres.yaml, signos_monetarios.yaml, periodos.yaml, eventos.yaml, glosario.yaml
├── pipeline/           Python: fuentes/, capa1/, capa2/, validacion/, export/
├── snapshots/          <fuente>/<fecha>/ (archivos crudos)
├── datos/              capa1/, capa2/
├── export/             lo que consumen la web y el MCP
├── paquetes/transformaciones/   TypeScript (web + MCP)
├── paquetes/cita/      cita sugerida (web + MCP: las dos devuelven lo mismo)
├── paquetes/grafico/   estado en la URL, períodos y eventos, formato y armado de la vista (`armarVista`; web + MCP)
├── web/                Astro; web/scripts/: copia del export, enlaces, revisión visual, punta a punta
├── mcp/                servidor MCP (TypeScript): remoto y stdio
├── worker/             punto de entrada del Worker: assets estáticos + /mcp
├── tests/              unitarios (Python y TS) y casos de la bibliografía
├── .github/workflows/  actualizar.yml, pruebas.yml, publicar.yml, release.yml (acciones fijadas por SHA)
├── .claude/agents/     subagentes de Claude Code, en Sonnet (explorador, tester, revisor de datos, revisor visual, probador del MCP, verificador de fuentes; sección 11)
├── .mcp.json           servidor MCP local por stdio, para el probador del MCP
├── package.json        workspaces de npm
├── CITATION.cff, LICENSE (MIT), LICENSE-DATOS (CC BY 4.0)
```

---

## 6. Web

### 6.1 Mapa del sitio
| Página | Contenido |
|---|---|
| **Inicio** | Qué es Vaivén, accesos a catálogo y explorador, series destacadas, última actualización. |
| **Catálogo** | Las 39 series por bloque, con filtros (bloque, prioridad, frecuencia, fuente) y búsqueda. |
| **Ficha de serie** | Último dato bien visible (y su atraso respecto del calendario habitual de la fuente, que nombra al intermediario si el atraso es de la copia de datos.gob.ar; la versión de las fuentes de descarga manual); gráfico con quiebres y, a pedido, períodos sombreados y eventos marcados, con filtro por categoría (apagados por defecto; parámetros `sh` y `ev`, como en el explorador), con un enlace a la misma vista en el explorador; selector de variante; transformaciones y medidas (con su IPC o su PIB); tabla; descargas; metodología; quiebres; fuentes; uso en la bibliografía (fichas del inventario: oculto hasta que la cátedra responda, sección 12); cómo citar. En las series internacionales, la selección inicial de países con el elegido resaltado y la tabla por década (como en el explorador, 6.2). |
| **Explorador** | Hasta 4 series a la vez (una puede ser internacional, con hasta 8 países), cada una con su variante y sus transformaciones. Doble eje con dos unidades (los paneles, a un clic) y paneles apilados con tres o más. Período, sombreado por gobierno, mandato, ministro, plan, régimen cambiario o etapa del curso, y eventos. Tabla a la frecuencia común y descargas de la vista. |
| **Períodos** | Línea de tiempo de gobiernos, ministros de Economía, planes, regímenes cambiarios, etapas del curso, episodios y eventos (los carriles de planes y episodios, en el gris de la franja). Debajo, una tabla compacta por tipo: nombre · desde · hasta · carácter o cargo · marcas (◇ corte convencional, ⚠ «fecha a confirmar» en las de confianza baja); en los eventos, nombre · fecha · vigente desde · categoría. Cada fila es un `<details>` que se despliega con la descripción, las notas, los mandatos o las fases, las fuentes con su confianza y los accesos al explorador (una lista de enlaces). Cada fila conserva su ancla `#id` (también los mandatos y las fases); la página se lee entera sin JavaScript, y un script mínimo abre la fila al llegar con un `#id`. En el celular, cada fila va en una línea (nombre corto, fechas y marcas). Accesos al explorador ya filtrados (gobiernos, mandatos y etapas: inflación interanual, PIB real, desocupación, tipo de cambio real, reservas y resultado fiscal; ministros, planes y regímenes: inflación mensual, tipo de cambio oficial, tipo de cambio real y reservas; de un año antes a un año después, con el sombreado de ese tipo). |
| **Metodología** | Capas, empalmes, quiebres, variantes, glosario, revisiones. |
| **Para agentes de IA** | Cómo conectar el MCP remoto (conector personalizado en Claude) y el local; lista de herramientas; ejemplos. |
| **Datos abiertos** | Descarga completa, estructura de los archivos estáticos (API de lectura) y `datapackage.json`. |
| **Cómo citar / Acerca / Licencias** | Cita sugerida, DOI, créditos, licencias de cada fuente. |

### 6.2 Explorador
En la fase 4b, el explorador (`/explorador/`) mostraba una serie por vez. Desde la 4c/4d compara **hasta 4 series** (sección 4.1).
- **Estado en la URL:**
  - Las series, variantes, transformaciones, período, sombreado y eventos van en la URL, así una vista exacta se puede compartir.
  - **Parámetros de cada serie:** `s`, `v`, `t`, `m`, `d`, `pib`, `pa`, `f`, `mm`, `base`, `log` y `p` (países: el resaltado primero; solo en la serie internacional).
    - Sin número son los de la serie 1; con sufijo `2`, `3` y `4`, los de las demás (`s2`, `t2`, `p3`…). Una URL de la 4b, con una sola serie, sigue dando la misma vista.
  - **Parámetros comunes:** `desde`, `hasta`, `sh`, `ev` y `ejes`.
    - `ejes` admite `paneles` y `doble` (el doble eje pedido en el celular). Sin `ejes`, la disposición es la automática de 4.1.
    - Sin `desde`, el período es el de la vista inicial de la serie 1.
  - Lo que coincide con la vista inicial de cada serie no se escribe.
  - Un parámetro que la serie no admite se ignora con un aviso, y también un índice sin su `s` (por ejemplo, `t3` sin `s3`).
  - Si falta un índice intermedio (`s3` sin `s2`), las series se renumeran al canonizar la URL.
  - Las comas de las listas (`p`, `ev`) van sin codificar.
- **Varias series:**
  - En la sección «Serie» del panel, la lista «Serie que editás» tiene un bloque por serie, con su color, su número, su nombre, su transformación y «Quitar». Con una sola serie, la lista no se muestra.
  - Los controles de la serie (serie, variante, países y transformación) editan la serie elegida en la lista, en todas las pantallas (6.5). El período, el sombreado y los eventos son comunes a todas.
  - «Agregar serie» (hasta 4) abre un bloque vacío («Elegí una serie…»), que no se dibuja ni va a la URL hasta que se elige la serie. La serie agregada entra con su vista inicial (transformación, medida y frecuencia), salvo el período, el sombreado y los eventos.
  - Al agregar y al quitar, el foco va al selector de la serie nueva o al bloque que ocupa ese lugar (o a «Agregar serie»), y un anuncio lo dice a los lectores de pantalla.
  - El orden de los bloques es el de los índices. Al quitar una serie, las siguientes suben.
  - No se puede agregar una segunda serie internacional: el selector la muestra deshabilitada, con la razón.
  - No se admite una serie repetida (misma serie, variante y transformación): la opción que la repetiría va deshabilitada, y un cambio que la repetiría no se aplica, con un aviso.
  - Cada serie lleva un color de la paleta categórica, en orden fijo según su índice. El color sigue a la serie: no cambia al quitar otra (al quitar la serie 2, la serie 3 conserva su color hasta que se recarga la URL canónica). Una serie agregada toma el primer color libre.
  - El nombre de cada serie va al final de su línea, como en las series internacionales.
  - Los países de la serie internacional usan la paleta de 8 de su panel, sin mezclarse con los colores de las otras series.
- **Disposición** (regla de 4.1):
  - **Doble eje:**
    - un botón «Ver en paneles» va junto al gráfico, a la vista, y no en el panel de controles;
    - en paneles, el mismo lugar ofrece «Ver en doble eje», que en el celular escribe `ejes=doble` y en pantallas más anchas vuelve a la disposición automática.
  - **Paneles:**
    - apilados, con eje temporal común; el eje de fechas va solo en el último;
    - cada panel lleva arriba su unidad y los nombres de sus series;
    - **alto:** el conjunto ocupa el 60 % del alto de la pantalla, con un mínimo de 180 px por panel; si no alcanza, la página se desplaza.
  - **Escala logarítmica:** `log` es de cada serie, pero se aplica a su eje o a su panel. Si las series de un eje o de un panel no coinciden, vale la de la primera, con un aviso.
  - El sombreado y las reglas de los eventos cruzan todos los paneles. La franja de los planes va arriba del primero, y la de los episodios, debajo del último.
  - La regla de densidad de los eventos se aplica una sola vez, para todo el gráfico.
- **Parámetro `ev`:** `ev=1` marca todo (las categorías de `eventos.json` y los episodios); una lista separada por comas marca solo esas categorías (`ev=cambiario,deuda`; `episodio` para los episodios, por ejemplo `ev=deuda,episodio`). La forma canónica sigue el orden de `eventos.json`, con `episodio` al final, y con todas las categorías se escribe `ev=1`. Una categoría que no existe se ignora con un aviso. En la ficha y en el explorador, el filtro va en casillas dentro de «Sombreado y eventos», y con un filtro parcial un aviso dice cuántos eventos del rango quedan afuera («Se muestran 12 de 30 eventos (filtro: cambiario, deuda)»). No hay un campo de relevancia.
- **Panel:** desde 1100 px de ancho, el explorador va en dos columnas: a la izquierda, un panel fijo de 300 px con todos los controles en secciones plegables (Serie · Transformación · Período · Sombreado y eventos); a la derecha, el gráfico, con un 60 % del alto de la pantalla, y los avisos debajo de él. En pantallas más chicas, la serie va arriba y el resto en el panel desplegable de 6.5.
- **Sombreado y eventos:** bandas de fondo en dos grises que se alternan, con los gobiernos de facto en uno más oscuro (sin superposiciones: gobiernos, mandatos, ministros, regímenes y etapas); los planes, que pueden superponerse, en una franja arriba del gráfico. Con sombreado, los quiebres pierden el relleno y quedan como barra punteada con número. Los eventos van como reglas finas con una letra y una lista debajo del gráfico. **Densidad:** si dos marcas quedarían a menos de 18 px, todos los eventos pasan a rayitas sobre el eje, sin letras ni reglas punteadas; el nombre aparece al pasar el cursor y en el lector de teclado, y la lista de debajo sigue completa, con la fecha en lugar de la letra (también en el pie de la imagen exportada, según su ancho). Los episodios, con «Marcar eventos» (o la categoría `episodio`), en una franja debajo del eje, con el estilo de los quiebres largos (línea punteada con topes, también en el cambio de fase). La franja de los planes usa un gris de 1,47:1 o más contra el fondo, en los dos modos, con un borde entre planes contiguos.
- **Ubicación de los datos** (2.4): cada punto se dibuja en su fecha de referencia (el último día en los saldos en nivel, el punto medio en lo demás), y la tabla y las descargas lo asignan al período del sombreado con la misma regla. Debajo del gráfico, en una línea y en tono neutro (no es una advertencia), va la regla («Cada dato se asigna al período vigente a mitad de su intervalo; los saldos a fin de período, al último día.»), con el texto completo y su límite en un desplegable «Cómo se asigna»; con sombreado, el gráfico empieza en el mismo lugar que sin él. La caja de avisos de arriba queda para las advertencias (quiebres, datos excluidos). El tooltip y el lector de teclado (con el foco en el gráfico, las flechas recorren los datos) dicen el período con sus fechas (también en las bandas sin rótulo, y todos los planes superpuestos) y, si el dato cruza un cambio, el reparto; el lector dice además el episodio y la fase del dato y los eventos marcados que caen dentro de su intervalo.
- **Tooltip y lector de teclado:**
  - Una sola guía vertical recorre todos los paneles.
  - En cada fecha se ve el valor de cada serie: el de la observación cuyo intervalo contiene la fecha (2.4), con la fecha de esa observación si es otra («2001 (anual): 458.796»).
  - Las flechas recorren las fechas de la serie de frecuencia más alta; con un empate, las de la serie de índice más bajo.
  - Con sombreado, cada fecha lleva además el período vigente y el reparto, ubicados con la regla de la serie que marca las fechas (2.4).
- **Exportación:**
  - **PNG y SVG:** todos los paneles en una imagen, con el título, las fuentes, la variante y la transformación de cada serie, el sombreado y la versión de datos. Con varias series, el título es «Comparación: …», el pie lleva una línea por serie y las líneas largas se parten en renglones.
  - **CSV:** formato largo, también con una sola serie: `fecha, serie, variante, pais, transformacion, unidad, valor, periodo, periodo_proporcion, otros_periodos`, con una fila por observación y la fecha de cada serie en su frecuencia.
    - `pais` va solo si la vista tiene una serie internacional.
    - `serie` y `variante` son los identificadores; `transformacion` va en palabras («variación interanual, en términos reales (IPC oficial)»), o `nivel` sin transformación.
    - Las tres columnas del período van siempre, vacías sin sombreado.
    - El CSV de la ficha sigue en el formato de una serie (`fecha[, pais], valor[, periodo, …]`).
  - **XLSX:**
    - «Datos (largo)», igual al CSV;
    - «Datos (frecuencia común)», en formato ancho a la frecuencia común (4.1), con una columna por serie (y por país), una fila con la unidad de cada columna y, con sombreado, las columnas del período de cada fila;
    - «Metadatos», con la regla de alineación, las notas de cada columna, los avisos de la comparación y un bloque por serie;
    - «Cita», con una cita por serie, y «Períodos», con sombreado.
  - **Nombres de archivo:** con una serie, los de la 4b; con varias, `vaiven_<s1>_y_<s2>[_y_…]_<desde>_<hasta>[_sombreado_x]`, con `<s>-<variante>` solo si la variante no es la de por defecto o si la serie se repite.
- **Tabla de la vista:**
  - Con una serie, la de la 4b.
  - Con varias, a la frecuencia común, con una columna por serie (y por país) y una nota sobre la alineación.
  - Con sombreado, las columnas del período de cada fila (su intervalo, ubicado con la regla de la serie 1) están ocultas por defecto y se muestran con un botón a la vista.
- **Advertencias visibles:** si el rango cruza un quiebre, aparece un aviso junto al gráfico y una marca en el eje temporal.
- **Riesgo país:** se carga en vivo desde ArgentinaDatos, con la fuente indicada y sin opción de descarga masiva.
- **Series internacionales:** cuenta como una serie dentro del límite de 4, y hay una como máximo por vista, con hasta 8 países o agregados por gráfico (más líneas dejan de leerse). Selección inicial: Argentina, Brasil, Estados Unidos, América Latina y el Caribe y Mundo. En el explorador, cada país lleva su color (paleta de 8, probada para daltonismo) y su nombre al final de la línea, con el resaltado más grueso; en la ficha, el resaltado va en color y el resto en tono secundario. Además del gráfico de líneas, una vista de tabla por década (crecimiento promedio) para comparar sin ruido anual.
- **La ficha** sigue mostrando una sola serie. El enlace «Abrir esta vista en el explorador» abre esa serie como serie 1.

### 6.3 Identidad visual
- **Concepto:** una hoja de árbol que cae sin dirección clara. Su trayectoria oscilante es la metáfora de Vaivén: la economía argentina como movimiento de ida y vuelta, y también la línea de una serie temporal.
- **Logo:** una hoja estilizada con su trayectoria en zigzag suave; versiones a color, monocroma y como ícono pequeño (favicon).
- **Motivo gráfico:** la trayectoria de la hoja como separador y como recurso en la página de inicio. Animación sutil de la hoja al cargar el inicio, desactivada si el sistema pide reducir el movimiento.
- **Paleta:** tonos de hoja (verdes, ocres y terracotas) para la identidad; para los gráficos, una paleta categórica distinta, accesible y probada para daltonismo. El sombreado por períodos usa tonos neutros para no competir con las series.
- **Modo claro y oscuro.**
- **Tipografía:** sans serif legible para la interfaz y numerales tabulares en tablas y ejes.

### 6.4 Periodización de la cátedra
Sombreado opcional en todos los gráficos. Hasta que la cátedra responda si quiere figurar (sección 12), en la web y el MCP la opción se llama «Etapas de la política económica (curso)» y no nombra a la cátedra ni a la materia (tipo `catedra` en `periodos.yaml`; la referencia al cronograma queda solo en el YAML). Etapas: herencia de la dictadura / Grinspun · Sourrouille, Austral, hiperinflación · 1989–91 · Convertibilidad · Alianza y crisis · salida de la crisis y 2002–2008 · kirchnerismo 2008–2015 · macrismo · albertismo · mileísmo. Además se puede sombrear por gobierno, ministro de Economía o régimen cambiario. Fuera de `/periodos/` (en el CSV y el XLSX de la vista, en el pie del PNG y el SVG y en el MCP), las etapas llevan la aclaración «etapas según la periodización de un curso universitario», para que no se lean como una periodización propia de Vaivén.

### 6.5 Accesibilidad y uso en celular
- WCAG 2.1 AA: contraste, navegación por teclado, textos alternativos con resumen de cada gráfico, tablas accesibles como alternativa al gráfico.
- **Diseño adaptable al celular:**
  - Los paneles se apilan a todo el ancho.
  - Por debajo de 600 px, dos unidades también van en paneles por defecto, porque los dos ejes le quitan al gráfico el ancho que el celular no tiene; el botón ofrece el doble eje.
  - Los controles van en el panel desplegable. Se edita una serie por vez, con el selector de la serie activa: la lista «Serie que editás» de 6.2, la misma en todas las pantallas.
  - Desde 1100 px, los controles pasan a un panel lateral fijo (6.2).
- Sombreado: los grises A, B y de facto tienen, contra el fondo, el mismo contraste en los dos modos (1,12, 1,25 y 1,47:1 o más), y la franja de los planes y los carriles de planes y episodios de `/periodos/`, 1,47:1 o más; lo controla una prueba que lee los tokens de `global.css`.
- **Texto alternativo:** cada panel tiene el suyo, con un resumen de sus series. La tabla de la vista es la alternativa accesible al conjunto.

---

## 7. MCP

### 7.1 Despliegue
- **Remoto (principal):** `https://vaiven.argentino.workers.dev/mcp` (subdominio de cuenta `argentino`, sujeto a disponibilidad), Streamable HTTP, sin estado, sin autenticación (datos públicos), con límite de pedidos por IP.
- **Local:** el mismo paquete por stdio, que lee el export publicado o una copia local. Hasta la fase 5 se corre desde una copia del repositorio; en la fase 5 se publica para `npx`.
- Implementación con el SDK oficial de TypeScript v2 (`@modelcontextprotocol/server`), compatible con la revisión 2026-07-28 del protocolo y, sin sesión, con los clientes de la era 2025 (`initialize`). El límite por IP es aproximado (Rate Limiting de Cloudflare).

### 7.2 Herramientas
| Herramienta | Parámetros | Devuelve |
|---|---|---|
| `buscar_series` | `texto?`, `bloque?`, `prioridad?`, `desde?`, `hasta?` | Lista de series con id, nombre, bloque, cobertura, variantes y, si corresponde, entidades disponibles. Si alguna serie coincide con todos los términos (cada uno con sus sinónimos, también de frase: «mercado de trabajo»), solo esas; si ninguna, las que coinciden con alguno. |
| `describir_serie` | `id` | Metadatos completos: definición, variantes (con su último dato, sus transformaciones, medidas, deflactores y PIB disponibles), quiebres, fuentes, licencias, países y cita. La bibliografía, cuando la cátedra lo confirme. Los parámetros de todas las herramientas son estrictos: uno desconocido da error. |
| `obtener_serie` | `id`, `variante?`, `desde?`, `hasta?`, `pesos_actuales?`, `frecuencia?`, `medida?` (real, en_dolares, pct_pib), `deflactor?`, `base_real?`, `denominador?`, `transformacion?`, `base?`, `paises?` (códigos ISO3; solo series internacionales; por defecto, la selección inicial) | Datos (por país en las internacionales), unidad resultante, último dato y su atraso, advertencias por quiebres en el rango (las de un solo país, si ese país se pidió), versión de datos y cita (con los países por su nombre). Un rango que es solo un período sin dato (excluido o incompleto) lo devuelve como `null`, con su motivo y sus advertencias. Una `frecuencia` igual a la de la variante se ignora con una nota. En pesos actuales, una nota fija dice que es una equivalencia entre signos monetarios, no un ajuste por inflación. |
| `comparar_series` | `series[]`: de 1 a 4 objetos, cada uno con `id` y los parámetros de transformación de `obtener_serie` (`variante`, `pesos_actuales`, `frecuencia`, `medida`, `deflactor`, `base_real`, `denominador`, `transformacion`, `base`, `paises`); comunes: `desde?`, `hasta?`, `alinear?` (`frecuencia_comun`, por defecto, o `ninguna`) | Con `frecuencia_comun`: `frecuencia`, `columnas` (una por serie y por país) y `datos` como filas `[fecha, v1, v2…]`. Con `ninguna`: los datos de cada serie en su frecuencia. Siempre: por serie, la unidad resultante, el último dato y su atraso, las advertencias y la cita; además, las advertencias de la combinación (4.1) y `version_datos`. |
| `listar_periodos` | `tipo?` (`gobierno`, `ministro`, `plan`, `regimen_cambiario`, `catedra`, `episodio`), `por_mandato?` | Períodos con fechas, fuente y `confianza` de cada fecha (y las fases de los episodios), con aviso de los cortes convencionales y de las fechas de confianza baja. Sin `tipo`, una lista compacta sin fuentes (la completa pasa los 100 KB), que marca las fechas a confirmar. |
| `periodo_en_fecha` | `fecha` (AAAA-MM-DD, o AAAA-MM para todo lo vigente en algún momento del mes) | Gobierno (y mandato), ministro, planes, régimen cambiario, etapa y episodios vigentes, con sus fuentes y confianza, y los eventos de ese día o mes. Con un mes, `asignacion`: a qué período va un dato mensual (regla de 2.4) y el reparto por días. En los episodios, la fase: con un día, `fase_vigente`; con un mes, la del punto medio y la del último día. |
| `especificacion_grafico` | los de `comparar_series` (sin `alinear`), más `sombreado?` (los valores de `sh`), `eventos?` (los valores de `ev`: `true` o una lista de categorías) y `ejes?` (`auto`, por defecto, que sigue la regla de 4.1, o `paneles`) | La especificación de Vega-Lite de la vista, con los datos incluidos y el mismo armado que el explorador; `url_explorador`, con esa vista; la disposición, las advertencias y las citas. Todo va en `structuredContent`, para que el gráfico interactivo (7.4) lo lea sin pedir nada más; el texto lleva lo mismo salvo la especificación, que con varias series largas pesaría cientos de KB en la conversación. Hasta 1.000 observaciones (7.3). |
| `riesgo_pais` | `desde?`, `hasta?`, `frecuencia?` | Consulta en vivo a ArgentinaDatos, con fuente y aviso de licencia; no se almacena. |
| `citar` | `id`, `variante?`, `formato?` (APA, texto, BibTeX) y los mismos parámetros de transformación de `obtener_serie` | Cita lista para usar, con versión de datos y lo que calculó Vaivén. |

Nota de cambio respecto de la v1.6: `comparar_series` pasa de `ids[]` con parámetros sueltos a `series[]` con un objeto por serie, porque cada serie tiene su propia cadena de transformaciones.

### 7.3 Reglas de respuesta
- Toda respuesta con datos incluye `advertencias`, `version_datos`, `fuentes` y `cita`.
- Límites por pedido: hasta 4 series y 10.000 observaciones; si se superan, se pide acotar. En las series internacionales, cada país cuenta para el límite de observaciones, no para el de series.
- El servidor no calcula empalmes: solo lee variantes ya publicadas y aplica transformaciones livianas. Eso lo mantiene dentro de los 10 ms de CPU del plan gratuito.
- Las descripciones de las herramientas están en español, pensadas para que un modelo elija bien cuál usar.
- **CPU de `especificacion_grafico`:** armar la especificación con los datos incluidos tiene que caber en los 10 ms de CPU del plan gratuito. En la 4c/4d se mide con el peor caso (4 series mensuales, de 1970 a hoy). Si no entra, la herramienta baja su límite de observaciones (no el de las demás) y lo dice en el error. El límite que resulte de la medición se anota en `NOTAS_FASE4.md` y en esta sección.
  - **Medición de la 4c/4d** (`mcp/scripts/medir-cpu.mjs`, Node, en caliente): el peor caso de arriba daba 34 ms de mediana después de optimizar (164 ms antes). Con 1.000 observaciones (4 series mensuales de unos 21 años, con sombreado y eventos), unos 16 ms de mediana. El límite de `especificacion_grafico` queda en **1.000 observaciones** (las demás herramientas siguen con 10.000), aceptando excesos esporádicos sobre los 10 ms, como en la fase 3; se mide en producción después del despliegue y se baja si aparecen errores 1102.

### 7.4 Gráfico interactivo en Claude (MCP Apps)
MCP Apps es la extensión oficial del protocolo para que un servidor muestre una interfaz dentro de la conversación. En Vaivén se usa para un solo recurso:

- **Recurso:** `ui://vaiven/grafico`, declarado en `_meta.ui.resourceUri` de `especificacion_grafico`. Es la única herramienta que lo lleva: `obtener_serie` y `comparar_series` siguen devolviendo solo datos, para no abrir un gráfico cada vez que el modelo consulta una cifra.
- **Qué hace:**
  - recibe el resultado de la herramienta (`structuredContent`), dibuja el gráfico con vega-embed y muestra los avisos y las citas;
  - deja cambiar la transformación, el período, el sombreado y los eventos sin escribir otro mensaje, llamando otra vez a `especificacion_grafico` desde la interfaz;
  - ofrece «Abrir en el explorador» (`url_explorador`) y la descarga en PNG y SVG.
- **Mismo armado:** el recurso usa la misma librería que arma la especificación del explorador (`paquetes/`), compilada en un solo HTML. No hay un segundo armado de gráficos.
- **Peso y CSP:** el HTML del recurso es mínimo y carga el script desde el propio dominio de Vaivén (assets estáticos del Worker, que no consumen CPU), declarado en `_meta.ui.csp`. No usa CDN de terceros **[se verifica en la 4e: que el host acepte el dominio propio en la CSP; si no, va todo en línea y se mide la CPU de `resources/read`]**.
- **Vega y CSP:** si la CSP del host no permite `unsafe-eval`, Vega necesita su intérprete compatible con CSP (`vega-interpreter`) **[se verifica en la 4e]**.
- **Sin soporte de MCP Apps:** un cliente que no soporta la extensión recibe el resultado de siempre: en el texto, el enlace al explorador, la disposición, los avisos y las citas; la especificación, en `structuredContent` (7.2). Nada de la 4c/4d depende de la 4e.
- **Variante local:** el mismo recurso, por stdio.
- **Modo claro y oscuro:** sigue el del host si lo informa y, si no, el del sistema.

---

## 8. Riesgo país en vivo
- **Flujo:** el navegador y el MCP consultan `api.argentinadatos.com` (serie diaria desde enero de 1999; la API permite consultas desde el navegador).
- **Caché:** la web guarda la respuesta en el navegador durante el día; el MCP usa la caché del Worker por unas horas. Nada se guarda en el repositorio ni en las descargas.
- **Aviso:** «Dato de terceros (JP Morgan, EMBI), obtenido de ArgentinaDatos. Vaivén no lo almacena ni lo redistribuye.»
- **Antecedente 1981–1993:** la TIR de los Bonex que publica De la Balze se cita como referencia bibliográfica, no como serie empalmada.
- Si ArgentinaDatos no responde, la ficha lo informa y el resto del sitio funciona igual.

---

## 9. Licencias, citación y créditos
- **Código:** MIT. **Datos derivados (capa 2 y export):** CC BY 4.0.
- **Banco Mundial (INT-01 e INT-02, deuda externa, PIB):** CC BY 4.0; se redistribuye con atribución al Banco Mundial y el código del indicador. **OCDE:** CC BY 4.0. **Bruegel (TCR multilateral, variante `bruegel`):** uso libre con atribución y sin sugerir respaldo (no es una licencia CC formal); la cita lo dice. Esa variante declara `licencia: other-at` (Open Definition: otra licencia, con atribución) en su JSON y en el `datapackage.json`, y la ficha muestra la cita que recomienda Bruegel (con DOI y la fecha de la versión).
- **Series de terceros:** conservan su licencia, que figura en `fuentes.yaml`, en la ficha y en cada descarga. Las que no permiten redistribución (el riesgo país) no se descargan.
- **Cita sugerida:** incluye nombre de la serie, variante, versión de datos, DOI (desde la fase 5) y URL. Formatos: APA, texto y BibTeX. Si hubo transformación, una línea la nombra («calculada por Vaivén»); en las internacionales, los países van aparte. Si una fuente no es CC BY, la cita lo dice. La genera un paquete compartido (`paquetes/cita`), así que la ficha y el MCP dan la misma.
- **Créditos:** organismos fuente, autores de series académicas usadas como variantes y la cátedra, si da su conformidad.

---

## 10. Calidad y pruebas
- **Unitarias:** transformaciones (TypeScript) y empalmes (Python), con casos conocidos (por ejemplo, la conversión de signos monetarios y el encadenamiento de tasas).
- **Contrato:** el JSON exportado cumple un esquema; la web y el MCP fallan en las pruebas si el esquema cambia sin versión.
- **Casos de la bibliografía:** reproducir gráficos del inventario con datos de Vaivén y comparar forma y valores, con tolerancia y nota sobre revisiones posteriores. Primeros candidatos:

| Ficha | Qué se reproduce |
|---|---|
| DF1990-C1 | Crecimiento del PIB e inflación, 1970–1989 |
| SCH1998c2-C8 | Exportaciones e importaciones en dólares, 1975–1981 |
| OS2006-G3 | Desocupación, 1980–1989 |
| BAS2000-G1 | Deuda externa total, 1991–1998 |
| CENDA2010-G5 | Exportaciones, importaciones y saldo, 1990–2009 |
| CENDA2010-G8 | Reservas internacionales, 1996–2010 |
| DF2013-G2 | IPC oficial frente a una variante alternativa, 2002–2013 |

- **MCP:** pruebas automáticas de cada herramienta y prueba manual con Claude (web y escritorio) en cada actualización del protocolo o del SDK y antes de cada despliegue de fase (`mcp/PRUEBA_MANUAL.md`).
- **Series que calcula Vaivén** (derivadas, retropolaciones, unidades inferidas, empalmes): se contrastan con al menos una cifra publicada antes de publicarse, con un revisor que no vio cómo se armaron, y el método se aprueba explícitamente.
- **Medidas:** se contrastan con valores publicados (por ejemplo, el índice desde tasas con los niveles del Banco Mundial y el % del PIB con la cuenta corriente en % del PIB del Banco Mundial).
- **`alinear.ts`:** pruebas unitarias con casos conocidos:
  - la disposición según la cantidad de unidades, con y sin serie internacional;
  - ceros alineados en el doble eje;
  - mensual con trimestral y con anual;
  - semestral de la EPH con trimestral (la frecuencia común da anual);
  - una serie sin datos en el rango;
  - variación interanual alineada a anual;
  - límite de observaciones con una serie internacional.
- **Contrato de `comparar_series` y `especificacion_grafico`:** esquemas de respuesta en `tests/contrato/`, con la misma regla de versión de 2.5. El contrato se valida con las respuestas reales; el `outputSchema` declarado es más laxo en los campos grandes (los datos y la especificación), porque el SDK lo valida en cada pedido.
- **Una sola implementación:** una prueba compara, para las mismas vistas, la especificación de `especificacion_grafico` con la del explorador; tienen que ser iguales salvo el tamaño. Se corre dos veces: sin navegador (Vitest) y con el explorador real en el navegador (`web/scripts/igualdad-explorador.mjs`, con el MCP local por stdio), con el gráfico al tamaño del MCP.
- **URL:** las URL de una sola serie de la 4b dan la misma vista que antes (pruebas de regresión con las URL guardadas en la 4b).
- **MCP Apps (4e):** prueba manual en Claude web y en Claude Desktop (`mcp/PRUEBA_MANUAL.md`), y prueba de que un cliente sin la extensión recibe el resultado completo en texto.

---

## 11. Hoja de ruta

| Fase | Contenido | Listo cuando |
|---|---|---|
| **0. Preparación** | Organización `vaiven-argentino` (ya creada), cuenta de Cloudflare, repositorio con estructura, licencias, `CITATION.cff`. | El repositorio existe y un Worker vacío responde en `workers.dev`. |
| **1. Pipeline piloto** | Snapshot, capa 1, capa 2 y export para 5 series: IPC (con sus variantes), tipo de cambio oficial, reservas, exportaciones y desocupación. Validación y tests. | Las 5 series se actualizan solas y pasan las validaciones y los casos de la bibliografía que les corresponden. |
| **2. Web mínima** | Catálogo y ficha de serie con gráfico, variantes, quiebres, descargas y cita. Identidad visual básica (logo y paleta). | Se puede encontrar, graficar, descargar y citar cada serie piloto desde el celular y la computadora. |
| **3. MCP remoto** | `buscar_series`, `describir_serie`, `obtener_serie`, `citar`. Conexión probada desde Claude. | Claude responde preguntas sobre las series piloto usando el conector. |
| **4. Núcleo completo** | Resto de las series de prioridad A, explorador, períodos y sombreado, resto de las herramientas del MCP. Además, las dos series de contexto internacional: tienen una sola fuente, sin empalmes, y sirven para probar la dimensión `pais` en el explorador y en el MCP. | Las 20 series A y las 2 internacionales están publicadas con metadatos y pruebas. |
| **5. Catálogo completo** | Series de prioridad B, riesgo país en vivo, Zenodo, página de datos abiertos, accesibilidad revisada. | Las 39 series están publicadas; primera release con DOI. |

**Subfases de la fase 4:**
- **4a:** datos del núcleo (las 20 series A, las 2 internacionales, las auxiliares y las medidas en la librería, la ficha y el MCP).
- **4b:** explorador de una serie y períodos.
- **4c/4d:** comparación de series en la web y en el MCP: `alinear.ts`, explorador con hasta 4 series y paneles, `comparar_series` y `especificacion_grafico`.
- **4e:** gráfico interactivo en Claude (MCP Apps, sección 7.4).

La 4e no forma parte de la condición de «Listo cuando» de la fase 4: si se demora, la fase se cierra igual.

**Sugerencia de trabajo en Claude Code:**
- **Sesión principal en Opus:** esfuerzo high para el plan, la capa 2, `alinear.ts` y el MCP; medio para los componentes de la web.
- **Una sesión por subfase,** empezando cada una con esta SPEC y el catálogo en el contexto.
- **Para la 4e:** el plugin oficial de MCP Apps para Claude Code (`modelcontextprotocol/ext-apps`) trae instrucciones para agregar una interfaz a un servidor existente.

**Subagentes** (`.claude/agents/`, todos en Sonnet). Hay uno por cada tipo de tarea que necesita contexto limpio, o un informe con cifras y errores literales. Una tarea que solo cambia de objeto no lleva un subagente nuevo. Devuelven resúmenes, pero citan literal los errores y las diferencias numéricas.

| Subagente | Tarea | Cuándo |
|---|---|---|
| `explorador` | Ubica código y convenciones del repo, y resume sin pegar archivos. | Todas las fases |
| `tester` | Corre las pruebas y devuelve los fallos literales. | Todas las fases |
| `revisor-datos` | Recalcula los casos con un script propio, sin leer la implementación (en la 4c/4d: alineación, frecuencia común, medidas), y compara las cifras. | Siempre que Vaivén calcule algo nuevo (sección 10) |
| `revisor-visual` | Captura y revisa las vistas: doble eje, paneles, sombreado, modo oscuro, celular, exportaciones y, en la 4e, el gráfico dentro de Claude. | Cuando cambia la web o la 4e |
| `probador-mcp` | **Nuevo.** Usa el MCP local solo a través de sus herramientas (`tools:` limitado al servidor local de `.mcp.json`), sin ver el código. Contesta un juego de preguntas e informa si eligió bien la herramienta y los parámetros, y dónde lo confundieron las descripciones. No reemplaza la prueba ciega manual antes del despliegue. | 4d, 4e y cada cambio del MCP |
| `verificador-fuentes` | Contrasta cifras con las fuentes originales. | Fase 5 (series B). En la 4c–4e no hay fuentes nuevas, así que queda sin uso. |

Para el `probador-mcp`, el repo suma un `.mcp.json` con el servidor local por stdio, que lee el export del repo. Así funciona también en las sesiones en la nube.

---

## 12. Riesgos y preguntas abiertas

### Riesgos
| Riesgo | Mitigación |
|---|---|
| Una fuente cambia o desaparece | Snapshots, validación y aviso de serie desactualizada. |
| Tramos históricos difíciles de conseguir | Publicar con cobertura parcial y aviso; priorizar por uso en la bibliografía. |
| Límites del plan gratuito de Cloudflare | Precalcular todo en el pipeline; el sitio estático no consume el cupo. |
| Cambios del protocolo MCP | SDK oficial y pruebas con clientes reales. |
| Licencias de terceros | Registro por fuente; sin descarga para lo que no se puede redistribuir. |
| Diferencias entre el PIB de Argentina según el Banco Mundial y según el INDEC | Aviso en las fichas de ACT-01 e INT-01; la comparación internacional usa siempre la misma fuente para todos los países. |
| Mantenimiento por una sola persona | Automatización, documentación y releases periódicas. |
| El soporte de MCP Apps varía entre clientes y la extensión puede cambiar | Es opcional: sin ella, el resultado en texto está completo. Se prueba en cada actualización del SDK, como el resto del MCP. |
| El doble eje (por defecto con dos unidades) sugiere relaciones que no existen | Aviso fijo, ceros alineados cuando corresponde, botón «Ver en paneles» junto al gráfico y paneles obligatorios con tres o más unidades. |

### Preguntas abiertas
- Licencias de la variante de IPC de Cavallo–Bertolotto y de las series largas académicas de salario real.
- Definición de reservas netas a publicar (hay varias en uso).
- Si la cátedra quiere figurar en los créditos o participar.
- Encuadre académico (posible TFI en la UNAB).

---

## Historial de versiones

- **v1 (22/10/2026):** primera versión aprobada.
- **v1.1 (05/11/2026):** incorpora lo decidido en las fases 1 a 4a y en la revisión de la 4a:
  - export en `/datos/`, esquema 1.2 y campos nuevos (2.5);
  - auxiliares con códigos AUX-01 a AUX-05, PIB publicado en cada base por defecto e IPC de EE.UU. de la OCDE (2.6);
  - FIS-04 publicada solo como deuda pública externa del Banco Mundial (3);
  - orden de las transformaciones con los pesos actuales primero, medidas excluyentes, denominador del % del PIB y signo del último día del período (4);
  - fallas aisladas por variante y control de historia recortada (5.2), y estructura del repositorio actualizada (5.4);
  - ficha con último dato, medidas y comparación de países; bibliografía oculta hasta consultar a la cátedra (6.1);
  - SDK v2 del MCP, variante local sin `npx` hasta la fase 5 y parámetros de las medidas (7.1 y 7.2);
  - licencias de la OCDE y de Bruegel, y cita con los países aparte (9);
  - contraste de las series que calcula Vaivén (10) y subfases de la fase 4 (11).
- **v1.2 (07/11/2026):** incorpora lo decidido en la segunda revisión de la 4a (`NOTAS_FASE4.md`, «4a · Correcciones de la segunda revisión»):
  - snapshot con la versión de la fuente y fuentes de descarga manual (2.1 y 5.1);
  - esquema 1.3 y `desactualizada_desde` como primer día sin respuesta (2.5);
  - commit con el informe entero, issue por fuente a los 7 días y aviso de las fuentes manuales a los 3 meses (5.1 y 5.2);
  - tramos que completan con series diarias pasadas a mensuales y reemplazo documentado de un dato con otra fuente (2.3);
  - quiebres por entidad (2.4), catálogo sin la bibliografía (2.5), atraso contra el calendario de la fuente (6.1), parámetros estrictos y cita con nombres de países en el MCP (7.2) y licencia `other-at` de Bruegel (9);
  - tercera revisión (11/11/2026): snapshots comparados por contenido cuando la fuente cambia el orden (5.1).
- **v1.3 (12/11/2026):** períodos y eventos de la 4b (`NOTAS_FASE4.md`, «4b»):
  - sombreado y eventos en el gráfico de la ficha, apagados por defecto, y enlace «Abrir esta vista en el explorador»; contenido de la página de períodos (6.1);
  - ejemplo de evento con la fecha del hecho, `e.1991-03-27.convertibilidad` (2.2);
  - esquema y reglas de `periodos.yaml` y `eventos.yaml`: intervalos semiabiertos, fuente por extremo, cortes convencionales, mandatos, criterio de ministros y de regímenes, etapas con `igual_a`; Plan Austral desde el 15/6/1985 y Convertibilidad hasta el 7/1/2002 (2.4);
  - export de períodos y eventos con esquema propio, CSV y datapackage (2.5);
  - nombre público de las etapas del curso (6.4);
  - parámetros de `listar_periodos` y `periodo_en_fecha` (7.2);
  - explorador de una serie por vez en la 4b, parámetros de la URL, sombreado, eventos, exportación y colores por país (6.2).
- **v1.4 (12/11/2026):** correcciones de la revisión externa de la 4b (`NOTAS_FASE4.md`, «4b · Correcciones de la revisión externa»):
  - una sola regla para ubicar cada dato en el tiempo, que comparten el gráfico, la tabla, las descargas y el MCP; columnas `periodo`, `periodo_proporcion` y `otros_periodos` (2.4 y 6.2);
  - tipo `episodio` con `fases`; `confianza` por extremo; ministros interinos designados por decreto; regla de selección de eventos (2.4);
  - esquema `periodos-1.1` y regla de versión de los esquemas (2.5);
  - episodios y confianza en `/periodos/` (6.1), aclaración de las etapas fuera de `/periodos/` (6.4) y `episodio`, `confianza` y `asignacion` en el MCP (7.2).
- **v1.5 (12/11/2026):** correcciones de interfaz de la revisión externa de la 4b (`NOTAS_FASE4.md`, «4b · Correcciones de la revisión externa: interfaz (PR B)»):
  - `/periodos/` en tablas compactas por tipo con filas desplegables, en lugar de las tarjetas (6.1);
  - parámetro `ev` con filtro por categoría (`ev=1` sigue siendo «todo»), panel lateral del explorador en escritorio, regla de densidad de los eventos y lector con banda, episodio y eventos (6.2);
  - panel en escritorio y contraste del sombreado y de la franja en los dos modos (6.5).
- **v1.6 (13/11/2026):** cierre de la 4b, con la segunda revisión externa (`NOTAS_FASE4.md`, «4b · Cierre»):
  - la hiperinflación en tres fases, con la tregua del Plan Bunge y Born aparte (ejemplo de 2.4);
  - la regla de ubicación debajo del gráfico, en tono neutro (6.2);
  - `buscar_series` con todos los términos y sinónimos de frase; `obtener_serie` con el período sin dato como `null`, la frecuencia redundante ignorada y la nota de pesos actuales; `periodo_en_fecha` con la fase del episodio (7.2).
- **v1.7 (13/11/2026):** comparación de series y gráfico interactivo en el MCP:
  - módulo de alineación compartido; doble eje por defecto con dos unidades y paneles con más (o a pedido); frecuencia común (4.1);
  - explorador con hasta 4 series: URL indexada compatible con la 4b, colores por serie, tooltip común y exportación en formato largo y ancho (6.1 y 6.2);
  - celular y texto alternativo por panel (6.5);
  - `comparar_series` con `series[]` y `alinear`, y `especificacion_grafico` con `structuredContent` (7.2);
  - CPU de `especificacion_grafico` (7.3) y gráfico interactivo con MCP Apps (7.4);
  - pruebas (10); subfases 4c/4d y 4e, subagentes en Sonnet y nuevo `probador-mcp` (11 y 5.4); riesgos (12).
- **v1.8 (14/11/2026):** medición de la 4c/4d (`NOTAS_FASE4.md`, «4c/4d»):
  - `especificacion_grafico` con un límite de 1.000 observaciones, por la CPU (7.2 y 7.3);
  - su texto sin la especificación de Vega-Lite, que va solo en `structuredContent` (7.2 y 7.4).
- **v1.9 (14/11/2026):** explorador con varias series (`NOTAS_FASE4.md`, «4c/4d · Explorador con varias series (PR B)»):
  - `paquetes/grafico/` en la estructura del repositorio (5.4);
  - `ejes=doble` y el período sin `desde` (6.2);
  - la lista «Serie que editás», con la serie activa en todas las pantallas; la serie agregada arranca vacía; foco y anuncios; la serie repetida no se admite; el color de una serie agregada (6.2);
  - el período y el reparto en el tooltip y el lector de varias series (6.2);
  - las columnas del CSV largo, también con una serie; las hojas del XLSX; los nombres de archivo; la tabla de varias series con las columnas del período a pedido (6.2);
  - el contrato validado con las respuestas reales y la prueba de igualdad en el navegador (10).
