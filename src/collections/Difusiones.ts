import type { CollectionConfig } from 'payload'
import { administracionDeUsuarios, accesoAlPanel } from '@/access/payload'
import { olvidarAvisos } from '@/lib/avisosEnMemoria'

/** A quién puede ir una difusión. `todas` son todas las cuentas activas. */
export const AUDIENCIAS_DE_DIFUSION = [
  { label: 'Todas las cuentas activas', value: 'todas' },
  { label: 'Solo lectores', value: 'lector' },
  { label: 'Solo editores', value: 'editor' },
  { label: 'Solo administradores', value: 'admin' },
] as const

export type AudienciaDeDifusion = (typeof AUDIENCIAS_DE_DIFUSION)[number]['value']

export const ESTADOS_DE_DIFUSION = [
  { label: 'Enviando', value: 'enviando' },
  { label: 'Enviada', value: 'enviada' },
  { label: 'Enviada con fallos', value: 'con-fallos' },
  { label: 'Detenida', value: 'detenida' },
] as const

/**
 * Los correos masivos que manda un administrador desde «Difusión» (D-120).
 *
 * Cada difusión queda guardada con su cola: `pendientes` son las cuentas a las
 * que todavía no se les ha escrito. No es un registro decorativo. El envío va
 * despacio a propósito —el hosting limita los correos por hora— y tarda
 * minutos; si el servicio se reinicia a la mitad, lo que queda en `pendientes`
 * es exactamente lo que falta, y «Reanudar» sigue desde ahí sin escribirle dos
 * veces a nadie. Sin la cola guardada, la única salida a un envío cortado sería
 * repetirlo entero.
 *
 * Solo el administrador la ve y la escribe, igual que las cuentas: una
 * difusión es un correo a todas ellas.
 *
 * Desde E6 (D-375, D-406) elige también los lugares —TraumaHub, una, varias o
 * todas las instituciones— y el canal: el correo, el aviso dentro de la
 * plataforma o los dos. El aviso no tiene cola: lo ve cada cuenta que entra
 * mientras está vigente, y su lectura queda en `lecturas-de-avisos`.
 */
export const Difusiones: CollectionConfig = {
  slug: 'difusiones',
  labels: { singular: 'Difusión', plural: 'Difusiones' },
  admin: {
    useAsTitle: 'asunto',
    defaultColumns: ['asunto', 'estado', 'enviados', 'total', 'createdAt'],
    group: 'Administración',
  },
  access: {
    read: administracionDeUsuarios,
    create: administracionDeUsuarios,
    update: administracionDeUsuarios,
    delete: administracionDeUsuarios,
    admin: accesoAlPanel,
  },
  // Los avisos vigentes viven medio minuto en la memoria del proceso
  // (`avisosServidor.ts`). Al escribir una difusión se olvidan, y el aviso
  // nuevo, o el retirado, se ve aquí enseguida; en los otros procesos, al
  // vencer ese medio minuto.
  hooks: { afterChange: [() => olvidarAvisos()] },
  fields: [
    { name: 'asunto', type: 'text', required: true, maxLength: 150, label: 'Asunto' },
    { name: 'mensaje', type: 'textarea', required: true, label: 'Mensaje' },
    { name: 'botonTexto', type: 'text', maxLength: 60, label: 'Texto del botón' },
    { name: 'botonEnlace', type: 'text', maxLength: 500, label: 'Enlace del botón' },
    {
      name: 'audiencia',
      type: 'select',
      required: true,
      defaultValue: 'todas',
      label: 'Destinatarios',
      options: AUDIENCIAS_DE_DIFUSION.map((a) => ({ ...a })),
    },
    {
      // `traumahub` y los identificadores de las instituciones; vacío, todos
      // los lugares, también los que se creen después (`destinoDeDifusion.ts`).
      // En texto y no como relación: `traumahub` no es una institución, y una
      // lista así se compara entera con la cuenta sin ir a la base.
      name: 'lugares',
      type: 'json',
      label: 'Lugares',
    },
    // Los valores por omisión son los de una difusión de antes de E6, que era
    // solo un correo: así la migración deja las que ya había tal como salieron,
    // sin un aviso que nadie pidió apareciendo de pronto en la barra.
    { name: 'porCorreo', type: 'checkbox', defaultValue: true, label: 'Por correo' },
    { name: 'comoAviso', type: 'checkbox', defaultValue: false, label: 'Como aviso en la plataforma' },
    {
      // Hasta cuándo se ve el aviso. Lo fija quien la manda, y «Retirar el
      // aviso» lo deja en ese momento: el aviso deja de verse sin que se
      // pierda que lo hubo.
      name: 'avisoHasta',
      type: 'date',
      index: true,
      label: 'Aviso a la vista hasta',
    },
    {
      // Quién la mandó. Al borrar esa cuenta queda a nulo y la difusión se
      // conserva: lo que se envió, se envió.
      name: 'autor',
      type: 'relationship',
      relationTo: 'usuarios',
      label: 'Enviada por',
    },
    {
      name: 'estado',
      type: 'select',
      required: true,
      defaultValue: 'enviando',
      label: 'Estado',
      index: true,
      options: ESTADOS_DE_DIFUSION.map((e) => ({ ...e })),
    },
    { name: 'total', type: 'number', required: true, defaultValue: 0, label: 'Destinatarios' },
    { name: 'enviados', type: 'number', required: true, defaultValue: 0, label: 'Enviados' },
    { name: 'fallidos', type: 'number', required: true, defaultValue: 0, label: 'Fallidos' },
    {
      // Identificadores de las cuentas que faltan, en orden. Ver arriba.
      name: 'pendientes',
      type: 'json',
      label: 'Cuentas pendientes',
    },
    {
      // `[{ correo, motivo }]` de cada envío que el servidor rechazó, para
      // poder decir a quién no le llegó y por qué.
      name: 'fallos',
      type: 'json',
      label: 'Envíos fallidos',
    },
    { name: 'terminadaEn', type: 'date', label: 'Terminada el' },
    {
      // Quién la está mandando y cuándo dio señales por última vez (D-393).
      // Con varios procesos, «¿se está enviando?» no se puede contestar con la
      // memoria del que pregunta: el trabajador puede ser de otro. Así que el
      // trabajador escribe aquí con cada correo, y una difusión «enviando» cuyo
      // latido ya es viejo está interrumpida (`seEstaEnviando`). `trabajador`
      // es una marca al azar de cada envío: si alguien reanuda mientras uno que
      // parecía muerto sigue vivo, el viejo ve que la marca ya no es la suya y
      // para en la vuelta siguiente.
      name: 'trabajador',
      type: 'text',
      label: 'Marca del trabajador',
    },
    { name: 'latidoDelTrabajador', type: 'date', label: 'Último latido del trabajador' },
  ],
}
