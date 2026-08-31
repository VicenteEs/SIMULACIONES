import path from 'path'
import { fileURLToPath } from 'url'
import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import sharp from 'sharp'
import { es } from '@payloadcms/translations/languages/es'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
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
  // El panel se muestra en espanol: quien redacta es el traumatologo.
  i18n: { supportedLanguages: { es }, fallbackLanguage: 'es' },
  editor: editorClinico,
  localization: {
    locales: [
      { label: 'Español', code: 'es' },
      { label: 'English', code: 'en' },
    ],
    defaultLocale: 'es',
    fallback: true,
  },
  // Correo saliente. Sin esto, Payload escribe los mensajes en la consola en
  // lugar de enviarlos, y la recuperación de contraseña no llega a nadie.
  // Si no hay servidor configurado se deja el comportamiento de consola, para
  // que la aplicación arranque igual en desarrollo.
  email: process.env.SMTP_HOST
    ? nodemailerAdapter({
        defaultFromAddress: process.env.SMTP_DESDE || 'no-responder@localhost',
        defaultFromName: 'Plataforma de traumatología',
        transportOptions: {
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PUERTO || 587),
          // 465 exige TLS desde el saludo inicial; 587 lo negocia después.
          secure: Number(process.env.SMTP_PUERTO || 587) === 465,
          auth: {
            user: process.env.SMTP_USUARIO,
            pass: process.env.SMTP_CLAVE,
          },
        },
      })
    : undefined,
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URI || '' },
  }),
  // sharp genera las miniaturas de las imagenes subidas.
  sharp,
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  graphQL: { disable: true },
  upload: {
    // Techo general de subida. Los modelos 3D tienen además su propio limite
    // de 5 MB, comprobado por firma del archivo (observación O-008).
    limits: { fileSize: 50 * 1024 * 1024 },
  },
  telemetry: false,
})
