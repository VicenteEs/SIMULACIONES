import { describe, it, expect } from 'vitest'
import {
  capasQueEnciendeElPaso,
  declaracionDelPaso,
  medidaInicial,
  rangoDelDeslizadorDeFuerza,
  visibilidadDelPaso,
} from '@/lib/simulador'
import type { PiezaDelCaso } from '@/components/simulador/LienzoQuirurgico'

/**
 * Qué se ve en cada paso de la consola, con qué se gradúa la fuerza y de dónde
 * parten las medidas al abrir el caso.
 *
 * Las tres son reglas de dominio que vivían dentro del componente, donde
 * ninguna prueba llegaba: el lienzo en negro que arreglan estas líneas pasaba
 * la suite entera en verde y solo se veía recorriendo el caso en el navegador.
 * Ya están en `src/lib/simulador.ts`, que es donde se prueban sin abrir el
 * navegador; ahí está escrito por qué acabaron en ese módulo y no en
 * `piezasDelCaso.ts`.
 *
 * El tipo de las piezas se sigue pidiendo a `LienzoQuirurgico` a propósito
 * —`import type`, que se borra al compilar y no arrastra three.js—: las
 * funciones aceptan cualquier cosa con `nodo` y `rol`, y comprobar con el tipo
 * del llamador de verdad es lo que garantiza que ese hueco sigue encajando.
 */

const piezas: PiezaDelCaso[] = [
  { nodo: 'Piel', rol: 'piel' },
  { nodo: 'Musculo', rol: 'musculo' },
  { nodo: 'Tibia', rol: 'hueso' },
  { nodo: 'Fragmento', rol: 'fragmento' },
  { nodo: 'Placa', rol: 'implante' },
]

const apagadas = (...roles: string[]) => new Set(roles)

describe('lo que un paso declara ver', () => {
  it('un paso sin lista hereda la del último que dijera algo', () => {
    // Es la promesa escrita en el panel: «Deje la lista vacía para que se vea
    // lo mismo que en el paso anterior».
    const pasos = [{ muestra: ['Piel'] }, { muestra: [] }, { muestra: undefined }]
    expect(declaracionDelPaso(pasos, 2)).toEqual(['Piel'])
  })

  it('sin ninguna lista en todo el caso, no hay declaración', () => {
    expect(declaracionDelPaso([{ muestra: [] }, {}], 1)).toBeNull()
  })

  it('no se hereda hacia delante: el paso posterior no manda sobre el actual', () => {
    expect(declaracionDelPaso([{}, { muestra: ['Tibia'] }], 0)).toBeNull()
  })
})

describe('qué nodos se encienden', () => {
  it('sin declaración se ven todas las piezas menos el implante, cruzadas con las capas', () => {
    // El implante aparece en el paso que lo coloca, no antes: verlo puesto de
    // entrada resuelve el caso por el residente.
    const { nodos } = visibilidadDelPaso([{}], piezas, 0, apagadas('piel', 'musculo'))
    expect(nodos).toEqual(['Tibia', 'Fragmento'])
  })

  it('un paso que declara el implante lo enciende', () => {
    const { nodos } = visibilidadDelPaso(
      [{ muestra: ['Tibia', 'Placa'] }],
      piezas,
      0,
      apagadas('piel', 'musculo'),
    )
    expect(nodos).toEqual(['Tibia', 'Placa'])
  })

  it('el cruce con las capas nunca deja el lienzo vacío', () => {
    // Este es el fallo que costaba el caso entero: un paso de incisión que
    // declara solo la piel, con la piel apagada, se quedaba en lista vacía, y
    // una lista vacía apaga TODAS las mallas del modelo. Sin error, sin aviso y
    // con «Encuadrar» sin responder.
    const { nodos, encender } = visibilidadDelPaso(
      [{ muestra: ['Piel'] }],
      piezas,
      0,
      apagadas('piel', 'musculo'),
    )
    expect(nodos).toEqual(['Piel'])
    expect(encender, 'y dice qué capa hubo que encender, para que la casilla no mienta').toEqual([
      'piel',
    ])
  })

  it('un caso sin piezas escritas enseña el modelo entero, no un lienzo negro', () => {
    const { nodos } = visibilidadDelPaso([{}], [], 0, apagadas())
    expect(nodos, 'null es «todo visible»; [] sería «nada visible»').toBeNull()
  })

  it('con las capas encendidas no se toca nada', () => {
    const { nodos, encender } = visibilidadDelPaso([{ muestra: ['Piel'] }], piezas, 0, apagadas())
    expect(nodos).toEqual(['Piel'])
    expect(encender).toEqual([])
  })
})

