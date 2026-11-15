import { describe, expect, it } from 'vitest'
import {
  COLECCIONES_QUE_SE_COPIAN,
  COLECCIONES_SIN_COPIAR,
  ensayarUnCaso,
  informeDelEnsayo,
  nodosDelGlb,
  tablasSinCopiar,
  type ModeloEnsayado,
} from '@/lib/ensayoDeLosCasos'
import { COLECCIONES } from '@/collections'
import { CAMPOS_QUE_APUNTAN_A_UNA_CUENTA } from '@/lib/datosDeUnaCuenta'
import { VERSION_DEL_FORMATO_DEL_CASO } from '@/lib/formatoDelCaso'

/**
 * El ensayo de los casos antes de desplegar (D-373).
 *
 * Lo que importa probar es la frontera entre error y aviso: un error para el
 * despliegue, así que solo puede salir de lo que el código cambia —un caso que
 * ya no se lee, una nota que cambió con el caso intacto—; lo que es del
 * contenido tiene que quedarse en aviso, o el ensayo acaba saltándose.
 */

/** Dos pasos de 10, con profundidad 0 (el mismo de `resultadoDeCirugia.test.ts`). */
const CASO = {
  id: 7,
  nombre: 'Caso de prueba',
  _status: 'published',
  updatedAt: '2026-11-15T20:00:00.000Z',
  versionDelFormato: 1,
  modelo: 3,
  piezas: [{ nodo: 'Tibia', rol: 'hueso' }, { nodo: 'Piel', rol: 'piel' }],
  pasos: [
    { id: 'p1', titulo: 'Coger el bisturí', objetivo: 'instrumento', instrumento: 3, puntos: 10 },
    { id: 'p2', titulo: 'Incisión', objetivo: 'trazo', instrumento: 3, trazoMinimo: 40, trazoMaximo: 60, puntos: 10 },
  ],
}

/** El primero a la primera, el segundo tras una incisión corta: 10 + 5 de 20. */
const REFERENCIA = {
  id: 1,
  cirugia: 7,
  puntaje: 15,
  puntajeMaximo: 20,
  casoGuardadoEn: CASO.updatedAt,
  recorrido: {
    v: 1,
    pasos: [
      { paso: 'p1', intentos: [{ instrumento: '3' }] },
      { paso: 'p2', intentos: [{ instrumento: '3', trazo: 30 }, { instrumento: '3', trazo: 50 }] },
    ],
  },
}

const MODELO: ModeloEnsayado = { estado: 'leido', archivo: 'tibia.glb', nodos: ['Tibia', 'Piel'] }

const gravedades = (r: ReturnType<typeof ensayarUnCaso>) => r.hallazgos.map((h) => h.gravedad)

describe('lo que se copia para el ensayo', () => {
  it('cada colección está en una lista y solo en una', () => {
    // Una colección nueva tiene que decidir si sus datos viajan a la copia.
    const slugs = COLECCIONES.map((c) => c.slug)
    const clasificadas = [...COLECCIONES_SIN_COPIAR, ...COLECCIONES_QUE_SE_COPIAN]
    expect(slugs.filter((s) => !clasificadas.includes(s)), 'sin clasificar en ensayoDeLosCasos.ts').toEqual([])
    expect(clasificadas.filter((s) => !slugs.includes(s)), 'clasificadas y que ya no existen').toEqual([])
    expect(COLECCIONES_SIN_COPIAR.filter((s) => COLECCIONES_QUE_SE_COPIAN.includes(s))).toEqual([])
  })

  it('no viaja nada que apunte a una cuenta', () => {
    // La misma lista con que se entregan y se borran los datos de una persona: si una colección guarda a quién
    // pertenece una fila, esa fila es de alguien, y no va a la copia (D-295).
    for (const slug of Object.keys(CAMPOS_QUE_APUNTAN_A_UNA_CUENTA)) {
      expect(COLECCIONES_SIN_COPIAR, slug).toContain(slug)
    }
    expect(COLECCIONES_SIN_COPIAR).toContain('usuarios')
  })

  it('los patrones cubren las tablas hijas de cada colección', () => {
    const patrones = tablasSinCopiar()
    expect(patrones).toContain('usuarios*')
    expect(patrones).toContain('registro_de_acciones*')
    expect(patrones).toContain('payload_preferences*')
    // Ninguno se come una tabla de contenido por el prefijo.
    const deContenido = COLECCIONES_QUE_SE_COPIAN.map((s) => s.replace(/-/g, '_'))
    for (const patron of patrones) {
      const prefijo = patron.slice(0, -1)
      expect(deContenido.filter((t) => t.startsWith(prefijo)), patron).toEqual([])
    }
  })
})

/** Un `.glb` con solo su JSON: la cabecera de 12, la del bloque de 8 y el texto. */
function glbConJson(json: unknown): Uint8Array {
  let texto = new TextEncoder().encode(JSON.stringify(json))
  const relleno = (4 - (texto.length % 4)) % 4
  if (relleno) texto = new Uint8Array([...texto, ...new Array(relleno).fill(0x20)])
  const bytes = new Uint8Array(20 + texto.length)
  const vista = new DataView(bytes.buffer)
  vista.setUint32(0, 0x46546c67, true)
  vista.setUint32(4, 2, true)
  vista.setUint32(8, bytes.length, true)
  vista.setUint32(12, texto.length, true)
  vista.setUint32(16, 0x4e4f534a, true)
  bytes.set(texto, 20)
  return bytes
}

