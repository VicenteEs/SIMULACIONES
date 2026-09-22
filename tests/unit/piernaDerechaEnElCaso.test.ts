import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import {
  baseQueRegistra,
  CASO_DE_PRUEBA,
  corteParaLaFractura,
  ejecutar,
  elegirPorNombre,
  leerArgumentos,
  ParadaDelGuion,
  planDelCaso,
  sinSecretos,
  traducirMuestra,
  type BaseDelGuion,
  type CasoLeido,
} from '../../scripts/pierna-derecha-en-el-caso'

/**
 * El guion que pone la preparación «pierna derecha» en el caso de prueba.
 *
 * Tres cosas que se rompen sin que nada falle a la vista, y por eso se prueban
 * aquí y no mirando la consola:
 *
 *  1. **Lo que ve cada paso, traducido por papel.** Un paso que enseñaba
 *     `tibia_distal` y se queda enseñando un nodo que no existe no da error:
 *     hereda lo del paso anterior y enseña otra cosa.
 *  2. **La segunda ejecución no cambia nada.** Ni un segundo modelo ni piezas
 *     repetidas. Se prueba con la exportación de verdad, contra el atlas
 *     instalado y una base en memoria que se comporta como Payload en lo que
 *     importa: identificadores numéricos, archivos en disco y la relación del
 *     modelo rechazada si llega como texto, que es el fallo que tuvo la primera
 *     prueba contra PostgreSQL.
 *  3. **Simular no escribe.** Ni en la base ni en el disco.
 */

// ------------------------------------------------------------ base de mentira

type Doc = Record<string, unknown> & { id: number }

/**
 * Una base en memoria con la forma de la API local de Payload que usa el guion.
 *
 * Imita tres conductas de la real, porque de ellas depende lo que se prueba:
 * los identificadores son números, `create` con archivo lo deja en `staticDir`
 * con su `filename`, y `update` rechaza una relación con el identificador en
 * texto, como hace la validación de Payload con PostgreSQL.
 */
function baseEnMemoria() {
  const directorio = mkdtempSync(join(tmpdir(), 'pierna-modelos-'))
  const tablas = new Map<string, Doc[]>()
  let siguiente = 1
  // Un reloj que siempre avanza: dos documentos creados en el mismo milisegundo
  // harían que «creado después de guardar la preparación» dependiera de la suerte.
  let reloj = Date.parse('2026-09-14T08:00:00.000Z')
  const ahora = () => new Date((reloj += 1000)).toISOString()
  const tabla = (coleccion: string) => {
    if (!tablas.has(coleccion)) tablas.set(coleccion, [])
    return tablas.get(coleccion)!
  }

  const base = {
    find: vi.fn(async ({ collection, where }: Record<string, unknown>) => {
      const igual = (where as { nombre?: { equals?: unknown } } | undefined)?.nombre?.equals
      const docs = tabla(String(collection)).filter((d) => igual === undefined || d.nombre === igual)
      return { docs: structuredClone(docs) }
    }),
    findByID: vi.fn(async ({ collection, id }: Record<string, unknown>) => {
      const doc = tabla(String(collection)).find((d) => String(d.id) === String(id))
      if (!doc) throw new Error(`No existe ${String(collection)} #${String(id)}`)
      return structuredClone(doc)
    }),
    create: vi.fn(async ({ collection, data, file }: Record<string, unknown>) => {
      const fecha = ahora()
      const doc: Doc = { ...structuredClone(data as object), id: siguiente++, createdAt: fecha, updatedAt: fecha }
      const archivo = file as { data: Buffer; name: string } | undefined
      if (archivo) {
        writeFileSync(join(directorio, archivo.name), archivo.data)
        doc.filename = archivo.name
      }
      tabla(String(collection)).push(doc)
      return structuredClone(doc)
    }),
    update: vi.fn(async ({ collection, id, data }: Record<string, unknown>) => {
      const doc = tabla(String(collection)).find((d) => String(d.id) === String(id))
      if (!doc) throw new Error(`No existe ${String(collection)} #${String(id)}`)
      const cambios = data as Record<string, unknown>
      if ('modelo' in cambios && typeof cambios.modelo !== 'number') {
        throw new Error('El siguiente campo es inválido: Modelo 3D del caso')
      }
      Object.assign(doc, structuredClone(cambios), { updatedAt: ahora() })
      return structuredClone(doc)
    }),
    delete: vi.fn(async () => {
      throw new Error('El guion no borra nada.')
    }),
    collections: { 'modelos-3d': { config: { upload: { staticDir: directorio } } } },
  }

  return {
    base,
    directorio,
    tablas,
    sembrar: (coleccion: string, datos: Record<string, unknown>) => {
      const fecha = ahora()
      const doc: Doc = { ...datos, id: siguiente++, createdAt: fecha, updatedAt: fecha }
      tabla(coleccion).push(doc)
      return doc
    },
    foto: () => JSON.stringify([...tablas.entries()]),
    limpiar: () => rmSync(directorio, { recursive: true, force: true }),
  }
}

