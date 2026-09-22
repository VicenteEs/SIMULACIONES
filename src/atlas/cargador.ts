'use client'

/**
 * Carga del atlas en el navegador.
 *
 * Trae el catálogo y los paquetes de geometría que hagan falta, y los convierte
 * en algo que la tarjeta gráfica pueda dibujar de una vez.
 *
 * Dos decisiones que sostienen el rendimiento:
 *
 *  1. **Una malla por sistema, no una por pieza.** Dibujar 2.234 mallas son
 *     2.234 llamadas de dibujo por fotograma y el navegador se arrodilla. Se
 *     fusionan en quince —una por sistema— y se guarda en cada vértice a qué
 *     pieza pertenece. Encender, apagar, separar o resaltar una pieza no toca
 *     la geometría: cambia un píxel de una textura que lee el sombreador.
 *  2. **Los paquetes se piden solo cuando se necesitan.** Abrir una instancia
 *     de una tibia no descarga los 31 MB del cuerpo entero, sino el paquete que
 *     contiene esa tibia.
 *
 * Los paquetes viajan comprimidos y los descomprime el propio navegador: se
 * sirven con `Content-Encoding: gzip` (ver `next.config.mjs`), de modo que aquí
 * no hay ni una línea de descompresión.
 */

import * as THREE from 'three'
import { ruta } from '@/lib/rutas'
import { corregirCatalogo } from './clasificacion'
import type { CatalogoDelAtlas, PiezaDelAtlas } from './formato'

/** Cuántos canales ocupa cada pieza en la textura de estado. */
const CANALES = 4

/**
 * Estado de una pieza, tal como lo lee el sombreador.
 *
 * Los tres primeros canales son el desplazamiento de la pieza al separar el
 * cuerpo; el cuarto codifica visibilidad y selección a la vez para no gastar
 * una segunda textura: 0 oculta, 1 visible, 2 visible y resaltada, 3 visible y
 * seleccionada.
 *
 * El orden importa: todo lo que sea `>= VISIBLE` se dibuja y se puede señalar,
 * y así lo preguntan el picado y la selección por caja. Un estado nuevo que
 * deba verse va por encima de 1, nunca por debajo.
 */
export const ESTADO = { OCULTA: 0, VISIBLE: 1, RESALTADA: 2, SELECCIONADA: 3 } as const

/**
 * Dónde vive una pieza dentro de la malla fusionada de su sistema.
 *
 * Es lo que permite señalar una pieza con el ratón sin recorrer los 2,29
 * millones de triángulos del cuerpo: primero se descartan piezas por su caja
 * envolvente, que son 2.234 comparaciones baratas, y solo a las dos o tres que
 * sobreviven se les miran los triángulos, usando este rango.
 */
export interface RangoDePieza {
  /** Posición de la malla dentro de `mallas`. */
  malla: number
  /** Primer índice suyo dentro del atributo de índices de esa malla. */
  inicio: number
  cuenta: number
}

export interface EscenaDelAtlas {
  /** Una malla por sistema presente en lo cargado. */
  mallas: THREE.Mesh[]
  /** Rango de cada pieza, por su posición en el catálogo. */
  rangos: Map<number, RangoDePieza>
  /** Textura de estado, indexada por el orden de la pieza en el catálogo. */
  estados: THREE.DataTexture
  /** Datos de la textura, para escribir sin recrearla. */
  datos: Float32Array
  /** Índice de cada pieza dentro de la textura. */
  indices: Map<string, number>
  /** Centro de cada pieza, para separarla desde su sitio. */
  centros: Float32Array
  /**
   * La transformación de cada pieza (D-129), en dos texturas con la misma
   * rejilla que `estados`: el giro como cuaternión y el traslado ya compuesto
   * (ver `ponerTransformacion`). Se escriben con esa función y no a mano.
   */
  giros: THREE.DataTexture
  datosDeGiros: Float32Array
  traslados: THREE.DataTexture
  datosDeTraslados: Float32Array
  /**
   * El aspecto propio de cada pieza (D-134): su color en los tres primeros
   * canales —con el rojo en −1 si no tiene uno suyo y manda el del sistema— y su
   * opacidad en el cuarto. Se escribe con `ponerAspecto`.
   */
  aspectos: THREE.DataTexture
  datosDeAspectos: Float32Array
  liberar: () => void
}

// --------------------------------------------------------------- descarga

