import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  accionesDelObjeto,
  claveDelObjeto,
  largosParaCambiar,
  nombreDelObjeto,
  objetosPuestos,
  type ContextoDelMenu,
  type ObjetoPuesto,
} from '@/lib/menuDelObjeto'
import { SERIES_DE_LARGOS } from '@/lib/fijacion'
import { agujerosQueSePuedenPedir, nombreDeLaPlacaRecta, placaRecta, sistemaDeLaPlacaPuesta } from '@/lib/placasRectas'
import { MenuDelObjeto } from '@/components/simulador/MenuDelObjeto'

/**
 * El menú de lo puesto en el paciente (P-013, pedidos 7 y 14 de Cristóbal): «que al pinchar el que está puesto en el
 * paciente se despliegue su propio menú» y «si es el Farabeuf, que sea "mover en este mismo plano", "profundizar", "retirar
 * del campo"… Siempre debe aparecer la de retirar. Si seleccionamos los implantes, que ofrezca "retirar" o "cambiar". Al
 * cambiar, ofrecer longitudes (placa en orificios, tornillo en mm)».
 *
 * Lo que no puede volver: un objeto sin «Retirar», o con «Retirar» en otro sitio que no sea el último —la mano lo busca
 * siempre en el mismo—; y que pinchar algo puesto obligue a ir a buscarlo a la lista de su panel.
 */

const farabeuf: ObjetoPuesto = {
  tipo: 'separador',
  id: 3,
  nombre: 'Separador de Farabeuf',
  plano: 'piel',
  palanca: false,
  aperturaMm: 12,
  maximoMm: 30,
  instrumentoId: 'farabeuf',
}
const hohmann: ObjetoPuesto = { ...farabeuf, id: 4, nombre: 'Separador de Hohmann', plano: 'hueso', palanca: true }
const tornillo: ObjetoPuesto = { tipo: 'tornillo', id: 2, agujero: 2, libre: false, deClavo: null, largoMm: 14, diametroMm: 3.5, bloqueado: false }
const placa: ObjetoPuesto = { tipo: 'placa', nombre: 'Placa LC-DCP 3,5 mm', fijada: true, agujeros: 6, tornillos: 2 }
const todos: ObjetoPuesto[] = [
  farabeuf,
  hohmann,
  { tipo: 'pinza-de-piel', id: 1, alturaMm: 4 },
  { tipo: 'pinza-de-reduccion', id: 1, nombre: 'Pinza de reducción con puntas', pieza: 'peroné distal' },
  placa,
  tornillo,
  { tipo: 'aguja', numero: 1, total: 2 },
  { tipo: 'clavo', nombre: 'Clavo endomedular · Ø 10 × 360 mm' },
  { tipo: 'injerto' },
]
const conHerida: ContextoDelMenu = {
  planosConHerida: ['piel', 'fascia', 'musculo'],
  serieDelTornillo: SERIES_DE_LARGOS.pequenoFragmento,
  sugeridoMm: 16,
  agujerosPosibles: agujerosQueSePuedenPedir(),
  alturaMaximaDeLaPinzaMm: 10,
}

