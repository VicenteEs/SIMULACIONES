import * as THREE from 'three'
import {
  LADO_DEL_CAMPO_DE_LA_TAPA,
  ejePrincipal,
  sitiosDelVello,
  tapasDeCorte,
  triangulosHaciaDentro,
  triangulosSinVello,
  velloLejosDeLasHeridas,
  type Vec3,
} from '@/lib/aspectoAnatomico'
import type { RolDePieza } from '@/lib/piezasDelCaso'
import { ATRIBUTO_DEL_CANAL, SIN_CANAL_POR_OMISION, flotantesDe, marcarElCanal } from '@/atlas/canalDeLaGeometria'
import { ATRIBUTO_DE_LA_PARED, type HeridaEnCapa } from './heridas'

/**
 * Cómo se ve el paciente en el simulador (D-225): la piel, el hueso, el músculo y lo demás, cada uno con su
 * material, y el vello sobre la piel.
 *
 * El GLB de un caso trae un color liso por pieza y nada más: los modelos exportados del atlas no llevan coordenadas
 * de textura (F-12), así que no hay donde pegar una imagen de poros. Todo el detalle sale del sombreador, con ruido
 * calculado en el espacio del objeto y en milímetros: la textura «sólida» no necesita coordenadas, no tiene costuras,
 * no ocupa memoria en la tarjeta y sigue a la malla cuando una herida la abre o un fragmento se mueve. Las imágenes
 * con proyección triplanar, que era la otra vía, costaban tres lecturas por mapa y por píxel y varios megabytes por
 * mapa, para dar lo mismo.
 *
 * El detalle fino se apaga cuando un píxel cubre más de lo que mide (`desvanecer`): un poro de medio milímetro visto
 * con la pierna entera en pantalla no se puede dibujar, y sin apagarlo salía un hormigueo que se movía con la cámara.
 *
 * El aspecto se decide por el papel de cada pieza en el caso (`aspectoDe`), como todo lo demás en el simulador, y se
 * aplica sobre el material del archivo sin perder su color: el pliegue de la piel pellizcada y la radiografía siguen
 * leyendo lo mismo.
 */

export type Aspecto = 'piel' | 'fascia' | 'musculo' | 'humedo' | 'hueso' | 'ojo'

/** Lo que el cuerpo pone en su sitio: un `Object3D` de three cumple con esto. */
interface Nombrada {
  name: string
  userData: Record<string, unknown>
}

const sinTildes = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Qué aspecto lleva una pieza. El papel del caso manda, con dos matices que el papel no distingue: la fascia
 * superficial va con la piel (se corta con ella) pero no es piel ni lleva vello, y bajo «músculo» entran también
 * tendones y ligamentos, que no tienen fibras de músculo. Los vasos y los nervios llevan su papel desde P-012 (E6) y
 * el aspecto de lo húmedo con él; los casos guardados antes los siguen trayendo como «músculo», y para ellos queda
 * el nombre.
 *
 * El sistema llega en los `extras` que escribe el exportador del atlas (`exportarAtlas.ts`). Los nombres de
 * BodyParts3D no dicen «muscle» («Right soleus»), así que un modelo sin sistema —uno viejo, uno de otra fuente— se
 * toma por músculo salvo que el nombre diga lo contrario: es lo que casi siempre es lo que un caso llama músculo.
 */
export function aspectoDe(pieza: Nombrada, rol: RolDePieza | undefined): Aspecto | null {
  if (!rol || rol === 'implante') return null
  // El ojo y su córnea llevan el color en los vértices (D-227): sin el estriado de las fibras que les daría el de
  // «húmedo», que en una esclera se leería como un músculo.
  if (pieza.userData.aspecto === 'ojos' || pieza.userData.aspecto === 'cornea') return 'ojo'
  const nombre = sinTildes(pieza.name)
  const sistema = typeof pieza.userData.sistema === 'string' ? sinTildes(pieza.userData.sistema) : ''
  const esFascia = /fascia|aponeuros/.test(nombre) || /fascia/.test(sistema)
  if (rol === 'piel') return esFascia ? 'fascia' : 'piel'
  if (rol === 'fascia') return 'fascia'
  if (rol === 'hueso' || rol === 'fragmento') return 'hueso'
  if (rol === 'vaso' || rol === 'nervio') return 'humedo'
  // «arter» y no «arteri»: en inglés es «artery», y la femoral salía con fibras de músculo.
  if (/tendon|ligament|vena|vein|arter|nervi|nerve/.test(nombre)) return 'humedo'
  if (!sistema || sistema === 'muscular') return 'musculo'
  return 'humedo'
}

// ----------------------------------------------------------------------------------------------- sombreadores

