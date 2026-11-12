# Vaivén · Series económicas argentinas, 1970–hoy · SPEC v1.4

*v1: 22/10/2026 · v1.1: 05/11/2026, incorpora lo decidido en las fases 1 a 4a · v1.2: 07/11/2026, segunda revisión de la 4a · v1.3: 12/11/2026, períodos y eventos de la 4b · v1.4: 12/11/2026, correcciones de la revisión externa de la 4b (ver «Historial de versiones», al final; el detalle de cada decisión queda en `NOTAS_FASE1.md` a `NOTAS_FASE4.md`) · Documentos relacionados: `DECISIONES_v0.md`, `ARQUITECTURA_v0.md`, `planificacion/catalogo_mvp_propuesta.csv`, `planificacion/inventario_graficos.csv`*

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
    - {id: p.episodio.hiperinflacion-1989, nombre: Primer brote, desde: 1989-02-06, hasta: 1989-12-12, …}
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
├── web/                Astro; web/scripts/: copia del export, enlaces, revisión visual, punta a punta
├── mcp/                servidor MCP (TypeScript): remoto y stdio
├── worker/             punto de entrada del Worker: assets estáticos + /mcp
├── tests/              unitarios (Python y TS) y casos de la bibliografía
├── .github/workflows/  actualizar.yml, pruebas.yml, publicar.yml, release.yml (acciones fijadas por SHA)
├── .claude/agents/     subagentes de Claude Code (explorador, verificador de fuentes, revisor de datos, revisor visual, tester)
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
| **Ficha de serie** | Último dato bien visible (y su atraso respecto del calendario habitual de la fuente, que nombra al intermediario si el atraso es de la copia de datos.gob.ar; la versión de las fuentes de descarga manual); gráfico con quiebres y, a pedido, períodos sombreados y eventos marcados (apagados por defecto; parámetros `sh` y `ev`, como en el explorador), con un enlace a la misma vista en el explorador; selector de variante; transformaciones y medidas (con su IPC o su PIB); tabla; descargas; metodología; quiebres; fuentes; uso en la bibliografía (fichas del inventario: oculto hasta que la cátedra responda, sección 12); cómo citar. En las series internacionales, la selección inicial de países con el elegido resaltado y la tabla por década (como en el explorador, 6.2). |
| **Explorador** | Hasta 4 series a la vez, transformaciones por serie, período, frecuencia, sombreado por gobierno, plan o régimen, eventos, dos ejes cuando hace falta. En las series internacionales, selector de países y agregados. |
| **Períodos** | Línea de tiempo de gobiernos, ministros de Economía, planes, regímenes cambiarios, etapas del curso, episodios y eventos; una tarjeta por período con sus fechas (y el aviso «fecha a confirmar» en las de confianza baja), notas, fuentes y confianza, y accesos al explorador ya filtrados (gobiernos, mandatos y etapas: inflación interanual, PIB real, desocupación, tipo de cambio real, reservas y resultado fiscal; ministros, planes y regímenes: inflación mensual, tipo de cambio oficial, tipo de cambio real y reservas; de un año antes a un año después, con el sombreado de ese tipo). |
| **Metodología** | Capas, empalmes, quiebres, variantes, glosario, revisiones. |
| **Para agentes de IA** | Cómo conectar el MCP remoto (conector personalizado en Claude) y el local; lista de herramientas; ejemplos. |
| **Datos abiertos** | Descarga completa, estructura de los archivos estáticos (API de lectura) y `datapackage.json`. |
| **Cómo citar / Acerca / Licencias** | Cita sugerida, DOI, créditos, licencias de cada fuente. |

