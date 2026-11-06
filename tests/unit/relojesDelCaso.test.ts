import { describe, expect, it } from 'vitest'
import {
  MANGUITO_DESINFLADO,
  RELOJ_PARADO,
  SIN_EXPOSICION,
  avisoDelManguito,
  desinflar,
  estadoDelManguito,
  inflar,
  lecturaDelManguito,
  manguitoDelDocumento,
  parar,
  pararElManguito,
  ponerEnMarcha,
  reanudarElManguito,
  relojEnPalabras,
  relojEnTexto,
  relojesGuardados,
  segundosDelReloj,
  sinTiempos,
  tiemposDeAhora,
  tiemposEnPalabras,
  tiemposValidos,
} from '@/lib/relojesDelCaso'
import { avanceValido } from '@/lib/avanceDelCaso'
import { recorridoGuardado } from '@/lib/progresoDelSimulador'
import { casoParaLaConsola } from '@/lib/casoQuirurgico'

// Los relojes del caso (P-012 E5): el del procedimiento, el del manguito y la cuenta del arco en C.

const T0 = 1_800_000_000_000
const min = (n: number) => n * 60_000
const DATOS = { presion: 300, tope: 120 }

describe('un reloj que se para y se reanuda', () => {
  it('cuenta lo que corre, y parado ya no mira la hora', () => {
    const enMarcha = ponerEnMarcha(RELOJ_PARADO, T0)
    expect(segundosDelReloj(enMarcha, T0 + 65_400)).toBe(65)
    const parado = parar(enMarcha, T0 + 65_400)
    expect(parado.desde).toBeNull()
    expect(segundosDelReloj(parado, T0 + min(30))).toBe(65)
  })

  it('al reanudarse sigue desde lo contado, sin perder los décimos de cada parada', () => {
    // Diez paradas de 1,5 s: redondeando en cada una saldrían 10 s y no 15.
    let reloj = RELOJ_PARADO
    for (let i = 0; i < 10; i++) {
      const ahora = T0 + i * 10_000
      reloj = parar(ponerEnMarcha(reloj, ahora), ahora + 1500)
    }
    expect(segundosDelReloj(reloj, T0 + min(60))).toBe(15)
  })

  it('poner en marcha uno que ya corre no lo vuelve a cero', () => {
    const enMarcha = ponerEnMarcha(RELOJ_PARADO, T0)
    expect(ponerEnMarcha(enMarcha, T0 + 5000)).toBe(enMarcha)
  })

  it('una hora anterior a la de arranque no cuenta hacia atrás', () => {
    expect(segundosDelReloj({ acumulado: 3, desde: T0 }, 0)).toBe(3)
  })
})

describe('el reloj, escrito y dicho', () => {
  it('como el de pabellón: minutos y segundos, y las horas cuando las hay', () => {
    expect(relojEnTexto(0)).toBe('0:00')
    expect(relojEnTexto(7)).toBe('0:07')
    expect(relojEnTexto(65.9)).toBe('1:05')
    expect(relojEnTexto(3600)).toBe('1:00:00')
    expect(relojEnTexto(3909)).toBe('1:05:09')
    expect(relojEnTexto(-5)).toBe('0:00')
    expect(relojEnTexto(Number.NaN)).toBe('0:00')
  })

  it('en palabras, para el lector de pantalla y los avisos', () => {
    expect(relojEnPalabras(40)).toBe('40 s')
    expect(relojEnPalabras(720)).toBe('12 min')
    expect(relojEnPalabras(3900)).toBe('1 h 5 min')
    expect(relojEnPalabras(7200)).toBe('2 h')
  })
})

describe('el manguito del caso', () => {
  it('avisa media hora antes del tope, y nunca antes de la mitad', () => {
    expect(avisoDelManguito(120)).toBe(90)
    expect(avisoDelManguito(240)).toBe(210)
    expect(avisoDelManguito(60)).toBe(30)
    // Con 40 de tope, a los 10 avisaría casi al inflar: a la mitad.
    expect(avisoDelManguito(40)).toBe(20)
  })

  it('en tiempo, en el aviso y pasado, por el período de ahora', () => {
    expect(estadoDelManguito(min(90) / 1000 - 1, 120)).toBe('en-tiempo')
    expect(estadoDelManguito(min(90) / 1000, 120)).toBe('aviso')
    expect(estadoDelManguito(min(120) / 1000, 120)).toBe('pasado')
  })

  it('del documento: solo si lo usa, y lo roto o fuera de lo razonable toma lo habitual', () => {
    expect(manguitoDelDocumento(false, 300, 120)).toBeNull()
    expect(manguitoDelDocumento(undefined, 300, 120)).toBeNull()
    expect(manguitoDelDocumento('true', 300, 120)).toBeNull()
    expect(manguitoDelDocumento(true, null, undefined)).toEqual({ presion: 300, tope: 120 })
    expect(manguitoDelDocumento(true, 250, 90)).toEqual({ presion: 250, tope: 90 })
    expect(manguitoDelDocumento(true, 20, 999)).toEqual({ presion: 300, tope: 120 })
    expect(manguitoDelDocumento(true, Number.NaN, Number.POSITIVE_INFINITY)).toEqual({ presion: 300, tope: 120 })
  })

  it('llega a la consola con el caso, y sin la casilla no llega', () => {
    const base = { nombre: 'Caso', pasos: [] }
    expect(casoParaLaConsola({ ...base, usaManguito: true, presionDelManguito: 250, topeDelManguito: 90 }).manguito).toEqual({
      presion: 250,
      tope: 90,
    })
    expect(casoParaLaConsola(base).manguito).toBeNull()
  })
})

