// Textos que lee el modelo: instrucciones del servidor y descripciones de herramientas y parámetros (SPEC 7.3:
// en español, pensadas para que elija bien qué herramienta usar). Se aprobaron en el plan de la fase 3; los
// agregados de la fase 4a (medidas, países e índice desde tasas), el 28/10/2026; los de la revisión de la 4a
// (denominador del % del PIB, último dato, sin bibliografía), el 05/11/2026; los de períodos (fase 4b), en el PR 1 de la 4b.

export const INSTRUCCIONES =
  "Vaivén es una base curada de series económicas argentinas desde 1970, con sus quiebres metodológicos, variantes y " +
  "fuentes. Flujo sugerido: buscar_series para encontrar el id → describir_serie para entender variantes y quiebres → " +
  "obtener_serie para los datos → citar. Al usar datos, mencioná las advertencias que trae la respuesta (cambios de " +
  "metodología, intervención del INDEC, datos excluidos) y citá la fuente con la cita que viene en la respuesta. Los " +
  "valores null son datos faltantes o excluidos: no los completes. Para pasar una serie a términos reales, a dólares, " +
  "a % del PIB o a pesos actuales, pedilo con `medida` o `pesos_actuales` de obtener_serie en lugar de calcularlo por " +
  "tu cuenta: Vaivén usa el IPC y el tipo de cambio publicados y, para el % del PIB, el PIB publicado en cada base " +
  "(u otro, si lo pedís con `denominador`), y suma sus advertencias. Algunas fuentes llevan meses de atraso: cada " +
  "respuesta dice el último dato de la serie (`ultimo_dato`); mencionalo si el usuario pregunta por meses recientes. " +
  "`atraso` dice si la serie está más atrasada que lo normal para su fuente (`esperado`: el mes que ya debería estar; " +
  "`intermediario`: datos.gob.ar, si el atraso es de esa copia y no del organismo). Para ubicar un dato en su contexto " +
  "político (qué gobierno, ministro de Economía, plan o régimen cambiario regía), usá periodo_en_fecha; para las " +
  "fechas de un gobierno o un plan (por ejemplo, para pedir una serie entre esas fechas), listar_periodos.";

