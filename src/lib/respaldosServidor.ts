/**
 * Respaldos de la base de datos: la parte que toca el disco.
 *
 * Produce exactamente los mismos archivos que `scripts/respaldar.sh` desde
 * cron, en el mismo directorio y con el mismo nombre, para que la retención
 * automática los limpie por igual y `scripts/restaurar.sh` pueda restaurar uno
 * creado a mano desde el navegador. Dos sistemas de respaldo que se ignoran es
 * la manera más segura de no tener ninguno.
 *
 * En el servidor Windows el que respalda cada noche es `scripts/respaldar.ps1`,
 * y escribe en el mismo `RESPALDOS_DIR` con los mismos nombres; esta página los
 * lista sin saber de dónde vienen. `tests/unit/respaldoEnWindows.test.ts`
 * ejecuta ese guion y comprueba que `listarRespaldos()` ve lo que deja.
 *
 * El volcado se comprime al vuelo y se escribe en flujo: una base con años de
 * contenido no cabe en el montón de Node, y un respaldo que agota la memoria
 * del servidor es peor que no tener respaldo.
 */
import { spawn } from 'node:child_process'
import { constants, existsSync } from 'node:fs'
import { createWriteStream } from 'node:fs'
import { access, mkdir, readdir, stat, unlink } from 'node:fs/promises'
import { createGzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import {
  EXTENSION_CIFRADA,
  esDestinatarioDeAge,
  esNombreDeRespaldo,
  estaCifrado,
  fechaDeNombre,
  marcaDeTiempo,
  type EstadoDelCifrado,
  type Respaldo,
} from './respaldos'

/** Un volcado correcto nunca baja de esto; menos indica un fallo silencioso. */
const MINIMO_ACEPTABLE = 1024

/**
 * Dónde viven los respaldos.
 *
 * En el servidor es un directorio montado desde el anfitrión, para que
 * sobrevivan a la destrucción del contenedor; en desarrollo, la carpeta
 * `backups` del repositorio, que git ignora.
 */
export function directorioDeRespaldos(): string {
  return process.env.RESPALDOS_DIR || path.resolve(process.cwd(), 'backups')
}

const codigoDe = (error: unknown): string | undefined =>
  error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code
    : undefined

/**
 * Por qué este proceso no puede usar el directorio de respaldos, dicho para
 * quien administra el servidor.
 *
 * Existe por lo que se vio en `ved` el 2026-09-26 (O-067): el botón «Respaldar
 * ahora» respondía `EACCES: permission denied, open '/backups/base-…'` y la
 * página de sistema, a la vez, decía «no hay ningún respaldo» con once volcados
 * en la carpeta. Las dos cosas eran el mismo problema —la carpeta era del
 * usuario del anfitrión, con permisos 770, y la aplicación corre como el 1001
 * de la imagen—, pero ninguna de las dos pantallas lo nombraba: una hablaba en
 * inglés de un archivo y la otra negaba que hubiera respaldos, que es lo peor
 * que puede decir una pantalla de respaldos. Aquí se dice quién es el proceso,
 * de quién es la carpeta y dónde se arregla.
 *
 * Los números de usuario salen del propio proceso y del `stat` de la carpeta,
 * que se puede pedir aunque no se pueda leer su contenido. En Windows no hay
 * `getuid` y el mensaje se queda en lo que dice el sistema.
 */
async function motivoDelDirectorio(dir: string, error: unknown): Promise<string> {
  const codigo = codigoDe(error)
  if (codigo !== 'EACCES' && codigo !== 'EPERM') {
    const detalle = error instanceof Error ? error.message : String(error)
    return `No se puede usar el directorio de respaldos ${dir}: ${detalle}`
  }
  const quien =
    typeof process.getuid === 'function' && typeof process.getgid === 'function'
      ? `la aplicación corre como el usuario ${process.getuid()} (grupo ${process.getgid()})`
      : 'la aplicación no tiene permiso'
  const carpeta = await stat(dir).catch(() => null)
  const deQuien = carpeta
    ? ` y la carpeta es del usuario ${carpeta.uid} (grupo ${carpeta.gid}) con permisos ${(carpeta.mode & 0o777).toString(8)}`
    : ''
  const arreglo = carpeta
    ? ` En el servidor de páginas se arregla dándole al contenedor el grupo de la carpeta: «user: "1001:${carpeta.gid}"» en docker-compose.override.yml (la plantilla de despliegue/paginas ya lo trae) y «docker compose up -d app».`
    : ''
  return `Sin permiso sobre el directorio de respaldos ${dir}: ${quien}${deQuien}.${arreglo}`
}

/**
 * Si este proceso puede leer y escribir en el directorio de respaldos.
 *
 * `null` si puede, o si el directorio todavía no existe —se crea con el primer
 * respaldo—; si no, el motivo en palabras (`motivoDelDirectorio`). La usa la
 * página de sistema para no dar por buena una carpeta que el botón de respaldar
 * no puede tocar.
 */
export async function problemaDelDirectorio(): Promise<string | null> {
  const dir = directorioDeRespaldos()
  try {
    await access(dir, constants.R_OK | constants.W_OK | constants.X_OK)
    return null
  } catch (error) {
    if (codigoDe(error) === 'ENOENT') return null
    return motivoDelDirectorio(dir, error)
  }
}

/**
 * Los respaldos que hay, del más reciente al más antiguo.
 *
 * Solo la ausencia del directorio se lee como «ninguno». Cualquier otro fallo
 * se lanza con su motivo: tragárselo todo, que es lo que se hacía, convertía
 * una carpeta sin permisos en una lista vacía, y la página de sistema acababa
 * afirmando que no había ningún respaldo con once en el disco (O-067).
 */
export async function listarRespaldos(): Promise<Respaldo[]> {
  const dir = directorioDeRespaldos()
  let entradas: string[]
  try {
    entradas = await readdir(dir)
  } catch (error) {
    // Que no exista el directorio no es un error: significa que aún no se ha
    // respaldado nunca, y la página debe decirlo en lugar de romperse.
    if (codigoDe(error) === 'ENOENT') return []
    throw new Error(await motivoDelDirectorio(dir, error))
  }

  const respaldos = await Promise.all(
    entradas.filter(esNombreDeRespaldo).map(async (nombre) => {
      const info = await stat(path.join(dir, nombre)).catch(() => null)
      if (!info) return null
      return {
        nombre,
        bytes: info.size,
        creado: (fechaDeNombre(nombre) ?? info.mtime).toISOString(),
        tipo: nombre.startsWith('base-') ? ('base' as const) : ('medios' as const),
        cifrado: estaCifrado(nombre),
      }
    }),
  )

  return (respaldos.filter(Boolean) as Respaldo[]).sort((a, b) => b.creado.localeCompare(a.creado))
}

/** Ruta absoluta de un respaldo, comprobando antes que el nombre sea nuestro. */
export function rutaDeRespaldo(nombre: string): string {
  if (!esNombreDeRespaldo(nombre)) throw new Error('Nombre de respaldo no válido.')
  return path.join(directorioDeRespaldos(), nombre)
}

/**
 * Dónde está `pg_dump`.
 *
 * En la imagen de Docker está en el `PATH`, y en el servidor Windows no: el
 * PostgreSQL de allí se instaló desde el archivo comprimido, en
 * `C:\PostgreSQL\17\bin`, y ese directorio no se añadió al `PATH` del
 * servicio. Buscándolo solo en el `PATH`, el botón «Respaldar ahora» del panel
 * salía desactivado en la única máquina donde de verdad hace falta. `PG_DUMP`
 * permite apuntarlo a mano en cualquier otra instalación.
 */
export function rutaDePgDump(): string {
  if (process.env.PG_DUMP) return process.env.PG_DUMP
  const deWindows = 'C:\\PostgreSQL\\17\\bin\\pg_dump.exe'
  if (process.platform === 'win32' && existsSync(deWindows)) return deWindows
  return 'pg_dump'
}

/**
 * La URI sin la contraseña, y la contraseña aparte.
 *
 * `pg_dump --dbname <uri>` dejaba la clave de la base en la línea de órdenes, y
 * la línea de órdenes de un proceso la puede leer cualquier otro usuario de la
 * máquina mientras dura el volcado (`ps`, el Administrador de tareas). La clave
 * viaja en `PGPASSWORD`, en el entorno del propio proceso hijo, que es lo que
 * PostgreSQL recomienda y lo que ya hace `scripts/respaldar.ps1`.
 */
export function separarClave(uri: string): { sinClave: string; clave: string | undefined } {
  let url: URL
  try {
    url = new URL(uri)
  } catch {
    return { sinClave: uri, clave: undefined }
  }
  const clave = url.password ? decodeURIComponent(url.password) : undefined
  url.password = ''
  return { sinClave: url.toString(), clave }
}

/** ¿Responde este programa a `--version`? Es la forma de saber si está, sin buscarlo por el `PATH` a mano. */
function responde(programa: string): Promise<boolean> {
  return new Promise((resolver) => {
    const proceso = spawn(programa, ['--version'], { stdio: 'ignore' })
    proceso.on('error', () => resolver(false))
    proceso.on('close', (codigo) => resolver(codigo === 0))
  })
}

/** ¿Está disponible `pg_dump` en esta máquina? */
export const hayPgDump = (): Promise<boolean> => responde(rutaDePgDump())

/** Dónde está `age`. En la imagen, en el `PATH` (`apk add age`); `AGE` lo apunta a mano en otra instalación. */
export const rutaDeAge = (): string => process.env.AGE || 'age'

/**
 * Cómo está el cifrado de los respaldos que se hacen desde el panel (D-295).
 *
 *  - `cifra`: hay destinatario y `age`; el respaldo sale `.age`.
 *  - `sin-destinatario`: no hay `RESPALDOS_DESTINATARIO`; sale sin cifrar, como
 *    antes. Es lo que pasa en desarrollo, y en un servidor al que no se le ha
 *    puesto todavía.
 *  - `destinatario-invalido` y `falta-age`: hay que cifrar y no se puede. El
 *    botón se niega en vez de escribir sin cifrar: en un servidor que se
 *    configuró para cifrar, un respaldo en claro que nadie esperaba es justo lo
 *    que el aviso de privacidad promete que no hay.
 *
 * La lee la página para decirlo antes de pulsar, y `crearRespaldo` para decidir.
 */
export async function estadoDelCifrado(): Promise<EstadoDelCifrado> {
  const destinatario = process.env.RESPALDOS_DESTINATARIO?.trim()
  if (!destinatario) return 'sin-destinatario'
  if (!esDestinatarioDeAge(destinatario)) return 'destinatario-invalido'
  return (await responde(rutaDeAge())) ? 'cifra' : 'falta-age'
}

const MOTIVO_DEL_CIFRADO: Record<Exclude<EstadoDelCifrado, 'cifra' | 'sin-destinatario'>, string> = {
  'destinatario-invalido':
    'RESPALDOS_DESTINATARIO no es una llave pública de age (empieza por «age1» y tiene 62 caracteres). ' +
    'No se respalda sin cifrar en un servidor configurado para cifrar: corrija el valor en el .env del servidor.',
  'falta-age':
    'Los respaldos de este servidor se cifran (RESPALDOS_DESTINATARIO), pero age no está donde corre la ' +
    'aplicación. La imagen de producción lo trae desde D-295: reconstrúyala con scripts/deploy.sh.',
}

/**
 * Crea un volcado comprimido de la base y devuelve su ficha.
 *
 * Si algo falla a mitad, el archivo a medio escribir se borra: un respaldo
 * truncado que aparece en el listado es más peligroso que la ausencia de
 * respaldo, porque se confía en él hasta el día en que hace falta.
 */
export async function crearRespaldo(): Promise<Respaldo> {
  const uri = process.env.DATABASE_URI
  if (!uri) throw new Error('No hay DATABASE_URI configurada.')
  if (!(await hayPgDump())) {
    throw new Error(
      'pg_dump no está disponible donde corre la aplicación. La imagen de producción lo ' +
        'incluye; en desarrollo, use scripts/respaldar.sh, y en el servidor Windows, ' +
        'scripts/respaldar.ps1.',
    )
  }

  const dir = directorioDeRespaldos()
  // Antes de lanzar `pg_dump`, y con el motivo en palabras: el `EACCES` de
  // Node al abrir el archivo llegaba tal cual al panel, en inglés y sin decir
  // de quién era la carpeta ni dónde se arregla (O-067).
  try {
    await mkdir(dir, { recursive: true })
    await access(dir, constants.W_OK | constants.X_OK)
  } catch (error) {
    throw new Error(await motivoDelDirectorio(dir, error))
  }

  // Antes de volcar nada: si hay que cifrar y no se puede, se dice ahora y no
  // después de minutos de `pg_dump`.
  const cifrado = await estadoDelCifrado()
  if (cifrado === 'destinatario-invalido' || cifrado === 'falta-age') throw new Error(MOTIVO_DEL_CIFRADO[cifrado])
  const cifrar = cifrado === 'cifra'

  const nombre = `base-${marcaDeTiempo()}.sql.gz${cifrar ? EXTENSION_CIFRADA : ''}`
  const destino = path.join(dir, nombre)

  const { sinClave, clave } = separarClave(uri)
  const volcado = spawn(rutaDePgDump(), ['--clean', '--if-exists', '--dbname', sinClave], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: clave === undefined ? process.env : { ...process.env, PGPASSWORD: clave },
  })

  // 640 y no el 644 por omisión: un volcado lleva los correos y los hashes de
  // todas las cuentas. El directorio ya cierra el paso a terceros (770,
  // `scripts/instalar-servidor.sh`), pero un respaldo copiado a otra carpeta se
  // lleva sus permisos y no los del directorio. La lectura de grupo se conserva
  // porque es por donde lo lee `scripts/restaurar.sh` desde el anfitrión, que no
  // es el usuario del contenedor. Cifrado o no, el mismo permiso: el cifrado
  // protege la copia que sale del servidor, no sustituye al permiso de la que
  // se queda.
  const archivo = () => createWriteStream(destino, { mode: 0o640 })

  try {
    if (cifrar) {
      // Lo comprimido entra en `age` y lo cifrado sale al archivo: en ningún
      // momento toca el disco el volcado en claro. Solo con la llave pública;
      // la privada no está en el servidor, y por eso este proceso puede cifrar
      // pero no podría abrir lo que acaba de escribir.
      const cifrador = spawn(rutaDeAge(), ['-r', process.env.RESPALDOS_DESTINATARIO!.trim()], {
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      await Promise.all([
        pipeline(volcado.stdout, createGzip({ level: 9 }), cifrador.stdin),
        pipeline(cifrador.stdout, archivo()),
        alTerminar(volcado, 'pg_dump'),
        alTerminar(cifrador, 'age'),
      ])
    } else {
      await Promise.all([pipeline(volcado.stdout, createGzip({ level: 9 }), archivo()), alTerminar(volcado, 'pg_dump')])
    }

    const info = await stat(destino)
    if (info.size < MINIMO_ACEPTABLE) {
      throw new Error(`El volcado pesa ${info.size} bytes: demasiado poco para ser correcto.`)
    }
    return {
      nombre,
      bytes: info.size,
      creado: (fechaDeNombre(nombre) ?? info.mtime).toISOString(),
      tipo: 'base',
      cifrado: cifrar,
    }
  } catch (error) {
    // Si `age` se cae, `pg_dump` se queda escribiendo en un conducto que ya
    // nadie lee; se le corta para que no siga ocupando la base.
    if (volcado.exitCode === null) volcado.kill()
    await unlink(destino).catch(() => {})
    throw error
  }
}

/**
 * Espera a que un proceso hijo termine, con lo que dijo por su salida de
 * errores si termina mal: sin ella, un `age` que rechaza el destinatario solo
 * diría «código 1».
 */
function alTerminar(proceso: ReturnType<typeof spawn>, quien: string): Promise<void> {
  let errores = ''
  proceso.stderr?.on('data', (trozo) => {
    errores += String(trozo)
  })
  return new Promise<void>((resolver, rechazar) => {
    proceso.on('error', rechazar)
    proceso.on('close', (codigo) =>
      codigo === 0 ? resolver() : rechazar(new Error(`${quien} terminó con código ${codigo}. ${errores.trim()}`)),
    )
  })
}

export async function eliminarRespaldo(nombre: string): Promise<void> {
  await unlink(rutaDeRespaldo(nombre))
}