### 6.2 Explorador
En la fase 4b, el explorador (`/explorador/`) muestra **una serie por vez** (o una internacional con hasta 8 países); la comparación de hasta 4 series y los dos ejes llegan en la 4c.
- **Estado en la URL:** series, variantes, transformaciones, período y sombreado quedan en la URL, para compartir una vista exacta. Los parámetros son los de la ficha (`t`, `m`, `d`, `pib`, `pa`, `f`, `mm`, `base`, `desde`, `hasta`, `log`) más `s` y `v` (serie y variante), `p` (países, el resaltado primero), `sh` (sombreado: `catedra`, `gobierno`, `mandato`, `ministro`, `plan`, `regimen_cambiario`) y `ev=1` (eventos y episodios). Lo que coincide con la vista inicial de la serie no se escribe; un parámetro que la serie no admite se ignora con un aviso.
- **Sombreado y eventos:** bandas de fondo en dos grises que se alternan, con los gobiernos de facto en uno más oscuro (sin superposiciones: gobiernos, mandatos, ministros, regímenes y etapas); los planes, que pueden superponerse, en una franja arriba del gráfico. Con sombreado, los quiebres pierden el relleno y quedan como barra punteada con número. Los eventos van como reglas finas con una letra y una lista debajo del gráfico. Los episodios, con «Marcar eventos», en una franja debajo del eje, con el estilo de los quiebres largos (línea punteada con topes, también en el cambio de fase).
- **Ubicación de los datos** (2.4): cada punto se dibuja en su fecha de referencia (el último día en los saldos en nivel, el punto medio en lo demás), y la tabla y las descargas lo asignan al período del sombreado con la misma regla. Junto al gráfico, un aviso dice la regla y su límite. El tooltip y el lector de teclado (con el foco en el gráfico, las flechas recorren los datos) dicen el período y, si el dato cruza un cambio, el reparto.
- **Exportación:**
  - gráfico en PNG y SVG (vega-embed), con título, fuentes, variante, transformación, sombreado y versión de datos impresos en la imagen;
  - datos de la vista en CSV y XLSX (con `write-excel-file`, que se carga solo al pedirlo), con las columnas `periodo`, `periodo_proporcion` y `otros_periodos` del sombreado (regla de 2.4; con las etapas del curso, la aclaración «etapas según la periodización de un curso universitario»), una hoja de metadatos con la regla, la cita y, si hay sombreado, los períodos con sus fuentes.
- **Advertencias visibles:** si el rango cruza un quiebre, aparece un aviso junto al gráfico y una marca en el eje temporal.
- **Riesgo país:** se carga en vivo desde ArgentinaDatos, con la fuente indicada y sin opción de descarga masiva.
- **Series internacionales:** cada una cuenta como una serie dentro del límite de 4, con hasta 8 países o agregados por gráfico (más líneas dejan de leerse). Selección inicial: Argentina, Brasil, Estados Unidos, América Latina y el Caribe y Mundo. En el explorador, cada país lleva su color (paleta de 8, probada para daltonismo) y su nombre al final de la línea, con el resaltado más grueso; en la ficha, el resaltado va en color y el resto en tono secundario. Además del gráfico de líneas, una vista de tabla por década (crecimiento promedio) para comparar sin ruido anual.

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
- Diseño adaptable a celular: en pantallas chicas el explorador muestra de a una serie por vez y los controles en un panel desplegable.

---

## 7. MCP

### 7.1 Despliegue
- **Remoto (principal):** `https://vaiven.argentino.workers.dev/mcp` (subdominio de cuenta `argentino`, sujeto a disponibilidad), Streamable HTTP, sin estado, sin autenticación (datos públicos), con límite de pedidos por IP.
- **Local:** el mismo paquete por stdio, que lee el export publicado o una copia local. Hasta la fase 5 se corre desde una copia del repositorio; en la fase 5 se publica para `npx`.
- Implementación con el SDK oficial de TypeScript v2 (`@modelcontextprotocol/server`), compatible con la revisión 2026-07-28 del protocolo y, sin sesión, con los clientes de la era 2025 (`initialize`). El límite por IP es aproximado (Rate Limiting de Cloudflare).

