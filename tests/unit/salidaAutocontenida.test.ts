import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `output: 'standalone'` solo donde se usa, que es la imagen de Docker.
 *
 * Estaba encendido para todos, y el servidor de Windows arranca con `next
 * start`, que avisa en cada arranque de que esa construcción no se lanza así.
 * Un aviso que sale siempre enseña a no leer el registro. Ahora lo enciende una
 * variable que pone el `Dockerfile`, y lo que puede torcerse es de dos clases:
 *
 *  1. **La configuración**: que sin la variable no haya `standalone` y con ella
 *     sí. Se importa `next.config.mjs` de verdad, con la variable puesta y
 *     quitada, en vez de buscar la palabra en el texto: una prueba que solo lee
 *     el archivo saldría verde con la condición escrita del revés.
 *  2. **El cable**: que el `Dockerfile` ponga la variable en la misma orden que
 *     compila, con el mismo nombre que lee la configuración, y que siga
 *     copiando lo que esa orden deja. Se separan en silencio: la imagen
 *     construiría sin `standalone` y el fallo saldría en un `COPY` que no
 *     nombra a nadie.
 */

const RAIZ = process.cwd()
const fuente = (...partes: string[]): string => readFileSync(join(RAIZ, ...partes), 'utf8')

const VARIABLE = 'SALIDA_AUTOCONTENIDA'

/** La configuración tal como la ve Next al cargarla, con el entorno de ahora. */
async function configuracion(): Promise<Record<string, unknown>> {
  vi.resetModules()
  const modulo = (await import('../../next.config.mjs')) as { default: unknown }
  const valor = modulo.default
  // `withPayload` puede devolver un objeto o una función de fase, según versión.
  return (typeof valor === 'function' ? await valor('phase-production-build', {}) : valor) as Record<
    string,
    unknown
  >
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('la salida autocontenida la pide quien la usa', () => {
  it('sin la variable no hay standalone, que es como arranca el servidor de Windows', async () => {
    vi.stubEnv(VARIABLE, '')
    expect((await configuracion()).output).toBeUndefined()
  })

  it('con la variable a 1 sí, que es como compila la imagen', async () => {
    vi.stubEnv(VARIABLE, '1')
    expect((await configuracion()).output).toBe('standalone')
  })

  it('un 0 no la enciende', async () => {
    // Aceptar cualquier valor no vacío convertiría el «apagado» explícito en un sí.
    vi.stubEnv(VARIABLE, '0')
    expect((await configuracion()).output).toBeUndefined()
  })

  it('lo demás de la configuración no depende de la variable', async () => {
    vi.stubEnv(VARIABLE, '')
    const sin = await configuracion()
    vi.stubEnv(VARIABLE, '1')
    const con = await configuracion()
    expect((sin.experimental as Record<string, unknown>).serverActions).toEqual(
      (con.experimental as Record<string, unknown>).serverActions,
    )
  })
})

describe('el Dockerfile la pone donde compila y copia lo que sale', () => {
  const DOCKERFILE = fuente('Dockerfile')
  const CONFIG = fuente('next.config.mjs')

  /** La orden `RUN` que compila, con sus continuaciones de línea juntas. */
  const ordenDeCompilar = (): string => {
    const unida = DOCKERFILE.replace(/\\\r?\n/g, ' ')
    const orden = unida.split(/\r?\n/).find((linea) => /^RUN .*npm run build/.test(linea))
    expect(orden, 'el Dockerfile ya no compila con `npm run build`').toBeDefined()
    return orden!
  }

  it('la variable va en la misma orden que `npm run build`, antes de él', () => {
    // En otra orden `RUN` no llegaría: cada una es un proceso aparte. Y con
    // `ENV` se grabaría además en la imagen, donde no hace falta.
    const orden = ordenDeCompilar()
    expect(orden.indexOf(`${VARIABLE}=1`)).toBeGreaterThan(-1)
    expect(orden.indexOf(`${VARIABLE}=1`)).toBeLessThan(orden.indexOf('npm run build'))
  })

  it('la configuración lee la variable con ese mismo nombre', () => {
    expect(CONFIG).toContain(`process.env.${VARIABLE} === '1'`)
  })

  it('la construcción falla con nombre si no deja `server.js`', () => {
    expect(ordenDeCompilar()).toMatch(/npm run build\s+&&\s+if \[ ! -f \.next\/standalone\/server\.js \]/)
  })

  it('la etapa final sigue copiando `.next/standalone` y arrancando su `server.js`', () => {
    expect(DOCKERFILE).toContain('COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./')
    expect(DOCKERFILE).toContain('CMD ["node", "server.js"]')
  })

  it('ninguna otra orden del Dockerfile enciende la salida para la imagen final', () => {
    // Si se pusiera con `ENV`, quedaría grabada en el contenedor, donde no hace
    // nada salvo confundir a quien lea `docker inspect`.
    expect(DOCKERFILE).not.toMatch(new RegExp(`^ENV ${VARIABLE}`, 'm'))
  })
})