/** El ruido de todos: valor en una rejilla de un milímetro, suavizado, y su suma en cuatro octavas. */
const RUIDO = /* glsl */ `
varying vec3 vPosObjeto;
uniform float uMmPorUnidad;
uniform float uUnidadesPorMm;
float azar3( vec3 p ) {
  vec3 q = fract( p * vec3( 0.1373, 0.1291, 0.1187 ) + vec3( 0.21, 0.67, 0.43 ) );
  q += dot( q, q.zxy + 23.17 );
  return fract( q.x * q.y + q.z * ( q.x + 0.5 ) );
}
float ruido3( vec3 p ) {
  vec3 i = floor( p );
  vec3 f = fract( p );
  vec3 s = f * f * ( 3.0 - 2.0 * f );
  float x00 = mix( azar3( i ), azar3( i + vec3( 1.0, 0.0, 0.0 ) ), s.x );
  float x10 = mix( azar3( i + vec3( 0.0, 1.0, 0.0 ) ), azar3( i + vec3( 1.0, 1.0, 0.0 ) ), s.x );
  float x01 = mix( azar3( i + vec3( 0.0, 0.0, 1.0 ) ), azar3( i + vec3( 1.0, 0.0, 1.0 ) ), s.x );
  float x11 = mix( azar3( i + vec3( 0.0, 1.0, 1.0 ) ), azar3( i + vec3( 1.0, 1.0, 1.0 ) ), s.x );
  return mix( mix( x00, x10, s.y ), mix( x01, x11, s.y ), s.z );
}
float capas3( vec3 p ) {
  float suma = 0.0;
  float peso = 0.5;
  for ( int k = 0; k < 4; k ++ ) {
    suma += peso * ruido3( p );
    p = p * 2.03 + vec3( 17.1, 3.7, 9.4 );
    peso *= 0.5;
  }
  return suma / 0.9375;
}
// 1 mientras el detalle de este periodo (en mm) mide varios píxeles; 0 cuando un píxel ya lo cubre entero.
float desvanecer( float periodoMm, float huellaMm ) {
  return 1.0 - smoothstep( 0.3, 0.9, huellaMm / periodoMm );
}
// La normal con relieve, a partir de la altura de cada píxel en unidades de la vista: el método de las derivadas
// de pantalla (Mikkelsen), que no necesita tangentes ni coordenadas de textura.
vec3 conRelieve( vec3 n, float altura ) {
  vec3 dx = dFdx( - vViewPosition );
  vec3 dy = dFdy( - vViewPosition );
  vec3 r1 = cross( dy, n );
  vec3 r2 = cross( n, dx );
  float det = dot( dx, r1 );
  vec3 gradiente = sign( det ) * ( dFdx( altura ) * r1 + dFdy( altura ) * r2 );
  return normalize( abs( det ) * n - gradiente );
}
`

const VERTICE = /* glsl */ `
#include <common>
varying vec3 vPosObjeto;
`

/**
 * Lo que mide la dermis con la epidermis, en milímetros: debajo empieza la grasa. Es el `ESPESOR_DE_LA_DERMIS` de
 * `scripts/atlas/recalcular-piel.mjs` (D-331), y la piel de la cabeza, que no lleva grasa, mide eso entera.
 */
export const DERMIS_MM = 2

/**
 * La piel: poros, surcos finos, manchas de color, y la luz que entra y sale roja por el borde de la sombra.
 *
 * Y la pared de una herida (D-333), que es la piel por dentro: el borde de la epidermis, la dermis blanca rosada con el
 * punteado de los capilares que sangran, y desde `DERMIS_MM` la grasa, amarilla, en lóbulos de un par de milímetros
 * separados por tabiques blanquecinos, y brillante, porque está mojada y es aceitosa. `vPared` es 1 más los milímetros
 * bajo la superficie (ver `ATRIBUTO_DE_LA_PARED`), así que la frontera entre las dos cae donde cae en cada sitio: donde
 * la piel se adelgazó porque la grasa no cabía, la pared es casi toda dermis, como en la cabeza.
 */
const PIEL = /* glsl */ `
vec3 pMm = vPosObjeto * uMmPorUnidad;
float huella = max( length( fwidth( pMm ) ), 1e-4 );
float poro = smoothstep( 0.62, 0.86, ruido3( pMm * 1.7 ) ) * desvanecer( 0.6, huella );
float surco = ( capas3( pMm * vec3( 0.55, 0.9, 0.55 ) ) - 0.5 ) * desvanecer( 2.0, huella );
float mancha = capas3( pMm * 0.022 + 7.3 );
float peca = smoothstep( 0.86, 0.94, ruido3( pMm * 0.38 + 3.1 ) ) * desvanecer( 2.6, huella );
diffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 1.07, 0.9, 0.86 ), smoothstep( 0.42, 0.72, mancha ) * 0.55 );
diffuseColor.rgb *= ( 1.0 - 0.16 * peca ) * ( 1.0 - 0.07 * poro );
float alturaDelAspecto = ( 0.035 * surco - 0.03 * poro ) * uUnidadesPorMm;
// Lo rojo y húmedo —los labios— lleva el verde del color por vértice muy apagado (D-227): brilla más que la piel seca.
float humedad = 0.0;
#ifdef USE_COLOR
humedad = smoothstep( 0.62, 0.34, vColor.g );
#endif
float rugosidadDelAspecto = 0.1 * poro + 0.06 * ( mancha - 0.5 ) - 0.22 * humedad;
if ( vPared > 0.5 ) {
  float hondo = vPared - 1.0;
  float lobulo = ruido3( pMm * 0.8 + 2.3 );
  float tabique = 1.0 - smoothstep( 0.03, 0.1, abs( lobulo - 0.5 ) );
  vec3 grasa = mix( vec3( 0.84, 0.62, 0.2 ), vec3( 0.98, 0.85, 0.45 ), smoothstep( 0.25, 0.75, capas3( pMm * 0.9 + 6.1 ) ) );
  grasa = mix( grasa, vec3( 0.95, 0.88, 0.76 ), 0.6 * tabique );
  float capilar = smoothstep( 0.9, 0.97, ruido3( pMm * 2.4 + 1.9 ) ) * desvanecer( 0.5, huella );
  vec3 dermis = mix( vec3( 0.9, 0.72, 0.68 ), vec3( 0.62, 0.1, 0.09 ), 0.7 * capilar );
  float enLaGrasa = smoothstep( ${DERMIS_MM.toFixed(1)} - 0.25, ${DERMIS_MM.toFixed(1)} + 0.25, hondo );
  diffuseColor.rgb = mix( diffuseColor.rgb, mix( dermis, grasa, enLaGrasa ), smoothstep( 0.04, 0.2, hondo ) );
  alturaDelAspecto = mix( 0.01 * capilar, 0.05 * ( lobulo - 0.5 ) - 0.03 * tabique, enLaGrasa ) * uUnidadesPorMm;
  rugosidadDelAspecto = mix( - 0.12, - 0.3, enLaGrasa );
}
`