/**
 * La tibia, el peroné, un músculo, una arteria y la piel derechos del atlas.
 *
 * Pocos a propósito, para que la exportación de verdad quepa en una prueba. El
 * músculo es el peroneo corto, que el atlas de origen mete en el esqueleto y la
 * plataforma corrige: así el papel de músculo del modelo nuevo sale de la
 * corrección, que es por donde se rompería.
 */
const PIEZAS_DE_LA_PIERNA = ['FJ3387', 'FJ3366', 'FJ1409', 'FJ2130', 'FJ2810']

/** El caso de prueba, con lo que de él lee y escribe el guion (ver `scripts/caso-de-prueba.ts`). */
function sembrarElCaso(m: ReturnType<typeof baseEnMemoria>) {
  const modeloViejo = m.sembrar('modelos-3d', { nombre: 'Tibia de prueba (partida)', filename: 'tibia-de-prueba.glb' })
  const hueso = m.sembrar('huesos-ao', { nombre: 'Tibia (diáfisis)', codigo: '42' })
  const clasificacion = m.sembrar('clasificaciones-ao', { codigo: 'A2', nombre: 'Simple oblicua', tipo: 'A' })
  const preparacion = m.sembrar('instancias-atlas', {
    nombre: 'Pierna Derecha',
    contenido: { version: 1, atlas: 'x', piezas: PIEZAS_DE_LA_PIERNA.map((id) => ({ id })), vista: {} },
  })
  const caso = m.sembrar('cirugias', {
    nombre: CASO_DE_PRUEBA,
    _status: 'published',
    hueso: hueso.id,
    clasificacion: clasificacion.id,
    modelo: modeloViejo.id,
    milimetrosPorUnidad: 1000,
    ejeLargo: 'y',
    piezas: [
      { id: 'p1', nodo: 'piel', etiqueta: 'Piel', rol: 'piel' },
      { id: 'p2', nodo: 'musculo', etiqueta: 'Compartimento anterior', rol: 'musculo' },
      { id: 'p3', nodo: 'tibia_proximal', etiqueta: 'Fragmento proximal', rol: 'hueso' },
      { id: 'p4', nodo: 'tibia_distal', etiqueta: 'Fragmento distal', rol: 'fragmento' },
    ],
    desplazamientoInicial: { x: 12.5, y: 18, z: 0, giroX: 0, giroY: 0, giroZ: 9.8 },
    pasos: [
      {
        id: 'a',
        titulo: 'Incisión de abordaje proximal',
        objetivo: 'trazo',
        trazoMinimo: 25,
        trazoMaximo: 80,
        muestra: ['piel', 'musculo', 'tibia_proximal', 'tibia_distal'].map((nodo, i) => ({ id: `a${i}`, nodo })),
      },
      {
        id: 'b',
        titulo: 'Reducción cerrada de la fractura',
        objetivo: 'reduccion',
        toleranciaDesplazamiento: 5,
        toleranciaDiastasis: 4,
        toleranciaAngulacion: 5,
        muestra: [{ id: 'b0', nodo: 'tibia_proximal' }, { id: 'b1', nodo: 'tibia_distal' }],
      },
      { id: 'c', titulo: 'Paso sin muestra', objetivo: 'instrumento', muestra: [] },
    ],
  })
  return { caso, preparacion, modeloViejo }
}

