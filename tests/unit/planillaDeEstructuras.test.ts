import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { corregirCatalogo } from '@/atlas/clasificacion'
import { parejasContralaterales } from '@/atlas/espejo'
import type { CatalogoDelAtlas } from '@/atlas/formato'
import { nombreEnEspanol } from '@/atlas/nombres'
import {
  CAMPOS_DE_LA_FICHA,
  LARGO_MAXIMO_DEL_CAMPO,
  camposQueFaltan,
  ladoDeLaPieza,
  type FilaDeEstructura,
} from '@/lib/estructuras'
import { leerPlanilla, type HojaLeida } from '@/lib/leerPlanilla'
import {
  PlanillaSinFormato,
  hojasDeLaPlanilla,
  leerFilasDeLaPlanilla,
  planearPlanilla,
  planillaDeEstructuras,
  vistaDelPlan,
  type ContextoDelPlan,
  type OpcionesDelPlan,
  type PiezaDelPlan,
  type PiezaParaLaPlanilla,
} from '@/lib/planillaDeEstructuras'

/**
 * La planilla de estructuras (D-179, P-003 E8.5): descargarla, entenderla y
 * decidir qué cambiaría **antes** de escribir.
 *
 * Con el catálogo de verdad, porque lo que se promete —«Miembro inferior derecho:
 * 124 fichas, y las del izquierdo»— depende de los ids, los lados y las parejas
 * reales.
 */

const catalogo = corregirCatalogo(
  JSON.parse(readFileSync(resolve(process.cwd(), 'public/atlas/catalogo.json'), 'utf8')) as CatalogoDelAtlas,
)
const parejas = parejasContralaterales(catalogo)
const piezas = new Map<string, PiezaDelPlan>(
  catalogo.piezas.map((p) => [
    p.id,
    { id: p.id, nombre: nombreEnEspanol(p.nombre), original: p.nombre, sistema: p.sistema, region: p.region, lado: ladoDeLaPieza(p.nombre, p.region) },
  ]),
)
const idDe = (nombre: string) => catalogo.piezas.find((p) => p.nombre === nombre)!.id
const nombreDelSistema = (id: string) => catalogo.sistemas.find((s) => s.id === id)?.nombre ?? id

const contexto = (fichas: Partial<FilaDeEstructura>[] = []): ContextoDelPlan => ({
  piezas,
  parejas,
  fichas: new Map(fichas.map((f) => [f.atlasId as string, { id: f.atlasId, nombreOriginal: 'x', ...f } as FilaDeEstructura])),
})
const SIN_OPCIONES: OpcionesDelPlan = { reemplazar: false, alLadoOpuesto: false }

/** Una hoja como la que llega al subir: la cabecera de la planilla y las filas que se le pasen. */
const hoja = (filas: string[][], cabecera = ['Id del atlas', 'Nombre original', 'Definición', 'Origen', 'Irrigación', 'No mostrar']): HojaLeida => ({
  nombre: 'Estructuras',
  filas: [cabecera, ...filas],
})
const lectura = (...filas: string[][]) => leerFilasDeLaPlanilla([hoja(filas)])

