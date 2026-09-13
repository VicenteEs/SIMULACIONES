import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MODULOS, rutaPublica } from '@/app/(frontend)/admin-panel/modulos'

/**
 * Qué módulos saben anotar una lectura, y cuál sigue sin saberlo.
 *
 * La cifra «por leer» de la portada es `totalFichas - leidas` (`page.tsx`):
 * `totalFichas` suma los conteos de los cinco módulos y `leidas` cuenta filas
 * de `actividad`. Un módulo cuyas fichas entran en la primera suma y nunca en
 * la segunda le pone a esa resta un suelo que no baja, y eso no se ve en
 * ninguna pantalla: la portada enseña un número perfectamente plausible. Es
 * justo lo que pasaba con Técnica AO y Lectura de imágenes.
 *
 * Se mira en el disco porque las fichas son componentes de servidor y no hay
 * prueba que las ejecute: olvidar el `<RastreadorActividad>` en una compila,
 * se despliega y solo se nota meses después.
 */

const RAIZ = join(process.cwd(), 'src', 'app', '(frontend)')

/** Los cuatro módulos con página por documento, con la carpeta de cada uno. */
const CON_FICHA = [
  { slug: 'patologias', carpeta: 'biblioteca' },
  { slug: 'casos-ao', carpeta: 'tecnica-ao' },
  { slug: 'cirugias', carpeta: 'simulador' },
  { slug: 'estudios-ia', carpeta: 'imagenes' },
]

const fichaDe = (carpeta: string): string =>
  readFileSync(join(RAIZ, carpeta, '[id]', 'page.tsx'), 'utf8')

/**
 * Las propiedades del `<RastreadorActividad>`, y solo las suyas.
 *
 * Buscar `coleccion="…"` en la fuente entera daría por bueno el atributo del
 * `<FormularioComentario>`, que está en las cuatro páginas y lleva el mismo
 * nombre: una ficha que pasara el slug al formulario y se lo olvidara al
 * rastreador saldría verde.
 */
function propiedadesDelRastreador(fuente: string): string {
  const inicio = fuente.indexOf('<RastreadorActividad')
  if (inicio === -1) return ''
  return fuente.slice(inicio, fuente.indexOf('/>', inicio))
}

describe('las cuatro fichas anotan su lectura', () => {
  it.each(CON_FICHA)('$carpeta monta el rastreador sobre «$slug»', ({ slug, carpeta }) => {
    const propiedades = propiedadesDelRastreador(fichaDe(carpeta))
    expect(propiedades).not.toBe('')
    expect(propiedades).toContain(`coleccion="${slug}"`)
    expect(propiedades).toContain('documentoId={id}')
  })

  it.each(CON_FICHA)('$carpeta pregunta si ya estaba leída antes de pintar la casilla', ({ carpeta }) => {
    // El rastreador es de cliente y nace con `completadoInicial`: sin la
    // consulta previa a `actividad` la casilla sale en blanco en cada carga y
    // el residente vuelve a marcar lo que ya tenía marcado.
    const fuente = fichaDe(carpeta)
    expect(propiedadesDelRastreador(fuente)).toContain('completadoInicial={')
    expect(fuente).toContain(`collection: 'actividad'`)
  })
})

describe('el examen físico es la excepción, y se sabe por qué', () => {
  it('no tiene página por documento', () => {
    // Si esto se pone en rojo es porque alguien creó la ficha por maniobra: hay
    // que montarle su `<RastreadorActividad>` y borrar de `tecnica-ao/[id]` y
    // de `imagenes/[id]` el párrafo que explica que «por leer» tiene suelo.
    expect(existsSync(join(RAIZ, 'examen-fisico', '[id]', 'page.tsx'))).toBe(false)
    expect(rutaPublica('maniobras', 7)).toBe('/examen-fisico#maniobra-7')
  })

  it('sus fichas siguen contando en la portada', () => {
    // La otra mitad del suelo: las maniobras entran en `totalFichas` porque
    // `maniobras` está en la lista de módulos que la portada cuenta. Mientras
    // no haya forma de marcarlas, «por leer» no puede bajar del número de
    // maniobras publicadas. Quitar el módulo de la lista no es el arreglo:
    // dejaría de contarse contenido que sí existe.
    expect(MODULOS.map((m) => m.slug)).toContain('maniobras')
    expect(MODULOS).toHaveLength(5)
  })
})
