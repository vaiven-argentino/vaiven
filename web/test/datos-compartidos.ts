// Para las pruebas que leen los datos de cada capa: la especificación pone los datos que usan varias capas en
// `datasets`, con nombre (M11, 4e). Esto los vuelve a poner en cada capa, como `values`, sin cambiar nada más.
export function conDatos<T>(spec: T): T {
  const datasets = (spec as { datasets?: Record<string, unknown[]> }).datasets ?? {};
  const recorrer = (nodo: unknown): unknown => {
    if (Array.isArray(nodo)) return nodo.map(recorrer);
    if (!nodo || typeof nodo !== "object") return nodo;
    return Object.fromEntries(Object.entries(nodo).map(([k, v]) => {
      const nombre = k === "data" && v && typeof v === "object" ? (v as { name?: string }).name : undefined;
      return [k, nombre && datasets[nombre] ? { values: datasets[nombre] } : recorrer(v)];
    }));
  };
  return recorrer(spec) as T;
}
