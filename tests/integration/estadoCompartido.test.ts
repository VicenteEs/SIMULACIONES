import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { almacenEnLaBase as intentosEnLaBase, huellaDeLaClave } from '@/lib/ritmo'
import { almacenEnLaBase as presenciaEnLaBase } from '@/lib/presenciaServidor'
import { CADUCIDAD_VISIBLE_MS, claveDeFicha } from '@/lib/presencia'
import { registroEnLaBase } from '@/lib/publicaciones'
import { adaptadorDe, conCandado } from '@/lib/sqlDirecto'

/**
 * Lo que comparten los procesos de la aplicación, contra una base de verdad
 * (D-393). Las reglas de cada pieza se prueban en memoria en sus pruebas
 * unitarias; aquí se prueba que la versión de la base dice lo mismo, y lo que
 * solo existe en la base: el candado entre transacciones, la huella en lugar de
 * la clave y el aviso que se deshace con su transacción.
 */

const payload: Payload | null = await (async () => {
  try {
    const { getPayload } = await import('payload')
    const config = (await import('@payload-config')).default
    return await getPayload({ config })
  } catch {
    // Ver `acceso.test.ts`: el adaptador deja una promesa rechazada sin dueño.
    process.on('unhandledRejection', () => {})
    return null
  }
})()

const marca = randomBytes(4).toString('hex')

