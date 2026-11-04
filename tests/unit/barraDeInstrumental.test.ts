import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  anotarReciente,
  COLUMNAS_DE_LA_MESA,
  familiaDeLaMesa,
  finDeLaFila,
  ICONO_DE_LA_FAMILIA,
  MAXIMO_DE_RECIENTES,
  ordenDeLasFamilias,
  ROTULO_DE_LA_FAMILIA,
  tituloDeLaFamilia,
} from '@/lib/barraDeInstrumental'
import { CATEGORIAS_DE_INSTRUMENTAL, ETIQUETA_DE_CATEGORIA } from '@/lib/instrumental'
import { tieneDibujo } from '@/components/simulador/IconoInstrumento'

/**
 * La mesa de instrumental de la columna izquierda (P-008 E6).
 *
 * «Que sea fácil cambiar de herramientas, quizás con iconos para que pueda ver todas de una y al pincharlo aparezca
 * una lista desplegable para que pueda elegir la correcta.»
 */

const fuente = (...partes: string[]) => readFileSync(join(process.cwd(), ...partes), 'utf8')
const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

describe('los cuadros de la mesa', () => {
  const familias = ordenDeLasFamilias(CATEGORIAS_DE_INSTRUMENTAL.map((c) => c.value as string))

  it('cada familia del catálogo tiene un dibujo propio, que existe', () => {
    for (const f of familias) {
      expect(ICONO_DE_LA_FAMILIA[f], f).toBeTruthy()
      expect(tieneDibujo(ICONO_DE_LA_FAMILIA[f]), `${f} → ${ICONO_DE_LA_FAMILIA[f]}`).toBe(true)
    }
  })

  it('ningún dibujo se repite: con el genérico, tres cuadros eran la misma raya', () => {
    const dibujos = familias.map((f) => ICONO_DE_LA_FAMILIA[f])
    expect(new Set(dibujos).size).toBe(dibujos.length)
  })

  it('el rótulo corto es una palabra del nombre entero, que es lo que oye el lector de pantalla', () => {
    for (const f of familias) {
      // El guion blando no se lee: solo dice por dónde partir la palabra si no cabe.
      const rotulo = ROTULO_DE_LA_FAMILIA[f]?.replace(/\u00ad/g, '')
      const titulo = tituloDeLaFamilia(f, ETIQUETA_DE_CATEGORIA)
      expect(rotulo, f).toBeTruthy()
      expect(rotulo).not.toMatch(/\s/)
      expect(sinTildes(titulo), `${rotulo} en «${titulo}»`).toContain(sinTildes(rotulo!))
    }
  })
})

describe('«Perforación y fijación» en tres familias (Q-011)', () => {
  const fijacion = (slug: string, nombre: string) => familiaDeLaMesa({ categoria: 'fijacion', slug, nombre })

  it('en la mesa van brocar, medir y atornillar, en ese orden y en el sitio de la de antes', () => {
    const orden = ordenDeLasFamilias(CATEGORIAS_DE_INSTRUMENTAL.map((c) => c.value as string))
    expect(orden).not.toContain('fijacion')
    const i = orden.indexOf('brocas')
    expect(orden.slice(i - 1, i + 4)).toEqual(['reduccion', 'brocas', 'medidores', 'destornilladores', 'modelado'])
  })

  it('cada instrumento va a la suya por su nombre; lo que no es medidor ni destornillador, con las brocas', () => {
    expect(fijacion('broca-3-5', 'Broca AO 3,5 mm')).toBe('brocas')
    expect(fijacion('guia-broca-doble-dcp', 'Guía de broca doble DCP 2,5 / 3,5')).toBe('brocas')
    expect(fijacion('machuelo-3-5', 'Machuelo 3,5 mm')).toBe('brocas')
    expect(fijacion('medidor-profundidad', 'Medidor de profundidad')).toBe('medidores')
    expect(fijacion('destornillador-stardrive', 'Destornillador Stardrive T15')).toBe('destornilladores')
    expect(fijacion('limitador-torque', 'Limitador de torque 1,5 N·m')).toBe('destornilladores')
    expect(fijacion('', 'Atornillador de bloqueo')).toBe('destornilladores')
    // Un tornillo guardado en la categoría, con los tornillos.
    expect(fijacion('tornillo-esponjosa-6-5', 'Tornillo de esponjosa 6,5')).toBe('tornillos')
    // Las demás categorías no cambian.
    expect(familiaDeLaMesa({ categoria: 'exposicion', slug: 'separador-farabeuf', nombre: 'Separador de Farabeuf' })).toBe('exposicion')
    expect(familiaDeLaMesa({ categoria: null, slug: 'x', nombre: 'x' })).toBe('otros')
  })
})