describe('descargar la planilla', () => {
  const region = catalogo.piezas.filter((p) => p.region === 'miembro-inferior-derecho')
  const paraLaPlanilla = (conLoEscrito: boolean): PiezaParaLaPlanilla[] =>
    region.map((p) => ({
      atlasId: p.id,
      nombre: nombreEnEspanol(p.nombre),
      original: p.nombre,
      lado: ladoDeLaPieza(p.nombre, p.region),
      sistema: p.sistema,
      faltan: camposQueFaltan(p.sistema, {}),
      ...(conLoEscrito && p.nombre === 'Right tibia' ? { ficha: { definicion: 'Hueso largo.' }, oculta: false } : {}),
    }))

  it('«Miembro inferior derecho» son 124 filas, con sus nombres del taller, y una hoja de instrucciones', () => {
    expect(region).toHaveLength(124)
    const hojas = leerPlanilla(planillaDeEstructuras(paraLaPlanilla(false), nombreDelSistema, 'Prueba'))
    expect(hojas.map((h) => h.nombre)).toEqual(['Estructuras', 'Cómo llenarla'])
    const [estructuras, instrucciones] = hojas
    expect(estructuras.filas).toHaveLength(125)
    expect(estructuras.filas[0]).toEqual([
      'Id del atlas', 'Nombre', 'Nombre original', 'Lado', 'Sistema', 'Qué falta',
      'Nombre latino', 'Definición', 'Origen', 'Inserción', 'Inervación', 'Acción', 'Irrigación', 'Notas',
      'Cortar con (identificadores de instrumento, separados por comas)', 'Separar con (identificadores de instrumento, separados por comas)', 'No mostrar',
    ])
    const tibia = estructuras.filas.find((f) => f[2] === 'Right tibia')!
    expect(tibia.slice(0, 6)).toEqual([idDe('Right tibia'), 'Tibia derecha', 'Right tibia', 'Derecho', 'Esqueleto', 'Definición, Irrigación'])
    // Vacía: ninguna celda de ficha trae nada.
    expect(tibia.slice(6).every((c) => c === undefined || c === '')).toBe(true)
    expect(instrucciones.filas.some((f) => f[0] === 'Celdas vacías' && /no borra/.test(f[1]))).toBe(true)
  })

  it('con lo escrito, lo escrito viaja en su columna', () => {
    const [estructuras] = leerPlanilla(planillaDeEstructuras(paraLaPlanilla(true), nombreDelSistema, 'Prueba'))
    const tibia = estructuras.filas.find((f) => f[2] === 'Right tibia')!
    expect(tibia[7]).toBe('Hueso largo.')
  })

  it('lo que se descarga se vuelve a leer igual: id, original y textos', () => {
    const pieza = { ...paraLaPlanilla(true)[0], ficha: { definicion: 'Línea uno\nLínea dos «x» & <y>', nombreLatino: 'Latín' }, oculta: true }
    const leida = leerFilasDeLaPlanilla(leerPlanilla(planillaDeEstructuras([pieza], nombreDelSistema, 'Prueba')))
    expect(leida.filas).toEqual([
      {
        fila: 2,
        atlasId: pieza.atlasId,
        original: pieza.original,
        campos: { definicion: 'Línea uno\nLínea dos «x» & <y>', nombreLatino: 'Latín' },
        oculta: true,
      },
    ])
    expect(leida.problemas).toEqual([])
    expect(leida.ignoradas).toEqual(expect.arrayContaining(['Nombre', 'Lado', 'Sistema', 'Qué falta']))
  })

  it('sin filas, la hoja existe igual (una tabla de Excel tiene al menos una)', () => {
    expect(hojasDeLaPlanilla([], nombreDelSistema)[0].filas).toEqual([])
    expect(() => leerPlanilla(planillaDeEstructuras([], nombreDelSistema, 'Vacía'))).not.toThrow()
  })
})

describe('entender la planilla que se sube', () => {
  it('reconoce las columnas por su título, en cualquier orden y con variantes', () => {
    const l = leerFilasDeLaPlanilla([
      hoja([['Hueso del muslo', ' fj3365 ', '', 'Latín: femur', 'x']], ['Función', 'ID', 'Definición', 'Nombre en latín', 'Ocultar']),
    ])
    expect(l.filas[0]).toMatchObject({ atlasId: 'FJ3365', campos: { accion: 'Hueso del muslo', nombreLatino: 'Latín: femur' }, oculta: true })
    expect(l.reconocidas).toHaveLength(5)
  })

  it('busca la hoja que tiene la columna del id, aunque no sea la primera, y sigue una cabecera que no está en la fila 1', () => {
    const l = leerFilasDeLaPlanilla([
      { nombre: 'Instrucciones', filas: [['Tema', 'Texto']] },
      { nombre: 'Datos', filas: [[], ['Título de la planilla'], ['Id del atlas', 'Definición'], ['FJ1', 'Hueso.']] },
    ])
    expect(l.hoja).toBe('Datos')
    expect(l.filas).toEqual([{ fila: 4, atlasId: 'FJ1', original: null, campos: { definicion: 'Hueso.' }, oculta: null }])
  })

  it('sin columna de id o sin nada que llenar, lo dice con el camino a seguir', () => {
    expect(() => leerFilasDeLaPlanilla([{ nombre: 'X', filas: [['Nombre', 'Definición'], ['Tibia', 'Hueso']] }])).toThrow(PlanillaSinFormato)
    expect(() => leerFilasDeLaPlanilla([{ nombre: 'X', filas: [['Id del atlas', 'Nombre']] }])).toThrow(/ninguna columna que llenar/)
  })

  it('una celda larga se salta con su aviso, y el resto de la fila se conserva', () => {
    const l = lectura(['FJ1', '', 'a'.repeat(LARGO_MAXIMO_DEL_CAMPO.definicion + 1), 'Mitad distal'])
    expect(l.filas[0].campos).toEqual({ origen: 'Mitad distal' })
    expect(l.problemas[0]).toMatchObject({ fila: 2 })
    expect(l.problemas[0].mensaje).toMatch(/«Definición» pasa de 3000 caracteres/)
  })

  it('una fila con texto y sin id se avisa; una fila en blanco no', () => {
    const l = lectura(['', '', 'Un texto huérfano'], ['', '', ''], ['FJ1', '', 'Hueso'])
    expect(l.problemas).toEqual([{ fila: 2, mensaje: expect.stringContaining('no tiene «Id del atlas»') }])
    expect(l.filas).toHaveLength(1)
  })
})