/**
 * El hueso: la cortical con sus poros, el grano y los agujeros nutricios; y el esponjoso donde se ve el interior,
 * que es en las tapas de un corte (con el anillo de cortical alrededor), en las caras de detrás de la cáscara y en la
 * pared del canal medular (D-336), que se ve por el agujero del anillo de una diáfisis cortada.
 *
 * Cuánta cortical lleva la tapa (D-337) lo dice `uTapaGrosor`, en mm, que se calcula al marcar las tapas
 * (`grosorDeLaTapa`); con 0, la regla de antes, de un hueso sin canal: un 30 % de lo que la tapa se aleja de su borde.
 */
const HUESO = /* glsl */ `
vec3 pMm = vPosObjeto * uMmPorUnidad;
float huella = max( length( fwidth( pMm ) ), 1e-4 );
float poro = smoothstep( 0.66, 0.9, ruido3( pMm * 1.25 ) ) * desvanecer( 0.8, huella );
float grano = ( capas3( pMm * 0.6 ) - 0.5 ) * desvanecer( 2.5, huella );
float veta = capas3( pMm * vec3( 0.05, 0.012, 0.05 ) + 2.0 );
float foramen = smoothstep( 0.93, 0.97, ruido3( pMm * 0.22 + 11.0 ) ) * desvanecer( 4.0, huella );
// El poro de la cortical mide menos de un milímetro y a la distancia de trabajo ya se apagó: sin algo más grueso, el
// hueso era yeso blanco. El picado de dos milímetros y el moteado de marfil son lo que se ve de él a un metro.
float picado = smoothstep( 0.74, 0.95, ruido3( pMm * 0.45 + 5.0 ) ) * desvanecer( 2.2, huella );
float moteado = capas3( pMm * 0.12 + 1.7 );
float esponjoso = max( gl_FrontFacing ? 0.0 : 1.0, step( 0.5, vCanal ) );
float cortical = 0.0;
if ( vTapa > 0.5 ) {
  int k = int( vTapa + 0.5 ) - 1;
  vec3 d = vPosObjeto - uTapaOrigen[ k ];
  vec2 enLaTapa = clamp( vec2( dot( d, uTapaU[ k ] ), dot( d, uTapaV[ k ] ) ), 0.0, 1.0 );
  float alBorde = texture2D( uCampoDeLasTapas, vec2( ( float( k ) + enLaTapa.x ) / 4.0, enLaTapa.y ) ).r * uTapaRadio[ k ] * uMmPorUnidad;
  float grosor = uTapaGrosor[ k ] > 0.0 ? uTapaGrosor[ k ] : clamp( 0.3 * uTapaRadio[ k ] * uMmPorUnidad, 0.8, 5.0 );
  cortical = 1.0 - smoothstep( grosor * 0.8, grosor * 1.2, alBorde );
  esponjoso = 1.0 - cortical;
}
float trabecula = 1.0 - smoothstep( 0.07, 0.19, abs( ruido3( pMm * 0.9 ) - 0.5 ) );
vec3 medula = mix( vec3( 0.46, 0.11, 0.07 ), vec3( 0.62, 0.34, 0.15 ), capas3( pMm * 0.15 ) );
vec3 marfil = mix( vec3( 0.88, 0.82, 0.7 ), vec3( 0.99, 0.95, 0.87 ), smoothstep( 0.25, 0.75, moteado ) );
vec3 hueso = diffuseColor.rgb * marfil * mix( vec3( 0.95 ), vec3( 1.03 ), veta );
hueso *= ( 1.0 - 0.25 * poro ) * ( 1.0 - 0.09 * picado ) * ( 1.0 - 0.5 * foramen ) * ( 1.0 + 0.08 * grano );
vec3 corte = diffuseColor.rgb * vec3( 1.0, 0.96, 0.88 );
vec3 esponja = mix( medula, diffuseColor.rgb * 1.02, trabecula );
diffuseColor.rgb = mix( mix( hueso, corte, cortical ), esponja, esponjoso );
float alturaDelAspecto = mix( ( 0.03 * grano - 0.05 * poro - 0.06 * picado - 0.12 * foramen ) * ( 1.0 - cortical ), - 0.25 * ( 1.0 - trabecula ), esponjoso ) * uUnidadesPorMm;
float rugosidadDelAspecto = mix( 0.18 * poro + 0.08 * picado - 0.1 * cortical, 0.2, esponjoso );
`

/** El ojo y su córnea: todo el color está en los vértices, y el material solo pone el brillo de lo mojado. */
const OJO = /* glsl */ `
float alturaDelAspecto = 0.0;
float rugosidadDelAspecto = 0.0;
`