describe('finDeLaFila', () => {
  it('la lista va tras el último cuadro de la fila del pinchado', () => {
    expect(COLUMNAS_DE_LA_MESA).toBe(3)
    expect(finDeLaFila(0, 12)).toBe(2)
    expect(finDeLaFila(1, 12)).toBe(2)
    expect(finDeLaFila(2, 12)).toBe(2)
    expect(finDeLaFila(3, 12)).toBe(5)
    expect(finDeLaFila(11, 12)).toBe(11)
  })

  it('con la última fila a medias, tras el último cuadro que hay', () => {
    expect(finDeLaFila(9, 10)).toBe(9)
    expect(finDeLaFila(6, 8)).toBe(7)
    expect(finDeLaFila(0, 1)).toBe(0)
    expect(finDeLaFila(0, 2)).toBe(1)
  })

  it('con otro número de columnas', () => {
    expect(finDeLaFila(4, 10, 4)).toBe(7)
    expect(finDeLaFila(9, 10, 4)).toBe(9)
  })
})

describe('anotarReciente', () => {
  it('pone delante el último cogido', () => {
    expect(anotarReciente([], 'broca')).toEqual(['broca'])
    expect(anotarReciente(['broca'], 'medidor')).toEqual(['medidor', 'broca'])
  })

  it('el que vuelve a cogerse sube, sin repetirse', () => {
    expect(anotarReciente(['medidor', 'broca', 'bisturi'], 'broca')).toEqual(['broca', 'medidor', 'bisturi'])
    expect(anotarReciente(['broca'], 'broca')).toEqual(['broca'])
  })

  it('con tope: el más antiguo sale', () => {
    const llena = ['a', 'b', 'c', 'd', 'e']
    expect(MAXIMO_DE_RECIENTES).toBe(5)
    expect(anotarReciente(llena, 'f')).toEqual(['f', 'a', 'b', 'c', 'd'])
    expect(anotarReciente(llena, 'f', 2)).toEqual(['f', 'a'])
  })

  it('no toca la lista que recibe: es un estado de React', () => {
    const antes = Object.freeze(['a', 'b'])
    expect(anotarReciente(antes, 'c')).toEqual(['c', 'a', 'b'])
    expect(antes).toEqual(['a', 'b'])
  })
})

describe('la consola', () => {
  const consola = fuente('src', 'components', 'simulador', 'ConsolaQuirurgica.tsx')
  const barra = fuente('src', 'components', 'simulador', 'BarraDeInstrumental.tsx')

  it('la mesa va en la columna izquierda, la primera, también para el residente', () => {
    expect(consola).toMatch(/<div className="consola-izq">\s*(\{\/\*[\s\S]*?\*\/\}\s*)?\{bloqueDeLaBandeja\}/)
    // Antes iba a la derecha para el residente y a la izquierda para el editor.
    expect(consola).not.toMatch(/!editor \? bloqueDeLaBandeja/)
    expect(consola.match(/\{bloqueDeLaBandeja\}/g)).toHaveLength(1)
  })

  it('coger de la mesa pliega la lista y vacía el buscador', () => {
    const coger = consola.slice(consola.indexOf('const cogerDeLaMesa = '), consola.indexOf('const cogerDeLaMesa = ') + 300)
    expect(coger).toContain('elegirInstrumento(id)')
    expect(coger).toContain('setCategoriaAbierta(null)')
    expect(coger).toContain("setBusquedaDeInstrumento('')")
    expect(consola).toContain('onClick={() => cogerDeLaMesa(it.id)}')
    expect(consola).toContain('<ElegirPlacaRecta enLaMano={instrumento} alElegir={cogerDeLaMesa} />')
  })

  it('cada instrumento cogido queda en los recientes', () => {
    expect(consola).toMatch(/setInstrumento\(id\)\s*if \(id\) setRecientes\(\(antes\) => anotarReciente\(antes, id\)\)/)
  })

  it('los cuadros dicen si están abiertos y cuál tiene el de la mano', () => {
    expect(barra).toContain('aria-expanded={esLaAbierta}')
    expect(barra).toContain("', tiene el de la mano'")
    // Buscando, la familia sin coincidencias se apaga: no desaparece, para que la mesa no baile.
    expect(barra).toContain('disabled={buscando && cuenta === 0}')
  })

  it('Esc cierra la lista, salvo en el buscador, que ya lo usa para vaciarse', () => {
    expect(barra).toMatch(/e\.key !== 'Escape' \|\| !desplegada \|\| \(e\.target instanceof HTMLInputElement && e\.target\.type === 'search'\)/)
  })

  it('Enter en el buscador coge el instrumento cuando solo hay uno', () => {
    expect(barra).toMatch(/if \(todos\.length !== 1\) return\s*e\.preventDefault\(\)\s*alCoger\(todos\[0\]\.id\)/)
  })
})
