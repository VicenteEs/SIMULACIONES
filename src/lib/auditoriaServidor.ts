/**
 * La lectura de la auditoría: revisiones, sesiones y cuentas, de una vez
 * (D-142).
 *
 * La comparten la pantalla «Auditoría» y la planilla que se descarga desde
 * ella, para que las dos digan lo mismo (`armarAuditoria`). Sin la versión
 * original de cada ficha, que es lo que más pesa y lo único que aquí no hace
 * falta. Con techo: diez mil revisiones y cincuenta mil sesiones son años de
 * trabajo de un equipo de revisores; si algún día se llega, la pantalla lo
 * dice en vez de colgarse.
 */
import type { Payload } from 'payload'
import { armarAuditoria, type Auditoria, type Cuenta } from './auditoria'

export const TECHO_DE_REVISIONES = 10_000
export const TECHO_DE_SESIONES = 50_000

export interface EntradaDeAuditoria {
  revisiones: Record<string, unknown>[]
  sesiones: Record<string, unknown>[]
  cuentas: Cuenta[]
  /** Se llegó a algún techo: lo que se ve es una parte. */
  recortada: boolean
}

export interface AuditoriaLeida extends Auditoria {
  recortada: boolean
}

/** Las filas crudas, para filtrarlas antes de armar (`filtrarEntrada`) o armarlas tal cual. */
export async function leerEntradaDeAuditoria(payload: Payload): Promise<EntradaDeAuditoria> {
  const [revisiones, sesiones, cuentas] = await Promise.all([
    payload.find({
      collection: 'revisiones',
      limit: TECHO_DE_REVISIONES,
      depth: 0,
      sort: '-updatedAt',
      overrideAccess: true,
      pagination: false,
      select: { original: false },
    }),
    payload.find({
      collection: 'sesiones-de-revision',
      limit: TECHO_DE_SESIONES,
      depth: 0,
      sort: '-ultimoLatido',
      overrideAccess: true,
      pagination: false,
    }),
    payload.find({
      collection: 'usuarios',
      limit: 5_000,
      depth: 0,
      overrideAccess: true,
      pagination: false,
      select: { nombre: true, email: true, rol: true, activo: true },
    }),
  ])
  return {
    revisiones: revisiones.docs as unknown as Record<string, unknown>[],
    sesiones: sesiones.docs as unknown as Record<string, unknown>[],
    cuentas: (cuentas.docs as unknown as Record<string, unknown>[]).map(
      (c): Cuenta => ({
        id: String(c.id),
        nombre: String(c.nombre || c.email || `#${String(c.id)}`),
        correo: String(c.email ?? ''),
        rol: String(c.rol ?? ''),
        activo: c.activo === true,
      }),
    ),
    recortada:
      revisiones.docs.length >= TECHO_DE_REVISIONES || sesiones.docs.length >= TECHO_DE_SESIONES,
  }
}

/** La auditoría entera, sin filtrar: la de la planilla. */
export async function leerAuditoria(payload: Payload): Promise<AuditoriaLeida> {
  const entrada = await leerEntradaDeAuditoria(payload)
  return { ...armarAuditoria(entrada), recortada: entrada.recortada }
}
