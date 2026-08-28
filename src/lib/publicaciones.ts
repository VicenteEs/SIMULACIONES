/**
 * Registro de publicaciones en memoria.
 *
 * Cuando se publica contenido se incrementa una versión, y los navegadores
 * conectados la reciben por un flujo de eventos. Vive en memoria a propósito:
 * es un dato efímero que no necesita sobrevivir a un reinicio, y guardarlo en
 * la base añadiría escrituras constantes sin ganar nada.
 *
 * Con varias instancias del servidor haría falta un canal compartido —el
 * LISTEN/NOTIFY de PostgreSQL sirve— pero con una sola instancia esto basta.
 */

interface EstadoPublicaciones {
  version: number
  ultimoCambio: string | null
}

const global_ = globalThis as unknown as { __publicaciones?: EstadoPublicaciones }

// Se guarda en globalThis para sobrevivir a las recargas del modo desarrollo,
// que reevalúan los módulos y perderían el contador en cada cambio de archivo.
const estado: EstadoPublicaciones = (global_.__publicaciones ??= {
  version: 0,
  ultimoCambio: null,
})

export function registrarPublicacion(descripcion: string): number {
  estado.version += 1
  estado.ultimoCambio = descripcion
  return estado.version
}

export function versionActual(): EstadoPublicaciones {
  return { version: estado.version, ultimoCambio: estado.ultimoCambio }
}
