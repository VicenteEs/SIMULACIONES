import { describe, it, expect } from 'vitest'
import type { Field } from 'payload'
import { depurarDocumento } from '@/admin/depurar'
import { ESQUEMAS, camposDe, esquemaDe, recorrerCampos } from '@/admin/esquema'
import { Cirugias } from '@/collections/Cirugias'

/**
 * Con qué se queda una selección obligatoria que llega vacía.
 *
 * `depurarCampos` escribe **siempre** la clave, así que a Payload nunca le
 * llega `undefined` y su `defaultValue` no se aplica jamás: el único valor por
 * omisión que actúa de verdad es el que decide el depurador. Estaba tomando
 * `opciones[0]`, y el orden de una lista de opciones es de presentación.
 *
 * En `piezas[].rol` eso significaba guardar «piel» —la primera, porque es la
 * capa más externa— donde el taller de piezas, la colección, la migración y la
 * consola dicen «hueso». Y la consola abre con piel y músculo apagados, de
 * modo que el hueso recién declarado no se veía: el mismo error silencioso que
 * el taller se escribió para matar.
 */

/** Recorre los campos de una colección de Payload, pestañas y filas incluidas. */
function* recorrerPayload(campos: Field[]): Generator<Field> {
  for (const campo of campos) {
    yield campo
    if ('tabs' in campo && Array.isArray(campo.tabs)) {
      for (const pestana of campo.tabs) yield* recorrerPayload(pestana.fields as Field[])
    }
    if ('fields' in campo && Array.isArray(campo.fields)) {
      yield* recorrerPayload(campo.fields as Field[])
    }
  }
}

/** El `defaultValue` que declara la colección para un campo suyo. */
function porOmisionEnLaColeccion(nombre: string): unknown {
  for (const campo of recorrerPayload(Cirugias.fields)) {
    if ('name' in campo && campo.name === nombre && 'defaultValue' in campo) {
      return (campo as { defaultValue?: unknown }).defaultValue
    }
  }
  return undefined
}

/** El respaldo que declara el esquema del panel para un campo suyo. */
function porOmisionEnElPanel(slug: string, nombre: string): string | undefined {
  for (const campo of recorrerCampos(camposDe(esquemaDe(slug)))) {
    if (campo.nombre === nombre && campo.tipo === 'seleccion') return campo.porOmision
  }
  return undefined
}

describe('respaldo de una selección obligatoria', () => {
  it('una pieza sin rol elegido se guarda como hueso', () => {
    // El botón «+ Agregar pieza» añade la fila como `{}`: nadie elige el rol
    // hasta que lo cambia, y hasta entonces lo que se guarda es el respaldo.
    const documento = depurarDocumento(esquemaDe('cirugias'), {
      piezas: [{ nodo: 'Diafisis' }],
    })
    const [pieza] = documento.piezas as Record<string, unknown>[]
    expect(pieza.rol).toBe('hueso')
  })

  it('un rol inventado tampoco se conserva', () => {
    const documento = depurarDocumento(esquemaDe('cirugias'), {
      piezas: [{ nodo: 'Diafisis', rol: 'cartilago' }],
    })
    const [pieza] = documento.piezas as Record<string, unknown>[]
    expect(pieza.rol).toBe('hueso')
  })

  it('el respaldo del panel es el mismo que el de la colección', () => {
    // Si se separan, la fila queda contradictoria dentro de la misma pantalla:
    // la tabla del taller enseña una cosa y la base guarda otra.
    expect(porOmisionEnLaColeccion('rol')).toBe('hueso')
    expect(porOmisionEnElPanel('cirugias', 'rol')).toBe(porOmisionEnLaColeccion('rol'))
  })

  it('ningún respaldo declarado queda fuera de su propia lista de opciones', () => {
    // Una errata en `porOmision` guardaría un valor que el renderizador
    // público no sabe pintar, y no daría error en ningún sitio.
    for (const esquema of ESQUEMAS) {
      for (const campo of recorrerCampos(camposDe(esquema))) {
        if (campo.tipo !== 'seleccion' || campo.porOmision === undefined) continue
        expect(
          campo.opciones.map((o) => o.valor),
          `${esquema.slug}.${campo.nombre}`,
        ).toContain(campo.porOmision)
      }
    }
  })
})
