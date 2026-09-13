import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { objetivoDelPaso, type PasoQuirurgico } from '@/lib/simulador'
import { Cirugias } from '@/collections/Cirugias'
import { migrations } from '@/migrations'

/**
 * La migración de datos que desencalla los casos anteriores al 10 de septiembre.
 *
 * El problema que arregla no se ve en desarrollo, y ese es justo el riesgo:
 * `20260910_125801` añadió `objetivo` con `DEFAULT 'instrumento'`, que en
 * PostgreSQL rellena TODAS las filas que ya existían, y esas filas venían de
 * cuando cada paso llevaba su rango de fuerza. Desde que
 * `exigeElRangoDeSuObjetivo` prohíbe esa pareja, y como `validate` corre en cada
 * guardado también sobre lo ya guardado, abrir uno de esos casos y corregir una
 * coma bastaba para no poder publicarlo nunca más.
 *
 * Lo que se comprueba aquí es la promesa de la migración, que es lo único que la
 * justifica: escribe en la columna **exactamente** lo que `objetivoDelPaso` ya
 * venía deduciendo para esas filas, así que no cambia una sola evaluación. Si
 * alguien afina la deducción del motor y no la migración —o al revés—, estas
 * pruebas lo enseñan antes de que se note en el servidor.
 *
 * La base no se toca: no hay PostgreSQL en las pruebas. Se comprueba la regla,
 * no el `UPDATE`.
 */

const NOMBRE = '20260913_041920_objetivo_de_los_pasos_antiguos'

const fuente = readFileSync(
  join(process.cwd(), 'src', 'migrations', `${NOMBRE}.ts`),
  'utf8',
)

interface CampoDeEsquema {
  name?: string
  fields?: CampoDeEsquema[]
  validate?: unknown
}

function buscarCampo(
  campos: CampoDeEsquema[] | undefined,
  nombre: string,
): CampoDeEsquema | undefined {
  for (const campo of campos ?? []) {
    if (campo.name === nombre) return campo
    const dentro = buscarCampo(campo.fields, nombre)
    if (dentro) return dentro
  }
  return undefined
}

const validar = buscarCampo(Cirugias.fields as unknown as CampoDeEsquema[], 'objetivo')!
  .validate as (valor: unknown, opciones: { siblingData?: unknown }) => string | true

/**
 * Las formas que el `DEFAULT` de la columna dejó en la base, y la que puede
 * llegar de la API sin objetivo ninguno.
 *
 * Las tres tolerancias van puestas en todas porque toda fila las lleva: tienen
 * `DEFAULT 5` desde que existen, así que una fila real nunca las trae vacías.
 */
const TOLERANCIAS = {
  toleranciaDesplazamiento: 5,
  toleranciaDiastasis: 5,
  toleranciaAngulacion: 5,
}

const FILAS_ANTIGUAS: { como: string; paso: PasoQuirurgico; esperado: string }[] = [
  {
    como: 'el paso de antes del 10 de septiembre, con su rango de fuerza',
    paso: { objetivo: 'instrumento', fuerzaMinima: 8, fuerzaMaxima: 20, ...TOLERANCIAS },
    esperado: 'fuerza',
  },
  {
    como: 'el mismo con un solo tope: «no más de 20 N» también es un rango',
    paso: { objetivo: 'instrumento', fuerzaMaxima: 20, ...TOLERANCIAS },
    esperado: 'fuerza',
  },
  {
    como: 'el paso con longitud de incisión y sin fuerza',
    paso: { objetivo: 'instrumento', trazoMinimo: 60, ...TOLERANCIAS },
    esperado: 'trazo',
  },
  {
    como: 'el que trae los dos rangos: manda la fuerza, como en el motor',
    paso: { objetivo: 'instrumento', fuerzaMinima: 8, trazoMinimo: 60, ...TOLERANCIAS },
    esperado: 'fuerza',
  },
  {
    como: 'el borrador guardado sin objetivo, que solo trae las tolerancias',
    paso: { ...TOLERANCIAS },
    esperado: 'reduccion',
  },
]

describe('la migración escribe lo que el motor ya deducía', () => {
  it.each(FILAS_ANTIGUAS)('$como → $esperado', ({ paso, esperado }) => {
    expect(objetivoDelPaso(paso)).toBe(esperado)
  })

  it.each(FILAS_ANTIGUAS)('$como hoy no deja publicar el caso', ({ paso }) => {
    // La mitad del hallazgo que más costaba ver: la regla nueva no solo impide
    // escribir filas así, rechaza las que ya estaban. Si algún día esto pasa a
    // verde, la migración dejó de hacer falta y este archivo sobra.
    expect(validar(paso.objetivo ?? null, { siblingData: paso })).toEqual(expect.any(String))
  })

  it.each(FILAS_ANTIGUAS)('$como vuelve a publicarse con el objetivo escrito', ({ paso, esperado }) => {
    const corregido = { ...paso, objetivo: esperado }
    expect(validar(esperado, { siblingData: corregido })).toBe(true)
  })

  it('un paso de instrumento de verdad no lo toca nadie', () => {
    // El contrapeso: el `WHERE` de la migración deja fuera la fila que solo pide
    // coger el punzón. Reescribirla sería convertir en medición un paso que
    // nunca la pidió.
    const limpio: PasoQuirurgico = { objetivo: 'instrumento', ...TOLERANCIAS }
    expect(objetivoDelPaso(limpio)).toBe('instrumento')
    expect(validar('instrumento', { siblingData: limpio })).toBe(true)
  })
})

describe('la migración está puesta donde se aplica', () => {
  it('el índice la registra la última', () => {
    // Tiene que ir después de la que crea el índice único de actividad y de
    // cualquier cambio de esquema: reescribe datos de columnas que ya existen.
    expect(migrations[migrations.length - 1]?.name).toBe(NOMBRE)
  })

  it('toca también la tabla de versiones', () => {
    // La regresión clásica de este repositorio: arreglar la tabla publicada y
    // olvidar la de borradores e historial. Publicar un borrador viejo es
    // exactamente el gesto que se quedaba bloqueado, y ese borrador vive en
    // `_cirugias_v_version_pasos`.
    expect(fuente).toContain(`'cirugias_pasos'`)
    expect(fuente).toContain(`'_cirugias_v_version_pasos'`)
    expect(fuente).toContain(`'enum_cirugias_pasos_objetivo'`)
    expect(fuente).toContain(`'enum__cirugias_v_version_pasos_objetivo'`)
  })

  it('las ramas del CASE van en el orden de objetivoDelPaso', () => {
    // Fuerza antes que trazo, y `reduccion` la última antes del `ELSE`.
    // Invertirlas cambiaría la evaluación de los pasos que traen los dos
    // rangos, que es justo lo que la migración promete no hacer.
    const ramas = [
      ...fuente.matchAll(/(?:THEN|ELSE) '(fuerza|trazo|reduccion|instrumento)'/g),
    ].map((encaje) => encaje[1])
    expect(ramas).toEqual(['fuerza', 'trazo', 'reduccion', 'instrumento'])
  })
})
