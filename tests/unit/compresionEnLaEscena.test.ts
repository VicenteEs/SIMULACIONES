import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { RESULTADOS, evaluarGesto, instruccionDelPaso, type PasoQuirurgico } from '@/lib/simulador'
import { NOMBRE_DEL_DESENLACE } from '@/lib/progresoDelSimulador'
import { compresionAplicable, diametroDelTornilloDeLaPlaca, semilargoDelOvalDeLaPlaca, resultadoDelOval, ladoDeLaFractura } from '@/lib/compresion'
import { colocarPlaca, crearImplantes, ejeDeLaPlaca, posicionDelAgujero } from '@/components/simulador/implantesEnLaEscena'
import { moverPiezaPorEje } from '@/components/simulador/asasDelHueso'
import { desplazamientoDesde, medirReduccion } from '@/lib/reduccion'
import { Cirugias } from '@/collections/Cirugias'
import { Cirugias as CirugiasEsquema, camposDe } from '@/admin/esquema'
import { casoParaLaConsola } from '@/lib/casoQuirurgico'

/**
 * La compresión puesta en la escena y en el paso (P-004 E10). Las cuentas de las reglas están en `compresion.test.ts`; aquí, lo que las
 * conecta con la placa, con el fragmento que se desliza y con el paso que la exige.
 */

describe('el diámetro y el óvalo de una placa', () => {
  it('el diámetro sale del nombre: DCP 4,5 → 4,5; LC-DCP 3,5 → 3,5; sin número → 4,5', () => {
    expect(diametroDelTornilloDeLaPlaca('Placa DCP 4,5 mm estrecha')).toBe(4.5)
    expect(diametroDelTornilloDeLaPlaca('Placa LC-DCP 3,5 mm')).toBe(3.5)
    expect(diametroDelTornilloDeLaPlaca('Placa de lo que sea')).toBe(4.5)
    expect(diametroDelTornilloDeLaPlaca('Placa LCP 4.5/5.0')).toBe(4.5)
  })

  it('el semilargo es la mitad del doble: un óvalo de 9 mm tiene semilargo 4,5', () => {
    expect(semilargoDelOvalDeLaPlaca('Placa DCP 4,5 mm estrecha')).toBe(4.5)
    expect(semilargoDelOvalDeLaPlaca('Placa LC-DCP 3,5 mm')).toBe(3.5)
  })
})

describe('el eje de la placa, con una placa de verdad en escena', () => {
  function colocar() {
    const escena = new THREE.Scene()
    const hueso = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 200, 24, 1, false), new THREE.MeshStandardMaterial())
    escena.add(hueso)
    escena.updateMatrixWorld(true)
    const plantilla = new THREE.Group()
    plantilla.add(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.003, 0.1), new THREE.MeshStandardMaterial()))
    plantilla.scale.setScalar(1000)
    const placa = colocarPlaca({
      escena,
      plantilla,
      nombre: 'Placa DCP 4,5 mm',
      agujerosMm: [
        [0, -30],
        [0, 0],
        [0, 30],
      ],
      punto: new THREE.Vector3(0, 0, 6),
      normal: new THREE.Vector3(0, 0, 1),
      ejeDelHueso: new THREE.Vector3(0, 1, 0),
      milimetrosPorUnidad: 1,
      huesos: [hueso],
      implantes: crearImplantes(),
    })!
    return placa
  }

  it('va de un extremo al otro de los agujeros, en el sentido del eje del hueso, y es unitario', () => {
    const placa = colocar()
    const eje = ejeDeLaPlaca(placa)
    expect(eje.length()).toBeCloseTo(1, 9)
    expect(Math.abs(eje.y)).toBeCloseTo(1, 6)
    expect(Math.abs(eje.x)).toBeLessThan(1e-6)
  })

  it('con la fractura hacia un lado, los orificios del otro la tienen del lado que toca', () => {
    const placa = colocar()
    const eje = ejeDeLaPlaca(placa)
    const fractura = new THREE.Vector3(0, 50, 6)
    const lados = placa.agujerosMm.map((_, i) => ladoDeLaFractura(posicionDelAgujero(placa, i, 'abajo').dot(eje), fractura.dot(eje)))
    // La fractura está a +50 en Y, más allá de los tres orificios (−30, 0, 30): del mismo lado para todos.
    expect(new Set(lados).size).toBe(1)
    // Y el orificio más cercano a ella y el más lejano se corren en sentidos opuestos para comprimir.
    const ladoDelPrimero = lados[0]
    const desviacionLejos = -ladoDelPrimero * 3
    expect(resultadoDelOval(desviacionLejos, ladoDelPrimero, 4.5).mm).toBe(1)
    expect(resultadoDelOval(-desviacionLejos, ladoDelPrimero, 4.5).mm).toBe(0)
  })
})