/** Músculo, tendón, vaso, fascia: el estriado a lo largo del eje de la pieza y el brillo de lo húmedo. */
const FIBROSO = /* glsl */ `
vec3 pMm = vPosObjeto * uMmPorUnidad;
float huella = max( length( fwidth( pMm ) ), 1e-4 );
float a = dot( pMm, uEjeFibra );
vec3 q = pMm - a * uEjeFibra;
float fibra = ( ruido3( q * 1.5 + uEjeFibra * a * 0.05 ) - 0.5 ) * desvanecer( 0.7, huella );
float haz = capas3( q * 0.25 + uEjeFibra * a * 0.01 ) - 0.5;
diffuseColor.rgb *= 1.0 + uFibra * ( 0.18 * fibra + 0.2 * haz );
// Lo que se ve por dentro de la cáscara —el interior de un músculo por la herida que abre un separador— es la cara de
// corte: más oscura y más roja que la vaina. Con el mismo rosado que la superficie, la abertura no se leía y el borde
// apartado parecía seguir en su sitio (P-008 E2).
diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.6, 0.34, 0.32 ), gl_FrontFacing ? 0.0 : 1.0 );
float alturaDelAspecto = uFibra * ( 0.04 * fibra + 0.08 * haz ) * uUnidadesPorMm;
float rugosidadDelAspecto = 0.06 * haz;
`

/**
 * La dispersión bajo la piel, aproximada: la luz que da en la piel no se queda en la superficie, entra, se tiñe de
 * la sangre y sale un poco más allá. Lo que se ve es que la sombra no corta en seco: el borde se aclara en rojo.
 * Se suma a lo difuso la luz que llegaría con una «envoltura» (el producto de la normal y la luz desplazado hacia
 * atrás), solo en lo que excede a la de siempre, y teñida.
 *
 * Se eligió esto antes que la transmisión de `MeshPhysicalMaterial`, que es lo físicamente correcto para un cuerpo
 * translúcido pero dibuja la escena una vez más en una textura del tamaño del lienzo para cada material que la usa:
 * memoria de la tarjeta (P-004 E2) a cambio de un efecto que en la piel apenas se distingue del de aquí.
 */
const DISPERSION = /* glsl */ `
	{
		float envuelta = saturate( ( dot( geometryNormal, directLight.direction ) + 0.45 ) / 1.45 );
		reflectedLight.directDiffuse += max( envuelta - dotNL, 0.0 ) * directLight.color * vec3( 0.85, 0.32, 0.22 ) * BRDF_Lambert( material.diffuseContribution );
	}
`

/** La línea de three tras la que va la dispersión. Si una versión nueva la cambia, `tests/unit/aspectoDelPaciente.test.ts` lo dice. */
export const LINEA_DE_LO_DIFUSO = 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );'

interface Uniformes {
  [nombre: string]: THREE.IUniform
}

/**
 * Lo que el aspecto le hace al sombreador del material, para el `onBeforeCompile`. Separado para probarlo con los
 * sombreadores de verdad de three: si un trozo cambia de nombre, el reemplazo no falla, simplemente no ocurre, y el
 * paciente sale liso sin que nadie lo note.
 */
export function aplicarAlSombreador(
  sombreador: { vertexShader: string; fragmentShader: string; uniforms: Uniformes },
  aspecto: Aspecto,
  uniformes: Uniformes,
) {
  Object.assign(sombreador.uniforms, uniformes)
  const conTapas = aspecto === 'hueso'
  const conPared = aspecto === 'piel'
  sombreador.vertexShader = sombreador.vertexShader
    .replace(
      '#include <common>',
      VERTICE +
        (conTapas ? `attribute float aTapa;\nvarying float vTapa;\nattribute float ${ATRIBUTO_DEL_CANAL};\nvarying float vCanal;\n` : '') +
        (conPared ? `attribute float ${ATRIBUTO_DE_LA_PARED};\nvarying float vPared;\n` : ''),
    )
    .replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvPosObjeto = transformed;\n' +
        (conTapas ? `vTapa = aTapa;\nvCanal = ${ATRIBUTO_DEL_CANAL};\n` : '') +
        (conPared ? `vPared = ${ATRIBUTO_DE_LA_PARED};\n` : ''),
    )
  const propio =
    aspecto === 'piel'
      ? PIEL
      : aspecto === 'hueso'
        ? HUESO
        : aspecto === 'ojo'
          ? OJO
          : FIBROSO
  const declaraciones =
    RUIDO +
    (conTapas
      ? 'varying float vTapa;\nvarying float vCanal;\nuniform vec3 uTapaOrigen[ 4 ];\nuniform vec3 uTapaU[ 4 ];\nuniform vec3 uTapaV[ 4 ];\nuniform float uTapaRadio[ 4 ];\nuniform float uTapaGrosor[ 4 ];\nuniform sampler2D uCampoDeLasTapas;\n'
      : '') +
    (conPared ? 'varying float vPared;\n' : '') +
    (aspecto === 'piel' || aspecto === 'hueso' || aspecto === 'ojo' ? '' : 'uniform vec3 uEjeFibra;\nuniform float uFibra;\n')
  let fragmento = sombreador.fragmentShader
    .replace('#include <clipping_planes_pars_fragment>', '#include <clipping_planes_pars_fragment>\n' + declaraciones)
    .replace('#include <color_fragment>', '#include <color_fragment>\n' + propio)
    .replace(
      '#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\nroughnessFactor = clamp( roughnessFactor + rugosidadDelAspecto, 0.08, 1.0 );',
    )
    .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = conRelieve( normal, alturaDelAspecto );')
  if (aspecto === 'piel') {
    fragmento = fragmento.replace(
      '#include <lights_physical_pars_fragment>',
      THREE.ShaderChunk.lights_physical_pars_fragment.replace(LINEA_DE_LO_DIFUSO, LINEA_DE_LO_DIFUSO + DISPERSION),
    )
  }
  sombreador.fragmentShader = fragmento
}

// ----------------------------------------------------------------------------------------------- materiales

