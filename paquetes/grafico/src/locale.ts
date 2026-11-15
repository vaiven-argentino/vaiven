// El formato de Vega en español (números con punto de miles y coma decimal; meses y días en castellano). Lo usan la
// web y la interfaz del gráfico en Claude (4e, M3): son constantes, sin Vega.
export const LOCALE_NUMEROS = { decimal: ",", thousands: ".", grouping: [3], currency: ["$", ""] };
export const LOCALE_FECHAS = {
  dateTime: "%e de %B de %Y, %X", date: "%d/%m/%Y", time: "%H:%M:%S", periods: ["a. m.", "p. m."],
  days: ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"],
  shortDays: ["dom.", "lun.", "mar.", "mié.", "jue.", "vie.", "sáb."],
  months: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
  shortMonths: ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "sep.", "oct.", "nov.", "dic."],
};
