import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MARGEN_PARA_PASARSE_MM,
  PASO_DE_LA_RUEDA_MM,
  PASO_FINO_DE_LA_RUEDA_MM,
  lecturaDeLaBroca,
  profundidadTrasLaRueda,
  profundidadTrasUnCuadro,
  textoDeLaBroca,
} from '@/lib/profundidadDeLaBroca'

/**
 * La broca que se queda puesta en el hoyo (P-004 E8, pedidos 3 y 13 de Cristóbal): «el rayo muchas veces se usa para saber qué tan
 * profundo vas».
 */

describe('profundidadTrasUnCuadro', () => {
  it('avanza el avance por segundo por el tiempo del cuadro', () => {
    expect(profundidadTrasUnCuadro(0, 30, 10, 0.02)).toBeCloseTo(0.2, 9)
    expect(profundidadTrasUnCuadro(5, 30, 10, 0.04)).toBeCloseTo(5.4, 9)
  })

  it('un cuadro largo (pestaña en segundo plano) no la clava de golpe: el tiempo se acota a 50 ms', () => {
    expect(profundidadTrasUnCuadro(0, 30, 10, 5)).toBeCloseTo(0.5, 9)
  })

  it('no pasa del máximo ni baja de la entrada', () => {
    expect(profundidadTrasUnCuadro(29.9, 30, 10, 0.05)).toBe(30)
    expect(profundidadTrasUnCuadro(0, 30, -10, 0.05)).toBe(0)
    expect(profundidadTrasUnCuadro(3, 30, 10, -1)).toBe(3)
  })
})

describe('profundidadTrasLaRueda', () => {
  it('mete 0,5 mm por muesca y saca 0,5; con Mayúsculas, 0,1', () => {
    expect(PASO_DE_LA_RUEDA_MM).toBe(0.5)
    expect(PASO_FINO_DE_LA_RUEDA_MM).toBe(0.1)
    expect(profundidadTrasLaRueda(4, 30, 1)).toBe(4.5)
    expect(profundidadTrasLaRueda(4, 30, -1)).toBe(3.5)
    expect(profundidadTrasLaRueda(4, 30, 1, true)).toBe(4.1)
    expect(profundidadTrasLaRueda(4, 30, -1, true)).toBe(3.9)
  })

  it('hacia atrás no pasa de la entrada y hacia delante no pasa del máximo', () => {
    expect(profundidadTrasLaRueda(0.2, 30, -1)).toBe(0)
    expect(profundidadTrasLaRueda(29.8, 30, 1)).toBe(30)
  })

  it('diez muescas finas suman un milímetro, sin restos de coma flotante', () => {
    let p = 0
    for (let i = 0; i < 10; i++) p = profundidadTrasLaRueda(p, 30, 1, true)
    expect(p).toBe(1)
  })
})

describe('lecturaDeLaBroca', () => {
  it('antes de la cortical opuesta dice cuánto falta', () => {
    const l = lecturaDeLaBroca(12, 20)
    expect(l.faltaMm).toBe(8)
    expect(l.pasadoMm).toBe(0)
    expect(l.posicion).toBe('entrando')
  })

  it('a menos de medio milímetro de la opuesta, ya está en ella', () => {
    expect(lecturaDeLaBroca(19.6, 20).posicion).toBe('en-la-cortical-opuesta')
    expect(lecturaDeLaBroca(20, 20).posicion).toBe('en-la-cortical-opuesta')
  })

  it('pasada más de un milímetro, se pasó, y cuánto', () => {
    const l = lecturaDeLaBroca(23, 20)
    expect(l.posicion).toBe('pasada')
    expect(l.pasadoMm).toBe(3)
    expect(l.faltaMm).toBe(0)
  })

  it('el margen para pasarse es de 12 mm', () => {
    expect(MARGEN_PARA_PASARSE_MM).toBe(12)
  })
})

