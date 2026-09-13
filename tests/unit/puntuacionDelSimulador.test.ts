import { describe, it, expect } from 'vitest'
import {
  evaluarGesto,
  instruccionDelPaso,
  puntajeMaximo,
  puntosDelPaso,
  rangoDeFuerzaEnTexto,
  rangoDeTrazoEnTexto,
  topesDeReduccion,
  type PasoQuirurgico,
} from '@/lib/simulador'

/**
 * La política de puntuación y los topes efectivos del motor.
 *
 * Se prueba aquí y no desde la consola porque son reglas de dominio: la consola
 * solo aporta lo que pasó antes en el paso. Mientras la regla vivió dentro del
 * componente no había forma de fijarla sin navegador, y por eso pudo quedarse
 * dos olas diciendo que pasarse costaba más cuando costaba exactamente igual.
 */

const pasoDeFuerza: PasoQuirurgico = {
  titulo: 'Impactar el clavo',
  instrumento: 'martillo',
  puntos: 10,
  fuerzaMinima: 8,
  fuerzaMaxima: 20,
}

describe('lo que se cobra por acertar un paso', () => {
  it('a la primera vale el paso entero', () => {
    expect(puntosDelPaso(pasoDeFuerza, { fallo: false, complicacion: false })).toBe(10)
  })

  it('un paso sin puntos declarados vale diez', () => {
    expect(puntosDelPaso({}, { fallo: false, complicacion: false })).toBe(10)
  })

  it('tras un fallo inocuo vale la mitad, redondeando hacia abajo', () => {
    expect(puntosDelPaso(pasoDeFuerza, { fallo: true, complicacion: false })).toBe(5)
    expect(puntosDelPaso({ puntos: 15 }, { fallo: true, complicacion: false })).toBe(7)
  })

  it('tras una complicación no vale nada', () => {
    expect(puntosDelPaso(pasoDeFuerza, { fallo: false, complicacion: true })).toBe(0)
  })

  it('la complicación manda sobre el fallo: no se compensa acertando después', () => {
    expect(puntosDelPaso(pasoDeFuerza, { fallo: true, complicacion: true })).toBe(0)
  })

  it('pasarse cuesta más que quedarse corto', () => {
    // Es la razón de ser de todo esto. Los dos gestos son un reintento —ninguno
    // de los dos avanza— y hasta ahora los dos terminaban con el mismo número,
    // porque la complicación no salía del registro de la consola.
    const corto = evaluarGesto(pasoDeFuerza, { instrumento: 'martillo', fuerza: 4 })
    const pasado = evaluarGesto(pasoDeFuerza, { instrumento: 'martillo', fuerza: 40 })
    expect(corto.avanza).toBe(false)
    expect(pasado.avanza).toBe(false)
    expect(corto.complicacion).toBe(false)
    expect(pasado.complicacion).toBe(true)

    const trasQuedarseCorto = puntosDelPaso(pasoDeFuerza, {
      fallo: corto.complicacion === false,
      complicacion: corto.complicacion,
    })
    const trasPasarse = puntosDelPaso(pasoDeFuerza, {
      fallo: false,
      complicacion: pasado.complicacion,
    })
    expect(trasQuedarseCorto).toBeGreaterThan(trasPasarse)
  })
})

describe('el tope del marcador y lo que de verdad se cobra', () => {
  // Las dos cuentas son de lo mismo y viven separadas: `puntajeMaximo` pinta el
  // «/ máximo» de la consola y `puntosDelPaso` decide lo que se suma. Esto las
  // ata, para que quien cambie una se entere de la otra en vez de descubrirlo
  // en pantalla con un marcador que miente.
  const caso: PasoQuirurgico[] = [pasoDeFuerza, { puntos: 20 }, {}]

  it('el máximo suma los pasos enteros, y un paso sin puntos vale diez', () => {
    expect(puntajeMaximo(caso)).toBe(40)
  })

  it('solo se iguala haciéndolo todo bien a la primera', () => {
    const sinTropiezos = caso.reduce(
      (total, paso) => total + puntosDelPaso(paso, { fallo: false, complicacion: false }),
      0,
    )
    expect(sinTropiezos).toBe(puntajeMaximo(caso))
  })

  it('deja de ser alcanzable en cuanto se falla un paso, y con una complicación se aleja el doble', () => {
    // Es la consecuencia mala, escrita a propósito: el tope es la referencia
    // del caso, no una promesa. Si algún día se decide que el máximo baje con
    // cada tropiezo, este caso es el que hay que cambiar —y entonces también
    // el comentario de `puntajeMaximo`.
    const conUnFallo = puntosDelPaso(pasoDeFuerza, { fallo: true, complicacion: false })
    const conUnaComplicacion = puntosDelPaso(pasoDeFuerza, { fallo: false, complicacion: true })
    const entero = puntosDelPaso(pasoDeFuerza, { fallo: false, complicacion: false })

    expect(entero - conUnFallo).toBe(5)
    expect(entero - conUnaComplicacion).toBe(10)
    expect(entero - conUnaComplicacion).toBe(2 * (entero - conUnFallo))
    expect(puntajeMaximo([pasoDeFuerza])).toBeGreaterThan(conUnFallo)
  })
})

