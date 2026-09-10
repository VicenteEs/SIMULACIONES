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
     */
    serverActions: { bodySizeLimit: '8mb' },
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
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // La plataforma no debe aparecer en buscadores mientras el acceso sea cerrado (D-020).
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ]
  },
}

export default withPayload(nextConfig)
