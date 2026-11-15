import { describe, it, expect } from 'vitest'
import {
  ANCHO_DEL_CENIDO,
  ARISTA_JUNTO_A_LA_VENTANA,
  ASAS_DEL_MARCO,
  CLARO_DEL_CENIDO,
  HOLGURA_DONDE_ACABA_EL_CUERPO,
  LADO_MINIMO_DE_LA_ZONA,
  NOMBRE_DEL_ASA,
  abrirLaVentana,
  abrirPorDondeCuelga,
  acotarLaZona,
  afinarElBorde,
  alturaEn,
  asasDelMarco,
  avisoDeLoTapado,
  cabeEnElCuerpo,
  camaraAlDarLaVuelta,
  cenirAlBorde,
  centroDesdeElArchivo,
  centroDesdeLasNotas,
  colchonAlDarLaVuelta,
  colorDelPano,
  contornoDeLaVentana,
  cruceConElPlano,
  cuaternionDelEje,
  decubitoDeLaPosicion,
  decubitoDeLaVista,
  despejeParaGirar,
  distanciaALaVentana,
  elColchonTapa,
  fraseDelCentro,
  girarVector,
  hayCuerpoEn,
  huellaDeLoSubido,
  indexarLaTela,
  laTelaTapa,
  lechoConLaPiel,
  leerElManifiesto,
  leerElRelieve,
  levantarLaTela,
  medidaDeLaZona,
  mismaZona,
  moverElMarco,
  ordenarLaZona,
  panoDelCaso,
  pesoDelCenido,
  posturaDeLoCosido,
  posturaDelColchon,
  radioDeLaVentana,
  rellenarElLecho,
  zonaAutomatica,
  zonaParaElCaso,
  type FormaDelRelieve,
  type MarcoDelColchon,
  type MedidasDelColchon,
  type Postura,
  type Relieve,
  type Tela,
  type VistaDeLaCamara,
  type ZonaDelPano,
} from '@/lib/campoQuirurgico'
import type { Vec3 } from '@/lib/posicionDelPaciente'

/**
 * El campo quirúrgico es geometría, y se prueba con números: una tela de juguete, un relieve de juguete y las
 * cuentas que el lienzo hace con los de verdad.
 *
 * Lo que estas pruebas guardan es lo que el dueño pidió (P-014): que el paño tape, que la ventana deje ver
 * justo lo recortado, que lo tapado no se pueda tocar y que al dar la vuelta al paciente el colchón acabe
 * donde tiene que estar.
 */

const punto = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const distancia = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/** Una tela plana a una altura, en red de triángulos de `paso`, que cubre de −medio a +medio en X y en Y. */
function telaPlana(medio: number, paso: number, altura: number | ((x: number, y: number) => number) = 0): Tela {
  const n = Math.round((2 * medio) / paso)
  const posiciones: number[] = []
  const uv: number[] = []
  const indices: number[] = []
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const x = -medio + i * paso
      const y = -medio + j * paso
      posiciones.push(x, y, typeof altura === 'number' ? altura : altura(x, y))
      uv.push(i / n, j / n)
    }
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i
      indices.push(a, a + 1, a + n + 2, a, a + n + 2, a + n + 1)
    }
  }
  return { posiciones: Float32Array.from(posiciones), uv: Float32Array.from(uv), indices: Uint32Array.from(indices) }
}

/** El área de una tela vista desde arriba, que es lo que una ventana le quita. */
function areaEnPlanta(tela: Tela): number {
  const { posiciones: p, indices } = tela
  let area = 0
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t] * 3, indices[t + 1] * 3, indices[t + 2] * 3]
    area += Math.abs((p[b] - p[a]) * (p[c + 1] - p[a + 1]) - (p[c] - p[a]) * (p[b + 1] - p[a + 1])) / 2
  }
  return area
}

/** Las aristas que solo tiene un triángulo: el contorno de la tela y el de sus agujeros. */
function aristasSueltas(tela: Tela): [number, number][] {
  const veces = new Map<string, [number, number, number]>()
  for (let t = 0; t < tela.indices.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = tela.indices[t + k]
      const b = tela.indices[t + ((k + 1) % 3)]
      const clave = a < b ? `${a}_${b}` : `${b}_${a}`
      const ya = veces.get(clave)
      if (ya) ya[2]++
      else veces.set(clave, [a, b, 1])
    }
  }
  return [...veces.values()].filter((v) => v[2] === 1).map((v) => [v[0], v[1]])
}

const FORMA: FormaDelRelieve = { x0: -0.3, y0: -0.3, paso: 0.006, nx: 100, ny: 100, unidad: 0.00002, sinDato: -32768 }

/** Un relieve de juguete: un cilindro tumbado a lo largo de Y —un muslo— sobre una sábana plana. */
function relieveDeJuguete(signo: 1 | -1 = 1, radio = 0.06): Relieve {
  const celdas = FORMA.nx * FORMA.ny
  const cuerpo = new Int16Array(celdas).fill(FORMA.sinDato)
  const lecho = new Int16Array(celdas)
  for (let j = 0; j < FORMA.ny; j++) {
    for (let i = 0; i < FORMA.nx; i++) {
      const x = FORMA.x0 + (i + 0.5) * FORMA.paso
      const y = FORMA.y0 + (j + 0.5) * FORMA.paso
      // El muslo va de y = −0,3 a y = 0,1 y ahí se acaba, como una pierna que termina en el pie.
      const hay = Math.abs(x) < radio && y < 0.1
      const alto = hay ? Math.sqrt(radio * radio - x * x) : 0
      if (hay) cuerpo[j * FORMA.nx + i] = Math.round(alto / FORMA.unidad)
      lecho[j * FORMA.nx + i] = Math.round(alto / FORMA.unidad)
    }
  }
  return { ...FORMA, signo, cuerpo, lecho }
}

const ZONA: ZonaDelPano = { xMin: -0.05, xMax: 0.07, yMin: -0.1, yMax: 0.06 }

describe('el decúbito de cada posición', () => {
  it('«de pie» sigue acostado boca arriba: nadie opera a un paciente de pie', () => {
    expect(decubitoDeLaPosicion('de-pie')).toBe('supino')
    expect(decubitoDeLaPosicion('supino')).toBe('supino')
    expect(decubitoDeLaPosicion('prono')).toBe('prono')
  })
})

describe('lo que el caso guarda del paño', () => {
  it('un caso que no dice nada lleva el paño puesto, azul y con la zona automática', () => {
    for (const vacio of [undefined, null, {}, { zona: {} }, 'x']) {
      expect(panoDelCaso(vacio)).toEqual({ apagado: false, color: 'azul', zona: null })
    }
  })

  it('la zona va y vuelve en milímetros enteros', () => {
    const guardada = zonaParaElCaso(ZONA)
    expect(guardada).toEqual({ xMin: -50, xMax: 70, yMin: -100, yMax: 60 })
    const leida = panoDelCaso({ apagado: true, color: 'verde', zona: guardada })
    expect(leida.apagado).toBe(true)
    expect(leida.color).toBe('verde')
    for (const lado of ['xMin', 'xMax', 'yMin', 'yMax'] as const) expect(leida.zona![lado]).toBeCloseTo(ZONA[lado], 9)
    expect(zonaParaElCaso(null)).toBeNull()
  })

  it('una zona a medias vale como automática, no como una ventana sin borde', () => {
    expect(panoDelCaso({ zona: { xMin: 10, xMax: 90, yMin: 5 } }).zona).toBeNull()
    expect(panoDelCaso({ zona: { xMin: 10, xMax: 90, yMin: 5, yMax: Number.NaN } }).zona).toBeNull()
    expect(panoDelCaso({ zona: { xMin: '10', xMax: 90, yMin: 5, yMax: 40 } }).zona).toBeNull()
  })

  it('un color que no existe es azul', () => {
    expect(colorDelPano('celeste')).toBe('celeste')
    expect(colorDelPano('rojo')).toBe('azul')
    expect(colorDelPano(undefined)).toBe('azul')
  })

  it('la zona sale ordenada y nunca más pequeña que su lado mínimo', () => {
    const z = ordenarLaZona({ xMin: 0.2, xMax: 0.1, yMin: 0.5, yMax: 0.505 })
    expect(z.xMin).toBeCloseTo(0.1, 12)
    expect(z.xMax).toBeCloseTo(0.2, 12)
    expect(z.yMax - z.yMin).toBeCloseTo(LADO_MINIMO_DE_LA_ZONA, 12)
    // Crece desde su centro: quien la encoge de más no la ve saltar de sitio.
    expect((z.yMin + z.yMax) / 2).toBeCloseTo(0.5025, 12)
  })

  it('acotada, cabe en lo que cubre el relieve', () => {
    const z = acotarLaZona({ xMin: -5, xMax: 5, yMin: 0.29, yMax: 9 }, FORMA)
    expect(z.xMin).toBeCloseTo(FORMA.x0, 9)
    expect(z.xMax).toBeCloseTo(FORMA.x0 + FORMA.nx * FORMA.paso, 9)
    expect(z.yMax).toBeCloseTo(FORMA.y0 + FORMA.ny * FORMA.paso, 9)
    expect(z.yMax - z.yMin).toBeGreaterThanOrEqual(LADO_MINIMO_DE_LA_ZONA - 1e-9)
  })
})

describe('el sitio del modelo en el cuerpo', () => {
  it('lee de las notas lo que el exportador escribió en ellas', () => {
    const centro: Vec3 = [-0.0984, 0.4871, 0.0123]
    const notas = `Exportado de la preparación «Rodilla» del atlas anatómico (v3), con 12 piezas.${fraseDelCentro(centro)} La piel sale recortada.`
    expect(centroDesdeLasNotas(notas)).toEqual([-0.098, 0.487, 0.012])
  })

  it('entiende el menos tipográfico y los espacios de quien retocó la nota a mano', () => {
    expect(centroDesdeLasNotas('…sumar −98,487 , -12 mm (x, y, z).')).toEqual([-0.098, 0.487, -0.012])
  })

  it('un modelo que no salió del taller no tiene sitio en el cuerpo', () => {
    expect(centroDesdeLasNotas('Tibia sintética escaneada en el laboratorio.')).toBeNull()
    expect(centroDesdeLasNotas(null)).toBeNull()
    expect(centroDesdeLasNotas(42)).toBeNull()
  })

  it('del archivo acepta tres números y nada más', () => {
    expect(centroDesdeElArchivo({ centroEnElCuerpo: [0.1, 0.9, -0.02] })).toEqual([0.1, 0.9, -0.02])
    expect(centroDesdeElArchivo({ centroEnElCuerpo: [0.1, 0.9] })).toBeNull()
    expect(centroDesdeElArchivo({ centroEnElCuerpo: [0.1, 'x', 0] })).toBeNull()
    expect(centroDesdeElArchivo({ centroEnElCuerpo: [0.1, Number.NaN, 0] })).toBeNull()
    expect(centroDesdeElArchivo(undefined)).toBeNull()
    expect(centroDesdeElArchivo({})).toBeNull()
  })

  it('un centro fuera del cuerpo del atlas no es un sitio', () => {
    expect(cabeEnElCuerpo([-0.1, 0.49, 0.01])).toBe(true)
    expect(cabeEnElCuerpo([0, 1.7, 0])).toBe(true)
    // Un modelo en milímetros: la rodilla a 490 «metros».
    expect(cabeEnElCuerpo([-98, 490, 12])).toBe(false)
    expect(cabeEnElCuerpo([0.9, 0.5, 0])).toBe(false)
  })
})

