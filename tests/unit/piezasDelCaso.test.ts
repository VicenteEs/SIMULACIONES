import { describe, it, expect } from 'vitest'
import {
  agregarPieza,
  cambiarRolDePieza,
  desplazamientoEnMilimetros,
  hayFragmento,
  piezasHuerfanas,
  piezasSinUsar,
  quitarPieza,
} from '@/lib/piezasDelCaso'

/**
 * Las reglas del taller de piezas.
 *
 * Todas protegen fallos que no dan error en pantalla: un caso con dos
 * fragmentos se abre y se juega, y una escala equivocada produce números
 * creíbles. Se prueban aquí porque mirando el formulario no se distinguen.
 */

describe('la lista de piezas', () => {
  it('la primera pieza que se señala se propone como fragmento', () => {
    // Es el único papel que el caso necesita sí o sí y el único que no se puede
    // deducir del nombre del objeto.
    const piezas = agregarPieza([], 'tibia_distal')
    expect(piezas).toHaveLength(1)
    expect(piezas[0].rol).toBe('fragmento')
    expect(piezas[0].nodo).toBe('tibia_distal')
  })

  it('las siguientes entran como hueso fijo, no como un segundo fragmento', () => {
    const piezas = agregarPieza(agregarPieza([], 'tibia_distal'), 'tibia_proximal')
    expect(piezas.map((p) => p.rol)).toEqual(['fragmento', 'hueso'])
  })

  it('señalar dos veces el mismo hueso no lo duplica', () => {
    // Pinchar dos veces es lo mas facil del mundo. Duplicar la fila dejaria dos
    // entradas del mismo objeto con papeles distintos y sin saber cual manda.
    const una = agregarPieza([], 'femur')
    expect(agregarPieza(una, 'femur')).toEqual(una)
  })

  it('marcar un segundo fragmento desmarca el primero', () => {
    // Dos fragmentos no son «uno de mas»: el visor se queda con el primero que
    // encuentra al recorrer el modelo, que no es el que el autor marco ultimo,
    // asi que el caso se comporta al reves de como se escribio. Y no avisa.
    const piezas = [
      { nodo: 'tibia_distal', rol: 'fragmento' },
      { nodo: 'tibia_proximal', rol: 'hueso' },
      { nodo: 'piel', rol: 'piel' },
    ]
    const despues = cambiarRolDePieza(piezas, 'tibia_proximal', 'fragmento')
    expect(despues.filter((p) => p.rol === 'fragmento')).toHaveLength(1)
    expect(despues.find((p) => p.nodo === 'tibia_proximal')?.rol).toBe('fragmento')
    expect(despues.find((p) => p.nodo === 'tibia_distal')?.rol).toBe('hueso')
    // Y no toca lo que no tiene que tocar.
    expect(despues.find((p) => p.nodo === 'piel')?.rol).toBe('piel')
  })

  it('cambiar a un papel que no es fragmento deja el fragmento en paz', () => {
    const piezas = [
      { nodo: 'tibia_distal', rol: 'fragmento' },
      { nodo: 'musculo', rol: 'hueso' },
    ]
    const despues = cambiarRolDePieza(piezas, 'musculo', 'musculo')
    expect(hayFragmento(despues)).toBe(true)
    expect(despues.find((p) => p.nodo === 'tibia_distal')?.rol).toBe('fragmento')
  })

  it('quitar una pieza deja las demás intactas', () => {
    const piezas = [{ nodo: 'a', rol: 'hueso' }, { nodo: 'b', rol: 'piel' }]
    expect(quitarPieza(piezas, 'a')).toEqual([{ nodo: 'b', rol: 'piel' }])
  })
})

describe('lo que la lista dice del archivo', () => {
  const enElArchivo = ['tibia_proximal', 'tibia_distal', 'musculo', 'piel']

  it('señala las piezas que el archivo no trae', () => {
    // El error que el taller existe para matar: una letra de diferencia entre
    // Blender y el formulario deja una capa que nunca aparece, y nada lo avisa.
    const piezas = [{ nodo: 'tibia_distal', rol: 'fragmento' }, { nodo: 'tibia distal', rol: 'hueso' }]
    expect(piezasHuerfanas(piezas, enElArchivo)).toEqual(['tibia distal'])
  })

  it('con el archivo aún sin leer no acusa a nadie', () => {
    // Una lista vacia no significa que el modelo no tenga objetos: significa que
    // todavia no se sabe. Marcar todo en rojo mientras carga seria mentir.
    const piezas = [{ nodo: 'tibia_distal', rol: 'fragmento' }]
    expect(piezasHuerfanas(piezas, [])).toEqual([])
  })

  it('lista lo que hay en el archivo y el caso no usa', () => {
    const piezas = [{ nodo: 'tibia_distal', rol: 'fragmento' }]
    expect(piezasSinUsar(piezas, enElArchivo)).toEqual(['tibia_proximal', 'musculo', 'piel'])
  })
})

describe('capturar el desplazamiento', () => {
  const estado = {
    posicion: { x: 0.0125, y: 0.018, z: 0 },
    giros: { x: 0, y: 0, z: 9.84 },
  }

  it('convierte las unidades del archivo a milímetros con la escala del caso', () => {
    // glTF viene en metros: 0,0125 unidades son 12,5 mm. Es el mismo caso de
    // prueba de la tibia, y sus numeros tienen que salir identicos.
    expect(desplazamientoEnMilimetros(estado, 1000)).toEqual({
      x: 12.5,
      y: 18,
      z: 0,
      giroX: 0,
      giroY: 0,
      giroZ: 9.8,
    })
  })

  it('un modelo exportado en milímetros usa escala 1 y no se multiplica', () => {
    const enMm = { posicion: { x: 12.5, y: 18, z: 0 }, giros: { x: 0, y: 0, z: 9.84 } }
    expect(desplazamientoEnMilimetros(enMm, 1)).toMatchObject({ x: 12.5, y: 18 })
  })

  it('sin escala declarada usa la de glTF y no cero', () => {
    // Multiplicar por cero daria un desplazamiento nulo: un caso ya reducido de
    // entrada, que se aprueba sin tocar nada y parece que funciona.
    expect(desplazamientoEnMilimetros(estado, 0)).toMatchObject({ x: 12.5, y: 18 })
  })
})
