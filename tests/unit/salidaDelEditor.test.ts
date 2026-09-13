import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  apuntarCambiosSinGuardar,
  hayCambiosSinGuardar,
  PREGUNTA_DE_SALIDA,
  puedeSalirSinPerderCambios,
} from '@/admin/salidaDelEditor'

/**
 * La barra lateral del panel no saca a nadie de una ficha a medio escribir sin
 * preguntar.
 *
 * El editor ya preguntaba al salir por sus migas y por «Duplicar»; la barra
 * lateral, que está a la vista todo el rato mientras se edita, se llevaba lo
 * escrito sin una palabra. Lo que se fija aquí es el registro que las une sin
 * que se conozcan y, sobre todo, que las dos puntas lo usen: un registro al que
 * nadie se apunta, o que nadie consulta, pasa todas sus pruebas y no protege
 * nada.
 *
 * El entorno de la suite es `node` y no hay jsdom (ver `vitest.config.ts`): los
 * componentes se leen del disco, sin comentarios —los de esta casa citan el
 * código que explican y la prueba se cumpliría sola leyéndolos—.
 */

const fuente = (...partes: string[]): string =>
  readFileSync(join(process.cwd(), ...partes), 'utf8')

const codigoDe = (texto: string): string =>
  texto
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ')

const EDITOR = codigoDe(fuente('src', 'components', 'admin', 'FormularioDocumento.tsx'))
const BARRA = codigoDe(fuente('src', 'components', 'admin', 'NavegacionAdmin.tsx'))
const CONTORNO = codigoDe(fuente('src', 'app', '(frontend)', 'admin-panel', 'layout.tsx'))
const TALLER = codigoDe(fuente('src', 'components', 'admin', 'atlas', 'TallerDeAtlas.tsx'))

// Cada prueba desapunta lo que apunta; esto es por si una falla a medias y
// deja el registro sucio para las siguientes.
const pendientes: (() => void)[] = []
afterEach(() => {
  while (pendientes.length > 0) pendientes.pop()!()
})

describe('el registro de cambios sin guardar', () => {
  it('sin nada apuntado se sale sin preguntar', () => {
    let preguntas = 0
    expect(
      puedeSalirSinPerderCambios(() => {
        preguntas += 1
        return false
      }),
    ).toBe(true)
    expect(preguntas).toBe(0)
  })

  it('con algo apuntado pregunta, y la respuesta decide', () => {
    pendientes.push(apuntarCambiosSinGuardar())
    const vistas: string[] = []
    expect(puedeSalirSinPerderCambios((texto) => (vistas.push(texto), false))).toBe(false)
    expect(puedeSalirSinPerderCambios(() => true)).toBe(true)
    expect(vistas).toEqual([PREGUNTA_DE_SALIDA])
  })

  it('desapuntar dos veces no borra lo que otra pantalla sigue teniendo pendiente', () => {
    // El `useEffect` de React limpia dos veces en desarrollo. Con un contador,
    // la segunda limpieza se comería la marca de otra pantalla sucia.
    const primera = apuntarCambiosSinGuardar()
    const segunda = apuntarCambiosSinGuardar()
    pendientes.push(segunda)
    primera()
    primera()
    expect(hayCambiosSinGuardar()).toBe(true)
    segunda()
    expect(hayCambiosSinGuardar()).toBe(false)
  })

  it('pregunta a cada pantalla en el momento del clic, no al apuntarse', () => {
    // El taller del atlas se apunta una vez al montarse y su respuesta cambia
    // sin volver a pintar: girar la cámara no pasa por React. Si el registro
    // tomara la respuesta al apuntarse, se quedaría con el «nada que perder» de
    // antes del giro.
    let girado = false
    pendientes.push(apuntarCambiosSinGuardar(() => girado))
    expect(hayCambiosSinGuardar()).toBe(false)
    girado = true
    expect(hayCambiosSinGuardar()).toBe(true)
    girado = false
    expect(hayCambiosSinGuardar()).toBe(false)
  })

  it('basta con que una de las pantallas apuntadas tenga algo que perder', () => {
    pendientes.push(apuntarCambiosSinGuardar(() => false))
    expect(hayCambiosSinGuardar()).toBe(false)
    pendientes.push(apuntarCambiosSinGuardar())
    expect(hayCambiosSinGuardar()).toBe(true)
  })

  it('una pregunta que falla cuenta como cambios pendientes y no tumba la barra', () => {
    pendientes.push(
      apuntarCambiosSinGuardar(() => {
        throw new Error('el visor ya no está')
      }),
    )
    expect(hayCambiosSinGuardar()).toBe(true)
    expect(puedeSalirSinPerderCambios(() => false)).toBe(false)
  })

  it('la frase no habla de «ficha»: la barra no sabe qué pantalla la apuntó', () => {
    expect(PREGUNTA_DE_SALIDA).not.toMatch(/ficha/i)
  })
})