describe('qué cambiaría', () => {
  const tibia = idDe('Right tibia')
  const femur = idDe('Right femur')

  it('una ficha vacía se llena; no se escribe nada hasta aplicar (el plan solo describe)', () => {
    const plan = planearPlanilla(lectura([tibia, '', 'Hueso largo medial.', '', 'Arteria nutricia']), contexto(), SIN_OPCIONES)
    expect(plan.conteo).toMatchObject({ llenas: 1, completan: 0, cambian: 0, iguales: 0, fichasAEscribir: 1, camposAEscribir: 2 })
    expect(plan.escrituras).toEqual([{ atlasId: tibia, campos: { definicion: 'Hueso largo medial.', irrigacion: 'Arteria nutricia' } }])
    expect(plan.entradas[0]).toMatchObject({ clase: 'llena', via: 'planilla' })
  })

  it('lo igual a lo escrito queda igual y no entra en lo que se escribe', () => {
    const plan = planearPlanilla(lectura([tibia, '', 'Hueso largo.']), contexto([{ atlasId: tibia, definicion: 'Hueso largo.' }]), SIN_OPCIONES)
    expect(plan.conteo).toMatchObject({ iguales: 1, llenas: 0, fichasAEscribir: 0 })
    expect(plan.escrituras).toEqual([])
  })

  it('una celda vacía no borra: no entra en el plan', () => {
    const plan = planearPlanilla(lectura([tibia, '', '', '', '']), contexto([{ atlasId: tibia, definicion: 'Escrita a mano', irrigacion: 'Algo' }]), {
      reemplazar: true,
      alLadoOpuesto: false,
    })
    expect(plan.escrituras).toEqual([])
    expect(plan.entradas).toEqual([])
    expect(plan.conteo.iguales).toBe(1)
  })

  it('un texto distinto del que ya hay NO se reemplaza por omisión: se enseña antes y después y se deja', () => {
    const plan = planearPlanilla(lectura([tibia, '', 'Texto de la planilla', 'Origen nuevo']), contexto([{ atlasId: tibia, definicion: 'Lo que ya estaba' }]), SIN_OPCIONES)
    expect(plan.conteo).toMatchObject({ cambian: 1, fichasAEscribir: 1, camposAEscribir: 1 })
    const entrada = plan.entradas[0]
    expect(entrada.clase).toBe('cambia')
    expect(entrada.cambios).toEqual([
      { campo: 'definicion', antes: 'Lo que ya estaba', despues: 'Texto de la planilla', tipo: 'reemplaza', aplicado: false },
      { campo: 'origen', antes: '', despues: 'Origen nuevo', tipo: 'nuevo', aplicado: true },
    ])
    // Solo se escribe lo nuevo; la definición queda como estaba.
    expect(plan.escrituras).toEqual([{ atlasId: tibia, campos: { origen: 'Origen nuevo' } }])
    expect(entrada.noTocados).toEqual(['definicion'])
  })

  it('con «reemplazar» marcado, el reemplazo se escribe, y sigue viéndose el antes', () => {
    const plan = planearPlanilla(lectura([tibia, '', 'Texto de la planilla']), contexto([{ atlasId: tibia, definicion: 'Lo que ya estaba' }]), {
      reemplazar: true,
      alLadoOpuesto: false,
    })
    expect(plan.escrituras).toEqual([{ atlasId: tibia, campos: { definicion: 'Texto de la planilla' } }])
    expect(plan.entradas[0].cambios[0]).toMatchObject({ antes: 'Lo que ya estaba', aplicado: true })
    expect(plan.entradas[0].noTocados).toEqual([])
  })

  it('una ficha con algo escrito a la que se le añaden campos «se completa», no «se llena»', () => {
    const plan = planearPlanilla(lectura([tibia, '', '', '', 'Arteria nutricia']), contexto([{ atlasId: tibia, definicion: 'Ya estaba' }]), SIN_OPCIONES)
    expect(plan.entradas[0].clase).toBe('completa')
    expect(plan.conteo).toMatchObject({ llenas: 0, completan: 1 })
  })

  it('subir dos veces la misma planilla: la segunda no tiene nada que escribir', () => {
    const l = lectura([tibia, '', 'Hueso largo.', '', 'Arteria nutricia'], [femur, '', 'Hueso del muslo.'])
    const primera = planearPlanilla(l, contexto(), SIN_OPCIONES)
    // Lo que escribió la primera vez, ahora está en las fichas.
    const despues = contexto(primera.escrituras.map((e) => ({ atlasId: e.atlasId, ...e.campos })))
    const segunda = planearPlanilla(l, despues, SIN_OPCIONES)
    expect(primera.conteo.fichasAEscribir).toBe(2)
    expect(segunda.conteo).toMatchObject({ fichasAEscribir: 0, camposAEscribir: 0, iguales: 2, llenas: 0, cambian: 0 })
    expect(segunda.escrituras).toEqual([])
  })

  it('«No mostrar»: sí oculta, no devuelve a visible lo que una celda vacía deja en paz', () => {
    const oculta = planearPlanilla(lectura([tibia, '', '', '', '', 'sí']), contexto(), SIN_OPCIONES)
    expect(oculta.escrituras).toEqual([{ atlasId: tibia, campos: {}, oculta: true }])
    const vacia = planearPlanilla(lectura([tibia, '', '', '', '', '']), contexto([{ atlasId: tibia, oculta: true }]), SIN_OPCIONES)
    expect(vacia.escrituras).toEqual([])
    const visible = planearPlanilla(lectura([tibia, '', '', '', '', 'no']), contexto([{ atlasId: tibia, oculta: true }]), SIN_OPCIONES)
    expect(visible.escrituras).toEqual([{ atlasId: tibia, campos: {}, oculta: false }])
  })

  describe('lo dudoso se salta y se cuenta', () => {
    it('un id que no existe', () => {
      const plan = planearPlanilla(lectura(['FJ99999999', '', 'Algo'], [tibia, '', 'Hueso']), contexto(), SIN_OPCIONES)
      expect(plan.noEncontradas).toEqual([{ fila: 2, id: 'FJ99999999' }])
      expect(plan.conteo.fichasAEscribir).toBe(1)
    })

    it('un id repetido: se usa el primero', () => {
      const plan = planearPlanilla(lectura([tibia, '', 'Primera'], [tibia, '', 'Segunda']), contexto(), SIN_OPCIONES)
      expect(plan.escrituras).toEqual([{ atlasId: tibia, campos: { definicion: 'Primera' } }])
      expect(plan.problemas.some((p) => p.fila === 3 && /Repite el id/.test(p.mensaje))).toBe(true)
    })

    it('una fila cuyo nombre original no es el del id (un id estropeado) no se aplica', () => {
      const plan = planearPlanilla(lectura([tibia, 'Left femur', 'Hueso del muslo']), contexto(), SIN_OPCIONES)
      expect(plan.escrituras).toEqual([])
      expect(plan.problemas[0].mensaje).toMatch(/es «Right tibia» y la fila dice «Left femur»/)
    })

    it('el nombre original se compara sin importar mayúsculas ni espacios', () => {
      const plan = planearPlanilla(lectura([tibia, '  right   TIBIA ', 'Hueso']), contexto(), SIN_OPCIONES)
      expect(plan.escrituras).toHaveLength(1)
    })
  })
})

