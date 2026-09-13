import { Cirugias, camposDe, type Opcion } from './esquema'
import type { RolDePieza } from '@/lib/piezasDelCaso'

/**
 * El nombre con el que el formulario del caso enseña cada papel de pieza.
 *
 * Sale de las `opciones` del campo `rol` en `esquema.ts` y no de una tabla
 * escrita aquí. Las tablas escritas a mano ya se han separado: el taller de
 * piezas dice «Hueso fijo» donde el formulario dice «Hueso (fijo)», y el taller
 * del atlas estrenaba la suya prometiendo en un comentario que «el panel y el
 * caso digan lo mismo», cosa que nada comprobaba. Leído del esquema, el
 * formulario y quien use esto no pueden decir cosas distintas: son la misma
 * lista.
 *
 * El tipo es `Partial` a propósito. Derivado de un dato y no escrito papel a
 * papel, el compilador ya no puede garantizar que estén los cinco, y un
 * `Record` completo mentiría justo el día en que alguien añadiera un papel a
 * `ROLES_DE_PIEZA` sin darle opción en el esquema. Quien lo lea tiene que tener
 * a mano un respaldo —el valor crudo—, y que estén los cinco lo comprueba
 * `tests/unit/etiquetaDeRol.test.ts` contra `ROLES_DE_PIEZA` y contra las
 * etiquetas de la colección de Payload.
 */
function opcionesDelRol(): Opcion[] {
  const piezas = camposDe(Cirugias).find((campo) => campo.nombre === 'piezas')
  const rol =
    piezas?.tipo === 'lista' ? piezas.campos.find((campo) => campo.nombre === 'rol') : undefined
  return rol?.tipo === 'seleccion' ? rol.opciones : []
}

export const ETIQUETA_DE_ROL: Readonly<Partial<Record<RolDePieza, string>>> = Object.fromEntries(
  opcionesDelRol().map((opcion) => [opcion.valor, opcion.etiqueta] as const),
)