/**
 * Trae el catálogo, ya con los sistemas corregidos.
 *
 * La corrección se hace aquí, en la puerta, y no en `montarEscena` ni en el
 * árbol, porque de este mismo objeto beben los dos: el taller y el visor de
 * instancia guardan lo que devuelve esta función y se lo pasan a la vez al
 * árbol anatómico —que agrupa por sistema para «Por sistema»— y al visor —que
 * lo pasa a `montarEscena`, que fusiona una malla por sistema—. Corregido solo
 * en uno de los dos, el árbol diría que el peroneo corto es músculo y la escena
 * lo seguiría pintando del color del hueso y apagándolo con el esqueleto, o al
 * revés, y el traumatólogo no tendría manera de saber cuál de los dos miente.
 *
 * Nadie en el navegador debe leer `catalogo.json` sin pasar por aquí.
 */
export async function cargarCatalogo(senal?: AbortSignal): Promise<CatalogoDelAtlas> {
  const respuesta = await fetch(ruta('/atlas/catalogo.json'), { signal: senal })
  if (!respuesta.ok) {
    throw new Error(
      `No se pudo leer el catálogo del atlas (${respuesta.status}). ` +
        'Compruebe que public/atlas/ está desplegado.',
    )
  }
  return corregirCatalogo((await respuesta.json()) as CatalogoDelAtlas)
}

/**
 * Descarga los paquetes indicados.
 *
 * Se piden de tres en tres: en serie se desaprovecha el enlace y todos a la vez
 * satura una conexión modesta y retrasa el primer paquete, que es justo el que
 * permite empezar a ver algo.
 */
export async function cargarPaquetes(
  catalogo: CatalogoDelAtlas,
  cuales: number[],
  alProgresar?: (hechos: number, total: number) => void,
  senal?: AbortSignal,
): Promise<Map<number, ArrayBuffer>> {
  const pendientes = [...new Set(cuales)].sort((a, b) => a - b)
  const buferes = new Map<number, ArrayBuffer>()
  let hechos = 0

  let siguiente = 0
  const obrero = async () => {
    while (siguiente < pendientes.length) {
      const indice = pendientes[siguiente++]
      const paquete = catalogo.paquetes[indice]
      if (!paquete) continue

      // La versión del catálogo viaja en la URL. Los paquetes se sirven con
      // caché de un año y marcados «immutable», y sus nombres —cuerpo-0.bin.gz,
      // cuerpo-1.bin.gz…— no la llevan: sin esto, regenerar el atlas dejaría a
      // quien ya lo hubiera visitado con la geometría vieja y el catálogo
      // nuevo durante un año, que es la manera silenciosa de enseñar el hueso
      // equivocado. Al cambiar la versión cambia la URL y el navegador
      // descarga de nuevo.
      const respuesta = await fetch(
        ruta(`/atlas/${paquete.archivo}?v=${encodeURIComponent(catalogo.version)}`),
        { signal: senal },
      )
      if (!respuesta.ok) {
        throw new Error(`No se pudo descargar ${paquete.archivo} (${respuesta.status}).`)
      }

      const datos = await respuesta.arrayBuffer()
      // El catálogo declara el tamaño ya descomprimido de cada paquete, y
      // `montarEscena` construye vistas tipadas sobre estos bytes con los
      // desplazamientos del catálogo tal cual. Eso depende de algo que no es
      // del guion de empaquetado sino del transporte: que el
      // `Content-Encoding: gzip` de `next.config.mjs` llegue intacto. La
      // plataforma va detrás de un proxy compartido; si ese proxy recomprime o
      // quita la cabecera, la respuesta llega con 200 y con el gzip crudo, y el
      // fallo salía treinta líneas más allá como un «Invalid typed array
      // length» en inglés, sin decir qué paquete ni que hubiera que mirar el
      // proxy. Y como los paquetes se sirven «immutable» un año, recargar no lo
      // arreglaba.
      if (datos.byteLength !== paquete.bytes) {
        throw new Error(
          `${paquete.archivo} llegó con ${datos.byteLength} bytes y el catálogo declara ` +
            `${paquete.bytes}. Suele ser el proxy alterando Content-Encoding: gzip.`,
        )
      }
      buferes.set(indice, datos)
      alProgresar?.(++hechos, pendientes.length)
    }
  }

  await Promise.all(Array.from({ length: Math.min(3, pendientes.length) }, obrero))
  return buferes
}