describe('el manguito mientras se opera', () => {
  it('soltar y volver a inflar empieza otro período: el tope es de uno seguido, el total se suma', () => {
    let m = inflar(MANGUITO_DESINFLADO, T0)
    expect(lecturaDelManguito(m, T0 + min(100))).toEqual({ inflado: true, periodo: 6000, total: 6000, masLargo: 6000 })
    expect(estadoDelManguito(lecturaDelManguito(m, T0 + min(100)).periodo, 120)).toBe('aviso')
    m = desinflar(m, T0 + min(100))
    expect(m).toEqual({ soltados: 6000, masLargo: 6000, periodo: null })
    m = inflar(m, T0 + min(110))
    const lectura = lecturaDelManguito(m, T0 + min(150))
    expect(lectura).toEqual({ inflado: true, periodo: 2400, total: 8400, masLargo: 6000 })
    // Cuarenta minutos del período nuevo: en tiempo, aunque el total pase de dos horas.
    expect(estadoDelManguito(lectura.periodo, 120)).toBe('en-tiempo')
  })

  it('inflar dos veces no vuelve a cero el período, y soltar uno suelto no hace nada', () => {
    const m = inflar(MANGUITO_DESINFLADO, T0)
    expect(inflar(m, T0 + min(5))).toBe(m)
    expect(desinflar(MANGUITO_DESINFLADO, T0)).toBe(MANGUITO_DESINFLADO)
  })

  it('al terminar el caso el período se para inflado, y al seguir otro día continúa', () => {
    const parado = pararElManguito(inflar(MANGUITO_DESINFLADO, T0), T0 + min(30))
    expect(lecturaDelManguito(parado, T0 + min(500))).toMatchObject({ inflado: true, periodo: 1800 })
    const seguido = reanudarElManguito(parado, T0 + min(600))
    expect(lecturaDelManguito(seguido, T0 + min(610))).toMatchObject({ inflado: true, periodo: 2400 })
    // Desinflado no hay período que parar.
    expect(pararElManguito(MANGUITO_DESINFLADO, T0)).toBe(MANGUITO_DESINFLADO)
  })
})

