import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as THREE from 'three'
import {
  PASO_DEL_TORNILLO_MM,
  PASO_FINO_DEL_TORNILLO_MM,
  estaAsentado,
  giroDelTornilloRad,
  metidoTrasLaRueda,
  pasoDeLaRoscaMm,
  textoDelTornilloQueEntra,
} from '@/lib/tornilloQueEntra'
import {
  RADIO_DEL_CAMPO_AL_CENTRAR_MM,
  ZOOM_MAXIMO_DE_LA_IMAGEN,
  centroDeLaImagen,
  desplazamientoParaCentrar,
  topeDelDesplazamiento,
  zoomParaCentrar,
} from '@/lib/radiografia'
import { encuadreHaciaElPunto } from '@/components/simulador/radiografiaEnLaEscena'

/**
 * El tornillo que entra de a poco y el arco que se centra en lo que está puesto (P-004, pedidos 3, 13 y 14 de Cristóbal): «que el
 * instrumental que está haciendo el hoyo, o esté midiendo, o el tornillo esté entrando, se quede en la posición en que vas
 * mientras pides el rayo. El rayo muchas veces se usa para saber qué tan profundo vas».
 */

describe('metidoTrasLaRueda', () => {
  it('una muesca mete 2 mm y con Mayúsculas medio milímetro', () => {
    expect(metidoTrasLaRueda(0, 28, 1)).toBe(PASO_DEL_TORNILLO_MM)
    expect(metidoTrasLaRueda(10, 28, 1, true)).toBe(10 + PASO_FINO_DEL_TORNILLO_MM)
  })

  it('hacia atrás lo saca, sin pasar de la entrada', () => {
    expect(metidoTrasLaRueda(4, 28, -1)).toBe(2)
    expect(metidoTrasLaRueda(1, 28, -1)).toBe(0)
  })

  it('no pasa del largo: ahí la cabeza toca la placa', () => {
    expect(metidoTrasLaRueda(27, 28, 1)).toBe(28)
    expect(metidoTrasLaRueda(28, 28, 1)).toBe(28)
  })

  it('no arrastra decimales de coma flotante muesca a muesca', () => {
    let metido = 0
    for (let i = 0; i < 7; i++) metido = metidoTrasLaRueda(metido, 40, 1, true)
    expect(metido).toBe(3.5)
  })
})

describe('estaAsentado', () => {
  it('asienta al llegar al largo, con una tolerancia de centésimas', () => {
    expect(estaAsentado(28, 28)).toBe(true)
    expect(estaAsentado(27.98, 28)).toBe(true)
    expect(estaAsentado(27.5, 28)).toBe(false)
  })
})

describe('la rosca', () => {
  it('el paso de los tornillos de la caja AO', () => {
    expect(pasoDeLaRoscaMm(2.7)).toBe(1)
    expect(pasoDeLaRoscaMm(3.5)).toBe(1.25)
    expect(pasoDeLaRoscaMm(4.5)).toBe(1.75)
    expect(pasoDeLaRoscaMm(6.5)).toBe(2.75)
  })

  it('una vuelta entera por cada paso de rosca metido', () => {
    expect(giroDelTornilloRad(1.25, 3.5)).toBeCloseTo(Math.PI * 2, 9)
    expect(giroDelTornilloRad(0, 3.5)).toBe(0)
  })
})

describe('textoDelTornilloQueEntra', () => {
  it('dice cuánto lleva y cuánto falta para asentar', () => {
    expect(textoDelTornilloQueEntra({ largoMm: 28, metidoMm: 14, agujero: 2 })).toBe(
      'Tornillo de 28 mm en el agujero 2: lleva 14,0 mm · faltan 14,0 mm para asentar la cabeza',
    )
  })

  it('en la entrada y asentado lo dice con palabras', () => {
    expect(textoDelTornilloQueEntra({ largoMm: 28, metidoMm: 0, agujero: 1 })).toContain('todavía no entra')
    expect(textoDelTornilloQueEntra({ largoMm: 28, metidoMm: 28, agujero: 1 })).toContain('asentado')
  })
})

