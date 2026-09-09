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
          // El atlas no cambia nunca: si cambia, cambia su versión y con ella
          // el nombre. Revalidar 31 MB en cada visita por un túnel sería
          // absurdo.
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/atlas/catalogo.json',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }],
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