describe('el manifiesto', () => {
  const marco = { origen: [0, 0.85, -0.12], ancho: [1, 0, 0], largo: [0, 1, 0], normal: [0, 0, 1], modelo: 'campo-supino.glb', relieve: 'relieve-supino.bin', signo: 1 }
  const bueno = {
    colchon: { modelo: 'colchon.glb', ancho: 0.84, largo: 1.96, grosor: 0.11, hundimiento: 0.024, repeticionesDeLaTira: 30, altoDeLaTira: 0.18 },
    decubitos: { supino: marco, prono: { ...marco, normal: [0, 0, -1], ancho: [-1, 0, 0], signo: -1 } },
    relieve: { x0: -0.5, y0: -0.3, paso: 0.006, nx: 174, ny: 420, unidad: 0.00002, sinDato: -32768 },
    textura: { lado: 2.4, repeticionesDelRelieve: 50, repeticionesDelGrano: 3 },
  }

  it('acepta el que escribe el guion', () => {
    expect(leerElManifiesto(bueno)).not.toBeNull()
  })

  it('rechaza uno al que le falta algo, en vez de colocar el colchón en NaN', () => {
    const sin = (cambio: (m: typeof bueno) => unknown) => {
      const copia = JSON.parse(JSON.stringify(bueno)) as typeof bueno
      cambio(copia)
      return leerElManifiesto(copia)
    }
    expect(leerElManifiesto(null)).toBeNull()
    expect(leerElManifiesto('colchon')).toBeNull()
    expect(sin((m) => delete (m as Partial<typeof bueno>).colchon)).toBeNull()
    expect(sin((m) => (m.colchon.ancho = 0))).toBeNull()
    expect(sin((m) => (m.relieve.nx = 1.5))).toBeNull()
    expect(sin((m) => (m.relieve.paso = 0))).toBeNull()
    expect(sin((m) => delete (m as Partial<typeof bueno>).textura)).toBeNull()
    expect(sin((m) => (m.decubitos.prono.normal = [0, 0]))).toBeNull()
    expect(sin((m) => (m.decubitos.supino.signo = 2))).toBeNull()
    expect(sin((m) => delete (m.decubitos as Partial<typeof bueno.decubitos>).prono)).toBeNull()
  })

  it('pide cuánto se hunde el paciente, porque de ahí sale la cara del colchón que tapa', () => {
    const con = (hundimiento: unknown) => {
      const copia = JSON.parse(JSON.stringify(bueno)) as { colchon: Record<string, unknown> }
      if (hundimiento === undefined) delete copia.colchon.hundimiento
      else copia.colchon.hundimiento = hundimiento
      return leerElManifiesto(copia)
    }
    expect(con(0)).not.toBeNull()
    // Sin el dato, el colchón taparía desde el plano de apoyo y se comería dos centímetros de espalda.
    expect(con(undefined)).toBeNull()
    expect(con(-0.01)).toBeNull()
    // Hundido más que su grosor, la caja queda del revés.
    expect(con(0.11)).toBeNull()
    expect(con('0.024')).toBeNull()
  })
})

describe('el relieve', () => {
  it('se abre solo si mide lo que el manifiesto dice', () => {
    const celdas = FORMA.nx * FORMA.ny
    const bytes = new ArrayBuffer(celdas * 4)
    new Int16Array(bytes, 0, celdas).fill(100)
    new Int16Array(bytes, celdas * 2, celdas).fill(250)
    const relieve = leerElRelieve(bytes, FORMA, -1)!
    expect(relieve.signo).toBe(-1)
    expect(relieve.cuerpo[7]).toBe(100)
    expect(relieve.lecho[celdas - 1]).toBe(250)
    expect(leerElRelieve(new ArrayBuffer(celdas * 4 - 2), FORMA, 1)).toBeNull()
    expect(leerElRelieve(new ArrayBuffer(celdas * 6), FORMA, 1)).toBeNull()
  })

  it('interpola entre los centros de las celdas', () => {
    const rejilla = new Int16Array(FORMA.nx * FORMA.ny)
    // Una rampa en X: la altura de cada celda es la x de su centro.
    for (let j = 0; j < FORMA.ny; j++) for (let i = 0; i < FORMA.nx; i++) rejilla[j * FORMA.nx + i] = Math.round((FORMA.x0 + (i + 0.5) * FORMA.paso) / FORMA.unidad)
    for (const x of [-0.2, -0.0031, 0.0, 0.1234, 0.25]) expect(alturaEn(FORMA, rejilla, x, 0.05)).toBeCloseTo(x, 4)
  })

  it('donde falta una celda reparte entre las demás, y donde faltan todas no inventa', () => {
    const rejilla = new Int16Array(FORMA.nx * FORMA.ny).fill(FORMA.sinDato)
    rejilla[50 * FORMA.nx + 50] = 500
    const x = FORMA.x0 + 50.5 * FORMA.paso
    const y = FORMA.y0 + 50.5 * FORMA.paso
    expect(alturaEn(FORMA, rejilla, x + 0.002, y - 0.002)).toBeCloseTo(0.01, 9)
    expect(alturaEn(FORMA, rejilla, x + 0.03, y)).toBeNaN()
    expect(alturaEn(FORMA, rejilla, 5, 5)).toBeNaN()
  })

  it('sabe dónde hay cuerpo', () => {
    const relieve = relieveDeJuguete()
    expect(hayCuerpoEn(relieve, 0, 0)).toBe(true)
    expect(hayCuerpoEn(relieve, 0.2, 0)).toBe(false)
    expect(hayCuerpoEn(relieve, 0, 0.2)).toBe(false)
    expect(hayCuerpoEn(relieve, 9, 9)).toBe(false)
  })
})

describe('la zona automática', () => {
  const caja = { min: [-0.04, -0.2, 0] as Vec3, max: [0.04, 0.0, 0.05] as Vec3 }

  it('es la caja de lo recortado, vista desde arriba', () => {
    expect(zonaAutomatica(caja)).toEqual({ xMin: -0.04, xMax: 0.04, yMin: -0.2, yMax: 0.0 })
  })

  it('donde el cuerpo sigue no se abre: el extremo cortado queda bajo el paño', () => {
    const z = zonaAutomatica(caja, relieveDeJuguete())
    // Hacia −Y y hacia +Y el muslo sigue (se acaba en y = 0,1); hacia los lados, con 6 cm de radio, también hay
    // piel a 4,5 cm del borde de una caja de 4.
    expect(z.yMin).toBeCloseTo(-0.2, 9)
    expect(z.yMax).toBeCloseTo(0.0, 9)
  })

  it('donde el cuerpo se acaba se abre un poco más, para no morder la punta', () => {
    // La caja de los huesos llega a y = 0,09 y la piel a 0,1: es la punta del miembro.
    const z = zonaAutomatica({ min: [-0.04, -0.1, 0], max: [0.04, 0.09, 0.05] }, relieveDeJuguete())
    expect(z.yMax).toBeCloseTo(0.09 + HOLGURA_DONDE_ACABA_EL_CUERPO, 9)
    expect(z.yMin).toBeCloseTo(-0.1, 9)
    // Y un miembro apenas más ancho que su caja: el borde cae en la ladera, a medio centímetro del contorno, y
    // se corre hasta la sábana.
    const fino = zonaAutomatica({ min: [-0.04, -0.2, 0], max: [0.04, 0, 0.05] }, relieveDeJuguete(1, 0.045))
    expect(fino.xMin).toBeCloseTo(-0.04 - HOLGURA_DONDE_ACABA_EL_CUERPO, 9)
    expect(fino.xMax).toBeCloseTo(0.04 + HOLGURA_DONDE_ACABA_EL_CUERPO, 9)
  })

  it('con el borde encima del cuerpo, lejos del contorno, no se corre: el paño pisa la piel', () => {
    // Una caja de 4 cm de medio ancho sobre un tronco de 12 de radio: el contorno queda a 8 cm.
    const z = zonaAutomatica(caja, relieveDeJuguete(1, 0.12))
    expect(z.xMin).toBeCloseTo(-0.04, 9)
    expect(z.xMax).toBeCloseTo(0.04, 9)
  })

  it('con el contorno a dos centímetros se corre hasta pasarlo: es la planta del pie bajo el calcáneo', () => {
    // El muslo de juguete acaba en y = 0,1 y la caja de sus huesos en 0,07: tres centímetros de almohadillado.
    const z = zonaAutomatica({ min: [-0.04, -0.1, 0], max: [0.04, 0.07, 0.05] }, relieveDeJuguete())
    expect(z.yMax).toBeGreaterThan(0.1 + 0.005)
    expect(z.yMax).toBeLessThan(0.1 + 0.02)
    // A los lados, con el contorno también a dos centímetros, igual.
    expect(z.xMax).toBeGreaterThan(0.06 + 0.005)
    expect(z.xMin).toBeLessThan(-0.06 - 0.005)
  })

  it('entre las dos piernas el borde se queda a medio hueco, sin destapar la de al lado', () => {
    // Dos piernas a lo largo de Y: la derecha de x = −0,13 a −0,02 y la izquierda de 0,016 a 0,13. Es lo que
    // midió el primer caso de prueba: un hueco de tres centímetros y medio.
    const celdas = FORMA.nx * FORMA.ny
    const cuerpo = new Int16Array(celdas).fill(FORMA.sinDato)
    const lecho = new Int16Array(celdas)
    for (let j = 0; j < FORMA.ny; j++) {
      for (let i = 0; i < FORMA.nx; i++) {
        const x = FORMA.x0 + (i + 0.5) * FORMA.paso
        if ((x > -0.13 && x < -0.02) || (x > 0.016 && x < 0.13)) cuerpo[j * FORMA.nx + i] = 2000
      }
    }
    const dosPiernas: Relieve = { ...FORMA, signo: 1, cuerpo, lecho }
    const z = zonaAutomatica({ min: [-0.128, -0.25, 0], max: [-0.022, 0.25, 0.05] }, dosPiernas)
    // Por dentro: pasado el contorno de la derecha y sin llegar a la izquierda, hacia la mitad.
    expect(z.xMax).toBeGreaterThan(-0.02 + 0.005)
    expect(z.xMax).toBeLessThan(0.016 - 0.005)
    // Por fuera no hay nada más: la holgura entera.
    expect(z.xMin).toBeCloseTo(-0.128 - HOLGURA_DONDE_ACABA_EL_CUERPO, 9)
    // Y a lo largo las piernas siguen.
    expect(z.yMin).toBeCloseTo(-0.25, 9)
    expect(z.yMax).toBeCloseTo(0.25, 9)
  })

  it('por donde se sale del colchón, la ventana se abre hasta el final del paño', () => {
    // El colchón de boca abajo de verdad: acaba en y = 0,085 y los pies cuelgan.
    const prono: MarcoDelColchon = { origen: [0, 1.065, 0.108085], ancho: [-1, 0, 0], largo: [0, 0.99958, 0.028988], normal: [0, 0.028988, -0.99958] }
    const medidas = { ancho: 0.84, largo: 1.96 }
    const pierna: ZonaDelPano = { xMin: -0.156, xMax: 0.002, yMin: -0.016, yMax: 0.534 }
    const abierta = abrirPorDondeCuelga(pierna, prono, medidas)
    // Hacia los pies, en U; los otros tres lados, donde estaban.
    expect(abierta.yMin).toBeLessThan(-5)
    expect(abierta).toMatchObject({ xMin: -0.156, xMax: 0.002, yMax: 0.534 })
    // Boca arriba el colchón llega más allá de los talones, y la misma ventana cabe entera.
    const supino: MarcoDelColchon = { origen: [0, 0.85, -0.122745], ancho: [1, 0, 0], largo: [0, 0.999559, -0.029687], normal: [0, 0.029687, 0.999559] }
    expect(abrirPorDondeCuelga(pierna, supino, medidas)).toEqual(pierna)
    // Y una mano que cuelga por el costado abre ese lado.
    const mano = abrirPorDondeCuelga({ xMin: -0.47, xMax: -0.3, yMin: 0.7, yMax: 0.9 }, supino, medidas)
    expect(mano.xMin).toBeLessThan(-5)
    expect(mano).toMatchObject({ xMax: -0.3, yMin: 0.7, yMax: 0.9 })
    // A menos de tres centímetros del canto ya cuenta: la tela empieza a doblarse antes de caer.
    expect(abrirPorDondeCuelga({ ...pierna, yMin: 0.1 }, prono, medidas).yMin).toBeLessThan(-5)
    expect(abrirPorDondeCuelga({ ...pierna, yMin: 0.13 }, prono, medidas).yMin).toBe(0.13)
  })

  it('en el corte de una rodilla mandan los puntos de encima del muslo, no los de las esquinas', () => {
    // La caja es más ancha que el muslo: sus dos extremos caen fuera, y aun así el miembro sigue.
    const ancha = zonaAutomatica({ min: [-0.075, -0.2, 0], max: [0.075, 0, 0.05] }, relieveDeJuguete())
    expect(ancha.yMin).toBeCloseTo(-0.2, 9)
    expect(ancha.yMax).toBeCloseTo(0, 9)
  })
})

