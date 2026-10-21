import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  ACCIONES_DE_LA_PLACA,
  ACCIONES_DE_MOVIMIENTO,
  GRADOS_POR_PIXEL,
  PASO_BASE,
  PASO_FINO,
  PASO_GRANDE,
  ajusteDeLaPlacaPorPaso,
  cifraConSigno,
  definicionDeLaAccion,
  ejeFisicoDelMovimiento,
  ejeValidoPara,
  gradosDelArrastre,
  letraDelEje,
  lecturaDelMovimiento,
  pasoDeLaTecla,
  sentidoDeLaTecla,
  vectorDelEje,
} from '@/lib/movimientoPorEjes'
import { moverPiezaPorEje } from '@/components/simulador/asasDelHueso'
import { medirReduccion, desplazamientoDesde } from '@/lib/reduccion'
import { puntosDelPaso } from '@/lib/simulador'
import { recorridoGuardado } from '@/lib/progresoDelSimulador'
import { Actividad } from '@/collections/Actividad'

/**
 * El menú de movimiento por ejes y la reducción automática (P-004 E7, pedidos 6 y 15 de Cristóbal).
 */

describe('lo que ofrece el menú', () => {
  it('Trasladar con tres ejes, Angular con dos y Rotar sin elegir: lo del documento, en ese orden', () => {
    expect(ACCIONES_DE_MOVIMIENTO.map((a) => a.accion)).toEqual(['trasladar', 'angular', 'rotar'])
    expect(definicionDeLaAccion('trasladar').ejes.map((e) => e.eje)).toEqual(['coronal', 'axial', 'sagital'])
    expect(definicionDeLaAccion('angular').ejes.map((e) => e.eje)).toEqual(['coronal', 'sagital'])
    expect(definicionDeLaAccion('rotar').ejes).toHaveLength(1)
  })

  it('angular no ofrece el eje axial: eso es rotar', () => {
    expect(ejeValidoPara('angular', 'axial')).toBe(false)
    expect(ejeValidoPara('angular', 'coronal')).toBe(true)
    expect(ejeValidoPara('rotar', 'axial')).toBe(true)
    expect(ejeValidoPara('trasladar', 'sagital')).toBe(true)
  })

  it('trasladar va a lo largo del eje; angular, alrededor del perpendicular; rotar, sobre el hueso', () => {
    expect(ejeFisicoDelMovimiento('trasladar', 'axial')).toBe('axial')
    expect(ejeFisicoDelMovimiento('trasladar', 'coronal')).toBe('coronal')
    // Varo/valgo se ve de frente y es un giro alrededor del eje de delante atrás.
    expect(ejeFisicoDelMovimiento('angular', 'coronal')).toBe('sagital')
    // Antecurvatum/recurvatum se ve de perfil y es un giro alrededor del eje de lado a lado.
    expect(ejeFisicoDelMovimiento('angular', 'sagital')).toBe('coronal')
    expect(ejeFisicoDelMovimiento('rotar', 'axial')).toBe('axial')
  })

  it('los ejes del paciente son los del archivo: con el hueso en Y, axial es Y, sagital es Z y coronal es X', () => {
    expect(vectorDelEje('axial', 'y')).toEqual([0, 1, 0])
    expect(vectorDelEje('sagital', 'y')).toEqual([0, 0, 1])
    expect(vectorDelEje('coronal', 'y')).toEqual([1, 0, 0])
    expect(letraDelEje('axial', 'y')).toBe('y')
    expect(letraDelEje('axial', 'x')).toBe('x')
    expect(letraDelEje('sagital', 'z')).toBe('y')
  })

  it('para la placa: trasladar a lo largo y alrededor, y angular; sin inclinar ni rotar en los planos', () => {
    expect(ACCIONES_DE_LA_PLACA.map((a) => a.accion)).toEqual(['trasladar', 'rotar'])
    expect(ACCIONES_DE_LA_PLACA[0].ejes.map((e) => e.eje)).toEqual(['axial', 'sagital'])
  })
})