describe('centrar el arco en lo que está puesto', () => {
  const centro = [0, 0, 0] as const
  const derecha = [1, 0, 0] as const
  const arriba = [0, 1, 0] as const

  it('desplazamientoParaCentrar es lo contrario de centroDeLaImagen: el punto queda en el centro', () => {
    const punto = [0.05, -0.12, 0.3] as const
    const d = desplazamientoParaCentrar(centro, 0.2, derecha, arriba, punto, 2)
    const foco = centroDeLaImagen(centro, 0.2, derecha, arriba, d, 2)
    // La profundidad (z) no la mueve el arrastre: lo que cuenta es que el punto cae en el eje de la cámara.
    expect(foco[0]).toBeCloseTo(punto[0], 9)
    expect(foco[1]).toBeCloseTo(punto[1], 9)
  })

  it('lo que no cabe en el tope se queda en el tope, como un arrastre', () => {
    const d = desplazamientoParaCentrar(centro, 0.01, derecha, arriba, [10, 0, 0], 1)
    expect(d.x).toBe(-topeDelDesplazamiento(1))
  })

  it('el zoom deja un campo de unos 16 cm, nunca aleja y no pasa del tope', () => {
    expect(zoomParaCentrar(RADIO_DEL_CAMPO_AL_CENTRAR_MM * 2)).toBe(2)
    expect(zoomParaCentrar(RADIO_DEL_CAMPO_AL_CENTRAR_MM / 2)).toBe(1)
    expect(zoomParaCentrar(RADIO_DEL_CAMPO_AL_CENTRAR_MM * 50)).toBe(ZOOM_MAXIMO_DE_LA_IMAGEN)
    expect(zoomParaCentrar(0)).toBe(1)
  })

  it('en la escena: una tibia de 40 cm, la broca a 12 cm del centro, queda centrada', () => {
    const escena = new THREE.Scene()
    const raiz = new THREE.Group()
    escena.add(raiz)
    // En metros (1 unidad = 1000 mm), con el eje largo en Y, como las preparaciones del atlas.
    const tibia = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.4, 0.03))
    tibia.name = 'Tibia'
    raiz.add(tibia)
    const roles = new Map([['Tibia', 'hueso']])
    const broca = new THREE.Vector3(0.01, 0.12, 0)
    const encuadre = encuadreHaciaElPunto({ escena, raiz, rolesAplicados: roles }, { proyeccion: 'ap', ejeLargo: 'y', milimetrosPorUnidad: 1000 }, broca)
    expect(encuadre).not.toBeNull()
    // A 1× el círculo cubre la mitad del largo con un 12 % de aire: 224 mm de radio, y el campo de 80 mm pide 2,8×.
    expect(encuadre!.zoom).toBeCloseTo((200 * 1.12) / RADIO_DEL_CAMPO_AL_CENTRAR_MM, 6)
    const radio = (0.2 * 1.12) / encuadre!.zoom
    // En AP la cámara está en +Z mirando hacia −Z, con «arriba» en +Y: la derecha de la imagen es +X.
    const foco = centroDeLaImagen([0, 0, 0], radio, [1, 0, 0], [0, 1, 0], encuadre!.desplazamiento, encuadre!.zoom)
    expect(foco[0]).toBeCloseTo(broca.x, 6)
    expect(foco[1]).toBeCloseTo(broca.y, 6)
  })

  it('sin hueso que encuadrar no centra en nada', () => {
    const escena = new THREE.Scene()
    expect(encuadreHaciaElPunto({ escena, raiz: undefined, rolesAplicados: new Map() }, { proyeccion: 'ap', ejeLargo: 'y', milimetrosPorUnidad: 1000 }, new THREE.Vector3())).toBeNull()
  })
})

