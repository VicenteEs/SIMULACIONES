import * as THREE from 'three'
import { HOLGURA_MINIMA_DEL_PIVOTE } from './pivote'

/**
 * Si el objetivo de una vista guardada ha quedado fuera de lo que se ve.
 *
 * Es la segunda mitad de la regla con la que el visor decide, al abrir una
 * preparación, si respeta su objetivo o lo lleva al centro de lo visible (ver
 * `recolocarVistaGuardada` en `VisorAtlas.tsx`). La primera, `esElObjetivoPorOmision`
 * en `pivote.ts`, reconoce las preparaciones guardadas con el objetivo de
 * `VISTA_INICIAL`. No bastaba: antes de que el pivote siguiera a lo visible, el
 * objetivo también lo movían «Encuadrar» y el botón derecho, y una preparación
 * de pierna hecha pulsando «Encuadrar» con el cuerpo entero y apagando después
 * el resto guarda el centro del cuerpo —a 3,5 cm del de omisión, fuera de sus
 * dos milímetros—. En la ficha, esa pierna seguía girando alrededor de la
 * pelvis, que es exactamente la queja del traumatólogo.
 *
 * Lo que distingue ese objetivo del que alguien llevó a mano sobre el foco de
 * fractura es que el foco está sobre la anatomía encendida y la pelvis de un
 * cuerpo apagado no. Por eso se mira si el objetivo cae dentro de la caja de lo
 * visible, y no a qué distancia está de su centro: un foco en la tibia distal
 * está a unos 35 cm del centro de la pierna, casi tan lejos como la pelvis
 * (39 cm), y medirlo así desharía el trabajo de quien lo puso ahí.
 *
 * ## Por qué sin la holgura relativa del pivote
 *
 * La holgura es la mínima, un milímetro, que es lo que redondea
 * `vistaActual()`. La del pivote —el 5 % del lado de lo visible— parece la
 * natural y deja pasar justo el caso que esto existe para atrapar: con los
 * cuatro huesos de la pierna derecha del atlas real, la caja acaba en
 * x = −3,2 cm, porque la cabeza del fémur llega casi a la línea media, y el 5 %
 * de 86 cm son 4,3 cm. Ampliada así, la caja se traga la pelvis entera y la
 * pierna volvería a girar alrededor de ella. Lo fija
 * `tests/unit/vistaGuardadaDelAtlas.test.ts` con el catálogo de verdad.
 *
 * El precio es aceptable: un objetivo que quedó a más de un milímetro por fuera
 * de la caja de todo lo encendido está flotando en el aire, y llevarlo al
 * centro de lo que se ve es lo que el pivote habría hecho de todos modos.
 *
 * Sin caja —nada encendido— no hay dentro ni fuera, y se da por bueno: no hay a
 * dónde llevarlo.
 */
export function objetivoFueraDeLoVisible(
  objetivo: THREE.Vector3,
  caja: THREE.Box3 | null,
): boolean {
  if (!caja) return false
  return !caja.clone().expandByScalar(HOLGURA_MINIMA_DEL_PIVOTE).containsPoint(objetivo)
}