describe('el teclado', () => {
  it('1 mm o 1° por pulsación, 0,2 con Mayúsculas y 5 con Ctrl; Mayúsculas gana', () => {
    expect(pasoDeLaTecla({})).toBe(PASO_BASE)
    expect(pasoDeLaTecla({ shift: true })).toBe(PASO_FINO)
    expect(pasoDeLaTecla({ ctrl: true })).toBe(PASO_GRANDE)
    expect(pasoDeLaTecla({ meta: true })).toBe(PASO_GRANDE)
    expect(pasoDeLaTecla({ shift: true, ctrl: true })).toBe(PASO_FINO)
    expect([PASO_BASE, PASO_FINO, PASO_GRANDE]).toEqual([1, 0.2, 5])
  })

  it('derecha y arriba suman; izquierda y abajo restan; lo demás no dice nada', () => {
    expect(sentidoDeLaTecla('ArrowRight')).toBe(1)
    expect(sentidoDeLaTecla('ArrowUp')).toBe(1)
    expect(sentidoDeLaTecla('ArrowLeft')).toBe(-1)
    expect(sentidoDeLaTecla('ArrowDown')).toBe(-1)
    expect(sentidoDeLaTecla('a')).toBe(0)
    expect(sentidoDeLaTecla('Enter')).toBe(0)
  })

  it('un arrastre horizontal gira 0,4° por píxel, y con Mayúsculas la quinta parte', () => {
    expect(gradosDelArrastre(100)).toBeCloseTo(100 * GRADOS_POR_PIXEL, 9)
    expect(gradosDelArrastre(100, true)).toBeCloseTo(100 * GRADOS_POR_PIXEL * 0.2, 9)
    expect(gradosDelArrastre(-50)).toBeCloseTo(-20, 9)
  })
})

describe('la lectura', () => {
  it('«Trasladar · axial · +3,0 mm» y el signo menos de verdad', () => {
    expect(lecturaDelMovimiento('trasladar', 'axial', 3)).toBe('Trasladar · axial · +3,0 mm')
    expect(lecturaDelMovimiento('trasladar', 'coronal', -0.2)).toBe('Trasladar · coronal · −0,2 mm')
    expect(lecturaDelMovimiento('angular', 'sagital', 5)).toBe('Angular · sagital · +5,0 °')
    expect(lecturaDelMovimiento('rotar', 'axial', -1)).toBe('Rotar · sobre el hueso · −1,0 °')
  })

  it('cifraConSigno redondea al decimal y no deja un −0,0', () => {
    expect(cifraConSigno(0.04)).toBe('+0,0')
    expect(cifraConSigno(-0.04)).toBe('+0,0')
    expect(cifraConSigno(1.96)).toBe('+2,0')
  })
})

