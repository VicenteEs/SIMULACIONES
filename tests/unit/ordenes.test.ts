import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Vigilancia de las órdenes: las de `package.json` y las que las guías mandan
 * escribir.
 *
 * Una orden documentada no tiene compilador que la contradiga. `AGENTS.md`
 * llegó a pedir en «Antes de subir» un `npm run test:coverage` con el umbral en
 * 80 sobre una suite al 70: fallaba siempre, así que nadie la corría, y una
 * puerta por la que nadie pasa no guarda nada. El fallo simétrico es peor y más
 * silencioso: renombrar un guion de `package.json` y dejar la guía nombrando el
 * viejo, que en npm no es un error de tipografía sino un `Missing script` en
 * medio del trámite de subir.
 *
 * Aquí se comprueba lo que ya se rompió: que toda orden nombrada en las guías
 * exista de verdad, y que `test:integration` siga declarándose obligatoria ella
 * misma. Lo que no se comprueba aquí es que además pasen en verde —eso lo dice
 * la propia suite al correrla—, porque esta prueba tiene que poder correr sin
 * base de datos.
 */

const raiz = process.cwd()

const guiones: Record<string, string> = JSON.parse(
  readFileSync(join(raiz, 'package.json'), 'utf8'),
).scripts

const agentes = readFileSync(join(raiz, 'AGENTS.md'), 'utf8')

/**
 * Las guías que un desarrollador lee para saber qué escribir. Se listan a mano
 * y no por barrido del repositorio: `node_modules` está lleno de README con
 * órdenes de otros proyectos, y `archivo/` es el prototipo congelado.
 */
const GUIAS = [
  'AGENTS.md',
  'README.md',
  join('despliegue', 'paginas', 'LEEME.md'),
  ...readdirSync(join(raiz, 'docs'))
    .filter((nombre) => nombre.endsWith('.md'))
    .map((nombre) => join('docs', nombre)),
]

/** Las órdenes del bloque en bash que sigue a un encabezado dado. */
function ordenesDelBloque(markdown: string, encabezado: string): string[] {
  const desde = markdown.indexOf(encabezado)
  expect(desde, `no está el encabezado «${encabezado}»`).toBeGreaterThan(-1)
  const apertura = markdown.indexOf('```bash', desde)
  expect(apertura, `«${encabezado}» ya no trae un bloque en bash`).toBeGreaterThan(-1)
  const cierre = markdown.indexOf('```', apertura + 7)
  return markdown
    .slice(apertura + 7, cierre)
    .split('\n')
    .map((linea) => linea.trim())
    .filter((linea) => linea.length > 0 && !linea.startsWith('#'))
}

/**
 * El nombre del guion que ejecuta una orden de npm, o `null` si la orden no es
 * de npm. `npm test` es guion igual que `npm run test:coverage`: npm reserva
 * unos pocos nombres que no llevan `run`.
 */
function guionQueInvoca(orden: string): string | null {
  const conRun = orden.match(/^npm run ([a-z0-9:_-]+)/)
  if (conRun) return conRun[1]
  const directa = orden.match(/^npm (test|start|stop|restart)\b/)
  return directa ? directa[1] : null
}

describe('las órdenes de «Antes de subir»', () => {
  const ordenes = ordenesDelBloque(agentes, '## Antes de subir')

  it('son todas órdenes que existen', () => {
    expect(ordenes.length).toBeGreaterThan(0)
    for (const orden of ordenes) {
      const guion = guionQueInvoca(orden)
      if (guion === null) continue
      expect(guiones, `«${orden}» no existe en package.json`).toHaveProperty(guion)
    }
  })

  it('incluyen la comprobación de tipos, el lint, las pruebas y la compilación', () => {
    // El trámite completo, no una parte: cada una de las cuatro ha cazado algo
    // que las otras tres dejaban pasar. Si alguna se cae de la lista, que se
    // caiga a la vista y no en un renglón borrado sin querer.
    const juntas = ordenes.join('\n')
    expect(juntas).toContain('npm run typecheck')
    expect(juntas).toContain('npm run lint')
    expect(juntas).toContain('npm run build')
    expect(juntas).toMatch(/npm run test:(coverage|integration)|npm test|vitest/)
  })
})

describe('las guías no mandan escribir órdenes que no existen', () => {
  for (const guia of GUIAS) {
    it(guia, () => {
      const texto = readFileSync(join(raiz, guia), 'utf8')
      const citadas = [...texto.matchAll(/npm run ([a-z0-9:_-]+)/g)].map((m) => m[1])
      for (const nombre of new Set(citadas)) {
        const queja = `${guia} nombra «npm run ${nombre}», que no está en package.json`
        expect(guiones, queja).toHaveProperty(nombre)
      }
    })
  }
})

describe('`npm run test:integration`', () => {
  it('se declara obligatoria ella misma', () => {
    // Las seis pruebas de acceso son las únicas que comprueban que los permisos
    // llegan hasta la consulta. Sin `EXIGIR_INTEGRACION=1` dentro del propio
    // guion, un `OMITIR_INTEGRACION=1` olvidado en la shell las omite y la
    // orden cuyo único propósito es correrlas sale verde sin haber corrido
    // ninguna (`tests/integration/acceso.test.ts`, la política de tres
    // estados).
    expect(guiones['test:integration']).toContain('EXIGIR_INTEGRACION')
    expect(guiones['test:integration']).toContain('tests/integration')
  })

  it('pone la variable sin depender de la shell', () => {
    // `EXIGIR_INTEGRACION=1 vitest …` delante de la orden solo funciona en
    // bash: npm ejecuta los guiones con `cmd` en Windows, que lo toma como
    // parte del nombre del programa. De ahí el rodeo por Node, que pone la
    // variable en su propio proceso antes de lanzar Vitest.
    expect(guiones['test:integration']).not.toMatch(/^EXIGIR_INTEGRACION=/)
    expect(guiones['test:integration']).toMatch(/^node /)
  })
})
