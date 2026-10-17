import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { corregirCatalogo } from '@/atlas/clasificacion'
import { parejasContralaterales } from '@/atlas/espejo'
import type { CatalogoDelAtlas } from '@/atlas/formato'
import {
  CAMPOS_DE_LA_FICHA,
  CAMPOS_QUE_CUENTAN,
  LARGO_MAXIMO_DEL_CAMPO,
  atlasIdDeLaPieza,
  camposQueCuentan,
  camposQueFaltan,
  casaConElFiltro,
  contarEstructuras,
  contarPorRegion,
  esPendiente,
  estadoDeLaFicha,
  etiquetaDelCampo,
  familiaDeSistema,
  ladoDeLaPieza,
  leerMarcaDeOculta,
  normalizarTexto,
  porcentaje,
} from '@/lib/estructuras'

/**
 * El listado global de estructuras: lo puro (D-179, P-003 E8).
 *
 * Lo que se mide sobre el catálogo de verdad es lo que la pantalla y la
 * planilla prometen: que todo sistema del atlas tiene una regla de «completa»,
 * que el lado sale bien en las piezas reales y que un hueso partido se anota
 * en el hueso entero.
 */

const catalogo = corregirCatalogo(
  JSON.parse(readFileSync(resolve(process.cwd(), 'public/atlas/catalogo.json'), 'utf8')) as CatalogoDelAtlas,
)
const pieza = (nombre: string) => {
  const encontrada = catalogo.piezas.find((p) => p.nombre === nombre)
  if (!encontrada) throw new Error(`No hay «${nombre}» en el catálogo.`)
  return encontrada
}

describe('qué cuenta para «completa»', () => {
  it('cada sistema del atlas cae en una familia con una regla', () => {
    for (const { id } of catalogo.sistemas) {
      const reglas = camposQueCuentan(id)
      // La definición cuenta siempre: es lo único que se puede pedir de un órgano.
      expect(reglas).toContain('definicion')
      expect(reglas.length).toBeGreaterThan(0)
    }
  })

  it('sigue la tabla del plan: un hueso no tiene inserción ni una arteria inervación', () => {
    expect([...camposQueCuentan('skeletal')]).toEqual(['definicion', 'irrigacion'])
    expect([...camposQueCuentan('muscular')]).toEqual([
      'definicion',
      'origen',
      'insercion',
      'inervacion',
      'accion',
      'irrigacion',
    ])
    expect(camposQueCuentan('arterial')).not.toContain('inervacion')
    expect(camposQueCuentan('arterial')).toContain('irrigacion')
    expect(camposQueCuentan('venous')).toEqual(['definicion', 'irrigacion'])
    expect(camposQueCuentan('nervous')).toEqual(['definicion', 'origen', 'inervacion', 'accion'])
    expect(camposQueCuentan('connective')).toEqual(['definicion', 'origen', 'insercion'])
    // Los demás piden solo la definición.
    for (const sistema of ['digestive', 'respiratory', 'cardiac', 'sensory', 'integumentary', 'inventado']) {
      expect(camposQueCuentan(sistema)).toEqual(['definicion'])
    }
  })

  it('el nombre latino y las notas no cuentan para ninguna familia', () => {
    for (const campos of Object.values(CAMPOS_QUE_CUENTAN)) {
      expect(campos).not.toContain('nombreLatino')
      expect(campos).not.toContain('notas')
    }
  })

  it('los campos que faltan salen en el orden de la ficha y un espacio no cuenta como escrito', () => {
    expect(camposQueFaltan('muscular', { definicion: 'Músculo largo', origen: '   ', accion: '' })).toEqual([
      'origen',
      'insercion',
      'inervacion',
      'accion',
      'irrigacion',
    ])
    expect(camposQueFaltan('skeletal', { definicion: 'Hueso largo', irrigacion: 'Arteria nutricia' })).toEqual([])
  })

  it('el mismo campo se pregunta distinto según la familia', () => {
    expect(etiquetaDelCampo('irrigacion', familiaDeSistema('arterial'))).toBe('Irrigación (qué irriga)')
    expect(etiquetaDelCampo('irrigacion', familiaDeSistema('venous'))).toBe('Irrigación (qué drena)')
    expect(etiquetaDelCampo('inervacion', familiaDeSistema('nervous'))).toBe('Inervación (qué inerva)')
    expect(etiquetaDelCampo('irrigacion', familiaDeSistema('muscular'))).toBe('Irrigación')
  })
})

