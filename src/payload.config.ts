import path from 'path'
import { fileURLToPath } from 'url'
import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import sharp from 'sharp'
import { es } from '@payloadcms/translations/languages/es'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { COLECCIONES } from '@/collections'
import { origenDe } from '@/lib/rutas'
import { migrations } from './migrations'
import { editorClinico } from '@/blocks'

const dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Configuración de la plataforma docente de traumatología.
 *
 * Sobre los idiomas, y dicho como es. Aquí abajo se declaran dos —español e
 * inglés— pero **ningún campo de ninguna colección está marcado como
 * localizable**: un `grep` de `localized` en todo `src/` no devuelve un solo
 * resultado. Sin campos marcados, esta declaración no guarda ni una traducción.
 *
 * El comentario que había aquí decía lo contrario, y la decisión D-012 también:
 * que los campos quedaban traducibles desde el inicio y que añadir el inglés no
 * exigiría tocar la estructura de datos. No es cierto, y conviene saberlo antes
 * de prometérselo a nadie: habrá que marcar campo por campo y generar una
 * migración, porque Payload crea tablas `_locales` aparte.
 */
export default buildConfig({
  // Solo el ORIGEN, sin la ruta. Payload mete `serverURL` en su lista de CSRF
  // y la compara con la cabecera `Origin`, que nunca lleva ruta: dejarle el
  // prefijo hace que descarte la cookie de sesion en toda peticion que traiga
  // esa cabecera (observacion O-018).
  serverURL: origenDe(process.env.NEXT_PUBLIC_SERVER_URL || ''),

  // Sin el prefijo. Payload ya lo pone él.
  //
  // Aquí hubo un error que llegó a producción sin que nadie lo viera. Se
  // escribía `${PREFIJO}/api` creyendo que así las direcciones de los archivos
  // subidos saldrían con el prefijo, pero `formatAdminURL` —la función que las
  // arma— antepone por su cuenta `NEXT_BASE_PATH`, que `withPayload` rellena
  // con el `basePath` de Next al compilar. Resultado en el servidor:
  //
  //   https://servidor:10000/traumahub/traumahub/api/medios/file/foto.png
  //
  // es decir, un 404 en toda imagen, todo vídeo y todo modelo 3D de toda
  // ficha. No se notó porque el campo `url` es virtual y no queda escrito en
  // ninguna parte que se pueda mirar, y porque todavía no había casi nada
  // subido. La API REST sí funcionaba con el prefijo doblado, y eso ayudó a
  // esconderlo: su envoltorio construye la ruta entrante con la misma función,
  // de modo que el doblez aparecía a los dos lados de la comparación y se
  // cancelaba. Solo fallaba lo que resuelve el navegador de verdad.
  routes: { api: '/api' },
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
