import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { rolDeSistema } from '@/atlas/clasificacion'
import {
  esEstructuraNoble,
  piezasConLasDelModelo,
  propuestaDelNodo,
  rellenarDesdeElModelo,
  rolPorElNombre,
  ROLES_DE_PIEZA,
} from '@/lib/piezasDelCaso'
import { planoDelRol } from '@/lib/planosBlandos'
import { capaBlandaDelRol } from '@/lib/diseccionRoma'
import { planoDeLaPuntada } from '@/lib/planosDeLaSutura'
import {
  capaDelRol,
  capasAlEntrarEnPaso,
  juicioDeLaLesion,
  puntosDelPaso,
  RESULTADOS,
  visibilidadDelPaso,
  type PasoQuirurgico,
} from '@/lib/simulador'
import { conIntento, conLesion, notaDelRecorrido, RECORRIDO_VACIO, recorridoValido } from '@/lib/notaDelRecorrido'
import { esDesenlaceConDano, NOMBRE_DEL_DESENLACE } from '@/lib/progresoDelSimulador'
import { aspectoDe } from '@/components/simulador/aspectoDelPaciente'

/**
 * Los vasos y los nervios con su papel (P-012 E6).
 *
 * Eran «músculo»: la tabla del atlas mandaba ahí las arterias, las venas y los nervios, y el trazo que partía la arteria
 * tibial anterior costaba lo mismo que el que partía el tibial anterior, nada. Ahora tienen papel propio, `vaso` y
 * `nervio`, y lo que se vigila aquí es lo que ese cambio podía romper sin que se notase: que sigan en el plano muscular
 * para todo lo demás —se apagan, se separan y se cosen con él—, y que cortarlos o perforarlos cueste el paso entero en
 * la consola y en la nota que rehace el servidor.
 */

type Paso = PasoQuirurgico & { id: string }

const leer = (...partes: string[]) => readFileSync(join(process.cwd(), ...partes), 'utf8').replace(/\r\n/g, '\n')

describe('el papel', () => {
  it('va detrás de la fascia, que es donde Postgres añade los valores de un enumerado', () => {
    expect(ROLES_DE_PIEZA.slice(-3)).toEqual(['fascia', 'vaso', 'nervio'])
  })

  it('el atlas manda las arterias y las venas a «vaso» y los nervios a «nervio»; el linfático se queda', () => {
    expect(rolDeSistema('arterial')).toBe('vaso')
    expect(rolDeSistema('venous')).toBe('vaso')
    expect(rolDeSistema('nervous')).toBe('nervio')
    expect(rolDeSistema('lymphatic')).toBe('musculo')
    expect(rolDeSistema('muscular')).toBe('musculo')
  })

  it.each([
    ['Left anterior tibial artery', 'vaso'],
    ['Arteria femoral', 'vaso'],
    ['Vena safena mayor', 'vaso'],
    ['Great saphenous vein', 'vaso'],
    ['Musculocutaneous nerve', 'nervio'],
    ['Nervio peroneo común', 'nervio'],
    ['Left tibial nerve', 'nervio'],
    // Lo de antes sigue igual.
    ['Tendon_de_Aquiles', 'musculo'],
    ['Músculo tibial anterior', 'musculo'],
    ['Tibia_izquierda_2', 'hueso'],
  ])('por el nombre, «%s» es %s', (nombre, rol) => {
    expect(rolPorElNombre(nombre)).toBe(rol)
  })

  it('las estructuras nobles son exactamente esas dos', () => {
    expect(ROLES_DE_PIEZA.filter(esEstructuraNoble)).toEqual(['vaso', 'nervio'])
  })
})

