import { describe, it, expect } from 'vitest'
import { avisoDeContenidoQueSeBorraria, depurarDocumento, faltantes } from '@/admin/depurar'
import { esquemaDe } from '@/admin/esquema'

/**
 * Los dos avisos que el panel da **antes** de llamar a Payload.
 *
 * Los dos existen por la misma razón: lo que Payload contesta cuando algo no le
 * cuadra llega como `ValidationError` en inglés y con el nombre interno del
 * campo, y el texto en español se queda dentro de `error.data`, que es lo que
 * `accion()` no enseña. Quien escribe la ficha ve media frase que no señala
 * nada que pueda tocar.
 *
 *  1. El rango que exige el objetivo de un paso, que la colección ya rechaza
 *     al publicar (`exigeElRangoDeSuObjetivo`, en `src/collections/Cirugias.ts`).
 *  2. El contenido de texto rico que este editor no sabe representar. Ese no lo
 *     rechaza nadie: se borra solo al guardar, y el aviso es lo único que hay
 *     entre una imagen puesta hace meses y su desaparición.
 */

const cirugias = esquemaDe('cirugias')
const patologias = esquemaDe('patologias')
const maniobras = esquemaDe('maniobras')

describe('el rango que pide el objetivo de un paso', () => {
  const pasoCon = (extra: Record<string, unknown>) =>
    depurarDocumento(cirugias, {
      nombre: 'Clavo endomedular de tibia',
      pasos: [{ titulo: 'Incisión de entrada', ...extra }],
    })

  it('avisa en español y nombra la fila cuando el trazo no trae longitudes', () => {
    const problemas = faltantes(cirugias, pasoCon({ objetivo: 'trazo' }))
    expect(problemas.join(' ')).toContain('En paso 1:')
    expect(problemas.join(' ')).toContain('al menos una de las dos longitudes')
  })

  it('con una sola de las dos longitudes ya está declarado el rango', () => {
    const problemas = faltantes(cirugias, pasoCon({ objetivo: 'trazo', trazoMinimo: 30 }))
    expect(problemas.join(' ')).not.toContain('longitudes')
  })

  it('lo mismo con la fuerza', () => {
    expect(faltantes(cirugias, pasoCon({ objetivo: 'fuerza' })).join(' ')).toContain(
      'al menos uno de los dos topes',
    )
    expect(
      faltantes(cirugias, pasoCon({ objetivo: 'fuerza', fuerzaMaxima: 20 })).join(' '),
    ).not.toContain('topes')
  })

  it('no le pide rango al paso que solo manda elegir el instrumento', () => {
    expect(faltantes(cirugias, pasoCon({ objetivo: 'instrumento' })).join(' ')).not.toContain(
      'rango',
    )
  })

  it('al guardar un borrador no dice nada, como tampoco lo dice Payload', () => {
    // Payload salta sus validaciones con `draft: true`. Avisar antes que él
    // dejaría el borrador sin poder guardarse, que es justo lo que D-011 no
    // quiere: la ficha se escribe a lo largo de varios días.
    const problemas = faltantes(cirugias, pasoCon({ objetivo: 'trazo' }), { profundo: false })
    expect(problemas.join(' ')).not.toContain('longitudes')
  })
})

describe('el contenido de texto rico que este editor no sabe representar', () => {
  /** Un árbol como el que dejó la interfaz de Payload antes de retirarse. */
  const conNodo = (tipo: string) => ({
    root: {
      type: 'root',
      children: [
        { type: 'paragraph', children: [{ type: 'text', text: 'Rotura de la diáfisis.' }] },
        { type: tipo, version: 1, relationTo: 'medios', value: { id: 4 } },
      ],
    },
  })

  const soloTexto = {
    root: {
      type: 'root',
      children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Sin nada raro.' }] }],
    },
  }

  it('una ficha escrita desde este panel no tiene nada que perder', () => {
    expect(avisoDeContenidoQueSeBorraria(maniobras, { nombre: 'Lachman' })).toBeNull()
    expect(
      avisoDeContenidoQueSeBorraria(maniobras, { nombre: 'Lachman', tecnica: soloTexto }),
    ).toBeNull()
  })

  it('la imagen metida dentro del texto se nombra, con el campo en el que está', () => {
    const aviso = avisoDeContenidoQueSeBorraria(maniobras, {
      nombre: 'Lachman',
      tecnica: conNodo('upload'),
    })
    expect(aviso).toContain('una imagen o un archivo')
    expect(aviso).toContain('«Técnica»')
    // Y dice cómo salir del paso, que es lo que separa un aviso de un muro.
    expect(aviso).toContain('escriba algo en ese campo')
  })

  it('también la línea divisoria y la ficha enlazada', () => {
    expect(
      avisoDeContenidoQueSeBorraria(maniobras, { tecnica: conNodo('horizontalrule') }),
    ).toContain('línea divisoria')
    expect(avisoDeContenidoQueSeBorraria(maniobras, { tecnica: conNodo('relationship') })).toContain(
      'ficha enlazada',
    )
  })

  it('lo encuentra dentro de un bloque, que es donde vive casi todo', () => {
    const aviso = avisoDeContenidoQueSeBorraria(patologias, {
      nombre: 'Fractura de fémur',
      definicion: [{ blockType: 'texto', cuerpo: conNodo('upload') }],
    })
    expect(aviso).toContain('en texto 1')
  })

  it('lo encuentra anidado en mitad del árbol y no solo en la raíz', () => {
    const dentroDeUnaCita = {
      root: {
        type: 'root',
        children: [
          { type: 'quote', children: [{ type: 'horizontalrule', version: 1 }] },
        ],
      },
    }
    expect(avisoDeContenidoQueSeBorraria(maniobras, { tecnica: dentroDeUnaCita })).toContain(
      'línea divisoria',
    )
  })

  it('no se atraganta con lo que llegue: aquí entra el documento crudo', () => {
    // Es lo que manda quien llama a la acción, no lo que produce el formulario.
    expect(avisoDeContenidoQueSeBorraria(maniobras, { tecnica: null })).toBeNull()
    expect(avisoDeContenidoQueSeBorraria(maniobras, { tecnica: 'texto suelto' })).toBeNull()
    expect(avisoDeContenidoQueSeBorraria(maniobras, { tecnica: { root: 7 } })).toBeNull()
    expect(avisoDeContenidoQueSeBorraria(patologias, { definicion: [null, 3, {}] })).toBeNull()
  })
})