const casoDe = (m: ReturnType<typeof baseEnMemoria>) => m.tablas.get('cirugias')![0] as unknown as CasoLeido
const muestraDe = (caso: CasoLeido, i: number) => (caso.pasos![i].muestra ?? []).map((f) => f.nodo)

type CatalogoCrudo = { version: string; paquetes: { archivo: string }[]; piezas: { id: string; sistema: string }[] }

/** Directorios de atlas de mentira creados por una prueba, para borrarlos al terminar. */
const atlasTemporales: string[] = []

/**
 * Un atlas en otra carpeta: el `catalogo.json` instalado, cambiado por `cambiar`,
 * y los mismos paquetes de geometría.
 *
 * Los paquetes no se copian —son treinta megabytes—: el catálogo los nombra con
 * una ruta relativa hasta `public/atlas`, que `exportarPreparacion` resuelve con
 * `join(directorio, archivo)`. Una carpeta por llamada porque el catálogo leído
 * se recuerda por directorio, y reutilizar una daría el catálogo de antes.
 *
 * La versión del catálogo NO se toca: es justo lo que pasa cuando se añade una
 * corrección de sistema o se arregla el exportador, y lo que el guion no veía.
 */
function atlasCambiado(cambiar: (catalogo: CatalogoCrudo) => void): string {
  const instalado = resolve('public', 'atlas')
  const directorio = mkdtempSync(join(tmpdir(), 'pierna-atlas-'))
  atlasTemporales.push(directorio)
  const catalogo = JSON.parse(readFileSync(join(instalado, 'catalogo.json'), 'utf8')) as CatalogoCrudo
  for (const paquete of catalogo.paquetes) {
    paquete.archivo = relative(directorio, join(instalado, paquete.archivo))
  }
  cambiar(catalogo)
  writeFileSync(join(directorio, 'catalogo.json'), JSON.stringify(catalogo))
  return directorio
}

let memoria: ReturnType<typeof baseEnMemoria>
beforeEach(() => {
  memoria = baseEnMemoria()
})
afterEach(() => {
  memoria.limpiar()
  for (const directorio of atlasTemporales.splice(0)) rmSync(directorio, { recursive: true, force: true })
})

// --------------------------------------------------------- 1. por su papel

describe('traducirMuestra: lo que ve un paso pasa al modelo nuevo por su papel', () => {
  const rolesViejos = new Map([
    ['piel', 'piel'],
    ['musculo', 'musculo'],
    ['tibia_proximal', 'hueso'],
    ['tibia_distal', 'fragmento'],
    ['clavo', 'implante'],
  ])
  const piezasNuevas = [
    { nodo: 'Tibia_derecha_fragmento_proximal', rol: 'hueso' },
    { nodo: 'Tibia_derecha_fragmento_distal', rol: 'fragmento' },
    { nodo: 'Musculos', rol: 'musculo' },
    { nodo: 'Esqueleto', rol: 'hueso' },
    { nodo: 'Arterias', rol: 'musculo' },
    { nodo: 'Piel', rol: 'piel' },
  ]
  const nodos = piezasNuevas.map((p) => p.nodo)

  it('la piel sigue siendo la piel, el hueso fijo todo lo fijo y el fragmento el fragmento', () => {
    expect(traducirMuestra(['piel'], rolesViejos, piezasNuevas, nodos).muestra).toEqual(['Piel'])
    expect(traducirMuestra(['musculo'], rolesViejos, piezasNuevas, nodos).muestra).toEqual([
      'Musculos',
      'Arterias',
    ])
    expect(
      traducirMuestra(['tibia_proximal', 'tibia_distal'], rolesViejos, piezasNuevas, nodos).muestra,
    ).toEqual(['Tibia_derecha_fragmento_proximal', 'Esqueleto', 'Tibia_derecha_fragmento_distal'])
  })

  it('no repite un nodo aunque dos viejos tengan el mismo papel', () => {
    const roles = new Map([...rolesViejos, ['perone', 'hueso']])
    const { muestra } = traducirMuestra(['tibia_proximal', 'perone'], roles, piezasNuevas, nodos)
    expect(muestra).toEqual(['Tibia_derecha_fragmento_proximal', 'Esqueleto'])
  })

  it('un nodo que ya es del modelo nuevo se queda como está, y no se le añade nada', () => {
    // Un paso que el traumatólogo afinó a mano: solo el trozo proximal. Volver a
    // traducirlo no le devuelve el esqueleto.
    const { muestra, perdidos } = traducirMuestra(
      ['Tibia_derecha_fragmento_proximal'],
      rolesViejos,
      piezasNuevas,
      nodos,
    )
    expect(muestra).toEqual(['Tibia_derecha_fragmento_proximal'])
    expect(perdidos).toEqual([])
  })

  it('dice lo que se pierde: un papel que nadie tiene en el modelo nuevo, o un nodo sin papel', () => {
    const { muestra, perdidos } = traducirMuestra(
      ['clavo', 'fantasma', 'tibia_distal'],
      rolesViejos,
      piezasNuevas,
      nodos,
    )
    expect(muestra).toEqual(['Tibia_derecha_fragmento_distal'])
    expect(perdidos).toEqual(['clavo (implante)', 'fantasma'])
  })
})

