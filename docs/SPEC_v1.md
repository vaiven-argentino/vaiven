# Vaivén · Series económicas argentinas, 1970–hoy · SPEC v1

*22/10/2026 · Estado: borrador para revisión · Documentos relacionados: `DECISIONES_v0.md`, `ARQUITECTURA_v0.md`, `planificacion/catalogo_mvp_propuesta.csv`, `planificacion/inventario_graficos.csv`*

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
| **Snapshot** | El archivo tal como lo devolvió la fuente, con fecha de descarga, URL, checksum y licencia. | Nunca se modifica; si la fuente cambia, se guarda un snapshot nuevo. |
| **Capa 1: series fuente** | Cada serie de cada fuente, normalizada (fecha ISO, valor numérico, unidad, frecuencia). Una serie fuente = un tramo publicado por un organismo. | Sin transformaciones de contenido: solo formato. |
| **Capa 2: series curadas** | La serie de Vaivén, con una o más **variantes**. Cada variante declara qué tramos de capa 1 usa, cómo los une y qué advertencias tiene. | Toda operación queda documentada en los metadatos. |
| **Export** | Lo que consumen la web y el MCP: JSON por serie y variante, archivos de descarga, `datapackage.json`, especificaciones de Vega-Lite. | Se regenera completo en cada actualización. |

### 2.2 Identificadores
- **Serie:** código del catálogo y un *slug* legible. Ejemplo: `PRE-01` / `ipc`.
- **Variante:** `<slug>.<variante>`. Ejemplo: `ipc.oficial`, `ipc.cavallo-bertolotto`, `ipc.provincias`.
- **Serie fuente (capa 1):** `f.<organismo>.<nombre>`. Ejemplo: `f.indec.ipc-historico-1943-2008`.
- **Período y evento:** `p.<tipo>.<slug>` y `e.<fecha>.<slug>`. Ejemplo: `p.plan.austral`, `e.1991-04-01.convertibilidad`.
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
| `quiebres.yaml` | Una entrada por quiebre: id, fecha o rango, tipo (cambio de base, cobertura, intervención, metodología, signo monetario), descripción, series y variantes afectadas, fuente. |
| `periodos.yaml` | Gobiernos, ministros de Economía, planes de estabilización y regímenes cambiarios, con fechas de inicio y fin y fuente. |
| `eventos.yaml` | Hitos puntuales (por ejemplo, la sanción de la Convertibilidad o el default de 2001), con fecha, descripción y fuente. |
| `glosario.yaml` | Definiciones de conceptos (balanza de pagos, FAE, reservas netas, etc.), reutilizando el material de la cátedra cuando corresponda. |

Ejemplo de período, con fechas de referencia:
```yaml
- id: p.gobierno.alfonsin
  tipo: gobierno
  nombre: Raúl Alfonsín
  desde: 1983-12-10
  hasta: 1989-07-08
- id: p.plan.austral
  tipo: plan
  nombre: Plan Austral
  desde: 1985-06-14
- id: p.regimen.convertibilidad
  tipo: regimen_cambiario
  nombre: Convertibilidad
  desde: 1991-04-01
  hasta: 2002-01-06
```
La periodización de la cátedra (sección 6.4) se arma sobre estas tablas. Las fechas se cargan con fuente y se revisan una por una en la implementación.

### 2.5 Formato de exportación
- `export/series/<slug>/<variante>.json`: metadatos resumidos + `datos: [["1970-01", 0.0123], ...]` + `version_datos`. En las series con dimensión `pais`, `datos` es un objeto por entidad: `{"ARG": [["1961", 5.4], ...], "BRA": [...]}`.
- `export/catalogo.json`, `export/periodos.json`, `export/eventos.json`, `export/quiebres.json`.
- `export/datapackage.json` (Frictionless Data Package v2) que describe todos los recursos.
- `export/descargas/vaiven_<version>.parquet` y `.zip` con CSV por serie, para descarga completa.
- `export/vega/<slug>.json`: especificación de Vega-Lite por defecto de cada serie.

Este conjunto de archivos estáticos funciona además como **API pública de solo lectura**, documentada en la web.

### 2.6 Series auxiliares
No figuran en el catálogo, pero las transformaciones las necesitan: PIB nominal en pesos y en dólares, población, IPC de EE.UU. (para el TCR bilateral) y los factores de conversión de signos monetarios. Tienen los mismos metadatos y la misma validación que el resto.

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
| FIS-04 | Deuda pública | A | anual y trimestral | 3 | A determinar |
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
| `real` | Valor nominal ÷ IPC (variante elegida) × IPC de la fecha base | montos en pesos |
| `en_dolares` | Valor en pesos ÷ tipo de cambio oficial (o variante) | montos en pesos |
| `pct_pib` | Valor ÷ PIB nominal (misma moneda y frecuencia) × 100 | flujos y stocks |
| `pesos_actuales` | Convierte montos de signos monetarios anteriores a pesos actuales | montos en pesos y TC |
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
- Toda transformación que cruce un quiebre devuelve la advertencia correspondiente.
- `real` con IPC exige elegir la variante de IPC; por defecto se usa la variante por defecto del IPC, y la elección queda visible en el gráfico, la descarga y la cita.
- Las transformaciones se encadenan en un orden fijo: frecuencia → real / en_dolares / pesos_actuales → pct_pib → base_100 o variaciones → media_movil.

