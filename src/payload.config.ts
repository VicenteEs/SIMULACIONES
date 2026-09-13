import path from 'path'
import { fileURLToPath } from 'url'
import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import sharp from 'sharp'
import { es } from '@payloadcms/translations/languages/es'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { COLECCIONES } from '@/collections'
import { TECHO_DE_MEDIOS_BYTES, TECHO_DE_MODELOS_3D_BYTES } from '@/admin/esquema'
import { origenDe } from '@/lib/rutas'
import { migrations } from './migrations'
import { editorClinico } from '@/blocks'

const dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * El techo de subida sale del panel, que es donde estaba decidido.
 *
 * Aquí había un número escrito a mano y un comentario pidiendo que los tres se
 * movieran juntos; pedirlo no es atarlo. Las dos cifras viven en
 * `src/admin/esquema.ts`, declaradas la una al lado de la otra y con el porqué
 * de que sean dos, junto a las frases que el traumatólogo lee antes de elegir
 * el archivo —y esas sí están atadas por `tests/unit/esquema.test.ts`, porque
 * la última vez que se separaron el panel prometió 50 MB mientras el marco
 * cortaba en 8 sin decir nada—. Tomándolas de allá, esta configuración entra en
 * la misma cuerda en lugar de ser un número más que nadie compara.
 *
 * La dirección del `import` importa y no es reversible: el esquema del panel lo
 * carga también el formulario, o sea el navegador, y por eso no puede importar
 * nada de servidor. Al revés —servidor pidiéndole una constante a un módulo que
 * ya es seguro en el navegador— no arrastra nada a ningún paquete.
 *
 * Se toma **el mayor** con `Math.max` y no el de `medios` a dedo, aunque hoy
 * sean lo mismo: `upload.limits` es uno solo para todas las colecciones, así
 * que tiene que ser el techo más alto o la colección más generosa quedaría
 * cortada por el límite de la otra. Escrito así, una tercera colección de
 * archivo con un techo mayor entra sola; escrito a dedo, entraría rota. Los
 * 5 MB de los modelos los sigue haciendo cumplir
 * `src/uploads/validarModelo3D.ts`, por firma del archivo y por colección.
 */
const TECHO_DE_SUBIDA_BYTES = Math.max(TECHO_DE_MEDIOS_BYTES, TECHO_DE_MODELOS_3D_BYTES)

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

  // La cookie de sesión se llama `traumahub-token`, y no el `payload-token`
  // que Payload pone por omisión.
  //
  // No es cosmético: es la única salida al choque de cookies que describe
  // `acciones/sesion.ts`. En el servidor la plataforma comparte esquema,
  // dominio y puerto con otras páginas detrás del mismo proxy, así que el
  // testigo se acota a `/traumahub`; pero las sesiones anteriores a 66bdc2d
  // dejaron uno con `path: '/'` que sigue vivo hasta caducar, y es **ese** el
  // que manda —el navegador manda primero la del path más específico (RFC 6265
  // §5.4) y `parseCookies` de Payload arma un Map quedándose con la última—.
  // Mientras las dos se llamen igual, la del prefijo no se lee nunca y pasan
  // dos cosas que no se ven:
  //
  //  - quien entra con OTRA cuenta queda autenticado como el usuario anterior,
  //    que en una estación compartida de hospital es una anotación firmada por
  //    quien no la hizo;
  //  - si el testigo viejo deja de verificar sin morirse su cookie —rotar
  //    `PAYLOAD_SECRET`—, entrar responde «éxito» sobre una plataforma cerrada.
  //
  // Con otro nombre, la vieja se vuelve invisible para Payload y se muere sola
  // sin estorbar a nadie. El precio se paga una vez: al desplegar esto, las
  // sesiones abiertas dejan de valer y hay que volver a entrar.
  //
  // Nadie escribe este nombre a mano: `nombreDeLaCookieDeSesion()` se lo
  // pregunta a esta configuración y `tests/unit/cookieDeSesion.test.ts` vigila
  // que siga siendo así. Y nada vuelve a crear el choque después, porque
  // `POST /api/usuarios/login` —que escribe siempre con `path: '/'`, sin mirar
  // esto— está cerrado en `(payload)/api/[...slug]/route.ts`.
  cookiePrefix: 'traumahub',

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
    // no sube por ahí. Sube por
    // `src/app/(frontend)/api/subidas/[coleccion]/route.ts`, que recibe el
    // archivo en flujo, lo cuenta él mismo contra el techo de la colección y se
    // lo entrega a Payload con `filePath`; por ese camino este número no se
    // ejerce nunca. Y por el que queda de la acción vieja —`Campos.tsx`— manda
    // el `serverActions.bodySizeLimit` de `next.config.mjs`, que tampoco es
    // este.
    //
    // Decía 50 MB y el panel anunciaba 50 MB, mientras Next cortaba en 8 y sin
    // mensaje. Ahora la cifra sale del mismo sitio que la del panel: ver
    // `TECHO_DE_SUBIDA_BYTES` arriba.
    //
    // Y desde que `(payload)/api/[...slug]/route.ts` cerró las escrituras de la
    // API REST, este límite no llega a ejercerse por ningún camino: el `POST`
    // contesta 403 antes de que el analizador multiparte vea un byte. Se
    // conserva puesto, y no vacío, para el día que se reabra un extremo
    // concreto de esa API —que es lo que aquel archivo deja previsto—: un techo
    // ausente vale por «sin límite», y reabrir sin él sería el agujero de
    // verdad.
    //
    // Los modelos 3D tienen además su propio límite de 5 MB, comprobado por
    // firma del archivo (observación O-008).
    limits: { fileSize: TECHO_DE_SUBIDA_BYTES },
    // Sin esto el analizador NO rechaza: su valor por omisión es
    // `abortOnLimit: false`, que deja de acumular bytes, marca el archivo como
    // `truncated` —bandera que Payload escribe y nadie lee— y responde 201. El
    // registro queda creado y el archivo, cortado en seco: un vídeo que se
    // reproduce hasta la mitad, sin un error en ninguna parte. Truncar en
    // silencio es peor que no tener límite.
    abortOnLimit: true,
    // Compuesto con la misma cifra: un mensaje que anuncia un techo distinto
    // del que se aplica manda a redimensionar el archivo a un tamaño que
    // tampoco va a entrar.
    responseOnLimit: `El archivo supera el máximo permitido (${Math.round(
      TECHO_DE_SUBIDA_BYTES / (1024 * 1024),
    )} MB).`,
  },
  telemetry: false,
})