describe('planDelCaso', () => {
  const modelo = {
    id: 9,
    nodos: ['Tibia_derecha_fragmento_proximal', 'Tibia_derecha_fragmento_distal', 'Musculos', 'Piel'],
    propuestas: [
      { nodo: 'Tibia_derecha_fragmento_proximal', rol: 'hueso' as const, etiqueta: 'Tibia derecha, fragmento proximal' },
      { nodo: 'Tibia_derecha_fragmento_distal', rol: 'fragmento' as const, etiqueta: 'Tibia derecha, fragmento distal' },
      { nodo: 'Musculos', rol: 'musculo' as const, etiqueta: 'Músculos' },
      { nodo: 'Piel', rol: 'piel' as const, etiqueta: 'Piel' },
    ],
  }
  const caso = (): CasoLeido => {
    const m = baseEnMemoria()
    const { caso } = sembrarElCaso(m)
    m.limpiar()
    return structuredClone(caso) as unknown as CasoLeido
  }

  it('quita las piezas viejas antes de rellenar, así el fragmento es el trozo distal y no un hueso fijo', () => {
    const plan = planDelCaso(caso(), modelo)
    expect(plan.datos.piezas.map((p) => [p.nodo, p.rol])).toEqual([
      ['Tibia_derecha_fragmento_proximal', 'hueso'],
      ['Tibia_derecha_fragmento_distal', 'fragmento'],
      ['Musculos', 'musculo'],
      ['Piel', 'piel'],
    ])
    expect(plan.hayCambios).toBe(true)
    expect(plan.datos.pasos[0].muestra!.map((f) => f.nodo)).toEqual([
      'Piel',
      'Musculos',
      'Tibia_derecha_fragmento_proximal',
      'Tibia_derecha_fragmento_distal',
    ])
    // El paso sin muestra sigue sin ella: vacía significa «lo del anterior».
    expect(plan.datos.pasos[2].muestra).toEqual([])
  })

  it('aplicado sobre su propio resultado no cambia nada', () => {
    const primero = planDelCaso(caso(), modelo)
    const segundo = planDelCaso({ ...caso(), ...primero.datos }, modelo)
    expect(segundo.hayCambios).toBe(false)
    expect(segundo.datos.piezas).toEqual(primero.datos.piezas)
  })

  it('pone la escala del atlas y deja los milímetros del caso como estaban', () => {
    // Un caso escrito contra un modelo en milímetros: 12,5 mm siguen siendo
    // 12,5 mm en uno en metros, y lo que cambia es el número que los convierte.
    const enMilimetros = { ...caso(), milimetrosPorUnidad: 1 }
    const plan = planDelCaso(enMilimetros, modelo)
    expect(plan.datos.milimetrosPorUnidad).toBe(1000)
    expect(plan.datos).not.toHaveProperty('desplazamientoInicial')
    const reduccion = plan.datos.pasos[1]
    expect([reduccion.toleranciaDesplazamiento, reduccion.toleranciaDiastasis, reduccion.toleranciaAngulacion]).toEqual([5, 4, 5])
    expect(plan.lineas.join('\n')).toContain('desplazamiento inicial: 12,5 / 18 / 0 mm, 0 / 0 / 9,8°')
  })

  it('para si el caso acabaría moviendo otro objeto que el fragmento del archivo', () => {
    // El traumatólogo marcó a mano la piel como fragmento sobre el modelo nuevo:
    // rellenar respeta su fila, y el caso movería la piel.
    const conOtroFragmento = {
      ...caso(),
      piezas: [{ nodo: 'Piel', rol: 'fragmento', etiqueta: 'Piel' }],
    }
    expect(() => planDelCaso(conOtroFragmento, modelo)).toThrow(ParadaDelGuion)
  })
})

