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
    "datos en ese período. `variante_por_defecto` es la que usan las demás herramientas si no se pide `variante`: " +
    "fijate si es la que corresponde a la pregunta (por ejemplo, en exportaciones e importaciones es la anual; la " +
    "mensual se pide con `variante: mensual`). Para los metadatos completos, usá describir_serie; para los datos, " +
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
    "interinos), ministros de Economía (incluidos los interinos designados por decreto), planes de estabilización, " +
    "regímenes cambiarios, etapas de la política económica (según la periodización de un curso universitario; " +
    "`catedra`) y episodios (procesos de varios meses, como la hiperinflación de 1989–1990, con sus fases; pueden " +
    "superponerse). Sin `tipo`, todos, en una lista compacta (sin " +
    "fuentes ni descripciones); con `tipo`, con la fuente de cada fecha. Con `por_mandato`, los " +
    "gobiernos de dos mandatos (Menem, Fernández de Kirchner) van separados. Usala para saber entre qué fechas pedir " +
    "una serie con obtener_serie (por ejemplo, la inflación durante el Plan Austral) o para nombrar bien un período. " +
    "Algunos fines (los de los planes, sobre todo) son cortes convencionales de Vaivén y no un hecho fechado, y cada " +
    "fecha lleva su `confianza` (alta, media o baja): la respuesta avisa en `advertencias` los cortes convencionales " +
    "y las fechas de confianza baja («fecha a confirmar»).",
  periodo_en_fecha:
    "Dice qué regía en una fecha, según los registros de Vaivén: gobierno (y mandato), ministro de Economía, planes de estabilización, régimen " +
    "cambiario, etapa de la política económica y episodios, con sus fechas, fuentes y confianza, más los eventos " +
    "económicos de ese día o mes (por ejemplo, el corralito o la salida del cepo). `fecha`: AAAA-MM-DD (un día) o " +
    "AAAA-MM (todo lo que estuvo vigente en algún momento de ese mes; en diciembre de 2001, cuatro presidentes). Con un " +
    "mes, `asignacion` dice a qué período asigna Vaivén un dato mensual (el vigente a mitad de mes; un saldo a fin de " +
    "mes, como las reservas, va al vigente el último día) y `reparto`, los días de cada uno. Desde 1970. Usala para " +
    "poner en contexto un dato de una serie.",
  comparar_series:
    "Compara de 1 a 4 series de Vaivén en una sola respuesta, cada una con sus propios parámetros (los de obtener_serie: " +
    "variante, transformación, frecuencia, medida, países…). Usala cuando la pregunta relaciona o compara series (por " +
    "ejemplo, la inflación y el tipo de cambio, o la desocupación y el PIB); para una sola serie, obtener_serie; para un " +
    "gráfico o un enlace a la web, especificacion_grafico. `desde` y `hasta` valen para todas. Por defecto (`alinear: " +
    "frecuencia_comun`) lleva todas las series a la frecuencia más baja del conjunto (mensual < trimestral < anual; una " +
    "serie semestral, como la desocupación de la EPH puntual, lleva a anual), con la agregación de cada serie y solo con " +
    "períodos completos: un período incompleto queda en null (por ejemplo, 2003 en la desocupación, que mezcla una onda " +
    "de la EPH puntual con trimestres de la continua; con `alinear: ninguna` se ven los datos originales). Devuelve " +
    "`datos` como filas [fecha, v1, v2…] en el orden de `columnas` (una por serie y por " +
    "país). Así, una variación interanual alineada a anual es la variación del promedio anual, no el promedio de las " +
    "variaciones mensuales (la respuesta lo avisa). Con `alinear: ninguna`, los datos de cada serie en su frecuencia, " +
    "dentro de `series`. Siempre trae, por serie, la unidad resultante, el último dato, las advertencias y la cita, y los " +
    "avisos de la combinación (`advertencias_combinacion`): mencionalos al usar los datos. Una serie internacional como " +
    "máximo; sus países (hasta 8) cuentan como una sola serie. Límite: 10.000 observaciones, sumando las series y los países.",
  especificacion_grafico:
    "Hasta 1.000 observaciones por gráfico, sumando las series y los países (por la CPU del servidor): para series " +
    "largas, pedí `frecuencia: anual` desde el primer intento (por ejemplo, el IPC y las reservas desde 1970), o los " +
    "datos con comparar_series. " +
    "Devuelve un gráfico de 1 a 4 series listo para dibujar (una especificación de Vega-Lite con los datos incluidos), " +
    "el mismo que muestra el explorador de Vaivén, y `url_explorador`, el enlace a esa vista en la web. Usala cuando el " +
    "usuario pida un gráfico, una figura o un enlace para ver o compartir series; para leer o analizar cifras, " +
    "obtener_serie (una serie) o comparar_series (varias). Cada serie lleva sus parámetros como en obtener_serie " +
    "(salvo `base_real`); `desde` y `hasta` valen para todas. Cada serie va en su frecuencia. Con dos unidades " +
    "distintas, el gráfico va en doble eje (o en paneles, con `ejes: paneles`); con tres o cuatro unidades, o con una " +
    "serie internacional junto con otra, en paneles. `sombreado` sombrea períodos y `eventos` marca eventos y episodios. " +
    "Trae también la disposición, las advertencias y la cita de cada serie: mencionalas al mostrar el gráfico.",
} as const;

