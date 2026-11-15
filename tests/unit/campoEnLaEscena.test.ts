import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { crearElCampo, type CampoEnLaEscena } from '@/components/simulador/campoEnLaEscena'
import { PANO_POR_OMISION, distanciaALaVentana, type PanoDelCaso } from '@/lib/campoQuirurgico'

/**
 * El campo quirúrgico en la escena (P-014), con los archivos que de verdad viajan.
 *
 * `campoQuirurgico.test.ts` prueba la aritmética con telas y relieves de juguete. Aquí se monta el campo entero
 * —sin tarjeta gráfica: three arma geometrías igual en node— leyendo `public/pabellon/` del disco, que es lo que
 * el navegador pide. Es la única prueba que se entera si `scripts/pabellon/generar.py` cambia un nombre del
 * manifiesto, el tamaño del relieve o el nombre de una malla: en el navegador eso no da error, da un caso sin
 * colchón y un aviso que nadie lee.
 *
 * Sin texturas ni sombras, como con la calidad rebajada: cargar una imagen sí necesita un navegador.
 */

const PUBLICO = resolve(process.cwd(), 'public')
/** De la dirección que pide el campo —con el prefijo de la plataforma, si lo hay— al archivo del disco. */
const delDisco = (direccion: string): Buffer => readFileSync(resolve(PUBLICO, direccion.slice(direccion.indexOf('/pabellon/') + 1)))
const comoArreglo = (bytes: Buffer): ArrayBuffer => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer

/** El cargador del lienzo, que aquí lee del disco. Lleva la cuenta de lo pedido. */
const cargadorDelDisco = (pedidos: string[], roto?: RegExp) =>
  ({
    loadAsync: async (direccion: string) => {
      pedidos.push(direccion)
      if (roto?.test(direccion)) throw new Error(`${direccion} no llegó`)
      return new GLTFLoader().parseAsync(comoArreglo(delDisco(direccion)), '')
    },
  }) as unknown as GLTFLoader

// La tibia derecha del atlas, que es lo que se recorta en el caso de prueba: su caja en el cuerpo.
const catalogo = JSON.parse(readFileSync(resolve(PUBLICO, 'atlas/catalogo.json'), 'utf8')) as { piezas: { nombre: string; caja: [[number, number, number], [number, number, number]] }[] }
const tibia = catalogo.piezas.find((p) => p.nombre === 'Right tibia')!
const enElCuerpo = new THREE.Box3(new THREE.Vector3(...tibia.caja[0]), new THREE.Vector3(...tibia.caja[1]))
// El lienzo centra el modelo: el cuerpo queda corrido lo que haga falta para que la tibia caiga en el origen.
const delCuerpoALaEscena = enElCuerpo.getCenter(new THREE.Vector3()).negate()
const cajaEnLaEscena = enElCuerpo.clone().translate(delCuerpoALaEscena)

interface Montaje {
  escena: THREE.Scene
  campo: CampoEnLaEscena
  pedidos: string[]
  fallos: string[]
  dibujos: { cuenta: number }
}

const montar = (roto?: RegExp): Montaje => {
  const escena = new THREE.Scene()
  const pedidos: string[] = []
  const fallos: string[] = []
  const dibujos = { cuenta: 0 }
  const campo = crearElCampo({
    escena,
    cargador: cargadorDelDisco(pedidos, roto),
    conTexturas: false,
    sombras: false,
    anisotropia: 1,
    pedirDibujo: () => {
      dibujos.cuenta++
    },
    alFallar: (motivo) => fallos.push(motivo),
  })
  return { escena, campo, pedidos, fallos, dibujos }
}

const acostar = (campo: CampoEnLaEscena, pano: PanoDelCaso = PANO_POR_OMISION, decubito: 'supino' | 'prono' = 'supino') =>
  campo.acostar({ delCuerpoALaEscena, caja: cajaEnLaEscena, decubito, pano })

const mallaDelPano = (campo: CampoEnLaEscena, decubito = 'supino') => campo.grupo.getObjectByName(`pano-${decubito}`) as THREE.Mesh

