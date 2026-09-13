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
    //
    // Lo que este párrafo no decía es quién pone entonces el esquema en su
    // sitio para las pruebas de integración, y la respuesta incómoda es que
    // hoy no lo pone nadie: bajo Vitest `NODE_ENV` vale `test`, así que no
    // corre ni el `push` ni `prodMigrations`, y no hay `pretest` en
    // `package.json`. Sobre una base recién creada —`npm run db:up` sin un
    // `npm run dev` detrás, que es el caso de quien clona el repositorio—
    // `npx vitest run` revienta con `relation "segmentos" does not exist`, un
    // error que no menciona ni migraciones ni `push` y manda a buscar muy
    // lejos. El esquema lo está poniendo, por accidente, el `npm run dev` de
    // ayer. Mientras no haya un `pretest`, el paso que falta es
    // `npm run db:migrate` antes de la suite.
    //
    // **Solo en desarrollo.** Estaba escrito como «distinto de test», que en el
    // servidor es verdadero, así que producción sincronizaba el esquema al
    // vuelo —lo contrario de lo que dice el párrafo de arriba— y dejaba escrita
    // una migración llamada `dev` en la tabla. A partir de ahí, cada arranque
    // veía esa marca y preguntaba por consola «ha corrido Payload en modo
    // desarrollo… ¿quiere aplicar las migraciones? (y/N)», y se quedaba
    // esperando. El servicio arrancaba, no servía una sola petición y no daba
    // ningún error: exactamente la misma trampa que D-056 describe para las
    // pruebas, y el mismo día en que se creyó cerrada.
    push: process.env.NODE_ENV === 'development',
    prodMigrations: migrations,
  }),
  // sharp genera las miniaturas de las imagenes subidas.
  sharp,
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  graphQL: { disable: true },
  upload: {
    // Techo de subida de la API REST, y solo de ella. Esto no es el techo de la
    // plataforma, por mucho que lo parezca: `limits` lo consume únicamente el
    // analizador multiparte de Payload (`addDataAndFileToRequest`), y el panel
    // no sube por ahí, sube con la acción de servidor `subirArchivo`, que
    // entrega el archivo ya leído a `payload.create({ file })`. Por esa vía
    // manda el `serverActions.bodySizeLimit` de `next.config.mjs` y este número
    // no se ejerce jamás.
    //
    // Decía 50 MB y el panel anunciaba 50 MB, mientras Next cortaba en 8 y sin
    // mensaje. Ahora dice 7 MB, que es lo que el panel promete
    // (`src/admin/esquema.ts`) y lo que de verdad cabe en un cuerpo de 8 MB con
    // su sobre multiparte. Los tres números se mueven juntos.
    //
    // Los modelos 3D tienen además su propio límite de 5 MB, comprobado por
    // firma del archivo (observación O-008).
    limits: { fileSize: 7 * 1024 * 1024 },
    // Sin esto el analizador NO rechaza: su valor por omisión es
    // `abortOnLimit: false`, que deja de acumular bytes, marca el archivo como
    // `truncated` —bandera que Payload escribe y nadie lee— y responde 201. El
    // registro queda creado y el archivo, cortado en seco: un vídeo que se
    // reproduce hasta la mitad, sin un error en ninguna parte. Truncar en
    // silencio es peor que no tener límite.
    abortOnLimit: true,
    responseOnLimit: 'El archivo supera el máximo permitido (7 MB).',
  },
  telemetry: false,
})
