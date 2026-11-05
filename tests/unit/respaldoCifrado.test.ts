import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'

/**
 * «Respaldar ahora» con la llave puesta (D-295): sale cifrado, y el volcado en
 * claro no toca el disco en ningún momento.
 *
 * `pg_dump` y `age` se sustituyen por procesos de mentira que hablan por los
 * mismos conductos —uno escribe un volcado; el otro lee lo que le llega y lo
 * devuelve detrás de la cabecera de age—, para que la prueba corra igual en
 * Windows y en Linux, sin base y sin age instalados. Lo que se mira es lo que
 * queda en la carpeta y lo que recibió cada proceso. Que age cifre de verdad no
 * se prueba aquí: es age.
 *
 * Los guiones del anfitrión, que hacen lo mismo cada noche, los prueba
 * `guionesDeRespaldo.test.ts`.
 */

const { escenario, lanzados } = vi.hoisted(() => ({
  escenario: {
    age: 'bien' as 'bien' | 'falta' | 'se-cae',
    pgDump: 'bien' as 'bien' | 'falla',
    recibidoPorAge: [] as Buffer[],
  },
  lanzados: [] as { programa: string; argumentos: string[] }[],
}))

vi.mock('node:child_process', async (original) => {
  const { EventEmitter } = await import('node:events')
  const { PassThrough } = await import('node:stream')
  const { randomBytes } = await import('node:crypto')

  /** Un proceso hijo con sus tres conductos y lo justo de su interfaz. */
  const procesoFalso = () => {
    const proceso = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      exitCode: null as number | null,
      kill: () => terminar(null),
    })
    const terminar = (codigo: number | null) => {
      if (proceso.exitCode !== null) return
      proceso.exitCode = codigo ?? -1
      proceso.stdout.end()
      proceso.stderr.end()
      setImmediate(() => proceso.emit('close', codigo))
    }
    return { proceso, terminar }
  }

  return {
    ...(await original<typeof import('node:child_process')>()),
    spawn: (programa: string, argumentos: string[]) => {
      lanzados.push({ programa, argumentos })
      const { proceso, terminar } = procesoFalso()

      if (argumentos[0] === '--version') {
        setImmediate(() =>
          programa === 'age-falso' && escenario.age === 'falta'
            ? proceso.emit('error', Object.assign(new Error('spawn age-falso ENOENT'), { code: 'ENOENT' }))
            : terminar(0),
        )
        return proceso
      }

      if (programa === 'pg_dump-falso') {
        setImmediate(() => {
          if (escenario.pgDump === 'falla') {
            proceso.stderr.write('pg_dump: error: la autentificación falló para el usuario «trauma»')
            terminar(1)
            return
          }
          proceso.stdout.write('--\n-- PostgreSQL database dump\n--\n')
          // Lo bastante y poco comprimible: el respaldo tiene que superar el mínimo.
          proceso.stdout.write(randomBytes(6000).toString('base64'))
          terminar(0)
        })
        return proceso
      }

      // age -r <destinatario>: lee lo que le llega y lo devuelve tras su cabecera.
      proceso.stdin.on('data', (trozo: Buffer) => {
        escenario.recibidoPorAge.push(trozo)
        if (escenario.age === 'se-cae') {
          proceso.stderr.write('age: error: se cayó a mitad')
          proceso.stdin.destroy()
          terminar(1)
        }
      })
      proceso.stdin.on('end', () => {
        proceso.stdout.write('age-encryption.org/v1\n-> X25519 falso\n---\n')
        proceso.stdout.write(Buffer.concat(escenario.recibidoPorAge))
        terminar(0)
      })
      return proceso
    },
  }
})

import { crearRespaldo } from '@/lib/respaldosServidor'

const DESTINATARIO = `age1${'q'.repeat(58)}`
const CABECERA_DE_AGE = 'age-encryption.org/v1'
let carpeta = ''
const entorno = { ...process.env }

beforeAll(() => {
  carpeta = mkdtempSync(path.join(os.tmpdir(), 'respaldo-cifrado-'))
})
afterAll(() => {
  rmSync(carpeta, { recursive: true, force: true })
})