export const TITULO = {
  buscar_series: "Buscar series",
  describir_serie: "Describir una serie",
  obtener_serie: "Obtener los datos de una serie",
  citar: "Citar una serie",
  listar_periodos: "Listar períodos (gobiernos, ministros, planes, regímenes)",
  periodo_en_fecha: "Qué regía en una fecha",
  comparar_series: "Comparar series (a la frecuencia común)",
  especificacion_grafico: "Gráfico de una o varias series (Vega-Lite y enlace al explorador)",
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
    "Pasa a trimestral o anual con la agregación que fija la serie, que no se elige: por ejemplo, el IPC y el tipo de " +
    "cambio, en promedio; las exportaciones, en suma; las reservas y la base monetaria de fin de mes, a fin de período. Solo agrega " +
    "períodos completos. En una serie de saldo, `frecuencia: anual` da el valor de fin de año, no el promedio: para el " +
    "promedio anual de las reservas, pedí la serie mensual y aclará que el promedio lo calculaste vos.",
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
    "actuales. Solo se usa en las variantes en moneda de cada época (por ejemplo, la `moneda-de-epoca` del tipo de " +
    "cambio), y ahí hace falta para variaciones, base 100 o cambio de frecuencia. La variante por defecto del tipo de " +
    "cambio ya está en pesos actuales: no lo necesita.",
  medida:
    "real: a precios constantes, deflactada con el IPC · en_dolares: dividida por el tipo de cambio oficial · " +
    "pct_pib: en % del PIB del mismo período (el PIB lo elige `denominador`); la serie tiene que estar en frecuencia " +
    "anual o trimestral (en los stocks, solo anual) o pasarse a ella con `frecuencia`. Solo valen las que admite la " +
    "variante (ver describir_serie).",
  denominador:
    "Solo con medida pct_pib: qué PIB divide. cada-base (por defecto): el publicado en cada base, como en los " +
    "cuadros de la bibliografía; salta en 2004 por el cambio de base · retropolado: llevado hacia atrás desde la " +
    "base 2004, sin saltos (antes de 2004 da un PIB unos 8 % mayor) · banco-mundial: el PIB en dólares del Banco " +
    "Mundial, solo en las series en dólares (en 1971–1981 y 2012–2015 no usa el tipo de cambio oficial).",
  deflactor: "Solo con medida real: la variante del IPC («ipc.oficial», por defecto, o «ipc.provincias»).",
  baseReal:
    "Solo con medida real: precios de qué período (AAAA-MM o AAAA). Por defecto, el último con dato en la serie y en el " +
    "IPC, que cambia con cada actualización de datos: para citar una cifra, conviene fijarlo.",
  paises:
    "Solo en las series internacionales: códigos ISO3 o de agregados del Banco Mundial (por ejemplo, [\"ARG\", " +
    "\"BRA\", \"WLD\"]). Si se omite, la selección inicial de la serie.",
  formato: "texto, apa o bibtex. Si se omite, devuelve los tres.",
  transformacionCita: "La transformación que se usó con obtener_serie, si hubo alguna.",
  frecuenciaCita: "La frecuencia que se pidió a obtener_serie, si se cambió.",
  comoEnObtener: "El mismo valor que se pasó a obtener_serie, si se usó.",
  tipoPeriodo:
    "gobierno · ministro (de Economía o Hacienda) · plan (de estabilización) · regimen_cambiario · catedra (etapas de " +
    "la política económica según la periodización de un curso universitario) · episodio (por ejemplo, la " +
    "hiperinflación de 1989–1990, con sus fases). Si se omite, todos.",
  porMandato: "true separa los gobiernos de dos mandatos (Menem 1989 y 1995, Fernández de Kirchner 2007 y 2011). Solo para gobiernos.",
  fechaPeriodo: "AAAA-MM-DD para un día (por ejemplo, «1989-07-08») o AAAA-MM para un mes («2001-12»). Desde 1970.",
  series:
    "De 1 a 4 series, cada una un objeto con `id` y, si hacen falta, los parámetros de obtener_serie (variante, " +
    "transformacion, frecuencia, medida, deflactor, denominador, pesos_actuales, base, paises), sin `desde` ni `hasta`. " +
    "Ejemplo: [{\"id\": \"ipc\", \"transformacion\": \"var_interanual\"}, {\"id\": \"pib\"}]. Una serie internacional como máximo.",
  seriesGrafico:
    "De 1 a 4 series, como en comparar_series: cada una con `id` y sus parámetros de obtener_serie (salvo `base_real`), " +
    "sin `desde` ni `hasta`. Una serie internacional como máximo.",
  desdeComun: "Inicio del período, inclusive (AAAA o AAAA-MM), para todas las series. Si se omite, desde el primer dato.",
  hastaComun: "Fin del período, inclusive (AAAA o AAAA-MM), para todas las series. Si se omite, hasta el último dato.",
  alinear:
    "frecuencia_comun (por defecto): todas las series a la frecuencia más baja del conjunto, en una tabla · ninguna: " +
    "cada serie en su frecuencia.",
  sombreado:
    "Sombrea los períodos de un tipo: gobierno, mandato (los gobiernos de dos mandatos, separados), ministro (de Economía), " +
    "plan (de estabilización), regimen_cambiario o catedra (etapas según la periodización de un curso universitario).",
  eventos:
    "true marca todos los eventos y los episodios (como la hiperinflación de 1989–1990); una lista marca solo esas " +
    "categorías (por ejemplo, [\"cambiario\", \"deuda\"]; \"episodio\" para los episodios).",
  ejes:
    "auto (por defecto): con dos unidades, doble eje · paneles: un panel por unidad, también con dos unidades.",
} as const;