---

## 5. Pipeline

### 5.1 Pasos
1. **Disparo:** un Cron Trigger de Cloudflare llama a diario al `workflow_dispatch` de GitHub. El `schedule` propio de GitHub Actions queda como respaldo semanal. También se puede ejecutar a mano.
2. **Snapshot:** descarga cada fuente; si el checksum no cambió, no hace nada más con ella.
3. **Capa 1:** normaliza las fuentes que cambiaron.
4. **Capa 2:** reconstruye las variantes afectadas.
5. **Validación** (pandera y reglas propias):
   - esquema (tipos, fechas, unidades);
   - huecos inesperados en la serie;
   - rangos plausibles por serie;
   - continuidad en los puntos de empalme;
   - revisiones: compara contra la versión publicada y registra los valores históricos que cambiaron.
6. **Export:** regenera los JSON, descargas, `datapackage.json` y especificaciones de Vega-Lite.
7. **Publicación:** commit al repositorio con el resumen de cambios y despliegue del Worker (`wrangler deploy`).

### 5.2 Manejo de errores
- Si una fuente no responde: se reintenta; si sigue fallando, se publica con los datos anteriores y la serie queda marcada como «desactualizada desde <fecha>».
- Si la validación falla: no se publica nada, se abre un issue en GitHub con el detalle y se notifica por mail.
- Si una revisión supera un umbral por serie: se publica, pero queda registrada en `revisiones.json` y se muestra en la ficha.

### 5.3 Versionado
- Cada publicación tiene `version_datos` (fecha y hora) y queda como commit.
- Release trimestral en GitHub, archivada en Zenodo con DOI; el DOI de concepto apunta siempre a la última versión.
- `CITATION.cff` en el repositorio.

### 5.4 Estructura del repositorio
```
vaiven/
├── metadatos/          series/*.yaml, fuentes.yaml, quiebres.yaml, periodos.yaml, eventos.yaml, glosario.yaml
├── pipeline/           Python: fuentes/, capa1/, capa2/, validacion/, export/
├── snapshots/          <fuente>/<fecha>/ (archivos crudos)
├── datos/              capa1/, capa2/
├── export/             lo que consumen la web y el MCP
├── paquetes/transformaciones/   TypeScript (web + MCP)
├── web/                Astro
├── mcp/                servidor MCP (TypeScript): remoto y stdio
├── worker/             punto de entrada del Worker: assets estáticos + /mcp
├── tests/              unitarios (Python y TS) y casos de la bibliografía
├── .github/workflows/  actualizar.yml, publicar.yml, release.yml
├── CITATION.cff, LICENSE (MIT), LICENSE-DATOS (CC BY 4.0)
```

---

## 6. Web

### 6.1 Mapa del sitio
| Página | Contenido |
|---|---|
| **Inicio** | Qué es Vaivén, accesos a catálogo y explorador, series destacadas, última actualización. |
| **Catálogo** | Las 39 series por bloque, con filtros (bloque, prioridad, frecuencia, fuente) y búsqueda. |
| **Ficha de serie** | Gráfico con quiebres y períodos marcados; selector de variante; transformaciones; tabla; descargas; metodología; quiebres; fuentes; uso en la bibliografía (fichas del inventario); cómo citar. |
| **Explorador** | Hasta 4 series a la vez, transformaciones por serie, período, frecuencia, sombreado por gobierno, plan o régimen, eventos, dos ejes cuando hace falta. En las series internacionales, selector de países y agregados. |
| **Períodos** | Línea de tiempo de gobiernos, ministros de Economía, planes y regímenes cambiarios; desde cada período, accesos a gráficos ya filtrados. |
| **Metodología** | Capas, empalmes, quiebres, variantes, glosario, revisiones. |
| **Para agentes de IA** | Cómo conectar el MCP remoto (conector personalizado en Claude) y el local; lista de herramientas; ejemplos. |
| **Datos abiertos** | Descarga completa, estructura de los archivos estáticos (API de lectura) y `datapackage.json`. |
| **Cómo citar / Acerca / Licencias** | Cita sugerida, DOI, créditos, licencias de cada fuente. |

### 6.2 Explorador
- **Estado en la URL:** series, variantes, transformaciones, período y sombreado quedan en la URL, para compartir una vista exacta.
- **Exportación:**
  - gráfico en PNG y SVG (vega-embed), con título, fuentes, variante y versión de datos impresos en la imagen;
  - datos de la vista en CSV y XLSX, con una hoja de metadatos y la cita.
- **Advertencias visibles:** si el rango cruza un quiebre, aparece un aviso junto al gráfico y una marca en el eje temporal.
- **Riesgo país:** se carga en vivo desde ArgentinaDatos, con la fuente indicada y sin opción de descarga masiva.
- **Series internacionales:** cada una cuenta como una serie dentro del límite de 4, con hasta 8 países o agregados por gráfico (más líneas dejan de leerse). Selección inicial: Argentina, Brasil, Estados Unidos, América Latina y el Caribe y Mundo. Argentina queda resaltada y el resto en tonos secundarios. Además del gráfico de líneas, una vista de tabla por década (crecimiento promedio) para comparar sin ruido anual.

