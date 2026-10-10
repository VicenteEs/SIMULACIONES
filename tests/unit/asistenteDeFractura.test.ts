import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizarSeleccion } from '@/atlas/catalogo'
import {
  BORRADOR_VACIO,
  borradorDeLaReceta,
  conGrupo,
  conSegmento,
  conTipo,
  mandosDelGrupo,
  pasoActual,
  recetaDelBorrador,
  type MedidaDelHueso,
} from '@/atlas/borradorDeFractura'
import { etiquetaDeLaFractura, recetaPorOmision } from '@/atlas/patronesDeFractura'
import { MAXIMO_DE_FRACTURAS, VISTA_INICIAL, type CatalogoDelAtlas, type CorteDePieza } from '@/atlas/formato'
import type { EjeDelHueso } from '@/lib/planoDeCorte'
import { segmentosDeHeim } from '@/atlas/segmentosAO'

/**
 * El asistente «Fractura» (D-161, E4): el borrador, la receta que sale de él, lo
 * que el servidor deja guardar y cómo está cableado en el taller y en la ficha.
 */

const leer = (...partes: string[]) => readFileSync(join(process.cwd(), ...partes), 'utf8').replace(/\r\n/g, '\n')

/** Una tibia de pie: 40 cm, de proximal (arriba) a distal (abajo). */
const eje: EjeDelHueso = {
  centro: [-0.09, 0.5, 0],
  direccion: [0, -1, 0],
  proximal: -0.2,
  distal: 0.2,
  radio: 0.02,
  delante: [0, 0, 1],
  fuera: [-1, 0, 0],
}
/** Anchuras: ensanchada en los extremos, estrecha en la diáfisis. */
function posicionesDeUnaTibia(): number[] {
  const p: number[] = []
  for (let s = -0.2; s <= 0.2; s += 0.01) {
    const radio = Math.abs(s) > 0.15 ? 0.04 : 0.015
    for (let a = 0; a < 6.28; a += 0.5) {
      // y = centro.y − s, porque la dirección apunta hacia abajo.
      p.push(-0.09 + radio * Math.cos(a), 0.5 - s, radio * Math.sin(a))
    }
  }
  return p
}
const medida: MedidaDelHueso = { eje, segmentos: segmentosDeHeim(posicionesDeUnaTibia(), eje) }

