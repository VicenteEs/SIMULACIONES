import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * La clave de la base no va en la línea de órdenes de `pg_dump`.
 *
 * `crearRespaldo()` —el botón «Respaldar ahora» del panel— llamaba a
 * `pg_dump --dbname <uri>` con la URI entera, clave incluida. La línea de
 * órdenes de un proceso la puede leer cualquier otro usuario de la máquina
 * mientras dura el volcado. Ahora la URI viaja sin clave y la clave en
 * `PGPASSWORD`, en el entorno del proceso hijo.
 *
 * Se comprueba la llamada de verdad a `spawn`, no el texto de la fuente: lo que
 * importa es qué argumentos recibe el proceso.
 */

const llamadas: { orden: string; argumentos: string[]; entorno?: NodeJS.ProcessEnv }[] = []

vi.mock('node:child_process', () => ({
  spawn: (orden: string, argumentos: string[], opciones: { env?: NodeJS.ProcessEnv }) => {
    llamadas.push({ orden, argumentos, entorno: opciones?.env })
    const oyentes: Record<string, (valor?: unknown) => void> = {}
    const flujo = () => {
      // Un flujo legible mínimo que termina enseguida y sin datos.
      const { Readable } = require('node:stream')
      return Readable.from([])
    }
    const proceso = {
      stdout: flujo(),
      stderr: { on: () => undefined },
      on: (evento: string, oyente: (valor?: unknown) => void) => {
        oyentes[evento] = oyente
        // --version contesta bien; el volcado «falla» después de lanzarse, para
        // no escribir archivos: basta con haber visto sus argumentos.
        if (evento === 'close') setTimeout(() => oyente(argumentos.includes('--version') ? 0 : 1), 0)
        return proceso
      },
    }
    return proceso
  },
}))

const URI = 'postgres://trauma:S3creta%40larga@127.0.0.1:5432/trauma'

describe('el volcado del panel no enseña la clave', () => {
  beforeEach(() => {
    llamadas.length = 0
    process.env.DATABASE_URI = URI
    process.env.RESPALDOS_DIR = require('node:os').tmpdir()
  })

  it('la URI de los argumentos no lleva clave, y la clave va en PGPASSWORD', async () => {
    const { crearRespaldo } = await import('@/lib/respaldosServidor')
    await crearRespaldo().catch(() => undefined)

    const volcado = llamadas.find((l) => l.argumentos.includes('--dbname'))
    expect(volcado, 'no se llegó a lanzar pg_dump').toBeDefined()
    const todo = volcado!.argumentos.join(' ')
    expect(todo).not.toContain('S3creta')
    expect(todo).not.toContain('%40larga')
    expect(volcado!.entorno?.PGPASSWORD).toBe('S3creta@larga')
  })

  it('separarClave devuelve la URI sin clave y la clave decodificada', async () => {
    const { separarClave } = await import('@/lib/respaldosServidor')
    const { sinClave, clave } = separarClave(URI)
    expect(clave).toBe('S3creta@larga')
    expect(sinClave).not.toContain('S3creta')
    expect(sinClave).toContain('trauma@127.0.0.1:5432/trauma')
  })

  it('una URI sin clave no inventa una PGPASSWORD vacía', async () => {
    const { separarClave } = await import('@/lib/respaldosServidor')
    expect(separarClave('postgres://trauma@127.0.0.1:5432/trauma').clave).toBeUndefined()
  })
})
