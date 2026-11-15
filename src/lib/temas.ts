/**
 * Las paletas de la consola del simulador y del taller anatómico (P-014 E7).
 *
 * El dueño pidió «cambiar los colores del simulador para que parezca más clínico», y de las tres propuestas no
 * eligió una: pidió que el médico pudiera elegir entre las tres desde el taller. La elegida vale para toda la
 * plataforma —es un campo de `Ajustes`, la fila única— porque el residente no entra al taller: si la paleta
 * fuera de cada persona, él no tendría dónde elegirla.
 *
 * Este archivo es la lista y la lectura de cuál está elegida: los usan la colección (las opciones del campo), la
 * acción que guarda y el selector. Los colores de cada paleta viven en las hojas de estilo, bajo
 * `[data-tema='…']`: `consola.css` para la consola y `admin.css` para el taller.
 *
 * «Original» es la paleta con que nació la consola (D-149). Se conserva para poder volver a ella, pero ya no es
 * la de fábrica: lo pedido fue cambiarla.
 */
import { SLUG_DE_AJUSTES, type ClienteDeLectura } from '@/lib/mantencion'

export type Tema = 'original' | 'clara' | 'oscura-fria' | 'verde-quirofano'

export const TEMAS: readonly { valor: Tema; etiqueta: string; resumen: string }[] = [
  { valor: 'clara', etiqueta: 'Clara', resumen: 'Blanco y gris frío con azul y celeste, como un monitor clínico de día.' },
  { valor: 'oscura-fria', etiqueta: 'Oscura fría', resumen: 'Grafito y acero, con celeste en lugar del naranja.' },
  { valor: 'verde-quirofano', etiqueta: 'Verde quirófano', resumen: 'El verde de la ropa de pabellón, sobre fondo oscuro.' },
  { valor: 'original', etiqueta: 'Original', resumen: 'Azul noche con naranja: la de antes.' },
]

/** La de una plataforma que todavía no eligió: la más parecida a la de antes de las tres pedidas. */
export const TEMA_POR_OMISION: Tema = 'oscura-fria'

export function temaValido(valor: unknown): Tema {
  return TEMAS.some((t) => t.valor === valor) ? (valor as Tema) : TEMA_POR_OMISION
}

/**
 * La paleta que la plataforma tiene elegida, o la de fábrica si nadie eligió todavía.
 *
 * Como `leerMantencion`, de la que copia las dos decisiones: lee la fila más antigua de `ajustes` —la misma que
 * escribe `guardarElTema`— y lo hace con `overrideAccess`, porque quien pregunta es la plataforma y no la
 * cuenta: el residente no puede leer `ajustes`, y es a él a quien hay que pintarle la consola.
 *
 * El cliente de Payload llega de fuera por lo mismo que allí: este archivo lo importa la colección, y la
 * colección no puede importar la configuración que la contiene.
 */
export async function leerElTema(payload: ClienteDeLectura): Promise<Tema> {
  const { docs } = await payload.find({
    collection: SLUG_DE_AJUSTES as never,
    limit: 1,
    sort: 'createdAt',
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  return temaValido((docs[0] as { tema?: unknown } | undefined)?.tema)
}
