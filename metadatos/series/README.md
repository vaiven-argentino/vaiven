# metadatos/series/

Un archivo `<slug>.yaml` por serie (por ejemplo, `ipc.yaml`), con el formato de la SPEC, sección 2.3.

Una variante puede declarar su propia lista de `transformaciones`, que reemplaza la de la serie. Por ejemplo, `tc-oficial.moneda-de-epoca` declara una lista vacía porque las variaciones cruzarían los cambios de signo monetario.

`nombre_corto` (desde la 4e, esquema 1.4) es el nombre que se usa en los gráficos de varias series: las etiquetas de las líneas, la leyenda, los títulos de los paneles y de los ejes y los avisos («IPC», «Reservas», «Dólar oficial»). Una variante puede declarar el suyo cuando no es la de por defecto o cuando hay que distinguirla («IPC provincias», «Resultado primario»); si no, usa el de la serie.

**Se llenó en:** fase 1 (series piloto), fase 4 (resto de las A e internacionales) y fase 5 (las B).
