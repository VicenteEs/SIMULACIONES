import { withPayload } from '@payloadcms/next/withPayload'

/**
 * Prefijo bajo el que se sirve la aplicación.
 *
 * Vacío en desarrollo, `/traumahub` en el servidor, donde comparte dominio y
 * puerto con las demás páginas detrás del mismo proxy. Se fija al **compilar**
 * —Next.js lo incrusta en cada enlace y en cada recurso—, así que la imagen de
 * producción se construye con el prefijo que le toca a ese despliegue.
 *
 * Ver `src/lib/rutas.ts` para lo que Next no prefija solo.
 */
const prefijo = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/+$/, '')

/**
 * Si esta construcción es la de la imagen de Docker.
 *
 * `output: 'standalone'` deja en `.next/standalone` un `server.js` con solo los
 * `node_modules` que hacen falta, y eso es lo que copia la etapa final del
 * `Dockerfile`: sin ello la imagen tendría que arrastrar el `node_modules`
 * entero de la compilación. Solo la imagen lo usa.
 *
 * Estaba puesto para todos, y el servidor de Windows (`docs/SERVIDOR-WINDOWS.md`)
 * no arranca así: arranca con `next start` sobre el `.next` de siempre. `next
 * start` vuelve a leer este archivo al arrancar, ve `standalone` y avisa en cada
 * arranque de que esa no es la forma de lanzar esta construcción
 * (`node_modules/next/dist/server/next.js`). Funcionaba igual, y precisamente
 * por eso era dañino: un aviso que sale siempre y no significa nada enseña a no
 * leer el registro, y el día que diga algo que importa nadie lo va a mirar. De
 * paso, cada `npm run build` de Windows copiaba un árbol de `node_modules` que
 * nadie iba a usar.
 *
 * Por eso lo pide quien lo usa: el `Dockerfile` pone `SALIDA_AUTOCONTENIDA=1`
 * en la misma orden que compila, y en cualquier otro sitio la variable no
 * existe. No se decide por `NODE_ENV`, que es lo primero que se ocurre: `next
 * build` y `next start` lo dejan en `production` en las dos máquinas, así que
 * no distingue la una de la otra.
 *
 * Que la variable no llegue a la imagen no rompe el arranque del contenedor:
 * `node server.js` no vuelve a leer este archivo, usa la configuración que la
 * compilación dejó escrita dentro de `.next/standalone`. Donde se notaría es al
 * construir, y ahí el `Dockerfile` comprueba que `server.js` exista antes de
 * seguir, para que el olvido falle con su nombre y no como un `COPY` que no
 * encuentra un directorio.
 *
 * Solo vale `'1'`. Un `'true'` o un `'si'` quedan fuera a propósito: aceptar
 * cualquier cosa no vacía convierte `SALIDA_AUTOCONTENIDA=0` en un sí.
 */