describe('el borde de la ventana', () => {
  it('la distancia es negativa dentro, cero en el borde y positiva fuera', () => {
    expect(distanciaALaVentana(ZONA, 0.01, -0.02)).toBeLessThan(0)
    expect(distanciaALaVentana(ZONA, ZONA.xMax, -0.02)).toBeCloseTo(0, 9)
    expect(distanciaALaVentana(ZONA, ZONA.xMax + 0.03, -0.02)).toBeCloseTo(0.03, 9)
    expect(distanciaALaVentana(ZONA, 0.01, ZONA.yMin - 0.012)).toBeCloseTo(0.012, 9)
  })

  it('las esquinas son redondas: la esquina del rectángulo queda fuera', () => {
    const r = radioDeLaVentana(ZONA)
    expect(distanciaALaVentana(ZONA, ZONA.xMax, ZONA.yMax)).toBeCloseTo(r * (Math.SQRT2 - 1), 9)
    // Y el radio se encoge con la ventana: nunca pasa de medio lado.
    expect(radioDeLaVentana({ xMin: 0, xMax: 0.03, yMin: 0, yMax: 0.2 })).toBeCloseTo(0.015, 12)
  })

  it('el contorno recorre el borde entero, sin saltos y en sentido antihorario', () => {
    const contorno = contornoDeLaVentana(ZONA, 0.005)
    let area = 0
    for (let k = 0; k < contorno.length; k++) {
      const [x1, y1] = contorno[k]
      const [x2, y2] = contorno[(k + 1) % contorno.length]
      expect(Math.abs(distanciaALaVentana(ZONA, x1, y1))).toBeLessThan(1e-9)
      expect(Math.hypot(x2 - x1, y2 - y1)).toBeLessThanOrEqual(0.005 + 1e-9)
      area += (x1 * y2 - x2 * y1) / 2
    }
    const r = radioDeLaVentana(ZONA)
    const exacta = (ZONA.xMax - ZONA.xMin) * (ZONA.yMax - ZONA.yMin) - (4 - Math.PI) * r * r
    // Positiva es antihoraria; y la del polígono inscrito queda un pelo por debajo de la exacta.
    expect(area).toBeGreaterThan(exacta * 0.998)
    expect(area).toBeLessThanOrEqual(exacta + 1e-12)
  })
})

describe('el marco con que el médico mueve la ventana', () => {
  it('tiene un asa en medio de cada borde y otra en el centro, todas con nombre', () => {
    const asas = asasDelMarco(ZONA)
    expect(asas.xMin[0]).toBe(ZONA.xMin)
    expect(asas.xMin[1]).toBeCloseTo(-0.02, 12)
    expect(asas.xMax[0]).toBe(ZONA.xMax)
    expect(asas.xMax[1]).toBeCloseTo(-0.02, 12)
    expect(asas.yMin[1]).toBe(ZONA.yMin)
    expect(asas.yMax[1]).toBe(ZONA.yMax)
    expect(asas.centro[0]).toBeCloseTo(0.01, 12)
    expect(asas.centro[1]).toBeCloseTo(-0.02, 12)
    for (const asa of ASAS_DEL_MARCO) expect(NOMBRE_DEL_ASA[asa].length).toBeGreaterThan(10)
    // Los nombres hablan del cuerpo, que no cambia al girar la cámara: la derecha del paciente es la X negativa.
    expect(NOMBRE_DEL_ASA.xMin).toMatch(/derecha del paciente/)
    expect(NOMBRE_DEL_ASA.yMax).toMatch(/cabeza/)
  })

  it('un borde se mueve solo, y los otros tres se quedan', () => {
    const z = moverElMarco(ZONA, 'yMax', [0.2, 0.1234], FORMA)
    expect(z).toEqual({ ...ZONA, yMax: 0.123 })
    expect(moverElMarco(ZONA, 'xMin', [-0.0816, 9], FORMA)).toEqual({ ...ZONA, xMin: -0.082 })
  })

  it('un borde no cruza al de enfrente: se para a un lado mínimo de él', () => {
    expect(moverElMarco(ZONA, 'xMin', [0.5, 0], FORMA).xMin).toBeCloseTo(ZONA.xMax - LADO_MINIMO_DE_LA_ZONA, 9)
    expect(moverElMarco(ZONA, 'xMax', [-0.5, 0], FORMA).xMax).toBeCloseTo(ZONA.xMin + LADO_MINIMO_DE_LA_ZONA, 9)
    expect(moverElMarco(ZONA, 'yMin', [0, 0.5], FORMA).yMin).toBeCloseTo(ZONA.yMax - LADO_MINIMO_DE_LA_ZONA, 9)
    expect(moverElMarco(ZONA, 'yMax', [0, -0.5], FORMA).yMax).toBeCloseTo(ZONA.yMin + LADO_MINIMO_DE_LA_ZONA, 9)
  })

  it('ningún borde sale de lo que cubre el relieve', () => {
    const xFin = FORMA.x0 + FORMA.nx * FORMA.paso
    const yFin = FORMA.y0 + FORMA.ny * FORMA.paso
    expect(moverElMarco(ZONA, 'xMin', [-9, 0], FORMA).xMin).toBeCloseTo(FORMA.x0, 9)
    expect(moverElMarco(ZONA, 'xMax', [9, 0], FORMA).xMax).toBeCloseTo(xFin, 9)
    expect(moverElMarco(ZONA, 'yMin', [0, -9], FORMA).yMin).toBeCloseTo(FORMA.y0, 9)
    expect(moverElMarco(ZONA, 'yMax', [0, 9], FORMA).yMax).toBeCloseTo(yFin, 9)
  })

  it('el centro se lleva la ventana entera con su tamaño, y contra el final del paño se para sin encogerse', () => {
    const movida = moverElMarco(ZONA, 'centro', [0.11, 0.03], FORMA)
    expect(movida.xMax - movida.xMin).toBeCloseTo(ZONA.xMax - ZONA.xMin, 9)
    expect(movida.yMax - movida.yMin).toBeCloseTo(ZONA.yMax - ZONA.yMin, 9)
    expect((movida.xMin + movida.xMax) / 2).toBeCloseTo(0.11, 9)
    expect((movida.yMin + movida.yMax) / 2).toBeCloseTo(0.03, 9)
    const alFondo = moverElMarco(ZONA, 'centro', [9, -9], FORMA)
    expect(alFondo.xMax).toBeCloseTo(FORMA.x0 + FORMA.nx * FORMA.paso, 9)
    expect(alFondo.yMin).toBeCloseTo(FORMA.y0, 9)
    expect(alFondo.xMax - alFondo.xMin).toBeCloseTo(ZONA.xMax - ZONA.xMin, 9)
    expect(alFondo.yMax - alFondo.yMin).toBeCloseTo(ZONA.yMax - ZONA.yMin, 9)
  })

  it('sale al milímetro, que es como se guarda', () => {
    const z = moverElMarco({ xMin: -0.05004, xMax: 0.07003, yMin: -0.1, yMax: 0.06 }, 'yMin', [0, -0.12349], FORMA)
    for (const v of Object.values(z)) expect(Math.abs(v * 1000 - Math.round(v * 1000))).toBeLessThan(1e-9)
    expect(z.yMin).toBeCloseTo(-0.123, 9)
  })

  it('el rayo del puntero cruza el plano del asa donde tiene que cruzarlo', () => {
    // Desde un metro de alto, recto hacia abajo y en diagonal.
    expect(cruceConElPlano([0.2, -0.1, 1], [0, 0, -1], 0.05)).toEqual([0.2, -0.1])
    const cruce = cruceConElPlano([0, 0, 1], [0.3, 0.4, -1], 0)!
    expect(cruce[0]).toBeCloseTo(0.3, 12)
    expect(cruce[1]).toBeCloseTo(0.4, 12)
    // Boca abajo la cámara mira desde −Z: vale igual.
    expect(cruceConElPlano([0, 0, -1], [0.1, 0, 2], -0.5)![0]).toBeCloseTo(0.025, 12)
  })

  it('con la cámara de canto, o mirando para otro lado, no hay cruce que valga', () => {
    // A ras del plano el cruce existe, pero cae a metros: el borde saltaría hasta el final del paño.
    expect(cruceConElPlano([0, 0, 0.1], [1, 0, -0.05], 0)).toBeNull()
    expect(cruceConElPlano([0, 0, 1], [0, 0, 1], 0)).toBeNull()
    expect(cruceConElPlano([0, 0, 1], [0, 0, 0], 0)).toBeNull()
  })

  it('dice el tamaño de la ventana como se le dice a una persona', () => {
    expect(medidaDeLaZona({ xMin: -0.156, xMax: 0.002, yMin: -0.016, yMax: 0.534 })).toBe('16 × 55 cm')
    expect(medidaDeLaZona(ZONA)).toBe('12 × 16 cm')
  })

  it('dos zonas son la misma si no las separa ni medio milímetro', () => {
    expect(mismaZona(ZONA, { ...ZONA, xMin: ZONA.xMin + 0.0004 })).toBe(true)
    expect(mismaZona(ZONA, { ...ZONA, xMin: ZONA.xMin + 0.001 })).toBe(false)
    expect(mismaZona(null, null)).toBe(true)
    expect(mismaZona(ZONA, null)).toBe(false)
    expect(mismaZona(null, ZONA)).toBe(false)
  })
})

describe('cortar la ventana en la tela', () => {
  const tela = telaPlana(0.2, 0.008)
  const cortada = abrirLaVentana(tela, ZONA)

  it('quita justo el área de la ventana', () => {
    const r = radioDeLaVentana(ZONA)
    const ventana = (ZONA.xMax - ZONA.xMin) * (ZONA.yMax - ZONA.yMin) - (4 - Math.PI) * r * r
    // Los lados rectos salen exactos; lo que sobra es lo que la cuerda de cada triángulo le quita al arco.
    expect(areaEnPlanta(tela) - areaEnPlanta(cortada)).toBeGreaterThan(ventana * 0.995)
    expect(areaEnPlanta(tela) - areaEnPlanta(cortada)).toBeLessThanOrEqual(ventana + 1e-9)
  })

  it('no deja un solo triángulo dentro, ni toca los que estaban lejos', () => {
    const { posiciones: p, indices } = cortada
    for (let t = 0; t < indices.length; t += 3) {
      const x = (p[indices[t] * 3] + p[indices[t + 1] * 3] + p[indices[t + 2] * 3]) / 3
      const y = (p[indices[t] * 3 + 1] + p[indices[t + 1] * 3 + 1] + p[indices[t + 2] * 3 + 1]) / 3
      // En las esquinas el corte va por cuerdas del arco, y el centro de un triángulo pegado a una cuerda
      // queda dentro del arco por la flecha de esa cuerda: menos de medio milímetro.
      expect(distanciaALaVentana(ZONA, x, y)).toBeGreaterThan(-0.0005)
    }
    // Los vértices de la tela original siguen donde estaban y con su índice: solo se añaden al final.
    expect(Array.from(cortada.posiciones.slice(0, tela.posiciones.length))).toEqual(Array.from(tela.posiciones))
  })

  it('sale cosida: el único borde nuevo es el de la ventana, y está sobre ella', () => {
    const sueltasAntes = aristasSueltas(tela).length
    const sueltas = aristasSueltas(cortada)
    const delHueco = sueltas.filter(([a, b]) => {
      const medioX = (cortada.posiciones[a * 3] + cortada.posiciones[b * 3]) / 2
      return Math.abs(medioX) < 0.19 && Math.abs((cortada.posiciones[a * 3 + 1] + cortada.posiciones[b * 3 + 1]) / 2) < 0.19
    })
    expect(sueltas.length - delHueco.length).toBe(sueltasAntes)
    expect(delHueco.length).toBeGreaterThan(40)
    // Cada vértice del hueco está en el borde de la ventana, y cada uno lo comparten exactamente dos aristas:
    // el borde es una sola línea cerrada, sin juntas en T.
    const veces = new Map<number, number>()
    for (const [a, b] of delHueco) {
      for (const v of [a, b]) {
        veces.set(v, (veces.get(v) ?? 0) + 1)
        expect(Math.abs(distanciaALaVentana(ZONA, cortada.posiciones[v * 3], cortada.posiciones[v * 3 + 1]))).toBeLessThan(2e-6)
      }
    }
    expect([...veces.values()].every((n) => n === 2)).toBe(true)
  })

  it('interpola la altura y la textura de los vértices nuevos', () => {
    const inclinada = telaPlana(0.2, 0.008, (x, y) => 0.3 * x - 0.1 * y + 0.05)
    const salida = abrirLaVentana(inclinada, ZONA)
    for (let k = inclinada.posiciones.length / 3; k < salida.posiciones.length / 3; k++) {
      const [x, y, z] = [salida.posiciones[k * 3], salida.posiciones[k * 3 + 1], salida.posiciones[k * 3 + 2]]
      expect(z).toBeCloseTo(0.3 * x - 0.1 * y + 0.05, 5)
      expect(salida.uv[k * 2]).toBeCloseTo((x + 0.2) / 0.4, 4)
      expect(salida.uv[k * 2 + 1]).toBeCloseTo((y + 0.2) / 0.4, 4)
    }
  })

  it('conserva el sentido de los triángulos', () => {
    const { posiciones: p, indices } = cortada
    for (let t = 0; t < indices.length; t += 3) {
      const [a, b, c] = [indices[t] * 3, indices[t + 1] * 3, indices[t + 2] * 3]
      expect((p[b] - p[a]) * (p[c + 1] - p[a + 1]) - (p[c] - p[a]) * (p[b + 1] - p[a + 1])).toBeGreaterThanOrEqual(0)
    }
  })

  it('una ventana fuera de la tela la deja como estaba', () => {
    expect(abrirLaVentana(tela, { xMin: 0.5, xMax: 0.6, yMin: 0.5, yMax: 0.6 })).toBe(tela)
  })
})

