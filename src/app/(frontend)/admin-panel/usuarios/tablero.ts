import type { Payload } from 'payload'
import { leerTodas } from '@/lib/leerTodas'
import { claveDeMes, contarEn, ultimosMeses, type Casilla } from '@/lib/series'

/**
 * Las cuentas en cifras, para la columna de al lado de la tabla (P-007 E5,
 * D-238): cuántas hay activas por rol y cuántas se dieron de alta cada mes.
 *
 * Con su propia lectura y no con las filas de la tabla. La tabla lee como mucho
 * quinientas cuentas (`TOPE_DE_CUENTAS` en `page.tsx`), y una dona sacada de
 * ahí dejaría de sumar justo cuando la plataforma crece; aquí se leen todas,
 * con cuatro columnas, como hace el Resumen.
 *
 * «Activa» es lo mismo que en el Resumen (`cuentasDelResumen`): `activo` en
 * verdadero y sin `pendiente`. Con otro criterio, la dona de esta pestaña y la
 * del Resumen dirían cifras distintas sobre las mismas cuentas, y quien mira
 * las dos concluye que una de las dos está mal.
 */

export interface TableroDeCuentas {
  activas: number
  /** Cuentas ya revisadas que no pueden entrar: bajas y cuentas creadas sin acceso. */
  sinAcceso: number
  porRol: { lector: number; editor: number; admin: number }
  meses: Casilla[]
  /** Cuántas cuentas de las que siguen en la base se crearon en cada mes de `meses`. */
  altas: number[]
}

/** Los meses que dibuja «Altas por mes»: los mismos seis del diseño. */
const MESES_DE_ALTAS = 6

/**
 * El reparto, aparte de la lectura para poder probarlo sin base.
 *
 * Las altas cuentan por `createdAt` todas las cuentas revisadas, con acceso o
 * sin él: una baja de septiembre se dio de alta en julio y en julio cuenta. Las
 * solicitudes sin revisar no, porque todavía no son cuentas; las rechazadas
 * tampoco, porque rechazar las borra. Y el mes es el de la creación de la fila:
 * en una solicitud aprobada, el día que se pidió, no el que se aprobó, porque
 * la aprobación no deja fecha (`resolverSolicitud` solo apaga la marca).
 */
export function repartoDeCuentas(filas: readonly Record<string, unknown>[], meses: Casilla[]): TableroDeCuentas {
  // `pendiente` se compara con `true`, como en `page.tsx` y en la barra: la
  // columna admite nulos y una cuenta con la marca en nulo es una cuenta.
  const revisadas = filas.filter((u) => u.pendiente !== true)
  const activas = revisadas.filter((u) => u.activo === true)
  return {
    activas: activas.length,
    sinAcceso: revisadas.length - activas.length,
    porRol: {
      lector: activas.filter((u) => u.rol === 'lector').length,
      editor: activas.filter((u) => u.rol === 'editor').length,
      admin: activas.filter((u) => u.rol === 'admin').length,
    },
    meses,
    altas: contarEn(meses, revisadas.map((u) => claveDeMes(u.createdAt))),
  }
}

/** `null` si la tabla no contestó: la tarjeta lo dice en vez de enseñar ceros. */
export async function tableroDeCuentas(payload: Payload): Promise<TableroDeCuentas | null> {
  try {
    const { docs } = await leerTodas(payload, {
      coleccion: 'usuarios',
      select: { rol: true, activo: true, pendiente: true, createdAt: true },
    })
    return repartoDeCuentas(docs, ultimosMeses(MESES_DE_ALTAS))
  } catch (error) {
    console.error('[panel] no se pudieron contar las cuentas por rol:', error)
    return null
  }
}