describe('aplicar también al lado opuesto', () => {
  const derecha = idDe('Right tibia')
  const izquierda = idDe('Left tibia')
  const conLado: OpcionesDelPlan = { reemplazar: false, alLadoOpuesto: true }

  it('llena la pareja con lo mismo, y se ve como una entrada del lado opuesto', () => {
    const plan = planearPlanilla(lectura([derecha, '', 'Hueso largo.']), contexto(), conLado)
    expect(plan.conteo).toMatchObject({ llenas: 2, delLadoOpuesto: 1, fichasAEscribir: 2 })
    expect(plan.escrituras.map((e) => e.atlasId).sort()).toEqual([derecha, izquierda].sort())
    expect(plan.entradas.find((e) => e.atlasId === izquierda)).toMatchObject({ via: 'lado-opuesto', clase: 'llena' })
  })

  it('no pisa lo que la pareja ya tiene escrito, ni siquiera con «reemplazar»', () => {
    const plan = planearPlanilla(lectura([derecha, '', 'Hueso largo.', 'Origen']), contexto([{ atlasId: izquierda, definicion: 'Escrita a mano en la izquierda' }]), {
      reemplazar: true,
      alLadoOpuesto: true,
    })
    const espejo = plan.entradas.find((e) => e.atlasId === izquierda)!
    expect(espejo.noTocados).toEqual(['definicion'])
    expect(plan.escrituras.find((e) => e.atlasId === izquierda)).toEqual({ atlasId: izquierda, campos: { origen: 'Origen' } })
  })

  it('si la planilla trae también la fila de la pareja, manda su fila y no se copia', () => {
    const plan = planearPlanilla(lectura([derecha, '', 'De la derecha'], [izquierda, '', 'De la izquierda']), contexto(), conLado)
    expect(plan.conFilaPropia).toBe(1)
    expect(plan.escrituras.find((e) => e.atlasId === izquierda)?.campos).toEqual({ definicion: 'De la izquierda' })
    expect(plan.entradas.filter((e) => e.via === 'lado-opuesto')).toEqual([])
  })

  it('«No mostrar» solo se copia para esconder, nunca para devolver a visible', () => {
    const esconde = planearPlanilla(lectura([derecha, '', '', '', '', 'sí']), contexto(), conLado)
    expect(esconde.escrituras.find((e) => e.atlasId === izquierda)).toEqual({ atlasId: izquierda, campos: {}, oculta: true })
    const nada = planearPlanilla(lectura([derecha, '', '', '', '', 'no']), contexto([{ atlasId: izquierda, oculta: true }]), conLado)
    expect(nada.escrituras.find((e) => e.atlasId === izquierda)).toBeUndefined()
  })

  it('las piezas de la línea media no tienen lado y no se copian a ninguna parte', () => {
    const esternon = catalogo.piezas.find((p) => /^Sternum$/i.test(p.nombre) || p.nombre === 'Manubrium of sternum')
    if (!esternon) return
    const plan = planearPlanilla(lectura([esternon.id, '', 'Hueso plano.']), contexto(), conLado)
    expect(plan.escrituras).toHaveLength(1)
    expect(plan.sinPareja).toEqual([])
  })

  it('una pieza con lado y sin pareja se dice en el resumen', () => {
    // Sin parejas conocidas, ninguna pieza con lado la tiene.
    const sin: ContextoDelPlan = { ...contexto(), parejas: new Map() }
    const plan = planearPlanilla(lectura([derecha, '', 'Hueso']), sin, conLado)
    expect(plan.sinPareja).toEqual([{ atlasId: derecha, nombre: 'Tibia derecha' }])
    expect(plan.escrituras).toHaveLength(1)
  })
})