describe('ceñir el borde', () => {
  it('ciñe del todo en el borde y nada pasada la franja', () => {
    expect(pesoDelCenido(-0.01)).toBe(1)
    expect(pesoDelCenido(0)).toBe(1)
    expect(pesoDelCenido(0.004)).toBe(1)
    expect(pesoDelCenido(ANCHO_DEL_CENIDO / 2)).toBeGreaterThan(0)
    expect(pesoDelCenido(ANCHO_DEL_CENIDO / 2)).toBeLessThan(1)
    expect(pesoDelCenido(ANCHO_DEL_CENIDO)).toBe(0)
    expect(pesoDelCenido(1)).toBe(0)
  })

  for (const signo of [1, -1] as const) {
    it(`baja el paño hasta el lecho junto a la ventana, ${signo > 0 ? 'boca arriba' : 'boca abajo'}`, () => {
      const relieve = relieveDeJuguete(signo)
      // Una carpa plana a 9 cm, por encima del muslo de 6.
      const tela = abrirLaVentana(telaPlana(0.25, 0.008, signo * 0.09), ZONA)
      const antes = tela.posiciones.slice()
      cenirAlBorde(tela, ZONA, relieve)
      let enElBorde = 0
      for (let i = 0; i < tela.posiciones.length; i += 3) {
        const [x, y] = [tela.posiciones[i], tela.posiciones[i + 1]]
        const d = distanciaALaVentana(ZONA, x, y)
        if (d < -1e-6) continue
        const altura = signo * tela.posiciones[i + 2]
        const lecho = alturaEn(relieve, relieve.lecho, x, y)
        // Nunca sube, y nunca baja del lecho más su claro.
        expect(altura).toBeLessThanOrEqual(signo * antes[i + 2] + 1e-7)
        expect(altura).toBeGreaterThanOrEqual(lecho + CLARO_DEL_CENIDO - 1e-6)
        if (d < 0.004) {
          enElBorde++
          expect(altura).toBeCloseTo(lecho + CLARO_DEL_CENIDO, 5)
        }
        if (d > ANCHO_DEL_CENIDO) expect(tela.posiciones[i + 2]).toBe(antes[i + 2])
      }
      expect(enElBorde).toBeGreaterThan(40)
    })
  }

  it('no sube lo que ya cuelga por debajo del lecho', () => {
    const relieve = relieveDeJuguete()
    const tela = telaPlana(0.25, 0.008, -0.03)
    const antes = tela.posiciones.slice()
    cenirAlBorde(tela, ZONA, relieve)
    expect(Array.from(tela.posiciones)).toEqual(Array.from(antes))
  })
})

/**
 * Lo más que la tela ceñida se mete bajo el lecho, mirando a lo largo de las aristas y en el centro de cada
 * triángulo. Solo cuenta donde la tela sin ceñir pasaba por encima: lo que ya colgaba por debajo no lo hundió nadie.
 */
function hundimiento(tela: Tela, sinCenir: Float32Array, relieve: Relieve): number {
  const p = tela.posiciones
  const pesos: [number, number, number][] = [
    [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3],
    [0.75, 0.25, 0], [0.25, 0.75, 0], [0, 0.75, 0.25], [0, 0.25, 0.75], [0.25, 0, 0.75], [0.75, 0, 0.25],
  ]
  let peor = 0
  for (let t = 0; t < tela.indices.length; t += 3) {
    const ids = [tela.indices[t], tela.indices[t + 1], tela.indices[t + 2]]
    for (const w of pesos) {
      let [x, y, antes, ahora] = [0, 0, 0, 0]
      for (let k = 0; k < 3; k++) {
        x += w[k] * p[ids[k] * 3]
        y += w[k] * p[ids[k] * 3 + 1]
        antes += w[k] * relieve.signo * sinCenir[ids[k] * 3 + 2]
        ahora += w[k] * relieve.signo * p[ids[k] * 3 + 2]
      }
      const lecho = alturaEn(relieve, relieve.lecho, x, y)
      if (antes >= lecho) peor = Math.max(peor, lecho - ahora)
    }
  }
  return peor
}

/** Un relieve con una pared de verdad: un miembro de ocho centímetros de alto y caras rectas, a lo largo de Y. */
function relieveConPared(alto = 0.08, medioAncho = 0.06): Relieve {
  const celdas = FORMA.nx * FORMA.ny
  const cuerpo = new Int16Array(celdas).fill(FORMA.sinDato)
  const lecho = new Int16Array(celdas)
  for (let j = 0; j < FORMA.ny; j++) {
    for (let i = 0; i < FORMA.nx; i++) {
      if (Math.abs(FORMA.x0 + (i + 0.5) * FORMA.paso) >= medioAncho) continue
      cuerpo[j * FORMA.nx + i] = lecho[j * FORMA.nx + i] = Math.round(alto / FORMA.unidad)
    }
  }
  return { ...FORMA, signo: 1, cuerpo, lecho }
}

describe('afinar la tela junto a la ventana', () => {
  // El borde de la ventana cruza el miembro de lado a lado: la tela ceñida sube por una cara, pasa por encima y
  // baja por la otra, y en las dos caras las cuerdas de los triángulos cortan por dentro.
  // Con los bordes fuera de la red de la tela: un corte que pasa justo por sus vértices deja triángulos sin área,
  // que no estorban al paño pero sí a las cuentas de estas pruebas.
  const ATRAVESADA: ZonaDelPano = { xMin: -0.153, xMax: 0.147, yMin: -0.203, yMax: -0.047 }
  const relieve = relieveConPared()
  // A 12,5 mm, para que la tela vaya justo de −0,25 a 0,25: las de pabellón llegan con aristas de 9 a 14.
  const cortada = abrirLaVentana(telaPlana(0.25, 0.0125, 0.12), ATRAVESADA)
  const afinada = afinarElBorde(cortada, ATRAVESADA, relieve)

  it('parte triángulos, y solo añade vértices: los que había siguen donde estaban', () => {
    expect(afinada).not.toBe(cortada)
    expect(afinada.indices.length).toBeGreaterThan(cortada.indices.length)
    expect(Array.from(afinada.posiciones.slice(0, cortada.posiciones.length))).toEqual(Array.from(cortada.posiciones))
    expect(afinada.uv.length / 2).toBe(afinada.posiciones.length / 3)
  })

  it('no cambia lo que la tela cubre ni el sentido de sus triángulos', () => {
    expect(areaEnPlanta(afinada)).toBeCloseTo(areaEnPlanta(cortada), 9)
    const { posiciones: p, indices } = afinada
    for (let t = 0; t < indices.length; t += 3) {
      const [a, b, c] = [indices[t] * 3, indices[t + 1] * 3, indices[t + 2] * 3]
      expect((p[b] - p[a]) * (p[c + 1] - p[a + 1]) - (p[c] - p[a]) * (p[b + 1] - p[a + 1])).toBeGreaterThan(0)
    }
  })

  it('sale cosida: ni una junta en T, los únicos bordes son los que la tela ya tenía', () => {
    // Una arista partida para un triángulo y entera para su vecino dejaría dos aristas sueltas en medio de la tela.
    const sueltas = aristasSueltas(afinada)
    expect(sueltas.length).toBeGreaterThan(aristasSueltas(cortada).length)
    for (const [a, b] of sueltas) {
      const x = (afinada.posiciones[a * 3] + afinada.posiciones[b * 3]) / 2
      const y = (afinada.posiciones[a * 3 + 1] + afinada.posiciones[b * 3 + 1]) / 2
      const enLaOrilla = Math.abs(Math.abs(x) - 0.25) < 1e-6 || Math.abs(Math.abs(y) - 0.25) < 1e-6
      // En las esquinas redondas el borde va por cuerdas del arco, y el medio de una cuerda queda un par de milímetros dentro.
      const enLaVentana = Math.abs(distanciaALaVentana(ATRAVESADA, x, y)) < 3e-3
      expect(enLaOrilla || enLaVentana).toBe(true)
    }
  })

  it('pone los vértices nuevos sobre la tela que había, con su textura', () => {
    const inclinada = abrirLaVentana(telaPlana(0.25, 0.0125, (x, y) => 0.2 * x - 0.1 * y + 0.15), ATRAVESADA)
    const salida = afinarElBorde(inclinada, ATRAVESADA, relieve)
    expect(salida.posiciones.length).toBeGreaterThan(inclinada.posiciones.length)
    for (let k = inclinada.posiciones.length / 3; k < salida.posiciones.length / 3; k++) {
      const [x, y, z] = [salida.posiciones[k * 3], salida.posiciones[k * 3 + 1], salida.posiciones[k * 3 + 2]]
      expect(z).toBeCloseTo(0.2 * x - 0.1 * y + 0.15, 5)
      expect(salida.uv[k * 2]).toBeCloseTo((x + 0.25) / 0.5, 4)
      expect(salida.uv[k * 2 + 1]).toBeCloseTo((y + 0.25) / 0.5, 4)
    }
  })

  it('junto a la ventana no deja aristas largas', () => {
    const { posiciones: p, indices } = afinada
    const radio = radioDeLaVentana(ATRAVESADA)
    let miradas = 0
    for (let t = 0; t < indices.length; t += 3) {
      for (let k = 0; k < 3; k++) {
        const [a, b] = [indices[t + k] * 3, indices[t + ((k + 1) % 3)] * 3]
        const cerca = Math.max(pesoDelCenido(distanciaALaVentana(ATRAVESADA, p[a], p[a + 1], radio)), pesoDelCenido(distanciaALaVentana(ATRAVESADA, p[b], p[b + 1], radio)))
        // Bien dentro de la mitad ceñida: justo en la raya del 0,5 puede quedar la diagonal de un triángulo que se
        // partió en la última pasada, con un extremo a cada lado.
        if (cerca <= 0.6) continue
        miradas++
        expect(Math.hypot(p[b] - p[a], p[b + 1] - p[a + 1])).toBeLessThanOrEqual(ARISTA_JUNTO_A_LA_VENTANA + 1e-6)
      }
    }
    expect(miradas).toBeGreaterThan(500)
  })

  it('es para lo que se hizo: ceñida, la tela ya no corta por dentro del miembro', () => {
    const tosca: Tela = { ...cortada, posiciones: cortada.posiciones.slice() }
    cenirAlBorde(tosca, ATRAVESADA, relieve)
    const fina: Tela = { ...afinada, posiciones: afinada.posiciones.slice() }
    cenirAlBorde(fina, ATRAVESADA, relieve)
    const sinAfinar = hundimiento(tosca, cortada.posiciones, relieve)
    const afinando = hundimiento(fina, afinada.posiciones, relieve)
    // Sin afinar, la cuerda de un triángulo de doce milímetros pasa centímetros por dentro de la pierna.
    expect(sinAfinar).toBeGreaterThan(0.02)
    // Afinada queda lo que da de sí la rejilla: una pared de ocho centímetros en una celda de seis milímetros.
    expect(afinando).toBeLessThan(0.012)
    expect(afinando).toBeLessThan(sinAfinar / 3)
  })

  it('donde no hay nada que partir devuelve la misma tela', () => {
    // Una tela de cuatro milímetros sobre la sábana lisa: ni aristas largas ni pared que cruzar.
    const lejos: ZonaDelPano = { xMin: 0.14, xMax: 0.2, yMin: 0.14, yMax: 0.2 }
    const lisa = abrirLaVentana(telaPlana(0.1, 0.004, 0.02), lejos)
    expect(afinarElBorde(lisa, lejos, relieve)).toBe(lisa)
  })

  it('al vuelo que cuelga por debajo de la sábana solo le parte las aristas largas del borde', () => {
    const zona: ZonaDelPano = { xMin: 0.1, xMax: 0.2, yMin: -0.1, yMax: 0.05 }
    const colgando = abrirLaVentana(telaPlana(0.25, 0.0125, -0.03), zona)
    const salida = afinarElBorde(colgando, zona, relieve)
    expect(salida.posiciones.length).toBeGreaterThan(colgando.posiciones.length)
    // Ninguna cuerda «se hunde» si ya iba por debajo: todo vértice nuevo sale de una arista de junto a la ventana,
    // así que queda a menos de una arista de la mitad ceñida de la franja.
    const radio = radioDeLaVentana(zona)
    const { posiciones: p } = salida
    for (let k = colgando.posiciones.length / 3; k < p.length / 3; k++) {
      const d = distanciaALaVentana(zona, p[k * 3], p[k * 3 + 1], radio)
      expect(pesoDelCenido(Math.max(0, d - 0.018))).toBeGreaterThan(0.5)
    }
    // Y sobre la pared, con la tela posada a tres milímetros del miembro —como llega la de pabellón—, sí parte más
    // allá: es la otra regla, la de la cuerda que se hunde.
    const posada = abrirLaVentana(telaPlana(0.25, 0.0125, 0.083), ATRAVESADA)
    const partida = afinarElBorde(posada, ATRAVESADA, relieve)
    let lejosDelBorde = 0
    for (let k = posada.posiciones.length / 3; k < partida.posiciones.length / 3; k++) {
      if (pesoDelCenido(Math.max(0, distanciaALaVentana(ATRAVESADA, partida.posiciones[k * 3], partida.posiciones[k * 3 + 1]) - 0.018)) <= 0.5) lejosDelBorde++
    }
    expect(lejosDelBorde).toBeGreaterThan(0)
  })
})