describe('el borrador', () => {
  it('empieza vacío y pide primero el segmento', () => {
    expect(pasoActual(BORRADOR_VACIO)).toBe(2)
    expect(recetaDelBorrador('FJ3387', 'tibia', BORRADOR_VACIO, medida)).toBeNull()
  })

  it('cada elección avanza un paso y borra lo que dependía de la anterior', () => {
    const a = conSegmento(BORRADOR_VACIO, 2)
    expect(pasoActual(a)).toBe(3)
    const b = conTipo(a, 'A')
    expect(pasoActual(b)).toBe(4)
    const c = conGrupo(b, 'A2')
    expect(pasoActual(c)).toBe(5)
    // Cambiar el segmento lo deja todo en blanco otra vez.
    const d = conSegmento(c, 1)
    expect(d.tipo).toBeNull()
    expect(d.grupo).toBeNull()
  })

  it('un tipo con un solo grupo disponible lo elige solo, y la espiroidea ya se puede elegir', () => {
    // En la diáfisis, B tiene B2 y B3: hay que elegir. En un extremo, A tiene A2 y A3.
    expect(conTipo(conSegmento(BORRADOR_VACIO, 2), 'B').grupo).toBeNull()
    expect(conGrupo(conTipo(conSegmento(BORRADOR_VACIO, 2), 'A'), 'A1').grupo).toBe('A1')
  })

  it('la receta sale con lo propuesto por el grupo, dentro del segmento', () => {
    const b = conGrupo(conTipo(conSegmento(BORRADOR_VACIO, 2), 'A'), 'A2')
    const receta = recetaDelBorrador('FJ3387', 'tibia', b, medida)!
    expect(receta).toMatchObject({ pieza: 'FJ3387', hueso: 'tibia', segmento: 2, grupo: 'A2', inclinacion: 45 })
    const { diafisis } = medida.segmentos
    const posicion = (receta.porcion.centro / 100) * (eje.distal - eje.proximal) + eje.proximal
    expect(posicion).toBeGreaterThanOrEqual(diafisis[0] - 1e-6)
    expect(posicion).toBeLessThanOrEqual(diafisis[1] + 1e-6)
  })

  it('un centro fuera del segmento se lleva al segmento', () => {
    const b = { ...conGrupo(conTipo(conSegmento(BORRADOR_VACIO, 3), 'A'), 'A3'), centro: 20 }
    const receta = recetaDelBorrador('FJ3387', 'tibia', b, medida)!
    // El 20 % es de la diáfisis y se pidió el extremo distal: sube al principio del distal.
    expect(receta.porcion.centro).toBeGreaterThan(50)
  })

  it('una receta guardada vuelve a ser un borrador que da la misma receta', () => {
    const original = { ...recetaPorOmision('FJ3387', 'tibia', 2, 'B3', medida), semilla: 5, giro: 90 }
    const otra = recetaDelBorrador('FJ3387', 'tibia', borradorDeLaReceta(original), medida)!
    expect(otra).toEqual(original)
  })

  it('cada grupo trae los mandos que le tocan', () => {
    expect(mandosDelGrupo('A3').inclinacion).toEqual({ min: 0, max: 15 })
    expect(mandosDelGrupo('A2').inclinacion).toEqual({ min: 30, max: 60 })
    expect(mandosDelGrupo('B2')).toMatchObject({ extension: true, inclinacion: null, cara: true, variante: false })
    expect(mandosDelGrupo('B3').variante).toBe(true)
    expect(mandosDelGrupo('C2')).toMatchObject({ extension: true, cara: false })
    expect(mandosDelGrupo('C3').variante).toBe(true)
  })

  it('la etiqueta lleva el lado, para que dos tibias no se confundan', () => {
    const base = recetaPorOmision('FJ3387', 'tibia', 2, 'A2')
    expect(etiquetaDeLaFractura(base)).toBe('42-A2 · Tibia, diáfisis, oblicua · derecho')
    expect(etiquetaDeLaFractura({ ...base, pieza: 'FJ3282' })).toBe('42-A2 · Tibia, diáfisis, oblicua · izquierdo')
    expect(etiquetaDeLaFractura(base)!.length).toBeLessThanOrEqual(80)
  })
})

describe('lo que el servidor deja guardar', () => {
  const catalogo = {
    version: 'prueba',
    piezas: [{ id: 'FJ3387' }, { id: 'FJ3282' }, { id: 'FJ3365' }],
  } as unknown as CatalogoDelAtlas
  const corte: CorteDePieza = { pieza: 'FJ3387', punto: [0, 0.5, 0], normal: [0, -1, 0] }
  const receta = recetaPorOmision('FJ3387', 'tibia', 2, 'A2')

  const guardar = (fracturas: unknown, cortes: unknown = [corte], piezas = ['FJ3387']) =>
    normalizarSeleccion(catalogo, piezas, VISTA_INICIAL, cortes, { fracturas })

  it('una fractura con su hueso partido se guarda con su código recalculado', () => {
    const c = guardar([{ ...receta, codigo: 'mentira' }])
    expect(c.fracturas).toHaveLength(1)
    expect(c.fracturas![0].codigo).toBe('42-A2')
  })

  it('sin el corte raíz es una receta huérfana y no se guarda', () => {
    expect(guardar([receta], []).fracturas).toBeUndefined()
    expect(guardar([receta], [{ ...corte, pieza: 'FJ3282' }], ['FJ3387', 'FJ3282']).fracturas).toBeUndefined()
  })

  it('de una pieza que no está en la preparación, tampoco', () => {
    expect(guardar([receta], [corte], ['FJ3282']).fracturas).toBeUndefined()
  })

  it('una por hueso, y lo que no es una receta se descarta sin tirar las demás', () => {
    const c = guardar(
      [receta, { ...receta, grupo: 'A3' }, { ...receta, grupo: 'Z9' }, 'basura', null],
      [corte, { ...corte, pieza: 'FJ3365' }],
      ['FJ3387', 'FJ3365'],
    )
    expect(c.fracturas).toHaveLength(1)
    expect(c.fracturas![0].grupo).toBe('A2')
  })

  it('con techo', () => {
    const muchas = Array.from({ length: MAXIMO_DE_FRACTURAS + 5 }, (_, i) => ({ ...receta, pieza: `FJ${3000 + i}` }))
    const piezas = muchas.map((m) => m.pieza)
    const cat = { version: 'x', piezas: piezas.map((id) => ({ id })) } as unknown as CatalogoDelAtlas
    const cortes = piezas.map((pieza) => ({ ...corte, pieza }))
    const c = normalizarSeleccion(cat, piezas, VISTA_INICIAL, cortes, { fracturas: muchas })
    expect(c.fracturas).toHaveLength(MAXIMO_DE_FRACTURAS)
  })

  it('sin fracturas, el contenido no lleva el campo', () => {
    expect('fracturas' in guardar(undefined)).toBe(false)
  })
})