describe('los modelos y los casos de antes', () => {
  // Lo que escribía el exportador antes de E6: «músculo», con el sistema al lado.
  const arterias = { rol: 'musculo', etiqueta: 'Arterias', sistema: 'arterial' }
  const nervios = { rol: 'musculo', etiqueta: 'Nervios', sistema: 'nervous' }

  it('el «músculo» de un sistema que hoy es vaso o nervio se lee como lo que es', () => {
    expect(propuestaDelNodo('arterial', arterias)?.rol).toBe('vaso')
    expect(propuestaDelNodo('nervous', nervios)?.rol).toBe('nervio')
    const enLaConsola = piezasConLasDelModelo([], [{ nodo: 'nervous', datos: nervios }])
    expect(enLaConsola.map((p) => p.rol)).toEqual(['nervio'])
  })

  it('lo demás que dice el archivo manda: el fragmento, la fascia superficial, el músculo de verdad', () => {
    expect(propuestaDelNodo('Tibia', { rol: 'fragmento', etiqueta: 'Tibia', sistema: 'skeletal' })?.rol).toBe('fragmento')
    expect(propuestaDelNodo('fs', { rol: 'piel', etiqueta: 'Fascia superficial', sistema: 'fascia-superficial' })?.rol).toBe('piel')
    expect(propuestaDelNodo('muscular', { rol: 'musculo', etiqueta: 'Músculos', sistema: 'muscular' })?.rol).toBe('musculo')
    // Uno exportado después, que ya lo trae bien, igual.
    expect(propuestaDelNodo('arterial', { ...arterias, rol: 'vaso' })?.rol).toBe('vaso')
  })

  it('«Rellenar desde el modelo» pone su papel a la fila «músculo» de un vaso, y solo a esa', () => {
    const propuestas = [propuestaDelNodo('arterial', arterias)!, propuestaDelNodo('nervous', nervios)!]
    const escritas = [
      { nodo: 'arterial', rol: 'musculo', etiqueta: 'Arterias de la pierna' },
      // Un papel distinto de «músculo» sí lo eligió alguien: no se toca.
      { nodo: 'nervous', rol: 'hueso', etiqueta: 'Nervios' },
    ]
    const r = rellenarDesdeElModelo(escritas, propuestas)
    expect(r.conSuPapel).toBe(1)
    expect(r.piezas.map((p) => p.rol)).toEqual(['vaso', 'hueso'])
    // La etiqueta escrita se queda.
    expect(r.piezas[0].etiqueta).toBe('Arterias de la pierna')
    // Y una segunda vez no hay nada que hacer.
    expect(rellenarDesdeElModelo(r.piezas, propuestas).piezas).toBe(r.piezas)
  })
})

describe('para todo lo demás, el plano muscular', () => {
  it('las tres traducciones de papel a capa dicen lo mismo', () => {
    for (const rol of ['vaso', 'nervio'] as const) {
      expect(capaDelRol(rol), rol).toBe('musculo')
      expect(planoDelRol(rol), rol).toBe('musculo')
      expect(capaBlandaDelRol(rol), rol).toBe('musculo')
      expect(planoDeLaPuntada(rol), rol).toBe('musculo')
    }
  })

  const piezas = [
    { nodo: 'Piel', rol: 'piel' },
    { nodo: 'Tibial anterior', rol: 'musculo' },
    { nodo: 'Arteria tibial anterior', rol: 'vaso' },
    { nodo: 'Nervio peroneo profundo', rol: 'nervio' },
    { nodo: 'Tibia', rol: 'hueso' },
  ]
  const PASOS = [{ titulo: 'Abordaje' }, { titulo: 'Ver el paquete', muestra: ['Arteria tibial anterior'] }]

  it('con el músculo apagado, la arteria y el nervio no se quedan flotando delante del hueso', () => {
    const { nodos } = visibilidadDelPaso(PASOS, piezas, 0, new Set(['musculo']))
    expect(nodos).toEqual(['Piel', 'Tibia'])
  })

  it('un paso que enseña un vaso enciende el interruptor del músculo, que es el suyo', () => {
    const capas = capasAlEntrarEnPaso(PASOS, piezas, 1, new Set(['musculo']))
    expect(capas.has('musculo')).toBe(false)
    // Y no inventa un interruptor «vaso» que la consola no tiene.
    expect([...capas].some((c) => c === 'vaso' || c === 'nervio')).toBe(false)
  })

  it('se ven húmedos, sin fibras de músculo', () => {
    const pieza = (name: string) => ({ name, userData: {} })
    expect(aspectoDe(pieza('Arteria tibial anterior'), 'vaso')).toBe('humedo')
    expect(aspectoDe(pieza('Ramo profundo'), 'nervio')).toBe('humedo')
  })
})

