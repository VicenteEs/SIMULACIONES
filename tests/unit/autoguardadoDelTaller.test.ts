import { describe, it, expect } from 'vitest'
import {
  INTERVALO_DE_AUTOGUARDADO_MS,
  debeAvisarDelFallo,
  debeRefrescarLaLista,
  motivoParaNoAutoguardar,
  type EstadoParaAutoguardar,
} from '@/lib/autoguardadoDelTaller'

/**
 * El guardado automático del taller anatómico: la decisión de cuándo toca.
 *
 * Es lógica pura a propósito (ver el comentario del módulo): el taller no se
 * puede montar en estas pruebas, que no tienen navegador, pero sí lo que decide
 * si se guarda.
 */

const LISTO: EstadoParaAutoguardar = {
  listo: true,
  hayCambios: true,
  nombre: 'Mano derecha',
  piezas: 40,
  ocupado: false,
}

describe('cuándo el taller se guarda solo', () => {
  it('cada veinte segundos', () => {
    // El dueño pidió «cada 20 o 30»; cinco era demasiado seguido.
    expect(INTERVALO_DE_AUTOGUARDADO_MS).toBe(20_000)
  })

  it('guarda cuando hay cambios, nombre y piezas', () => {
    expect(motivoParaNoAutoguardar(LISTO)).toBeNull()
  })

  it('no guarda lo que no ha cambiado', () => {
    expect(motivoParaNoAutoguardar({ ...LISTO, hayCambios: false })).toBe('sin-cambios')
  })

  it('no guarda antes de que cargue el catálogo', () => {
    expect(motivoParaNoAutoguardar({ ...LISTO, listo: false })).toBe('sin-catalogo')
  })

  it('el Cuerpo recién modificado pide un nombre y no guarda nada', () => {
    // Sin nombre no hay copia que crear: el «Cuerpo» base no se toca nunca.
    expect(motivoParaNoAutoguardar({ ...LISTO, nombre: '' })).toBe('sin-nombre')
    expect(motivoParaNoAutoguardar({ ...LISTO, nombre: '   ' })).toBe('sin-nombre')
  })

  it('pide el nombre antes de quejarse de las piezas', () => {
    expect(motivoParaNoAutoguardar({ ...LISTO, nombre: '', piezas: 0 })).toBe('sin-nombre')
  })

  it('no guarda una preparación sin ninguna pieza encendida', () => {
    expect(motivoParaNoAutoguardar({ ...LISTO, piezas: 0 })).toBe('sin-piezas')
  })

  it('espera si ya hay un guardado en curso', () => {
    expect(motivoParaNoAutoguardar({ ...LISTO, ocupado: true })).toBe('ocupado')
  })
})

describe('qué se refresca tras un guardado automático', () => {
  it('la lista, cuando nace la copia del Cuerpo', () => {
    expect(debeRefrescarLaLista(true, '', 'Mano derecha')).toBe(true)
  })

  it('la lista, cuando se le cambia el nombre', () => {
    expect(debeRefrescarLaLista(false, 'Mano', 'Mano derecha')).toBe(true)
  })

  it('nada, cuando solo cambiaron las piezas: la lista no enseña eso', () => {
    expect(debeRefrescarLaLista(false, 'Mano derecha', ' Mano derecha ')).toBe(false)
  })
})

describe('los fallos del guardado automático', () => {
  it('se avisa el primero y no los reintentos', () => {
    expect(debeAvisarDelFallo(false)).toBe(true)
    expect(debeAvisarDelFallo(true)).toBe(false)
  })
})