/** Un rayo que baja a plomo sobre un punto del cuerpo, desde medio metro por encima (o por debajo). */
const rayoSobre = (x: number, y: number, desdeArriba = true) => {
  const origen = new THREE.Vector3(x, y, desdeArriba ? 0.5 : -0.5).add(delCuerpoALaEscena)
  return new THREE.Ray(origen, new THREE.Vector3(0, 0, desdeArriba ? -1 : 1))
}
/** La distancia de ese rayo a un punto que está a la altura `z` del cuerpo. */
const hasta = (z: number, desdeArriba = true) => (desdeArriba ? 0.5 - z : z + 0.5)

describe('el campo quirúrgico en la escena', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', async (direccion: string) => {
      try {
        return new Response(new Uint8Array(delDisco(direccion)))
      } catch {
        return new Response('no está', { status: 404 })
      }
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('nace vacío y fuera de la vista: no pide nada hasta que hay a quién acostar', () => {
    const { campo, pedidos, escena } = montar()
    expect(campo.grupo.visible).toBe(false)
    expect(campo.grupo.parent).toBe(escena)
    expect(pedidos).toEqual([])
    expect(campo.decubito()).toBeNull()
    expect(campo.zona()).toBeNull()
    expect(campo.queTapa(rayoSobre(0, 0.3), 0.4)).toBeNull()
    campo.liberar()
  })

  it('acuesta al paciente con lo que hay en public/pabellon: el manifiesto, el colchón y el decúbito pedido', async () => {
    const { campo, pedidos, fallos } = montar()
    expect(await acostar(campo)).toBe(true)
    expect(fallos).toEqual([])
    expect(campo.grupo.visible).toBe(true)
    expect(campo.decubito()).toBe('supino')
    // Solo el decúbito que se mira: el otro son casi cuatro megabytes que quizá no hagan falta nunca.
    expect(pedidos.map((p) => p.slice(p.lastIndexOf('/') + 1))).toEqual(['colchon.glb', 'campo-supino.glb'])
    // El grupo va corrido lo mismo que el modelo, sin girar: del cuerpo a la escena solo hay ese corrimiento.
    expect(campo.grupo.position.equals(delCuerpoALaEscena)).toBe(true)
    expect(campo.grupo.quaternion.equals(new THREE.Quaternion())).toBe(true)
    for (const nombre of ['colchon', 'sabana-supino', 'pano-supino']) expect(campo.grupo.getObjectByName(nombre)?.visible, nombre).toBe(true)
    campo.liberar()
  })

  it('la ventana automática deja la tibia a la vista y no deja tela dentro', async () => {
    const { campo } = montar()
    await acostar(campo)
    const zona = campo.zona()!
    expect(zona).toEqual(campo.zonaAutomatica())
    // Contiene la caja de lo recortado…
    expect(zona.xMin).toBeLessThanOrEqual(enElCuerpo.min.x + 1e-9)
    expect(zona.xMax).toBeGreaterThanOrEqual(enElCuerpo.max.x - 1e-9)
    expect(zona.yMin).toBeLessThanOrEqual(enElCuerpo.min.y + 1e-9)
    expect(zona.yMax).toBeGreaterThanOrEqual(enElCuerpo.max.y - 1e-9)
    // …sin abrirse más que unos centímetros: no es el cuerpo entero destapado.
    expect(zona.xMax - zona.xMin).toBeLessThan(enElCuerpo.max.x - enElCuerpo.min.x + 0.1)
    expect(zona.yMax - zona.yMin).toBeLessThan(enElCuerpo.max.y - enElCuerpo.min.y + 0.1)

    const geometria = mallaDelPano(campo).geometry
    const posicion = geometria.getAttribute('position')
    const indice = geometria.getIndex()!
    expect(indice.count).toBeGreaterThan(30000)
    let dentro = 0
    for (let t = 0; t < indice.count; t += 3) {
      let x = 0
      let y = 0
      for (let k = 0; k < 3; k++) {
        x += posicion.getX(indice.getX(t + k)) / 3
        y += posicion.getY(indice.getX(t + k)) / 3
      }
      if (distanciaALaVentana(zona, x, y) < -0.0005) dentro++
    }
    expect(dentro).toBe(0)
    campo.liberar()
  })

  it('lo que asoma por la ventana se toca, lo que tapa el paño no, y por debajo estorba el colchón', async () => {
    const { campo } = montar()
    await acostar(campo)
    const zona = campo.zona()!
    const cx = (zona.xMin + zona.xMax) / 2
    const cy = (zona.yMin + zona.yMax) / 2
    const z = (enElCuerpo.min.z + enElCuerpo.max.z) / 2
    expect(campo.queTapa(rayoSobre(cx, cy), hasta(z))).toBeNull()
    // Diez centímetros más arriba de la ventana, sobre la misma pierna: el muslo, bajo la tela.
    expect(campo.queTapa(rayoSobre(cx, zona.yMax + 0.1), hasta(z))).toBe('pano')
    // Desde debajo de la camilla, el mismo punto del centro queda contra el colchón.
    expect(campo.queTapa(rayoSobre(cx, cy, false), hasta(z, false))).toBe('colchon')
    campo.liberar()
  })

  it('con el paño quitado en «Capas» ya no tapa, pero el colchón sigue ahí', async () => {
    const { campo } = montar()
    await acostar(campo)
    const zona = campo.zona()!
    const cx = (zona.xMin + zona.xMax) / 2
    const z = (enElCuerpo.min.z + enElCuerpo.max.z) / 2
    campo.mostrarElPano(false)
    expect(campo.elPanoSeVe()).toBe(false)
    expect(mallaDelPano(campo).visible).toBe(false)
    expect(campo.grupo.getObjectByName('sabana-supino')?.visible).toBe(true)
    expect(campo.queTapa(rayoSobre(cx, zona.yMax + 0.1), hasta(z))).toBeNull()
    expect(campo.queTapa(rayoSobre(cx, zona.yMax + 0.1, false), hasta(z, false))).toBe('colchon')
    campo.mostrarElPano(true)
    expect(campo.elPanoSeVe()).toBe(true)
    expect(campo.queTapa(rayoSobre(cx, zona.yMax + 0.1), hasta(z))).toBe('pano')
    campo.liberar()
  })

  it('el paño del caso manda: otra zona recorta otra ventana, y otro color tiñe la tela y la sábana', async () => {
    const { campo } = montar()
    await acostar(campo)
    const automatica = campo.zona()!
    const antes = mallaDelPano(campo).geometry
    const azul = (mallaDelPano(campo).material as THREE.MeshPhysicalMaterial).color.clone()
    const zona = { xMin: automatica.xMin, xMax: automatica.xMax, yMin: automatica.yMin + 0.1, yMax: automatica.yMax - 0.1 }
    campo.ponerElPano({ apagado: false, color: 'verde', zona })
    expect(campo.zona()).toEqual(zona)
    // La automática no cambia por lo que el médico haya movido: es a la que vuelve el editor.
    expect(campo.zonaAutomatica()).toEqual(automatica)
    expect(mallaDelPano(campo).geometry).not.toBe(antes)
    const verde = (mallaDelPano(campo).material as THREE.MeshPhysicalMaterial).color
    expect(verde.equals(azul)).toBe(false)
    expect(verde.g).toBeGreaterThan(verde.b)
    // Lo que antes asomaba por el extremo de la ventana ahora queda tapado.
    const z = (enElCuerpo.min.z + enElCuerpo.max.z) / 2
    expect(campo.queTapa(rayoSobre((zona.xMin + zona.xMax) / 2, automatica.yMin + 0.04), hasta(z))).toBe('pano')

    // Solo el color: la tela no se vuelve a cortar.
    const cortada = mallaDelPano(campo).geometry
    campo.ponerElPano({ apagado: false, color: 'celeste', zona })
    expect(mallaDelPano(campo).geometry).toBe(cortada)
    campo.liberar()
  })

  it('el marco del editor se posa sobre la tela ceñida, un poco por encima', async () => {
    const { campo } = montar()
    await acostar(campo)
    const zona = campo.zona()!
    const limites = campo.limites()!
    expect(limites.nx * limites.ny).toBeGreaterThan(1000)
    // Un punto del borde de la ventana, junto a la pierna: ahí la tela baja hasta la sábana.
    const punto = campo.sobreElLecho(zona.xMax, (zona.yMin + zona.yMax) / 2)!
    const enElCuerpoZ = punto.z - delCuerpoALaEscena.z
    // Por encima del plano del colchón y por debajo de lo más alto de la tibia: sobre la sábana, no en el aire.
    expect(campo.alturaSobreElColchon(punto)!).toBeGreaterThan(-0.03)
    expect(enElCuerpoZ).toBeLessThan(enElCuerpo.max.z + 0.05)
    // Y fuera del relieve no inventa una altura imposible.
    expect(Number.isFinite(campo.sobreElLecho(5, 5)!.z)).toBe(true)
    campo.liberar()
  })

  it('se retira sin soltar lo traído: volver a acostar no lo pide otra vez', async () => {
    const { campo, pedidos } = montar()
    await acostar(campo)
    const cuantos = pedidos.length
    campo.retirar()
    expect(campo.grupo.visible).toBe(false)
    expect(campo.decubito()).toBeNull()
    expect(campo.queTapa(rayoSobre(0, 2), 0.4)).toBeNull()
    expect(await acostar(campo)).toBe(true)
    expect(pedidos.length).toBe(cuantos)
    campo.liberar()
  })

  it('darle la vuelta: mientras rueda no se toca nada ni se ve el paño, y acaba boca abajo con todo en su sitio', async () => {
    const { campo, pedidos } = montar()
    await acostar(campo)
    const arribaAntes = campo.arriba()!.clone()
    expect(arribaAntes.z).toBeGreaterThan(0.99)
    expect(await campo.preparar('prono')).toBe(true)
    expect(pedidos.some((p) => p.endsWith('campo-prono.glb'))).toBe(true)

    const pivote = new THREE.Vector3(0, 0, 0)
    const eje = new THREE.Vector3(0, 1, 0)
    campo.enLaVuelta(0.5, 'prono', pivote, eje, 0.08, 1)
    expect(campo.queTapa(rayoSobre(0, 0.3), 0.4)).toBe('vuelta')
    expect(campo.elPanoSeVe()).toBe(false)
    expect(mallaDelPano(campo).visible).toBe(false)
    expect(mallaDelPano(campo, 'prono').visible).toBe(false)
    // A media vuelta el colchón está de canto: su «arriba» ya no es ni el de antes ni el contrario.
    expect(Math.abs(campo.arriba()!.z)).toBeLessThan(0.2)

    campo.ponerElDecubito('prono')
    expect(campo.decubito()).toBe('prono')
    expect(campo.arriba()!.z).toBeLessThan(-0.99)
    // La cabeza sigue hacia +Y: se le dio la vuelta sobre su eje largo, no de la cabeza a los pies.
    expect(campo.cabeza()!.y).toBeGreaterThan(0.99)
    expect(campo.elPanoSeVe()).toBe(true)
    expect(mallaDelPano(campo, 'prono').visible).toBe(true)
    expect(mallaDelPano(campo).visible).toBe(false)
    expect(campo.grupo.getObjectByName('sabana-prono')?.visible).toBe(true)
    expect(campo.grupo.getObjectByName('sabana-supino')?.visible).toBe(false)
    // Boca abajo «desde arriba» es desde −Z: por ahí se ve la ventana, y por +Z estorba el colchón.
    const zona = campo.zona()!
    const cx = (zona.xMin + zona.xMax) / 2
    const cy = (zona.yMin + zona.yMax) / 2
    const z = (enElCuerpo.min.z + enElCuerpo.max.z) / 2
    expect(campo.queTapa(rayoSobre(cx, cy, false), hasta(z, false))).toBeNull()
    expect(campo.queTapa(rayoSobre(cx, cy), hasta(z))).toBe('colchon')
    campo.liberar()
  })

  it('la piel que se abulta junto al borde levanta el paño; la que se abulta dentro de la ventana no lo rehace', async () => {
    const { campo } = montar()
    await acostar(campo)
    const zona = campo.zona()!
    const cx = (zona.xMin + zona.xMax) / 2
    const cy = (zona.yMin + zona.yMax) / 2

    /** Un parche de piel de 4 × 4 cm a esa altura del cuerpo, ya en la escena. */
    const parche = (x: number, y: number, z: number) => {
      const geometria = new THREE.PlaneGeometry(0.04, 0.04, 4, 4)
      const malla = new THREE.Mesh(geometria)
      malla.position.set(x, y, z).add(delCuerpoALaEscena)
      malla.updateMatrixWorld(true)
      return malla
    }
    const esperar = () => new Promise((listo) => setTimeout(listo, 200))

    // Dentro de la ventana no hay tela que levantar: el paño que hay puesto es el mismo objeto.
    const antes = mallaDelPano(campo).geometry
    const dentro = parche(cx, cy, enElCuerpo.max.z + 0.05)
    campo.seguirLaPiel([dentro], new THREE.Box3().setFromObject(dentro))
    await esperar()
    expect(mallaDelPano(campo).geometry).toBe(antes)

    // Bajo la tela, cinco centímetros pasado el borde y muy por encima de la pierna del atlas: el paño se rehace
    // y pasa por encima.
    const y = zona.yMax + 0.05
    const alto = enElCuerpo.max.z + 0.12
    const fuera = parche(cx, y, alto)
    campo.seguirLaPiel([fuera], new THREE.Box3().setFromObject(fuera))
    await esperar()
    const despues = mallaDelPano(campo).geometry
    expect(despues).not.toBe(antes)
    const posicion = despues.getAttribute('position')
    let masBaja = Infinity
    for (let i = 0; i < posicion.count; i++) {
      if (Math.abs(posicion.getX(i) - cx) < 0.012 && Math.abs(posicion.getY(i) - y) < 0.012) masBaja = Math.min(masBaja, posicion.getZ(i))
    }
    // Que haya tela ahí que mirar: sin esto, un paño que no llegara al parche pasaría la prueba sin probar nada.
    expect(Number.isFinite(masBaja)).toBe(true)
    expect(masBaja).toBeGreaterThanOrEqual(alto)

    // Y cuando el bulto se va, el paño vuelve a su sitio.
    campo.seguirLaPiel([fuera], null)
    await esperar()
    const vuelto = mallaDelPano(campo).geometry.getAttribute('position')
    let masAlta = -Infinity
    for (let i = 0; i < vuelto.count; i++) {
      if (Math.abs(vuelto.getX(i) - cx) < 0.012 && Math.abs(vuelto.getY(i) - y) < 0.012) masAlta = Math.max(masAlta, vuelto.getZ(i))
    }
    expect(Number.isFinite(masAlta)).toBe(true)
    expect(masAlta).toBeLessThan(alto)
    campo.liberar()
  })

  it('si un archivo no llega, el caso sigue sin campo y se dice', async () => {
    const { campo, fallos } = montar(/campo-supino/)
    expect(await acostar(campo)).toBe(false)
    expect(fallos).toHaveLength(1)
    expect(fallos[0]).toContain('campo-supino')
    expect(campo.grupo.visible).toBe(false)
    expect(campo.decubito()).toBeNull()
    campo.liberar()
  })

  it('un manifiesto que no se entiende tampoco monta nada', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ colchon: { modelo: 'colchon.glb' } })))
    const { campo, fallos, pedidos } = montar()
    expect(await acostar(campo)).toBe(false)
    expect(fallos[0]).toMatch(/manifiesto/)
    expect(pedidos).toEqual([])
    campo.liberar()
  })

  it('al soltarlo sale de la escena, y lo que llegue después no lo resucita', async () => {
    const { campo, escena } = montar()
    const pendiente = acostar(campo)
    campo.liberar()
    expect(campo.grupo.parent).toBeNull()
    expect(escena.children).toHaveLength(0)
    expect(await pendiente).toBe(false)
    expect(campo.grupo.visible).toBe(false)
  })
})
