import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * El cable del ensayo de los casos en el despliegue (D-373).
 *
 * La lógica del ensayo se prueba en `ensayoDeLosCasos.test.ts`; aquí, que los
 * tres archivos que lo llevan al servidor sigan hablando de lo mismo. Se
 * separan en silencio: una etapa renombrada en el `Dockerfile` haría fallar el
 * `docker build --target` en cada despliegue, y un ensayo movido detrás del
 * `up` ensayaría lo que ya está sirviendo. Se lee el texto porque no hay otra
 * forma de mirarlos sin un servidor, igual que en `salidaAutocontenida.test.ts`.
 */

const RAIZ = process.cwd()
const fuente = (...partes: string[]): string => readFileSync(join(RAIZ, ...partes), 'utf8').replace(/\r\n/g, '\n')

const dockerfile = fuente('Dockerfile')
const despliegue = fuente('scripts', 'deploy.sh')
const ensayo = fuente('scripts', 'ensayar-casos.sh')

describe('el ensayo de los casos en el despliegue', () => {
  it('la etapa del ensayo existe, sale de las dependencias y no es la última', () => {
    const etapas = [...dockerfile.matchAll(/^FROM \S+ AS (\S+)$/gm)].map((m) => m[1])
    expect(etapas).toContain('ensayo')
    // Compose construye la última etapa: tiene que seguir siendo la de la aplicación.
    expect(etapas.at(-1)).toBe('runner')
    const etapa = dockerfile.slice(dockerfile.indexOf('AS ensayo'), dockerfile.indexOf('AS builder'))
    expect(etapa).toMatch(/COPY --from=deps \/app\/node_modules/)
    expect(etapa).not.toMatch(/npm run build/)
  })

  it('el guion construye esa etapa y lanza el ensayo que existe', () => {
    expect(ensayo).toMatch(/docker build [^\n]*--target ensayo /)
    expect(existsSync(join(RAIZ, 'scripts', 'ensayar-casos.ts'))).toBe(true)
    expect(ensayo).toMatch(/npx tsx scripts\/ensayar-casos\.ts --tablas-sin-copiar/)
    // Sin producción, Payload no aplica las migraciones y el ensayo leería una base sin las columnas nuevas.
    expect(ensayo).toMatch(/-e NODE_ENV=production/)
    // La copia se tira también si algo falla.
    expect(ensayo).toMatch(/trap limpiar EXIT/)
    expect(ensayo).toMatch(/dropdb/)
  })

  it('el despliegue ensaya después de construir y antes de cambiar el contenedor', () => {
    const construir = despliegue.indexOf('dc build app')
    const ensayar = despliegue.indexOf('./scripts/ensayar-casos.sh')
    const levantar = despliegue.indexOf('dc up -d --remove-orphans')
    expect(construir).toBeGreaterThan(-1)
    expect(ensayar).toBeGreaterThan(construir)
    expect(levantar).toBeGreaterThan(ensayar)
  })
})
