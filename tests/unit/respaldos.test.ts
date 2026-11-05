import { describe, it, expect } from 'vitest'
import {
  diasDesde,
  esDestinatarioDeAge,
  esNombreDeRespaldo,
  estaCifrado,
  fechaDeNombre,
  marcaDeTiempo,
  tamanoLegible,
} from '@/lib/respaldos'

/**
 * Los respaldos cifrados (D-295): cuál lo está y para qué llave.
 *
 * Que el cifrado se haga de verdad —y que con la llave puesta nunca quede un
 * volcado en claro— lo cubren `respaldoCifrado.test.ts` para el botón del panel
 * y `guionesDeRespaldo.test.ts` para los guiones del anfitrión.
 */
describe('respaldos cifrados', () => {
  it('se reconocen por el .age del final', () => {
    expect(estaCifrado('base-20260906-030000.sql.gz.age')).toBe(true)
    expect(estaCifrado('base-20260906-030000.sql.gz')).toBe(false)
  })

  it('la fecha se lee igual del nombre cifrado', () => {
    expect(fechaDeNombre('base-20260906-143012.sql.gz.age')).toEqual(fechaDeNombre('base-20260906-143012.sql.gz'))
  })

  it('una llave pública de age: «age1» y 58 caracteres del alfabeto bech32', () => {
    const buena = `age1${'q'.repeat(58)}`
    expect(esDestinatarioDeAge(buena)).toBe(true)
    expect(esDestinatarioDeAge('age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p')).toBe(true)
  })

  it('rechaza la llave mal copiada, que no cifraría para nadie', () => {
    for (const valor of [
      '',
      `age1${'q'.repeat(57)}`,
      `age1${'q'.repeat(59)}`,
      // «b», «i», «o» y «1» no son del alfabeto: suelen ser una letra mal leída.
      `age1${'q'.repeat(57)}b`,
      `age1${'q'.repeat(57)}o`,
      `AGE1${'Q'.repeat(58)}`,
      ` age1${'q'.repeat(58)}`,
      // La privada no es un destinatario, y pegarla aquí la dejaría en el .env.
      `AGE-SECRET-KEY-1${'Q'.repeat(58)}`,
      null,
      42,
    ]) {
      expect(esDestinatarioDeAge(valor), String(valor)).toBe(false)
    }
  })
})

/**
 * El nombre de un respaldo no es cosmético: es lo único que separa una descarga
 * legítima de una lectura arbitraria del sistema de archivos, porque la ruta se
 * construye con lo que llega en la URL.
 */
describe('nombres de respaldo', () => {
  it('acepta los que produce el propio sistema', () => {
    expect(esNombreDeRespaldo('base-20260906-030000.sql.gz')).toBe(true)
    expect(esNombreDeRespaldo('medios-20260906-030000.tar.gz')).toBe(true)
  })

  it('acepta los mismos nombres cifrados, con el .age al final (D-295)', () => {
    expect(esNombreDeRespaldo('base-20260906-030000.sql.gz.age')).toBe(true)
    expect(esNombreDeRespaldo('medios-20260906-030000.tar.gz.age')).toBe(true)
  })

  it('el .age va solo al final, una vez, y solo el de age', () => {
    for (const nombre of [
      'base-20260906-030000.sql.age',
      'base-20260906-030000.sql.gz.age.age',
      'base-20260906-030000.age.sql.gz',
      'base-20260906-030000.sql.gz.gpg',
      // El temporal en claro de los guiones: no es un respaldo y no se lista.
      '.base-20260906-030000.sql.gz.parcial',
    ]) {
      expect(esNombreDeRespaldo(nombre), nombre).toBe(false)
    }
  })

  it('rechaza cualquier intento de salirse del directorio', () => {
    for (const nombre of [
      '../.env',
      '../../etc/passwd',
      'base-20260906-030000.sql.gz/../.env',
      '/etc/shadow',
      'base-20260906-030000.sql.gz\n.env',
    ]) {
      expect(esNombreDeRespaldo(nombre), nombre).toBe(false)
    }
  })

  it('rechaza nombres parecidos pero ajenos', () => {
    expect(esNombreDeRespaldo('base.sql.gz')).toBe(false)
    expect(esNombreDeRespaldo('base-2026-09-06.sql.gz')).toBe(false)
    expect(esNombreDeRespaldo('otro-20260906-030000.sql.gz')).toBe(false)
    expect(esNombreDeRespaldo('base-20260906-030000.sql')).toBe(false)
  })

  it('rechaza lo que no es texto', () => {
    for (const valor of [null, undefined, 42, {}]) {
      expect(esNombreDeRespaldo(valor)).toBe(false)
    }
  })
})

describe('marca de tiempo', () => {
  it('produce el formato que espera el patrón de nombres', () => {
    const marca = marcaDeTiempo(new Date(2026, 8, 6, 3, 0, 0))
    expect(marca).toBe('20260906-030000')
    expect(esNombreDeRespaldo(`base-${marca}.sql.gz`)).toBe(true)
  })

  it('rellena con ceros los meses, días y horas de una cifra', () => {
    expect(marcaDeTiempo(new Date(2026, 0, 2, 3, 4, 5))).toBe('20260102-030405')
  })
})

describe('fecha leída del nombre', () => {
  it('recupera la fecha con la que se creó el archivo', () => {
    const fecha = fechaDeNombre('base-20260906-143012.sql.gz')
    expect(fecha).not.toBeNull()
    expect(fecha!.getFullYear()).toBe(2026)
    expect(fecha!.getMonth()).toBe(8)
    expect(fecha!.getDate()).toBe(6)
    expect(fecha!.getHours()).toBe(14)
  })

  it('devuelve null si el nombre no la lleva, para poder caer en la del disco', () => {
    expect(fechaDeNombre('cualquier-cosa.gz')).toBeNull()
  })

  it('es la inversa de la marca de tiempo', () => {
    const original = new Date(2026, 3, 15, 9, 8, 7)
    expect(fechaDeNombre(`base-${marcaDeTiempo(original)}.sql.gz`)?.getTime()).toBe(
      original.getTime(),
    )
  })
})

describe('tamaño legible', () => {
  it('usa bytes por debajo del kilobyte', () => {
    expect(tamanoLegible(0)).toBe('0 B')
    expect(tamanoLegible(999)).toBe('999 B')
  })

  it('escala y usa coma decimal, como se escribe en español', () => {
    expect(tamanoLegible(1024)).toBe('1,0 KB')
    expect(tamanoLegible(1024 * 1024)).toBe('1,0 MB')
    expect(tamanoLegible(1536 * 1024)).toBe('1,5 MB')
    expect(tamanoLegible(1024 ** 3)).toBe('1,0 GB')
  })
})

describe('antigüedad de un respaldo', () => {
  const ahora = new Date(2026, 8, 6, 12, 0, 0).getTime()

  it('cuenta los días completos transcurridos', () => {
    expect(diasDesde(new Date(2026, 8, 6, 3, 0, 0).toISOString(), ahora)).toBe(0)
    expect(diasDesde(new Date(2026, 8, 4, 3, 0, 0).toISOString(), ahora)).toBe(2)
  })

  it('nunca es negativa, aunque el reloj del servidor vaya atrasado', () => {
    expect(diasDesde(new Date(2026, 8, 8).toISOString(), ahora)).toBe(0)
  })
})