describe('los topes de la reducción', () => {
  it('la diástasis hereda el tope del desplazamiento cuando el paso no la declara', () => {
    expect(topesDeReduccion({ toleranciaDesplazamiento: 2 })).toEqual({
      desplazamiento: 2,
      diastasis: 2,
      angulacion: 5,
    })
  })

  it('lo declarado manda sobre la herencia', () => {
    expect(
      topesDeReduccion({
        toleranciaDesplazamiento: 2,
        toleranciaDiastasis: 8,
        toleranciaAngulacion: 3,
      }),
    ).toEqual({ desplazamiento: 2, diastasis: 8, angulacion: 3 })
  })

  it('sin nada declarado quedan los respaldos que usa la evaluación', () => {
    expect(topesDeReduccion({})).toEqual({ desplazamiento: 5, diastasis: 5, angulacion: 5 })
  })

  it('son los mismos números con los que se juzga el gesto', () => {
    // Que la consola pinte un tope y el motor mida contra otro es el fallo que
    // esta función existe para impedir: si alguien vuelve a escribir los
    // respaldos dentro de `evaluarGesto`, este caso lo caza.
    const paso: PasoQuirurgico = { objetivo: 'reduccion', toleranciaDesplazamiento: 2 }
    const topes = topesDeReduccion(paso)
    const enElTope = evaluarGesto(paso, {
      instrumento: 'pinza',
      desplazamiento: topes.desplazamiento,
      diastasis: topes.diastasis,
      angulacion: topes.angulacion,
    })
    const justoPorFuera = evaluarGesto(paso, {
      instrumento: 'pinza',
      desplazamiento: topes.desplazamiento + 0.1,
      diastasis: topes.diastasis,
      angulacion: topes.angulacion,
    })
    expect(enElTope.avanza).toBe(true)
    expect(justoPorFuera.avanza).toBe(false)
  })
})

describe('la instrucción de pantalla', () => {
  it('nombra el instrumento en los cuatro objetivos', () => {
    // `evaluarGesto` lo exige en los cuatro: una instrucción que no lo diga
    // manda al residente a un «Seleccione un instrumento» que contradice lo
    // único que acaba de leer.
    const pasos: PasoQuirurgico[] = [
      { objetivo: 'instrumento' },
      { objetivo: 'trazo', trazoMinimo: 40, trazoMaximo: 80 },
      { objetivo: 'reduccion' },
      pasoDeFuerza,
    ]
    for (const paso of pasos) {
      expect(instruccionDelPaso(paso).toLowerCase()).toContain('instrumento')
    }
  })

  it('la rama de fuerza compone el rango, como ya hacía la del trazo', () => {
    expect(instruccionDelPaso(pasoDeFuerza)).toContain('8–20 N')
    expect(instruccionDelPaso({ objetivo: 'trazo', trazoMinimo: 40, trazoMaximo: 80 })).toContain(
      '40–80 mm',
    )
  })

  it('sin rango declarado no inventa ninguno', () => {
    expect(instruccionDelPaso({ objetivo: 'fuerza' })).not.toContain('Rango útil')
  })

  it('la de reducción escribe los topes efectivos, no los campos en crudo', () => {
    // Sin tolerancias escritas seguía habiendo tres topes con los que se mide:
    // la frase tiene que decirlos.
    const texto = instruccionDelPaso({ objetivo: 'reduccion' })
    expect(texto).toContain('5 mm de desplazamiento')
    expect(texto).toContain('5 mm de diástasis')
  })
})

describe('los rangos escritos', () => {
  it('admiten un solo extremo, porque los dos campos son independientes', () => {
    expect(rangoDeFuerzaEnTexto({ fuerzaMinima: 8, fuerzaMaxima: 20 })).toBe('8–20 N')
    expect(rangoDeFuerzaEnTexto({ fuerzaMinima: 8 })).toBe('desde 8 N')
    expect(rangoDeFuerzaEnTexto({ fuerzaMaxima: 20 })).toBe('hasta 20 N')
    expect(rangoDeFuerzaEnTexto({})).toBeNull()
  })

  it('y lo mismo para la incisión', () => {
    expect(rangoDeTrazoEnTexto({ trazoMinimo: 40, trazoMaximo: 80 })).toBe('40–80 mm')
    expect(rangoDeTrazoEnTexto({ trazoMaximo: 80 })).toBe('hasta 80 mm')
    expect(rangoDeTrazoEnTexto({})).toBeNull()
  })
})