beforeEach(() => {
  for (const archivo of readdirSync(carpeta)) rmSync(path.join(carpeta, archivo), { force: true })
  lanzados.length = 0
  escenario.age = 'bien'
  escenario.pgDump = 'bien'
  escenario.recibidoPorAge = []
  process.env.RESPALDOS_DIR = carpeta
  process.env.DATABASE_URI = 'postgres://trauma:clave-de-prueba@127.0.0.1:5432/trauma'
  process.env.PG_DUMP = 'pg_dump-falso'
  process.env.AGE = 'age-falso'
  process.env.RESPALDOS_DESTINATARIO = DESTINATARIO
})
afterEach(() => {
  process.env = { ...entorno }
})

/** Si el volcado llegó a lanzarse: lo de `--version` es solo preguntar si el programa está. */
const seVolco = () => lanzados.some((l) => l.programa === 'pg_dump-falso' && l.argumentos[0] !== '--version')

describe('«Respaldar ahora» con la llave puesta', () => {
  it('sale cifrado, con .age, y es lo único que queda en la carpeta', async () => {
    const respaldo = await crearRespaldo()

    expect(respaldo.nombre).toMatch(/^base-\d{8}-\d{6}\.sql\.gz\.age$/)
    expect(respaldo.cifrado).toBe(true)
    expect(readdirSync(carpeta)).toEqual([respaldo.nombre])
    const contenido = readFileSync(path.join(carpeta, respaldo.nombre))
    expect(contenido.subarray(0, CABECERA_DE_AGE.length).toString()).toBe(CABECERA_DE_AGE)
    expect(contenido.includes('PostgreSQL database dump')).toBe(false)
  })

  it('age recibe lo ya comprimido y cifra solo para la llave pública', async () => {
    await crearRespaldo()
    expect(lanzados).toContainEqual({ programa: 'age-falso', argumentos: ['-r', DESTINATARIO] })
    // Quitando el .age queda el .sql.gz de siempre: restaurar.sh no cambia.
    const recibido = Buffer.concat(escenario.recibidoPorAge)
    expect(recibido[0]).toBe(0x1f)
    expect(recibido[1]).toBe(0x8b)
    expect(gunzipSync(recibido).toString()).toContain('PostgreSQL database dump')
  })

  it('la llave se toma sin los espacios con que se haya copiado', async () => {
    process.env.RESPALDOS_DESTINATARIO = `  ${DESTINATARIO}\n`
    await crearRespaldo()
    expect(lanzados).toContainEqual({ programa: 'age-falso', argumentos: ['-r', DESTINATARIO] })
  })
})

describe('cuando no se puede cifrar, no se respalda en claro', () => {
  it('con la llave mal copiada se niega antes de volcar nada', async () => {
    process.env.RESPALDOS_DESTINATARIO = 'age1-esto-no-es-una-llave'
    await expect(crearRespaldo()).rejects.toThrow(/no es una llave pública de age/)
    expect(seVolco()).toBe(false)
    expect(readdirSync(carpeta)).toEqual([])
  })

  it('sin age donde corre la aplicación se niega antes de volcar nada', async () => {
    escenario.age = 'falta'
    await expect(crearRespaldo()).rejects.toThrow(/age no está donde corre la aplicación/)
    expect(seVolco()).toBe(false)
    expect(readdirSync(carpeta)).toEqual([])
  })

  it('si age se cae a mitad, el archivo a medio escribir se borra', async () => {
    escenario.age = 'se-cae'
    await expect(crearRespaldo()).rejects.toThrow()
    expect(readdirSync(carpeta)).toEqual([])
  })

  it('si pg_dump falla, se dice lo que dijo pg_dump y no queda nada', async () => {
    escenario.pgDump = 'falla'
    await expect(crearRespaldo()).rejects.toThrow(/pg_dump terminó con código 1\. pg_dump: error: la autentificación falló/)
    expect(readdirSync(carpeta)).toEqual([])
  })
})

describe('sin llave, como antes', () => {
  it('sale sin cifrar, y no pregunta por age', async () => {
    delete process.env.RESPALDOS_DESTINATARIO
    const respaldo = await crearRespaldo()

    expect(respaldo.nombre).toMatch(/^base-\d{8}-\d{6}\.sql\.gz$/)
    expect(respaldo.cifrado).toBe(false)
    expect(gunzipSync(readFileSync(path.join(carpeta, respaldo.nombre))).toString()).toContain('PostgreSQL database dump')
    expect(lanzados.some((l) => l.programa === 'age-falso')).toBe(false)
  })
})