/** Un parche de piel plano a una altura, en triángulos de `paso`: nueve números por triángulo, como los pide `lechoConLaPiel`. */
function parcheDePiel(x1: number, x2: number, y1: number, y2: number, altura: number | ((x: number, y: number) => number), paso = 0.004, signo: 1 | -1 = 1): number[] {
  const h = (x: number, y: number) => signo * (typeof altura === 'number' ? altura : altura(x, y))
  const salida: number[] = []
  for (let y = y1; y < y2 - 1e-9; y += paso) {
    for (let x = x1; x < x2 - 1e-9; x += paso) {
      const [xa, xb, ya, yb] = [x, Math.min(x2, x + paso), y, Math.min(y2, y + paso)]
      salida.push(xa, ya, h(xa, ya), xb, ya, h(xb, ya), xb, yb, h(xb, yb))
      salida.push(xa, ya, h(xa, ya), xb, yb, h(xb, yb), xa, yb, h(xa, yb))
    }
  }
  return salida
}

describe('la piel que se sale del atlas', () => {
  // Un bulto de dos centímetros sobre la sábana, al lado del muslo de juguete: la piel abultada sobre un fragmento.
  const BULTO = { x1: 0.09, x2: 0.13, y1: -0.05, y2: 0.01, alto: 0.02 }
  const piel = parcheDePiel(BULTO.x1, BULTO.x2, BULTO.y1, BULTO.y2, BULTO.alto)

  it('la piel que no pasa del lecho lo deja como está', () => {
    const relieve = relieveDeJuguete()
    // La propia piel del atlas, leída del relieve: ni un punto por encima.
    const delAtlas = parcheDePiel(-0.05, 0.05, -0.1, 0, (x, y) => alturaEn(relieve, relieve.lecho, x, y))
    expect(lechoConLaPiel(relieve, delAtlas)).toBeNull()
    expect(lechoConLaPiel(relieve, parcheDePiel(0.09, 0.13, -0.05, 0.01, -0.01))).toBeNull()
    expect(lechoConLaPiel(relieve, [])).toBeNull()
  })

  for (const signo of [1, -1] as const) {
    it(`sube el lecho hasta la piel que sobresale, ${signo > 0 ? 'boca arriba' : 'boca abajo'}`, () => {
      const relieve = relieveDeJuguete(signo)
      const original = relieve.lecho.slice()
      const subido = lechoConLaPiel(relieve, parcheDePiel(BULTO.x1, BULTO.x2, BULTO.y1, BULTO.y2, BULTO.alto, 0.004, signo))!
      expect(subido).not.toBeNull()
      // El lecho del relieve es de todos los paños: no se toca.
      expect(Array.from(relieve.lecho)).toEqual(Array.from(original))
      // Interpolado, el lecho nuevo no queda por debajo de la piel en ningún punto de ella.
      for (let y = BULTO.y1; y <= BULTO.y2 + 1e-9; y += 0.0013) {
        for (let x = BULTO.x1; x <= BULTO.x2 + 1e-9; x += 0.0013) {
          expect(alturaEn(subido, subido.lecho, x, y)).toBeGreaterThanOrEqual(BULTO.alto - 1e-6)
        }
      }
      // Y lejos del bulto es el de antes.
      expect(alturaEn(subido, subido.lecho, -0.1, -0.2)).toBe(alturaEn(relieve, relieve.lecho, -0.1, -0.2))
      expect(alturaEn(subido, subido.lecho, 0.16, -0.02)).toBe(alturaEn(relieve, relieve.lecho, 0.16, -0.02))
    })
  }

  it('dice qué celdas subió, y son las del bulto con un paso de más', () => {
    const relieve = relieveDeJuguete()
    const subido = lechoConLaPiel(relieve, piel)!
    const [iMin, iMax, jMin, jMax] = subido.dondeSubio
    const celda = (v: number, origen: number) => Math.floor((v - origen) / FORMA.paso)
    expect(iMin).toBeLessThanOrEqual(celda(BULTO.x1, FORMA.x0))
    expect(iMin).toBeGreaterThanOrEqual(celda(BULTO.x1, FORMA.x0) - 1)
    expect(iMax).toBeGreaterThanOrEqual(celda(BULTO.x2, FORMA.x0))
    expect(iMax).toBeLessThanOrEqual(celda(BULTO.x2, FORMA.x0) + 1)
    expect(jMin).toBeGreaterThanOrEqual(celda(BULTO.y1, FORMA.y0) - 1)
    expect(jMax).toBeLessThanOrEqual(celda(BULTO.y2, FORMA.y0) + 1)
    let subidas = 0
    for (let k = 0; k < subido.subido.length; k++) {
      if (subido.subido[k] === FORMA.sinDato) {
        expect(subido.lecho[k]).toBe(relieve.lecho[k])
        continue
      }
      subidas++
      expect(subido.lecho[k]).toBe(subido.subido[k])
      expect(subido.lecho[k]).toBeGreaterThan(relieve.lecho[k])
      const [i, j] = [k % FORMA.nx, Math.floor(k / FORMA.nx)]
      expect(i >= iMin && i <= iMax && j >= jMin && j <= jMax).toBe(true)
    }
    expect(subidas).toBeGreaterThan(40)
  })

  it('donde el relieve no tenía dato, lo pone: ahí hay ahora algo que tapar', () => {
    const relieve = relieveDeJuguete()
    const conHueco = { ...relieve, lecho: relieve.lecho.slice() }
    for (let j = 40; j < 60; j++) for (let i = 60; i < 80; i++) conHueco.lecho[j * FORMA.nx + i] = FORMA.sinDato
    // El hueco va de x = 0,06 a 0,18 y de y = −0,06 a 0,06: el bulto cae dentro.
    expect(alturaEn(conHueco, conHueco.lecho, 0.11, -0.02)).toBeNaN()
    const subido = lechoConLaPiel(conHueco, piel)!
    expect(alturaEn(subido, subido.lecho, 0.11, -0.02)).toBeCloseTo(BULTO.alto, 4)
  })

  it('un triángulo grande de piel se cubre entero, no solo en sus esquinas', () => {
    const relieve = relieveDeJuguete()
    // Cuatro centímetros de lado: siete veces una celda. La piel del atlas va a tres o cuatro milímetros.
    const subido = lechoConLaPiel(relieve, [0.09, -0.05, 0.03, 0.13, -0.05, 0.03, 0.13, -0.01, 0.03])!
    for (const [x, y] of [[0.12, -0.04], [0.125, -0.03], [0.11, -0.045], [0.128, -0.014], [0.1, -0.048]]) {
      expect(alturaEn(subido, subido.lecho, x, y)).toBeGreaterThanOrEqual(0.03 - 1e-6)
    }
  })

  it('uno descomunal no se mira punto por punto: se trocea hasta un tope, y sube donde se miró', () => {
    const relieve = relieveDeJuguete()
    // Medio metro de lado: a tres milímetros serían catorce mil puntos, y esto corre mientras se arrastra un fragmento.
    const subido = lechoConLaPiel(relieve, [0.08, -0.25, 0.03, 0.28, -0.25, 0.03, 0.28, 0.25, 0.03])!
    let subidas = 0
    for (const valor of subido.subido) if (valor !== FORMA.sinDato) subidas++
    expect(subidas).toBeGreaterThan(100)
    expect(subidas).toBeLessThan(700)
    expect(alturaEn(subido, subido.lecho, 0.28, -0.25)).toBeGreaterThanOrEqual(0.03 - 1e-6)
  })

  it('levanta la tela que el bulto atravesaría, y solo esa', () => {
    const relieve = relieveDeJuguete()
    const subido = lechoConLaPiel(relieve, piel)!
    // Una tela a un centímetro de la sábana: el bulto de dos la atraviesa.
    const tela = telaPlana(0.25, 0.012, 0.01)
    const antes = tela.posiciones.slice()
    const levantada = levantarLaTela(tela, subido)
    expect(levantada).not.toBe(tela)
    // La del archivo no se toca: de ella se cortan todas las ventanas.
    expect(Array.from(tela.posiciones)).toEqual(Array.from(antes))
    expect(levantada.indices).toBe(tela.indices)
    let levantados = 0
    for (let i = 0; i < levantada.posiciones.length; i += 3) {
      const [x, y, z] = [levantada.posiciones[i], levantada.posiciones[i + 1], levantada.posiciones[i + 2]]
      const sobreElBulto = x >= BULTO.x1 && x <= BULTO.x2 && y >= BULTO.y1 && y <= BULTO.y2
      if (sobreElBulto) expect(z).toBeGreaterThanOrEqual(BULTO.alto + CLARO_DEL_CENIDO - 1e-6)
      if (z !== antes[i + 2]) {
        levantados++
        expect(z).toBeGreaterThan(antes[i + 2])
        // Nada a más de dos pasos del bulto.
        expect(x).toBeGreaterThan(BULTO.x1 - 0.013)
        expect(x).toBeLessThan(BULTO.x2 + 0.013)
        expect(y).toBeGreaterThan(BULTO.y1 - 0.013)
        expect(y).toBeLessThan(BULTO.y2 + 0.013)
      }
    }
    expect(levantados).toBeGreaterThan(10)
  })

  it('la tela que ya pasa por encima se queda como estaba', () => {
    const subido = lechoConLaPiel(relieveDeJuguete(), piel)!
    const alta = telaPlana(0.25, 0.012, 0.09)
    expect(levantarLaTela(alta, subido)).toBe(alta)
  })

  it('no sube el vuelo que cuelga junto al bulto: fuera de lo subido el lecho es el del atlas', () => {
    const subido = lechoConLaPiel(relieveDeJuguete(), piel)!
    // Por debajo de la sábana, como el paño pasado el canto del colchón.
    const levantada = levantarLaTela(telaPlana(0.25, 0.012, -0.03), subido)
    for (let i = 0; i < levantada.posiciones.length; i += 3) {
      const [x, y] = [levantada.posiciones[i], levantada.posiciones[i + 1]]
      const lejos = x < BULTO.x1 - 0.013 || x > BULTO.x2 + 0.013 || y < BULTO.y1 - 0.013 || y > BULTO.y2 + 0.013
      if (lejos) expect(levantada.posiciones[i + 2]).toBeCloseTo(-0.03, 6)
    }
  })

  it('boca abajo levanta hacia el otro lado', () => {
    const relieve = relieveDeJuguete(-1)
    const subido = lechoConLaPiel(relieve, parcheDePiel(BULTO.x1, BULTO.x2, BULTO.y1, BULTO.y2, BULTO.alto, 0.004, -1))!
    const levantada = levantarLaTela(telaPlana(0.25, 0.012, -0.01), subido)
    let levantados = 0
    for (let i = 0; i < levantada.posiciones.length; i += 3) {
      if (levantada.posiciones[i + 2] === -0.01 || Math.abs(levantada.posiciones[i + 2] + 0.01) < 1e-7) continue
      levantados++
      expect(levantada.posiciones[i + 2]).toBeLessThan(-0.01)
    }
    expect(levantados).toBeGreaterThan(10)
  })

  it('el paño entero —levantado, cortado, afinado y ceñido— no deja asomar el bulto', () => {
    const relieve = relieveDeJuguete()
    const subido = lechoConLaPiel(relieve, piel)!
    // La ventana, sobre el muslo; su borde pasa a dos centímetros del bulto, que queda bajo la tela ceñida.
    const zona: ZonaDelPano = { xMin: -0.05, xMax: 0.07, yMin: -0.1, yMax: 0.06 }
    expect(BULTO.x1 - zona.xMax).toBeCloseTo(0.02, 9)
    let tela = abrirLaVentana(levantarLaTela(telaPlana(0.25, 0.012, 0.09), subido), zona)
    tela = afinarElBorde(tela, zona, subido)
    cenirAlBorde(tela, zona, subido)
    const p = tela.posiciones
    let sobreElBulto = 0
    for (let t = 0; t < tela.indices.length; t += 3) {
      const [a, b, c] = [tela.indices[t] * 3, tela.indices[t + 1] * 3, tela.indices[t + 2] * 3]
      // En los vértices y a media arista: ahí es donde una cuerda se mete bajo la piel.
      for (const [m, n] of [[a, a], [b, b], [c, c], [a, b], [b, c], [c, a]]) {
        const [x, y, z] = [(p[m] + p[n]) / 2, (p[m + 1] + p[n + 1]) / 2, (p[m + 2] + p[n + 2]) / 2]
        if (x < BULTO.x1 || x > BULTO.x2 || y < BULTO.y1 || y > BULTO.y2) continue
        sobreElBulto++
        expect(z).toBeGreaterThanOrEqual(BULTO.alto)
      }
    }
    expect(sobreElBulto).toBeGreaterThan(100)
    // Y sin contar con la piel, el mismo paño lo atraviesa donde va más ceñido: la prueba mide algo.
    const junto: ZonaDelPano = { ...zona, xMax: BULTO.x1 - 0.004 }
    const sinPiel = abrirLaVentana(telaPlana(0.25, 0.012, 0.09), junto)
    cenirAlBorde(sinPiel, junto, relieve)
    const conPiel = abrirLaVentana(levantarLaTela(telaPlana(0.25, 0.012, 0.09), subido), junto)
    cenirAlBorde(conPiel, junto, subido)
    const hundidos = (tela: Tela) => {
      let cuantos = 0
      for (let i = 0; i < tela.posiciones.length; i += 3) {
        const [x, y, z] = [tela.posiciones[i], tela.posiciones[i + 1], tela.posiciones[i + 2]]
        if (x >= BULTO.x1 && x <= BULTO.x2 && y >= BULTO.y1 && y <= BULTO.y2 && z < BULTO.alto) cuantos++
      }
      return cuantos
    }
    expect(hundidos(sinPiel)).toBeGreaterThan(0)
    expect(hundidos(conPiel)).toBe(0)
  })

  it('la huella cuenta lo que subió donde hay tela, y no lo de dentro de la ventana', () => {
    const relieve = relieveDeJuguete()
    const subido = lechoConLaPiel(relieve, piel)!
    expect(huellaDeLoSubido(null, ZONA)).toBe('')
    // Sin ventana todo el paño es tela: cuenta.
    expect(huellaDeLoSubido(subido, null)).not.toBe('')
    // El bulto queda fuera de esta ventana: cuenta, y con la misma piel sale la misma huella.
    expect(huellaDeLoSubido(subido, ZONA)).not.toBe('')
    expect(huellaDeLoSubido(lechoConLaPiel(relieve, piel), ZONA)).toBe(huellaDeLoSubido(subido, ZONA))
    // Con el bulto entero dentro de la ventana, lejos de su borde, no hay paño que rehacer.
    expect(huellaDeLoSubido(subido, { xMin: 0.04, xMax: 0.2, yMin: -0.12, yMax: 0.08 })).toBe('')
    // Si la piel sube otro poco, la huella cambia.
    const masAlto = lechoConLaPiel(relieve, parcheDePiel(BULTO.x1, BULTO.x2, BULTO.y1, BULTO.y2, BULTO.alto + 0.002))
    expect(huellaDeLoSubido(masAlto, ZONA)).not.toBe(huellaDeLoSubido(subido, ZONA))
    // Y si el bulto se corre, también, aunque suba las mismas celdas a otra parte.
    const corrido = lechoConLaPiel(relieve, parcheDePiel(BULTO.x1 + 0.03, BULTO.x2 + 0.03, BULTO.y1, BULTO.y2, BULTO.alto))
    expect(huellaDeLoSubido(corrido, ZONA)).not.toBe(huellaDeLoSubido(subido, ZONA))
  })
})