describe('el editor se apunta', () => {
  it('mientras tiene cambios sin guardar, y se desapunta al limpiar el efecto', () => {
    // `return apuntarCambiosSinGuardar()` es la limpieza: cubre el guardado que
    // quita la marca de cambios y el desmontaje al salir.
    expect(EDITOR).toMatch(
      /useEffect\(\(\) => \{ if \(!sucio\) return return apuntarCambiosSinGuardar\(\) \}, \[sucio\]\)/,
    )
  })

  it('y sus migas hacen la misma pregunta que la barra', () => {
    expect(EDITOR).toContain('confirm(PREGUNTA_DE_SALIDA)')
    expect(EDITOR).not.toContain('¿Salir igual?')
  })
})

describe('el taller del atlas se apunta', () => {
  // Es la otra pantalla del panel con trabajo que se pierde: una preparación
  // entera, piezas y encuadre. Tenía su `beforeunload` para cerrar la pestaña
  // y la barra lateral la sacaba igual sin preguntar.
  it('con la misma pregunta que ya usa para cerrar la pestaña', () => {
    // Con `.test()` y mensaje propio y no con `toMatch`: al fallar, `toMatch`
    // vuelca las mil líneas del taller y no dice qué falta.
    const importa =
      /import \{[^}]*\bapuntarCambiosSinGuardar\b[^}]*\} from '@\/admin\/salidaDelEditor'/.test(TALLER)
    expect(importa, 'TallerDeAtlas.tsx no importa apuntarCambiosSinGuardar de @/admin/salidaDelEditor').toBe(true)
    // Montado una vez y con la función del ref, no con `sucio`: el encuadre no
    // pasa por un pintado y un efecto colgado del estado no lo vería.
    const seApunta =
      /useEffect\(\(\) => apuntarCambiosSinGuardar\(\(\) => hayAlgoQuePerder\.current\(\)\), \[\]\)/.test(TALLER)
    expect(
      seApunta,
      'TallerDeAtlas.tsx no se apunta: falta `useEffect(() => apuntarCambiosSinGuardar(() => hayAlgoQuePerder.current()), [])` junto a su `beforeunload`',
    ).toBe(true)
  })
})

describe('la barra pregunta', () => {
  it('cada enlace de la navegación lateral lleva la guardia', () => {
    const enlaces = BARRA.match(/<Link\b/g) ?? []
    const guardados = BARRA.match(/onNavigate=\{alNavegar\}/g) ?? []
    // Dos `<Link>`: el de las entradas y el de `EnlaceConGuardia`.
    expect(enlaces.length).toBeGreaterThan(0)
    expect(guardados).toHaveLength(enlaces.length)
  })

  it('la guardia consulta el registro, no el formulario', () => {
    expect(BARRA).toContain('if (!puedeSalirSinPerderCambios()) evento.preventDefault()')
    expect(BARRA).not.toContain('FormularioDocumento')
  })

  it('el contorno del panel no deja ningún `<Link>` a secas en la barra', () => {
    // `layout.tsx` es de servidor y no puede darle a `<Link>` la función que
    // pregunta: «Volver a la plataforma» se escapaba por eso.
    expect(CONTORNO).not.toMatch(/<Link\b/)
    expect(CONTORNO).toContain('<EnlaceConGuardia href="/"')
  })

  it('«Salir» también pregunta antes de cerrar la sesión', () => {
    expect(CONTORNO).toMatch(/<GuardiaDeSalida> <BotonSalir [^>]*\/> <\/GuardiaDeSalida>/)
    // En captura: si se preguntara al burbujear, la sesión ya estaría cerrada.
    expect(BARRA).toContain('onClickCapture={alPulsar}')
    expect(BARRA).toMatch(/if \(puedeSalirSinPerderCambios\(\)\) return evento\.stopPropagation\(\)/)
  })
})
