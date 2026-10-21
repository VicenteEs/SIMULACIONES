import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { restaurarLoColocado, serializarLoColocado } from '@/components/simulador/sesionDeLoColocado'
import { cambiarLaGuia, colocarElClavo, colocarLaGuia, crearEnclavado, medirElCanal, ponerElCanal, ponerLaEntrada } from '@/components/simulador/enclavadoEnLaEscena'
import { colocarBloque, crearInjerto, depositarPunado } from '@/components/simulador/injertoEnLaEscena'
import { crearPeriostio, sembrarHuella } from '@/components/simulador/periostioEnLaEscena'
import type { Taller } from '@/components/simulador/LienzoQuirurgico'

/**
 * Lo colocado sobre el paciente sobrevive a recargar la página: se guarda en texto y se vuelve a poner en una escena nueva.
 * Aquí se prueba el viaje de ida y vuelta de lo que no necesita abrir modelos de instrumento (la placa y los tornillos esperan a sus modelos y se prueban en el navegador).
 */

const MM = 1000

/** Un hueso partido en dos trozos, uno sobre otro a lo largo de Y, con el distal como fragmento del caso. */
function escenaConHuesoPartido(): Taller {
  const escena = new THREE.Scene()
  const raiz = new THREE.Group()
  const material = new THREE.MeshBasicMaterial()
  const proximal = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.03), material)
  proximal.name = 'Tibia_fragmento_proximal'
  proximal.position.set(0, 0.1, 0)
  const distal = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.03), material)
  distal.name = 'Tibia_fragmento_distal'
  distal.position.set(0, -0.12, 0)
  raiz.add(proximal, distal)
  escena.add(raiz)
  escena.updateMatrixWorld(true)
  return {
    escena,
    raiz,
    fragmento: distal,
    origenDelFragmento: { posicion: distal.position.clone(), rotacion: distal.rotation.clone() },
    puntosDelTrazo: [],
    materialesOriginales: new Map(),
    rolesAplicados: new Map(),
    normalesDelTrazo: [],
    heridas: new Map(),
    agujeros: [],
  } as unknown as Taller
}

const contexto = (t: Taller) => ({ t, milimetrosPorUnidad: MM, ejeLargo: 'y' as const, huesos: () => [], vivo: () => true })

describe('guardar lo colocado', () => {
  it('sin nada colocado no hay nada que guardar', () => {
    expect(serializarLoColocado(escenaConHuesoPartido())).toBe('')
  })

  it('mover el fragmento ya es algo que recordar', () => {
    const t = escenaConHuesoPartido()
    t.fragmento!.position.x += 0.012
    expect(serializarLoColocado(t)).not.toBe('')
  })
})