/** Lo que cada aspecto pide al material físico, sobre el color y la opacidad del archivo. */
const PARAMETROS: Record<Aspecto, THREE.MeshPhysicalMaterialParameters> = {
  // El brillo de la piel es el del sebo, ancho y suave; el terciopelo (`sheen`) es la pelusa y la luz que vuelve
  // de dentro en los bordes, rosada.
  piel: { roughness: 0.52, specularIntensity: 0.55, sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color(0.95, 0.6, 0.52) },
  // El hueso seco es mate; el vivo, en un campo quirúrgico, tiene una película de sangre y suero que brilla poco.
  hueso: { roughness: 0.6, specularIntensity: 0.45, clearcoat: 0.12, clearcoatRoughness: 0.45 },
  // El músculo expuesto está mojado: una capa de barniz encima de un rojo mate.
  musculo: { roughness: 0.62, clearcoat: 0.55, clearcoatRoughness: 0.18, specularIntensity: 0.5 },
  humedo: { roughness: 0.5, clearcoat: 0.45, clearcoatRoughness: 0.2, specularIntensity: 0.5 },
  fascia: { roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.15, specularIntensity: 0.6, sheen: 0.2, sheenRoughness: 0.5, sheenColor: new THREE.Color(0.9, 0.9, 0.95) },
  // La esclera, el iris y la córnea están cubiertos por la película lagrimal: un brillo casi de espejo y ancho de un punto.
  ojo: { roughness: 0.22, specularIntensity: 0.8, clearcoat: 1, clearcoatRoughness: 0.03 },
}
const INTENSIDAD_DE_LA_FIBRA: Record<Aspecto, number> = { piel: 0, hueso: 0, musculo: 1, humedo: 0.25, fascia: 0.45, ojo: 0 }

/**
 * El material con el aspecto, hecho a partir del del archivo: su color, su opacidad y sus caras. `mmPorUnidad` es lo
 * que mide en milímetros una unidad del objeto (las de su geometría), y `unidadesPorMm`, lo que mide un milímetro en
 * las unidades de la escena: el ruido va por lo primero y el relieve por lo segundo.
 */
export function materialConAspecto(
  original: THREE.Material,
  aspecto: Aspecto,
  { mmPorUnidad, unidadesPorMm, ejeFibra = [0, 1, 0], tapas }: { mmPorUnidad: number; unidadesPorMm: number; ejeFibra?: Vec3; tapas?: CampoDeLasTapas },
): THREE.MeshPhysicalMaterial {
  const base = original as THREE.MeshStandardMaterial
  const material = new THREE.MeshPhysicalMaterial({
    ...PARAMETROS[aspecto],
    name: original.name,
    color: base.color ? base.color.clone() : new THREE.Color(0xdddddd),
    metalness: 0,
    transparent: original.transparent,
    opacity: original.opacity,
    side: original.side,
    depthWrite: original.depthWrite,
    // El color por vértice del archivo (`COLOR_0`, D-227: codos, labios, iris). Se copia porque este material es nuevo:
    // el cargador solo lo enciende en el que él mismo creó, y sin esto la pigmentación se perdería al vestir la malla.
    vertexColors: base.vertexColors === true,
  })
  const uniformes: Uniformes = {
    uMmPorUnidad: { value: mmPorUnidad },
    uUnidadesPorMm: { value: unidadesPorMm },
  }
  if (aspecto === 'hueso') {
    const t = tapas ?? campoDeLasTapas([])
    uniformes.uTapaOrigen = { value: t.origen }
    uniformes.uTapaU = { value: t.ejeU }
    uniformes.uTapaV = { value: t.ejeV }
    uniformes.uTapaRadio = { value: t.radio }
    uniformes.uTapaGrosor = { value: t.grosor }
    uniformes.uCampoDeLasTapas = { value: t.textura }
    // Una malla de hueso sin los atributos de las tapas y del canal —una que no pasó por `marcarLasTapas`— los lee como
    // 0, y no como lo último que quedó fijo en esa posición de la tarjeta (ver `SIN_CANAL_POR_OMISION`).
    ;(material as THREE.Material & { defaultAttributeValues?: Record<string, number[]> }).defaultAttributeValues = {
      ...SIN_CANAL_POR_OMISION,
      aTapa: [0],
    }
    // La textura de las tapas es de este material: se va con él.
    material.addEventListener('dispose', () => t.textura.dispose())
  } else if (aspecto !== 'piel' && aspecto !== 'ojo') {
    uniformes.uEjeFibra = { value: new THREE.Vector3(...ejeFibra) }
    uniformes.uFibra = { value: INTENSIDAD_DE_LA_FIBRA[aspecto] }
  }
  material.onBeforeCompile = (sombreador) => aplicarAlSombreador(sombreador, aspecto, uniformes)
  // Todos los de un mismo aspecto comparten programa: solo cambian los valores de los uniformes.
  material.customProgramCacheKey = () => `aspecto-${aspecto}`
  return material
}

export interface CampoDeLasTapas {
  origen: THREE.Vector3[]
  ejeU: THREE.Vector3[]
  ejeV: THREE.Vector3[]
  radio: number[]
  /** La cortical de cada tapa, en mm; 0 es la regla de un hueso sin canal (ver `grosorDeLaTapa`). */
  grosor: number[]
  textura: THREE.DataTexture
}