/** Qué paquetes hacen falta para un conjunto de piezas. */
export function paquetesNecesarios(piezas: PiezaDelAtlas[]): number[] {
  return [...new Set(piezas.map((p) => p.paquete))].sort((a, b) => a - b)
}

// --------------------------------------------------------------- montaje

/**
 * Construye la escena a partir de los paquetes ya descargados.
 *
 * Las piezas cuyo paquete no esté presente se omiten sin protestar: así se
 * puede montar media escena mientras el resto llega.
 */
export function montarEscena(
  catalogo: CatalogoDelAtlas,
  buferes: Map<number, ArrayBuffer>,
  soloEstas?: Set<string>,
): EscenaDelAtlas {
  const indices = new Map<string, number>()
  catalogo.piezas.forEach((p, i) => indices.set(p.id, i))

  const total = catalogo.piezas.length
  const datos = new Float32Array(total * CANALES)
  const centros = new Float32Array(total * 3)

  catalogo.piezas.forEach((pieza, i) => {
    const [min, max] = pieza.caja
    centros[i * 3] = (min[0] + max[0]) / 2
    centros[i * 3 + 1] = (min[1] + max[1]) / 2
    centros[i * 3 + 2] = (min[2] + max[2]) / 2
    datos[i * CANALES + 3] = ESTADO.VISIBLE
  })

  // La textura es cuadrada por comodidad de muestreo: 2.234 piezas caben en
  // 48x48 con sitio de sobra, y el sombreador calcula fila y columna.
  const lado = Math.ceil(Math.sqrt(total))
  const relleno = new Float32Array(lado * lado * CANALES)
  relleno.set(datos)
  const estados = new THREE.DataTexture(relleno, lado, lado, THREE.RGBAFormat, THREE.FloatType)
  estados.needsUpdate = true

  // Las dos texturas de transformación nacen en reposo: giro identidad —el
  // cuaternión (0, 0, 0, 1), no ceros, que girarían cada vértice a la nada— y
  // traslado nulo.
  const datosDeGiros = new Float32Array(lado * lado * CANALES)
  for (let i = 3; i < datosDeGiros.length; i += CANALES) datosDeGiros[i] = 1
  const giros = new THREE.DataTexture(datosDeGiros, lado, lado, THREE.RGBAFormat, THREE.FloatType)
  giros.needsUpdate = true
  const datosDeTraslados = new Float32Array(lado * lado * CANALES)
  const traslados = new THREE.DataTexture(
    datosDeTraslados,
    lado,
    lado,
    THREE.RGBAFormat,
    THREE.FloatType,
  )
  traslados.needsUpdate = true

  // Y el aspecto: sin color propio (rojo a −1) y maciza (opacidad 1).
  const datosDeAspectos = new Float32Array(lado * lado * CANALES)
  for (let i = 0; i < datosDeAspectos.length; i += CANALES) {
    datosDeAspectos[i] = -1
    datosDeAspectos[i + 3] = 1
  }
  const aspectos = new THREE.DataTexture(
    datosDeAspectos,
    lado,
    lado,
    THREE.RGBAFormat,
    THREE.FloatType,
  )
  aspectos.needsUpdate = true

  // --- agrupar por sistema lo que se puede dibujar -------------------------
  // `pieza.sistema` se lee tal cual llega, sin volver a corregirlo: el catálogo
  // que recibe esta función es el de `cargarCatalogo`, que ya pasó por
  // `corregirCatalogo`, y es el mismo objeto que agrupa el árbol. Corregir otra
  // vez aquí no rompería nada visible, pero taparía el día en que alguien monte
  // la escena con un catálogo crudo: la escena saldría bien y el árbol, que no
  // pasa por aquí, seguiría metiendo los peroneos en el esqueleto.
  const porSistema = new Map<string, { pieza: PiezaDelAtlas; indice: number }[]>()
  // Bucle llano y no `forEach`: este es el único sitio donde una función
  // interna miraría `buferes`, y con eso V8 lo mete en el contexto que
  // comparten todos los cierres de este ámbito —entre ellos el `liberar` que
  // se devuelve y que el visor guarda mientras está montado—. La escena pasaba
  // entonces a retener los 57 MB de paquetes descomprimidos toda la sesión, y
  // `liberar()` no los recuperaba porque el cierre que lo llama ES lo que los
  // retenía. Montada la geometría no hace falta ni un byte más de `buferes`.
  for (let indice = 0; indice < catalogo.piezas.length; indice += 1) {
    const pieza = catalogo.piezas[indice]
    if (!buferes.has(pieza.paquete)) continue
    if (soloEstas && !soloEstas.has(pieza.id)) continue
    const lista = porSistema.get(pieza.sistema) ?? []
    lista.push({ pieza, indice })
    porSistema.set(pieza.sistema, lista)
  }

  const colores = new Map(catalogo.sistemas.map((s) => [s.id, s.color]))
  const mallas: THREE.Mesh[] = []
  const rangos = new Map<number, RangoDePieza>()
  const aLiberar: (THREE.BufferGeometry | THREE.Material)[] = []

  for (const [sistema, grupo] of porSistema) {
    const vertices = grupo.reduce((t, g) => t + g.pieza.vertices, 0)
    const cantidadIndices = grupo.reduce((t, g) => t + g.pieza.indices, 0)
    if (vertices === 0 || cantidadIndices === 0) continue

    const posiciones = new Float32Array(vertices * 3)
    const normales = new Int16Array(vertices * 3)
    const dePieza = new Float32Array(vertices)
    // Uint32 siempre: el sistema arterial pasa holgadamente de 65.535 vértices
    // y un Uint16 daría una malla rota de un modo difícil de diagnosticar.
    const orden = new Uint32Array(cantidadIndices)

    let vBase = 0
    let iBase = 0

    for (const { pieza, indice } of grupo) {
      const bufer = buferes.get(pieza.paquete)!

      posiciones.set(new Float32Array(bufer, pieza.pos, pieza.vertices * 3), vBase * 3)
      normales.set(new Int16Array(bufer, pieza.nor, pieza.vertices * 3), vBase * 3)
      dePieza.fill(indice, vBase, vBase + pieza.vertices)

      const suyos = new Uint32Array(bufer, pieza.idx, pieza.indices)
      for (let k = 0; k < suyos.length; k += 1) orden[iBase + k] = suyos[k] + vBase

      rangos.set(indice, { malla: mallas.length, inicio: iBase, cuenta: pieza.indices })

      vBase += pieza.vertices
      iBase += pieza.indices
    }

    const geometria = new THREE.BufferGeometry()
    geometria.setAttribute('position', new THREE.BufferAttribute(posiciones, 3))
    // Normalizada: el entero de 16 bits se lee como decimal de −1 a 1 en la
    // tarjeta, que es la mitad de memoria que un flotante sin diferencia visible.
    geometria.setAttribute('normal', new THREE.BufferAttribute(normales, 3, true))
    geometria.setAttribute('dePieza', new THREE.BufferAttribute(dePieza, 1))
    geometria.setIndex(new THREE.BufferAttribute(orden, 1))
    geometria.computeBoundingSphere()

    const material = materialDelSistema(colores.get(sistema) ?? '#cccccc', estados, lado, giros, traslados, aspectos)
    const malla = new THREE.Mesh(geometria, material)
    malla.name = sistema
    // El cuerpo no se mueve nunca: recortar por volumen de cámara solo gasta.
    malla.frustumCulled = false
    mallas.push(malla)
    aLiberar.push(geometria, material)
  }

  return {
    mallas,
    rangos,
    estados,
    datos: relleno,
    indices,
    centros,
    giros,
    datosDeGiros,
    traslados,
    datosDeTraslados,
    aspectos,
    datosDeAspectos,
    liberar: () => {
      for (const cosa of aLiberar) cosa.dispose()
      estados.dispose()
      giros.dispose()
      traslados.dispose()
      aspectos.dispose()
    },
  }
}

