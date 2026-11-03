import { connect as abrirSocket, type Socket } from 'node:net'
import { resolve } from 'node:path'
import { connect as abrirSocketCifrado } from 'node:tls'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { exigirPanel } from '@/app/(frontend)/admin-panel/acceso'
import { tamanoLegible, type Respaldo } from '@/lib/respaldos'
import { espacioEnDisco, UMBRAL_DE_USO } from '@/lib/espacioEnDisco'
import {
  directorioDeRespaldos,
  hayPgDump,
  listarRespaldos,
  problemaDelDirectorio,
} from '@/lib/respaldosServidor'
import { clientePayload } from '../datos'
import { versionDelAtlas } from '@/app/(frontend)/acciones/atlas'
import { ruta } from '@/lib/rutas'
import { puertoDeCorreo } from '@/correo/enviar'
import { DIRECTORIO_DEL_ATLAS } from '@/lib/catalogoDelAtlas'
import { BotonCorreoDePrueba } from './BotonCorreoDePrueba'
import { BotonVolverAComprobar } from './BotonVolverAComprobar'
import { pesoDeCarpeta, type PesoDeCarpeta } from './espacio'
import './sistema.css'
import { Activity, Archive, CircleCheck, ExternalLink, TriangleAlert } from 'lucide-react'
import { CabeceraDePagina } from '@/components/admin/CabeceraDePagina'
import { BarrasHorizontales } from '@/components/admin/Graficos'
import { PlegarTodo } from '@/components/admin/PlegarTodo'
import { TarjetaDeGrafico } from '@/components/admin/tablero/TarjetaDeGrafico'
import { SeccionPlegable } from '@/components/ui/SeccionPlegable'
import { claseDeInsignia } from '@/lib/tonosDeEstado'

export const dynamic = 'force-dynamic'

/**
 * Estado del sistema.
 *
 * Es la página que se abre cuando algo va mal, así que está escrita para
 * responder rápido a «¿qué está roto?»: base, correo, respaldos y espacio. No
 * muestra secretos —ni la contraseña de la base ni el token de sesión—, solo si
 * están puestos, porque un panel que imprime credenciales las filtra a la
 * primera captura de pantalla compartida.
 */

interface Diagnostico {
  ok: boolean
  detalle: string
}

const duracion = (segundos: number): string => {
  const d = Math.floor(segundos / 86400)
  const h = Math.floor((segundos % 86400) / 3600)
  const m = Math.floor((segundos % 3600) / 60)
  if (d > 0) return `${d} d ${h} h`
  if (h > 0) return `${h} h ${m} min`
  return `${m} min`
}

/**
 * Versión y peso de PostgreSQL, si el adaptador deja llegar al pool.
 *
 * El peso viaja también en bytes (`bytes`), para la tarjeta del disco: antes
 * solo existía como el texto de `pg_size_pretty` («45 MB»), que no se puede
 * comparar con las carpetas. Y el texto se escribe ahora con `tamanoLegible`,
 * el de todas las demás cifras de la página, para que la misma base no salga
 * «45 MB» en una fila y «45,2 MB» en la tarjeta de al lado.
 */
async function estadoDeLaBase(payload: unknown): Promise<{ version: string; peso: string; bytes: number | null }> {
  const pool = (payload as { db?: { pool?: { query?: (sql: string) => Promise<unknown> } } }).db
    ?.pool
  if (!pool?.query) return { version: 'desconocida', peso: 'desconocido', bytes: null }

  const consultar = async (sql: string): Promise<string> => {
    const resultado = (await pool.query!(sql)) as { rows?: Array<Record<string, unknown>> }
    const fila = resultado.rows?.[0]
    return fila ? String(Object.values(fila)[0]) : '—'
  }

  try {
    const [version, peso] = await Promise.all([
      consultar('select version()'),
      // `bigint` llega de `pg` como texto, para no perder precisión; un peso
      // en bytes cabe de sobra en un `number`.
      consultar('select pg_database_size(current_database())'),
    ])
    const bytes = Number(peso)
    // «PostgreSQL 17.2 on x86_64-pc-linux-musl…» — basta con las dos primeras palabras.
    return {
      version: version.split(' ').slice(0, 2).join(' '),
      peso: Number.isFinite(bytes) ? tamanoLegible(bytes) : 'desconocido',
      bytes: Number.isFinite(bytes) ? bytes : null,
    }
  } catch {
    return { version: 'sin respuesta', peso: 'desconocido', bytes: null }
  }
}

