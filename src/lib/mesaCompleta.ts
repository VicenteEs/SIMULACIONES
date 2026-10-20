import type { Payload } from 'payload'

/**
 * Pide al catálogo todo el instrumental, para la bandeja de un caso con la mesa completa (P-004 E3). Con los permisos de
 * quien abre el caso. Si el catálogo no responde, devuelve una lista vacía y la bandeja queda como estaba: es una
 * comodidad, no una condición para abrir el caso.
 *
 * Está aquí y no en la página, igual que `traerCompanerosDeLaPlaca`, porque la página del caso solo consulta el caso y las
 * lecturas (`cableadoDelProgreso.test.ts` lo vigila).
 *
 * El tope son 200: el catálogo real tiene unas decenas, y un catálogo que llegara a más no cabría en una bandeja que se
 * recorre por categorías sin buscador.
 */
export async function traerTodaLaMesa(payload: Payload, usuario: unknown): Promise<Record<string, unknown>[]> {
  try {
    const r = await payload.find({
      collection: 'instrumental',
      depth: 2,
      limit: 200,
      sort: 'orden',
      overrideAccess: false,
      user: usuario as never,
    })
    return r.docs as unknown as Record<string, unknown>[]
  } catch {
    return []
  }
}