describe('mover una pieza por un eje de verdad', () => {
  /** Un trozo de «hueso» colgando de un padre que también está movido y escalado, con el eje largo en Y. */
  function trozo() {
    const padre = new THREE.Group()
    padre.position.set(5, -2, 3)
    padre.rotation.set(0, 0, 0)
    const pieza = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.02), new THREE.MeshStandardMaterial())
    pieza.position.set(0.01, 0.2, 0)
    padre.add(pieza)
    padre.updateMatrixWorld(true)
    return { padre, pieza }
  }
  const UNIDADES_POR_MM = 0.001 // 1 unidad = 1 m

  it('3 mm hacia proximal con la flecha son 3 mm de diástasis (a lo largo del hueso), y 3 mm coronales, 3 de desplazamiento', () => {
    const { pieza } = trozo()
    const origen = pieza.position.clone()
    moverPiezaPorEje(pieza, 'trasladar', 'axial', 3, 'y', UNIDADES_POR_MM)
    const d = desplazamientoDesde(origen, pieza.position)
    expect(d.y).toBeCloseTo(0.003, 9)
    expect(d.x).toBeCloseTo(0, 9)
    expect(d.z).toBeCloseTo(0, 9)
    const medida = medirReduccion({ x: d.x * 1000, y: d.y * 1000, z: d.z * 1000 }, { x: 0, y: 0, z: 0 }, 'y')
    // Lo que se corre a lo largo del hueso es la diástasis; el desplazamiento es lo lateral.
    expect(medida.diastasis).toBeCloseTo(3, 1)
    expect(medida.desplazamiento).toBeCloseTo(0, 1)

    const otra = trozo().pieza
    const origenOtra = otra.position.clone()
    moverPiezaPorEje(otra, 'trasladar', 'coronal', 3, 'y', UNIDADES_POR_MM)
    const e = desplazamientoDesde(origenOtra, otra.position)
    const lateral = medirReduccion({ x: e.x * 1000, y: e.y * 1000, z: e.z * 1000 }, { x: 0, y: 0, z: 0 }, 'y')
    expect(lateral.desplazamiento).toBeCloseTo(3, 1)
    expect(lateral.diastasis).toBeCloseTo(0, 1)
  })

  it('el signo negativo lleva hacia distal, y ida y vuelta devuelve la pieza a su sitio', () => {
    const { pieza } = trozo()
    const origen = pieza.position.clone()
    moverPiezaPorEje(pieza, 'trasladar', 'axial', -7.5, 'y', UNIDADES_POR_MM)
    expect(pieza.position.y - origen.y).toBeCloseTo(-0.0075, 9)
    moverPiezaPorEje(pieza, 'trasladar', 'axial', 7.5, 'y', UNIDADES_POR_MM)
    expect(pieza.position.distanceTo(origen)).toBeLessThan(1e-9)
  })

  it('sagital y coronal van por Z y por X con el hueso en Y', () => {
    const { pieza } = trozo()
    const origen = pieza.position.clone()
    moverPiezaPorEje(pieza, 'trasladar', 'sagital', 4, 'y', UNIDADES_POR_MM)
    expect(pieza.position.z - origen.z).toBeCloseTo(0.004, 9)
    moverPiezaPorEje(pieza, 'trasladar', 'coronal', -2, 'y', UNIDADES_POR_MM)
    expect(pieza.position.x - origen.x).toBeCloseTo(-0.002, 9)
  })

  it('con el padre girado, el eje sigue siendo el del mundo y no el del padre', () => {
    const { padre, pieza } = trozo()
    padre.rotation.set(0, 0, Math.PI / 2)
    padre.updateMatrixWorld(true)
    const antes = pieza.getWorldPosition(new THREE.Vector3())
    moverPiezaPorEje(pieza, 'trasladar', 'axial', 10, 'y', UNIDADES_POR_MM)
    const despues = pieza.getWorldPosition(new THREE.Vector3())
    const mundo = despues.clone().sub(antes)
    expect(mundo.y).toBeCloseTo(0.01, 9)
    expect(mundo.x).toBeCloseTo(0, 9)
  })

  it('angular sagital 5° gira alrededor del eje de lado a lado y mantiene el centro en su sitio', () => {
    const { pieza } = trozo()
    const centro = pieza.getWorldPosition(new THREE.Vector3())
    moverPiezaPorEje(pieza, 'angular', 'sagital', 5, 'y', UNIDADES_POR_MM)
    // Alrededor de X: el eje largo de la pieza (Y) se inclina hacia Z y no hacia X.
    const arriba = new THREE.Vector3(0, 1, 0).applyQuaternion(pieza.quaternion)
    expect(Math.abs(arriba.x)).toBeLessThan(1e-9)
    expect(Math.abs(arriba.z)).toBeCloseTo(Math.sin((5 * Math.PI) / 180), 6)
    expect(pieza.getWorldPosition(new THREE.Vector3()).distanceTo(centro)).toBeLessThan(1e-9)
  })

  it('angular coronal gira alrededor del eje de delante atrás; rotar, sobre el hueso', () => {
    const a = trozo().pieza
    moverPiezaPorEje(a, 'angular', 'coronal', 5, 'y', UNIDADES_POR_MM)
    const arribaA = new THREE.Vector3(0, 1, 0).applyQuaternion(a.quaternion)
    expect(Math.abs(arribaA.z)).toBeLessThan(1e-9)
    expect(Math.abs(arribaA.x)).toBeCloseTo(Math.sin((5 * Math.PI) / 180), 6)

    const b = trozo().pieza
    moverPiezaPorEje(b, 'rotar', 'axial', 30, 'y', UNIDADES_POR_MM)
    // Girar sobre el propio eje largo no mueve el eje largo.
    const arribaB = new THREE.Vector3(0, 1, 0).applyQuaternion(b.quaternion)
    expect(arribaB.distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-9)
    expect(b.quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo((30 * Math.PI) / 180, 6)
  })

  it('con el hueso en otro eje, el axial sigue al hueso', () => {
    const { pieza } = trozo()
    const origen = pieza.position.clone()
    moverPiezaPorEje(pieza, 'trasladar', 'axial', 6, 'z', UNIDADES_POR_MM)
    expect(pieza.position.z - origen.z).toBeCloseTo(0.006, 9)
  })
})