describe('el estado de una ficha', () => {
  it('sin nada escrito está sin empezar; con algo, a medias; con todo lo que cuenta, completa', () => {
    expect(estadoDeLaFicha('skeletal', {})).toBe('sin-empezar')
    expect(estadoDeLaFicha('skeletal', { nombreLatino: 'Tibia' })).toBe('a-medias')
    expect(estadoDeLaFicha('skeletal', { definicion: 'Hueso de la pierna' })).toBe('a-medias')
    expect(estadoDeLaFicha('skeletal', { definicion: 'Hueso de la pierna', irrigacion: 'Nutricia' })).toBe('completa')
  })

  it('una pieza oculta no está pendiente aunque no tenga nada, y una sin pieza se enseña aparte', () => {
    expect(estadoDeLaFicha('muscular', {}, { oculta: true })).toBe('oculta')
    expect(estadoDeLaFicha('muscular', {}, { huerfana: true })).toBe('sin-pieza')
    // Sin pieza gana sobre oculta: de ella no se puede decir nada del atlas.
    expect(estadoDeLaFicha('muscular', {}, { huerfana: true, oculta: true })).toBe('sin-pieza')
    expect(esPendiente('oculta')).toBe(false)
    expect(esPendiente('sin-pieza')).toBe(false)
    expect(esPendiente('a-medias')).toBe(true)
    expect(esPendiente('sin-empezar')).toBe(true)
  })
})

describe('el contador', () => {
  it('cuenta completas, pendientes, ocultas y sin pieza, con el porcentaje sobre lo que hay que llenar', () => {
    const conteo = contarEstructuras([
      { estado: 'completa' },
      { estado: 'completa' },
      { estado: 'a-medias' },
      { estado: 'sin-empezar' },
      { estado: 'oculta' },
      { estado: 'sin-pieza' },
    ])
    expect(conteo).toMatchObject({
      total: 5,
      porLlenar: 4,
      completas: 2,
      aMedias: 1,
      sinEmpezar: 1,
      pendientes: 2,
      ocultas: 1,
      sinPieza: 1,
      porcentajeCompletas: 50,
      porcentajePendientes: 50,
    })
  })

  it('una pieza oculta sale del 100 %: ocultar no sube ni baja el porcentaje por sí solo', () => {
    const sin = contarEstructuras([{ estado: 'completa' }, { estado: 'sin-empezar' }])
    const con = contarEstructuras([{ estado: 'completa' }, { estado: 'sin-empezar' }, { estado: 'oculta' }])
    expect(con.porcentajeCompletas).toBe(sin.porcentajeCompletas)
  })

  it('sin nada que llenar no divide por cero', () => {
    expect(porcentaje(0, 0)).toBe(0)
    expect(contarEstructuras([]).porcentajeCompletas).toBe(0)
    expect(contarEstructuras([{ estado: 'oculta' }]).porcentajePendientes).toBe(0)
  })

  it('cuenta por región', () => {
    const porRegion = contarPorRegion([
      { region: 'cabeza', estado: 'completa' },
      { region: 'cabeza', estado: 'sin-empezar' },
      { region: 'torax', estado: 'sin-empezar' },
    ])
    expect(porRegion.get('cabeza')?.porcentajeCompletas).toBe(50)
    expect(porRegion.get('torax')?.pendientes).toBe(1)
    expect([...porRegion.keys()]).toEqual(['cabeza', 'torax'])
  })

  it('redondea a un decimal', () => {
    expect(porcentaje(1, 3)).toBe(33.3)
    expect(porcentaje(2, 3)).toBe(66.7)
  })

  it('una ficha llena de 2.231 no se redondea a cero', () => {
    expect(porcentaje(1, 2231)).toBe(0.1)
    expect(porcentaje(0, 2231)).toBe(0)
  })
})

describe('el lado', () => {
  it('sale del nombre original, delante o en medio, y si no, de la región', () => {
    expect(ladoDeLaPieza('Right tibia')).toBe('derecho')
    expect(ladoDeLaPieza('Left tibia')).toBe('izquierdo')
    expect(ladoDeLaPieza('Anterior branch of left coronary artery')).toBe('izquierdo')
    expect(ladoDeLaPieza('Sternum')).toBeNull()
    expect(ladoDeLaPieza('Upright thing')).toBeNull()
    expect(ladoDeLaPieza('Algo sin lado en el nombre', 'mano-derecha')).toBe('derecho')
    expect(ladoDeLaPieza('Algo sin lado en el nombre', 'pie-izquierdo')).toBe('izquierdo')
    expect(ladoDeLaPieza('Algo sin lado en el nombre', 'torax')).toBeNull()
  })

  it('un nombre con los dos lados no decide por sí solo: manda la región o nada', () => {
    const nombre = 'First right anterior branch of anterior interventricular branch of left coronary artery'
    expect(ladoDeLaPieza(nombre, 'torax')).toBeNull()
    expect(ladoDeLaPieza(nombre, 'miembro-inferior-derecho')).toBe('derecho')
  })

  it('en el atlas real, cada pieza «Right …» o «Left …» es de su lado', () => {
    for (const p of catalogo.piezas) {
      if (/^right\b/i.test(p.nombre)) expect(ladoDeLaPieza(p.nombre, p.region), p.nombre).toBe('derecho')
      if (/^left\b/i.test(p.nombre)) expect(ladoDeLaPieza(p.nombre, p.region), p.nombre).toBe('izquierdo')
    }
  })

  it('la pareja del otro lado de la tibia derecha es la tibia izquierda, y viceversa', () => {
    const parejas = parejasContralaterales(catalogo)
    const derecha = pieza('Right tibia')
    const izquierda = pieza('Left tibia')
    expect(parejas.get(derecha.id)).toBe(izquierda.id)
    expect(parejas.get(izquierda.id)).toBe(derecha.id)
    expect(ladoDeLaPieza(derecha.nombre, derecha.region)).not.toBe(ladoDeLaPieza(izquierda.nombre, izquierda.region))
  })
})

