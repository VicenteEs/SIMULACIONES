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
     * Cuánto puede pesar lo que se sube desde el panel.
     *
     * Los archivos se suben con una acción de servidor (`subirArchivo`), y Next
     * limita el cuerpo de una acción a **1 MB** por omisión. La colección de
     * modelos 3D anuncia un techo de 5 MB y la validación lo comprueba, pero
     * ninguno de los dos se llegaba a ejercer: el archivo se cortaba antes, en
     * el marco, y el traumatólogo veía un fallo genérico de acción sin una
     * palabra sobre el peso. El único modelo que había pesaba 76 KB, y por eso
     * nadie tropezó.
     *
     * Se pone en 8 MB y no en 5: el cuerpo de la petición lleva además el
     * formulario y la codificación, así que un archivo de 5 MB justos no cabe
     * en un límite de 5 MB. Quien decide el techo real sigue siendo
     * `src/uploads/validarModelo3D.ts`, que rechaza con un mensaje que se
     * entiende. Este número solo tiene que ser mayor.
     *
     * Y no es solo el techo de los `.glb`: es el de **toda** la plataforma,
     * porque `subirArchivo` es la única vía de subida del panel y por ella pasa
     * también `medios`, que acepta vídeo. Ese razonamiento faltaba aquí y el
     * panel llegó a prometer 50 MB —el `upload.limits` de `payload.config.ts`,
     * que en esta vía no se ejerce jamás—. Hoy los tres números dicen lo mismo:
     * 7 MB anunciados en `src/admin/esquema.ts`, 7 MB en `upload.limits` para
     * quien entre por la API REST, y estos 8 MB de cuerpo, que van por encima
     * para que quepa el sobre multiparte. Se mueven juntos: separarlos no da
     * ningún error visible, porque Next corta el cuerpo **antes** de invocar la
     * acción, el `try/catch` de `accion()` no llega a ejecutarse y la pantalla
     * se queda muda.
     *
     * Que quepa un vídeo de quirófano de verdad —20 MB para arriba— no se
     * arregla subiendo este número: una acción de servidor retiene el cuerpo
     * entero en memoria. Eso pide un route handler que reciba en flujo, y es
     * una decisión aparte que hay que dejar escrita en BITACORA.
     */
    serverActions: { bodySizeLimit: '8mb' },

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