// ------------------------------------------------------------- el corte

describe('corteParaLaFractura', () => {
  const tibia = { codigo: '42', nombre: 'Tibia (diáfisis)' }

  it('una simple oblicua es un corte oblicuo de 45°, lateral, a media diáfisis, moviendo el distal', () => {
    const { corte, avisos } = corteParaLaFractura(
      { hueso: tibia, clasificacion: { codigo: 'A2', nombre: 'Simple oblicua', tipo: 'A' } },
      'FJ3387',
    )
    expect(corte).toEqual({ pieza: 'FJ3387', posicion: 50, inclinacion: 45, giro: 90, fragmento: 'distal' })
    expect(avisos).toEqual([])
  })

  it('una transversa es un corte transversal', () => {
    const { corte } = corteParaLaFractura(
      { hueso: tibia, clasificacion: { codigo: 'A3', nombre: 'Simple transversa', tipo: 'A' } },
      'FJ3387',
    )
    expect(corte.inclinacion).toBe(0)
  })

  it('sin nombre, el patrón sale del número del código', () => {
    const { corte } = corteParaLaFractura({ hueso: tibia, clasificacion: { codigo: 'A3' } }, 'FJ3387')
    expect(corte.inclinacion).toBe(0)
  })

  it('una espiroidea se aproxima con una oblicua y lo avisa', () => {
    const { corte, avisos } = corteParaLaFractura(
      { hueso: tibia, clasificacion: { codigo: 'A1', nombre: 'Simple espiroidea', tipo: 'A' } },
      'FJ3387',
    )
    expect(corte.inclinacion).toBe(45)
    expect(avisos.join(' ')).toMatch(/espiroidea no es un plano/)
  })

  it('para con una fractura de más de dos fragmentos, con otro hueso o sin clasificación', () => {
    const cuna = { codigo: 'B2', nombre: 'En cuña por flexión', tipo: 'B' }
    expect(() => corteParaLaFractura({ hueso: tibia, clasificacion: cuna }, 'FJ3387')).toThrow(/más de dos fragmentos/)
    expect(() =>
      corteParaLaFractura({ hueso: { codigo: '32' }, clasificacion: { codigo: 'A2', tipo: 'A' } }, 'FJ3387'),
    ).toThrow(/diáfisis tibial/)
    expect(() => corteParaLaFractura({ hueso: tibia, clasificacion: null }, 'FJ3387')).toThrow(/clasificación AO/)
  })
})

