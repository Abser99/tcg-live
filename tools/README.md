# Vistas de desarrollo

Páginas para ver varias sesiones del live a la vez (vendedor y compradores lado a
lado), útiles para probar pujas sin necesitar dos computadoras.

| Archivo | Muestra |
|---|---|
| `dual.html` | 1 vendedor + 1 cliente |
| `trio2.html` | 1 vendedor + 2 clientes |
| `triple.html` | vendedor (sesión propia del navegador) + 2 clientes |

## Cómo usarlas

Ábrelas directo desde el disco:

```bash
open tools/dual.html
```

Cada una acepta `?a=<auctionId>` para elegir la subasta; sin él usan una fija.

Si tu navegador bloquea los iframes `http://` dentro de una página `file://`,
sírvelas por HTTP:

```bash
npx serve tools
```

## Requisitos

Cada panel carga un proxy que siembra la sesión de un usuario distinto, para que
no dependan del inicio de sesión del navegador. Necesitas el backend, el
frontend y los proxies corriendo en los puertos que cada archivo referencia
(3100, 3200, 3400 según el caso).

## Por qué viven aquí y no en `web/public/`

Todo lo que está en `public/` se publica: en producción estas páginas existirían
como URLs reales cargando iframes al `localhost` del visitante. Son herramientas
internas, así que se quedan fuera de la carpeta que se despliega. Apuntan a URLs
absolutas de localhost, así que da igual desde qué origen se abran.