/** Lo que se espera a que el servidor de correo salude antes de darlo por caído. */
const TOPE_DE_SALUDO_MS = 4000

/**
 * ¿Contesta el servidor de correo?
 *
 * Esta comprobación decía «ok» con solo mirar que `SMTP_HOST` estuviera puesto,
 * de modo que con el transporte roto la página que existe para responder «¿qué
 * está roto?» contestaba «todo en orden» —y es el único aviso que hay: el
 * adaptador de nodemailer verifica el transporte una sola vez al arrancar y, si
 * falla, se limita a un `console.error` y sigue (`email-nodemailer`,
 * `verifyTransport`). El administrador se entera cuando un residente le dice
 * que el correo de contraseña nueva no llegó.
 *
 * Se abre el zócalo y se lee el saludo, que es lo que hace cualquier cliente
 * SMTP antes de hablar. No se usa `transport.verify()` de nodemailer porque el
 * adaptador ya inicializado no expone el transporte —solo `sendEmail`— y
 * `nodemailer` no está en las dependencias de `package.json`: llega de rebote
 * bajo `@payloadcms/email-nodemailer`, e importarlo desde aquí crearía una
 * dependencia fantasma que deja de resolverse sin aviso el día que esa versión
 * cambie.
 *
 * Qué prueba y qué no, para que el detalle no prometa de más: prueba que el
 * nombre resuelve, que el puerto está abierto y que al otro lado hay un SMTP
 * vivo —los tres fallos habituales tras mover el servidor o cerrar un
 * cortafuegos—. No prueba las credenciales ni que el destinatario acepte el
 * mensaje; eso solo lo sabe un envío de verdad, y por eso el envío va aparte,
 * en el botón de la misma fila (`BotonCorreoDePrueba`): la página no manda
 * correo al cargarse, lo manda quien lo pide.
 */
async function correoResponde(host: string, puerto: number): Promise<Diagnostico> {
  const direccion = `${host}:${puerto}`
  // `SMTP_PUERTO=correo` da `NaN`, y `connect` lanza con eso: un error de
  // escritura en el entorno tumbaría entera la página que existe para
  // encontrarlo. Se dice cuál es el problema y no se abre nada.
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
    return { ok: false, detalle: `${host} — SMTP_PUERTO no es un puerto válido` }
  }
  return new Promise<Diagnostico>((resolver) => {
    // El 465 habla TLS desde el primer byte y el 587 empieza en claro y sube
    // con STARTTLS. Con el zócalo equivocado la conexión se abre y el saludo no
    // llega nunca, que desde aquí es indistinguible de un servidor colgado.
    // Anotado como `Socket` a propósito: `TLSSocket` lo extiende, y sin el tipo
    // común quedaría una unión sobre la que `once` no resuelve sus sobrecargas.
    const socket: Socket =
      puerto === 465
        ? abrirSocketCifrado({ host, port: puerto, servername: host })
        : abrirSocket({ host, port: puerto })

    let contestado = false
    const cerrar = (estado: Diagnostico) => {
      if (contestado) return
      contestado = true
      // Sin esto queda un zócalo abierto por cada carga de esta página.
      socket.destroy()
      resolver(estado)
    }

    socket.setTimeout(TOPE_DE_SALUDO_MS)
    socket.once('timeout', () =>
      cerrar({ ok: false, detalle: `${direccion} — no contesta en ${TOPE_DE_SALUDO_MS / 1000} s` }),
    )
    socket.once('error', (error: Error) =>
      cerrar({ ok: false, detalle: `${direccion} — ${error.message}` }),
    )
    socket.once('data', (trozo: Buffer) => {
      // El saludo de SMTP es «220 …» en la primera línea. Cualquier otro código
      // —un 421 de «demasiadas conexiones», por ejemplo— es un servidor que
      // está ahí y no va a aceptar el mensaje, y eso también hay que verlo.
      const saludo = trozo.toString('utf8').split('\r\n')[0].slice(0, 80)
      cerrar(
        saludo.startsWith('220')
          ? { ok: true, detalle: `${direccion} · ${saludo}` }
          : { ok: false, detalle: `${direccion} — contesta «${saludo}»` },
      )
    })
  })
}