describe('restaurar lo colocado en una escena nueva', () => {
  it('el fragmento vuelve donde estaba, y los demás trozos movidos con él', async () => {
    const a = escenaConHuesoPartido()
    a.fragmento!.position.x += 0.012
    a.fragmento!.rotation.z += 0.1
    const proximal = a.escena!.getObjectByName('Tibia_fragmento_proximal')!
    a.origenesDePiezas = new Map([[proximal, { posicion: proximal.position.clone(), rotacion: proximal.rotation.clone() }]])
    proximal.position.y += 0.005
    const texto = serializarLoColocado(a)

    const b = escenaConHuesoPartido()
    expect(await restaurarLoColocado(texto, contexto(b))).toBe(true)
    expect(b.fragmento!.position.x).toBeCloseTo(a.fragmento!.position.x, 5)
    expect(b.fragmento!.rotation.z).toBeCloseTo(0.1, 5)
    expect(b.escena!.getObjectByName('Tibia_fragmento_proximal')!.position.y).toBeCloseTo(0.105, 5)
    expect(b.origenesDePiezas?.size).toBe(1)
  })

  it('los injertos vuelven con sus trozos, sus cc y el bloque', async () => {
    const a = escenaConHuesoPartido()
    a.injerto = crearInjerto(a.escena!)
    for (let i = 0; i < 3; i++) {
      depositarPunado(a.injerto, new THREE.Vector3(0, -0.01, 0.015), new THREE.Vector3(0, 0, 1), MM)
      a.injerto.esponjosoCc += 2
    }
    colocarBloque(a.escena!, a.injerto, new THREE.Vector3(0, -0.01, 0), new THREE.Vector3(0, 1, 0), 20, MM)
    const texto = serializarLoColocado(a)

    const b = escenaConHuesoPartido()
    await restaurarLoColocado(texto, contexto(b))
    expect(b.injerto?.esponjosoCc).toBe(6)
    expect(b.injerto?.cuenta).toBe(a.injerto.cuenta)
    expect(b.injerto?.trozos.count).toBe(a.injerto.cuenta)
    expect(b.injerto?.bloque?.largoMm).toBe(20)
    expect(b.injerto?.bloque?.malla.position.y).toBeCloseTo(-0.01, 5)
    // La matriz de cada trozo es la misma, a un millonésimo (los números se redondean al guardar).
    const antes = Array.from(a.injerto.trozos.instanceMatrix.array.slice(0, 16))
    const despues = Array.from(b.injerto!.trozos.instanceMatrix.array.slice(0, 16))
    antes.forEach((x, k) => expect(despues[k]).toBeCloseTo(x, 5))
  })

  it('el periostio despegado vuelve con todas sus huellas', async () => {
    const a = escenaConHuesoPartido()
    a.periostio = crearPeriostio(a.escena!)
    for (let i = 0; i < 5; i++) sembrarHuella(a.periostio, new THREE.Vector3(0, 0.02 * i, 0.015), new THREE.Vector3(0, 0, 1), 3, MM)
    a.periostio.ultima = null
    const texto = serializarLoColocado(a)

    const b = escenaConHuesoPartido()
    await restaurarLoColocado(texto, contexto(b))
    expect(b.periostio?.huellas.length).toBe(a.periostio.huellas.length)
    expect(b.periostio?.malla.count).toBe(a.periostio.huellas.length)
    expect(b.periostio?.huellas[2].y).toBeCloseTo(a.periostio.huellas[2].y, 4)
  })

  it('los hoyos de las brocas y las agujas de Kirschner vuelven en su sitio', async () => {
    const a = escenaConHuesoPartido()
    const hoyo = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.02, 16), new THREE.MeshBasicMaterial())
    hoyo.position.set(0.01, 0.02, 0.015)
    hoyo.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1))
    a.agujeros = [hoyo]
    const aguja = new THREE.Mesh(new THREE.CylinderGeometry(0.0008, 0.0008, 0.15, 10), new THREE.MeshBasicMaterial())
    aguja.position.set(0, 0.05, 0.1)
    a.alambres = [{ malla: aguja, profundidadMm: 30, salidaPorLaOpuestaMm: 28 }]
    const texto = serializarLoColocado(a)

    const b = escenaConHuesoPartido()
    await restaurarLoColocado(texto, contexto(b))
    expect(b.agujeros?.length).toBe(1)
    expect(b.agujeros?.[0].position.x).toBeCloseTo(0.01, 5)
    expect((b.agujeros?.[0].geometry as THREE.CylinderGeometry).parameters.height).toBeCloseTo(0.02, 5)
    expect(b.agujeros?.[0].userData.agujero).toBe(true)
    expect(b.alambres?.length).toBe(1)
    expect(b.alambres?.[0].profundidadMm).toBe(30)
    expect(b.alambres?.[0].malla.name).toBe('alambre-de-kirschner')
  })

  it('el enclavado vuelve entero: entrada, guía, fresado, clavo, arco y la cuenta de bloqueos', async () => {
    const a = escenaConHuesoPartido()
    const e = (a.enclavado = crearEnclavado())
    const proximal = a.escena!.getObjectByName('Tibia_fragmento_proximal')!
    const distal = a.escena!.getObjectByName('Tibia_fragmento_distal')!
    const punto = new THREE.Vector3(0, 0.19, 0.015)
    const canal = medirElCanal({ entrada: punto, cajaProximal: new THREE.Box3().setFromObject(proximal), cajaDistal: new THREE.Box3().setFromObject(distal), eje: 'y', milimetrosPorUnidad: MM })
    ponerLaEntrada(a.escena!, e, punto, new THREE.Vector3(0, 0, 1), canal, MM, { proximal, distal })
    colocarLaGuia(a.escena!, e, 300, MM)
    e.cabezasMm = [8.5, 9, 9.5]
    ponerElCanal(a.escena!, e, 9.5, 300, MM)
    cambiarLaGuia(e)
    colocarElClavo(a.escena!, e, { diametroMm: 9, largoMm: 330, nombre: 'Clavo tibial 9 × 330 mm' }, 336, MM)
    e.clavo!.golpes = 37
    e.arcoMontado = true
    e.bloqueos = [{ orificio: 'D1', zona: 'distal', tornilloId: -1, punteria: 'acierta', bloquea: true }]
    const texto = serializarLoColocado(a)

    const b = escenaConHuesoPartido()
    await restaurarLoColocado(texto, contexto(b))
    const r = b.enclavado!
    expect(r.entrada?.canal.origen.y).toBeCloseTo(0.19, 5)
    expect(r.entrada?.proximal.name).toBe('Tibia_fragmento_proximal')
    expect(r.guia?.avanceMm).toBe(300)
    expect(r.cabezasMm).toEqual([8.5, 9, 9.5])
    expect(r.guiaCambiada).toBe(true)
    expect(r.canal).not.toBeNull()
    expect(r.clavo).toMatchObject({ diametroMm: 9, largoMm: 330, avanceMm: 336, golpes: 37 })
    expect(r.clavo?.orificios.length).toBe(6)
    expect(r.arcoMontado).toBe(true)
    expect(r.bloqueos).toEqual([{ orificio: 'D1', zona: 'distal', tornilloId: -1, punteria: 'acierta', bloquea: true }])
  })

  it('un texto roto o de otra versión no rompe nada', async () => {
    const t = escenaConHuesoPartido()
    expect(await restaurarLoColocado('{no es json', contexto(t))).toBe(false)
    expect(await restaurarLoColocado(JSON.stringify({ v: 99 }), contexto(t))).toBe(false)
  })
})

describe('el lienzo guarda y restaura lo colocado', () => {
  it('guarda cada pocos cientos de milisegundos y restaura tras cargar el modelo, sin pisar lo guardado mientras restaura', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const lienzo = readFileSync(join(process.cwd(), 'src/components/simulador/LienzoQuirurgico.tsx'), 'utf8')
    expect(lienzo).toContain('guardarLoColocado()')
    expect(lienzo).toContain('void restaurarLoGuardado()')
    expect(lienzo).toContain('if (!clave || restaurandoLoColocado) return')
    expect(lienzo.indexOf('restaurarSesion()\n')).toBeLessThan(lienzo.indexOf('void restaurarLoGuardado()'))
  })
})