describe('comprimir de verdad: el fragmento se desliza y la diástasis baja', () => {
  /** Un fragmento separado 3 mm a lo largo del hueso (Y) de su sitio reducido; 1 unidad = 1 m. */
  function fragmentoSeparado() {
    const padre = new THREE.Group()
    const fragmento = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.1, 0.02), new THREE.MeshStandardMaterial())
    fragmento.position.set(0, 0.003, 0)
    padre.add(fragmento)
    padre.updateMatrixWorld(true)
    return { fragmento, origen: new THREE.Vector3(0, 0, 0) }
  }
  const UNIDADES_POR_MM = 0.001
  const diastasis = (f: THREE.Object3D, origen: THREE.Vector3) => {
    const d = desplazamientoDesde(origen, f.position)
    return medirReduccion({ x: d.x * 1000, y: d.y * 1000, z: d.z * 1000 }, { x: 0, y: 0, z: 0 }, 'y').diastasis
  }

  it('un tornillo que comprime 1 mm baja la diástasis de 3 a 2', () => {
    const { fragmento, origen } = fragmentoSeparado()
    expect(diastasis(fragmento, origen)).toBe(3)
    const aplicable = compresionAplicable(1, 3)
    // Hacia donde estaba: el signo contrario al de la separación.
    moverPiezaPorEje(fragmento, 'trasladar', 'axial', -Math.sign(3) * aplicable, 'y', UNIDADES_POR_MM)
    expect(diastasis(fragmento, origen)).toBeCloseTo(2, 5)
  })

  it('con el fragmento separado hacia el otro lado también baja, no sube', () => {
    const { fragmento, origen } = fragmentoSeparado()
    fragmento.position.y = -0.003
    expect(diastasis(fragmento, origen)).toBe(3)
    moverPiezaPorEje(fragmento, 'trasladar', 'axial', -Math.sign(-3) * 1, 'y', UNIDADES_POR_MM)
    expect(diastasis(fragmento, origen)).toBeCloseTo(2, 5)
  })

  it('no se comprime más de lo que hay separado: con 0,4 mm de separación, baja 0,4', () => {
    const { fragmento, origen } = fragmentoSeparado()
    fragmento.position.y = 0.0004
    const aplicable = compresionAplicable(1, 0.4)
    expect(aplicable).toBeCloseTo(0.4, 9)
    moverPiezaPorEje(fragmento, 'trasladar', 'axial', -aplicable, 'y', UNIDADES_POR_MM)
    expect(diastasis(fragmento, origen)).toBeCloseTo(0, 5)
  })
})