describe('el caso del dueño: «Miembro inferior derecho», 124 fichas, y también al izquierdo', () => {
  const regionDerecha = catalogo.piezas.filter((p) => p.region === 'miembro-inferior-derecho')

  it('124 fichas se llenan, la misma planilla llena además las del izquierdo, y quedan dichas las que no tienen pareja', () => {
    const filas = regionDerecha.map((p) => [p.id, p.nombre, `Definición de ${p.nombre}`])
    const l = lectura(...filas)
    expect(l.filas).toHaveLength(124)

    const sola = planearPlanilla(l, contexto(), SIN_OPCIONES)
    expect(sola.conteo).toMatchObject({ llenas: 124, cambian: 0, iguales: 0, fichasAEscribir: 124 })

    const conLado = planearPlanilla(l, contexto(), { reemplazar: false, alLadoOpuesto: true })
    // Las 124 de la derecha, más sus parejas del izquierdo. No son 124: el atlas nombra «Set of perforating arteries» sin
    // lado (hay una por pierna) y varias estructuras de la línea media cuelgan de la región; esas no tienen pareja
    // que se pueda deducir, y se dicen en el resumen en lugar de adivinarlas.
    expect(conLado.conteo.llenas).toBe(124 + conLado.conteo.delLadoOpuesto)
    expect(conLado.conteo.delLadoOpuesto).toBeGreaterThan(90)
    expect(conLado.sinPareja.length).toBeGreaterThan(0)
    expect(conLado.sinPareja.map((p) => p.nombre)).toContain(nombreEnEspanol('Set of perforating arteries'))
    expect(conLado.conteo.delLadoOpuesto + conLado.sinPareja.length + conLado.conFilaPropia).toBe(124)
    // Lo que se copia cae en el miembro inferior izquierdo y en ningún otro sitio.
    for (const e of conLado.entradas.filter((x) => x.via === 'lado-opuesto')) expect(e.region).toBe('miembro-inferior-izquierdo')
    // Ninguna pieza se escribe dos veces.
    expect(new Set(conLado.escrituras.map((e) => e.atlasId)).size).toBe(conLado.escrituras.length)
  })

  it('la vista previa trae lo que hay que ver sin mandar miles de filas', () => {
    const l = lectura(...regionDerecha.map((p) => [p.id, p.nombre, `Definición de ${p.nombre}`]))
    const plan = planearPlanilla(l, contexto(), { reemplazar: false, alLadoOpuesto: true })
    const vista = vistaDelPlan(plan, l)
    expect(vista.conteo.llenas).toBe(plan.conteo.llenas)
    expect(vista.llenan.length).toBeLessThanOrEqual(300)
    expect(vista.recortado.llenan).toBe(Math.max(0, plan.conteo.llenas - 300))
    expect(vista.regiones).toEqual([{ region: 'miembro-inferior-derecho', piezas: 124 }])
    expect(vista.huella).toBe(plan.huella)
  })
})