describe('el identificador de un trozo', () => {
  it('un trozo de hueso partido se anota en la pieza entera', () => {
    const tibia = pieza('Right tibia').id
    expect(atlasIdDeLaPieza(tibia)).toBe(tibia)
    expect(atlasIdDeLaPieza(`${tibia}#a`)).toBe(tibia)
    expect(atlasIdDeLaPieza(`${tibia}#b#a`)).toBe(tibia)
    expect(atlasIdDeLaPieza(` ${tibia} `)).toBe(tibia)
  })
})

describe('la casilla «No mostrar»', () => {
  it('lee lo que escribiría una persona', () => {
    for (const si of ['sí', 'Si', 'SÍ', 'x', 'X', '1', 'true', 'Verdadero', ' sí ', true, 1]) {
      expect(leerMarcaDeOculta(si), String(si)).toBe(true)
    }
    for (const no of ['no', 'No', '0', 'false', 'falso', false, 0]) {
      expect(leerMarcaDeOculta(no), String(no)).toBe(false)
    }
  })

  it('lo vacío o lo dudoso no cambia nada, y nunca esconde una pieza', () => {
    for (const duda of ['', '   ', null, undefined, 'quizás', 'tal vez', 2, 'ver nota']) {
      expect(leerMarcaDeOculta(duda), String(duda)).toBeNull()
    }
  })
})

describe('los textos', () => {
  it('se normalizan sin perder lo escrito', () => {
    expect(normalizarTexto('  Línea uno\r\nLínea dos  ')).toBe('Línea uno\nLínea dos')
    expect(normalizarTexto('a\u0000b\u001Fc')).toBe('abc')
    expect(normalizarTexto('con\ttab')).toBe('con\ttab')
    expect(normalizarTexto(null)).toBe('')
    expect(normalizarTexto(undefined)).toBe('')
    expect(normalizarTexto(42)).toBe('42')
    expect(normalizarTexto({})).toBe('')
  })

  it('todo campo de la ficha tiene su tope', () => {
    for (const campo of CAMPOS_DE_LA_FICHA) expect(LARGO_MAXIMO_DEL_CAMPO[campo]).toBeGreaterThan(0)
  })
})

describe('el filtro', () => {
  it('casa sin tildes, sin mayúsculas y por palabras en cualquier orden', () => {
    expect(casaConElFiltro(['Peroneo corto derecho', 'Fibularis brevis right'], 'peroneo derecho')).toBe(true)
    expect(casaConElFiltro(['Peroneo corto derecho', 'Fibularis brevis right'], 'DERECHO peroneo')).toBe(true)
    expect(casaConElFiltro(['Fémur derecho', 'Right femur'], 'femur')).toBe(true)
    expect(casaConElFiltro(['Fémur derecho', 'Right femur'], 'right fem')).toBe(true)
    expect(casaConElFiltro(['Fémur derecho', 'Right femur'], 'fémur')).toBe(true)
    expect(casaConElFiltro(['Fémur derecho'], '')).toBe(true)
  })

  it('todas las palabras tienen que estar en el mismo nombre, no media consulta en cada uno', () => {
    expect(casaConElFiltro(['Peroneo corto derecho', 'Fibularis brevis right'], 'peroneo brevis')).toBe(false)
  })
})

describe('el atlas real', () => {
  it('cada pieza tiene un identificador único y un sistema con regla', () => {
    expect(new Set(catalogo.piezas.map((p) => p.id)).size).toBe(catalogo.piezas.length)
    for (const p of catalogo.piezas) expect(camposQueCuentan(p.sistema).length, p.nombre).toBeGreaterThan(0)
  })

  it('el peroneo corto, que el atlas de origen mete en el esqueleto, se pregunta como músculo', () => {
    const peroneo = pieza('Right fibularis brevis')
    expect(familiaDeSistema(peroneo.sistema)).toBe('musculo')
  })
})