describe('el paso que exige comprimir', () => {
  const PLACA = 'placa-dcp-4-5'
  const paso: PasoQuirurgico = { objetivo: 'fijacion', instrumento: PLACA, tornillosMinimos: 1, exigeCompresion: true, puntos: 10 }
  const fijacion = (extra: Partial<NonNullable<Parameters<typeof evaluarGesto>[1]['fijacion']>> = {}) => ({
    placa: true,
    tornillos: 1,
    bicorticales: 1,
    largos: 0,
    compresionMm: 0,
    ...extra,
  })

  it('con los tornillos bien puestos pero sin comprimir, no avanza y lo dice', () => {
    const e = evaluarGesto(paso, { instrumento: PLACA, fijacion: fijacion() })
    expect(e.resultado).toBe(RESULTADOS.SIN_COMPRESION)
    expect(e.avanza).toBe(false)
    expect(e.mensaje).toContain('excéntrico')
  })

  it('comprimiendo, sale bien', () => {
    const e = evaluarGesto(paso, { instrumento: PLACA, fijacion: fijacion({ compresionMm: 1 }) })
    expect(e.resultado).toBe(RESULTADOS.CORRECTO)
    expect(e.avanza).toBe(true)
    expect(e.puntos).toBe(10)
  })

  it('un paso que no la exige no mira la compresión', () => {
    const sinExigir: PasoQuirurgico = { objetivo: 'fijacion', instrumento: PLACA, tornillosMinimos: 1, puntos: 10 }
    expect(evaluarGesto(sinExigir, { instrumento: PLACA, fijacion: fijacion() }).resultado).toBe(RESULTADOS.CORRECTO)
  })

  it('lo demás se mira primero: un tornillo unicortical gana a la falta de compresión', () => {
    const exigeTodo: PasoQuirurgico = { ...paso, exigeBicortical: true }
    const e = evaluarGesto(exigeTodo, { instrumento: PLACA, fijacion: fijacion({ bicorticales: 0 }) })
    expect(e.resultado).toBe(RESULTADOS.TORNILLO_UNICORTICAL)
  })

  it('un tornillo de tracción sin placa se puede juzgar cuando el paso exige comprimir', () => {
    const e = evaluarGesto(paso, { instrumento: PLACA, fijacion: fijacion({ placa: false, compresionMm: 1 }) })
    expect(e.resultado).toBe(RESULTADOS.CORRECTO)
  })

  it('pero sin tornillos y sin placa, sigue pidiendo la placa', () => {
    const e = evaluarGesto(paso, { instrumento: PLACA, fijacion: fijacion({ placa: false, tornillos: 0 }) })
    expect(e.resultado).toBe(RESULTADOS.SIN_PLACA)
  })

  it('sin exigir compresión, un tornillo sin placa no vale: la regla de antes se conserva', () => {
    const sinExigir: PasoQuirurgico = { objetivo: 'fijacion', instrumento: PLACA, tornillosMinimos: 1, puntos: 10 }
    const e = evaluarGesto(sinExigir, { instrumento: PLACA, fijacion: fijacion({ placa: false }) })
    expect(e.resultado).toBe(RESULTADOS.SIN_PLACA)
  })

  it('la instrucción del paso lo dice, y el desenlace tiene su nombre', () => {
    expect(instruccionDelPaso(paso)).toContain('comprimir la fractura')
    expect(NOMBRE_DEL_DESENLACE[RESULTADOS.SIN_COMPRESION]).toBe('Sin compresión')
  })
})

