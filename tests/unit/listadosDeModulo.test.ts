import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MODULOS } from '@/app/(frontend)/admin-panel/modulos'
import { COLECCIONES } from '@/collections'
import { puedeVerModulo, type UsuarioSesion } from '@/access/reglas'
import { SinAccesoAlModulo } from '@/components/Estados'

/**
 * Los listados de los cinco módulos, ante quien no debe estar ahí.
 *
 * Son dos fallos distintos con la misma cara: un residente que llega a una
 * pantalla que no le explica nada.
 *
 *   - Quien escribe a mano la dirección de un módulo que no tiene. La barra y
 *     la portada ya se lo escondían, pero la consulta del listado lanzaba
 *     `Forbidden` y acababa en `error.tsx`, que pide reintentar una avería que
 *     no existe. Ahora cada listado pregunta a `puedeVerModulo` antes de
 *     consultar y pinta `SinAccesoAlModulo`.
 *   - El estado vacío que ofrecía «Crear el primero» a cualquiera. Llevaba al
 *     panel, y el panel devuelve a la portada sin una palabra a quien no es
 *     admin ni editor. Técnica AO e Imágenes eran las dos que quedaban.
 *
 * Las páginas son componentes de servidor que no se pueden ejecutar aquí sin
 * base, así que se miran en el disco. La lista de listados sale de
 * `admin-panel/modulos.ts`, la tabla de la que ya salen la barra y la portada, y
 * no se copia: un sexto módulo entra solo en la vigilancia, en vez de quedarse
 * fuera de ella sin que nada lo note, que es exactamente como se quedaron fuera
 * Técnica AO e Imágenes de la prueba de `paginasPublicas.test.ts`.
 *
 * Ojo: el examen físico está dentro. Lo arregla otro lote en paralelo con este
 * mismo componente; si esta prueba falla solo en él, es que ese trabajo
 * todavía no ha llegado, no que la prueba esté mal.
 */

const RAIZ = join(process.cwd(), 'src', 'app', '(frontend)')
const fuenteDe = (ruta: string): string => readFileSync(join(RAIZ, ruta.slice(1), 'page.tsx'), 'utf8')

const LISTADOS = MODULOS.map((m) => [m.nombre, m.slug, m.ruta] as const)

/** Escapa un texto para meterlo tal cual en una expresión regular. */
const literal = (texto: string): string => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

describe('entrar por la dirección a un módulo ajeno', () => {
  it.each(LISTADOS)('%s comprueba el módulo antes de consultar', (_nombre, slug, ruta) => {
    const codigo = fuenteDe(ruta)

    // Con el usuario efectivo y no con `usuario`: la consulta va con el
    // efectivo, y un administrador en vista previa pasaría una guardia hecha
    // con el real para estrellarse en el `find` con el mismo `Forbidden`.
    const guardia = new RegExp(
      `!puedeVerModulo\\(\\s*usuarioEfectivo[^,]*,\\s*'${literal(slug)}'\\s*\\)\\s*\\)\\s*\\{?\\s*return\\s*<SinAccesoAlModulo\\b`,
    )
    const encontrada = guardia.exec(codigo)
    expect(encontrada, `la guardia de «${slug}» falta o no pinta SinAccesoAlModulo`).not.toBeNull()

    // Una guardia puesta después del `find` no guarda nada: el `Forbidden` ya
    // se ha lanzado cuando llega.
    const primeraConsulta = codigo.indexOf('.find(')
    expect(primeraConsulta).toBeGreaterThan(-1)
    expect(encontrada!.index).toBeLessThan(primeraConsulta)
  })

  /**
   * La guardia y la regla de la colección tienen que decir lo mismo.
   *
   * Si la colección dejara de restringir por módulo, la guardia cerraría una
   * página cuyo contenido la base sí entregaría; si la guardia preguntara por
   * otro módulo, volvería el `Forbidden`. Se comprueba contra la regla que la
   * colección declara de verdad, no contra `filtroDeLecturaDeModulo` suelto.
   */
  it.each(LISTADOS)('la guardia de %s coincide con la regla de lectura de su colección', (_n, slug) => {
    const coleccion = COLECCIONES.find((c) => c.slug === slug)
    const leer = coleccion?.access?.read
    expect(leer, `la colección «${slug}» no declara lectura`).toBeTypeOf('function')

    const otro = MODULOS.find((m) => m.slug !== slug)!.slug
    const conOtroModulo = { id: '1', rol: 'lector', activo: true, modulosVisibles: [otro] } as UsuarioSesion
    const conEste = { ...conOtroModulo, modulosVisibles: [slug] }

    const reglaCon = (u: UsuarioSesion) => Boolean(leer!({ req: { user: u } } as never))

    expect(puedeVerModulo(conOtroModulo, slug)).toBe(false)
    expect(reglaCon(conOtroModulo)).toBe(false)
    expect(puedeVerModulo(conEste, slug)).toBe(true)
    expect(reglaCon(conEste)).toBe(true)
  })

  it('la pantalla dice que falta un permiso y ofrece volver', () => {
    const html = renderToStaticMarkup(createElement(SinAccesoAlModulo, { titulo: 'Técnica AO' }))

    expect(html).toContain('<h1>Técnica AO</h1>')
    expect(html).toContain('no tiene acceso a este módulo')
    expect(html).toMatch(/<a [^>]*href="\/"/)
    // Ni el panel, que expulsa a un residente, ni un «volver a intentarlo»,
    // que es lo que decía `error.tsx` y reintentar da siempre lo mismo.
    expect(html).not.toContain('/admin-panel')
    expect(html).not.toMatch(/intentarlo/i)
  })
})

describe('el estado vacío no ofrece el panel a quien no puede entrar', () => {
  it.each(LISTADOS)('%s condiciona el enlace al panel con su propio permiso', (_nombre, slug, ruta) => {
    const codigo = fuenteDe(ruta)

    // Un literal no puede depender del rol, así que un literal es el fallo.
    expect(codigo).not.toMatch(/enlace="\/admin-panel/)

    // Con el rol real, como la portada, y con el permiso del módulo propio: un
    // editor restringido a otro módulo tampoco debe recibir un enlace que el
    // guardado le va a rechazar.
    expect(codigo).toMatch(/rolReal === 'admin' \|\| rolReal === 'editor'/)
    expect(codigo).toMatch(new RegExp(`puedeEditar\\(\\s*usuario \\?\\? \\{\\}\\s*,\\s*'${literal(slug)}'\\s*\\)`))
  })
})
