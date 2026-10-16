import { describe, it, expect } from 'vitest'
import {
  agregarPieza,
  cambiarRolDePieza,
  desplazamientoEnMilimetros,
  hayFragmento,
  piezasConLasDelModelo,
  piezasHuerfanas,
  piezasSinUsar,
  quitarPieza,
  repararPiezasConElModelo,
  rolPorElNombre,
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

describe('rehacer las piezas cuando el modelo cambia (D-169)', () => {
  // El modelo nuevo es una exportación del atlas: sus objetos traen papel y etiqueta.
  const propuestas = [
    { nodo: 'Tibia_derecha_1_fragmento_distal', rol: 'fragmento' as const, etiqueta: 'Tibia derecha, distal' },
    { nodo: 'Tibia_derecha_2_fragmento_proximal', rol: 'hueso' as const, etiqueta: 'Tibia derecha, proximal' },
    { nodo: 'Esqueleto', rol: 'hueso' as const, etiqueta: 'Esqueleto' },
    { nodo: 'Musculos', rol: 'musculo' as const, etiqueta: 'Músculos' },
    { nodo: 'Piel', rol: 'piel' as const, etiqueta: 'Piel' },
  ]
  const enElArchivo = propuestas.map((p) => p.nodo)
  // El caso venía de otra exportación: ni un nombre coincide (el caso de la captura).
  const delOtroModelo = [
    { nodo: 'piel_vieja', rol: 'piel', etiqueta: '' },
    { nodo: 'Tibia_izquierda_1_2_1', rol: 'hueso', etiqueta: '' },
  ]

  it('rehace la lista con lo que propone el modelo y traduce lo que ve cada paso por su papel', () => {
    const r = repararPiezasConElModelo(
      delOtroModelo,
      [['piel_vieja'], ['Tibia_izquierda_1_2_1'], null],
      propuestas,
      enElArchivo,
    )
    expect(r).not.toBeNull()
    expect(r!.piezas.map((p) => p.nodo)).toEqual(enElArchivo)
    expect(r!.quitadas).toEqual(['piel_vieja', 'Tibia_izquierda_1_2_1'])
    expect(r!.muestraPorPaso[0]).toEqual(['Piel'])
    // El hueso viejo pasa a todo lo que ahora es hueso fijo.
    expect(r!.muestraPorPaso[1]).toEqual(['Tibia_derecha_2_fragmento_proximal', 'Esqueleto'])
    // Un paso que no declaraba nada sigue sin declarar nada: no se le inventa.
    expect(r!.muestraPorPaso[2]).toBeNull()
    expect(r!.perdidos).toEqual([])
  })

  it('al abrir un caso guardado no toca nada si alguna pieza sí está: ahí el autor decide', () => {
    const mezcla = [...delOtroModelo, { nodo: 'Piel', rol: 'piel', etiqueta: '' }]
    expect(repararPiezasConElModelo(mezcla, [], propuestas, enElArchivo)).toBeNull()
  })

  it('al cambiar de modelo conserva las que coinciden (con su papel) y rehace las demás', () => {
    // «Piel» se llama igual en los dos modelos y el autor la dejó como piel; el hueso no existe ya.
    const mezcla = [
      { nodo: 'Piel', rol: 'piel', etiqueta: 'Mi piel' },
      { nodo: 'Hueso_proximal', rol: 'hueso', etiqueta: '' },
      { nodo: 'Fragmento_distal', rol: 'fragmento', etiqueta: '' },
    ]
    const r = repararPiezasConElModelo(mezcla, [['Hueso_proximal', 'Piel']], propuestas, enElArchivo, true)
    expect(r).not.toBeNull()
    expect(r!.quitadas).toEqual(['Hueso_proximal', 'Fragmento_distal'])
    const piel = r!.piezas.find((p) => p.nodo === 'Piel')
    expect(piel).toMatchObject({ rol: 'piel', etiqueta: 'Mi piel' })
    expect(r!.piezas.map((p) => p.nodo).sort()).toEqual([...enElArchivo].sort())
    expect(r!.muestraPorPaso[0]).toEqual(['Tibia_derecha_2_fragmento_proximal', 'Esqueleto', 'Piel'])
  })

  it('al cambiar de modelo no hace nada si todas las piezas ya están', () => {
    const buenas = propuestas.map((p) => ({ nodo: p.nodo, rol: p.rol, etiqueta: p.etiqueta }))
    expect(repararPiezasConElModelo(buenas, [], propuestas, enElArchivo, true)).toBeNull()
  })

  it('no hace nada si el modelo no propone nada (no viene del atlas) o aún no se ha leído', () => {
    expect(repararPiezasConElModelo(delOtroModelo, [], [], enElArchivo)).toBeNull()
    expect(repararPiezasConElModelo(delOtroModelo, [], propuestas, [])).toBeNull()
  })

  it('no inventa piezas a un caso que no declaraba ninguna', () => {
    expect(repararPiezasConElModelo([], [], propuestas, enElArchivo)).toBeNull()
  })

  it('dice lo que un paso enseñaba y el modelo nuevo no tiene en ningún papel', () => {
    const sinPiel = propuestas.filter((p) => p.rol !== 'piel')
    const r = repararPiezasConElModelo(delOtroModelo, [['piel_vieja']], sinPiel, sinPiel.map((p) => p.nodo))
    expect(r!.perdidos).toEqual(['piel_vieja (piel)'])
    expect(r!.muestraPorPaso[0]).toEqual([])
  })

  it('deja un solo fragmento móvil aunque el modelo proponga dos', () => {
    const dos = [...propuestas, { nodo: 'Otro', rol: 'fragmento' as const, etiqueta: 'Otro' }]
    const r = repararPiezasConElModelo(delOtroModelo, [], dos, dos.map((p) => p.nodo))
    expect(r!.piezas.filter((p) => p.rol === 'fragmento')).toHaveLength(1)
  })
})

describe('las piezas con que se juega una cirugía recién creada (D-176)', () => {
  // Lo que lee la consola de una copia del modelo de la tibia del atlas: cada objeto con el papel que le escribió el
  // exportador. Es el caso del fallo: la cirugía no declara ninguna pieza y el bisturí no encontraba piel.
  const delAtlas = [
    { nodo: 'Piel', datos: { rol: 'piel', etiqueta: 'Piel' } },
    { nodo: 'Musculos', datos: { rol: 'musculo', etiqueta: 'Músculos' } },
    { nodo: 'Tibia_izquierda_1_1', datos: { rol: 'fragmento', etiqueta: 'Tibia, distal' } },
    { nodo: 'Tibia_izquierda_2', datos: { rol: 'hueso', etiqueta: 'Tibia, proximal' } },
  ]

  it('una cirugía sin piezas toma los papeles que trae el modelo', () => {
    const piezas = piezasConLasDelModelo([], delAtlas)
    expect(piezas.map((p) => [p.nodo, p.rol])).toEqual([
      ['Piel', 'piel'],
      ['Musculos', 'musculo'],
      ['Tibia_izquierda_1_1', 'fragmento'],
      ['Tibia_izquierda_2', 'hueso'],
    ])
    expect(piezas[1].etiqueta).toBe('Músculos')
  })

  it('lo que el caso declara manda sobre lo que dice el archivo', () => {
    // El traumatólogo marcó los músculos como hueso: raro, pero es su caso, y el archivo no le enmienda la plana.
    const piezas = piezasConLasDelModelo([{ nodo: 'Musculos', rol: 'hueso' as const, etiqueta: 'Mío' }], delAtlas)
    expect(piezas.filter((p) => p.nodo === 'Musculos')).toEqual([{ nodo: 'Musculos', rol: 'hueso', etiqueta: 'Mío' }])
    expect(piezas.map((p) => p.nodo)).toEqual(['Musculos', 'Piel', 'Tibia_izquierda_1_1', 'Tibia_izquierda_2'])
  })

  it('si el caso ya tiene fragmento, el del archivo entra como hueso fijo', () => {
    // Dos fragmentos móviles se juegan sin ningún error, y el residente reduce el que no se mide.
    const piezas = piezasConLasDelModelo([{ nodo: 'Tibia_izquierda_2', rol: 'fragmento' as const }], delAtlas)
    expect(piezas.filter((p) => p.rol === 'fragmento').map((p) => p.nodo)).toEqual(['Tibia_izquierda_2'])
    expect(piezas.find((p) => p.nodo === 'Tibia_izquierda_1_1')?.rol).toBe('hueso')
  })

  it('un modelo sin papeles escritos se entiende por el nombre, y lo que no se entiende se queda fuera', () => {
    const deBlender = [
      { nodo: 'skin', datos: {} },
      { nodo: 'Fémur', datos: null },
      { nodo: 'Cubo.001', datos: {} },
    ]
    const piezas = piezasConLasDelModelo([], deBlender)
    expect(piezas).toEqual([
      { nodo: 'skin', rol: 'piel', etiqueta: 'skin' },
      { nodo: 'Fémur', rol: 'hueso', etiqueta: 'Fémur' },
    ])
  })

  it('un papel escrito que no es de los cinco no cuenta y se mira el nombre', () => {
    // Blender deja propiedades con cualquier contenido: «Hueso» con mayúscula no lo reconoce ningún filtro de la consola.
    expect(piezasConLasDelModelo([], [{ nodo: 'Tibia', datos: { rol: 'Hueso' } }])).toEqual([
      { nodo: 'Tibia', rol: 'hueso', etiqueta: 'Tibia' },
    ])
  })

  it('con el modelo aún sin leer devuelve lo declarado tal cual', () => {
    const declaradas = [{ nodo: 'Piel', rol: 'piel' as const }]
    const piezas = piezasConLasDelModelo(declaradas, [])
    expect(piezas).toEqual(declaradas)
    // Una copia: la consola la usa como dependencia de memo y no debe poder tocar el caso.
    expect(piezas).not.toBe(declaradas)
  })
})

describe('el papel que sugiere el nombre (D-176)', () => {
  it.each([
    ['Piel', 'piel'],
    ['piel_pierna', 'piel'],
    ['Skin.001', 'piel'],
    ['Musculos', 'musculo'],
    ['Músculo tibial anterior', 'musculo'],
    ['Tendon_de_Aquiles', 'musculo'],
    ['Placa_LCP', 'implante'],
    ['Tornillo_3', 'implante'],
    ['Tibia_izquierda_2', 'hueso'],
    ['Esqueleto', 'hueso'],
    ['Peroné', 'hueso'],
    ['Calcaneus', 'hueso'],
  ])('«%s» es %s', (nombre, rol) => {
    expect(rolPorElNombre(nombre)).toBe(rol)
  })

  it('un nombre que no se entiende se queda sin papel en vez de adivinarlo', () => {
    expect(rolPorElNombre('Cubo.001')).toBeNull()
    expect(rolPorElNombre('Pierna')).toBeNull()
    expect(rolPorElNombre('')).toBeNull()
  })
})
