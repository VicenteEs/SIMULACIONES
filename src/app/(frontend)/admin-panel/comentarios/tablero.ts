import type { Payload } from 'payload'
import { leerTodas } from '@/lib/leerTodas'
import {
  claveDeDia,
  claveDeSemana,
  contarEn,
  diasEntre,
  leerFecha,
  ultimasSemanas,
  ultimosDias,
  ultimosYAnteriores,
  type Casilla,
} from '@/lib/series'
import { MODULOS, SLUG_DEL_TALLER } from '../modulos'

/**
 * Las cifras y los gráficos de la cabecera de «Comentarios» (P-007 E5, D-238).
 *
 * Se leen aparte del listado, y de toda la tabla: el listado trae los
 * quinientos más recientes con su autor, y contar sobre él daría, pasado ese
 * tope, los pendientes de los quinientos últimos presentados como los de
 * siempre. Aquí van solo tres columnas por fila.
 *
 * **Lo que no se cuenta, y por qué.** El tablero de Penpot pide «resueltos este
 * mes», «tiempo medio de respuesta» y «llevaron a un cambio». Los tres
 * necesitan saber cuándo se resolvió cada comentario, y la colección no lo
 * guarda: `estado` dice si está resuelto, no desde cuándo. `updatedAt` parece
 * servir y no sirve. Es la última vez que se escribió la fila, y la fila se
 * reescribe por algo que no es resolverla: al borrar una cuenta, todos sus
 * comentarios —resueltos incluidos— pasan a no tener autor
 * (`anonimizarComentarios` en `Usuarios.ts`), y con eso los treinta
 * comentarios que una residente dejó el año pasado aparecerían resueltos el día
 * en que se borró su cuenta. Tampoco el registro de acciones lo dice: anota
 * «modificó» el comentario sin decir qué cambió. Lo que sí se sabe con fecha es
 * cuándo llegó cada uno, y de eso sale todo lo de abajo; lo otro espera a que la
 * base guarde la fecha de resolución (E6).
 */

export interface TableroDeComentarios {
  total: number
  pendientes: number
  resueltos: number
  /** Los días enteros que lleva esperando el pendiente más antiguo; `null` si no queda ninguno. */
  diasDelMasAntiguo: number | null
  semanas: Casilla[]
  /** Los recibidos cada una de esas semanas. */
  porSemana: number[]
  /** Los recibidos en los últimos 30 días, y en los 30 de antes (`null` si no hay con qué comparar). */
  recibidos30: number
  recibidosAntes30: number | null
  /** De los recibidos en los últimos 30 días, cuántos están hoy resueltos. */
  resueltosDeLos30: number
  /** Dónde se dejaron: los cinco módulos, el taller y los catálogos. */
  porDestino: { etiqueta: string; valor: number; color: string }[]
}

/** Las semanas que dibuja «Comentarios por semana»: ocho, como el tablero. */
export const SEMANAS_DEL_GRAFICO = 8

/**
 * El color de cada módulo es el suyo de siempre (`--mod-1` a `--mod-5`, en el
 * orden de `MODULOS`), el mismo que lleva en el inicio y en las insignias; el
 * taller va en cian y los catálogos en gris, porque no son módulos.
 */
const DESTINOS: { etiqueta: string; color: string; incluye: (coleccion: string) => boolean }[] = [
  ...MODULOS.map((m, i) => ({
    etiqueta: m.nombre,
    color: `var(--mod-${i + 1})`,
    incluye: (coleccion: string) => coleccion === m.slug,
  })),
  { etiqueta: 'Taller anatómico', color: 'var(--cian)', incluye: (coleccion: string) => coleccion === SLUG_DEL_TALLER },
  // Lo que no es ni módulo ni taller son los avisos de las filas nuevas de un
  // catálogo (D-177). Van juntos: seis catálogos en seis sectores finos no se
  // distinguen, y una dona pasa de ilegible con más de seis partes.
  {
    etiqueta: 'Catálogos',
    color: 'var(--linea-fuerte)',
    incluye: (coleccion: string) => coleccion !== SLUG_DEL_TALLER && !MODULOS.some((m) => m.slug === coleccion),
  },
]

/**
 * Las cuentas, sin tocar la base: lo que se prueba en
 * `tests/unit/tableroDeComentarios.test.ts`.
 */
export function resumirComentarios(
  filas: readonly { estado?: unknown; coleccion?: unknown; createdAt?: unknown }[],
  hoy: Date = new Date(),
): TableroDeComentarios {
  const pendientes = filas.filter((c) => c.estado !== 'resuelto')
  // El más antiguo por fecha y no por orden de llegada: `leerTodas` no promete
  // ninguno, y una fila sin fecha legible no puede ser «la que más espera».
  const masAntiguo = pendientes
    .map((c) => leerFecha(c.createdAt))
    .filter((f): f is Date => f !== null)
    .reduce<Date | null>((antes, f) => (antes === null || f < antes ? f : antes), null)

  const semanas = ultimasSemanas(SEMANAS_DEL_GRAFICO, hoy)
  // Sesenta días para comparar los últimos treinta con los treinta de antes. Por
  // días y no por mes del calendario: el 3 de noviembre, «este mes» son tres
  // días contra los treinta y uno de octubre, y la flecha bajaría siempre a
  // principio de mes.
  const dias = ultimosDias(60, hoy)
  const ventana = ultimosYAnteriores(contarEn(dias, filas.map((c) => claveDeDia(c.createdAt))), 30)
  const ultimos30 = new Set(dias.slice(-30).map((d) => d.clave))
  const recientes = filas.filter((c) => ultimos30.has(claveDeDia(c.createdAt) ?? ''))

  return {
    total: filas.length,
    pendientes: pendientes.length,
    resueltos: filas.length - pendientes.length,
    diasDelMasAntiguo: masAntiguo ? diasEntre(masAntiguo, hoy) : null,
    semanas,
    porSemana: contarEn(semanas, filas.map((c) => claveDeSemana(c.createdAt))),
    recibidos30: ventana.ultimos,
    recibidosAntes30: ventana.anteriores,
    resueltosDeLos30: recientes.filter((c) => c.estado === 'resuelto').length,
    porDestino: DESTINOS.map((d) => ({
      etiqueta: d.etiqueta,
      color: d.color,
      valor: filas.filter((c) => d.incluye(String(c.coleccion ?? ''))).length,
    })),
  }
}

/**
 * Lee la tabla entera y la resume, o `null` si la consulta falló: un cero de
 * pendientes por una tabla que no contestó se lee como «todo al día», que es
 * justo lo contrario de lo que habría que mirar.
 */
export async function leerTableroDeComentarios(payload: Payload): Promise<TableroDeComentarios | null> {
  try {
    const { docs } = await leerTodas(payload, {
      coleccion: 'comentarios',
      select: { estado: true, coleccion: true, createdAt: true },
    })
    return resumirComentarios(docs)
  } catch (error) {
    console.error('[panel] no se pudieron contar los comentarios para su tablero:', error)
    return null
  }
}
