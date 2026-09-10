/**
 * Registro de publicaciones en memoria.
 *
 * Cuando se publica contenido se incrementa una versión, y los navegadores
 * conectados la reciben por un flujo de eventos. Vive en memoria a propósito:
 * es un dato efímero que no necesita sobrevivir a un reinicio, y guardarlo en
 * la base añadiría escrituras constantes sin ganar nada.
 *
 * Se guarda **por módulo** y no en un solo contador, y el motivo es de acceso,
 * no de comodidad. Una cuenta puede tener `modulosVisibles` restringido; si el
 * aviso dijera «hay contenido nuevo» ante cualquier publicación, un lector que
 * solo ve la biblioteca de patologías se enteraría de que se publicó algo en
 * cirugías, y al recargar no encontraría nada. Y si además el aviso nombra el
 * módulo, la fuga deja de ser sutil. Con el estado por módulo, cada quien
 * recibe la versión de lo suyo (decisión D-020).
 *
 * Con varias instancias del servidor haría falta un canal compartido —el
 * LISTEN/NOTIFY de PostgreSQL sirve— pero con una sola instancia esto basta.
 * Conviene decirlo claro porque la bitácora llegó a prometer ese NOTIFY: no
 * está implementado, y esto es lo que hay.
 */

interface Publicacion {
  /** Número de orden global, para saber cuál fue la última. */
  version: number
  modulo: string
  titulo: string
}

interface Estado {
  version: number
  porModulo: Map<string, Publicacion>
}

export interface EstadoPublicaciones {
  /** Versión de lo que esta cuenta puede ver. Cero si no ha visto nada. */
  version: number
  /** Módulo de la última publicación visible, o null. */
  modulo: string | null
  /** Título de esa publicación, o null. */
  titulo: string | null
}

const global_ = globalThis as unknown as { __publicaciones?: Estado }

// Se guarda en globalThis para sobrevivir a las recargas del modo desarrollo,
// que reevalúan los módulos y perderían el contador en cada cambio de archivo.
const estado: Estado = (global_.__publicaciones ??= { version: 0, porModulo: new Map() })

export function registrarPublicacion(modulo: string, titulo: string): number {
  estado.version += 1
  estado.porModulo.set(modulo, { version: estado.version, modulo, titulo })
  return estado.version
}

/**
 * Lo último publicado que esta cuenta puede ver.
 *
 * `puedeVer` decide módulo a módulo. Sin él se devuelve todo, que es lo que
 * corresponde a un administrador.
 *
 * La versión es el **máximo** de las visibles y no su suma: crece si y solo si
 * se publica en un módulo que esta cuenta ve, que es justo la condición para
 * que le merezca la pena recargar.
 */
export function versionActual(puedeVer?: (modulo: string) => boolean): EstadoPublicaciones {
  let ultima: Publicacion | null = null
  for (const publicacion of estado.porModulo.values()) {
    if (puedeVer && !puedeVer(publicacion.modulo)) continue
    if (!ultima || publicacion.version > ultima.version) ultima = publicacion
  }
  return {
    version: ultima?.version ?? 0,
    modulo: ultima?.modulo ?? null,
    titulo: ultima?.titulo ?? null,
  }
}

/** Solo para las pruebas: deja el registro como recién arrancado. */
export function olvidarPublicaciones(): void {
  estado.version = 0
  estado.porModulo.clear()
}