const salidaAutocontenida = process.env.SALIDA_AUTOCONTENIDA === '1'

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(salidaAutocontenida ? { output: 'standalone' } : {}),

  ...(prefijo ? { basePath: prefijo } : {}),

  experimental: {
    /**
     * Cuánto puede pesar el cuerpo de una acción de servidor. Mide un documento
     * en JSON, no un archivo, y hay que entender por qué antes de tocarlo.
     *
     * Las subidas del panel iban por la acción `subirArchivo`, y ahí este valor
     * era el techo real: Next descarta el cuerpo que se pasa **antes** de
     * invocar la acción, de modo que el `try/catch` de `accion()` no llega a
     * ejecutarse y la pantalla se queda muda. Así fue como el panel prometió
     * 50 MB mientras el marco cortaba en 8 sin decir una palabra. Y subirlo no
     * lo arreglaba: una acción recibe el cuerpo ya reunido, de modo que el
     * archivo entero se queda en la memoria del servidor durante toda la
     * subida —por un túnel doméstico, minutos—.
     *
     * Hoy no sube ningún archivo por una acción. Las dos pantallas que suben
     * —el listado de medios (`TablaDocumentos.tsx`) y el selector de archivo de
     * un bloque (`formulario/Campos.tsx`)— van por la ruta
     * `src/app/(frontend)/api/subidas/[coleccion]/route.ts`, que no lleva este
     * límite y escribe a disco según recibe. El porqué completo, en
     * `src/admin/subidas.ts`. Este número estuvo en 52 MB mientras el selector
     * de los bloques seguía por la acción vieja, y eso significaba que cualquier
     * cuerpo de hasta 52 MB —de quien fuera, a cualquier acción— se aceptaba y
     * se retenía entero en RAM.
     *
     * Lo que queda es la acción más grande que no es una subida:
     * `guardarDocumento`, que manda la ficha entera con sus bloques y su texto
     * rico en el árbol de Lexical. Medido con la conversión real
     * (`haciaLexical`), una ficha de 48.000 palabras —40 bloques de texto de
     * 1.200 palabras, con negritas cada pocas— ocupa 1 MB, y eso ya es un libro.
     * Una ficha de verdad son unos pocos miles de palabras y unos cien
     * kilobytes. `guardarInstancia` del atlas, con sus 2.500 piezas como tope
     * (`MAXIMO_PIEZAS`), no pasa de unos cientos. De ahí 4 MB: cuatro veces esa
     * ficha exagerada, para que nadie tope con el corte mudo escribiendo, y
     * trece veces menos que lo que podía quedarse retenido antes.
     *
     * El 1 MB por omisión de Next no vale, y no por poco: esa misma ficha de
     * libro lo pasa, y el síntoma sería el de siempre —Guardar no hace nada y no
     * dice nada—, que es el peor sitio donde encontrarlo.
     *
     * Si algún día vuelve a hacer falta subirlo por encima del techo de los
     * medios, la pregunta no es el número sino qué acción ha empezado a mandar
     * un archivo, y la respuesta es moverla a la ruta. Lo vigila
     * `tests/unit/subidaDesdeElEditor.test.ts`.
     *
     * Por lo mismo, este número salió de la cadena de topes de las subidas
     * (`TECHO_DE_MEDIOS_BYTES` en `src/admin/esquema.ts` y la tabla de
     * `despliegue/paginas/LEEME.md`). Estaba en ella con 52 MB porque tenía que
     * ir por encima de los 50 del techo; con 4 MB, citado allí, haría creer a
     * quien opera el servidor que Next corta los vídeos en 4. Esa misma prueba
     * lee esos documentos y falla si dicen que hoy vale otra cosa o si lo
     * vuelven a meter en la cadena.
     */
    serverActions: { bodySizeLimit: '4mb' },

    /**
     * Enciende `src/app/global-not-found.tsx`.
     *
     * Con la bandera apagada, Next ni siquiera busca el archivo
     * (`node_modules/next/dist/build/entries.js`), así que la pantalla se
     * escribe, se prueba y queda inerte: una dirección que no casa con ninguna
     * ruta sigue cayendo en la pantalla en inglés del marco. Se escribió sin
     * esta línea, y la prueba que la acompañaba solo exigía que el comentario
     * del archivo *mencionara* la bandera —no que estuviera puesta—, de modo
     * que la suite salía verde sobre una pantalla que no se pinta nunca.
     * Eso está corregido en `tests/unit/paginaNoEncontrada.test.ts`, que ahora
     * lee esta configuración.
     */
    globalNotFound: true,
  },

  // Cabeceras de seguridad para toda la aplicación.
  async headers() {
    return [
      {
        // Los paquetes del atlas viajan comprimidos y los descomprime el
        // propio navegador. Sin esta cabecera llegarían como un archivo .gz
        // opaco y habría que descomprimirlos en JavaScript, que es más lento y
        // más código. El `basePath` se antepone solo al `source`.
        source: '/atlas/:archivo*.bin.gz',
        headers: [
          { key: 'Content-Encoding', value: 'gzip' },
          { key: 'Content-Type', value: 'application/octet-stream' },
          // Un año e inmutables. Lo que lo hace cierto no es el nombre del
          // archivo —«cuerpo-0.bin.gz» se repite entre versiones— sino que
          // `src/atlas/cargador.ts` los pide con `?v=` y la versión del
          // catálogo: si el atlas se regenera, la URL cambia. Revalidar 31 MB
          // en cada visita, por un túnel, sería absurdo.
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        // El catálogo, en cambio, se comprueba siempre. Es la pieza que decide
        // qué versión se pide, así que guardarlo un día dejaba una ventana en
        // la que un catálogo viejo podía encontrarse con geometría nueva.
        // Revalidar cuesta una petición condicional que casi siempre acaba en
        // 304 sin cuerpo.
        source: '/atlas/catalogo.json',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
      {
        // El descodificador de Draco: tres archivos que solo cambian cuando se
        // actualiza three, y que cada ficha con un modelo 3D volvía a pedir.
        // Next sirve `public/` con `max-age=0`, así que eran tres peticiones
        // condicionales por ficha —por un túnel doméstico, tres idas y vueltas
        // antes de poder abrir el modelo—. Una semana y no un año porque el
        // nombre no lleva versión: tras actualizar three, una semana es lo más
        // que un navegador tarda en enterarse, y el descodificador viejo sigue
        // leyendo los `.glb` de siempre.
        source: '/draco/:archivo*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=604800' }],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // DENY y no SAMEORIGIN. Bajo prefijo, «mismo origen» no es esta
          // plataforma: es el servidor entero, que sirve además APCE en `/`,
          // mi-web-latsib en `/equipo` y señales en `/senales`
          // (despliegue/paginas/LEEME.md). SAMEORIGIN le daba permiso de
          // enmarcado justo a los tres vecinos —despliegues aparte, que
          // `auto-update.sh` trae del remoto cada 30 minutos sin que nadie de
          // aquí mire qué entró— y no se lo negaba a nadie que importara. Uno
          // de ellos podía montar un marco invisible de
          // `/traumahub/admin-panel/usuarios` sobre un botón propio y
          // conseguir que el administrador pulsara «Eliminar» creyendo que
          // pulsaba otra cosa. La plataforma no se enmarca a sí misma: no hay
          // un solo `iframe` en `src/`, así que DENY no le quita nada.
          { key: 'X-Frame-Options', value: 'DENY' },
          // Lo mismo para los navegadores que ya ignoran `X-Frame-Options`.
          // CSP mínima y a propósito: una completa, con `script-src`, obliga a
          // manejar los nonces que Next incrusta en cada página del App Router,
          // y eso es una tarea aparte. `frame-ancestors` no los necesita.
          //
          // Las otras tres tampoco los necesitan, y cada una cierra un camino
          // que una inyección de HTML —sin llegar a guion— dejaba abierto:
          // `base-uri` impide un `<base href>` que mande cada enlace y cada
          // `fetch` relativo a otro servidor; `form-action`, un `<form>` que se
          // lleve la contraseña escrita en `/entrar`; `object-src`, los
          // `<object>` y `<embed>`, que ejecutan sin ser `<script>`. La
          // plataforma no usa ninguna de las tres cosas. Es `'self'` y no
          // `'none'` en `form-action` porque las acciones de servidor sin
          // JavaScript son formularios contra este mismo origen.
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
          },
          // Una ventana abierta desde otra página no conserva referencia a esta,
          // ni al revés. Nada aquí abre ventanas con las que después hable.
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // La plataforma no debe aparecer en buscadores mientras el acceso sea cerrado (D-020).
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          // Un año de HTTPS obligatorio. Sin esta cabecera, quien teclea el
          // nombre del servidor sin «https://» hace la primera petición en
          // claro; con el túnel de Cloudflare el borde la atiende (la zona
          // responde en 80 salvo que se active «Always Use HTTPS»), la pantalla
          // de `/entrar` se pinta sin cifrar y la contraseña se escribe ahí. Y
          // encima no deja entrar: la cookie de sesión sale con `Secure`
          // (`acciones/sesion.ts`) y el navegador descarta una cookie `Secure`
          // servida por http, así que el residente vuelve al formulario sin
          // mensaje y entrega la contraseña una segunda vez por el mismo canal.
          //
          // Sin `includeSubDomains` ni `preload`: el nombre se comparte con las
          // otras páginas del servidor y esto ya las obliga a ellas también.
          // Hoy todas entran por el mismo Funnel cifrado, pero es una decisión
          // que afecta a vecinos y no se toma a la ligera.
          //
          // Solo en producción: en desarrollo la plataforma vive en
          // `http://localhost` y la cabecera dejaría el navegador sin poder
          // abrirla hasta limpiar a mano el estado HSTS.
          ...(process.env.NODE_ENV === 'production'
            ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }]
            : []),
        ],
      },
    ]
  },
}

export default withPayload(nextConfig)