/**
 * La cortical de la tapa de un corte de un hueso con canal medular (D-337), en mm.
 *
 * En la diáfisis la tapa es un anillo (D-336), y el anillo es la cortical: va entera, hasta 5 mm del borde de fuera y
 * del de dentro, que es más de lo que mide de ancho una diáfisis del atlas. Si el anillo sale más ancho —un corte junto
 * a la cúpula del canal, donde ya empieza la metáfisis—, el centro del anillo queda esponjoso. En la metáfisis la tapa
 * es un disco, y su cortical es fina, de 1,5 mm, como la de una meseta tibial o un radio distal.
 *
 * Un hueso sin canal —el de un caso exportado antes de D-336, una vértebra, la pelvis— da 0: el sombreador sigue con
 * la regla de antes.
 */
export const CORTICAL_DEL_ANILLO_MM = 5
export const CORTICAL_DE_LA_METAFISIS_MM = 1.5
export function grosorDeLaTapa(tapa: { agujeros: number }, conCanal: boolean): number {
  if (!conCanal) return 0
  return tapa.agujeros > 0 ? CORTICAL_DEL_ANILLO_MM : CORTICAL_DE_LA_METAFISIS_MM
}

/** Las cuatro tapas que caben, en los uniformes del sombreador, y sus campos de distancias juntos en una textura. */
export function campoDeLasTapas(tapas: ReturnType<typeof tapasDeCorte>, { conCanal = false }: { conCanal?: boolean } = {}): CampoDeLasTapas {
  const lado = LADO_DEL_CAMPO_DE_LA_TAPA
  const datos = new Uint8Array(lado * 4 * lado)
  const campo: CampoDeLasTapas = { origen: [], ejeU: [], ejeV: [], radio: [], grosor: [], textura: new THREE.DataTexture(datos, lado * 4, lado, THREE.RedFormat) }
  for (let k = 0; k < 4; k++) {
    const t = tapas[k]
    campo.origen.push(new THREE.Vector3(...(t?.origen ?? [0, 0, 0])))
    campo.ejeU.push(new THREE.Vector3(...(t?.ejeU ?? [0, 0, 0])))
    campo.ejeV.push(new THREE.Vector3(...(t?.ejeV ?? [0, 0, 0])))
    campo.radio.push(t?.radio ?? 0)
    campo.grosor.push(t ? grosorDeLaTapa(t, conCanal) : 0)
    if (!t) continue
    for (let j = 0; j < lado; j++) datos.set(t.distancia.subarray(j * lado, (j + 1) * lado), j * lado * 4 + k * lado)
  }
  campo.textura.magFilter = THREE.LinearFilter
  campo.textura.minFilter = THREE.LinearFilter
  campo.textura.needsUpdate = true
  return campo
}

// ----------------------------------------------------------------------------------------------- vello

/** Lo ancho que es un vello en su raíz, en milímetros. */
const GROSOR_DEL_VELLO_MM = 0.08
/** A cuánto de una incisión se esconde el vello, en milímetros: lo que abren los labios y algo más. */
const RADIO_SIN_VELLO_MM = 12

/**
 * Un vello mide 0,08 mm de ancho: con la pierna entera en pantalla, una centésima de píxel. Un triángulo así solo se
 * dibuja donde cae justo sobre el centro de un píxel, y salía como granos sueltos de pimienta que parecían suciedad y
 * centelleaban al girar. Aquí ningún vello es más fino que un píxel en pantalla —se ensancha— y lo que se ensanchó se
 * paga en transparencia, que es lo que un pelo fino hace a la vista: de lejos queda un velo; y cuando el vello entero
 * mide unos pocos píxeles, se desvanece del todo.
 *
 * Y nunca es opaco del todo, y es castaño claro y no oscuro: el vello del cuerpo es fino y translúcido, y oscuro y
 * entero se leía en la cara y en el cuero cabelludo como rayas de lápiz sobre la piel, o como barba de tres días.
 */
const VELLO_EN_EL_VERTICE_DECLARACIONES = /* glsl */ `
uniform float uAltoDelLienzo;
varying float vAlfaDelVello;
`
const VELLO_EN_EL_VERTICE = /* glsl */ `
{
  mat4 aLaVista = modelViewMatrix * instanceMatrix;
  vec4 centro = aLaVista * vec4( 0.0, position.y, 0.0, 1.0 );
  float pxPorUnidad = projectionMatrix[ 1 ][ 1 ] * uAltoDelLienzo * 0.5 / max( - centro.z, 1e-6 );
  float anchoPx = length( ( aLaVista * vec4( 1.0, 0.0, 0.0, 0.0 ) ).xyz ) * ( 1.0 - 0.75 * position.y ) * pxPorUnidad;
  float largoPx = length( ( aLaVista * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz ) * pxPorUnidad;
  float ensanche = max( 1.0, 1.0 / max( anchoPx, 1e-4 ) );
  transformed.x *= ensanche;
  vAlfaDelVello = 0.55 * smoothstep( 4.0, 14.0, largoPx ) / ensanche;
}
`

/** La cinta de un vello: tres tramos, más fina hacia la punta y curvada hacia la piel. */
function geometriaDelVello(): THREE.BufferGeometry {
  const posiciones: number[] = []
  const indices: number[] = []
  for (let i = 0; i <= 3; i++) {
    const y = i / 3
    const medio = (1 - 0.75 * y) / 2
    const curva = -0.12 * y * y
    posiciones.push(-medio, y, curva, medio, y, curva)
    if (i < 3) indices.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(posiciones, 3))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}

/**
 * El vello de una malla de piel, como instancias de una cinta: miles de vellos en una sola llamada de dibujo. Cuelga
 * de la malla, así que se mueve con ella y se esconde con su capa; es interfaz para todo lo demás (no se pincha, no
 * sale en la radiografía, no está en la lista de piezas) y no proyecta sombra, que con miles de cintas finas costaba
 * más que todo el resto de la lámpara.
 */