describe.skipIf(payload === null)('lo que comparten los procesos (D-393)', () => {
  const base = payload as Payload
  const bd = () => adaptadorDe(base).drizzle
  const conseguir = async () => base

  describe('el candado', () => {
    it('dos trabajos con el mismo nombre no se pisan; con otro nombre corren a la vez', async () => {
      const orden: string[] = []
      const trabajo = (quien: string, ms: number) => async () => {
        orden.push(`${quien}:entra`)
        await new Promise((listo) => setTimeout(listo, ms))
        orden.push(`${quien}:sale`)
      }
      const nombre = `prueba-${marca}`
      await Promise.all([
        conCandado(base, nombre, trabajo('a', 150)),
        // Un respiro para que el primero tome el candado antes.
        new Promise((listo) => setTimeout(listo, 30)).then(() => conCandado(base, nombre, trabajo('b', 10))),
      ])
      expect(orden).toEqual(['a:entra', 'a:sale', 'b:entra', 'b:sale'])

      const cruzado: string[] = []
      const otro = (quien: string, ms: number) => async () => {
        cruzado.push(`${quien}:entra`)
        await new Promise((listo) => setTimeout(listo, ms))
        cruzado.push(`${quien}:sale`)
      }
      await Promise.all([
        conCandado(base, `${nombre}-x`, otro('x', 150)),
        new Promise((listo) => setTimeout(listo, 30)).then(() => conCandado(base, `${nombre}-y`, otro('y', 10))),
      ])
      expect(cruzado.indexOf('y:sale')).toBeLessThan(cruzado.indexOf('x:sale'))
    })

    it('si el trabajo falla, lo que escribió se deshace y el candado se suelta', async () => {
      const modulo = `falla-${marca}`
      await expect(
        conCandado(base, `deshacer-${marca}`, async (req) => {
          await registroEnLaBase(conseguir).registrar(modulo, 'no debe quedar', req)
          throw new Error('a propósito')
        }),
      ).rejects.toThrow('a propósito')
      const { rows } = await bd().execute(sql`select count(*)::int as n from publicaciones where modulo = ${modulo}`)
      expect(rows[0]?.n).toBe(0)
      // Suelto: otro lo toma sin esperar.
      await conCandado(base, `deshacer-${marca}`, async () => undefined)
    })
  })

  describe('el freno de intentos', () => {
    const almacen = intentosEnLaBase(conseguir)
    const freno = `prueba-${marca}`

    afterAll(async () => {
      await bd().execute(sql`delete from intentos where freno like ${`prueba-${marca}%`}`)
    })

    it('deja pasar hasta el máximo de la ventana, cada clave con su cuenta', async () => {
      const resultados = []
      for (let i = 0; i < 3; i++) resultados.push(await almacen.anotar(freno, '10.0.0.1', 2, 60_000, Date.now()))
      expect(resultados).toEqual([true, true, false])
      expect(await almacen.anotar(freno, '10.0.0.2', 2, 60_000, Date.now())).toBe(true)
    })

    it('con muchos intentos a la vez pasan justo los del máximo', async () => {
      // Sin el candado, varios leerían la misma cuenta antes de que ninguno
      // escribiera, y pasarían más de los debidos: es lo que hacían dos
      // procesos con dos contadores.
      const otro = `${freno}-juntos`
      const resultados = await Promise.all(
        Array.from({ length: 8 }, () => almacen.anotar(otro, 'la-misma', 3, 60_000, Date.now())),
      )
      expect(resultados.filter(Boolean)).toHaveLength(3)
    })

    it('guarda la huella y no la dirección ni el correo', async () => {
      const otro = `${freno}-huella`
      await almacen.anotar(otro, 'ana@hospital.cl', 5, 60_000, Date.now())
      const { rows } = await bd().execute(sql`select clave from intentos where freno = ${otro}`)
      expect(rows.map((f) => f.clave)).toEqual([huellaDeLaClave(otro, 'ana@hospital.cl')])
      expect(JSON.stringify(rows)).not.toContain('hospital')
    })

    it('los intentos fuera de la ventana no cuentan', async () => {
      const otro = `${freno}-viejos`
      await bd().execute(sql`
        insert into intentos (freno, clave, instante)
        values (${otro}, ${huellaDeLaClave(otro, 'x')}, now() - interval '2 minutes')`)
      expect(await almacen.anotar(otro, 'x', 1, 60_000, Date.now())).toBe(true)
      expect(await almacen.anotar(otro, 'x', 1, 60_000, Date.now())).toBe(false)
    })
  })

  describe('la presencia en el editor', () => {
    const almacen = presenciaEnLaBase(conseguir)
    const ficha = claveDeFicha('patologias', `9${Date.now() % 1_000_000}`)
    const cuentas: number[] = []

    beforeAll(async () => {
      for (const nombre of ['Elena Editora', 'Pablo Pérez']) {
        const creada = await base.create({
          collection: 'usuarios',
          overrideAccess: true,
          data: {
            email: `presencia-${marca}-${cuentas.length}@prueba.invalid`,
            password: randomBytes(18).toString('base64url'),
            nombre,
            rol: 'editor',
            activo: true,
          } as never,
        })
        cuentas.push(Number(creada.id))
      }
    })

    afterAll(async () => {
      await bd().execute(sql`delete from presencias where ficha like ${'patologias/%'} and usuario = any(${`{${cuentas.join(',')}}`}::int[])`)
      for (const id of cuentas) await base.delete({ collection: 'usuarios', id, overrideAccess: true })
    })

    it('cada uno ve al otro, con el nombre de su cuenta, y no a sí mismo', async () => {
      const [elena, pablo] = cuentas.map(String)
      const t0 = Date.now()
      expect(await almacen.latir(ficha, { usuarioId: elena, pestana: 'pestana-elena-1', visible: true }, t0)).toBe(true)
      await almacen.latir(ficha, { usuarioId: pablo, pestana: 'pestana-pablo-1', visible: true }, t0 + 1000)
      await almacen.latir(ficha, { usuarioId: elena, pestana: 'pestana-elena-2', visible: false }, t0 + 2000)

      const vistaDePablo = await almacen.quienMas(ficha, pablo, 'pestana-pablo-1', t0 + 3000)
      expect(vistaDePablo.otros).toEqual([{ nombre: 'Elena Editora', rol: 'editor', desde: t0, segundoPlano: false }])
      expect(vistaDePablo.misOtrasPestanas).toBe(0)

      const vistaDeElena = await almacen.quienMas(ficha, elena, 'pestana-elena-1', t0 + 3000)
      expect(vistaDeElena.otros.map((o) => o.nombre)).toEqual(['Pablo Pérez'])
      expect(vistaDeElena.misOtrasPestanas).toBe(1)
    })

    it('`desde` se conserva entre latidos, y vuelve a empezar tras caducar', async () => {
      const [elena, pablo] = cuentas.map(String)
      const otra = `${ficha}0`
      const t0 = Date.now()
      await almacen.latir(otra, { usuarioId: elena, pestana: 'pestana-elena-9', visible: true }, t0)
      await almacen.latir(otra, { usuarioId: elena, pestana: 'pestana-elena-9', visible: true }, t0 + 10_000)
      expect((await almacen.quienMas(otra, pablo, 'x-x-x-x-x', t0 + 11_000)).otros[0]?.desde).toBe(t0)

      const despues = t0 + 10_000 + CADUCIDAD_VISIBLE_MS + 1
      expect((await almacen.quienMas(otra, pablo, 'x-x-x-x-x', despues)).otros).toEqual([])
      await almacen.latir(otra, { usuarioId: elena, pestana: 'pestana-elena-9', visible: true }, despues)
      expect((await almacen.quienMas(otra, pablo, 'x-x-x-x-x', despues)).otros[0]?.desde).toBe(despues)
    })

    it('salir quita la pestaña, y el listado por colección junta a cada persona', async () => {
      const [elena, pablo] = cuentas.map(String)
      const t = Date.now()
      const porFicha = await almacen.porColeccion('patologias', t)
      expect(porFicha[ficha.split('/')[1]]?.map((p) => p.nombre)).toEqual(['Elena Editora', 'Pablo Pérez'])

      await almacen.salir(ficha, pablo, 'pestana-pablo-1')
      expect((await almacen.quienMas(ficha, elena, 'pestana-elena-1', t)).otros).toEqual([])
    })

    it('limpiar borra lo caducado de la tabla', async () => {
      const [elena] = cuentas.map(String)
      const vieja = `${ficha}1`
      const t0 = Date.now() - 10 * 60_000
      await almacen.latir(vieja, { usuarioId: elena, pestana: 'pestana-vieja', visible: true }, t0)
      await almacen.limpiar(Date.now())
      const { rows } = await bd().execute(sql`select count(*)::int as n from presencias where ficha = ${vieja}`)
      expect(rows[0]?.n).toBe(0)
    })
  })

  describe('las publicaciones', () => {
    const modulo = `modulo-${marca}`

    afterAll(async () => {
      await bd().execute(sql`delete from publicaciones where modulo like ${`modulo-${marca}%`}`)
    })

    it('lo que publica un proceso lo lee otro, y la versión de un módulo solo sube', async () => {
      const uno = registroEnLaBase(conseguir)
      const otro = registroEnLaBase(conseguir)
      await uno.registrar(modulo, 'Fractura de tibia')
      const primera = (await otro.ultimas()).find((p) => p.modulo === modulo)
      expect(primera?.titulo).toBe('Fractura de tibia')

      // El reloj atrasado no la hace bajar.
      await bd().execute(sql`update publicaciones set version = version + 1000000 where modulo = ${modulo}`)
      await uno.registrar(modulo, 'Luxación de hombro')
      const tercero = registroEnLaBase(conseguir)
      const segunda = (await tercero.ultimas()).find((p) => p.modulo === modulo)
      expect(segunda?.titulo).toBe('Luxación de hombro')
      expect(segunda!.version).toBeGreaterThan(primera!.version + 1000000)
    })
  })
})