export default async function PaginaSistema() {
  await exigirPanel('admin')

  let base: Diagnostico = { ok: false, detalle: 'sin respuesta' }
  let versionBase = 'desconocida'
  let pesoBase = 'desconocido'
  let bytesBase: number | null = null
  let usuarios = 0

  try {
    const payload = await clientePayload()
    const conteo = await payload.count({ collection: 'usuarios', overrideAccess: true })
    usuarios = conteo.totalDocs
    const info = await estadoDeLaBase(payload)
    versionBase = info.version
    pesoBase = info.peso
    bytesBase = info.bytes
    base = { ok: true, detalle: `${versionBase} · ${pesoBase}` }
  } catch (error) {
    base = { ok: false, detalle: error instanceof Error ? error.message : 'error desconocido' }
  }

  const servidorSmtp = process.env.SMTP_HOST
  // El mismo número con el que `src/payload.config.ts` arma el transporte. Si
  // aquí se calculara de otra manera, la página comprobaría un puerto y el
  // correo saldría por otro, que es la peor clase de diagnóstico: el que
  // tranquiliza sobre algo que no ha mirado. Por eso se pregunta a
  // `puertoDeCorreo`, que es también el que nombran los errores del envío.
  const puertoSmtp = puertoDeCorreo()

  // El remitente con el que sale de verdad, con los mismos respaldos que
  // `payload.config.ts`. Se enseña porque es el fallo que el saludo no ve y que
  // cPanel castiga: si no es la cuenta con la que se autentica, el servidor lo
  // rechaza o lo firma como suplantación. Solo nombre y dirección; ni la clave
  // ni si está puesta, que para eso está el botón de prueba.
  const direccionRemitente =
    process.env.SMTP_DESDE || process.env.SMTP_USUARIO || 'no-responder@localhost'
  const remitente = `${process.env.SMTP_NOMBRE || 'TraumaHub'} <${direccionRemitente}>`
  const desde = process.env.SMTP_DESDE?.trim().toLowerCase()
  const usuarioSmtp = process.env.SMTP_USUARIO?.trim().toLowerCase()
  const remitenteAjeno = Boolean(desde && usuarioSmtp && desde !== usuarioSmtp)

  // Lo que no se pudo leer del directorio de respaldos viaja aparte, con su
  // motivo, en vez de convertirse en una lista vacía: con la carpeta sin
  // permisos esta página decía «no hay ningún respaldo» mientras había once en
  // el disco (O-067).
  const [
    { lista: respaldos, fallo: respaldosIlegibles },
    problemaDeRespaldos,
    pgDump,
    atlas,
    disco,
    correo,
    medios,
    archivosDelAtlas,
  ] = await Promise.all([
    listarRespaldos().then(
      (lista) => ({ lista, fallo: null as string | null }),
      (error: unknown) => ({
        lista: [] as Respaldo[],
        fallo: error instanceof Error ? error.message : String(error),
      }),
    ),
    problemaDelDirectorio(),
    hayPgDump(),
    versionDelAtlas(),
    espacioEnDisco(),
    servidorSmtp
      ? correoResponde(servidorSmtp, puertoSmtp)
      : Promise.resolve<Diagnostico>({
          ok: false,
          detalle: 'sin servidor SMTP: la recuperación de contraseña no llega a destino',
        }),
    // La carpeta de `staticDir` de Medios, que contiene las de MediosPagina y
    // Modelos3D (`medios/pagina`, `medios/modelos`): se recorre una vez.
    pesoDeCarpeta(resolve(process.cwd(), 'medios')),
    pesoDeCarpeta(DIRECTORIO_DEL_ATLAS()),
  ])
  const ultimo = respaldos.find((r) => r.tipo === 'base')
  const bytesDeRespaldos = respaldos.reduce((t, r) => t + r.bytes, 0)

  const enProduccion = process.env.NODE_ENV === 'production'
  const urlPublica = process.env.NEXT_PUBLIC_SERVER_URL || '(sin definir)'
  const enHttps = urlPublica.startsWith('https://')
  // El navegador trata `localhost` y `127.0.0.1` como origen seguro y ahí sí
  // guarda una cookie `Secure`. Es la misma excepción que hace
  // `scripts/deploy.sh` antes de negarse a desplegar.
  const enOrigenLocal = /^http:\/\/(localhost|127\.0\.0\.1)([:/]|$)/.test(urlPublica)
  const laCookieLlega = enHttps || enOrigenLocal

  const comprobaciones: Array<{ titulo: string; estado: Diagnostico; complemento?: ReactNode }> = [
    { titulo: 'Base de datos', estado: base },
    {
      titulo: 'Respaldo reciente',
      estado: respaldosIlegibles
        ? { ok: false, detalle: `no se puede saber: ${respaldosIlegibles}` }
        : ultimo
          ? {
              ok: Date.now() - new Date(ultimo.creado).getTime() < 3 * 86_400_000,
              detalle: `${ultimo.nombre} · ${tamanoLegible(ultimo.bytes)}`,
            }
          : { ok: false, detalle: 'no hay ningún respaldo' },
      // Era una tarjeta de «Atajos» al pie de la página, lejos de la fila que
      // dice si hace falta ir. Aquí se va desde el problema.
      complemento: (
        <div className="sistema-prueba">
          <Link href="/admin-panel/respaldos" className="admin-btn admin-btn-secondary admin-btn-sm">
            <Archive aria-hidden size={14} />
            Ir a respaldos
          </Link>
        </div>
      ),
    },
    {
      // `pg_dump` presente no basta para respaldar desde el panel: también
      // hace falta poder escribir donde deja el archivo. Con la carpeta sin
      // permisos esta fila salía en verde y el botón fallaba igual (O-067).
      titulo: 'Herramienta de respaldo',
      estado: !pgDump
        ? { ok: false, detalle: 'pg_dump no está en este entorno' }
        : problemaDeRespaldos
          ? { ok: false, detalle: `pg_dump disponible, pero ${problemaDeRespaldos}` }
          : { ok: true, detalle: 'pg_dump disponible y el directorio de respaldos admite escritura' },
    },
    {
      // El atlas es un archivo estático que viaja aparte del código: si un
      // despliegue se lo deja, el taller anatómico abre vacío y sin explicar
      // por qué. Vale más verlo aquí.
      //
      // Y con qué arreglarlo. La instrucción de ejecutar el guion estaba en el
      // taller anatómico y se quitó de allí con razón: esa página la abre un
      // editor, que no tiene consola en el servidor ni puede desplegar nada.
      // Esta exige administrador (`exigirPanel('admin')`), que es quien sí.
      // Entre las dos cosas la instrucción se quedó sin estar en ninguna parte
      // de la interfaz.
      titulo: 'Atlas anatómico',
      estado: atlas.exito && atlas.datos
        ? { ok: true, detalle: `${atlas.datos.piezas} piezas · ${atlas.datos.version}` }
        : {
            ok: false,
            detalle:
              'no está instalado: falta public/atlas/catalogo.json. Ejecute «node scripts/atlas/preparar.mjs» en la máquina de trabajo, versione lo que deja en public/atlas/ y vuelva a desplegar.',
          },
    },
    // El saludo del servidor de correo, no la presencia de la variable: ver
    // `correoResponde`.
    //
    // Y debajo, las dos cosas que el saludo no puede probar. El saludo prueba
    // que hay servidor; la prueba de envío prueba que acepta la clave y el
    // remitente, que es donde falla una cuenta de cPanel recién configurada.
    // Una fila en verde con la clave mal copiada era exactamente el «todo en
    // orden» que esta página existe para no decir. El botón solo aparece con
    // `SMTP_HOST`: sin servidor no hay transporte que probar, y la acción
    // contestaría lo mismo que ya dice el detalle.
    {
      titulo: 'Correo saliente',
      estado: correo,
      complemento: servidorSmtp ? (
        <>
          <div className="sistema-remitente">
            Sale como {remitente}
            {remitenteAjeno
              ? ' — distinto de SMTP_USUARIO: cPanel lo rechaza o lo marca como suplantación si no es la misma cuenta'
              : ''}
          </div>
          <BotonCorreoDePrueba />
        </>
      ) : undefined,
    },
    {
      // Aquí ponía «sin HTTPS la cookie de sesión viaja sin cifrar», y es
      // falso: la cookie sale con `Secure` en cuanto `NODE_ENV` vale
      // `production` (`src/collections/Usuarios.ts`), y una cookie `Secure`
      // llegada por http el navegador la descarta. No es un problema de
      // confidencialidad sino de acceso: nadie entra. Y sin un solo error en
      // pantalla, porque la acción de servidor devolvió éxito. Quien leía la
      // frase anterior buscaba el fallo en la base, en el proxy o en la cuenta.
      // El mismo texto se corrigió ya en `scripts/deploy.sh`.
      titulo: 'Dirección pública',
      estado: {
        ok: laCookieLlega || !enProduccion,
        detalle: laCookieLlega
          ? urlPublica
          : enProduccion
            ? `${urlPublica} — la cookie de sesión sale con Secure y el navegador la descarta sobre http: nadie puede entrar, y el formulario no da ningún error`
            : `${urlPublica} — en desarrollo se entra igual, pero desplegado con esta dirección la cookie de sesión saldría con Secure y el navegador la descartaría: no entraría nadie`,
      },
    },
    {
      // Lo que la cabecera de esta página prometía desde el principio y no
      // miraba nadie. Cuando el disco se llena, el respaldo sale truncado y la
      // base deja de aceptar escrituras, las dos cosas sin avisar.
      titulo: 'Espacio en disco',
      estado: disco
        ? {
            ok: disco.usado < UMBRAL_DE_USO,
            detalle: `${tamanoLegible(disco.bytesLibres)} libres de ${tamanoLegible(
              disco.bytesTotales,
            )} · ${disco.usado}% usado`,
          }
        : { ok: true, detalle: 'no se puede consultar en este sistema de archivos' },
    },
    {
      titulo: 'Modo de ejecución',
      estado: {
        ok: true,
        detalle: enProduccion ? 'producción' : 'desarrollo (recarga en caliente)',
      },
    },
  ]

  const problemas = comprobaciones.filter((c) => !c.estado.ok).length
  const porRevisar = comprobaciones.filter((c) => !c.estado.ok).map((c) => c.titulo)
  // En el servidor y sin hidratar: es la hora en que se hicieron estas
  // comprobaciones, y «Volver a comprobar» la cambia al repetirlas.
  const comprobadoA = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

  // Lo que ocupa la plataforma, cada parte medida por su lado (P-007 E5,
  // D-238). Lo que no se pudo medir sale aparte y con su motivo: como barra a
  // cero diría «no ocupa nada», que es justo lo que no se sabe.
  const partes: Array<{ etiqueta: string; medida: PesoDeCarpeta | null; motivo: string }> = [
    {
      etiqueta: 'Base de datos',
      medida: bytesBase === null ? null : { bytes: bytesBase, archivos: 0, completo: true },
      motivo: 'PostgreSQL no dijo su tamaño',
    },
    { etiqueta: 'Archivos subidos', medida: medios, motivo: 'no se pudo recorrer la carpeta medios/' },
    { etiqueta: 'Atlas 3D', medida: archivosDelAtlas, motivo: 'no se pudo recorrer public/atlas/' },
    {
      etiqueta: 'Respaldos',
      medida: respaldosIlegibles ? null : { bytes: bytesDeRespaldos, archivos: respaldos.length, completo: true },
      motivo: 'no se pudo leer el directorio de respaldos',
    },
  ]
  const medidas = partes.filter((p) => p.medida !== null)
  const sinMedir = partes.filter((p) => p.medida === null)
  const discoLleno = disco !== null && disco.usado >= UMBRAL_DE_USO

  return (
    <div>
      <CabeceraDePagina
        titulo="Sistema"
        subtitulo={`Si la plataforma está sana y dónde corre · ${usuarios} cuenta${usuarios === 1 ? '' : 's'} registradas`}
        acciones={
          <>
            <a
              href={ruta('/api/salud')}
              className="admin-btn admin-btn-secondary"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Activity aria-hidden size={16} />
              Comprobación de salud
              <ExternalLink aria-hidden size={14} />
            </a>
            <BotonVolverAComprobar />
          </>
        }
      />

      <div className="tablero-fila sistema-cabecera">
        {/* El veredicto, grande, como en Penpot: es lo que se viene a buscar.
            Era un aviso de una línea encima de la tabla. Atención y no peligro
            cuando algo falla, por lo mismo que la insignia de cada fila:
            ninguna de estas comprobaciones impide usar la plataforma. */}
        <section
          className={`admin-card sistema-estado ${problemas === 0 ? 'sistema-estado-ok' : 'sistema-estado-atencion'}`}
          aria-label="Estado general"
        >
          <span className="sistema-estado-icono" aria-hidden>
            {problemas === 0 ? <CircleCheck size={28} /> : <TriangleAlert size={28} />}
          </span>
          <div className="sistema-estado-texto">
            <h2 className="sistema-estado-titulo">
              {problemas === 0
                ? 'Todo en orden'
                : `${problemas} comprobación${problemas === 1 ? '' : 'es'} requiere${problemas === 1 ? '' : 'n'} atención`}
            </h2>
            <p className="sistema-estado-detalle">
              {comprobaciones.length - problemas} de {comprobaciones.length} comprobaciones bien · comprobado a
              las {comprobadoA}
            </p>
            {problemas > 0 ? (
              <p className="sistema-estado-nota">
                Por revisar: {porRevisar.join(', ')}. Ninguna impide usar la plataforma, pero conviene resolverlas.
              </p>
            ) : null}
          </div>
        </section>

        <TarjetaDeGrafico titulo="Espacio en disco" bajada="El del disco donde corre la aplicación">
          {disco ? (
            <div className="sistema-disco">
              <div className="sistema-disco-cifra">
                <span className={`sistema-disco-uso${discoLleno ? ' admin-card-value-atencion' : ''}`}>
                  {disco.usado} %
                </span>
                <span className="sistema-disco-rotulo">en uso</span>
              </div>
              <div
                className={`admin-progreso sistema-disco-barra${discoLleno ? ' sistema-disco-lleno' : ''}`}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={disco.usado}
                aria-label="Parte del disco en uso"
              >
                <div className="admin-progreso-relleno" style={{ width: `${disco.usado}%` }} />
              </div>
              <p className="admin-card-note">
                {tamanoLegible(disco.bytesLibres)} libres de {tamanoLegible(disco.bytesTotales)}
                {discoLleno ? ` · pasa del ${UMBRAL_DE_USO} %, el umbral de aviso` : ''}
              </p>
            </div>
          ) : (
            // Lo mismo que dice la fila «Espacio en disco»: sin dato se calla,
            // no se inventa una tranquilidad.
            <p className="admin-card-note">Este sistema de archivos no deja consultar cuánto espacio queda.</p>
          )}

          <div>
            <h3 className="sistema-disco-subtitulo">Lo que ocupa la plataforma</h3>
            {medidas.length > 0 ? (
              <BarrasHorizontales
                titulo="Lo que ocupa cada parte de la plataforma"
                datos={medidas.map((p) => ({
                  // Con el tope de archivos alcanzado la cifra se queda corta,
                  // y la etiqueta lo dice en vez de darla por exacta.
                  etiqueta: p.medida?.completo === false ? `${p.etiqueta} (al menos)` : p.etiqueta,
                  valor: p.medida?.bytes ?? 0,
                }))}
                formato={tamanoLegible}
              />
            ) : null}
            {sinMedir.length > 0 ? (
              <ul className="sistema-sin-medir">
                {sinMedir.map((p) => (
                  <li key={p.etiqueta}>
                    {p.etiqueta}: no se pudo medir ({p.motivo}).
                  </li>
                ))}
              </ul>
            ) : null}
            {/* Penpot reparte el disco entero, con «Sistema» y «Libre» en la
                misma dona. Eso pide saber qué hay en cada rincón del disco, y
                la aplicación solo conoce lo suyo. Además, en el servidor la
                base y los archivos subidos viven en volúmenes de Docker y los
                respaldos en una carpeta montada: no tienen por qué estar en el
                disco del porcentaje, y sumarlos a él mentiría. */}
            <p className="admin-card-note sistema-disco-nota">
              Cada parte se mide por su lado. La base, los archivos subidos o los respaldos pueden estar en otro
              volumen que el del porcentaje de arriba.
            </p>
          </div>
        </TarjetaDeGrafico>
      </div>

      <PlegarTodo />

      <SeccionPlegable
        clave="sistema.comprobaciones"
        titulo="Comprobaciones"
        resumen={problemas === 0 ? `${comprobaciones.length} correctas` : `${problemas} por revisar`}
      >
      <div className="admin-table-container">
        <table className="admin-table tabla-apilable">
          <thead>
            <tr>
              <th>Comprobación</th>
              <th>Estado</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {comprobaciones.map((c) => (
              <tr key={c.titulo}>
                <th scope="row" className="admin-table-user-name">
                  {c.titulo}
                </th>
                <td data-etiqueta="Estado">
                  {/* Atención y no peligro: la cabecera lo dice, ninguna de
                      estas impide usar la plataforma. El rojo queda para lo
                      que sí la rompe, y aquí no hay nada así. */}
                  <span className={claseDeInsignia(c.estado.ok ? 'ok' : 'atencion')}>
                    {c.estado.ok ? (
                      <CircleCheck aria-hidden size={12} />
                    ) : (
                      <TriangleAlert aria-hidden size={12} />
                    )}
                    {c.estado.ok ? 'Correcto' : 'Revisar'}
                  </span>
                </td>
                <td className="sistema-detalle">
                  {c.estado.detalle}
                  {c.complemento}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </SeccionPlegable>

      <SeccionPlegable clave="sistema.entorno" titulo="Entorno" resumen="9 datos">
        {/* En baldosas, como en Penpot: es lo que se copia para pedir ayuda,
            y en dos columnas de 1.440 px los valores quedaban lejos de su
            nombre. Cada pareja va en su `div`, que el HTML permite dentro de
            un `dl` justo para esto. */}
        <dl className="sistema-entorno">
          <div>
            <dt>PostgreSQL</dt>
            <dd>{versionBase}</dd>
          </div>
          <div>
            <dt>Tamaño de la base</dt>
            <dd>{pesoBase}</dd>
          </div>
          <div>
            <dt>Node.js</dt>
            <dd>{process.version}</dd>
          </div>
          <div>
            <dt>Plataforma</dt>
            <dd>
              {process.platform} · {process.arch}
            </dd>
          </div>
          <div>
            <dt>En marcha desde hace</dt>
            <dd>{duracion(process.uptime())}</dd>
          </div>
          <div>
            <dt>Memoria del proceso</dt>
            <dd>{tamanoLegible(process.memoryUsage().rss)}</dd>
          </div>
          <div>
            <dt>Directorio de respaldos</dt>
            <dd className="sistema-entorno-ruta">{directorioDeRespaldos()}</dd>
          </div>
          <div>
            <dt>Respaldos conservados</dt>
            <dd>
              {respaldosIlegibles
                ? '— · no se pudo leer el directorio'
                : `${respaldos.length} · ${tamanoLegible(bytesDeRespaldos)}`}
            </dd>
          </div>
          <div>
            <dt>Zona horaria del servidor</dt>
            <dd>{Intl.DateTimeFormat().resolvedOptions().timeZone}</dd>
          </div>
        </dl>
      </SeccionPlegable>

      {/* Aquí iban dos «Atajos»: la comprobación de salud, que ya está en la
          cabecera, y Respaldos, que pasó a la fila «Respaldo reciente», donde
          se ve si hace falta ir. Antes de eso hubo una tarjeta «CMS de
          Payload» que abría /admin; esa interfaz se retiró (D-038) y la ruta
          solo reenvía al panel. */}
    </div>
  )
}