describe('la huella', () => {
  const tibia = idDe('Right tibia')
  const l = lectura([tibia, '', 'Hueso largo.'])

  it('es la misma para el mismo plan, y cambia si cambia algo de lo que se vio', () => {
    const base = planearPlanilla(l, contexto(), SIN_OPCIONES).huella
    expect(planearPlanilla(l, contexto(), SIN_OPCIONES).huella).toBe(base)
    // Otra persona escribió esa ficha entre la vista previa y el «Aplicar».
    expect(planearPlanilla(l, contexto([{ atlasId: tibia, definicion: 'Otra cosa' }]), SIN_OPCIONES).huella).not.toBe(base)
    // Otra planilla.
    expect(planearPlanilla(lectura([tibia, '', 'Distinto']), contexto(), SIN_OPCIONES).huella).not.toBe(base)
    // Otras opciones.
    expect(planearPlanilla(l, contexto(), { reemplazar: true, alLadoOpuesto: false }).huella).not.toBe(base)
    expect(planearPlanilla(l, contexto(), { reemplazar: false, alLadoOpuesto: true }).huella).not.toBe(base)
  })

  it('no depende del orden de las filas de la hoja', () => {
    const femur = idDe('Right femur')
    const a = planearPlanilla(lectura([tibia, '', 'A'], [femur, '', 'B']), contexto(), SIN_OPCIONES).huella
    const b = planearPlanilla(lectura([femur, '', 'B'], [tibia, '', 'A']), contexto(), SIN_OPCIONES).huella
    expect(a).toBe(b)
  })
})

describe('los campos', () => {
  it('la planilla trae una columna por cada campo de la ficha', () => {
    const [estructuras] = hojasDeLaPlanilla([], nombreDelSistema)
    expect(estructuras.columnas.map((c) => c.titulo)).toHaveLength(6 + CAMPOS_DE_LA_FICHA.length + 1)
  })
})