describe('elegirPorNombre', () => {
  const que = { singular: 'ninguna preparación', plural: 'Preparaciones que hay' }

  it('encuentra sin distinguir mayúsculas, tildes ni espacios de más', () => {
    const docs = [
      { id: 1, nombre: 'Rodilla izquierda' },
      { id: 2, nombre: '  Piérna   DERECHA ' },
    ]
    expect(elegirPorNombre(docs, 'pierna derecha', que).id).toBe(2)
  })

  it('sin ninguna, para y lista las que hay', () => {
    const docs = [{ id: 1, nombre: 'Rodilla izquierda' }]
    expect(() => elegirPorNombre(docs, 'pierna derecha', que)).toThrow(/#1 {2}«Rodilla izquierda»/)
  })

  it('con varias, no elige: para y las lista', () => {
    const docs = [
      { id: 1, nombre: 'Pierna derecha' },
      { id: 2, nombre: 'pierna derécha' },
    ]
    let mensaje = ''
    try {
      elegirPorNombre(docs, 'pierna derecha', que)
    } catch (error) {
      mensaje = (error as Error).message
    }
    expect(mensaje).toMatch(/Hay 2/)
    expect(mensaje).toContain('#1')
    expect(mensaje).toContain('#2')
  })
})

describe('las opciones y los secretos', () => {
  it('por omisión simula, y solo aplica si se pide', () => {
    expect(leerArgumentos([]).aplicar).toBe(false)
    expect(leerArgumentos(['--simular']).aplicar).toBe(false)
    expect(leerArgumentos(['--aplicar']).aplicar).toBe(true)
    expect(leerArgumentos(['--preparacion=Rodilla', '--caso', 'Otro'])).toMatchObject({
      preparacion: 'Rodilla',
      caso: 'Otro',
    })
    expect(() => leerArgumentos(['--aplicar', '--simular'])).toThrow(/juntos/)
    expect(() => leerArgumentos(['--aplicarr'])).toThrow(/No conozco/)
  })

  it('no imprime la cadena de conexión ni la contraseña de dentro de una URL', () => {
    const entorno = {
      DATABASE_URI: 'postgres://trauma:muysecreta@db:5432/trauma',
      PAYLOAD_SECRET: 'otro-secreto-largo',
    }
    const texto = sinSecretos(
      'falló postgres://trauma:muysecreta@db:5432/trauma, clave otro-secreto-largo, y postgres://x:y@z/w',
      entorno,
    )
    expect(texto).not.toContain('muysecreta')
    expect(texto).not.toContain('otro-secreto-largo')
    expect(texto).not.toContain('x:y@')
  })

  it('en simulación, la envoltura de la base no deja llegar a ninguna escritura', async () => {
    const { base } = baseQueRegistra(memoria.base, false)
    const creado = await (base as unknown as BaseDelGuion).create({ collection: 'modelos-3d', data: { nombre: 'x' } })
    expect(creado.id).toBe('(nuevo)')
    expect(() => (base as unknown as BaseDelGuion).update).toThrow(/simulación/)
    expect(() => (base as unknown as { delete: unknown }).delete).toThrow(/simulación/)
    expect(memoria.base.create).not.toHaveBeenCalled()
  })
})

// --------------------------------------- 2 y 3. el guion entero, con el atlas

describe('ejecutar, con la exportación de verdad', () => {
  const opciones = (aplicar: boolean, lineas: string[] = []) => ({
    aplicar,
    preparacion: 'pierna derecha',
    caso: CASO_DE_PRUEBA,
    escribir: (linea: string) => lineas.push(linea),
  })

  it('--simular no escribe nada, ni en la base ni en el disco, y dice lo que cambiaría', async () => {
    sembrarElCaso(memoria)
    const antes = memoria.foto()
    const lineas: string[] = []

    const resultado = await ejecutar(memoria.base, opciones(false, lineas))

    expect(memoria.base.create).not.toHaveBeenCalled()
    expect(memoria.base.update).not.toHaveBeenCalled()
    expect(memoria.base.delete).not.toHaveBeenCalled()
    expect(memoria.foto()).toBe(antes)
    expect(readdirSync(memoria.directorio)).toEqual([])

    expect(resultado.escrito).toBe(false)
    expect(resultado.plan.hayCambios).toBe(true)
    // Lo que se imprime sale de la exportación de verdad, no de una estimación.
    const texto = lineas.join('\n')
    expect(texto).toContain('se crearía «Pierna Derecha · del atlas»')
    expect(texto).toContain('+ Tibia_derecha_fragmento_distal · Tibia derecha, fragmento distal · fragmento')
    expect(texto).toContain('Nada escrito. Para aplicar estos cambios: --aplicar')
  }, 120_000)

  it('--aplicar deja el caso con la pierna partida, y la segunda vez no crea otro modelo ni repite piezas', async () => {
    const { modeloViejo } = sembrarElCaso(memoria)

    const primero = await ejecutar(memoria.base, opciones(true))
    expect(primero.escrito).toBe(true)
    expect(primero.modeloCreado).toBe(true)

    const modelos = memoria.tablas.get('modelos-3d')!
    expect(modelos).toHaveLength(2)
    const nuevo = modelos[1]
    const caso = casoDe(memoria)
    expect(caso.modelo).toBe(nuevo.id)
    expect(caso.modelo).not.toBe(modeloViejo.id)

    const piezas = caso.piezas!
    expect(piezas.filter((p) => p.rol === 'fragmento').map((p) => p.nodo)).toEqual([
      'Tibia_derecha_fragmento_distal',
    ])
    expect(piezas.map((p) => p.nodo)).not.toContain('tibia_distal')
    const deRol = (rol: string) => piezas.filter((p) => p.rol === rol).map((p) => p.nodo)
    // La incisión enseñaba las cuatro capas y sigue enseñándolas, con los nodos nuevos.
    expect(muestraDe(caso, 0)).toEqual([
      ...deRol('piel'),
      ...deRol('musculo'),
      ...deRol('hueso'),
      ...deRol('fragmento'),
    ])
    // Sin piel desde D-138: la preparación de la pierna la nombra (`FJ2810`) y
    // el atlas ya no la tiene, así que la capa de piel del caso queda vacía. El
    // paso de la incisión sigue enseñando las tres capas que quedan.
    expect(deRol('piel')).toEqual([])
    expect(deRol('musculo')).toContain('Musculos')
    // La reducción enseñaba el hueso fijo y el fragmento, y conserva sus medidas.
    expect(muestraDe(caso, 1)).toEqual([...deRol('hueso'), ...deRol('fragmento')])
    expect(caso.pasos![1]).toMatchObject({ toleranciaDesplazamiento: 5, toleranciaDiastasis: 4, toleranciaAngulacion: 5 })
    expect(caso.desplazamientoInicial).toEqual({ x: 12.5, y: 18, z: 0, giroX: 0, giroY: 0, giroZ: 9.8 })
    expect(caso.milimetrosPorUnidad).toBe(1000)

    // El traumatólogo vuelve a guardar la preparación sin cambiar sus piezas
    // —basta mover la cámara del taller—. El archivo que sale es el mismo, así
    // que tampoco eso crea otro modelo: el caso perdería el encuadre capturado
    // en el que ya tiene.
    memoria.tablas.get('instancias-atlas')![0].updatedAt = new Date(Date.parse('2030-01-01')).toISOString()

    const fotoTrasLaPrimera = memoria.foto()
    memoria.base.create.mockClear()
    memoria.base.update.mockClear()
    const lineas: string[] = []

    const segundo = await ejecutar(memoria.base, opciones(true, lineas))

    expect(memoria.base.create).not.toHaveBeenCalled()
    expect(memoria.base.update).not.toHaveBeenCalled()
    expect(segundo.escrito).toBe(false)
    expect(segundo.modeloCreado).toBe(false)
    expect(memoria.foto()).toBe(fotoTrasLaPrimera)
    expect(readdirSync(memoria.directorio)).toHaveLength(1)
    const nodos = casoDe(memoria).piezas!.map((p) => p.nodo)
    expect(new Set(nodos).size).toBe(nodos.length)
    expect(lineas.join('\n')).toContain('El caso ya está así. No hay nada que cambiar.')
  }, 120_000)

  it('si la exportación cambia sin cambiar la versión del atlas ni la preparación, crea el modelo nuevo y lo pone en el caso', async () => {
    // Lo que pasa al añadir una corrección de sistema: una pieza cambia de grupo
    // y el catálogo sigue diciendo la misma versión. Aquí, la arteria tibial
    // anterior pasa a los músculos, como pasaron el tibial anterior y el
    // posterior del esqueleto a los músculos.
    sembrarElCaso(memoria)
    const deSiempre = atlasCambiado(() => {})
    const corregido = atlasCambiado((catalogo) => {
      catalogo.piezas.find((p) => p.id === 'FJ2130')!.sistema = 'muscular'
    })

    const primero = await ejecutar(memoria.base, { ...opciones(true), directorioDelAtlas: deSiempre })
    expect(primero.modeloCreado).toBe(true)
    const modeloDeAntes = casoDe(memoria).modelo
    const nodosDeAntes = casoDe(memoria).piezas!.map((p) => p.nodo)
    memoria.base.create.mockClear()
    const lineas: string[] = []

    const segundo = await ejecutar(memoria.base, { ...opciones(true, lineas), directorioDelAtlas: corregido })

    expect(memoria.base.create).toHaveBeenCalledTimes(1)
    expect(segundo.modeloCreado).toBe(true)
    expect(segundo.escrito).toBe(true)
    const modelos = memoria.tablas.get('modelos-3d')!
    expect(modelos).toHaveLength(3)
    const caso = casoDe(memoria)
    expect(caso.modelo).toBe(modelos[2].id)
    expect(caso.modelo).not.toBe(modeloDeAntes)
    // Las notas de los dos dicen la misma versión del atlas: por ellas solas
    // eran el mismo modelo, y el caso se habría quedado con el viejo.
    const version = (JSON.parse(readFileSync(join(deSiempre, 'catalogo.json'), 'utf8')) as CatalogoCrudo).version
    expect(String(modelos[1].notas)).toContain(`(${version})`)
    expect(String(modelos[2].notas)).toContain(`(${version})`)
    // Y el caso tiene lo que trae el modelo corregido: la arteria ya no es un
    // objeto aparte, así que su fila se va.
    const nodosDeAhora = caso.piezas!.map((p) => p.nodo)
    expect(nodosDeAntes).toContain('Arterias')
    expect(nodosDeAhora).not.toContain('Arterias')
    expect(lineas.join('\n')).toMatch(/no es el que sale hoy de la exportación/)

    // Y ese nuevo sí se reutiliza a la siguiente, con el mismo atlas.
    memoria.base.create.mockClear()
    const tercero = await ejecutar(memoria.base, { ...opciones(true), directorioDelAtlas: corregido })
    expect(memoria.base.create).not.toHaveBeenCalled()
    expect(tercero.escrito).toBe(false)
  }, 180_000)

  it('si se cortó tras crear el modelo y antes de guardar el caso, la siguiente reutiliza ese modelo', async () => {
    sembrarElCaso(memoria)
    memoria.base.update.mockRejectedValueOnce(new Error('se fue la luz'))
    await expect(ejecutar(memoria.base, opciones(true))).rejects.toThrow('se fue la luz')
    expect(memoria.tablas.get('modelos-3d')).toHaveLength(2)

    const otra = await ejecutar(memoria.base, opciones(true))

    expect(otra.modeloCreado).toBe(false)
    expect(otra.escrito).toBe(true)
    expect(memoria.tablas.get('modelos-3d')).toHaveLength(2)
    expect(casoDe(memoria).modelo).toBe(memoria.tablas.get('modelos-3d')![1].id)
  }, 120_000)

  it('el tibial anterior y el posterior entran como músculo, y la reducción no los enseña pegados a la tibia', async () => {
    // El atlas de origen los guarda con los huesos. Sin su corrección salían
    // fundidos en «Esqueleto», con papel de hueso, y el paso de reducción —que
    // enseña todo el hueso fijo— los ponía encima de la tibia partida con la
    // capa de músculo apagada.
    sembrarElCaso(memoria)
    memoria.tablas.get('instancias-atlas')![0].contenido = {
      version: 1,
      atlas: 'x',
      piezas: ['FJ3387', 'FJ1439', 'FJ1440', 'FJ2810'].map((id) => ({ id })),
      vista: {},
    }

    await ejecutar(memoria.base, opciones(true))

    const caso = casoDe(memoria)
    const deRol = (rol: string) => caso.piezas!.filter((p) => p.rol === rol).map((p) => p.nodo)
    expect(deRol('musculo')).toEqual(['Musculos'])
    expect(caso.piezas!.map((p) => p.nodo)).not.toContain('Esqueleto')
    expect(muestraDe(caso, 1)).toEqual(['Tibia_derecha_fragmento_proximal', 'Tibia_derecha_fragmento_distal'])
  }, 120_000)

  it('para sin tocar nada si la preparación no incluye la tibia derecha', async () => {
    sembrarElCaso(memoria)
    const preparacion = memoria.tablas.get('instancias-atlas')![0]
    preparacion.contenido = { version: 1, atlas: 'x', piezas: [{ id: 'FJ3366' }], vista: {} }
    const antes = memoria.foto()

    await expect(ejecutar(memoria.base, opciones(true))).rejects.toThrow(/no incluye la tibia derecha/)

    expect(memoria.base.create).not.toHaveBeenCalled()
    expect(memoria.foto()).toBe(antes)
  })
})
