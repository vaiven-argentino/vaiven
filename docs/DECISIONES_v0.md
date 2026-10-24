# Vaivén · Series económicas argentinas · Decisiones v0

*22/10/2026 · Estado: planificación (antes de la especificación)*

## Propósito
Base histórica **curada** de series económicas para estudiar las políticas económicas argentinas del período democrático (1983–hoy), con su contexto: períodos de política, quiebres metodológicos y forma de citar. No es un agregador general: eso ya existe (datos.gob.ar, ArgenData, Almanac, El Tablero, varios servidores MCP).

## Decisiones tomadas
- **Nombre:** Vaivén (decidido el 22/10/2026). Imagen de identidad: una hoja de árbol que cae sin dirección clara; base para el logo y el diseño de la interfaz. Nombres técnicos: organización de GitHub `vaiven-argentino` (creada el 22/10/2026, https://github.com/vaiven-argentino), repositorio `vaiven`, Worker `vaiven`.
- **Repositorio:** público, en una organización gratuita de GitHub creada por Camilo.
- **Idioma de la interfaz:** español en el MVP, con estructura preparada para sumar inglés.
- **Dominio:** subdominio gratuito de Cloudflare: `vaiven.argentino.workers.dev` (Worker `vaiven`, subdominio de cuenta `argentino`; decidido el 22/10/2026, sujeto a que `argentino` esté libre). Un dominio propio puede agregarse después.
- **Autoría:** Camilo Gómez Ortega von Zeschau (en `CITATION.cff`: `given-names: Camilo`, `family-names: Gómez Ortega von Zeschau`).
- **Públicos:** Camilo, la cátedra y la comisión, y el público general. El diseño se ordena por el más exigente (público general): licencia clara, forma de citar y advertencias metodológicas visibles.
- **Costo:** cero, como condición inicial y permanente.
- **Datos en dos capas** (se hacen ambas):
  - *Capa 1, series fuente:* los datos tal como los publicó cada organismo, con fecha de descarga. No se modifican.
  - *Capa 2, series derivadas:* empalmes, deflactaciones y conversiones de moneda, con método, series de origen y versión declarados. Cuando hay más de un empalme defendible (por ejemplo, el IPC 2007–2015), se ofrecen **variantes con nombre propio**, sin elegir por el usuario.
- **Periodización:** sale del programa de la materia (UBA, Sociología, cátedra Aronskind–Guimenez): herencia de la dictadura / Grinspun · Sourrouille, Austral, hiperinflación · 1989–91 · Convertibilidad · Alianza y crisis · salida de la crisis y 2002–2008 · kirchnerismo 2008–2015 · macrismo · albertismo · mileísmo.
- **Inicio de las series: 1970** (decidido el 22/10/2026). Cubre la herencia de la dictadura y los antecedentes que usa la bibliografía.
- **2019 a hoy:** se extienden las mismas variables núcleo hasta el presente, sin variables específicas del período (decidido el 22/10/2026).
- **Catálogo del MVP:** aprobado: 39 series (20 de prioridad A y 19 de prioridad B) en `planificacion/catalogo_mvp_propuesta.csv`. El riesgo país queda dentro del MVP, por consulta en vivo a ArgentinaDatos, sin almacenarlo ni redistribuirlo.
- **Contexto internacional** (decidido el 22/10/2026): bloque nuevo con dos series de prioridad B, crecimiento del PIB total (INT-01) y per cápita (INT-02), del Banco Mundial (CC BY 4.0), anuales desde 1961. Países: Argentina, Estados Unidos, China, México, Brasil y el resto de Sudamérica; agregados: Mundo, América Latina y el Caribe, Unión Europea y Zona del euro. Se implementan en la fase 4 y suman una dimensión `pais` (ISO3) al modelo de datos, al explorador y al MCP.
- **Arquitectura:** aprobada; ver `ARQUITECTURA_v0.md`. Pipeline en Python con GitHub Actions (disparado por un Cron Trigger de Cloudflare), web en Astro con Vega-Lite y MCP remoto sin estado en TypeScript, ambos sobre Cloudflare Workers. El MCP remoto es la opción principal; el mismo código corre también en local.
- **Licencias:** MIT para el código y CC BY 4.0 para los datos derivados; las series de terceros conservan su licencia.
- **Requisitos desde la bibliografía:** inventario de gráficos y cuadros de la bibliografía obligatoria y de los materiales complementarios de la materia, numerado según el cronograma 2026, más los archivos de las carpetas de la materia que no figuran en el cronograma. Formato: CSV (`planificacion/inventario_graficos.csv`, con resumen en `planificacion/resumen_variables.csv`). Es un insumo para la planificación, no un entregable de la herramienta.

## Hallazgos del inventario (22/10/2026)
- **206 fichas** de 26 documentos: 18 textos obligatorios con cuadros o gráficos, 3 materiales complementarios y 5 archivos de las carpetas que no figuran en el cronograma 2026 (Aronskind 2003, Heymann–Navajas–Warnes 1991, CENDA 2004 y dos artículos de *Márgenes* n.º 1: Schorr–Wainer y Gambina). Sin cuadros ni gráficos: 6 textos obligatorios (Llach, Schvarzer cap. 3, Lo Vuolo, Vitelli, Aronskind *Riesgo país* y *La restricción externa*) y el discurso de Martínez de Hoz. Doc_c46 es la versión completa de *Malos tiempos* (CEDES 46): su anexo coincide con el ya fichado. Los dos elementos de Heymann–Navajas–Warnes son teóricos (matriz de pagos y equilibrio de un juego).
- **Variables más usadas** (por cantidad de documentos): inflación (11); deuda externa total, PIB y reservas (9); fuga de capitales, resultado fiscal, salario real, tipo de cambio nominal y exportaciones (8); deuda pública externa, inversión, balanza comercial, importaciones y cuenta corriente (7).
- **Cobertura temporal:** varias series arrancan antes de 1983 (1950–1975, incluso 1900 en De la Balze), y la bibliografía termina en 2018.
- **Quiebres más mencionados:** cambios de base, IPC 2007–2015, cobertura del sector público, EPH puntual → continua, manual de balanza de pagos, métodos de estimación de la fuga y revisión del PIB.
- **Variantes en la bibliografía misma:** IPC-9 (CIFRA), IPC-7 (CENDA), IGA-OJF (Ferreres), TCR recalculados, salario industrial empalmado entre encuestas, fuga por método residual o por balance cambiario. Confirma el diseño de la capa 2 con variantes con nombre propio.
- **Cronologías:** 5 cuadros (regímenes cambiarios de 1989, cepo y su desarme, comparación de planes 1985–1991) sirven directamente para la capa de períodos y eventos.
- **Disponibilidad hoy** (estimación preliminar, sin verificar contra las fuentes): 54 fichas tienen fuente oficial vigente, 80 oficial histórica u otra, 28 son cálculos del autor, 13 mixtas, 8 internacionales, 5 privadas, 2 académicas y 16 no aplican.

## Preguntas abiertas
- **Licencias de fuentes de terceros:** variante de IPC de Cavallo–Bertolotto; series largas académicas de salario real; IPC-9 (CIFRA) e IPC-7 (CENDA) como archivo.
- **Encuadre académico:** posible TFI de la Especialización en Ciencias Sociales Computacionales (UNAB). Falta consultar si se acepta un producto de datos o software y formular una pregunta de investigación.