describe('el paso manda sobre el interruptor de capas', () => {
  it('entrar en un paso enciende las capas que ese paso declara ver', () => {
    expect(
      capasQueEnciendeElPaso([{ muestra: ['Piel', 'Tibia'] }], piezas, 0, apagadas('piel', 'musculo')),
    ).toEqual(['piel'])
  })

  it('un paso que no declara nada no toca las capas', () => {
    // Aquí el residente manda: el caso no ha dicho nada, y el arranque en hueso
    // es lo que permite agarrar el fragmento para reducir.
    expect(capasQueEnciendeElPaso([{}], piezas, 0, apagadas('piel', 'musculo'))).toEqual([])
  })
})

describe('el deslizador de la fuerza', () => {
  it('deja pasarse por arriba y quedarse corto por abajo', () => {
    // Un deslizador acotado al rango bueno aprueba cualquier posición, y un
    // paso en el que no se puede fallar no enseña nada.
    const { min, max } = rangoDelDeslizadorDeFuerza({ fuerzaMinima: 200, fuerzaMaxima: 260 })
    expect(min).toBeLessThan(200)
    expect(max).toBeGreaterThan(260)
  })

  it('no se queda en el 0-120 inventado cuando el paso pide 200 N', () => {
    // Con el tope fijo, el rótulo se quedaba en «Fuerza · 200 N» con el pulgar
    // clavado en el extremo y el paso era imposible de superar.
    const { max } = rangoDelDeslizadorDeFuerza({ fuerzaMinima: 200 })
    expect(max).toBeGreaterThan(200)
  })

  it('con un solo tope declarado se puede cruzar ese tope', () => {
    expect(rangoDelDeslizadorDeFuerza({ fuerzaMaxima: 8 }).max).toBeGreaterThan(8)
    expect(rangoDelDeslizadorDeFuerza({ fuerzaMinima: 30 }).min).toBeLessThan(30)
  })

  it('nunca baja de cero: no hay fuerza negativa', () => {
    expect(rangoDelDeslizadorDeFuerza({ fuerzaMinima: 2, fuerzaMaxima: 4 }).min).toBe(0)
  })

  it('sin ningún rango se queda en el mando genérico', () => {
    expect(rangoDelDeslizadorDeFuerza({})).toEqual({ min: 0, max: 120 })
  })
})

describe('las medidas del caso recién abierto', () => {
  it('parte del desplazamiento que el caso declara, sin tocar nada', () => {
    // Es lo que ve el residente antes del primer arrastre, y es también lo que
    // devuelve «Volver al desplazamiento inicial».
    const m = medidaInicial({
      desplazamientoInicial: { x: 3, y: 12, z: 4, giroX: 0, giroY: 0, giroZ: 9.8 },
      ejeLargo: 'y',
    })
    // A lo largo del eje del hueso es hueco; de lado, desalineación.
    expect(m.diastasis).toBe(12)
    expect(m.desplazamiento).toBe(5)
    expect(m.angulacion).toBeCloseTo(9.8, 1)
  })

  it('respeta el eje largo que declare el caso', () => {
    const m = medidaInicial({ desplazamientoInicial: { x: 10 }, ejeLargo: 'x' })
    expect(m.diastasis).toBe(10)
    expect(m.desplazamiento).toBe(0)
  })

  it('un caso a medio escribir da ceros y no NaN', () => {
    // El traumatólogo guarda borradores incompletos todo el tiempo. Un
    // `undefined` colándose en la aritmética deja las tres medidas en NaN: el
    // panel enseña «NaN mm» y el paso de reducción no se puede superar nunca,
    // porque toda comparación contra NaN es falsa.
    for (const caso of [{}, { desplazamientoInicial: null }, { desplazamientoInicial: { x: 4 } }]) {
      const m = medidaInicial(caso)
      expect(Number.isNaN(m.desplazamiento), JSON.stringify(caso)).toBe(false)
      expect(Number.isNaN(m.diastasis), JSON.stringify(caso)).toBe(false)
      expect(Number.isNaN(m.angulacion), JSON.stringify(caso)).toBe(false)
    }
    expect(medidaInicial({})).toEqual({
      desplazamiento: 0,
      lateral: [
        { eje: 'x', mm: 0 },
        { eje: 'z', mm: 0 },
      ],
      diastasis: 0,
      angulacion: 0,
    })
  })
})