describe('lo que ofrece cada cosa', () => {
  it('todo lo puesto ofrece retirarlo, y «Retirar» va siempre al final', () => {
    for (const o of todos) {
      const acciones = accionesDelObjeto(o, conHerida)
      expect(acciones.at(-1)?.id, nombreDelObjeto(o)).toBe('retirar')
      expect(acciones.filter((a) => a.id === 'retirar')).toHaveLength(1)
    }
    // Aunque no se sepa nada de fuera: sin herida, sin serie, sin sistema.
    for (const o of todos) expect(accionesDelObjeto(o, { planosConHerida: [] }).at(-1)?.id).toBe('retirar')
  })

  it('el Farabeuf: mover en este mismo plano, profundizar y retirar del campo, como lo pidió Cristóbal', () => {
    const etiquetas = accionesDelObjeto(farabeuf, conHerida).map((a) => a.etiqueta)
    expect(etiquetas).toEqual(['Mover en este mismo plano', 'Profundizar: al músculo', 'Profundizar: a la fascia', 'Apertura', 'Retirar del campo'])
  })

  it('desde el músculo se sube, y solo a los planos que tienen herida', () => {
    const enElMusculo = { ...farabeuf, plano: 'musculo' as const }
    expect(accionesDelObjeto(enElMusculo, conHerida).map((a) => a.etiqueta)).toContain('Subir: a la piel')
    const soloPiel = accionesDelObjeto(farabeuf, { planosConHerida: ['piel'] }).map((a) => a.etiqueta)
    expect(soloPiel.some((e) => e.startsWith('Profundizar'))).toBe(false)
  })

  it('el Hohmann se apoya en el hueso: no cambia de plano y su deslizador es la palanca', () => {
    const acciones = accionesDelObjeto(hohmann, conHerida)
    expect(acciones.some((a) => a.id === 'plano')).toBe(false)
    expect(acciones.find((a) => a.id === 'apertura')?.etiqueta).toBe('Palanca')
  })

  it('el tornillo se cambia por otro de su serie, en mm, con el puesto marcado y el del medidor señalado', () => {
    const cambiar = accionesDelObjeto(tornillo, conHerida).find((a) => a.id === 'cambiar')
    expect(cambiar?.id === 'cambiar' && cambiar.unidad).toBe('mm')
    const opciones = cambiar?.id === 'cambiar' ? cambiar.opciones : []
    expect(opciones.map((o) => o.valor)).toEqual([10, 12, 14, 16, 18, 20, 22])
    expect(opciones.find((o) => o.actual)?.valor).toBe(14)
    expect(opciones.find((o) => o.sugerida)?.valor).toBe(16)
  })

  it('sin un tornillo así en la bandeja no hay con qué cambiarlo: solo se retira', () => {
    expect(accionesDelObjeto(tornillo, { planosConHerida: [], serieDelTornillo: null }).map((a) => a.id)).toEqual(['retirar'])
  })

  it('el largo que pide el medidor se ofrece aunque quede lejos del puesto', () => {
    const lejos = largosParaCambiar(14, SERIES_DE_LARGOS.pequenoFragmento, 40)
    expect(lejos.map((o) => o.valor)).toContain(40)
    expect(lejos.find((o) => o.valor === 40)?.sugerida).toBe(true)
    // Y no sale de la serie: un 6 mm no existe en el pequeño fragmento.
    expect(largosParaCambiar(10, SERIES_DE_LARGOS.pequenoFragmento).map((o) => o.valor)[0]).toBe(10)
  })

  it('la placa se cambia por otra de su sistema en orificios, y retirarla pregunta por sus tornillos', () => {
    const acciones = accionesDelObjeto(placa, conHerida)
    const cambiar = acciones.find((a) => a.id === 'cambiar')
    expect(cambiar?.id === 'cambiar' && cambiar.unidad).toBe('agujeros')
    const opciones = cambiar?.id === 'cambiar' ? cambiar.opciones : []
    expect(opciones.map((o) => o.valor)).toEqual(agujerosQueSePuedenPedir())
    expect(opciones.find((o) => o.actual)?.valor).toBe(6)
    const retirar = acciones.at(-1)
    expect(retirar?.id === 'retirar' && retirar.pregunta).toBe('Se quitan también sus 2 tornillos.')
  })

  it('una placa fijada sin tornillos ofrece soltarla para moverla; con tornillos, no', () => {
    expect(accionesDelObjeto({ ...placa, tornillos: 0 }, conHerida).map((a) => a.id)).toContain('soltar-la-fijacion')
    expect(accionesDelObjeto(placa, conHerida).map((a) => a.id)).not.toContain('soltar-la-fijacion')
  })

  it('una placa sin sistema de placa recta (una anatómica) no se cambia: se retira', () => {
    expect(accionesDelObjeto(placa, { planosConHerida: [], agujerosPosibles: [] }).map((a) => a.id)).toEqual(['retirar'])
  })

  it('con varias agujas se puede retirar esa sola o todas', () => {
    expect(accionesDelObjeto({ tipo: 'aguja', numero: 2, total: 3 }, conHerida).map((a) => a.etiqueta)).toEqual(['Retirar las 3 agujas', 'Retirar esta aguja'])
    expect(accionesDelObjeto({ tipo: 'aguja', numero: 1, total: 1 }, conHerida).map((a) => a.id)).toEqual(['retirar'])
  })
})