describe('nodosDelGlb', () => {
  it('saca los nombres como los pone el cargador de la consola', () => {
    const nodos = nodosDelGlb(
      glbConJson({
        nodes: [{ name: 'Tibia derecha' }, { name: 'Peroné.001' }, { name: 'Piel' }, { name: 'Piel' }, {}],
        meshes: [{ name: 'Malla: hueso' }],
      }),
    )
    expect(nodos).toEqual(['Tibia_derecha', 'Peroné001', 'Piel', 'Piel_1', 'Malla_hueso'])
  })

  it('lo que no es un .glb da null, no una lista vacía', () => {
    // Una lista vacía diría «el modelo no tiene piezas», y todas las del caso saldrían como que faltan.
    expect(nodosDelGlb(new TextEncoder().encode('esto no es un modelo, aunque ocupe más de veinte bytes'))).toBeNull()
    expect(nodosDelGlb(new Uint8Array(4))).toBeNull()
  })
})

describe('ensayarUnCaso', () => {
  it('un caso sano con su referencia no tiene nada que decir', () => {
    const r = ensayarUnCaso(CASO, REFERENCIA, MODELO)
    expect(r.hallazgos).toEqual([])
    expect(r.nota).toEqual({ puntaje: 15, puntajeMaximo: 20 })
    expect(r).toMatchObject({ id: '7', nombre: 'Caso de prueba', publicado: true })
  })

  it('un caso que la consola no sabe leer es un error, publicado o no', () => {
    for (const _status of ['published', 'draft']) {
      const r = ensayarUnCaso({ ...CASO, _status, versionDelFormato: VERSION_DEL_FORMATO_DEL_CASO + 1 }, REFERENCIA, MODELO)
      expect(gravedades(r), _status).toEqual(['error'])
      expect(r.hallazgos[0].mensaje).toMatch(/Hay que actualizar la plataforma/)
    }
  })

  it('la nota que cambia con el caso intacto es un error; con el caso editado después, un aviso', () => {
    const cambiada = { ...REFERENCIA, puntaje: 20 }
    const conElMismoCaso = ensayarUnCaso(CASO, cambiada, MODELO)
    expect(gravedades(conElMismoCaso)).toEqual(['error'])
    expect(conElMismoCaso.hallazgos[0].mensaje).toMatch(/daba 20\/20 y con este código da 15\/20/)

    const editado = ensayarUnCaso({ ...CASO, updatedAt: '2026-11-16T09:00:00.000Z' }, cambiada, MODELO)
    expect(gravedades(editado)).toEqual(['aviso'])
    expect(editado.hallazgos[0].mensaje).toMatch(/volver a grabarla/)
  })

  it('una referencia que este código ya no acepta es un error', () => {
    const r = ensayarUnCaso(CASO, { ...REFERENCIA, recorrido: { v: 2, pasos: [] } }, MODELO)
    expect(gravedades(r)).toEqual(['error'])
  })

  it('sin referencia, aviso si está publicado y nada si es un borrador', () => {
    expect(gravedades(ensayarUnCaso(CASO, null, MODELO))).toEqual(['aviso'])
    expect(gravedades(ensayarUnCaso({ ...CASO, _status: 'draft' }, null, MODELO))).toEqual([])
  })

  it('lo del modelo es contenido: siempre aviso', () => {
    const casos: ModeloEnsayado[] = [
      { estado: 'sin-modelo' },
      { estado: 'sin-documento', id: '3' },
      { estado: 'sin-archivo', archivo: 'tibia.glb' },
      { estado: 'ilegible', archivo: 'tibia.glb' },
      { estado: 'leido', archivo: 'tibia.glb', nodos: ['Tibia'] },
    ]
    for (const modelo of casos) {
      expect(gravedades(ensayarUnCaso(CASO, REFERENCIA, modelo)), modelo.estado).toEqual(['aviso'])
    }
    expect(ensayarUnCaso(CASO, REFERENCIA, casos[4]).hallazgos[0].mensaje).toMatch(/no trae la pieza Piel/)
  })
})

describe('informeDelEnsayo', () => {
  it('cuenta errores y avisos, y solo nombra los casos con algo que decir', () => {
    const sano = ensayarUnCaso(CASO, REFERENCIA, MODELO)
    const roto = ensayarUnCaso({ ...CASO, id: 8, nombre: 'Roto', versionDelFormato: 99 }, null, MODELO)
    const sinReferencia = ensayarUnCaso({ ...CASO, id: 9, nombre: 'Sin referencia' }, null, MODELO)
    const informe = informeDelEnsayo([sano, roto, sinReferencia], 2)
    expect(informe).toMatchObject({ errores: 1, avisos: 2 })
    expect(informe.texto).toMatch(/^3 caso\(s\) ensayado\(s\), 1 con su referencia calificada: 1 error\(es\), 2 aviso\(s\)\./)
    expect(informe.texto).not.toMatch(/Caso de prueba/)
    expect(informe.texto).toMatch(/Roto \(8, publicado\)\n {4}ERROR: /)
    expect(informe.texto).toMatch(/2 resolución\(es\) de referencia sin caso/)
  })
})
