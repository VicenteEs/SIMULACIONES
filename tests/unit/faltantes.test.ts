import { describe, it, expect } from 'vitest'
import { depurarDocumento, faltantes } from '@/admin/depurar'
import { esquemaDe } from '@/admin/esquema'

/**
 * Lo que el panel dice que falta.
 *
 * `faltantes` existe para que el aviso hable el idioma de la pantalla —«Falta
 * «técnica»»— y no el de la base —«El siguiente campo es inválido: tecnica»—.
 * Tenía dos agujeros por los que se colaba justo lo que más cuesta encontrar:
 *
 * 1. Un texto rico vacío no es `null` ni `''`, sino un árbol con un párrafo en
 *    blanco, así que la prueba de forma no podía ser cierta nunca para un
 *    campo `rico`. En Maniobras eso son «Técnica» y «Qué se considera
 *    positivo», los dos obligatorios y los dos el cuerpo de la ficha.
 * 2. Solo se miraba el primer nivel, de modo que lo obligatorio de dentro de
 *    una fila no se revisaba. El mensaje de Payload para esos casos es
 *    `pasos.2.objetivo`, que no se parece a nada de lo que hay en pantalla.
 * 3. Se descendía a filas y grupos pero no a bloques, que es donde vive la
 *    mayor parte de la ficha: una advertencia sin texto seguía muriendo en
 *    Payload con `definicion.0.texto`.
 *
 * Y lo contrario también se prueba: al guardar un borrador esa revisión
 * profunda **no** debe correr (D-011), porque la ficha se escribe a lo largo de
 * varios días y un obligatorio todavía en blanco no puede impedir guardar.
 */

const maniobras = esquemaDe('maniobras')
const patologias = esquemaDe('patologias')
const cirugias = esquemaDe('cirugias')

/** Un árbol de texto rico con texto de verdad dentro. */
const conTexto = (texto: string) => ({
  root: {
    type: 'root',
    children: [
      { type: 'paragraph', children: [{ type: 'text', text: texto, format: 0 }] },
    ],
  },
})

describe('texto rico obligatorio', () => {
  it('un texto rico sin escribir cuenta como falta', () => {
    const documento = depurarDocumento(maniobras, {
      nombre: 'Lachman',
      segmento: 7,
      evalua: 'Ligamento cruzado anterior',
    })
    // Depurado, `tecnica` ya no es undefined: es el árbol con un párrafo
    // vacío que devuelve `haciaLexical`. Ese es exactamente el valor que se
    // colaba.
    expect(documento.tecnica).not.toBeNull()

    const problemas = faltantes(maniobras, documento).join(' ')
    expect(problemas).toContain('técnica')
    expect(problemas).toContain('qué se considera positivo')
  })

  it('un texto rico con contenido no cuenta como falta', () => {
    const documento = depurarDocumento(maniobras, {
      nombre: 'Lachman',
      segmento: 7,
      evalua: 'Ligamento cruzado anterior',
      tecnica: conTexto('Rodilla a 30° de flexión.'),
      positivo: conTexto('Desplazamiento anterior sin tope firme.'),
    })
    expect(faltantes(maniobras, documento)).toEqual([])
  })
})

describe('campos obligatorios dentro de una lista', () => {
  it('nombra la fila por su posición, como se ve en el editor', () => {
    const documento = depurarDocumento(patologias, {
      nombre: 'Fractura de fémur',
      segmento: 7,
      fases: [
        { cuando: '0-2 semanas', titulo: 'Protección', contenido: 'Descarga' },
        { cuando: '2-6 semanas' },
      ],
    })
    const problemas = faltantes(patologias, documento)
    expect(problemas).toContain('Falta «objetivo de la fase» en fase 2.')
    expect(problemas).toContain('Falta «qué se trabaja» en fase 2.')
    // La primera está completa y no se nombra.
    expect(problemas.join(' ')).not.toContain('fase 1')
  })

  it('desciende también a las listas del simulador', () => {
    const documento = depurarDocumento(cirugias, {
      titulo: 'Clavo endomedular de tibia',
      piezas: [{ etiqueta: 'Fragmento distal' }],
    })
    // `nodo` es el nombre del objeto de Blender: sin él la pieza no existe en
    // el modelo, y era de los que no se miraban.
    expect(faltantes(cirugias, documento).join(' ')).toContain('en pieza 1')
  })

  it('una lista vacía no inventa filas que revisar', () => {
    const documento = depurarDocumento(patologias, { nombre: 'Ficha', segmento: 7, fases: [] })
    expect(faltantes(patologias, documento)).toEqual([])
  })
})

describe('campos obligatorios dentro de un bloque', () => {
  it('nombra el bloque por su nombre y su posición', () => {
    const documento = depurarDocumento(patologias, {
      nombre: 'Fractura de fémur',
      segmento: 7,
      definicion: [
        { blockType: 'texto', cuerpo: conTexto('Rotura de la diáfisis femoral.') },
        // Una advertencia recién apilada y todavía sin escribir. `tono` se
        // rellena solo con su respaldo; `texto` queda en null.
        { blockType: 'advertencia' },
      ],
    })
    const problemas = faltantes(patologias, documento)
    expect(problemas).toContain('Falta «texto» en advertencia 2.')
    // El bloque de texto está completo y no se nombra.
    expect(problemas.join(' ')).not.toContain('texto 1')
  })

  it('baja también a las listas que hay dentro de un bloque, sin perder cuál es', () => {
    const documento = depurarDocumento(patologias, {
      nombre: 'Fractura de fémur',
      segmento: 7,
      clasificacion: [
        {
          blockType: 'lista-clinica',
          titulo: 'Signos',
          puntos: [{ destacado: 'Dolor' }],
        },
      ],
    })
    const problemas = faltantes(patologias, documento).join(' ')
    expect(problemas).toContain('en punto 1')
    expect(problemas).toContain('en lista clínica 1')
  })

  it('un bloque inventado no rompe la revisión', () => {
    const documento = {
      nombre: 'Ficha',
      segmento: 7,
      definicion: [{ blockType: 'no-existe' }, null],
    }
    expect(faltantes(patologias, documento)).toEqual([])
  })
})

/**
 * Publicar exige la ficha entera; guardar un borrador, no.
 *
 * Payload ya hace esta distinción —con `draft: true` se salta lo obligatorio—,
 * y `faltantes` tiene que hacer la misma o «Guardar borrador» deja de guardar.
 */
describe('borrador contra publicación', () => {
  it('un borrador con los textos ricos en blanco se guarda', () => {
    const documento = depurarDocumento(maniobras, {
      nombre: 'Lachman',
      segmento: 7,
      evalua: 'Ligamento cruzado anterior',
    })
    expect(faltantes(maniobras, documento, { profundo: false })).toEqual([])
    // La misma maniobra, al publicar, sí protesta.
    expect(faltantes(maniobras, documento).join(' ')).toContain('técnica')
  })

  it('un borrador con una fila a medias se guarda', () => {
    const documento = depurarDocumento(cirugias, {
      nombre: 'Clavo endomedular de tibia',
      piezas: [{ etiqueta: 'Fragmento distal' }],
    })
    expect(faltantes(cirugias, documento, { profundo: false })).toEqual([])
    expect(faltantes(cirugias, documento).join(' ')).toContain('en pieza 1')
  })

  it('un borrador sin nombre sigue avisando: eso se ve de un vistazo', () => {
    const documento = depurarDocumento(maniobras, { evalua: 'Ligamento cruzado anterior' })
    const problemas = faltantes(maniobras, documento, { profundo: false })
    expect(problemas).toContain('Falta «nombre de la maniobra».')
  })
})