export const DESCRIPCION = {
  buscar_series:
    "Busca series en el catálogo de Vaivén (series económicas argentinas desde 1970: precios, tipo de cambio, sector " +
    "externo, trabajo, etc.). Usala primero cuando no sepas el id exacto de una serie. Devuelve id, código, nombre, " +
    "bloque, frecuencia, cobertura y variantes, cada una con su estado (publicada, pendiente o pendiente de licencia). " +
    "En las series internacionales, también los países que incluyen. Todos los filtros son opcionales; sin filtros, " +
    "lista todas las series publicadas. `texto` no distingue tildes ni mayúsculas (por ejemplo, «inflación», «dólar», " +
    "«desempleo», «déficit», «PRE-01» o «Brasil»). `desde` y `hasta` (AAAA o AAAA-MM) dejan solo las series con " +
    "datos en ese período. Para los metadatos completos, usá describir_serie; para los datos, " +
    "obtener_serie.",
  describir_serie:
    "Devuelve los metadatos completos de una serie de Vaivén, sin los datos: definición, unidad, frecuencia, variantes " +
    "(método, tramos y fuentes de cada una, y estado si están pendientes), quiebres metodológicos con sus fechas, datos " +
    "excluidos, último dato, transformaciones y medidas disponibles (real, con sus deflactores; en dólares; % del PIB, " +
    "con los PIB que puede usar; pesos actuales), países (en las series internacionales), licencias y la cita " +
    "sugerida. Usala antes de " +
    "interpretar una serie o de elegir variante y transformación, sobre todo si el período cruza un cambio de metodología (por " +
    "ejemplo, el IPC de 2007–2015 o el cambio de la EPH en 2003). `id`: id de la serie («ipc»), código («PRE-01») o id " +
    "de variante («ipc.provincias»).",
  obtener_serie:
    "Devuelve las observaciones de una serie de Vaivén, con transformaciones opcionales que calcula Vaivén: " +
    "variaciones, base 100, índice desde tasas, cambio a una frecuencia más baja y medidas (real, en dólares, % del " +
    "PIB y pesos actuales). Se aplican en este orden: pesos actuales → frecuencia → medida → transformación → período. " +
    "En las series internacionales, `paises` elige los países (por defecto, la selección inicial) y `datos` va por " +
    "país. Cada respuesta trae la unidad resultante, el último dato publicado (`ultimo_dato`), las " +
    "advertencias por quiebres metodológicos dentro del rango pedido, los datos excluidos, la versión de datos, las " +
    "fuentes y la cita: mencioná las advertencias cuando uses los datos. Las fechas van como AAAA-MM (en mensuales, " +
    "trimestrales y semestrales, el mes en que empieza el período) o AAAA (anuales). Un valor null es un dato faltante " +
    "o excluido: no lo interpoles. Si no sabés el id, usá buscar_series; para ver qué variantes y transformaciones " +
    "admite la serie, describir_serie. Límite: 10.000 observaciones por pedido, sumando todos los países.",
  citar:
    "Devuelve la cita sugerida de una serie de Vaivén, la misma que muestra su ficha en la web, con la versión de " +
    "datos y la URL de la variante. Formatos: texto, apa o bibtex; si no se indica, devuelve los tres. Si los datos se " +
    "transformaron con obtener_serie, pasá los mismos parámetros (`transformacion`, `frecuencia`, `medida`, " +
    "`deflactor`, `base_real`, `denominador`, `pesos_actuales` y `paises`) para que la cita aclare qué calculó " +
    "Vaivén. Las " +
    "respuestas de obtener_serie ya traen la cita en texto: usá esta herramienta " +
    "cuando necesites APA o BibTeX.",
  listar_periodos:
    "Lista los períodos de la historia económica argentina desde 1970 que usa Vaivén, con fechas exactas y la fuente " +
    "de cada fecha (decreto, ley, comunicación del BCRA o bibliografía): gobiernos (incluidos los de facto y los " +
    "interinos), ministros de Economía, planes de estabilización, regímenes cambiarios y etapas de la política " +
    "económica (periodización de un curso universitario; `catedra`). Sin `tipo`, todos. Con `por_mandato`, los " +
    "gobiernos de dos mandatos (Menem, Fernández de Kirchner) van separados. Usala para saber entre qué fechas pedir " +
    "una serie con obtener_serie (por ejemplo, la inflación durante el Plan Austral) o para nombrar bien un período. " +
    "Algunos fines (los de los planes, sobre todo) son cortes convencionales de Vaivén y no un hecho fechado: la " +
    "respuesta lo avisa en `advertencias`.",
  periodo_en_fecha:
    "Dice qué regía en una fecha, según los registros de Vaivén: gobierno (y mandato), ministro de Economía, planes de estabilización, régimen " +
    "cambiario y etapa de la política económica, con sus fechas y fuentes, más los eventos económicos de ese día o mes " +
    "(por ejemplo, el corralito o la salida del cepo). `fecha`: AAAA-MM-DD (un día) o AAAA-MM (todo lo que estuvo " +
    "vigente en algún momento de ese mes; en diciembre de 2001, cinco presidentes). Desde 1970. Usala para poner en " +
    "contexto un dato de una serie.",
} as const;

export const TITULO = {
  buscar_series: "Buscar series",
  describir_serie: "Describir una serie",
  obtener_serie: "Obtener los datos de una serie",
  citar: "Citar una serie",
  listar_periodos: "Listar períodos (gobiernos, ministros, planes, regímenes)",
  periodo_en_fecha: "Qué regía en una fecha",
} as const;

