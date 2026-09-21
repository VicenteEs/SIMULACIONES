import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Qué construcción está sirviendo este proceso, y desde cuándo.
 *
 * Existe para que una página abierta se entere de que el servidor ya no es el
 * que le dio su JavaScript (D-127). `main` se despliega solo: quien tenía la
 * plataforma abierta seguía con el código viejo hasta que recargaba por su
 * cuenta, y un código viejo contra un servidor nuevo falla de la peor manera
 * —una acción de servidor que ya no existe contesta con un error que no dice
 * nada de versiones—.
 *
 * Son dos datos y no uno porque contestan preguntas distintas:
 *
 *  - `despliegue` es el identificador de la **construcción** (`.next/BUILD_ID`).
 *    Cambia solo cuando hay código nuevo, y es lo que justifica recargar.
 *  - `arranque` es el instante en que nació **este proceso**. Cambia también
 *    con un reinicio a secas, y sirve para otra cosa: el contador de
 *    publicaciones vive en memoria y vuelve a empezar con cada proceso, así que
 *    el cliente necesita saber que cambió de proceso para no comparar la cuenta
 *    de uno con la de otro.
 *
 * Los dos van en `globalThis` por lo mismo que `publicaciones.ts`: el modo
 * desarrollo reevalúa los módulos, y un `arranque` nuevo en cada cambio de
 * archivo recargaría la página de quien está programando.
 */
interface Despliegue {
  despliegue: string
  arranque: number
}

const global_ = globalThis as unknown as { __despliegue?: Despliegue }

function leer(): Despliegue {
  const arranque = Date.now()
  try {
    // En la salida autocontenida `server.js` hace `chdir` a su carpeta, que es
    // donde Next deja `.next/BUILD_ID`; con `next start` es la raíz del
    // proyecto. En los dos casos es relativo al directorio de trabajo.
    const id = readFileSync(resolve(process.cwd(), '.next', 'BUILD_ID'), 'utf8').trim()
    if (id) return { despliegue: id, arranque }
  } catch {
    // En desarrollo no hay BUILD_ID. Cae al arranque.
  }
  // Sin archivo, cada proceso cuenta como una construcción distinta. Es pecar
  // por exceso —un reinicio a secas también recarga a quien no tenga nada a
  // medias—, y es preferible a lo contrario: una versión nueva de la que nadie
  // se entera.
  return { despliegue: `arranque-${arranque}`, arranque }
}

export function despliegueActual(): Despliegue {
  return (global_.__despliegue ??= leer())
}