### 7.2 Herramientas
| Herramienta | Parámetros | Devuelve |
|---|---|---|
| `buscar_series` | `texto?`, `bloque?`, `prioridad?`, `desde?`, `hasta?` | Lista de series con id, nombre, bloque, cobertura, variantes y, si corresponde, entidades disponibles. |
| `describir_serie` | `id` | Metadatos completos: definición, variantes (con su último dato, sus transformaciones, medidas, deflactores y PIB disponibles), quiebres, fuentes, licencias, países y cita. La bibliografía, cuando la cátedra lo confirme. Los parámetros de todas las herramientas son estrictos: uno desconocido da error. |
| `obtener_serie` | `id`, `variante?`, `desde?`, `hasta?`, `pesos_actuales?`, `frecuencia?`, `medida?` (real, en_dolares, pct_pib), `deflactor?`, `base_real?`, `denominador?`, `transformacion?`, `base?`, `paises?` (códigos ISO3; solo series internacionales; por defecto, la selección inicial) | Datos (por país en las internacionales), unidad resultante, último dato y su atraso, advertencias por quiebres en el rango (las de un solo país, si ese país se pidió), versión de datos y cita (con los países por su nombre). |
| `comparar_series` | `ids[]` (hasta 4) y los mismos parámetros por serie | Series alineadas en fecha, con advertencias y citas. |
| `listar_periodos` | `tipo?` (`gobierno`, `ministro`, `plan`, `regimen_cambiario`, `catedra`, `episodio`), `por_mandato?` | Períodos con fechas, fuente y `confianza` de cada fecha (y las fases de los episodios), con aviso de los cortes convencionales y de las fechas de confianza baja. Sin `tipo`, una lista compacta sin fuentes (la completa pasa los 100 KB), que marca las fechas a confirmar. |
| `periodo_en_fecha` | `fecha` (AAAA-MM-DD, o AAAA-MM para todo lo vigente en algún momento del mes) | Gobierno (y mandato), ministro, planes, régimen cambiario, etapa y episodios vigentes, con sus fuentes y confianza, y los eventos de ese día o mes. Con un mes, `asignacion`: a qué período va un dato mensual (regla de 2.4) y el reparto por días. |
| `especificacion_grafico` | igual que `comparar_series` + `sombreado?` | Especificación de Vega-Lite y un link al explorador con esa vista. |
| `riesgo_pais` | `desde?`, `hasta?`, `frecuencia?` | Consulta en vivo a ArgentinaDatos, con fuente y aviso de licencia; no se almacena. |
| `citar` | `id`, `variante?`, `formato?` (APA, texto, BibTeX) y los mismos parámetros de transformación de `obtener_serie` | Cita lista para usar, con versión de datos y lo que calculó Vaivén. |

### 7.3 Reglas de respuesta
- Toda respuesta con datos incluye `advertencias`, `version_datos`, `fuentes` y `cita`.
- Límites por pedido: hasta 4 series y 10.000 observaciones; si se superan, se pide acotar. En las series internacionales, cada país cuenta para el límite de observaciones, no para el de series.
- El servidor no calcula empalmes: solo lee variantes ya publicadas y aplica transformaciones livianas. Eso lo mantiene dentro de los 10 ms de CPU del plan gratuito.
- Las descripciones de las herramientas están en español, pensadas para que un modelo elija bien cuál usar.

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

**Subfases de la fase 4:** 4a, datos del núcleo (las 20 series A, las 2 internacionales, las auxiliares y las medidas en la librería, la ficha y el MCP); 4b, explorador y períodos; 4c, comparación de series; 4d, el resto de las herramientas del MCP.

**Sugerencia de trabajo en Claude Code:** Opus para el diseño de los empalmes, la capa 2 y el MCP; Sonnet para componentes de la web, tareas repetitivas del pipeline y los subagentes que verifican números (verificador de fuentes, revisor de datos). Una sesión por fase o subfase, empezando cada una con esta SPEC y el catálogo en el contexto.

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
