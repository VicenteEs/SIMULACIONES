import { describe, it, expect } from 'vitest'
import type { Field } from 'payload'
import { COLECCIONES } from '@/collections'
import { BLOQUES as BLOQUES_PAYLOAD } from '@/blocks'
import { ESQUEMAS, esColeccionEditable, recorrerCampos, type Campo } from '@/admin/esquema'
import { BLOQUES as BLOQUES_PANEL } from '@/admin/bloques'

/**
 * El esquema del panel es paralelo a la definición de Payload, no derivado.
 *
 * Payload describe cómo se guarda el dato; `src/admin/esquema.ts`, cómo se
 * edita. Tenerlos separados evita que la interfaz quede atada a los detalles
 * del almacenamiento, pero abre la puerta a que se separen sin que nadie se
 * entere: un campo renombrado en la colección y no en el esquema deja de
 * guardarse en silencio, y el editor sigue mostrándolo como si funcionara.
 *
 * Estas pruebas son el pegamento. Si fallan, uno de los dos archivos se movió.
 */

/** Nombres de campo de una colección, entrando en pestañas y filas. */
function nombresDeCampos(campos: Field[]): Set<string> {
  const nombres = new Set<string>()
  const recorrer = (lista: Field[]) => {
    for (const campo of lista) {
      if ('name' in campo && typeof campo.name === 'string') nombres.add(campo.name)
      if ('tabs' in campo && Array.isArray(campo.tabs)) {
        for (const pestana of campo.tabs) recorrer(pestana.fields as Field[])
      }
      if ('fields' in campo && Array.isArray(campo.fields) && !('name' in campo)) {
        recorrer(campo.fields as Field[])
      }
    }
  }
  recorrer(campos)
  return nombres
}

/** Campos obligatorios de primer nivel de una colección. */
function obligatoriosDePrimerNivel(campos: Field[]): string[] {
  const nombres: string[] = []
  const recorrer = (lista: Field[]) => {
    for (const campo of lista) {
      if ('tabs' in campo && Array.isArray(campo.tabs)) {
        for (const pestana of campo.tabs) recorrer(pestana.fields as Field[])
        continue
      }
      if (
        'name' in campo &&
        typeof campo.name === 'string' &&
        (campo as { required?: boolean }).required === true
      ) {
        nombres.push(campo.name)
      }
    }
  }
  recorrer(campos)
  return nombres
}

describe('el esquema del panel cubre las colecciones', () => {
  it('describe todas las colecciones de contenido, y solo esas', () => {
    const editables = ESQUEMAS.map((e) => e.slug).sort()
    expect(editables).toEqual(
      ['casos-ao', 'cirugias', 'estudios-ia', 'maniobras', 'medios', 'modelos-3d', 'patologias', 'segmentos'].sort(),
    )
  })

  it('no deja editar usuarios, comentarios ni actividad desde el editor de contenido', () => {
    // Son colecciones con reglas propias: las cuentas se gestionan en su
    // sección, y los comentarios y la actividad los escribe la plataforma.
    for (const slug of ['usuarios', 'comentarios', 'actividad']) {
      expect(esColeccionEditable(slug), slug).toBe(false)
    }
  })

  it('cada esquema apunta a una colección que existe de verdad', () => {
    const registradas = COLECCIONES.map((c) => c.slug)
    for (const esquema of ESQUEMAS) {
      expect(registradas, esquema.slug).toContain(esquema.slug)
    }
  })

  it('todo campo del esquema existe en su colección', () => {
    for (const esquema of ESQUEMAS) {
      const coleccion = COLECCIONES.find((c) => c.slug === esquema.slug)!
      const existentes = nombresDeCampos(coleccion.fields)
      for (const campo of esquema.secciones.flatMap((s) => s.campos)) {
        expect(existentes, `${esquema.slug}.${campo.nombre} no existe en la colección`).toContain(
          campo.nombre,
        )
      }
    }
  })

  it('todo campo obligatorio de la colección está en el esquema', () => {
    // Si falta, el editor deja guardar sin él y Payload rechaza el documento
    // con un mensaje que no señala nada que se pueda tocar en pantalla.
    for (const esquema of ESQUEMAS) {
      const coleccion = COLECCIONES.find((c) => c.slug === esquema.slug)!
      const enElEsquema = new Set(esquema.secciones.flatMap((s) => s.campos).map((c) => c.nombre))
      for (const obligatorio of obligatoriosDePrimerNivel(coleccion.fields)) {
        expect(enElEsquema, `${esquema.slug}.${obligatorio} falta en el esquema`).toContain(
          obligatorio,
        )
      }
    }
  })

  it('el campo que da título a cada colección está descrito', () => {
    for (const esquema of ESQUEMAS) {
      const coleccion = COLECCIONES.find((c) => c.slug === esquema.slug)!
      expect(nombresDeCampos(coleccion.fields), esquema.slug).toContain(esquema.titulo)
    }
  })

  it('marca como versionada exactamente lo que guarda borradores', () => {
    for (const esquema of ESQUEMAS) {
      const coleccion = COLECCIONES.find((c) => c.slug === esquema.slug)!
      const tieneBorradores = Boolean(
        coleccion.versions && (coleccion.versions as { drafts?: unknown }).drafts,
      )
      expect(esquema.versionada, esquema.slug).toBe(tieneBorradores)
    }
  })

  it('las colecciones de archivo son las que suben archivos', () => {
    for (const esquema of ESQUEMAS) {
      const coleccion = COLECCIONES.find((c) => c.slug === esquema.slug)!
      expect(Boolean(esquema.subida), esquema.slug).toBe(Boolean(coleccion.upload))
    }
  })
})