function crearVello(malla: THREE.Mesh, mmPorUnidad: number): { vello: THREE.InstancedMesh; matrices: Float32Array; bases: Float32Array } | null {
  const g = malla.geometry
  const posicion = g.getAttribute('position')
  if (!posicion) return null
  const posiciones = flotantesDe(posicion)
  const indices = g.getIndex()?.array ?? null
  const excluir = triangulosHaciaDentro(posiciones, indices)
  // Sin vello donde el archivo pinta mucosa (D-227): labios y areolas. Una piel sin color por vértice no cambia.
  const colorPorVertice = g.getAttribute('color')
  if (colorPorVertice) {
    const rgb = new Float32Array(colorPorVertice.count * 3)
    for (let i = 0; i < colorPorVertice.count; i++) rgb.set([colorPorVertice.getX(i), colorPorVertice.getY(i), colorPorVertice.getZ(i)], i * 3)
    const sinVello = triangulosSinVello(rgb, 3, indices)
    for (let t = 0; t < excluir.length; t++) if (sinVello[t]) excluir[t] = 1
  }
  const sitios = sitiosDelVello(posiciones, indices, {
    mmPorUnidad,
    excluir,
    semilla: [...malla.name].reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 7),
  })
  if (sitios.cuantos === 0) return null
  const material = new THREE.MeshStandardMaterial({
    color: 0x6a5240,
    roughness: 0.55,
    metalness: 0,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
  })
  const altoDelLienzo = { value: 1000 }
  material.onBeforeCompile = (s) => {
    s.uniforms.uAltoDelLienzo = altoDelLienzo
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\n' + VELLO_EN_EL_VERTICE_DECLARACIONES)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VELLO_EN_EL_VERTICE)
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAlfaDelVello;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vAlfaDelVello;')
  }
  material.customProgramCacheKey = () => 'vello'
  const vello = new THREE.InstancedMesh(geometriaDelVello(), material, sitios.cuantos)
  const lienzo = new THREE.Vector2()
  vello.onBeforeRender = (render) => {
    altoDelLienzo.value = render.getDrawingBufferSize(lienzo).y
  }
  const grosor = GROSOR_DEL_VELLO_MM / mmPorUnidad
  const m = new THREE.Matrix4()
  const x = new THREE.Vector3(), y = new THREE.Vector3(), z = new THREE.Vector3(), n = new THREE.Vector3()
  const color = new THREE.Color()
  for (let h = 0; h < sitios.cuantos; h++) {
    y.fromArray(sitios.direcciones, h * 3)
    n.fromArray(sitios.normales, h * 3)
    // El eje Z de la cinta, hacia fuera de la piel y perpendicular al vello: la curva lo devuelve hacia ella.
    z.copy(n).addScaledVector(y, -n.dot(y)).normalize()
    x.crossVectors(y, z)
    const largo = sitios.largos[h]
    m.makeBasis(x.multiplyScalar(grosor), y.clone().multiplyScalar(largo), z.multiplyScalar(largo))
    m.setPosition(sitios.bases[h * 3], sitios.bases[h * 3 + 1], sitios.bases[h * 3 + 2])
    vello.setMatrixAt(h, m)
    vello.setColorAt(h, color.setScalar(sitios.tonos[h]))
  }
  vello.name = 'vello'
  vello.userData.deInterfaz = true
  vello.raycast = () => {}
  vello.castShadow = false
  vello.receiveShadow = true
  return { vello, matrices: Float32Array.from(vello.instanceMatrix.array as Float32Array), bases: sitios.bases }
}

// ----------------------------------------------------------------------------------------------- el modelo

interface Vestido {
  aspecto: Aspecto
  original: THREE.Material
  propio: THREE.MeshPhysicalMaterial
  vello?: { malla: THREE.InstancedMesh; matrices: Float32Array; bases: Float32Array }
}

export interface AspectoDelModelo {
  vestidos: Map<THREE.Mesh, Vestido>
  /** Las heridas sobre las que se escondió el vello la última vez: si no cambian, no se rehace. */
  firmaDeLasHeridas: string
}

export function crearAspectoDelModelo(): AspectoDelModelo {
  return { vestidos: new Map(), firmaDeLasHeridas: '' }
}

const deInterfaz = (o: THREE.Object3D) =>
  o.userData.deInterfaz === true || o.name === 'cinta-de-la-herida' || o.name === 'borde-de-la-herida'

/**
 * La piel lleva siempre el atributo de la pared (D-333), en cero hasta que una herida levanta la suya: el sombreador lo
 * lee en todas sus mallas, y en una que no lo trajera leería lo que otro programa dejó en esa ranura. Lo que ya lo
 * tiene —una piel cortada antes de vestirla— se deja como está.
 */
function marcarLaPared(malla: THREE.Mesh) {
  const g = malla.geometry
  const posicion = g.getAttribute('position')
  if (!posicion || g.getAttribute(ATRIBUTO_DE_LA_PARED)) return
  g.setAttribute(ATRIBUTO_DE_LA_PARED, new THREE.BufferAttribute(new Float32Array(posicion.count), 1))
}

/**
 * Las tapas de una malla de hueso, en el atributo `aTapa` que lee el sombreador (0 fuera, 1 a 4 la tapa), y su canal
 * medular, en `aCanal` (`marcarElCanal`). El hueso tiene canal si lo trae la malla o si lo dice el archivo
 * (`canalMedular`, de los `extras`): un trozo de meseta tibial no trae canal, y su tapa es de un hueso que sí lo tiene.
 */