export const PARAMETRO = {
  texto: "Palabras a buscar, en español. Ejemplos: «inflación», «tipo de cambio», «reservas», «EXT-06».",
  bloque: "Bloque temático: Actividad, Precios, Sector externo, Cambiario, Monetario, Fiscal, Trabajo e ingresos, Sectorial o Contexto internacional.",
  prioridad: "Prioridad en el catálogo: A (núcleo) o B.",
  desdeBusqueda: "Inicio del período de interés (AAAA o AAAA-MM): deja las series con algún dato en ese período.",
  hastaBusqueda: "Fin del período de interés (AAAA o AAAA-MM): deja las series con algún dato en ese período.",
  id: "Id de la serie («desocupacion»), código («TRA-01») o id de variante («desocupacion.gba»).",
  variante: "Si se omite, la variante por defecto. Solo variantes publicadas.",
  desde: "Inicio del período, inclusive (AAAA o AAAA-MM).",
  hasta: "Fin del período, inclusive (AAAA o AAAA-MM).",
  frecuencia:
    "Pasa a trimestral o anual con la agregación de la serie (promedio, suma o fin de período). Solo agrega períodos completos.",
  transformacion:
    "nivel (valor tal cual, por defecto) · var_mensual: variación % contra el mes anterior · var_interanual: contra el " +
    "mismo período del año anterior · var_dic_dic: variación diciembre contra diciembre (una por año) · " +
    "acumulada_anio: desde diciembre del año anterior · base_100: índice con base en `base` · indice_desde_tasas: " +
    "encadena tasas de variación anuales en un índice (año `base` = 100; por defecto, el primero con dato). Solo " +
    "valen las que admite la variante.",
  base:
    "Con base_100: AAAA-MM (esa observación vale 100), AAAA (el promedio del año vale 100) o AAAA-MM/AAAA-MM (el " +
    "promedio del período vale 100). Con indice_desde_tasas: el año (AAAA) que vale 100.",
  pesosActuales:
    "true pasa una serie en moneda de cada época (m$n, pesos ley 18.188, pesos argentinos, australes) a pesos " +
    "actuales. Hace falta para variaciones, base 100 o cambio de frecuencia en esas series.",
  medida:
    "real: a precios constantes, deflactada con el IPC · en_dolares: dividida por el tipo de cambio oficial · " +
    "pct_pib: en % del PIB del mismo período (el PIB lo elige `denominador`); pide frecuencia anual o trimestral " +
    "(en los stocks, solo anual). Solo valen las que admite la variante (ver describir_serie).",
  denominador:
    "Solo con medida pct_pib: qué PIB divide. cada-base (por defecto): el publicado en cada base, como en los " +
    "cuadros de la bibliografía; salta en 2004 por el cambio de base · retropolado: llevado hacia atrás desde la " +
    "base 2004, sin saltos (antes de 2004 da un PIB unos 8 % mayor) · banco-mundial: el PIB en dólares del Banco " +
    "Mundial, solo en las series en dólares (en 1971–1981 y 2012–2015 no usa el tipo de cambio oficial).",
  deflactor: "Solo con medida real: la variante del IPC («ipc.oficial», por defecto, o «ipc.provincias»).",
  baseReal: "Solo con medida real: precios de qué período (AAAA-MM o AAAA). Por defecto, el último con dato en la serie y en el IPC.",
  paises:
    "Solo en las series internacionales: códigos ISO3 o de agregados del Banco Mundial (por ejemplo, [\"ARG\", " +
    "\"BRA\", \"WLD\"]). Si se omite, la selección inicial de la serie.",
  formato: "texto, apa o bibtex. Si se omite, devuelve los tres.",
  transformacionCita: "La transformación que se usó con obtener_serie, si hubo alguna.",
  frecuenciaCita: "La frecuencia que se pidió a obtener_serie, si se cambió.",
  comoEnObtener: "El mismo valor que se pasó a obtener_serie, si se usó.",
  tipoPeriodo:
    "gobierno · ministro (de Economía o Hacienda) · plan (de estabilización) · regimen_cambiario · catedra (etapas de " +
    "la política económica de un curso universitario). Si se omite, todos.",
  porMandato: "true separa los gobiernos de dos mandatos (Menem 1989 y 1995, Fernández de Kirchner 2007 y 2011). Solo para gobiernos.",
  fechaPeriodo: "AAAA-MM-DD para un día (por ejemplo, «1989-07-08») o AAAA-MM para un mes («2001-12»). Desde 1970.",
} as const;
