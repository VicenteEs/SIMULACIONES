import { connect as abrirSocket, type Socket } from 'node:net'
import { connect as abrirSocketCifrado } from 'node:tls'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { exigirPanel } from '@/app/(frontend)/admin-panel/acceso'
import { tamanoLegible } from '@/lib/respaldos'
import { espacioEnDisco, UMBRAL_DE_USO } from '@/lib/espacioEnDisco'
import { directorioDeRespaldos, hayPgDump, listarRespaldos } from '@/lib/respaldosServidor'
import { clientePayload } from '../datos'
import { versionDelAtlas } from '@/app/(frontend)/acciones/atlas'
import { ruta } from '@/lib/rutas'
import { puertoDeCorreo } from '@/correo/enviar'
import { BotonCorreoDePrueba } from './BotonCorreoDePrueba'

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

/** Versión y peso de PostgreSQL, si el adaptador deja llegar al pool. */
async function estadoDeLaBase(payload: unknown): Promise<{ version: string; peso: string }> {
  const pool = (payload as { db?: { pool?: { query?: (sql: string) => Promise<unknown> } } }).db
    ?.pool
  if (!pool?.query) return { version: 'desconocida', peso: 'desconocido' }

  const consultar = async (sql: string): Promise<string> => {
    const resultado = (await pool.query!(sql)) as { rows?: Array<Record<string, unknown>> }
    const fila = resultado.rows?.[0]
    return fila ? String(Object.values(fila)[0]) : '—'
  }

  try {
    const [version, peso] = await Promise.all([
      consultar('select version()'),
      consultar('select pg_size_pretty(pg_database_size(current_database()))'),
    ])
    // «PostgreSQL 17.2 on x86_64-pc-linux-musl…» — basta con las dos primeras palabras.
    return { version: version.split(' ').slice(0, 2).join(' '), peso }
  } catch {
    return { version: 'sin respuesta', peso: 'desconocido' }
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
  let usuarios = 0

  try {
    const payload = await clientePayload()
    const conteo = await payload.count({ collection: 'usuarios', overrideAccess: true })
    usuarios = conteo.totalDocs
    const info = await estadoDeLaBase(payload)
    versionBase = info.version
    pesoBase = info.peso
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

  const [respaldos, pgDump, atlas, disco, correo] = await Promise.all([
    listarRespaldos().catch(() => []),
    hayPgDump(),
    versionDelAtlas(),
    espacioEnDisco(),
    servidorSmtp
      ? correoResponde(servidorSmtp, puertoSmtp)
      : Promise.resolve<Diagnostico>({
          ok: false,
          detalle: 'sin servidor SMTP: la recuperación de contraseña no llega a destino',
        }),
  ])
  const ultimo = respaldos.find((r) => r.tipo === 'base')

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
      estado: ultimo
        ? {
            ok: Date.now() - new Date(ultimo.creado).getTime() < 3 * 86_400_000,
            detalle: `${ultimo.nombre} · ${tamanoLegible(ultimo.bytes)}`,
          }
        : { ok: false, detalle: 'no hay ningún respaldo' },
    },
    {
      titulo: 'Herramienta de respaldo',
      estado: pgDump
        ? { ok: true, detalle: 'pg_dump disponible' }
        : { ok: false, detalle: 'pg_dump no está en este entorno' },
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
          <div style={{ marginTop: '0.25rem', color: 'var(--mudo)' }}>
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

  return (
    <div>
      <header className="admin-header">
        <h1 className="admin-title">Sistema</h1>
        <p className="admin-subtitle">
          Estado de la instalación y sus dependencias · {usuarios} cuenta
          {usuarios === 1 ? '' : 's'} registradas
        </p>
      </header>

      {problemas === 0 ? (
        <div className="admin-aviso admin-aviso-ok">
          <strong>Todo en orden.</strong>
          Las {comprobaciones.length} comprobaciones pasan.
        </div>
      ) : (
        <div className="admin-aviso admin-aviso-atencion">
          <strong>
            {problemas} comprobación{problemas === 1 ? '' : 'es'} requiere{problemas === 1 ? '' : 'n'}{' '}
            atención.
          </strong>
          Están marcadas más abajo. Ninguna impide usar la plataforma, pero conviene resolverlas.
        </div>
      )}

      <h2 className="admin-section-title">Comprobaciones</h2>
      <div className="admin-table-container">
        <table className="admin-table">
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
                <td className="admin-table-user-name">{c.titulo}</td>
                <td>
                  <span
                    className={`admin-badge ${c.estado.ok ? 'admin-badge-publicado' : 'admin-badge-pending'}`}
                  >
                    {c.estado.ok ? '✓ Correcto' : '● Revisar'}
                  </span>
                </td>
                <td style={{ fontSize: '0.8125rem' }}>
                  {c.estado.detalle}
                  {c.complemento}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="admin-section-title">Entorno</h2>
      <dl className="admin-datos">
        <dt>PostgreSQL</dt>
        <dd>{versionBase}</dd>
        <dt>Tamaño de la base</dt>
        <dd>{pesoBase}</dd>
        <dt>Node.js</dt>
        <dd>{process.version}</dd>
        <dt>Plataforma</dt>
        <dd>
          {process.platform} · {process.arch}
        </dd>
        <dt>En marcha desde hace</dt>
        <dd>{duracion(process.uptime())}</dd>
        <dt>Memoria del proceso</dt>
        <dd>{tamanoLegible(process.memoryUsage().rss)}</dd>
        <dt>Directorio de respaldos</dt>
        <dd>{directorioDeRespaldos()}</dd>
        <dt>Respaldos conservados</dt>
        <dd>
          {respaldos.length} · {tamanoLegible(respaldos.reduce((t, r) => t + r.bytes, 0))}
        </dd>
        <dt>Zona horaria del servidor</dt>
        <dd>{Intl.DateTimeFormat().resolvedOptions().timeZone}</dd>
      </dl>

      <h2 className="admin-section-title">Atajos</h2>
      <div className="admin-grid">
        <div className="admin-card">
          <div className="admin-card-title">Comprobación de salud</div>
          <p className="admin-card-note">
            El extremo que consulta el despliegue para saber si la aplicación y la base responden.
          </p>
          <div className="admin-card-actions">
            <a
              href={ruta('/api/salud')}
              className="admin-btn admin-btn-secondary"
              target="_blank"
              rel="noopener noreferrer"
            >
              /api/salud ↗
            </a>
          </div>
        </div>
        <div className="admin-card">
          <div className="admin-card-title">Respaldos</div>
          <p className="admin-card-note">Crear, descargar o eliminar copias de la base.</p>
          <div className="admin-card-actions">
            <Link href="/admin-panel/respaldos" className="admin-btn admin-btn-secondary">
              Ir a respaldos
            </Link>
          </div>
        </div>
        {/* Aquí hubo una tarjeta «CMS de Payload» que abría /admin en una
            pestaña nueva prometiendo «todo lo que este panel no cubre». Esa
            interfaz se retiró (D-038) y la ruta solo reenvía aquí mismo: el
            administrador abría una pestaña para acabar en el panel del que
            salía. Ya no hay nada que este panel no cubra. */}
      </div>
    </div>
  )
}
