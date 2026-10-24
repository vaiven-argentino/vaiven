// Textos que lee el modelo: instrucciones del servidor y descripciones de herramientas y parámetros (SPEC 7.3:
// en español, pensadas para que elija bien qué herramienta usar). Se aprobaron en el plan de la fase 3.

export const INSTRUCCIONES =
  "Vaivén es una base curada de series económicas argentinas desde 1970, con sus quiebres metodológicos, variantes y " +
  "fuentes. Flujo sugerido: buscar_series para encontrar el id → describir_serie para entender variantes y quiebres → " +
  "obtener_serie para los datos → citar. Al usar datos, mencioná las advertencias que trae la respuesta (cambios de " +
  "metodología, intervención del INDEC, datos excluidos) y citá la fuente con la cita que viene en la respuesta. Los " +
  "valores null son datos faltantes o excluidos: no los completes.";

export const DESCRIPCION = {
  buscar_series:
    "Busca series en el catálogo de Vaivén (series económicas argentinas desde 1970: precios, tipo de cambio, sector " +
    "externo, trabajo, etc.). Usala primero cuando no sepas el id exacto de una serie. Devuelve id, código, nombre, " +
    "bloque, frecuencia, cobertura y variantes, cada una con su estado (publicada, pendiente o pendiente de licencia). " +
    "Todos los filtros son opcionales; sin filtros, lista todas las series publicadas. `texto` no distingue tildes ni " +
    "mayúsculas (por ejemplo, «inflación», «dólar», «desempleo», «PRE-01»). `desde` y `hasta` (AAAA o AAAA-MM) dejan " +
    "solo las series con datos en ese período. Para los metadatos completos, usá describir_serie; para los datos, " +
    "obtener_serie.",
  describir_serie:
    "Devuelve los metadatos completos de una serie de Vaivén, sin los datos: definición, unidad, frecuencia, variantes " +
    "(método, tramos y fuentes de cada una, y estado si están pendientes), quiebres metodológicos con sus fechas, datos " +
    "excluidos, transformaciones disponibles, licencias, bibliografía y la cita sugerida. Usala antes de interpretar " +
    "una serie o de elegir variante y transformación, sobre todo si el período cruza un cambio de metodología (por " +
    "ejemplo, el IPC de 2007–2015 o el cambio de la EPH en 2003). `id`: id de la serie («ipc»), código («PRE-01») o id " +
    "de variante («ipc.provincias»).",
  obtener_serie:
    "Devuelve las observaciones de una serie de Vaivén, con transformaciones opcionales que calcula Vaivén " +
    "(variaciones, base 100 o cambio a una frecuencia más baja). Cada respuesta trae la unidad resultante, las " +
    "advertencias por quiebres metodológicos dentro del rango pedido, los datos excluidos, la versión de datos, las " +
    "fuentes y la cita: mencioná las advertencias cuando uses los datos. Las fechas van como AAAA-MM (en mensuales, " +
    "trimestrales y semestrales, el mes en que empieza el período) o AAAA (anuales). Un valor null es un dato faltante " +
    "o excluido: no lo interpoles. Si no sabés el id, usá buscar_series; para ver qué variantes y transformaciones " +
    "admite la serie, describir_serie. Límite: 10.000 observaciones por pedido.",
  citar:
    "Devuelve la cita sugerida de una serie de Vaivén, la misma que muestra su ficha en la web, con la versión de " +
    "datos y la URL de la variante. Formatos: texto, apa o bibtex; si no se indica, devuelve los tres. Si los datos se " +
    "transformaron con obtener_serie, pasá la misma `transformacion` y `frecuencia` para que la cita aclare que la " +
    "transformación la calcula Vaivén. Las respuestas de obtener_serie ya traen la cita en texto: usá esta herramienta " +
    "cuando necesites APA o BibTeX.",
} as const;

export const TITULO = {
  buscar_series: "Buscar series",
  describir_serie: "Describir una serie",
  obtener_serie: "Obtener los datos de una serie",
  citar: "Citar una serie",
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
    "acumulada_anio: desde diciembre del año anterior · base_100: índice con base en `base`. Solo valen las que " +
    "admite la variante.",
  base: "Solo con base_100: AAAA-MM (esa observación vale 100), AAAA (el promedio del año vale 100) o AAAA-MM/AAAA-MM (el promedio del período vale 100).",
  formato: "texto, apa o bibtex. Si se omite, devuelve los tres.",
  transformacionCita: "La transformación que se usó con obtener_serie, si hubo alguna.",
  frecuenciaCita: "La frecuencia que se pidió a obtener_serie, si se cambió.",
} as const;