/**
 * Material que lee el estado de cada pieza desde la textura.
 *
 * Se parte del material estándar de three y se le injertan unas líneas, en vez
 * de escribir un sombreador entero: así se conservan luces, sombras y tonos que
 * hacen que un hueso parezca un hueso.
 */
function materialDelSistema(
  color: string,
  estados: THREE.DataTexture,
  lado: number,
  giros: THREE.DataTexture,
  traslados: THREE.DataTexture,
  aspectos: THREE.DataTexture,
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.72,
    metalness: 0.02,
    side: THREE.DoubleSide,
  })

  // La separación pedida vive en el material, no en el uniforme.
  //
  // `onBeforeCompile` no corre al construir el material: three lo llama dentro
  // de `getProgram`, en el primer dibujado de esa malla. `VisorAtlas` añade las
  // mallas a la escena y llama a `aplicarSeparacion` acto seguido, sin un
  // fotograma por medio, así que en ese momento todavía no hay sombreador al
  // que escribirle nada. Con un 0 fijo aquí, una ficha guardada con el cuerpo
  // separado se abría cerrada y sin arreglo posible: el visor de instancia es
  // de solo lectura y el valor no vuelve a cambiar nunca. Y el picking sí usaba
  // la separación guardada, de modo que el nombre flotante se calculaba contra
  // una anatomía que no estaba dibujada.
  material.userData.separacion = 0
  material.userData.rayosX = 0

  material.onBeforeCompile = (sombreador) => {
    sombreador.uniforms.estados = { value: estados }
    sombreador.uniforms.ladoEstados = { value: lado }
    sombreador.uniforms.rayosX = { value: material.userData.rayosX }
    sombreador.uniforms.aspectos = { value: aspectos }
    sombreador.uniforms.giros = { value: giros }
    sombreador.uniforms.traslados = { value: traslados }
    sombreador.uniforms.separacion = { value: material.userData.separacion }

    sombreador.vertexShader = `
      attribute float dePieza;
      uniform sampler2D estados;
      uniform float ladoEstados;
      uniform float separacion;
      uniform sampler2D giros;
      uniform sampler2D traslados;
      uniform sampler2D aspectos;
      varying float vVisible;
      varying float vResaltada;
      varying float vSeleccionada;
      varying vec4 vAspecto;
      // Girar un vector con un cuaternión unitario, sin montar la matriz.
      vec3 girarCon(vec4 q, vec3 v) {
        return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
      }
      vec2 uvDeLaPieza(float pieza, float lado) {
        return vec2((mod(pieza, lado) + 0.5) / lado, (floor(pieza / lado) + 0.5) / lado);
      }
    ${sombreador.vertexShader}`
      // La normal gira con la pieza: sin esto, un fragmento rotado noventa
      // grados seguía iluminado como si no se hubiera movido, y se leía plano.
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        objectNormal = girarCon(texture2D(giros, uvDeLaPieza(dePieza, ladoEstados)), objectNormal);`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float fila = floor(dePieza / ladoEstados);
        vec2 uvEstado = vec2((mod(dePieza, ladoEstados) + 0.5) / ladoEstados,
                             (fila + 0.5) / ladoEstados);
        vec4 estado = texture2D(estados, uvEstado);
        vVisible = step(0.5, estado.a);
        vAspecto = texture2D(aspectos, uvEstado);
        vSeleccionada = step(2.5, estado.a);
        vResaltada = step(1.5, estado.a) - vSeleccionada;
        // Primero la transformación propia de la pieza (D-129) y después la
        // separación, que es un desplazamiento de todo el cuerpo y no debe
        // girar con nadie.
        transformed = girarCon(texture2D(giros, uvEstado), transformed)
          + texture2D(traslados, uvEstado).xyz;
        transformed += estado.xyz * separacion;`,
      )

    sombreador.fragmentShader = `
      varying float vVisible;
      varying float vResaltada;
      varying float vSeleccionada;
      varying vec4 vAspecto;
      uniform float rayosX;
    ${sombreador.fragmentShader}`
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        // Descartar es lo que hace que apagar una pieza sea gratis: no se toca
        // la geometría, simplemente sus píxeles no se pintan.
        if (vVisible < 0.5) discard;
        // La opacidad propia de la pieza (D-134): se tiran píxeles en
        // proporción, repartidos por una trama sin dibujo visible (la
        // secuencia R2), y por los huecos se ve lo de detrás. Un músculo al
        // 30 % sobre su hueso es la lámina clásica de un atlas, y así sale sin
        // ordenar triángulos y sin una pasada más. Con los rayos X puestos no
        // se aplica: allí todo es ya translúcido de verdad (ver aplicarRayosX).
        if (rayosX < 0.5 && vAspecto.a < 0.995 &&
            fract(dot(floor(gl_FragCoord.xy), vec2(0.7548776662, 0.5698402910))) > vAspecto.a) discard;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // El color propio sustituye al del sistema; el rojo en −1 dice que no hay.
        if (vAspecto.r >= 0.0) diffuseColor.rgb = vAspecto.rgb;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.62, 0.88), vResaltada * 0.65);
        // El naranja de la selección de Blender, a propósito: quien viene de
        // allí lo lee sin que nadie se lo explique, y no se confunde con el
        // azul del resaltado, que es «por aquí pasa el ratón» y no «esto está
        // elegido».
        // Más oscuro y más cargado de lo que parece necesario: el hueso es casi
        // blanco y la luz del visor pasa de 1, así que un naranja claro al 70 %
        // salía lavado y un hueso seleccionado no se distinguía de uno sin
        // seleccionar. Sobre músculo ya se veía; sobre hueso, no.
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.38, 0.0), vSeleccionada * 0.88);`,
      )

    // Se guarda para poder mover el mando de separación sin recompilar.
    material.userData.sombreador = sombreador
  }

  return material
}

/** Cambia la separación de todas las mallas de una escena. */
export function aplicarSeparacion(escena: EscenaDelAtlas, separacion: number) {
  for (const malla of escena.mallas) {
    const material = malla.material as THREE.Material
    // Se anota en el material pase lo que pase, y solo después se intenta
    // tocar el uniforme. Antes del primer dibujado no hay sombreador —ver
    // `materialDelSistema`— y sin esta línea la llamada era un no-op callado
    // que dejaba el cuerpo cerrado para siempre.
    material.userData.separacion = separacion
    const sombreador = material.userData.sombreador
    if (sombreador?.uniforms?.separacion) sombreador.uniforms.separacion.value = separacion
  }
}

/** La opacidad de todo con los rayos X puestos: la de Blender por omisión. */
export const OPACIDAD_DE_RAYOS_X = 0.5

/**
 * Enciende o apaga la vista de rayos X (D-139): todo translúcido, como en
 * Blender, y no en damero como estaba (D-129).
 *
 * El damero era transparencia sin serlo, y no se leía como en Blender: lo de
 * detrás se veía a trozos y lo de delante seguía tapando. Ahora es mezcla de
 * verdad, al 50 % y sin escribir profundidad, que es lo que hace Blender. Lo
 * que no se hace es ordenar los 2,3 millones de triángulos de lejos a cerca:
 * three ordena las quince mallas entre sí, y dentro de cada una los triángulos
 * se mezclan en el orden en que están. Con mezcla conmutativa a opacidad fija
 * eso apenas se nota, y Blender tampoco los ordena.
 *
 * Mismo arreglo que `aplicarSeparacion` para el uniforme, y por lo mismo.
 */
export function aplicarRayosX(escena: EscenaDelAtlas, encendidos: boolean) {
  for (const malla of escena.mallas) {
    const material = malla.material as THREE.MeshStandardMaterial
    material.userData.rayosX = encendidos ? 1 : 0
    material.transparent = encendidos
    material.opacity = encendidos ? OPACIDAD_DE_RAYOS_X : 1
    material.depthWrite = !encendidos
    material.needsUpdate = true
    const sombreador = material.userData.sombreador
    if (sombreador?.uniforms?.rayosX) sombreador.uniforms.rayosX.value = material.userData.rayosX
  }
}

/**
 * Escribe el estado de una pieza.
 *
 * `direccion` es hacia dónde se aleja al separar el cuerpo; se calcula una vez
 * desde el centro de la pieza y se guarda en los tres primeros canales.
 */
export function marcarPieza(
  escena: EscenaDelAtlas,
  indice: number,
  estado: number,
  direccion?: [number, number, number],
) {
  const base = indice * CANALES
  if (direccion) {
    escena.datos[base] = direccion[0]
    escena.datos[base + 1] = direccion[1]
    escena.datos[base + 2] = direccion[2]
  }
  escena.datos[base + 3] = estado
  escena.estados.needsUpdate = true
}

/** Lo que una pieza se ha movido de su sitio anatómico. */
export interface TransformacionDePieza {
  /** Metros, en los ejes del atlas. */
  mover: [number, number, number]
  /** Cuaternión [x, y, z, w], sobre el centro de la propia pieza. */
  girar: [number, number, number, number]
}

const cuaternion = new THREE.Quaternion()
const centroGirado = new THREE.Vector3()

/**
 * Escribe la transformación de una pieza, o la devuelve a su sitio con `null`.
 *
 * La pieza gira **sobre su propio centro**, que es lo que quien la mueve espera
 * ver, pero el sombreador gira cada vértice sobre el origen del atlas, que está
 * en el suelo entre los pies. La diferencia se compone aquí, una vez por pieza,
 * en vez de en la tarjeta, una vez por vértice:
 *
 *     q·(p − c) + c + t  =  q·p + (c − q·c + t)
 *
 * de modo que a la textura de traslados va el paréntesis entero y el sombreador
 * no necesita conocer el centro.
 */
export function ponerTransformacion(
  escena: Pick<EscenaDelAtlas, 'centros' | 'giros' | 'datosDeGiros' | 'traslados' | 'datosDeTraslados'>,
  indice: number,
  transformacion: TransformacionDePieza | null,
) {
  const base = indice * CANALES
  const [qx, qy, qz, qw] = transformacion?.girar ?? [0, 0, 0, 1]
  const [tx, ty, tz] = transformacion?.mover ?? [0, 0, 0]
  const cx = escena.centros[indice * 3]
  const cy = escena.centros[indice * 3 + 1]
  const cz = escena.centros[indice * 3 + 2]

  cuaternion.set(qx, qy, qz, qw)
  centroGirado.set(cx, cy, cz).applyQuaternion(cuaternion)

  escena.datosDeGiros[base] = qx
  escena.datosDeGiros[base + 1] = qy
  escena.datosDeGiros[base + 2] = qz
  escena.datosDeGiros[base + 3] = qw
  escena.datosDeTraslados[base] = cx - centroGirado.x + tx
  escena.datosDeTraslados[base + 1] = cy - centroGirado.y + ty
  escena.datosDeTraslados[base + 2] = cz - centroGirado.z + tz
  escena.giros.needsUpdate = true
  escena.traslados.needsUpdate = true
}

/**
 * Lleva un punto del atlas a donde lo dibuja el sombreador, sin la separación.
 * Lo usan el picado y el marco, que tienen que buscar la pieza donde se ve.
 */
export function aplicarTransformacion(
  escena: Pick<EscenaDelAtlas, 'datosDeGiros' | 'datosDeTraslados'>,
  indice: number,
  punto: THREE.Vector3,
): THREE.Vector3 {
  const base = indice * CANALES
  cuaternion.set(
    escena.datosDeGiros[base],
    escena.datosDeGiros[base + 1],
    escena.datosDeGiros[base + 2],
    escena.datosDeGiros[base + 3],
  )
  punto.applyQuaternion(cuaternion)
  punto.x += escena.datosDeTraslados[base]
  punto.y += escena.datosDeTraslados[base + 1]
  punto.z += escena.datosDeTraslados[base + 2]
  return punto
}

/** Si la pieza está en su sitio: giro identidad y traslado nulo. */
export function estaEnSuSitio(
  escena: Pick<EscenaDelAtlas, 'datosDeGiros' | 'datosDeTraslados'>,
  indice: number,
): boolean {
  const base = indice * CANALES
  return (
    escena.datosDeGiros[base + 3] === 1 &&
    escena.datosDeTraslados[base] === 0 &&
    escena.datosDeTraslados[base + 1] === 0 &&
    escena.datosDeTraslados[base + 2] === 0
  )
}

/** El aspecto propio de una pieza: el color que sustituye al de su sistema y cuánto deja ver a través. */
export interface AspectoDePieza {
  /** `#rrggbb`. Ausente: el color de su sistema. */
  color?: string
  /** De 0 a 1. Ausente: maciza. */
  opacidad?: number
}

const colorAuxiliar = new THREE.Color()

/** Escribe el aspecto de una pieza, o la devuelve al de su sistema con `null`. */
export function ponerAspecto(
  escena: Pick<EscenaDelAtlas, 'aspectos' | 'datosDeAspectos'>,
  indice: number,
  aspecto: AspectoDePieza | null,
) {
  const base = indice * CANALES
  if (aspecto?.color) {
    // Convertido a lineal, que es el espacio en el que el sombreador mezcla: el
    // color del sistema también llega así, por `THREE.Color`.
    colorAuxiliar.set(aspecto.color)
    escena.datosDeAspectos[base] = colorAuxiliar.r
    escena.datosDeAspectos[base + 1] = colorAuxiliar.g
    escena.datosDeAspectos[base + 2] = colorAuxiliar.b
  } else {
    escena.datosDeAspectos[base] = -1
  }
  escena.datosDeAspectos[base + 3] = aspecto?.opacidad ?? 1
  escena.aspectos.needsUpdate = true
}
