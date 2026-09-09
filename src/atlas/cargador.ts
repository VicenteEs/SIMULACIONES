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
import type { CatalogoDelAtlas, PiezaDelAtlas } from './formato'

/** Cuántos canales ocupa cada pieza en la textura de estado. */
const CANALES = 4

/**
 * Estado de una pieza, tal como lo lee el sombreador.
 *
 * Los tres primeros canales son el desplazamiento de la pieza al separar el
 * cuerpo; el cuarto codifica visibilidad y selección a la vez para no gastar
 * una segunda textura: 0 oculta, 1 visible, 2 visible y resaltada.
 */
export const ESTADO = { OCULTA: 0, VISIBLE: 1, RESALTADA: 2 } as const

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
  liberar: () => void
}

// --------------------------------------------------------------- descarga

export async function cargarCatalogo(senal?: AbortSignal): Promise<CatalogoDelAtlas> {
  const respuesta = await fetch(ruta('/atlas/catalogo.json'), { signal: senal })
  if (!respuesta.ok) {
    throw new Error(
      `No se pudo leer el catálogo del atlas (${respuesta.status}). ` +
        'Compruebe que public/atlas/ está desplegado.',
    )
  }
  return (await respuesta.json()) as CatalogoDelAtlas
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

      const respuesta = await fetch(ruta(`/atlas/${paquete.archivo}`), { signal: senal })
      if (!respuesta.ok) {
        throw new Error(`No se pudo descargar ${paquete.archivo} (${respuesta.status}).`)
      }
      buferes.set(indice, await respuesta.arrayBuffer())
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

  // --- agrupar por sistema lo que se puede dibujar -------------------------
  const porSistema = new Map<string, { pieza: PiezaDelAtlas; indice: number }[]>()
  catalogo.piezas.forEach((pieza, indice) => {
    if (!buferes.has(pieza.paquete)) return
    if (soloEstas && !soloEstas.has(pieza.id)) return
    const lista = porSistema.get(pieza.sistema) ?? []
    lista.push({ pieza, indice })
    porSistema.set(pieza.sistema, lista)
  })

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

    const material = materialDelSistema(colores.get(sistema) ?? '#cccccc', estados, lado)
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
    liberar: () => {
      for (const cosa of aLiberar) cosa.dispose()
      estados.dispose()
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
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.72,
    metalness: 0.02,
    side: THREE.DoubleSide,
  })

  material.onBeforeCompile = (sombreador) => {
    sombreador.uniforms.estados = { value: estados }
    sombreador.uniforms.ladoEstados = { value: lado }
    sombreador.uniforms.separacion = { value: 0 }

    sombreador.vertexShader = `
      attribute float dePieza;
      uniform sampler2D estados;
      uniform float ladoEstados;
      uniform float separacion;
      varying float vVisible;
      varying float vResaltada;
    ${sombreador.vertexShader}`
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float fila = floor(dePieza / ladoEstados);
        vec2 uvEstado = vec2((mod(dePieza, ladoEstados) + 0.5) / ladoEstados,
                             (fila + 0.5) / ladoEstados);
        vec4 estado = texture2D(estados, uvEstado);
        vVisible = step(0.5, estado.a);
        vResaltada = step(1.5, estado.a);
        transformed += estado.xyz * separacion;`,
      )

    sombreador.fragmentShader = `
      varying float vVisible;
      varying float vResaltada;
    ${sombreador.fragmentShader}`
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        // Descartar es lo que hace que apagar una pieza sea gratis: no se toca
        // la geometría, simplemente sus píxeles no se pintan.
        if (vVisible < 0.5) discard;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.62, 0.88), vResaltada * 0.65);`,
      )

    // Se guarda para poder mover el mando de separación sin recompilar.
    material.userData.sombreador = sombreador
  }

  return material
}

/** Cambia la separación de todas las mallas de una escena. */
export function aplicarSeparacion(escena: EscenaDelAtlas, separacion: number) {
  for (const malla of escena.mallas) {
    const sombreador = (malla.material as THREE.Material).userData?.sombreador
    if (sombreador?.uniforms?.separacion) sombreador.uniforms.separacion.value = separacion
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