describe('lo puesto, como lo cuenta la consola', () => {
  const lista = objetosPuestos({
    separadores: {
      lista: [
        { id: 1, nombre: 'Metzenbaum', tipo: 'roma', plano: 'fascia', aperturaMm: 6, maximoMm: 14, instrumentoId: 'metzenbaum' },
        { id: 2, nombre: 'Separador de Farabeuf', tipo: 'mano', plano: 'piel', aperturaMm: 10, maximoMm: 30, instrumentoId: 'farabeuf' },
      ],
    },
    pellizcos: { lista: [{ id: 1, alturaMm: 3 }] },
    fijacion: {
      placa: { nombre: 'Placa LC-DCP 3,5 mm', agujeros: 6, fijada: true },
      tornillos: [
        { agujero: 0, largoMm: 14, diametroMm: 3.5, bloqueado: false },
        { agujero: -1, libre: true, largoMm: 40, diametroMm: 3.5, bloqueado: false },
      ],
    },
    alambres: { lista: [{ numero: 1 }, { numero: 2 }] },
    clavo: null,
    injerto: null,
  })

  it('en el orden del campo, sin la separación roma, que no es un instrumento que se deja puesto', () => {
    expect(lista.map((o) => o.tipo)).toEqual(['separador', 'pinza-de-piel', 'placa', 'tornillo', 'tornillo', 'aguja', 'aguja'])
  })

  it('la placa cuenta todos los tornillos que se van con ella, también el de la trayectoria', () => {
    const p = lista.find((o) => o.tipo === 'placa')
    expect(p?.tipo === 'placa' && p.tornillos).toBe(2)
  })

  it('el tornillo de la trayectoria no es de ningún agujero, y su clave es la de la escena', () => {
    const libre = lista.filter((o) => o.tipo === 'tornillo')[1]
    expect(libre?.tipo === 'tornillo' && libre.agujero).toBeNull()
    expect(claveDelObjeto(libre!)).toBe('tornillo:-1')
    expect(nombreDelObjeto(libre!)).toBe('Tornillo de la trayectoria · 3,5 × 40 mm')
    expect(nombreDelObjeto(lista.filter((o) => o.tipo === 'tornillo')[0]!)).toBe('Tornillo del agujero 1 · 3,5 × 14 mm')
  })
})

describe('el sistema de la placa puesta', () => {
  const bandeja = [{ nombre: 'Placa LC-DCP 3,5 mm (8 orificios)', slug: 'placa-lc-dcp-3-5' }]

  it('se reconoce por el instrumento de la bandeja o por el nombre de la placa a medida', () => {
    expect(sistemaDeLaPlacaPuesta('Placa LC-DCP 3,5 mm (8 orificios)', bandeja)?.id).toBe('lc-dcp-3-5')
    const aMedida = placaRecta('lcp-3-5', 5)!
    expect(sistemaDeLaPlacaPuesta(nombreDeLaPlacaRecta(aMedida), [])?.id).toBe('lcp-3-5')
  })

  it('no confunde la estrecha con la ancha, y una anatómica no tiene sistema', () => {
    const ancha = placaRecta('lc-dcp-4-5-ancha', 8)!
    expect(sistemaDeLaPlacaPuesta(nombreDeLaPlacaRecta(ancha), [])?.id).toBe('lc-dcp-4-5-ancha')
    expect(sistemaDeLaPlacaPuesta('Placa LCP anatómica de tibia proximal', [{ nombre: 'Placa LCP anatómica de tibia proximal', slug: 'placa-lcp-anatomica-tibia-proximal' }])).toBeUndefined()
  })

  it('se pide de 2 a 16 agujeros, los mismos que el elegidor de la mesa', () => {
    expect(agujerosQueSePuedenPedir()).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])
  })
})