/**
 * Un colchón que se acaba antes que el paciente, como boca abajo: la sábana llega hasta y = −0,1 y la pierna
 * sigue hasta y = −0,2, con el pie colgando fuera. Más allá no hay dato.
 */
const FIN_DEL_COLCHON = -0.1
const SABANA = -0.08
const CANTO = -0.1
const TALON = 0.07
function relieveConElPieFuera(): Relieve {
  const celdas = FORMA.nx * FORMA.ny
  const cuerpo = new Int16Array(celdas).fill(FORMA.sinDato)
  const lecho = new Int16Array(celdas).fill(FORMA.sinDato)
  const enUnidades = (metros: number) => Math.round(metros / FORMA.unidad)
  const filaDelCanto = Math.round((FIN_DEL_COLCHON - FORMA.y0) / FORMA.paso)
  for (let j = 0; j < FORMA.ny; j++) {
    for (let i = 0; i < FORMA.nx; i++) {
      const k = j * FORMA.nx + i
      const x = FORMA.x0 + (i + 0.5) * FORMA.paso
      const y = FORMA.y0 + (j + 0.5) * FORMA.paso
      if (Math.abs(x) < 0.03 && y > -0.2) cuerpo[k] = lecho[k] = enUnidades(TALON)
      // La sábana baja por el canto del colchón: su última fila queda dos centímetros por debajo, y en un
      // tramo —como en el relieve de verdad— hasta seis.
      else if (j === filaDelCanto) lecho[k] = enUnidades(x < -0.2 ? CANTO - 0.04 : CANTO)
      else if (j > filaDelCanto) lecho[k] = enUnidades(SABANA)
    }
  }
  return { ...FORMA, signo: 1, cuerpo, lecho }
}

describe('el lecho más allá del colchón', () => {
  const relieve = relieveConElPieFuera()
  const relleno = rellenarElLecho(relieve)
  const celda = (x: number, y: number) => Math.floor((y - FORMA.y0) / FORMA.paso) * FORMA.nx + Math.floor((x - FORMA.x0) / FORMA.paso)
  const enMetros = (valor: number) => valor * FORMA.unidad

  it('un relieve sin huecos se devuelve tal cual', () => {
    const entero = relieveDeJuguete()
    expect(rellenarElLecho(entero)).toBe(entero)
  })

  it('no deja un hueco, y no toca ni el relieve que recibe ni lo que traía el archivo', () => {
    const copia = relieve.lecho.slice()
    expect(relleno).not.toBe(relieve)
    expect(relleno.cuerpo).toBe(relieve.cuerpo)
    expect(relieve.lecho).toEqual(copia)
    expect(relleno.lecho.includes(FORMA.sinDato)).toBe(false)
    for (let k = 0; k < copia.length; k++) if (copia[k] !== FORMA.sinDato) expect(relleno.lecho[k]).toBe(copia[k])
  })

  it('lejos de todo vale lo que el canto de la sábana, y vale lo mismo en todas partes', () => {
    // La mediana, no lo más bajo: el tramo en que la sábana baja seis centímetros no arrastra a lo demás.
    for (const [x, y] of [[0.2, -0.25], [-0.15, -0.2], [0.1, -0.29], [-0.28, -0.28]]) expect(enMetros(relleno.lecho[celda(x, y)])).toBeCloseTo(CANTO, 4)
  })

  it('pegado a un dato toma lo más alto de lo que toca', () => {
    // Al lado del pie, la altura del pie; bajo el canto, la del canto.
    expect(enMetros(relleno.lecho[celda(0.033, -0.15)])).toBeCloseTo(TALON, 4)
    expect(enMetros(relleno.lecho[celda(-0.033, -0.15)])).toBeCloseTo(TALON, 4)
    expect(enMetros(relleno.lecho[celda(0, -0.203)])).toBeCloseTo(TALON, 4)
    expect(enMetros(relleno.lecho[celda(0.2, -0.103)])).toBeCloseTo(CANTO, 4)
    // Y donde la sábana baja más, lo pegado a ella baja con ella aunque lo de más allá vuelva al nivel.
    expect(enMetros(relleno.lecho[celda(-0.25, -0.103)])).toBeCloseTo(CANTO - 0.04, 4)
  })

  it('el lecho repartido no baja en ningún punto donde antes tenía valor', () => {
    // Es lo que `generar.py` garantiza sobre la piel, y rellenar no puede romperlo: junto al contorno del pie
    // el reparto de antes solo contaba las celdas del pie, y el de ahora cuenta también las rellenas.
    let mirados = 0
    for (let y = -0.22; y <= -0.08; y += 0.0017) {
      for (let x = -0.05; x <= 0.05; x += 0.0017) {
        const antes = alturaEn(relieve, relieve.lecho, x, y)
        if (Number.isNaN(antes)) continue
        mirados++
        expect(alturaEn(relleno, relleno.lecho, x, y)).toBeGreaterThanOrEqual(antes - 1e-9)
      }
    }
    expect(mirados).toBeGreaterThan(1000)
  })

  it('junto al pie no cae a plomo, pero cae deprisa: a tres centímetros ya está en el nivel', () => {
    // Ocho por uno: de los siete centímetros del talón a los diez bajo cero del canto, en poco más de dos.
    const alLado = (pasos: number) => enMetros(relleno.lecho[celda(0.033 + pasos * FORMA.paso, -0.15)])
    expect(alLado(1)).toBeCloseTo(TALON - 8 * FORMA.paso, 3)
    expect(alLado(2)).toBeCloseTo(TALON - 16 * FORMA.paso, 3)
    expect(alLado(5)).toBeCloseTo(CANTO, 4)
    // Y entre dos celdas vecinas, una de ellas rellena, la rellena nunca queda más abajo que eso.
    const caida = Math.round((FORMA.paso * 8) / FORMA.unidad)
    for (let j = 1; j < FORMA.ny - 1; j++) {
      for (let i = 1; i < FORMA.nx - 1; i++) {
        const k = j * FORMA.nx + i
        if (relieve.lecho[k] !== FORMA.sinDato) continue
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
          const tope = di !== 0 && dj !== 0 ? Math.round(caida * Math.SQRT2) : caida
          expect(relleno.lecho[(j + dj) * FORMA.nx + i + di] - relleno.lecho[k]).toBeLessThanOrEqual(tope)
        }
      }
    }
  })

  it('sin sábana manda el canto del cuerpo, y sin un solo dato no hay con qué rellenar', () => {
    const soloElMiembro = relieveConPared()
    const lecho = soloElMiembro.lecho.map((valor, k) => (soloElMiembro.cuerpo[k] === FORMA.sinDato ? FORMA.sinDato : valor))
    const sinSabana = rellenarElLecho({ ...soloElMiembro, lecho })
    expect(sinSabana.lecho.includes(FORMA.sinDato)).toBe(false)
    expect(enMetros(sinSabana.lecho[celda(0.2, 0)])).toBeCloseTo(0.08, 4)

    const vacio: Relieve = { ...FORMA, signo: 1, cuerpo: new Int16Array(FORMA.nx * FORMA.ny).fill(FORMA.sinDato), lecho: new Int16Array(FORMA.nx * FORMA.ny).fill(FORMA.sinDato) }
    expect(rellenarElLecho(vacio)).toBe(vacio)
  })

  it('la ventana que cruza el final del colchón ya no deja un escalón en la tela', () => {
    // La tela cayó sobre el pie y hace carpa a su altura; la ventana va al lado del pie y sale por el final
    // del colchón. Sin rellenar, lo de encima de la sábana baja diecisiete centímetros y lo de más allá se
    // queda arriba, vértice con vértice.
    const zona: ZonaDelPano = { xMin: 0.06, xMax: 0.16, yMin: -0.22, yMax: 0.0 }
    const saltoEnElBorde = (contra: Relieve) => {
      const tela = abrirLaVentana(telaPlana(0.25, 0.0125, TALON + 0.02), zona)
      cenirAlBorde(tela, zona, contra)
      const p = tela.posiciones
      let peor = 0
      for (let t = 0; t < tela.indices.length; t += 3) {
        for (let n = 0; n < 3; n++) {
          const a = tela.indices[t + n] * 3
          const b = tela.indices[t + ((n + 1) % 3)] * 3
          // Solo las aristas que van pegadas al borde por el lado de fuera del pie: las de la franja entera
          // suben a la carpa a propósito.
          if (distanciaALaVentana(zona, p[a], p[a + 1]) > 0.004 || distanciaALaVentana(zona, p[b], p[b + 1]) > 0.004) continue
          if (p[a] < 0.15 || p[b] < 0.15) continue
          peor = Math.max(peor, Math.abs(p[a + 2] - p[b + 2]))
        }
      }
      return peor
    }
    expect(saltoEnElBorde(relieve)).toBeGreaterThan(0.15)
    expect(saltoEnElBorde(relleno)).toBeLessThan(0.03)
  })
})