describe('textoDeLaBroca', () => {
  it('con la ayuda de aprendizaje dice cuánto falta; sin ella, solo la profundidad', () => {
    const l = lecturaDeLaBroca(12.5, 20)
    expect(textoDeLaBroca(l, { encendida: true, ayudaDeAprendizaje: true })).toBe('12,5 mm · faltan 7,5 mm para la cortical opuesta')
    expect(textoDeLaBroca(l, { encendida: true, ayudaDeAprendizaje: false })).toBe('12,5 mm')
  })

  it('haberse pasado se avisa siempre: es un error, no una pista', () => {
    const l = lecturaDeLaBroca(23, 20)
    expect(textoDeLaBroca(l, { encendida: true, ayudaDeAprendizaje: false })).toContain('¡se pasó 3,0 mm de la cortical opuesta!')
  })

  it('apagada, lo dice', () => {
    expect(textoDeLaBroca(lecturaDeLaBroca(4, 20), { encendida: false, ayudaDeAprendizaje: false })).toBe('4,0 mm · apagada')
  })
})

describe('el cableado', () => {
  const fuente = (...p: string[]) => readFileSync(join(process.cwd(), ...p), 'utf8').replace(/\r\n/g, '\n')
  const lienzo = fuente('src', 'components', 'simulador', 'LienzoQuirurgico.tsx')
  const consola = fuente('src', 'components', 'simulador', 'ConsolaQuirurgica.tsx')

  it('soltar el ratón detiene el avance pero no retira la broca', () => {
    const subir = lienzo.slice(lienzo.indexOf('const alSubir = (evento?: PointerEvent) =>'), lienzo.indexOf('const alGirarLaRueda'))
    expect(subir).toContain('perforando.avanzando = false')
    expect(subir).not.toContain('terminarPerforacion()')
  })

  it('salir del lienzo no esconde la broca puesta ni el medidor en su orificio', () => {
    const esconder = lienzo.slice(lienzo.indexOf('const esconderHerramienta = () =>'), lienzo.indexOf('// --- la línea recta'))
    expect(esconder).toContain('if (perforando || taller.current.medidorEnElOrificio) return')
  })

  it('el bucle solo avanza con el ratón pulsado y la broca encendida, con la config de cuando se enganchó', () => {
    expect(lienzo).toContain('if (perforando && perforando.avanzando && perforando.encendida)')
    expect(lienzo).toContain('const config = perforando.config')
    // Retirar usa el calibre de la broca que se enganchó, no el del instrumento que se lleve ahora.
    const terminar = lienzo.slice(lienzo.indexOf('const terminarPerforacion = () =>'), lienzo.indexOf('/** Qué golpe usa el instrumento para posarse'))
    expect(terminar).toContain('const config = p?.config')
    expect(terminar).not.toContain('ultimas.current.instrumento?.perfora')
  })

  it('cambiar de modo o de instrumento la retira, y el botón derecho también', () => {
    expect(lienzo).toContain("if (modo !== 'perforar') taller.current.retirarLaBroca?.()")
    expect(lienzo).toContain('return () => taller_.current.retirarLaBroca?.()')
    expect(lienzo).toContain("render.domElement.addEventListener('contextmenu', alClicDerecho)")
  })

  it('la consola ofrece «Apagar la broca» y «Retirar», y la rueda mete y saca', () => {
    expect(consola).toContain("{broca.encendida ? 'Apagar la broca' : 'Encender la broca'}")
    expect(consola).toContain('mando.current?.retirarLaBroca()')
    expect(consola).toContain("ruedaDelInstrumento === 'perfora'")
    expect(consola).toContain('m.moverLaBroca(sentido, mayusculas)')
  })

  it('un clic con una broca puesta la sigue metiendo, no empieza otro hoyo', () => {
    const empezar = lienzo.slice(lienzo.indexOf('const empezarPerforacion = '), lienzo.indexOf('const terminarPerforacion = () =>'))
    expect(empezar.indexOf('if (perforando) {')).toBeLessThan(empezar.indexOf('trayectoriaDeBroca(golpe)'))
    expect(empezar).toContain('perforando.avanzando = true')
  })
})