describe('el menú de la placa', () => {
  const base = { largoMm: 10, ladoMm: 2, giroGrados: 5 }

  it('a lo largo suma al largo; alrededor, al lado; angular, al giro', () => {
    expect(ajusteDeLaPlacaPorPaso(base, 'trasladar', 'axial', 1, 1)).toEqual({ largoMm: 11, ladoMm: 2, giroGrados: 5 })
    expect(ajusteDeLaPlacaPorPaso(base, 'trasladar', 'sagital', 1, 1)).toEqual({ largoMm: 10, ladoMm: 3, giroGrados: 5 })
    expect(ajusteDeLaPlacaPorPaso(base, 'rotar', 'axial', -1, 1)).toEqual({ largoMm: 10, ladoMm: 2, giroGrados: 4 })
  })

  it('la flecha hacia anterior es el signo + del ajuste solo si el + lleva hacia anterior', () => {
    expect(ajusteDeLaPlacaPorPaso(base, 'trasladar', 'sagital', 1, 1)?.ladoMm).toBe(3)
    expect(ajusteDeLaPlacaPorPaso(base, 'trasladar', 'sagital', 1, -1)?.ladoMm).toBe(1)
    // Sin saber el sentido, el signo es el de la flecha.
    expect(ajusteDeLaPlacaPorPaso(base, 'trasladar', 'sagital', 1, 0)?.ladoMm).toBe(3)
  })

  it('los pasos finos no dejan restos de coma flotante', () => {
    let ajuste = { largoMm: 0, ladoMm: 0, giroGrados: 0 }
    for (let i = 0; i < 10; i++) ajuste = ajusteDeLaPlacaPorPaso(ajuste, 'trasladar', 'axial', 0.2, 1) as typeof ajuste
    expect(ajuste.largoMm).toBe(2)
  })

  it('un movimiento que no es de la placa no hace nada', () => {
    expect(ajusteDeLaPlacaPorPaso(base, 'angular', 'coronal', 1, 1)).toBeNull()
    expect(ajusteDeLaPlacaPorPaso(base, 'trasladar', 'coronal', 1, 1)).toBeNull()
  })
})