function marcarLasTapas(malla: THREE.Mesh): CampoDeLasTapas {
  const g = malla.geometry
  const posicion = g.getAttribute('position')
  const normal = g.getAttribute('normal')
  const tapas = posicion && normal ? tapasDeCorte(flotantesDe(posicion), flotantesDe(normal), g.getIndex()?.array ?? null) : []
  const marca = new Float32Array(posicion?.count ?? 0)
  tapas.forEach((t, k) => {
    for (const v of t.vertices) marca[v] = k + 1
  })
  g.setAttribute('aTapa', new THREE.BufferAttribute(marca, 1))
  const conCanal = marcarElCanal(g) || malla.userData.canalMedular === true
  return campoDeLasTapas(tapas, { conCanal })
}

function desvestir(malla: THREE.Mesh, vestido: Vestido) {
  malla.material = vestido.original
  vestido.propio.dispose()
  if (vestido.vello) {
    vestido.vello.malla.removeFromParent()
    vestido.vello.malla.geometry.dispose()
    ;(vestido.vello.malla.material as THREE.Material).dispose()
    vestido.vello.malla.dispose()
  }
}

/**
 * Viste cada malla del modelo con el aspecto que le toca por su papel (`rolDe`), y desviste la que lo perdió. Es
 * idempotente: lo que ya lleva su aspecto se deja. `mmPorUnidad` son los milímetros de una unidad del caso.
 *
 * También deja que todo el modelo dé y reciba sombra bajo la lámpara (ver `pabellon.ts`).
 */
export function vestirElModelo(
  a: AspectoDelModelo,
  raiz: THREE.Object3D,
  rolDe: (nombre: string) => RolDePieza | undefined,
  mmPorUnidad: number,
) {
  raiz.updateMatrixWorld(true)
  const mallas: THREE.Mesh[] = []
  raiz.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || !m.name || deInterfaz(m)) return
    mallas.push(m)
  })
  for (const malla of mallas) {
    malla.castShadow = true
    malla.receiveShadow = true
    const anterior = a.vestidos.get(malla)
    const aspecto = Array.isArray(malla.material) ? null : aspectoDe(malla, rolDe(malla.name))
    if (anterior?.aspecto === aspecto) continue
    if (anterior) {
      desvestir(malla, anterior)
      a.vestidos.delete(malla)
    }
    if (!aspecto) continue
    const original = malla.material as THREE.Material
    const delObjeto = mmPorUnidad * (malla.matrixWorld.getMaxScaleOnAxis() || 1)
    const posicion = malla.geometry.getAttribute('position')
    const propio = materialConAspecto(original, aspecto, {
      mmPorUnidad: delObjeto,
      unidadesPorMm: 1 / mmPorUnidad,
      ejeFibra: posicion && aspecto !== 'hueso' && aspecto !== 'piel' && aspecto !== 'ojo' ? ejePrincipal(flotantesDe(posicion)) : undefined,
      tapas: aspecto === 'hueso' ? marcarLasTapas(malla) : undefined,
    })
    malla.material = propio
    const vestido: Vestido = { aspecto, original, propio }
    if (aspecto === 'piel') {
      marcarLaPared(malla)
      const v = crearVello(malla, delObjeto)
      if (v) {
        malla.add(v.vello)
        vestido.vello = { malla: v.vello, matrices: v.matrices, bases: v.bases }
      }
    }
    a.vestidos.set(malla, vestido)
  }
}

/**
 * Esconde el vello que cae sobre una herida de la piel y devuelve el de las que se cerraron. Se llama antes de cada
 * dibujo, y solo trabaja cuando las heridas cambiaron.
 */
export function velloAlDia(a: AspectoDelModelo, heridas: Iterable<readonly HeridaEnCapa[]>) {
  const conVello = [...a.vestidos].filter(([, v]) => v.vello)
  if (conVello.length === 0) return
  const todas = [...heridas].flat().filter((h) => a.vestidos.get(h.malla)?.vello)
  const firma = todas.map((h) => `${h.malla.id}:${h.incision}:${h.trazo.puntos.length}`).join('|')
  if (firma === a.firmaDeLasHeridas) return
  a.firmaDeLasHeridas = firma
  const escondido = new THREE.Matrix4().makeScale(0, 0, 0)
  for (const [malla, { vello }] of conVello) {
    if (!vello) continue
    const aLocal = malla.matrixWorld.clone().invert()
    const puntos: Vec3[] = todas
      .filter((h) => h.malla === malla)
      .flatMap((h) => h.trazo.puntos.map((p) => p.clone().applyMatrix4(aLocal).toArray() as Vec3))
    const escala = malla.matrixWorld.getMaxScaleOnAxis() || 1
    const radio = (RADIO_SIN_VELLO_MM * (todas.find((h) => h.malla === malla)?.unidadesPorMm ?? 0)) / escala
    const visible = velloLejosDeLasHeridas(vello.bases, puntos, radio)
    const destino = vello.malla.instanceMatrix.array as Float32Array
    for (let h = 0; h < visible.length; h++) {
      if (visible[h]) destino.set(vello.matrices.subarray(h * 16, h * 16 + 16), h * 16)
      else destino.set(escondido.elements, h * 16)
    }
    vello.malla.instanceMatrix.needsUpdate = true
  }
}

/**
 * Devuelve a cada malla su material de antes y suelta lo propio: los materiales, las texturas de las tapas y el
 * vello. Va antes de `liberar(escena)`, que suelta lo que cada malla lleve puesto, y así no queda nada sin soltar.
 */
export function soltarElAspecto(a: AspectoDelModelo) {
  for (const [malla, vestido] of a.vestidos) desvestir(malla, vestido)
  a.vestidos.clear()
  a.firmaDeLasHeridas = ''
}