describe('cableado en el taller, el visor y la ficha', () => {
  const taller = leer('src', 'components', 'admin', 'atlas', 'TallerDeAtlas.tsx')
  const visor = leer('src', 'components', 'atlas', 'VisorAtlas.tsx')
  const ficha = leer('src', 'components', 'atlas', 'VisorInstancia.tsx')
  const acciones = leer('src', 'app', '(frontend)', 'acciones', 'atlas.ts')
  const pestana = leer('src', 'components', 'admin', 'atlas', 'PestanaDeFractura.tsx')

  it('el taller tiene su pestaña «Fractura»', () => {
    expect(taller).toContain("{ id: 'fractura', etiqueta: 'Fractura' }")
    expect(taller).toContain('id="fractura" activa={pestana}')
  })

  it('«Fracturar» es una sola entrada del historial', () => {
    const cuerpo = taller.slice(taller.indexOf('const fracturar = '), taller.indexOf('const quitarFractura = '))
    expect((cuerpo.match(/apuntarPaso\(\)/g) ?? []).length).toBe(1)
    expect(cuerpo).toContain('setCortes([...cortes, ...nuevos])')
  })

  it('se guarda lo vigente, y se abre y se limpia con el resto', () => {
    expect(taller).toContain('fracturas: fracturasVigentes,')
    expect(taller).toContain('setFracturas(fracturasAbiertas)')
    expect((taller.match(/setFracturas\(\[\]\)/g) ?? []).length).toBe(2)
    // Cuentan para «cambios sin guardar».
    expect(taller).toContain('JSON.stringify([marcas, vistas, grupos, fracturasVigentes, sueltasVigentes])')
  })

  it('el servidor y la ficha las pasan por la misma barrera', () => {
    expect(acciones).toContain('fracturas: bruto?.fracturas,')
    expect(acciones).toContain('fracturas: entrada.fracturas,')
    expect(ficha).toContain('fracturas: contenido.fracturas,')
    expect(ficha).toContain('describirFractura(f.hueso, f.segmento, f.grupo)')
  })

  it('el visor mide el hueso para el asistente, con la misma geometría de siempre', () => {
    expect(visor).toContain('medirHueso: (pieza: string) =>')
    expect(visor).toContain('segmentosDeHeim(malla.posiciones, eje)')
  })

  it('el taller no trae three por el asistente', () => {
    for (const modulo of ['borradorDeFractura', 'patronesDeFractura', 'clasificacionAO', 'huesosAO', 'segmentosAO']) {
      const fuente = leer('src', 'atlas', `${modulo}.ts`)
      expect(fuente, modulo).not.toMatch(/from 'three'/)
    }
    expect(pestana).not.toMatch(/from 'three'/)
  })

  it('la vista previa dibuja el plano del asistente, sin panel de exportación de por medio', () => {
    expect(taller).toContain('corte={vistaPreviaDeFractura}')
    expect(taller).not.toContain('panelExportar')
  })
})