describe('cortarlos o perforarlos es una complicación', () => {
  it('el juicio dice qué se lesionó y con qué, y cuesta el paso entero', () => {
    const corte = juicioDeLaLesion({ rol: 'vaso', nombre: 'Vena safena mayor', como: 'corte' })
    expect(corte.resultado).toBe(RESULTADOS.LESION_VASCULAR)
    expect(corte.complicacion).toBe(true)
    expect(corte.avanza).toBe(false)
    expect(corte.mensaje).toContain('El trazo cortó un vaso: Vena safena mayor.')

    const broca = juicioDeLaLesion({ rol: 'nervio', nombre: 'Nervio tibial', como: 'perforacion' })
    expect(broca.resultado).toBe(RESULTADOS.LESION_NERVIOSA)
    expect(broca.mensaje).toContain('la perforación atravesó un nervio: Nervio tibial.')
    expect(puntosDelPaso({ objetivo: 'trazo', puntos: 10 }, { fallo: false, complicacion: true })).toBe(0)
  })

  it('los dos desenlaces se pueden guardar y tienen nombre en el panel', () => {
    for (const r of [RESULTADOS.LESION_VASCULAR, RESULTADOS.LESION_NERVIOSA]) {
      expect(esDesenlaceConDano(r), r).toBe(true)
      expect(NOMBRE_DEL_DESENLACE[r], r).toMatch(/^Lesión (vascular|nerviosa)$/)
    }
  })

  const PASOS: Paso[] = [
    { id: 'p1', objetivo: 'instrumento', instrumento: 'bisturi', puntos: 10 },
    { id: 'p2', objetivo: 'instrumento', instrumento: 'separador', puntos: 10 },
  ]
  const acertado = conIntento(conIntento(RECORRIDO_VACIO, PASOS[0], { instrumento: 'bisturi' }), PASOS[1], { instrumento: 'separador' })
  const lesion = { rol: 'vaso', nombre: 'Arteria tibial anterior', como: 'corte' } as const

  it('el servidor rehace la nota con la lesión: el paso en que pasó no suma, los demás sí', () => {
    expect(notaDelRecorrido(PASOS, acertado).puntaje).toBe(20)
    expect(notaDelRecorrido(PASOS, conLesion(acertado, 'p1', lesion)).puntaje).toBe(10)
    // Una lesión en un paso todavía sin gestos se guarda igual, y el gesto que lo supera después llega sin puntos.
    const antes = conIntento(conLesion(RECORRIDO_VACIO, 'p1', lesion), PASOS[0], { instrumento: 'bisturi' })
    expect(notaDelRecorrido(PASOS, antes).puntaje).toBe(0)
  })

  it('de la lesión se guarda la primera del paso: las siguientes no cambian la nota', () => {
    const dos = conLesion(conLesion(RECORRIDO_VACIO, 'p1', lesion), 'p1', { rol: 'nervio', nombre: 'Nervio peroneo', como: 'perforacion' })
    expect(dos.pasos[0].lesion).toEqual(lesion)
  })

  it('lo que llega por HTTP se rehace, y una lesión rota se rechaza entera en vez de quedarse fuera', () => {
    const conLaLesion = conLesion(acertado, 'p1', lesion)
    expect(recorridoValido(JSON.parse(JSON.stringify(conLaLesion)))).toEqual(conLaLesion)
    const roto = (cambio: Record<string, unknown>) => ({
      v: 1,
      pasos: [{ paso: 'p1', intentos: [], lesion: { ...lesion, ...cambio } }],
    })
    expect(() => recorridoValido(roto({ rol: 'musculo' }))).toThrow(/lesión del paso 1/)
    expect(() => recorridoValido(roto({ como: 'mordida' }))).toThrow(/lesión del paso 1/)
    expect(() => recorridoValido(roto({ nombre: '' }))).toThrow(/lesión del paso 1/)
    expect(() => recorridoValido(roto({ nombre: 'x'.repeat(201) }))).toThrow(/lesión del paso 1/)
    // Y lo que sobra no pasa: solo los tres campos que el motor lee.
    const conMas = recorridoValido(roto({ sobra: 'nada' }))
    expect(conMas.pasos[0].lesion).toEqual(lesion)
  })
})