describe('lo que el paño tapa', () => {
  // Una carpa a 9 cm con la ventana abierta y el borde ceñido sobre el muslo de juguete.
  const relieve = relieveDeJuguete()
  const tela = abrirLaVentana(telaPlana(0.25, 0.008, 0.09), ZONA)
  cenirAlBorde(tela, ZONA, relieve)
  const indice = indexarLaTela(tela)
  const desdeArriba = (x: number, y: number, hasta = 0.45): boolean => laTelaTapa(indice, [x, y, 0.5], [0, 0, -1], hasta)

  it('lo que asoma por la ventana se puede tocar', () => {
    expect(desdeArriba(0.01, -0.02)).toBe(false)
    expect(desdeArriba(ZONA.xMax - 0.004, ZONA.yMax - 0.03)).toBe(false)
  })

  it('lo de fuera de la ventana no', () => {
    expect(desdeArriba(0.15, 0.15)).toBe(true)
    expect(desdeArriba(-0.2, -0.02)).toBe(true)
    // A cuatro milímetros del borde el paño ya está ceñido, casi en la sábana: tapa lo que hay bajo ella…
    expect(desdeArriba(ZONA.xMax + 0.004, -0.02, 0.51)).toBe(true)
    // …y no lo que queda por encima, a 5 cm de altura.
    expect(desdeArriba(ZONA.xMax + 0.004, -0.02, 0.45)).toBe(false)
  })

  it('el paño solo tapa lo que tiene detrás', () => {
    // El rayo se para a 30 cm, antes de llegar a la tela, que está a 41 del origen: es un instrumento en el aire.
    expect(desdeArriba(0.15, 0.15, 0.3)).toBe(false)
  })

  it('un rayo oblicuo que entra por la ventana llega a lo que hay debajo', () => {
    // Desde el aire de la ventana hacia un punto de dentro del muslo que cae ya bajo el paño, ocho milímetros
    // pasado el borde: el hueso que sigue por debajo y que se ve al asomarse por la herida. El rayo cruza la
    // vertical del borde a 1,4 cm de altura, por debajo de la tela, que ahí está ceñida a 3,6.
    const origen: Vec3 = [0.04, -0.02, 0.12]
    const destino: Vec3 = [ZONA.xMin - 0.008, -0.02, 0.005]
    const hacia = (desde: Vec3): Vec3 => [destino[0] - desde[0], destino[1] - desde[1], destino[2] - desde[2]]
    expect(laTelaTapa(indice, origen, hacia(origen), 1)).toBe(false)
    // El mismo punto, mirado desde encima del paño, está tapado.
    const fuera: Vec3 = [-0.15, -0.02, 0.4]
    expect(laTelaTapa(indice, fuera, hacia(fuera), 1)).toBe(true)
    // Y también desde la ventana, si el rayo pasa por encima del borde en vez de por debajo.
    const alto: Vec3 = [0.01, -0.02, 0.4]
    expect(laTelaTapa(indice, alto, hacia(alto), 1)).toBe(true)
  })

  it('un rayo que no pasa sobre la tela no tiene nada que atravesar', () => {
    expect(laTelaTapa(indice, [2, 2, 0.5], [0, 0, -1], 1)).toBe(false)
    expect(laTelaTapa(indice, [-2, 0, 0.5], [-1, 0, 0], 5)).toBe(false)
    expect(laTelaTapa(indice, [0, 0, 0.5], [0, 0, -1], 0)).toBe(false)
  })

  it('rasante, a lo largo de toda la tela, la encuentra igual', () => {
    // A y = 0,2 no hay ventana cerca y la tela está toda a 9 cm. Un rayo horizontal a 8 cm pasa por debajo de
    // punta a punta sin tocarla…
    expect(laTelaTapa(indice, [-0.6, 0.2, 0.08], [1, 0, 0], 1.2)).toBe(false)
    // …y uno que entra por encima y va bajando la atraviesa, después de cruzar veinte casillas.
    expect(laTelaTapa(indice, [-0.6, 0.2, 0.2], [1, 0, -0.25], 1.2)).toBe(true)
  })

  it('coincide con la cuenta directa, rayo por rayo', () => {
    // Contra la fuerza bruta: todos los triángulos, sin casillas. Es lo que las casillas no pueden cambiar.
    const { posiciones: p, indices } = tela
    const bruta = (o: Vec3, d: Vec3, hasta: number) => {
      for (let t = 0; t < indices.length; t += 3) {
        const [a, b, c] = [indices[t] * 3, indices[t + 1] * 3, indices[t + 2] * 3]
        const e1: Vec3 = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]]
        const e2: Vec3 = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]]
        const h: Vec3 = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]]
        const det = punto(e1, h)
        if (Math.abs(det) < 1e-18) continue
        const s: Vec3 = [o[0] - p[a], o[1] - p[a + 1], o[2] - p[a + 2]]
        const u = punto(s, h) / det
        const q: Vec3 = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]]
        const v = punto(d, q) / det
        const donde = punto(e2, q) / det
        if (u >= 0 && v >= 0 && u + v <= 1 && donde > 0 && donde < hasta * (1 - 1e-6) - 1e-5) return true
      }
      return false
    }
    // Una semilla fija: la prueba tiene que fallar siempre igual o no fallar.
    let semilla = 12345
    const azar = () => {
      semilla = (semilla * 1664525 + 1013904223) >>> 0
      return semilla / 2 ** 32
    }
    let tapados = 0
    for (let k = 0; k < 400; k++) {
      const origen: Vec3 = [azar() * 0.8 - 0.4, azar() * 0.8 - 0.4, 0.15 + azar() * 0.4]
      const destino: Vec3 = [azar() * 0.5 - 0.25, azar() * 0.5 - 0.25, azar() * 0.08 - 0.02]
      const direccion: Vec3 = [destino[0] - origen[0], destino[1] - origen[1], destino[2] - origen[2]]
      const esperado = bruta(origen, direccion, 1)
      if (esperado) tapados++
      expect(laTelaTapa(indice, origen, direccion, 1)).toBe(esperado)
    }
    // Y que la muestra tenga de las dos cosas: si todos dieran lo mismo no probaría nada.
    expect(tapados).toBeGreaterThan(40)
    expect(tapados).toBeLessThan(360)
  })

  it('una tela sin triángulos no tapa nada', () => {
    const vacia = indexarLaTela({ posiciones: new Float32Array(0), uv: new Float32Array(0), indices: new Uint32Array(0) })
    expect(laTelaTapa(vacia, [0, 0, 1], [0, 0, -1], 2)).toBe(false)
  })
})

describe('lo que el colchón tapa', () => {
  // Un colchón sin inclinar, con el plano de apoyo en z = 0: su cara de arriba queda 2,4 cm por debajo —lo que
  // el paciente se hunde— y la de abajo a 11.
  const marco: MarcoDelColchon = { origen: [0, 0, 0], ancho: [1, 0, 0], largo: [0, 1, 0], normal: [0, 0, 1] }
  const medidas: MedidasDelColchon = { ancho: 0.84, largo: 1.96, grosor: 0.11, hundimiento: 0.024 }
  const tapa = (origen: Vec3, destino: Vec3) => {
    const direccion: Vec3 = [destino[0] - origen[0], destino[1] - origen[1], destino[2] - origen[2]]
    return elColchonTapa(marco, medidas, origen, direccion, 1)
  }

  it('desde arriba no estorba: el paciente está encima', () => {
    expect(tapa([0.1, 0.2, 0.6], [0.05, 0.1, 0.04])).toBe(false)
  })

  it('desde abajo tapa lo que tiene encima', () => {
    expect(tapa([0.1, 0.2, -0.6], [0.05, 0.1, 0.04])).toBe(true)
    // Aunque el rayo entre de lado, por el canto: a la altura del borde va todavía por dentro de la espuma.
    expect(tapa([0.9, 0, -0.2], [0, 0, 0.03])).toBe(true)
    // Uno más tendido pasa por encima del canto y llega: es mirar al paciente desde el costado, casi a ras.
    expect(tapa([0.9, 0, -0.05], [0, 0, 0.03])).toBe(false)
  })

  it('lo que cuelga por fuera del colchón se toca también desde abajo', () => {
    // Una mano que cae por el borde: el rayo sube a medio metro del eje, donde ya no hay colchón.
    expect(tapa([0.5, 0, -0.6], [0.5, 0, 0.02])).toBe(false)
    // Y los pies que asoman por el extremo.
    expect(tapa([0, -1.05, -0.6], [0, -1.05, 0.02])).toBe(false)
  })

  it('solo tapa lo que tiene detrás', () => {
    // Un instrumento en el aire, por debajo de la camilla: el rayo se para antes de llegar al colchón.
    expect(tapa([0, 0, -0.6], [0, 0, -0.2])).toBe(false)
    expect(elColchonTapa(marco, medidas, [0, 0, -0.6], [0, 0, 1], 0)).toBe(false)
  })

  it('lo que descansa en el colchón se toca: el punto de la propia cara no cuenta como tapado', () => {
    // La espalda hundida llega a la cara de arriba; mirada desde arriba, el rayo acaba justo ahí.
    expect(tapa([0, 0, 0.5], [0, 0, -0.024])).toBe(false)
    // Y un punto dentro de la espuma —nada del paciente debería estar ahí— queda tapado.
    expect(tapa([0, 0, 0.5], [0, 0, -0.06])).toBe(true)
  })

  it('un rayo paralelo al colchón solo lo cruza si va por dentro de su grosor', () => {
    expect(elColchonTapa(marco, medidas, [-1, 0, 0.05], [1, 0, 0], 2)).toBe(false)
    expect(elColchonTapa(marco, medidas, [-1, 0, -0.05], [1, 0, 0], 2)).toBe(true)
    expect(elColchonTapa(marco, medidas, [-1, 0, -0.2], [1, 0, 0], 2)).toBe(false)
  })

  it('vale igual con el colchón de boca abajo, inclinado y por delante del pecho', () => {
    // El marco de verdad: la normal mira hacia la espalda (−Z) y el colchón queda del lado del pecho.
    const prono: MarcoDelColchon = { origen: [0, 1.065, 0.108085], ancho: [-1, 0, 0], largo: [0, 0.99958, 0.028988], normal: [0, 0.028988, -0.99958] }
    const hacia = (origen: Vec3, destino: Vec3) =>
      elColchonTapa(prono, medidas, origen, [destino[0] - origen[0], destino[1] - origen[1], destino[2] - origen[2]], 1)
    // La cámara de «Prono» mira la espalda desde atrás: nada en medio.
    expect(hacia([-0.2, 1.1, -1], [0, 1.1, -0.08])).toBe(false)
    // Desde delante, el esternón queda al otro lado del colchón.
    expect(hacia([0.2, 1.1, 1], [0, 1.1, 0.06])).toBe(true)
  })
})

describe('lo que se le dice a quien toca algo tapado', () => {
  it('cada estorbo tiene su aviso, y cada aviso dice qué hacer', () => {
    const avisos = (['pano', 'colchon', 'vuelta'] as const).map(avisoDeLoTapado)
    expect(new Set(avisos).size).toBe(3)
    expect(avisos[0]).toMatch(/paño/)
    expect(avisos[0]).toMatch(/Capas/)
    expect(avisos[1]).toMatch(/colchón/)
    expect(avisos[1]).toMatch(/vuelta/)
    expect(avisos[2]).toMatch(/vuelta/)
  })
})

describe('de qué lado mira la cámara', () => {
  it('por delante, boca arriba; por detrás, boca abajo', () => {
    for (const actual of ['supino', 'prono'] as const) {
      expect(decubitoDeLaVista([0.4, 0.15, 1], actual)).toBe('supino')
      expect(decubitoDeLaVista([-0.22, 0, -1], actual)).toBe('prono')
      // Sin normalizar da lo mismo: cuenta el ángulo, no el largo.
      expect(decubitoDeLaVista([0, 0, 7], actual)).toBe('supino')
      expect(decubitoDeLaVista([0, 3, -4], actual)).toBe('prono')
    }
  })

  it('de perfil se queda como estaba, para no darle la vuelta por medio grado', () => {
    expect(decubitoDeLaVista([1, 0, 0.1], 'supino')).toBe('supino')
    expect(decubitoDeLaVista([1, 0, 0.1], 'prono')).toBe('prono')
    expect(decubitoDeLaVista([-1, 0.3, -0.15], 'supino')).toBe('supino')
    expect(decubitoDeLaVista([0, 1, 0], 'prono')).toBe('prono')
  })
})

