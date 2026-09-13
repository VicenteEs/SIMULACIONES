import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MODULOS, rutaPublica } from '@/app/(frontend)/admin-panel/modulos'

/**
 * Las fichas `[id]` de los módulos, ante quien no tiene el módulo.
 *
 * `listadosDeModulo.test.ts` vigila la dirección del listado, pero el enlace
 * que un compañero pasa por mensaje es el de una ficha, y ahí el fallo tenía
 * otra cara. Cada ficha envuelve su `findByID` en `.catch(() => null)` para que
 * una ficha retirada acabe en `notFound()`; ese `.catch` se traga también el
 * `Forbidden` de la regla de lectura, y el residente sin el módulo leía «Esta
 * ficha ya no está… No es un fallo de la plataforma» sobre una ficha publicada.
 * Es la mentira contraria que describe la cabecera de `SinAccesoAlModulo`.
 *
 * Qué módulos tienen ficha no se copia a mano: sale de `rutaPublica`, que es la
 * que compone el enlace que se comparte desde el panel. Si un módulo gana una
 * página por documento, esa función es la que lo anuncia —su cabecera lo dice
 * del examen físico— y la prueba lo recoge sin que nadie la toque. Filtrar por
 * lo que haya en el disco habría hecho lo contrario: una carpeta `[id]`
 * renombrada saldría de la vigilancia sin avisar.
 */

const RAIZ = join(process.cwd(), 'src', 'app', '(frontend)')

const FICHAS = MODULOS.filter((m) => rutaPublica(m.slug, 'x') === `${m.ruta}/x`).map(
  (m) => [m.nombre, m.slug, m.ruta] as const,
)

const fuenteDeLaFicha = (ruta: string): string =>
  readFileSync(join(RAIZ, ruta.slice(1), '[id]', 'page.tsx'), 'utf8')

/** Escapa un texto para meterlo tal cual en una expresión regular. */
const literal = (texto: string): string => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

describe('entrar por el enlace de una ficha a un módulo ajeno', () => {
  it('las fichas vigiladas son las cuatro que existen', () => {
    // Un recuento fijo a propósito: si `rutaPublica` cambia de forma y el
    // filtro de arriba deja de reconocer las fichas, la prueba de abajo pasaría
    // sobre una lista vacía y no guardaría nada.
    expect(FICHAS.map(([, slug]) => slug).sort()).toEqual(
      ['casos-ao', 'cirugias', 'estudios-ia', 'patologias'].sort(),
    )
    for (const [, , ruta] of FICHAS) {
      expect(existsSync(join(RAIZ, ruta.slice(1), '[id]', 'page.tsx')), `falta ${ruta}/[id]`).toBe(true)
    }
  })

  it.each(FICHAS)('la ficha de %s comprueba el módulo antes de consultar', (_nombre, slug, ruta) => {
    const codigo = fuenteDeLaFicha(ruta)

    // Con el usuario efectivo, que es el que va al `findByID`: una guardia
    // hecha con el real dejaría pasar a un administrador en vista previa, y la
    // consulta con su rol simulado volvería a acabar en «ya no está».
    const guardia = new RegExp(
      `!puedeVerModulo\\(\\s*usuarioEfectivo[^,]*,\\s*'${literal(slug)}'\\s*\\)\\s*\\)\\s*\\{?\\s*return\\s*<SinAccesoAlModulo\\b`,
    )
    const encontrada = guardia.exec(codigo)
    expect(
      encontrada,
      `la ficha de «${slug}» no pregunta a puedeVerModulo con el usuario efectivo, o no pinta SinAccesoAlModulo`,
    ).not.toBeNull()

    // Después del `findByID` no guarda nada: su `.catch` ya ha convertido el
    // `Forbidden` en `notFound()` cuando la guardia llega.
    const consulta = codigo.indexOf('.findByID(')
    expect(consulta).toBeGreaterThan(-1)
    expect(encontrada!.index).toBeLessThan(consulta)
  })

  it.each(FICHAS)('la ficha de %s titula igual las dos pantallas de acceso', (_nombre, _slug, ruta) => {
    const codigo = fuenteDeLaFicha(ruta)

    // Quien no tiene sesión y quien no tiene el módulo están en la misma
    // página: si el título cambia entre una pantalla y otra, parece que se ha
    // llegado a dos sitios distintos.
    const sinSesion = /<SinAcceso titulo="([^"]+)"/.exec(codigo)?.[1]
    const sinModulo = /<SinAccesoAlModulo titulo="([^"]+)"/.exec(codigo)?.[1]
    expect(sinSesion).toBeDefined()
    expect(sinModulo).toBe(sinSesion)
  })
})