describe('la reducción automática', () => {
  const paso = (objetivo: 'reduccion' | 'trazo') =>
    ({
      id: 'p',
      titulo: 'Paso',
      objetivo,
      puntos: 10,
      tolerancias: objetivo === 'trazo' ? { largoMin: 20, largoMax: 40 } : { desplazamientoMax: 2, angulacionMax: 5, diastasisMax: 2 },
    }) as never

  it('en un paso de reducción no puntúa, y en cualquier otro no cambia nada', () => {
    expect(puntosDelPaso(paso('reduccion'), { fallo: false, complicacion: false })).toBe(10)
    expect(puntosDelPaso(paso('reduccion'), { fallo: false, complicacion: false, reduccionAutomatica: true })).toBe(0)
    expect(puntosDelPaso(paso('trazo'), { fallo: false, complicacion: false, reduccionAutomatica: true })).toBe(10)
  })

  it('una reducción a mano sigue puntuando, también con un fallo antes', () => {
    expect(puntosDelPaso(paso('reduccion'), { fallo: true, complicacion: false, reduccionAutomatica: false })).toBe(5)
  })

  it('el recorrido guardado trae la marca, y los de antes de este cambio la traen en falso', () => {
    expect(recorridoGuardado({ puntaje: 5, puntajeMaximo: 10, reduccionAutomatica: true })?.reduccionAutomatica).toBe(true)
    expect(recorridoGuardado({ puntaje: 5, puntajeMaximo: 10 })?.reduccionAutomatica).toBe(false)
    expect(recorridoGuardado({ puntaje: 5, puntajeMaximo: 10, reduccionAutomatica: 'sí' })?.reduccionAutomatica).toBe(false)
  })

  it('la fila de actividad tiene su casilla, en falso por omisión, y la migración la crea', () => {
    const campo = Actividad.fields.find((f) => 'name' in f && f.name === 'reduccionAutomatica') as unknown as Record<string, unknown>
    expect(campo?.type).toBe('checkbox')
    expect(campo?.defaultValue).toBe(false)
    const carpeta = join(process.cwd(), 'src', 'migrations')
    const nombre = readdirSync(carpeta).sort().find((n) => n.endsWith('_reduccion_automatica_del_recorrido.ts'))
    expect(nombre).toBeTruthy()
    const texto = readFileSync(join(carpeta, nombre as string), 'utf8')
    expect(texto).toContain('ALTER TABLE "actividad" ADD COLUMN "reduccion_automatica" boolean DEFAULT false')
  })
})

describe('el cableado', () => {
  const fuente = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8').replace(/\r\n/g, '\n')
  const consola = fuente('src', 'components', 'simulador', 'ConsolaQuirurgica.tsx')
  const lienzo = fuente('src', 'components', 'simulador', 'LienzoQuirurgico.tsx')
  const acciones = fuente('src', 'app', '(frontend)', 'acciones', 'actividad.ts')

  it('el menú sale con un trozo suelto y con la placa puesta sin fijar, y vive en la barra de modos', () => {
    expect(consola).toContain("const menuDelTrozo = (modo === 'mover' && !moverTodoEfectivo) || modo === 'reducir'")
    expect(consola).toContain("const menuDeLaPlaca = modo === 'fijar' && !!fijacion?.placa && !fijacion.placa.fijada")
    const barra = consola.slice(consola.indexOf('<div className="consola-barra-de-modos">'), consola.indexOf('consola-lienzo-marco modo-'))
    expect(barra).toContain('<MenuDeMovimiento')
  })

  it('el lienzo dibuja una sola línea del eje y esconde las asas salvo con «Asas libres»', () => {
    expect(lienzo).toContain('manipulador.grupo.visible = hay && (u.asasLibres || !u.movimientoPorEje)')
    expect(lienzo).toContain('lineaDelEje.visible = hay && !!u.movimientoPorEje')
    expect(consola).toContain('alCambiarLasAsas={setAsasLibres}')
  })

  it('el arrastre con un eje elegido va por ese eje y no por el plano de la pantalla', () => {
    expect(lienzo).toContain("arrastreEnEje && piezaAgarrada")
    expect(lienzo).toContain('desplazamientoDelArrastre(camara, a.pivote')
  })

  it('el panel de la pinza ofrece Manual y Automática, y la automática anima 600 ms', () => {
    expect(consola).toContain('aria-label="Reducción"')
    expect(consola).toContain('onClick={reducirAutomaticamente}')
    expect(consola).toContain('const DURACION_DE_LA_REDUCCION_MS = 600')
  })

  it('el puntaje y el recorrido llevan la marca', () => {
    expect(consola).toContain('reduccionAutomatica: automaticas.has(paso.id)')
    expect(consola).toContain('reduccionAutomatica: usoLaReduccionAutomatica.current')
    expect(acciones).toContain('reduccionAutomatica: datos.reduccionAutomatica')
  })
})