describe('el lienzo los vigila y la consola los cobra', () => {
  const lienzo = leer('src', 'components', 'simulador', 'LienzoQuirurgico.tsx')
  const consola = leer('src', 'components', 'simulador', 'ConsolaQuirurgica.tsx')
  const aplicarElCorte = lienzo.slice(lienzo.indexOf('const aplicarElCorte = '), lienzo.indexOf('const yaCortadas'))
  const corte = lienzo.slice(lienzo.indexOf('const aplicarElCorte = '))

  it('el bisturí profundo alcanza los vasos y los nervios del plano, y la disección roma los aparta', () => {
    expect(aplicarElCorte).toContain('planoDelRol(p.rol) === plano && !(deDiseccion && esEstructuraNoble(p.rol))')
  })

  it('solo un trazo de verdad lesiona, y lo que ya estaba cortado no vuelve a contar', () => {
    const despues = corte.slice(corte.indexOf('t.heridas.set(plano,'))
    const guarda = despues.indexOf('if (!desdeLaSesion && !esRehacer && !deDiseccion) {')
    expect(guarda).toBeGreaterThan(-1)
    expect(despues.indexOf("ultimas.current.alLesionar?.({ rol: pieza.rol, nombre: pieza.etiqueta?.trim() || pieza.nodo, como: 'corte' })")).toBeGreaterThan(guarda)
    expect(despues.indexOf('if (yaCortadas.has(herida.malla.name)) continue')).toBeGreaterThan(guarda)
    // Lo cortado se mira antes de cerrar la incisión que se alarga: después ya no está.
    expect(corte.indexOf('const yaCortadas')).toBeLessThan(corte.indexOf('if (previo) cerrarLaIncision('))
  })

  it('la broca y la aguja que se pasan miran lo que atraviesan, con lo apagado incluido', () => {
    const terminar = lienzo.slice(lienzo.indexOf('const terminarPerforacion = () => {'), lienzo.indexOf('const golpeParaLaHerramienta'))
    expect(terminar.split('avisarDeLoQueAtraviesa(p, radio, unidadesPorMm)').length - 1).toBe(2)
    const avisar = lienzo.slice(lienzo.indexOf('const avisarDeLoQueAtraviesa = '), lienzo.indexOf('const terminarPerforacion = () => {'))
    expect(avisar).toContain('if (sePaso / unidadesPorMm <= PASARSE_DE_LA_CORTICAL_MM) return')
    const atraviesa = lienzo.slice(lienzo.indexOf('function nobleQueAtraviesa('))
    const recorrido = atraviesa.slice(0, atraviesa.indexOf('return [...tocadas.values()]'))
    expect(recorrido).toContain('if (m.isMesh && nobles.has(m.name)) mallas.push(m)')
    expect(recorrido).not.toContain('visible')
  })

  it('pedir el plano muscular es pedir también lo noble, y lo noble nunca pasa por hueso', () => {
    expect(lienzo).toContain("(esEstructuraNoble(rol) && roles.includes('musculo'))")
    expect(lienzo).toContain("rol !== 'implante' && !esEstructuraNoble(rol)")
  })

  it('la consola lo anota siempre y lo cobra como el bloqueo: no en el editor, ni repasando, ni en un paso superado', () => {
    expect(consola).toContain('alLesionar={vigilarLaLesion}')
    const vigilar = consola.slice(consola.indexOf('function vigilarLaLesion('), consola.indexOf('function aplicarPaso()'))
    const sale = vigilar.indexOf('if (editor || repaso || !paso || resueltos.has(paso.id)) return')
    expect(vigilar.indexOf("anotar(`${indice + 1}. ${juicio.mensaje}`, 'grave')")).toBeLessThan(sale)
    expect(vigilar.indexOf('conLesion(recorridoDeLaNota.current, paso.id, lesion)')).toBeGreaterThan(sale)
    expect(vigilar).toContain('setComplicados(')
    expect(vigilar).toContain('guardarRecorrido(puntaje, nuevas, insumos)')
  })
})
