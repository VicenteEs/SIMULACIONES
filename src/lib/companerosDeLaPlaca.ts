import type { Payload } from 'payload'

/**
 * Pide al catálogo los instrumentos que la placa de la bandeja necesita y el caso no declaró (P-003 E6): tornillos,
 * brocas, medidor y destornillador. Con los permisos de quien abre el caso. Si el catálogo no responde, devuelve una
 * lista vacía y la bandeja queda como estaba: es una ayuda, no una condición para abrir el caso.
 *
 * Está aquí y no en la página porque la página del caso solo consulta el caso y las lecturas
 * (`cableadoDelProgreso.test.ts` lo vigila), y cada consulta nueva en ella es una más que nadie revisa.
 */
export async function traerCompanerosDeLaPlaca(
  payload: Payload,
  usuario: unknown,
  slugs: readonly string[],
): Promise<Record<string, unknown>[]> {
  if (slugs.length === 0) return []
  try {
    const r = await payload.find({
      collection: 'instrumental',
      where: { slug: { in: [...slugs] } },
      depth: 2,
      limit: 50,
      overrideAccess: false,
      user: usuario as never,
    })
    return r.docs as unknown as Record<string, unknown>[]
  } catch {
    return []
  }
}
