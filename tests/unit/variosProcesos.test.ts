import { spawn, type ChildProcess } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { get } from 'node:http'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
// El guion de JavaScript tal cual, el mismo que corre en la imagen.
import { cuantosProcesos, esperaParaRelanzar, MAXIMO_PERMITIDO } from '../../scripts/arrancar.mjs'
import { programaEsteProceso } from '@/lib/conservacionProgramada'

/**
 * La aplicación en varios procesos (D-393, `scripts/arrancar.mjs`).
 *
 * Lo que se vigila es lo que no se ve hasta que falla en el servidor: que la
 * imagen arranque el proceso principal y no un `server.js` suelto, que los
 * procesos reciban el número y el arranque con los nombres que la aplicación
 * lee, que el primero salga solo y los demás después, y que uno caído vuelva.
 */

const RAIZ = process.cwd()
const leer = (...ruta: string[]) => readFileSync(join(RAIZ, ...ruta), 'utf8')

describe('cuántos procesos', () => {
  it('sin pedirlo, los núcleos menos dos, al menos uno y como mucho cuatro', () => {
    expect(cuantosProcesos(undefined, 6)).toBe(4)
    expect(cuantosProcesos('', 5)).toBe(3)
    expect(cuantosProcesos(undefined, 2)).toBe(1)
    expect(cuantosProcesos(undefined, 1)).toBe(1)
    expect(cuantosProcesos(undefined, 32)).toBe(4)
  })

  it('lo pedido en PROCESOS manda, con un techo para las erratas', () => {
    expect(cuantosProcesos('1', 32)).toBe(1)
    expect(cuantosProcesos(' 2 ', 6)).toBe(2)
    expect(cuantosProcesos('100', 6)).toBe(MAXIMO_PERMITIDO)
  })

  it('lo que no es un número entero positivo se ignora, no se adivina', () => {
    for (const malo of ['0', '-3', 'dos', '2.5']) expect(cuantosProcesos(malo, 6)).toBe(4)
  })

  it('uno que se cae en bucle espera más antes de volver', () => {
    expect(esperaParaRelanzar(1)).toBe(1_000)
    expect(esperaParaRelanzar(5)).toBe(30_000)
  })
})

describe('la pasada de conservación, en un solo proceso', () => {
  it('la programa el proceso 1, o el único si no hay número', () => {
    expect(programaEsteProceso({})).toBe(true)
    expect(programaEsteProceso({ TRAUMAHUB_PROCESO: '1' })).toBe(true)
    expect(programaEsteProceso({ TRAUMAHUB_PROCESO: '2' })).toBe(false)
  })
})

describe('el cableado', () => {
  it('la imagen arranca el proceso principal, que está junto a `server.js`', () => {
    const dockerfile = leer('Dockerfile')
    expect(dockerfile).toContain('COPY --from=builder --chown=nextjs:nodejs /app/scripts/arrancar.mjs ./arrancar.mjs')
    expect(dockerfile).toContain('CMD ["node", "arrancar.mjs"]')
    expect(leer('scripts', 'arrancar.mjs')).toContain("join(dirname(fileURLToPath(import.meta.url)), 'server.js')")
  })

  it('el número y el arranque se pasan con los nombres que lee la aplicación', () => {
    const arrancar = leer('scripts', 'arrancar.mjs')
    expect(arrancar).toContain('TRAUMAHUB_PROCESO: String(numero)')
    expect(arrancar).toContain('TRAUMAHUB_ARRANQUE: String(arranque)')
    expect(leer('src', 'lib', 'conservacionProgramada.ts')).toContain('entorno.TRAUMAHUB_PROCESO')
    expect(leer('src', 'lib', 'despliegue.ts')).toContain('process.env.TRAUMAHUB_ARRANQUE')
  })

  it('la plantilla del override le pasa PROCESOS a la app', () => {
    // El contenedor solo ve lo que nombra el override: escribirla en el .env
    // sin esta línea no haría nada.
    expect(leer('despliegue', 'paginas', 'docker-compose.override.yml')).toContain('PROCESOS: ${PROCESOS:-}')
  })
})