describe('dar la vuelta al paciente', () => {
  // Los dos marcos, parecidos a los de verdad: el colchón de boca arriba detrás de la espalda y el de boca
  // abajo delante del pecho, un poco inclinados y con el segundo corrido hacia la cabeza.
  const inclinar = (v: Vec3, grados: number): Vec3 => girarVector(cuaternionDelEje([1, 0, 0], (grados * Math.PI) / 180), v)
  const supino: MarcoDelColchon = { origen: [0, 0.85, -0.123], ancho: [1, 0, 0], largo: inclinar([0, 1, 0], -1.7), normal: inclinar([0, 0, 1], -1.7) }
  const prono: MarcoDelColchon = { origen: [0, 1.065, 0.108], ancho: [-1, 0, 0], largo: inclinar([0, 1, 0], 1.66), normal: inclinar([0, 0, -1], 1.66) }
  const pivote: Vec3 = [-0.1, 0.49, 0.01]
  const eje: Vec3 = [0, 1, 0]

  const mismaPostura = (a: Postura, b: Postura) => {
    expect(distancia(a.posicion, b.posicion)).toBeLessThan(1e-9)
    // q y −q son el mismo giro.
    expect(Math.abs(a.giro[0] * b.giro[0] + a.giro[1] * b.giro[1] + a.giro[2] * b.giro[2] + a.giro[3] * b.giro[3])).toBeCloseTo(1, 9)
  }

  it('la postura del colchón lleva sus ejes a los del marco', () => {
    const p = posturaDelColchon(supino)
    expect(distancia(girarVector(p.giro, [1, 0, 0]), supino.ancho)).toBeLessThan(1e-9)
    expect(distancia(girarVector(p.giro, [0, 1, 0]), supino.normal)).toBeLessThan(1e-9)
    expect(distancia(girarVector(p.giro, [0, 0, -1]), supino.largo)).toBeLessThan(1e-9)
    const q = posturaDelColchon(prono)
    expect(distancia(girarVector(q.giro, [1, 0, 0]), prono.ancho)).toBeLessThan(1e-9)
    expect(distancia(girarVector(q.giro, [0, 1, 0]), prono.normal)).toBeLessThan(1e-9)
  })

  it('empieza en el colchón de salida y acaba en el de llegada, por los dos lados', () => {
    for (const sentido of [1, -1] as const) {
      mismaPostura(colchonAlDarLaVuelta(0, supino, prono, pivote, eje, 0.08, sentido), posturaDelColchon(supino))
      mismaPostura(colchonAlDarLaVuelta(1, supino, prono, pivote, eje, 0.08, sentido), posturaDelColchon(prono))
      mismaPostura(colchonAlDarLaVuelta(1, prono, supino, pivote, eje, 0.08, sentido), posturaDelColchon(supino))
    }
  })

  it('a media vuelta el colchón está de canto y apartado del paciente', () => {
    const medio = colchonAlDarLaVuelta(0.5, supino, prono, pivote, eje, 0.08, 1)
    const normal = girarVector(medio.giro, [0, 1, 0])
    // De canto: su normal, que apuntaba a +Z, mira ahora de lado.
    expect(Math.abs(normal[0])).toBeGreaterThan(0.99)
    // Y entre el plano del colchón y el eje del paciente hay, por lo menos, lo que había más el despeje.
    const alEje = Math.abs(punto([pivote[0] - medio.posicion[0], pivote[1] - medio.posicion[1], pivote[2] - medio.posicion[2]], normal))
    expect(alEje).toBeGreaterThan(Math.min(0.133, 0.098) + 0.08 - 1e-6)
  })

  it('el colchón gira con la cámara: visto desde ella no se mueve de sitio', () => {
    // La cámara da la misma media vuelta alrededor del mismo eje. Deshecho ese giro, el colchón solo se ha
    // corrido lo que separa un marco del otro más el despeje: centímetros, no la media vuelta.
    for (const t of [0.2, 0.5, 0.8]) {
      const u = t * t * (3 - 2 * t)
      const visto = colchonAlDarLaVuelta(t, supino, prono, pivote, eje, 0.08, 1)
      const q = cuaternionDelEje(eje, -Math.PI * u)
      const relativo = girarVector(q, [visto.posicion[0] - pivote[0], visto.posicion[1] - pivote[1], visto.posicion[2] - pivote[2]])
      const deSalida: Vec3 = [supino.origen[0] - pivote[0], supino.origen[1] - pivote[1], supino.origen[2] - pivote[2]]
      expect(distancia(relativo, deSalida)).toBeLessThan(0.35)
      expect(relativo[2]).toBeLessThan(-0.09)
    }
  })

  it('lo cosido al colchón no se mueve si el colchón está en su sitio, y lo sigue si no', () => {
    const enSuSitio = posturaDeLoCosido(posturaDelColchon(prono), prono)
    expect(distancia(enSuSitio.posicion, [0, 0, 0])).toBeLessThan(1e-9)
    expect(Math.abs(enSuSitio.giro[3])).toBeCloseTo(1, 9)
    // Con el colchón a media vuelta, un punto de la sábana —el propio origen del marco— va donde va el colchón.
    const medio = colchonAlDarLaVuelta(0.5, supino, prono, pivote, eje, 0.08, 1)
    const cosido = posturaDeLoCosido(medio, supino)
    const llevado = girarVector(cosido.giro, supino.origen)
    expect(distancia([llevado[0] + cosido.posicion[0], llevado[1] + cosido.posicion[1], llevado[2] + cosido.posicion[2]], medio.posicion)).toBeLessThan(1e-9)
  })

  it('el despeje es lo que el modelo sobresale de canto', () => {
    // Un modelo de 10 cm de radio a 12 del colchón ya cabe: solo el margen.
    expect(despejeParaGirar(0.1, 0.12)).toBeCloseTo(0.025, 9)
    // Uno de 20 cm de radio no: hay que apartarse los 8 que faltan.
    expect(despejeParaGirar(0.2, 0.12)).toBeCloseTo(0.105, 9)
  })

  // Las dos vistas de los botones, como las da `poseDeLaPosicion`: la de «Prono» es la de «Supino» con media
  // vuelta alrededor del eje largo.
  const unitario = (v: Vec3): Vec3 => {
    const largo = Math.hypot(v[0], v[1], v[2])
    return [v[0] / largo, v[1] / largo, v[2] / largo]
  }
  const vistaSupina: VistaDeLaCamara = { centro: pivote, direccion: unitario([0.22, 0, 1]), arriba: [1, 0, 0], distancia: 0.9 }
  const vistaProna: VistaDeLaCamara = { centro: pivote, direccion: unitario([-0.22, 0, -1]), arriba: [-1, 0, 0], distancia: 0.9 }
  // El arriba de los botones no es perpendicular a la mirada —«Supino» mira con sesgo y pone el arriba en el
  // lado—; la cámara usa de él lo que le queda perpendicular, y eso es lo que la vuelta devuelve.
  const arribaDeVerdad = (vista: VistaDeLaCamara): Vec3 => {
    const sobra = punto(vista.arriba, vista.direccion)
    return unitario([vista.arriba[0] - vista.direccion[0] * sobra, vista.arriba[1] - vista.direccion[1] * sobra, vista.arriba[2] - vista.direccion[2] * sobra])
  }
  const mismaVista = (a: VistaDeLaCamara, b: VistaDeLaCamara) => {
    expect(distancia(a.centro, b.centro)).toBeLessThan(1e-9)
    expect(distancia(a.direccion, b.direccion)).toBeLessThan(1e-9)
    expect(distancia(a.arriba, arribaDeVerdad(b))).toBeLessThan(1e-9)
    expect(a.distancia).toBeCloseTo(b.distancia, 9)
  }

  it('la cámara sale de donde estaba y llega a la vista pedida, por los dos lados', () => {
    for (const sentido of [1, -1] as const) {
      mismaVista(camaraAlDarLaVuelta(0, vistaSupina, vistaProna, pivote, eje, sentido), vistaSupina)
      mismaVista(camaraAlDarLaVuelta(1, vistaSupina, vistaProna, pivote, eje, sentido), vistaProna)
      mismaVista(camaraAlDarLaVuelta(1, vistaProna, vistaSupina, pivote, eje, sentido), vistaSupina)
    }
  })

  it('entre un botón y el otro la cámara solo da la media vuelta, al paso del colchón', () => {
    // Deshecho el giro de cada instante, la cámara no se ha movido de la vista de salida: lo mismo que se le
    // pide al colchón. Si los dos pasos se separan, en la pantalla el colchón resbala bajo el paciente.
    for (const t of [0.15, 0.5, 0.85]) {
      const u = t * t * (3 - 2 * t)
      const vista = camaraAlDarLaVuelta(t, vistaSupina, vistaProna, pivote, eje, 1)
      const deshacer = cuaternionDelEje(eje, -Math.PI * u)
      expect(distancia(girarVector(deshacer, vista.direccion), vistaSupina.direccion)).toBeLessThan(1e-9)
      expect(distancia(girarVector(deshacer, vista.arriba), arribaDeVerdad(vistaSupina))).toBeLessThan(1e-9)
      expect(distancia(vista.centro, pivote)).toBeLessThan(1e-9)
      // Y el colchón, visto desde ella, sigue debajo: del lado contrario al que la cámara mira.
      const colchon = colchonAlDarLaVuelta(t, supino, prono, pivote, eje, 0.08, 1)
      const alColchon: Vec3 = [colchon.posicion[0] - pivote[0], colchon.posicion[1] - pivote[1], colchon.posicion[2] - pivote[2]]
      expect(punto(alColchon, vista.direccion)).toBeLessThan(-0.09)
    }
  })

  it('hacia un lado o hacia el otro: el sentido decide por dónde pasa', () => {
    const porUnLado = camaraAlDarLaVuelta(0.5, vistaSupina, vistaProna, pivote, eje, 1)
    const porElOtro = camaraAlDarLaVuelta(0.5, vistaSupina, vistaProna, pivote, eje, -1)
    // A media vuelta la cámara está de perfil, a un costado del paciente o al otro.
    expect(Math.abs(porUnLado.direccion[0])).toBeGreaterThan(0.95)
    expect(porUnLado.direccion[0] * porElOtro.direccion[0]).toBeLessThan(0)
  })

  it('desde una vista girada a mano llega igual, sin saltos y sin torcer la cámara', () => {
    // Quien venía mirando de lado y desde más cerca, con otro centro, pide «Prono».
    const aMano: VistaDeLaCamara = { centro: [-0.05, 0.52, 0.03], direccion: unitario([0.7, 0.4, 0.5]), arriba: [0, 1, 0], distancia: 0.4 }
    const salida = camaraAlDarLaVuelta(0, aMano, vistaProna, pivote, eje, 1)
    expect(distancia(salida.centro, aMano.centro)).toBeLessThan(1e-9)
    expect(distancia(salida.direccion, aMano.direccion)).toBeLessThan(1e-9)
    expect(salida.distancia).toBeCloseTo(0.4, 9)
    mismaVista(camaraAlDarLaVuelta(1, aMano, vistaProna, pivote, eje, 1), vistaProna)
    let anterior = salida
    for (let k = 1; k <= 40; k++) {
      const vista = camaraAlDarLaVuelta(k / 40, aMano, vistaProna, pivote, eje, 1)
      // La mirada y el arriba siguen siendo unitarios y perpendiculares: una base torcida deforma la imagen.
      expect(Math.hypot(...vista.direccion)).toBeCloseTo(1, 9)
      expect(Math.hypot(...vista.arriba)).toBeCloseTo(1, 9)
      expect(Math.abs(punto(vista.direccion, vista.arriba))).toBeLessThan(1e-9)
      // Sin saltos: de un cuadro al siguiente la mirada gira poco y la cámara se acerca o se aleja poco.
      expect(distancia(vista.direccion, anterior.direccion)).toBeLessThan(0.2)
      expect(Math.abs(vista.distancia - anterior.distancia)).toBeLessThan(0.04)
      anterior = vista
    }
  })

  it('la distancia va de la de salida a la de llegada', () => {
    const lejos: VistaDeLaCamara = { ...vistaProna, distancia: 1.5 }
    expect(camaraAlDarLaVuelta(0.5, vistaSupina, lejos, pivote, eje, 1).distancia).toBeCloseTo(1.2, 9)
  })
})
