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
import { existsSync } from 'node:fs'
import { createWriteStream } from 'node:fs'
import { mkdir, readdir, stat, unlink } from 'node:fs/promises'
import { createGzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import { esNombreDeRespaldo, fechaDeNombre, marcaDeTiempo, type Respaldo } from './respaldos'

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

export async function listarRespaldos(): Promise<Respaldo[]> {
  const dir = directorioDeRespaldos()
  let entradas: string[]
  try {
    entradas = await readdir(dir)
  } catch {
    // Que no exista el directorio no es un error: significa que aún no se ha
    // respaldado nunca, y la página debe decirlo en lugar de romperse.
    return []
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

/** ¿Está disponible `pg_dump` en esta máquina? */
export function hayPgDump(): Promise<boolean> {
  return new Promise((resolver) => {
    const proceso = spawn(rutaDePgDump(), ['--version'], { stdio: 'ignore' })
    proceso.on('error', () => resolver(false))
    proceso.on('close', (codigo) => resolver(codigo === 0))
  })
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
  await mkdir(dir, { recursive: true })

  const nombre = `base-${marcaDeTiempo()}.sql.gz`
  const destino = path.join(dir, nombre)

  const { sinClave, clave } = separarClave(uri)
  const volcado = spawn(rutaDePgDump(), ['--clean', '--if-exists', '--dbname', sinClave], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: clave === undefined ? process.env : { ...process.env, PGPASSWORD: clave },
  })

  let errores = ''
  volcado.stderr.on('data', (trozo) => {
    errores += String(trozo)
  })

  const terminado = new Promise<void>((resolver, rechazar) => {
    volcado.on('error', rechazar)
    volcado.on('close', (codigo) =>
      codigo === 0
        ? resolver()
        : rechazar(new Error(`pg_dump terminó con código ${codigo}. ${errores.trim()}`)),
    )
  })

  try {
    await Promise.all([
      // 640 y no el 644 por omisión: un volcado lleva los correos y los hashes
      // de todas las cuentas. El directorio ya cierra el paso a terceros (770,
      // `scripts/instalar-servidor.sh`), pero un respaldo copiado a otra carpeta
      // se lleva sus permisos y no los del directorio. La lectura de grupo se
      // conserva porque es por donde lo lee `scripts/restaurar.sh` desde el
      // anfitrión, que no es el usuario del contenedor.
      pipeline(volcado.stdout, createGzip({ level: 9 }), createWriteStream(destino, { mode: 0o640 })),
      terminado,
    ])

    const info = await stat(destino)
    if (info.size < MINIMO_ACEPTABLE) {
      throw new Error(`El volcado pesa ${info.size} bytes: demasiado poco para ser correcto.`)
    }
    return {
      nombre,
      bytes: info.size,
      creado: (fechaDeNombre(nombre) ?? info.mtime).toISOString(),
      tipo: 'base',
    }
  } catch (error) {
    await unlink(destino).catch(() => {})
    throw error
  }
}

export async function eliminarRespaldo(nombre: string): Promise<void> {
  await unlink(rutaDeRespaldo(nombre))
}
