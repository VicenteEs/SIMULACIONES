import type { Cotizacione } from '@/payload-types'
import { esEstadoDeCotizacion, type EstadoDeCotizacion } from '@/lib/cotizaciones'

/**
 * Una cotización como la pintan la lista y el detalle: solo texto y números,
 * porque cruza a componentes de cliente y una fila de Payload trae más de lo
 * que hace falta enseñar.
 */
export interface CotizacionDelPanel {
  id: string
  nombre: string
  correo: string
  institucion: string
  cargo: string
  residentes: string
  modulos: string[]
  mensaje: string
  estado: EstadoDeCotizacion
  notas: string
  recibida: string
}

export function cotizacionDelPanel(fila: Cotizacione): CotizacionDelPanel {
  return {
    id: String(fila.id),
    nombre: fila.nombre,
    correo: fila.correo,
    institucion: fila.institucion,
    cargo: fila.cargo ?? '',
    residentes: fila.residentes,
    modulos: fila.modulos ?? [],
    mensaje: fila.mensaje ?? '',
    // Un estado que ya no existe —una opción retirada— se lee como nuevo: es
    // la forma de que alguien vuelva a mirarla, en vez de quedar sin insignia.
    estado: esEstadoDeCotizacion(fila.estado) ? fila.estado : 'nueva',
    notas: fila.notas ?? '',
    recibida: fila.createdAt,
  }
}

/**
 * El día en que llegó, con la zona fijada como en `impresion.ts`: la lista es
 * de cliente, el servidor la pinta primero y el navegador la hidrata, y si
 * cada uno usara su zona una solicitud de pasada la medianoche saldría con dos
 * fechas —y React tiraría el árbol entero por no coincidir—.
 */
export const fechaDeCotizacion = (iso: string, larga = false) =>
  new Date(iso).toLocaleDateString('es-CL', {
    ...(larga ? { day: 'numeric', month: 'long' } : { day: '2-digit', month: 'short' }),
    year: 'numeric',
    timeZone: 'America/Santiago',
  })
