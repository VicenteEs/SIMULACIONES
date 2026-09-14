import correcciones from '@/atlas/correcciones-de-sistema.json'
import type { CatalogoDelAtlas } from '@/atlas/formato'
import type { RolDePieza } from '@/lib/piezasDelCaso'

/**
 * El puente entre los sistemas del atlas y las capas de la simulación.
 *
 * Son dos vocabularios que nacieron por separado y no se hablaban. El atlas
 * clasifica cada estructura por **sistema anatómico** —con los identificadores
 * en inglés de su origen: `skeletal`, `muscular`, `integumentary`— y la consola
 * quirúrgica apaga y enciende por **capa**: piel, músculo, hueso. Un modelo
 * exportado del atlas llegaba al simulador con objetos llamados «skeletal» o
 * «arterial» que ningún filtro reconocía, y el traumatólogo tenía que adivinar
 * qué rol ponerle a cada uno.
 *
 * Esta tabla es el único sitio donde se decide esa correspondencia. La leen el
 * exportador —que la escribe dentro del archivo— y el taller de piezas —que la
 * usa para proponer el rol de cada objeto—. Si hubiera dos copias, un sistema
 * nuevo acabaría en una capa en un sitio y en otra en el otro.
 *
 * ## Por qué casi todo va a «músculo»
 *
 * La consola tiene tres capas de tejido y las ordena por **profundidad**, que es
 * como se opera: se incide la piel, se separan las partes blandas y se llega al
 * hueso. «Músculo» es, en la práctica, la capa de partes blandas: lo que hay
 * entre la piel y el hueso. Por eso van ahí también los vasos, los nervios, los
 * tendones y los ligamentos: en un abordaje de pierna aparecen entre la piel y
 * la tibia, y apagarlos por separado exigiría capas que la consola no tiene.
 *
 * Si algún día hacen falta capas propias para vasos o nervios, el cambio empieza
 * por añadir el rol en `src/collections/Cirugias.ts` —con su migración, porque
 * es un `select`— y termina aquí.
 */
export const ROL_DE_SISTEMA: Readonly<Record<string, RolDePieza>> = {
  integumentary: 'piel',
  skeletal: 'hueso',
  muscular: 'musculo',
  connective: 'musculo',
  arterial: 'musculo',
  venous: 'musculo',
  nervous: 'musculo',
  lymphatic: 'musculo',
  cardiac: 'musculo',
  respiratory: 'musculo',
  digestive: 'musculo',
  urinary: 'musculo',
  reproductive: 'musculo',
  endocrine: 'musculo',
  sensory: 'musculo',
}

/**
 * El rol que le toca a un sistema del atlas.
 *
 * Un sistema que no esté en la tabla —porque el atlas se regeneró con uno
 * nuevo— cae en «músculo» y no en «hueso»: una estructura desconocida tratada
 * como hueso fijo quedaría encendida debajo de todo y el residente la
 * atravesaría sin poder apagarla.
 */
export function rolDeSistema(sistema: string): RolDePieza {
  return ROL_DE_SISTEMA[sistema] ?? 'musculo'
}

/**
 * Estructuras que el atlas de origen clasifica en el sistema equivocado.
 *
 * BodyParts3D mete en el esqueleto los tres peroneos y los tibiales anterior y
 * posterior —que son músculos— y la cintilla iliotibial —que es fascia—. Para
 * el atlas era un color raro; para la simulación es un error clínico: con la
 * capa de músculo apagada, el peroneo corto seguiría encendido pegado al peroné,
 * como si fuera hueso. Los dos tibiales se corrigieron después que el resto,
 * cuando la pierna derecha partida del caso de prueba los enseñaba fundidos con
 * el esqueleto durante la reducción.
 *
 * Se corrige aquí, al leer el catálogo, y no en `public/atlas/catalogo.json`:
 * ese archivo lo reescribe `scripts/atlas/preparar.mjs` cada vez que se
 * regenera el atlas, y una corrección hecha a mano allí desaparecería sin aviso.
 * Van por nombre original y no por identificador porque es lo que se puede
 * comprobar a ojo contra la anatomía.
 *
 * La lista vive en `correcciones-de-sistema.json` y no escrita aquí porque la
 * lee también `scripts/atlas/atribucion.mjs`, que redacta la declaración de
 * cambios del ATRIBUCION.md: CC BY 4.0 obliga a decir qué se modificó, y ese
 * guion es node a secas, sin TypeScript, así que no puede importar este
 * archivo. Con la lista copiada en los dos sitios, una corrección nueva se
 * aplicaría en la plataforma y no se declararía, o al revés, y la licencia se
 * incumpliría sin que nada fallase. Quien añada una corrección añade también su
 * porqué al párrafo de la plantilla, que eso no se puede deducir de la lista.
 */
export const CORRECCIONES_DE_SISTEMA: Readonly<Record<string, string>> = correcciones

/**
 * Devuelve el catálogo con los sistemas corregidos. No toca el que recibe.
 *
 * Tienen que pasar por aquí **todos** los que leen el catálogo: el cargador del
 * navegador, que agrupa por sistema al montar la escena, y la lectura del
 * servidor, que exporta. Si solo lo hiciera uno, el taller pintaría el peroneo
 * como músculo y el archivo exportado lo seguiría metiendo en el esqueleto.
 */
export function corregirCatalogo(catalogo: CatalogoDelAtlas): CatalogoDelAtlas {
  let cambia = false
  const piezas = catalogo.piezas.map((pieza) => {
    const corregido = CORRECCIONES_DE_SISTEMA[pieza.nombre]
    if (!corregido || corregido === pieza.sistema) return pieza
    cambia = true
    return { ...pieza, sistema: corregido }
  })
  return cambia ? { ...catalogo, piezas } : catalogo
}
