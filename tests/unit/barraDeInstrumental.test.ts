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
import {
  CATEGORIAS_DE_INSTRUMENTAL,
  categoriaDelInstrumento,
  ETIQUETA_DE_CATEGORIA,
  INSTRUMENTAL_BASE,
} from '@/lib/instrumental'
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

describe('cada instrumento en su familia aunque lo guardado diga «Perforación y fijación» (O-083, D-270)', () => {
  // Los trece del guion del caso de demostración, con la familia en que los busca quien está operando.
  const DEL_GUION: readonly (readonly [string, string])[] = [
    ['Bisturí N°10 (piel)', 'corte'],
    ['Bisturí profundo (fascia)', 'corte'],
    ['Separador de Farabeuf', 'exposicion'],
    ['Separador de Hohmann', 'exposicion'],
    ['Pinza de reducción', 'reduccion'],
    ['Punzón de entrada', 'enclavado'],
    ['Guía endomedular', 'enclavado'],
    ['Fresa flexible', 'enclavado'],
    ['Impactador de clavo', 'enclavado'],
    ['Atornillador de bloqueo', 'destornilladores'],
    ['Pinza de disección', 'corte'],
    ['Porta-agujas', 'suturas'],
    ['Tijera de Mayo', 'corte'],
  ]

  it('los del guion, guardados con la categoría por omisión o sin ninguna, van a la suya y no a las brocas', () => {
    for (const [nombre, familia] of DEL_GUION) {
      const slug = nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')
      expect(familiaDeLaMesa({ categoria: 'fijacion', slug, nombre }), nombre).toBe(familia)
      expect(familiaDeLaMesa({ categoria: null, slug: null, nombre }), `${nombre} sin categoría`).toBe(familia)
    }
  })

  it('el guion los guarda ya con la categoría que la mesa les da', () => {
    const guion = fuente('scripts', 'caso-de-prueba.ts')
    const filas = [...guion.matchAll(/\{ nombre: '([^']+)', categoria: '([a-z]+)', icono:/g)]
    expect(filas.map((f) => f[1])).toEqual(DEL_GUION.map(([nombre]) => nombre))
    for (const [, nombre, categoria] of filas) {
      expect(familiaDeLaMesa({ categoria, nombre }), nombre).toBe(familiaDeLaMesa({ categoria: null, nombre }))
    }
  })

  it('cada instrumento de la base, aunque la migración le dejara «Perforación y fijación», vuelve a su categoría', () => {
    for (const b of INSTRUMENTAL_BASE) {
      expect(categoriaDelInstrumento({ categoria: 'fijacion', slug: b.slug, nombre: b.nombre }), b.slug).toBe(b.categoria)
      // Con otro slug —el que se dio a mano, o ninguno—, por el nombre.
      expect(categoriaDelInstrumento({ categoria: 'fijacion', slug: null, nombre: b.nombre }), b.nombre).toBe(b.categoria)
    }
  })

  it('el martillo va con el clavo, y la aguja de Kirschner y el motor siguen con las brocas', () => {
    expect(familiaDeLaMesa({ categoria: 'fijacion', slug: 'martillo', nombre: 'Martillo con caras de nailon' })).toBe('enclavado')
    expect(familiaDeLaMesa({ categoria: 'fijacion', slug: 'aguja-kirschner', nombre: 'Aguja de Kirschner 1,6 mm' })).toBe('brocas')
    expect(familiaDeLaMesa({ categoria: 'fijacion', slug: 'motor-quirurgico', nombre: 'Motor quirúrgico a batería' })).toBe('brocas')
  })

  it('las palabras que se parecen no confunden la familia', () => {
    const sinBase = (nombre: string) => familiaDeLaMesa({ categoria: 'fijacion', slug: null, nombre })
    // Lleva «tornillo» dentro y es un medidor; el destornillador, igual.
    expect(sinBase('Medidor de largo de tornillo')).toBe('medidores')
    expect(sinBase('Destornillador canulado 3,5')).toBe('destornilladores')
    expect(sinBase('Tornillo canulado 7,3 mm')).toBe('tornillos')
    // Farabeuf es un separador y también un periostótomo; manda la otra palabra.
    expect(sinBase('Periostótomo de Farabeuf recto')).toBe('periostio')
    expect(sinBase('Separador de Farabeuf pequeño')).toBe('exposicion')
    // Reductor, pero del canal: va con el clavo.
    expect(sinBase('Dedo reductor endomedular corto')).toBe('enclavado')
    expect(sinBase('Portaagujas de Mathieu')).toBe('suturas')
    expect(sinBase('Electrobisturí monopolar')).toBe('corte')
    // Lo que no dice nada se queda donde estaba: con las brocas.
    expect(sinBase('Broca escalonada 4,0')).toBe('brocas')
    expect(sinBase('Clavo de Steinmann 4 mm')).toBe('brocas')
  })

  it('una categoría elegida que no es la de por omisión se respeta, diga lo que diga el nombre', () => {
    expect(categoriaDelInstrumento({ categoria: 'reduccion', nombre: 'Bisturí de prueba' })).toBe('reduccion')
    expect(categoriaDelInstrumento({ categoria: 'corte', nombre: 'Broca AO 2,5 mm' })).toBe('corte')
    expect(categoriaDelInstrumento({ categoria: null, nombre: 'Algo sin nombre conocido' })).toBe(null)
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
    expect(consola).toMatch(/<div className="consola-izq"[^>]*>\s*(\{\/\*[\s\S]*?\*\/\}\s*)?\{bloqueDeLaBandeja\}/)
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

  it('cada instrumento cogido queda en su sitio de la mesa de Mayo (P-012 E5)', () => {
    expect(consola).toMatch(/setInstrumento\(id\)\s*if \(id\) setMesaDeMayo\(\(antes\) => cogerEnLaMesa\(antes, id\)\)/)
    // Las teclas leen la misma mesa que se pinta: si leyeran otra lista, el número de la pantalla mentiría.
    expect(consola).toContain('instrumentoDeLaTecla(e.key, mesaDeMayo, instrumento)')
    expect(consola).toContain('const id = mesaDeMayo.sitios[i] ?? null')
    expect(consola).toContain('posicionEnElAro(i, EN_EL_MENU, 72)')
  })

  it('la mesa enseña la tecla de cada sitio, también la del de la mano', () => {
    expect(barra).toContain('Mesa de Mayo · teclas 1 a 5')
    expect(barra).toContain('aria-pressed={r.enLaMano}')
    expect(barra).toContain('{r.tecla}')
    // El de la mano no sale de la fila, que es lo que corría a los demás.
    expect(consola).not.toContain('.filter((id) => id !== instrumento)')
  })

  it('un recorrido nuevo empieza con la mesa de Mayo vacía', () => {
    // Visto en el navegador: tras «Reiniciar el caso», la evaluación empezaba con la mesa que había llenado la práctica.
    const desde = consola.indexOf('const empezarElCaso = (elegido: ModoDeJuego) => {')
    expect(desde).toBeGreaterThan(0)
    expect(consola.slice(desde, consola.indexOf('\n  }\n', desde))).toContain('setMesaDeMayo(MESA_VACIA)')
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
