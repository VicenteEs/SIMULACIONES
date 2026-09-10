import path from 'path'
import { fileURLToPath } from 'url'
import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import sharp from 'sharp'
import { es } from '@payloadcms/translations/languages/es'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { COLECCIONES } from '@/collections'
import { origenDe, PREFIJO } from '@/lib/rutas'
import { migrations } from './migrations'
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
  // Solo el ORIGEN, sin la ruta. Payload mete `serverURL` en su lista de CSRF
  // y la compara con la cabecera `Origin`, que nunca lleva ruta: dejarle el
  // prefijo hace que descarte la cookie de sesion en toda peticion que traiga
  // esa cabecera (observacion O-018).
  serverURL: origenDe(process.env.NEXT_PUBLIC_SERVER_URL || ''),

  // El prefijo va aqui. Es lo que Payload antepone al construir las URLs
  // absolutas de los archivos subidos, que de otro modo saldrian sin el y
  // apuntarian a otra pagina del mismo servidor.
  routes: { api: `${PREFIJO}/api` },
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
    // En producción el esquema NO se sincroniza solo: la imagen arranca y
    // aplica las migraciones pendientes de `src/migrations`. Sin esto, un
    // despliegue nuevo levanta la aplicación contra una base sin una sola
    // tabla, que fue exactamente lo que pasó la primera vez en el servidor.
    //
    // En desarrollo sigue mandando el `push` de Drizzle, que es lo cómodo
    // mientras el modelo de contenido se mueve todos los días. Cada cambio de
    // esquema hay que congelarlo después con:
    //     npx payload migrate:create <nombre>
    //
    // Durante las pruebas, nunca. El `push` de Drizzle, cuando detecta que
    // podría perder datos, **pregunta** —«Accept warnings and push schema?
    // (y/N)»— y se queda esperando. Una suite que espera una respuesta que
    // nadie va a dar no falla: se cuelga, en el portátil y en integración
    // continua. Además, las pruebas no tienen por qué reescribir el esquema de
    // la base con la que uno está desarrollando.
    push: process.env.NODE_ENV !== 'test',
    prodMigrations: migrations,
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