### 6.3 Identidad visual
- **Concepto:** una hoja de árbol que cae sin dirección clara. Su trayectoria oscilante es la metáfora de Vaivén: la economía argentina como movimiento de ida y vuelta, y también la línea de una serie temporal.
- **Logo:** una hoja estilizada con su trayectoria en zigzag suave; versiones a color, monocroma y como ícono pequeño (favicon).
- **Motivo gráfico:** la trayectoria de la hoja como separador y como recurso en la página de inicio. Animación sutil de la hoja al cargar el inicio, desactivada si el sistema pide reducir el movimiento.
- **Paleta:** tonos de hoja (verdes, ocres y terracotas) para la identidad; para los gráficos, una paleta categórica distinta, accesible y probada para daltonismo. El sombreado por períodos usa tonos neutros para no competir con las series.
- **Modo claro y oscuro.**
- **Tipografía:** sans serif legible para la interfaz y numerales tabulares en tablas y ejes.

### 6.4 Periodización de la cátedra
Sombreado opcional en todos los gráficos: herencia de la dictadura / Grinspun · Sourrouille, Austral, hiperinflación · 1989–91 · Convertibilidad · Alianza y crisis · salida de la crisis y 2002–2008 · kirchnerismo 2008–2015 · macrismo · albertismo · mileísmo. Además se puede sombrear por gobierno, ministro de Economía o régimen cambiario.

### 6.5 Accesibilidad y uso en celular
- WCAG 2.1 AA: contraste, navegación por teclado, textos alternativos con resumen de cada gráfico, tablas accesibles como alternativa al gráfico.
- Diseño adaptable a celular: en pantallas chicas el explorador muestra de a una serie por vez y los controles en un panel desplegable.

---

## 7. MCP

### 7.1 Despliegue
- **Remoto (principal):** `https://vaiven.argentino.workers.dev/mcp` (subdominio de cuenta `argentino`, sujeto a disponibilidad), Streamable HTTP, sin estado, sin autenticación (datos públicos), con límite de pedidos por IP.
- **Local:** el mismo paquete por stdio (`npx`), que lee el export publicado o una copia local.
- Implementación con el SDK oficial de TypeScript, compatible con la revisión 2026-07-28 del protocolo y con negociación de versiones para clientes anteriores.

### 7.2 Herramientas
| Herramienta | Parámetros | Devuelve |
|---|---|---|
| `buscar_series` | `texto?`, `bloque?`, `prioridad?`, `desde?`, `hasta?` | Lista de series con id, nombre, bloque, cobertura, variantes y, si corresponde, entidades disponibles. |
| `describir_serie` | `id` | Metadatos completos: definición, variantes, quiebres, fuentes, licencias, bibliografía y cita. |
| `obtener_serie` | `id`, `variante?`, `desde?`, `hasta?`, `frecuencia?`, `transformacion?`, `base?`, `deflactor?`, `paises?` (códigos ISO3; solo series internacionales; por defecto, la selección inicial) | Datos, unidad resultante, advertencias por quiebres en el rango, versión de datos y cita. |
| `comparar_series` | `ids[]` (hasta 4) y los mismos parámetros por serie | Series alineadas en fecha, con advertencias y citas. |
| `listar_periodos` | `tipo?` (gobierno, ministro, plan, régimen, cátedra) | Períodos con fechas y fuente. |
| `periodo_en_fecha` | `fecha` | Gobierno, ministro, plan y régimen vigentes en esa fecha. |
| `especificacion_grafico` | igual que `comparar_series` + `sombreado?` | Especificación de Vega-Lite y un link al explorador con esa vista. |
| `riesgo_pais` | `desde?`, `hasta?`, `frecuencia?` | Consulta en vivo a ArgentinaDatos, con fuente y aviso de licencia; no se almacena. |
| `citar` | `id`, `variante?`, `formato?` (APA, texto, BibTeX) | Cita lista para usar, con versión de datos. |

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
- **Banco Mundial (INT-01 e INT-02):** CC BY 4.0; se redistribuye con atribución al Banco Mundial y el código del indicador.
- **Series de terceros:** conservan su licencia, que figura en `fuentes.yaml`, en la ficha y en cada descarga. Las que no permiten redistribución (el riesgo país) no se descargan.
- **Cita sugerida:** incluye nombre de la serie, variante, versión de datos, DOI y URL. Formatos: APA, texto y BibTeX.
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

- **MCP:** pruebas automáticas de cada herramienta y prueba manual con Claude (web y escritorio) en cada actualización del protocolo o del SDK.

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

**Sugerencia de trabajo en Claude Code:** Opus para el diseño de los empalmes, la capa 2 y el MCP; Sonnet para componentes de la web y tareas repetitivas del pipeline. Una sesión por fase, empezando cada una con esta SPEC y el catálogo en el contexto.

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
