import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RESULTADOS } from '@/lib/simulador'
import { MAXIMO_DE_COMPLICACIONES } from '@/lib/progresoDelSimulador'

/**
 * Lo que se comprueba antes de escribir el recorrido de un caso.
 *
 * Esta acción es la primera de `actividad` que guarda algo que el navegador
 * **calculó** en vez de algo que el residente pulsó, y por eso es la que más
 * tiene que mirar lo que llega. Una acción de servidor de Next se invoca por
 * HTTP con los argumentos que le manden, y aquí van a parar a una columna de
 * texto libre: sin filtro, lo que el panel enseñaría al profesor bajo «dónde se
 * atasca su gente» sería lo que alguien quisiera escribir.
 *
 * El módulo también se comprueba, y no es un detalle: la acción escribe siempre
 * en `cirugias` y no acepta el módulo como argumento. Dejarlo abierto permitía
 * colgarle una partida a una ficha de la biblioteca.
 */

const { estado, buscar, actualizar, crear, leerCaso } = vi.hoisted(() => ({
  estado: {
    usuario: { id: 4, rol: 'lector', activo: true } as Record<string, unknown> | null,
    activo: true,
  },
  buscar: vi.fn(),
  actualizar: vi.fn(),
  crear: vi.fn(),
  // El caso que lee el servidor para rehacer la nota (D-310).
  leerCaso: vi.fn(),
}))

vi.mock('@/lib/sesion', () => ({
  obtenerSesion: async () => ({
    usuario: estado.usuario,
    activo: estado.activo,
    rolReal: 'lector',
    rol: 'lector',
    simulando: false,
    usuarioEfectivo: estado.usuario,
  }),
}))

vi.mock('payload', () => ({
  getPayload: async () => ({ find: buscar, update: actualizar, create: crear, findByID: leerCaso }),
}))

vi.mock('@payload-config', () => ({ default: {} }))

import { registrarResultadoDeCirugia } from '@/app/(frontend)/acciones/actividad'

const complicacion = (extra: Record<string, unknown> = {}) => ({
  paso: 'p1',
  numero: 2,
  titulo: 'Fresado del canal',
  resultado: RESULTADOS.FUERZA_EXCESIVA,
  detalle: 'Se produce una complicación. (95 N · rango útil 20–60 N)',
  ...extra,
})

const recorrido = (extra: Record<string, unknown> = {}) => ({
  puntaje: 18,
  puntajeMaximo: 40,
  complicaciones: [complicacion()],
  ...extra,
})

/**
 * Un caso de dos pasos de 10, como lo devuelve Payload con profundidad 0: el instrumento es un número. El segundo pide
 * una incisión de 40 a 60 mm.
 */
const CASO_DE_DOS_PASOS = {
  id: 7,
  nombre: 'Caso de prueba',
  pasos: [
    { id: 'p1', titulo: 'Coger el bisturí', objetivo: 'instrumento', instrumento: 3, puntos: 10 },
    { id: 'p2', titulo: 'Incisión', objetivo: 'trazo', instrumento: 3, trazoMinimo: 40, trazoMaximo: 60, puntos: 10 },
  ],
}

/** El recorrido de ese caso: el primero a la primera, el segundo tras una incisión corta. Vale 10 + 5 de 20. */
const RECORRIDO_DE_LA_NOTA = {
  v: 1,
  pasos: [
    { paso: 'p1', intentos: [{ instrumento: '3' }] },
    { paso: 'p2', intentos: [{ instrumento: '3', trazo: 30 }, { instrumento: '3', trazo: 50 }] },
  ],
}

/** Lo que acabó en la base, venga de un `create` o de un `update`. */
const loEscrito = (): Record<string, unknown> =>
  (crear.mock.calls[0]?.[0] ?? actualizar.mock.calls[0]?.[0]).data as Record<string, unknown>