/** Un puerto libre de esta máquina. */
async function puertoLibre(): Promise<number> {
  return new Promise((listo, falla) => {
    const servidor = createServer()
    servidor.once('error', falla)
    servidor.listen(0, '127.0.0.1', () => {
      const { port } = servidor.address() as { port: number }
      servidor.close(() => listo(port))
    })
  })
}

/** Una petición con conexión nueva: con la de siempre, caería en el mismo proceso. */
function pedir(puerto: number, camino: string): Promise<Record<string, string> | null> {
  return new Promise((listo) => {
    const peticion = get({ host: '127.0.0.1', port: puerto, path: camino, agent: false }, (respuesta) => {
      let cuerpo = ''
      respuesta.on('data', (trozo) => (cuerpo += trozo))
      respuesta.on('end', () => {
        try {
          listo(JSON.parse(cuerpo))
        } catch {
          listo(null)
        }
      })
    })
    peticion.on('error', () => listo(null))
    peticion.setTimeout(2_000, () => peticion.destroy())
  })
}

const dormir = (ms: number) => new Promise((listo) => setTimeout(listo, ms))

describe('el proceso principal, con un `server.js` de juguete', () => {
  const carpeta = mkdtempSync(join(tmpdir(), 'arrancar-'))
  let principal: ChildProcess | null = null
  /** Los procesos de la aplicación que contestaron, para no dejar ninguno vivo. */
  const vivos = new Set<number>()

  afterAll(async () => {
    // En Windows, matar al principal no pasa por su `SIGTERM`: sus procesos se
    // van solos al cerrarse el canal con él, pero un rato después. Se matan a
    // mano, y la carpeta se borra con reintentos mientras sueltan sus archivos.
    principal?.kill()
    for (const pid of vivos) {
      try {
        process.kill(pid)
      } catch {
        // Ya había terminado.
      }
    }
    rmSync(carpeta, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 })
  })

  it('lanza los procesos pedidos, todos con el mismo arranque, y relanza al que se cae', { timeout: 40_000 }, async () => {
    copyFileSync(join(RAIZ, 'scripts', 'arrancar.mjs'), join(carpeta, 'arrancar.mjs'))
    // Contesta quién es; `/morir` termina el proceso que la atiende.
    writeFileSync(
      join(carpeta, 'server.js'),
      `const http = require('node:http')
http.createServer((req, res) => {
  res.end(JSON.stringify({ proceso: process.env.TRAUMAHUB_PROCESO, arranque: process.env.TRAUMAHUB_ARRANQUE, pid: String(process.pid) }))
  if (req.url === '/morir') setTimeout(() => process.exit(1), 10)
}).listen(Number(process.env.PORT), '127.0.0.1')
`,
    )
    const puerto = await puertoLibre()
    // El directorio de trabajo, fuera de la carpeta: en Windows no se puede
    // borrar la carpeta en la que un proceso está parado.
    principal = spawn(process.execPath, [join(carpeta, 'arrancar.mjs')], {
      cwd: tmpdir(),
      env: { ...process.env, PROCESOS: '3', PORT: String(puerto), NEXT_PUBLIC_BASE_PATH: '' },
      stdio: 'ignore',
    })

    /** Los procesos que contestan, preguntando hasta verlos a todos o agotar el plazo. */
    const vistos = async (cuantos: number, plazoMs: number) => {
      const fin = Date.now() + plazoMs
      const procesos = new Set<string>()
      const arranques = new Set<string>()
      while (Date.now() < fin && procesos.size < cuantos) {
        const respuesta = await pedir(puerto, '/api/salud')
        if (respuesta) {
          vivos.add(Number(respuesta.pid))
          procesos.add(respuesta.proceso)
          arranques.add(respuesta.arranque)
        } else {
          await dormir(100)
        }
      }
      return { procesos, arranques }
    }

    const { procesos, arranques } = await vistos(3, 20_000)
    expect([...procesos].sort()).toEqual(['1', '2', '3'])
    expect(arranques.size, 'cada proceso cree que arrancó en otro momento').toBe(1)

    await pedir(puerto, '/morir')
    await dormir(1_500)
    const despues = await vistos(3, 10_000)
    expect([...despues.procesos].sort()).toEqual(['1', '2', '3'])
    expect([...despues.arranques]).toEqual([...arranques])
  })
})
