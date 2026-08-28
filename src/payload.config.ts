import path from 'path'
import { fileURLToPath } from 'url'
import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { COLECCIONES } from '@/collections'
import { editorClinico } from '@/blocks'

const dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Configuración de la plataforma docente de traumatología.
 *
 * Los campos están marcados como localizables aunque hoy solo se redacte en
 * español (decisión D-012): añadir el inglés más adelante no exigirá rehacer
 * la estructura de datos ni migrar contenido.
 */
export default buildConfig({
  serverURL: process.env.NEXT_PUBLIC_SERVER_URL,
  secret: process.env.PAYLOAD_SECRET || '',
  admin: {
    user: 'usuarios',
    meta: {
      titleSuffix: ' · Plataforma de traumatología',
      description: 'Panel de administración de contenido docente.',
    },
  },
  collections: COLECCIONES,
  editor: editorClinico,
  localization: {
    locales: [
      { label: 'Español', code: 'es' },
      { label: 'English', code: 'en' },
    ],
    defaultLocale: 'es',
    fallback: true,
  },
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URI || '' },
  }),
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  graphQL: { disable: true },
  upload: {
    // Techo general de subida. Los modelos 3D tienen además su propio limite
    // de 5 MB, comprobado por firma del archivo (observación O-008).
    limits: { fileSize: 50 * 1024 * 1024 },
  },
  telemetry: false,
})