describe('el menú pintado', () => {
  const html = renderToStaticMarkup(
    createElement(MenuDelObjeto, { objeto: tornillo, acciones: accionesDelObjeto(tornillo, conHerida), x: 100, y: 100, alElegir: () => {}, alCerrar: () => {} }),
  )

  it('lleva el nombre del objeto, sus largos y «Retirar» marcado aparte', () => {
    expect(html).toContain('role="menu"')
    expect(html).toContain('Tornillo del agujero 3 · 3,5 × 14 mm')
    expect(html).toContain('Cambiar por otro de (largo)')
    expect(html).toMatch(/class="consola-menu-objeto-opcion actual"[^>]*disabled/)
    expect(html).toContain('la que pidió el medidor')
    expect(html).toMatch(/class="consola-menu-objeto-boton retirar"[^>]*>Retirar el tornillo</)
  })

  it('la apertura del separador es un deslizador en mm', () => {
    const delSeparador = renderToStaticMarkup(
      createElement(MenuDelObjeto, { objeto: farabeuf, acciones: accionesDelObjeto(farabeuf, conHerida), x: 0, y: 0, alElegir: () => {}, alCerrar: () => {} }),
    )
    expect(delSeparador).toContain('type="range"')
    expect(delSeparador).toContain('12 mm')
    expect(delSeparador).toContain('Mover en este mismo plano')
  })
})

describe('el cableado', () => {
  const consola = readFileSync(join(process.cwd(), 'src/components/simulador/ConsolaQuirurgica.tsx'), 'utf8')
  const lienzo = readFileSync(join(process.cwd(), 'src/components/simulador/LienzoQuirurgico.tsx'), 'utf8')
  const barra = readFileSync(join(process.cwd(), 'src/components/simulador/BarraDeInstrumental.tsx'), 'utf8')

  it('pinchar algo puesto en la escena abre su menú, con el clic izquierdo y con el derecho', () => {
    expect(consola).toContain('alPincharUnObjeto={abrirElMenuDelObjeto}')
    expect(lienzo).toContain("superficie.addEventListener('pointerdown', alBajarSobreUnObjeto, true)")
    // Donde el clic izquierdo ya hace algo sobre lo puesto —fijar, perforar, la ficha—, sigue haciéndolo.
    expect(lienzo).toContain("const MODOS_SIN_MENU_CON_EL_IZQUIERDO: readonly Modo[] = ['fijar', 'perforar', 'info', 'modelar', 'enclavar', 'elevar']")
  })

  it('la mesa lista lo que está en uso, debajo de «En la mano», y cada fila abre el mismo menú', () => {
    expect(barra).toContain('{enUso}')
    expect(consola).toContain('En uso en el paciente · {objetosEnUso.length}')
    expect(consola).toContain('abrirElMenuDelObjeto(o, caja.right, caja.top)')
  })

  it('cambiar un tornillo lo retira y deja en la mano el del largo elegido', () => {
    const i = consola.indexOf("case 'tornillo':\n        if (a.id === 'cambiar'")
    const j = i >= 0 ? i : consola.indexOf("case 'tornillo':\r\n        if (a.id === 'cambiar'")
    expect(j).toBeGreaterThan(0)
    const tramo = consola.slice(j, j + 900)
    expect(tramo).toContain('!m.quitarUnTornillo(o.id)')
    expect(tramo).toContain('elegirInstrumento(otro.id)')
    expect(tramo).toContain('setLargoDeTornillo(valor)')
  })
})