describe('lo que se guarda', () => {
  it('el procedimiento solo si hubo incisión, el manguito solo si el caso lo usa, y el arco siempre', () => {
    expect(tiemposDeAhora(RELOJ_PARADO, MANGUITO_DESINFLADO, null, SIN_EXPOSICION, T0)).toEqual({ disparos: 0, escopia: 0 })
    const procedimiento = ponerEnMarcha(RELOJ_PARADO, T0)
    const manguito = inflar(MANGUITO_DESINFLADO, T0 + min(2))
    expect(tiemposDeAhora(procedimiento, manguito, DATOS, { disparos: 14, segundosDeVideo: 20 }, T0 + min(42))).toEqual({
      procedimiento: 2520,
      manguito: 2400,
      manguitoSeguido: 2400,
      manguitoInflado: 2400,
      topeDelManguito: 120,
      disparos: 14,
      escopia: 20,
    })
    // Desinflado, sin `manguitoInflado`.
    expect(tiemposDeAhora(procedimiento, desinflar(manguito, T0 + min(12)), DATOS, SIN_EXPOSICION, T0 + min(42))).not.toHaveProperty(
      'manguitoInflado',
    )
  })

  it('se vuelve a los mismos relojes al seguir otro día, aunque el período de ahora no sea el más largo', () => {
    // Un período soltado de 100 min y otro de 40 en marcha.
    let manguito = desinflar(inflar(MANGUITO_DESINFLADO, T0), T0 + min(100))
    manguito = inflar(manguito, T0 + min(110))
    const procedimiento = ponerEnMarcha(RELOJ_PARADO, T0 + min(5))
    const guardado = tiemposDeAhora(procedimiento, manguito, DATOS, { disparos: 3, segundosDeVideo: 0 }, T0 + min(150))
    const vuelta = relojesGuardados(guardado)
    expect(vuelta.procedimiento).toEqual({ acumulado: 8700, desde: null })
    expect(vuelta.exposicion).toEqual({ disparos: 3, segundosDeVideo: 0 })
    // Diez minutos más, al otro día.
    const otroDia = T0 + min(3000)
    const lectura = lecturaDelManguito(reanudarElManguito(vuelta.manguito, otroDia), otroDia + min(10))
    expect(lectura).toEqual({ inflado: true, periodo: 3000, total: 9000, masLargo: 6000 })
  })

  it('y cuando el de ahora es el más largo, sigue siéndolo', () => {
    let manguito = desinflar(inflar(MANGUITO_DESINFLADO, T0), T0 + min(30))
    manguito = inflar(manguito, T0 + min(40))
    const guardado = tiemposDeAhora(RELOJ_PARADO, manguito, DATOS, SIN_EXPOSICION, T0 + min(90))
    expect(guardado).toMatchObject({ manguito: 4800, manguitoSeguido: 3000, manguitoInflado: 3000 })
    const vuelta = reanudarElManguito(relojesGuardados(guardado).manguito, T0)
    expect(lecturaDelManguito(vuelta, T0 + min(10))).toEqual({ inflado: true, periodo: 3600, total: 5400, masLargo: 3600 })
  })

  it('sin nada guardado, todo a cero y parado; lo que no cuadra se recorta', () => {
    expect(relojesGuardados(undefined)).toEqual({
      procedimiento: { acumulado: 0, desde: null },
      manguito: MANGUITO_DESINFLADO,
      exposicion: SIN_EXPOSICION,
    })
    expect(relojesGuardados({ manguito: 100, manguitoInflado: 500 }).manguito.soltados).toBe(0)
  })

  it('lo que llega del navegador, campo a campo', () => {
    expect(
      tiemposValidos({ procedimiento: 2520, manguito: -1, manguitoSeguido: 1.5, disparos: '14', escopia: 20, otra: 3 }),
    ).toEqual({ procedimiento: 2520, escopia: 20 })
    expect(tiemposValidos({ procedimiento: 8 * 24 * 3600 })).toEqual({})
    expect(tiemposValidos(null)).toEqual({})
    expect(tiemposValidos([1, 2])).toEqual({})
    expect(tiemposValidos('roto')).toEqual({})
    expect(sinTiempos({})).toBe(true)
    expect(sinTiempos({ disparos: 0 })).toBe(false)
  })

  it('dicho para el residente', () => {
    expect(
      tiemposEnPalabras({ procedimiento: 2520, manguito: 3900, manguitoSeguido: 3900, topeDelManguito: 120, disparos: 14, escopia: 20 }),
    ).toBe('42 min desde la incisión · manguito 1 h 5 min · 14 disparos y 20 s de vídeo')
    expect(tiemposEnPalabras({ manguito: 8400, manguitoSeguido: 6000, topeDelManguito: 120 })).toBe(
      'manguito 2 h 20 min (el período más largo, 1 h 40 min)',
    )
    expect(tiemposEnPalabras({ manguito: 7500, manguitoSeguido: 7500, topeDelManguito: 120 })).toBe(
      'manguito 2 h 5 min, pasado del tope de 120 min',
    )
    expect(tiemposEnPalabras({ disparos: 1 })).toBe('1 disparo')
    expect(tiemposEnPalabras({})).toBe('')
  })
})

describe('los tiempos viajan con el avance y vuelven con la fila', () => {
  const AVANCE = {
    v: 1,
    paso: 2,
    modo: 'practica',
    puntaje: 10,
    resueltos: [],
    fallados: [],
    complicados: [],
    automaticas: [],
    complicaciones: [],
    insumos: {},
    instantanea: { sesion: '', colocado: '' },
    guardadoEn: '2026-11-05T10:00:00.000Z',
  }

  it('el avance los guarda rehechos, y uno roto no tira el avance', () => {
    expect(avanceValido({ ...AVANCE, tiempos: { procedimiento: 600, disparos: 2 } })?.tiempos).toEqual({
      procedimiento: 600,
      disparos: 2,
    })
    const roto = avanceValido({ ...AVANCE, tiempos: { procedimiento: 'diez' } })
    expect(roto?.paso).toBe(2)
    expect(roto).not.toHaveProperty('tiempos')
    expect(avanceValido(AVANCE)).not.toHaveProperty('tiempos')
  })

  it('el recorrido guardado los devuelve, y sin nada contado no trae la clave', () => {
    const fila = { puntaje: 10, puntajeMaximo: 20, complicaciones: [], insumos: [] }
    expect(recorridoGuardado({ ...fila, tiempos: { procedimiento: 2520, disparos: 14 } })?.tiempos).toEqual({
      procedimiento: 2520,
      disparos: 14,
    })
    expect(recorridoGuardado({ ...fila, tiempos: {} })).not.toHaveProperty('tiempos')
    expect(recorridoGuardado({ ...fila, tiempos: 'roto' })).not.toHaveProperty('tiempos')
    expect(recorridoGuardado(fila)).not.toHaveProperty('tiempos')
  })
})