describe('los campos, la migración y el cableado', () => {
  const fuente = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8').replace(/\r\n/g, '\n')
  const lienzo = fuente('src', 'components', 'simulador', 'LienzoQuirurgico.tsx')
  const consola = fuente('src', 'components', 'simulador', 'ConsolaQuirurgica.tsx')

  it('«exigeCompresion» está en el paso de la colección y en el del panel', () => {
    const pasos = Cirugias.fields.find((f) => 'name' in f && f.name === 'pasos') as unknown as { fields: { type?: string; name?: string; fields?: { name?: string; type?: string }[] }[] }
    const aplanados = pasos.fields.flatMap((f) => (f.fields ? f.fields : [f]))
    expect(aplanados.find((f) => f.name === 'exigeCompresion')?.type).toBe('checkbox')
    const enElPanel = JSON.stringify(camposDe(CirugiasEsquema))
    expect(enElPanel).toContain('exigeCompresion')
  })

  it('el caso la lleva hasta la consola', () => {
    const caso = casoParaLaConsola({ nombre: 'Caso', pasos: [{ id: 'p', objetivo: 'fijacion', instrumento: null, exigeCompresion: true }] })
    expect(caso.pasos[0].exigeCompresion).toBe(true)
  })

  it('la migración añade la columna al paso y a sus versiones, y nada más', () => {
    const carpeta = join(process.cwd(), 'src', 'migrations')
    const nombre = readdirSync(carpeta).sort().find((n) => n.endsWith('_exige_compresion_del_paso.ts'))
    expect(nombre).toBeTruthy()
    const texto = readFileSync(join(carpeta, nombre as string), 'utf8')
    expect(texto).toContain('ALTER TABLE "cirugias_pasos" ADD COLUMN "exige_compresion" boolean')
    expect(texto).toContain('ALTER TABLE "_cirugias_v_version_pasos" ADD COLUMN "exige_compresion" boolean')
    const subida = texto.slice(texto.indexOf('export async function up'), texto.indexOf('export async function down'))
    expect(subida).not.toMatch(/\b(UPDATE|DELETE|DROP)\b/)
  })

  it('el lienzo aplica lo que decide compresion.ts: el óvalo en el tornillo de placa, y las dos técnicas por la trayectoria', () => {
    expect(lienzo).toContain('resultadoDelOval(desviacion, lado, semilargoDelOvalDeLaPlaca(placa.nombre))')
    expect(lienzo).toContain("inst.tornillo?.tipo === 'rosca-parcial'")
    expect(lienzo).toContain('resultadoDeLaRoscaParcial({')
    expect(lienzo).toContain('resultadoDelDeslizamiento({ ...calibresPorFragmento(libre.perforaciones, distancia)')
    // Un tornillo bloqueado no comprime, ni en el óvalo ni por la trayectoria.
    expect(lienzo).toContain('if (!puesto.bloqueado && formaDeLosAgujeros({ nombre: placa.nombre }) !== \'redondo\')')
    expect(lienzo).toContain('inst.coloca.bloqueado ? null : distanciaALaFracturaPorLaTrayectoria(libre)')
  })

  it('la compresión mueve el fragmento hacia su sitio y no pasa de lo separado', () => {
    const f = lienzo.slice(lienzo.indexOf('const comprimirElFragmento = '), lienzo.indexOf('/** Aplica lo que decidió una de las cuentas'))
    expect(f).toContain('compresionAplicable(mm, Math.abs(alLargo))')
    expect(f).toContain("-Math.sign(alLargo) * aplicable")
    expect(f).toContain('u.alMoverFragmento?.(')
  })

  it('al devolver los trozos a su sitio o quitar la placa, lo comprimido y lo elegido se olvidan', () => {
    expect(lienzo).toContain('t.compresion = undefined')
    expect(lienzo).toContain('taller.current.desviaciones?.clear()')
  })

  it('la broca entra donde se eligió en el óvalo y lo anota', () => {
    expect(lienzo).toContain('entrada.addScaledVector(ejeDeLaPlaca(placa), desviacionMm * unidadesPorMm)')
    expect(lienzo).toContain('...(p.desviacionMm ? { desviacionMm: p.desviacionMm } : {})')
  })

  it('la consola ofrece el esquema del óvalo para elegir dónde brocar, y dice lo comprimido', () => {
    expect(consola).toContain('<PanelDeCompresion')
    expect(consola).toContain('mando.current?.fijarDesviacionDelAgujero(i, mm)')
    expect(consola).toContain('mando.current?.acercarseAlAgujero(i)')
    expect(consola).toContain('Compresión: {fijacion.compresion.mm.toFixed(1)')
  })
})