describe('los bloques del panel cubren los de la plataforma', () => {
  it('describe los mismos bloques, con el mismo identificador', () => {
    expect(BLOQUES_PANEL.map((b) => b.slug).sort()).toEqual(
      BLOQUES_PAYLOAD.map((b) => b.slug).sort(),
    )
  })

  it('todo campo de un bloque existe en su definición', () => {
    for (const bloque of BLOQUES_PANEL) {
      const original = BLOQUES_PAYLOAD.find((b) => b.slug === bloque.slug)!
      const existentes = nombresDeCampos(original.fields)
      for (const campo of bloque.campos) {
        expect(existentes, `${bloque.slug}.${campo.nombre}`).toContain(campo.nombre)
      }
    }
  })
})

describe('coherencia interna del esquema', () => {
  it('ningún campo se repite dentro de una colección', () => {
    for (const esquema of ESQUEMAS) {
      const nombres = esquema.secciones.flatMap((s) => s.campos).map((c) => c.nombre)
      expect(new Set(nombres).size, esquema.slug).toBe(nombres.length)
    }
  })

  it('las columnas del listado se pueden mostrar', () => {
    // `_status` y las fechas las pone Payload; el resto tiene que ser un campo.
    const propias = new Set(['_status', 'updatedAt', 'createdAt', 'filename', 'mimeType'])
    for (const esquema of ESQUEMAS) {
      const coleccion = COLECCIONES.find((c) => c.slug === esquema.slug)!
      const existentes = nombresDeCampos(coleccion.fields)
      for (const columna of esquema.columnas) {
        if (propias.has(columna.nombre)) continue
        expect(existentes, `${esquema.slug}: columna ${columna.nombre}`).toContain(columna.nombre)
      }
    }
  })

  it('los campos por los que se busca son de texto', () => {
    const esTexto = (campo: Campo) => campo.tipo === 'texto' || campo.tipo === 'area'
    for (const esquema of ESQUEMAS) {
      const porNombre = new Map(
        [...recorrerCampos(esquema.secciones.flatMap((s) => s.campos))].map((c) => [c.nombre, c]),
      )
      for (const nombre of esquema.buscarEn) {
        const campo = porNombre.get(nombre)
        // `filename` lo pone Payload en las colecciones de archivo.
        if (!campo) {
          expect(esquema.subida, `${esquema.slug}: ${nombre}`).toBeTruthy()
          continue
        }
        expect(esTexto(campo), `${esquema.slug}: se busca en ${nombre}, que no es texto`).toBe(true)
      }
    }
  })

  it('toda selección ofrece al menos una opción', () => {
    for (const esquema of ESQUEMAS) {
      for (const campo of recorrerCampos(esquema.secciones.flatMap((s) => s.campos))) {
        if (campo.tipo === 'seleccion') {
          expect(campo.opciones.length, `${esquema.slug}.${campo.nombre}`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('toda relación apunta a una colección que existe', () => {
    const registradas = COLECCIONES.map((c) => c.slug)
    const campos = [
      ...ESQUEMAS.flatMap((e) => [...recorrerCampos(e.secciones.flatMap((s) => s.campos))]),
      ...BLOQUES_PANEL.flatMap((b) => [...recorrerCampos(b.campos)]),
    ]
    for (const campo of campos) {
      if (campo.tipo === 'relacion' || campo.tipo === 'archivo') {
        expect(registradas, `${campo.nombre} -> ${campo.coleccion}`).toContain(campo.coleccion)
      }
    }
  })
})