beforeEach(() => {
  buscar.mockReset()
  actualizar.mockReset()
  crear.mockReset()
  leerCaso.mockReset()
  leerCaso.mockResolvedValue(CASO_DE_DOS_PASOS)
  buscar.mockResolvedValue({ docs: [] })
  actualizar.mockResolvedValue({ id: 1 })
  crear.mockResolvedValue({ id: 1 })
  estado.usuario = { id: 4, rol: 'lector', activo: true }
  estado.activo = true
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('guardar el recorrido de un caso', () => {
  it('escribe el puntaje, su máximo y las complicaciones', async () => {
    await registrarResultadoDeCirugia('7', recorrido())
    expect(crear).toHaveBeenCalledTimes(1)
    expect(loEscrito()).toMatchObject({
      coleccion: 'cirugias',
      documentoId: '7',
      puntaje: 18,
      puntajeMaximo: 40,
    })
    expect((loEscrito().complicaciones as unknown[])).toHaveLength(1)
  })

  it('escribe siempre en cirugías: el módulo no es un argumento', async () => {
    // La acción recibe la ficha, no el módulo. Un puntaje colgado de una
    // patología haría que el panel contara casos del simulador que no existen.
    await registrarResultadoDeCirugia('7', recorrido())
    expect(loEscrito().coleccion).toBe('cirugias')
  })

  it('sustituye la lista entera, para que un recorrido nuevo borre el viejo', async () => {
    // La fila es una por usuario y ficha y describe el último recorrido. Sin
    // sustituir, repetir el caso acumularía las complicaciones de las dos veces.
    buscar.mockResolvedValue({ docs: [{ id: 5 }] })
    await registrarResultadoDeCirugia('7', recorrido({ complicaciones: [] }))
    expect(actualizar).toHaveBeenCalledTimes(1)
    expect(actualizar.mock.calls[0][0].data).toEqual({
      puntaje: 18,
      puntajeMaximo: 40,
      // Sin recorrido con que rehacerla, la nota es la que llegó y se dice (D-310); el `null` borra la del navegador
      // de un recorrido anterior que no coincidiera.
      comprobacionDeLaNota: 'sin-comprobar',
      notaDelNavegador: null,
      complicaciones: [],
      insumos: [],
      reduccionAutomatica: false,
    })
  })

  it('guarda los insumos del recorrido, con su cantidad y su categoría (P-004 E3)', async () => {
    await registrarResultadoDeCirugia(
      '7',
      recorrido({
        insumos: [
          { nombre: 'Bisturí de piel', categoria: 'corte', cantidad: 1 },
          { nombre: 'Tornillo cortical 3,5 mm × 36 mm', categoria: 'fijacion', cantidad: 4 },
        ],
      }),
    )
    expect(loEscrito().insumos).toEqual([
      { nombre: 'Bisturí de piel', categoria: 'corte', cantidad: 1 },
      { nombre: 'Tornillo cortical 3,5 mm × 36 mm', categoria: 'fijacion', cantidad: 4 },
    ])
  })

  it('un navegador de antes de los insumos no los manda y se guarda igual, con la lista vacía', async () => {
    // `recorrido()` no trae insumos: es lo que mandaba un navegador de antes.
    await registrarResultadoDeCirugia('7', recorrido())
    expect(loEscrito().insumos).toEqual([])
  })

  it('rechaza unos insumos que no son una lista, que no se nombran o que no cuentan un entero', async () => {
    for (const mal of ['una cadena', [{ cantidad: 1 }], [{ nombre: 'Bisturí', cantidad: 0 }], [{ nombre: 'Bisturí', cantidad: 1.5 }], [null]]) {
      await expect(registrarResultadoDeCirugia('7', recorrido({ insumos: mal as never }))).rejects.toThrow()
    }
    expect(crear).not.toHaveBeenCalled()
  })

  it('rechaza más insumos de los que caben', async () => {
    const muchos = Array.from({ length: 101 }, (_, i) => ({ nombre: `Insumo ${i}`, categoria: null, cantidad: 1 }))
    await expect(registrarResultadoDeCirugia('7', recorrido({ insumos: muchos }))).rejects.toThrow(/más de 100 insumos/)
  })

  it('un caso limpio se guarda igual', async () => {
    await registrarResultadoDeCirugia('7', recorrido({ puntaje: 40, complicaciones: [] }))
    expect(loEscrito().puntaje).toBe(40)
  })
})

describe('lo que llega se comprueba entero', () => {
  it('rechaza un desenlace que el motor no sabe producir', async () => {
    // Es la comprobación que sostiene la tabla del panel: agrupa por desenlace,
    // y un desenlace inventado no se puede agrupar con nada.
    await expect(
      registrarResultadoDeCirugia('7', recorrido({
        complicaciones: [complicacion({ resultado: 'hemorragia-masiva' })],
      })),
    ).rejects.toThrow(/no es un desenlace del simulador/i)
    expect(crear).not.toHaveBeenCalled()
  })

  it('rechaza «correcto», que por definición no es una complicación', async () => {
    await expect(
      registrarResultadoDeCirugia('7', recorrido({
        complicaciones: [complicacion({ resultado: RESULTADOS.CORRECTO })],
      })),
    ).rejects.toThrow()
    expect(crear).not.toHaveBeenCalled()
  })

  it('acepta todos los desenlaces con daño que el motor declara', async () => {
    // Se recorre la lista del motor y no se nombran dos: así un desenlace nuevo
    // entra vigilado solo, sin que nadie tenga que acordarse de esta prueba.
    for (const resultado of Object.values(RESULTADOS)) {
      if (resultado === RESULTADOS.CORRECTO) continue
      crear.mockClear()
      await registrarResultadoDeCirugia('7', recorrido({
        complicaciones: [complicacion({ resultado })],
      }))
      expect(crear, resultado).toHaveBeenCalledTimes(1)
    }
  })

  it('exige que la complicación diga de qué paso fue', async () => {
    await expect(
      registrarResultadoDeCirugia('7', recorrido({ complicaciones: [complicacion({ paso: '' })] })),
    ).rejects.toThrow()
  })

  it('rechaza puntajes que no son números de puntos', async () => {
    for (const puntaje of [-1, '18', null, undefined, NaN, Infinity]) {
      crear.mockClear()
      await expect(
        registrarResultadoDeCirugia('7', recorrido({ puntaje })),
        String(puntaje),
      ).rejects.toThrow()
      expect(crear).not.toHaveBeenCalled()
    }
  })

  it('acepta un puntaje decimal, porque el guion puede valer decimales', async () => {
    // `puntos` de cada paso es un `number` sin `min` y el formulario del panel
    // lo pinta con `step="any"`: un paso de 7,5 puntos es algo que el
    // traumatólogo puede escribir hoy. Exigiendo entero aquí, ese caso lanzaba
    // en cada hito —el residente leía «Su progreso no se pudo guardar» paso
    // tras paso y no quedaba nada guardado—, y encima la lectura (`cuenta()`
    // en `src/lib/progresoDelSimulador.ts`) ya aceptaba lo que esto rechazaba.
    await registrarResultadoDeCirugia('7', recorrido({ puntaje: 7.5, puntajeMaximo: 22.5 }))
    expect(crear).toHaveBeenCalledTimes(1)
    expect(loEscrito()).toMatchObject({ puntaje: 7.5, puntajeMaximo: 22.5 })
  })

  it('no deja que el puntaje pase del máximo del caso', async () => {
    // No es un cerrojo contra nadie —el puntaje lo calcula el navegador y eso
    // se acepta a sabiendas—: es que «90 de 40» no es un marcador, y se enseña
    // en la portada del residente y en el panel. Se recorta en vez de rechazar
    // para no perder también las complicaciones por una cuenta que no cuadra.
    await registrarResultadoDeCirugia('7', recorrido({ puntaje: 90, puntajeMaximo: 40 }))
    expect(loEscrito().puntaje).toBe(40)
    expect((loEscrito().complicaciones as unknown[])).toHaveLength(1)
  })

  it('rechaza una lista más larga que el tope de la columna', async () => {
    // La consola ya recorta antes de mandar, así que una lista más larga no es
    // un recorrido real. Y si llegara a Payload, rechazaría la escritura entera
    // —con el puntaje dentro— por su `maxRows`.
    const muchas = Array.from({ length: MAXIMO_DE_COMPLICACIONES + 1 }, () => complicacion())
    await expect(
      registrarResultadoDeCirugia('7', recorrido({ complicaciones: muchas })),
    ).rejects.toThrow(/complicaciones/i)
    expect(crear).not.toHaveBeenCalled()
  })

  it('acepta el tope justo', async () => {
    const justas = Array.from({ length: MAXIMO_DE_COMPLICACIONES }, () => complicacion())
    await registrarResultadoDeCirugia('7', recorrido({ complicaciones: justas }))
    expect((loEscrito().complicaciones as unknown[])).toHaveLength(MAXIMO_DE_COMPLICACIONES)
  })

  it('rechaza una ficha que no es un identificador', async () => {
    await expect(registrarResultadoDeCirugia('../../7', recorrido())).rejects.toThrow()
    expect(crear).not.toHaveBeenCalled()
  })

  it('rechaza lo que no tiene forma de recorrido', async () => {
    for (const basura of [null, undefined, 7, 'nada', { puntaje: 1 }]) {
      await expect(registrarResultadoDeCirugia('7', basura), String(basura)).rejects.toThrow()
    }
    expect(crear).not.toHaveBeenCalled()
  })
})

describe('cuando no se puede escribir', () => {
  it('propaga el fallo, porque el marcador en pantalla dice que sí se guardó', async () => {
    // Es la misma razón por la que `marcarComoLeida` lanza: hay un control en
    // pantalla afirmando lo contrario de lo ocurrido. Aquí el residente acaba
    // de recorrer un caso entero.
    crear.mockRejectedValue(new Error('no queda espacio en disco'))
    await expect(registrarResultadoDeCirugia('7', recorrido())).rejects.toThrow(/progreso/i)
  })

  it('avisa cuando la sesión ya no está activa en vez de resolver en falso', async () => {
    estado.activo = false
    await expect(registrarResultadoDeCirugia('7', recorrido())).rejects.toThrow(/sesión/i)
    expect(crear).not.toHaveBeenCalled()
  })

  it('se recupera cuando otra pestaña creó la fila entre la consulta y la escritura', async () => {
    // Abrir el caso y superar el primer paso son dos llamadas que viajan en
    // paralelo, y el índice único de `actividad` hace que el choque llegue.
    buscar.mockResolvedValueOnce({ docs: [] }).mockResolvedValue({ docs: [{ id: 5 }] })
    crear.mockRejectedValue(new Error('índice único'))
    await expect(registrarResultadoDeCirugia('7', recorrido())).resolves.toBeUndefined()
    expect(actualizar).toHaveBeenCalledTimes(1)
    expect(actualizar.mock.calls[0][0].id).toBe(5)
  })
})

describe('la nota la pone el servidor (D-310)', () => {
  it('rehace la cuenta con los pasos del caso y, si coincide, lo dice', async () => {
    await registrarResultadoDeCirugia('7', recorrido({ puntaje: 15, puntajeMaximo: 20, recorrido: RECORRIDO_DE_LA_NOTA }))
    expect(loEscrito()).toMatchObject({ puntaje: 15, puntajeMaximo: 20, comprobacionDeLaNota: 'coincide', notaDelNavegador: null })
    // Con el acceso de quien juega, como la página que monta la consola: un caso que no puede ver no se lee.
    expect(leerCaso).toHaveBeenCalledWith(expect.objectContaining({ collection: 'cirugias', id: '7', overrideAccess: false, depth: 0 }))
  })

  it('un puntaje escrito a mano no pasa: se guarda el del servidor y el del navegador queda al lado', async () => {
    // Lo que se cerró: la acción se llama por HTTP con lo que se le mande, y antes un 20 de 20 se guardaba tal cual.
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await registrarResultadoDeCirugia('7', recorrido({ puntaje: 20, puntajeMaximo: 20, recorrido: RECORRIDO_DE_LA_NOTA }))
    expect(loEscrito()).toMatchObject({
      puntaje: 15,
      puntajeMaximo: 20,
      comprobacionDeLaNota: 'no-coincide',
      notaDelNavegador: { puntaje: 20, puntajeMaximo: 20 },
    })
  })

  it('un recorrido roto no tira el resultado: se guarda sin comprobar, con sus complicaciones', async () => {
    await registrarResultadoDeCirugia('7', recorrido({ recorrido: { v: 1, pasos: 'no es una lista' } }))
    expect(loEscrito()).toMatchObject({ puntaje: 18, puntajeMaximo: 40, comprobacionDeLaNota: 'sin-comprobar' })
    expect(loEscrito().complicaciones as unknown[]).toHaveLength(1)
    expect(leerCaso).not.toHaveBeenCalled()
  })

  it('si el caso no se puede leer, tampoco se pierde el recorrido', async () => {
    leerCaso.mockRejectedValue(new Error('Forbidden'))
    await registrarResultadoDeCirugia('7', recorrido({ recorrido: RECORRIDO_DE_LA_NOTA }))
    expect(loEscrito()).toMatchObject({ puntaje: 18, puntajeMaximo: 40, comprobacionDeLaNota: 'sin-comprobar', notaDelNavegador: null })
  })
})

describe('el modo de la fila es el del recorrido (E4 de P-012)', () => {
  // El espía de `console.warn` es el mismo de una prueba a otra: se vacía para contar solo lo de cada una.
  it('con el recorrido, manda su modo aunque el resultado diga otro, y se apunta', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    aviso.mockClear()
    await registrarResultadoDeCirugia(
      '7',
      recorrido({ puntaje: 15, puntajeMaximo: 20, modo: 'practica', recorrido: { ...RECORRIDO_DE_LA_NOTA, modo: 'evaluacion' } }),
    )
    expect(loEscrito()).toMatchObject({ modoDelRecorrido: 'evaluacion', comprobacionDeLaNota: 'coincide' })
    expect(aviso).toHaveBeenCalledWith(expect.stringMatching(/no es el de su recorrido/))
  })

  it('si coinciden no se apunta nada, y un recorrido de antes, sin modo, deja el del resultado', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {})
    aviso.mockClear()
    await registrarResultadoDeCirugia(
      '7',
      recorrido({ puntaje: 15, puntajeMaximo: 20, modo: 'evaluacion', recorrido: { ...RECORRIDO_DE_LA_NOTA, modo: 'evaluacion' } }),
    )
    expect(loEscrito()).toMatchObject({ modoDelRecorrido: 'evaluacion' })
    expect(aviso).not.toHaveBeenCalled()
    crear.mockClear()
    await registrarResultadoDeCirugia('7', recorrido({ puntaje: 15, puntajeMaximo: 20, modo: 'practica', recorrido: RECORRIDO_DE_LA_NOTA }))
    expect(loEscrito()).toMatchObject({ modoDelRecorrido: 'practica', comprobacionDeLaNota: 'coincide' })
  })

  it('una evaluación con reducción automática no salió de la consola: queda sin comprobar', async () => {
    const enEvaluacion = { v: 1, modo: 'evaluacion', pasos: [{ paso: 'p1', intentos: [{ instrumento: '3' }], automatica: true }] }
    await registrarResultadoDeCirugia('7', recorrido({ modo: 'evaluacion', recorrido: enEvaluacion }))
    expect(loEscrito()).toMatchObject({ comprobacionDeLaNota: 'sin-comprobar', modoDelRecorrido: 'evaluacion' })
    expect(leerCaso).not.toHaveBeenCalled()
  })
})

describe('los tiempos del recorrido (P-012 E5)', () => {
  it('se guardan rehechos campo a campo: lo mal contado se queda fuera y no tira el resto', async () => {
    await registrarResultadoDeCirugia('7', recorrido({ tiempos: { procedimiento: 2520, disparos: 14, escopia: 20.5, manguito: -1 } }))
    expect(loEscrito()).toMatchObject({ puntaje: 18, tiempos: { procedimiento: 2520, disparos: 14 } })
    expect(loEscrito().tiempos).not.toHaveProperty('escopia')
  })

  it('sin la clave no se tocan, que es lo que manda un navegador de antes', async () => {
    await registrarResultadoDeCirugia('7', recorrido())
    expect(loEscrito()).not.toHaveProperty('tiempos')
  })

  it('vacíos o rotos se guardan como nada: un recorrido nuevo no se queda con los del anterior', async () => {
    await registrarResultadoDeCirugia('7', recorrido({ tiempos: {} }))
    expect(loEscrito().tiempos).toBeNull()
    crear.mockClear()
    await registrarResultadoDeCirugia('7', recorrido({ tiempos: 'roto' }))
    expect(loEscrito()).toMatchObject({ puntaje: 18, tiempos: null })
  })
})
