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

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Salida autocontenida: la imagen de produccion no arrastra node_modules.
  output: 'standalone',

  ...(prefijo ? { basePath: prefijo } : {}),

  experimental: {
    /**
     * Cuánto puede pesar el cuerpo de una acción de servidor. Ya no es el techo
     * de la plataforma, y ese cambio es el que hay que entender antes de tocar
     * este número.
     *
     * Las subidas del panel iban por la acción `subirArchivo`, y ahí este valor
     * SÍ era el techo real: Next descarta el cuerpo que se pasa **antes** de
     * invocar la acción, de modo que el `try/catch` de `accion()` no llega a
     * ejecutarse y la pantalla se queda muda. Por eso el panel pudo prometer
     * 50 MB mientras el marco cortaba en 8 sin decir una palabra.
     *
     * Un vídeo de quirófano son 20 MB para arriba, y eso no se arregla subiendo
     * este número: una acción recibe el cuerpo ya reunido, así que el archivo
     * entero se queda en la memoria del servidor durante toda la subida —por un
     * túnel doméstico, minutos—. El camino de las subidas es ahora un manejador
     * de ruta, `src/app/(frontend)/api/subidas/[coleccion]/route.ts`, que no
     * lleva este límite y escribe a disco según recibe. El porqué completo está
     * en `src/admin/subidas.ts`.
     *
     * Entonces, ¿por qué sube esto de 8 a 52 MB si ya no es el camino? Porque
     * todavía queda un consumidor: `src/components/admin/formulario/Campos.tsx`
     * sigue insertando archivos dentro de un bloque con la acción vieja, y ese
     * formulario pregunta el peso contra `subida.maximoBytes`, que hoy son
     * 50 MB. Dejarlo en 8 convertía justo esa pantalla en el eslabón corto: el
     * navegador dejaría pasar un vídeo de 20 MB porque cabe en el techo
     * anunciado, y Next lo cortaría sin mensaje. O sea, el defecto de siempre
     * mudado de sitio.
     *
     * 52 y no 50 porque el cuerpo de una acción lleva además el formulario y su
     * codificación multiparte, así que un archivo de 50 MB justos no cabe en un
     * límite de 50. Los números de la cadena están declarados y explicados
     * juntos en `src/admin/esquema.ts` (`TECHO_DE_MEDIOS_BYTES`) y los compara
     * `tests/unit/subidaDeVideo.test.ts`, que lee este archivo.
     *
     * Este número se va el día que `Campos.tsx` suba por la ruta como ya sube
     * el listado de medios. Mientras siga aquí, una inserción de 50 MB desde el
     * editor de bloques se queda 50 MB en RAM, y eso es lo que se está pagando
     * por no haber movido todavía esa pantalla.
     */
    serverActions: { bodySizeLimit: '52mb' },

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
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
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