describe('el cableado', () => {
  const fuente = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8').replace(/\r\n/g, '\n')
  const lienzo = fuente('src', 'components', 'simulador', 'LienzoQuirurgico.tsx')
  const consola = fuente('src', 'components', 'simulador', 'ConsolaQuirurgica.tsx')
  const sesion = fuente('src', 'components', 'simulador', 'sesionDeLoColocado.ts')

  it('el clic deja el tornillo de placa en la entrada, fuera de los puestos hasta asentar', () => {
    const rama = lienzo.slice(lienzo.indexOf('const puesto = colocarTornillo({'), lienzo.indexOf('const posarElTornilloQueEntra = () => {'))
    expect(rama).toContain('imp.tornillos.delete(agujero)')
    expect(rama).toContain('metidoMm: 0')
    // Lo que cuenta y comprime se dice al asentar, no al pinchar.
    expect(rama).not.toContain("tipo: 'tornillo'")
    expect(rama).not.toContain('aplicarLaCompresion(')
  })

  it('al asentar entra en la lista, comprime en el óvalo y avisa a la consola como antes', () => {
    const asentar = lienzo.slice(lienzo.indexOf('const asentarElTornillo = () => {'), lienzo.indexOf('taller.current.moverElTornillo = '))
    expect(asentar).toContain('t.implantes.tornillos.set(a.agujero, a.entrada)')
    expect(asentar).toContain('aplicarLaCompresion(resultadoDelOval(a.desviacionMm, lado, semilargoDelOvalDeLaPlaca(placa.nombre)))')
    expect(asentar).toContain("tipo: 'tornillo'")
    expect(asentar).toContain('ultimas.current.alFijar?.(estadoDeLaFijacion(t), suceso)')
  })

  it('con uno entrando, un clic no pone otro y la mano no pinta un segundo tornillo', () => {
    expect(lienzo).toContain("if (inst.coloca?.tipo === 'tornillo' && atornillando) {")
    expect(lienzo).toContain("(ultimas.current.instrumento?.coloca?.tipo === 'tornillo' && atornillando)")
  })

  it('quitar los implantes saca también el que está entrando', () => {
    const quitar = lienzo.slice(lienzo.indexOf('    quitarImplantes: (conPlaca) => {'))
    expect(quitar.slice(0, 500)).toContain('taller.current.sacarElTornillo?.()')
  })

  it('la sesión guarda solo lo que está en `implantes.tornillos`: el que entra no se guarda a medias', () => {
    expect(sesion).toContain('const tornillos = [...(imp?.tornillos.entries() ?? [])]')
  })

  it('la consola: la rueda lo mete, y ofrece terminarlo, sacarlo y centrar el arco en él', () => {
    expect(consola).toContain("if (ruedaDelInstrumento === 'alarga' && tornilloQueEntra) {")
    expect(consola).toContain('m.moverElTornillo(deltaY < 0 ? 1 : -1, mayusculas)')
    expect(consola).toContain('mando.current?.terminarElTornillo()')
    expect(consola).toContain('mando.current?.sacarElTornillo()')
    expect(consola).toContain('alCambiarElTornillo={setTornilloQueEntra}')
    expect(consola).toContain("instrumentoPuesto={broca ? 'la broca' : tornilloQueEntra ? 'el tornillo' : queHace.mide ? 'el medidor' : null}")
  })

  it('la marca del punto de brocado sigue al esquema del óvalo y se va al perforar', () => {
    expect(lienzo).toContain('t.marcarElPuntoDeBrocado?.(indice)')
    expect(lienzo).toContain('placa.agujeros.get(indice)?.perforado')
    expect(lienzo).toContain('taller.current.repasarLaMarcaDeBrocado?.()')
    expect(consola).toContain('alElegirAgujero={(i) => mando.current?.marcarElPuntoDeBrocado(i)}')
  })
})
