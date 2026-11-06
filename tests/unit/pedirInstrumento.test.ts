import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { paraComparar } from '@/lib/catalogosAmpliables'
import { instrumentosPedidos, MAXIMO_A_LA_VISTA, palabrasDe, parecidoAlNombre, type InstrumentoParaPedir } from '@/lib/pedirInstrumento'

// Pedir un instrumento por su nombre (P-012 E5): la tecla I, encima del lienzo.

const de = (id: string, nombre: string, orden = 0, descripcion: string | null = null): InstrumentoParaPedir => ({ id, nombre, orden, descripcion })

const BANDEJA = [
  de('hohmann', 'Separador de Hohmann', 2),
  de('farabeuf', 'Separador de Farabeuf', 2),
  de('pinza', 'Pinza de reducción con puntas', 4, 'Para sujetar los fragmentos'),
  de('broca32', 'Broca de 3,2 mm', 5),
  de('broca25', 'Broca de 2,5 mm', 5),
  de('bisturi', 'Bisturí n.º 23', 0),
  de('mango', 'Mango de bisturí', 0),
  de('medidor', 'Medidor de profundidad', 5, 'Mide el largo del tornillo'),
]
const ids = (lista: InstrumentoParaPedir[]) => lista.map((i) => i.id)

describe('pedir un instrumento por su nombre (P-012 E5)', () => {
  it('sin nada escrito, ninguno', () => {
    expect(instrumentosPedidos(BANDEJA, '')).toEqual([])
    expect(instrumentosPedidos(BANDEJA, '   ')).toEqual([])
  })

  it('las tildes y las mayúsculas no cuentan', () => {
    expect(ids(instrumentosPedidos(BANDEJA, 'FARAB'))).toEqual(['farabeuf'])
    expect(ids(instrumentosPedidos(BANDEJA, 'fárab'))).toEqual(['farabeuf'])
    expect(ids(instrumentosPedidos(BANDEJA, 'reduccion'))).toEqual(['pinza'])
  })

  it('primero el que empieza así, luego el que lo tiene al principio de una palabra, y al final el de la descripción', () => {
    // «bisturí» empieza el nombre del bisturí y está al final del mango.
    expect(ids(instrumentosPedidos(BANDEJA, 'bisturi'))).toEqual(['bisturi', 'mango'])
    expect(parecidoAlNombre(BANDEJA[5], palabrasDe('bisturi'))).toBe(0)
    expect(parecidoAlNombre(BANDEJA[6], palabrasDe('bisturi'))).toBe(1)
    // «sep hohm»: cada palabra al principio de una del nombre, aunque el nombre no empiece por «sep hohm».
    expect(parecidoAlNombre(BANDEJA[0], palabrasDe('sep hohm'))).toBe(1)
    // «ragmen» no empieza ninguna palabra: dentro de «fragmentos», en la descripción.
    expect(parecidoAlNombre(BANDEJA[2], palabrasDe('ragmen'))).toBe(3)
    expect(parecidoAlNombre(BANDEJA[2], palabrasDe('untas'))).toBe(2)
    expect(parecidoAlNombre(BANDEJA[2], palabrasDe('tornillo'))).toBeNull()
  })

  it('a igualdad, el orden de la mesa y después el alfabeto', () => {
    expect(ids(instrumentosPedidos(BANDEJA, 'separador'))).toEqual(['farabeuf', 'hohmann'])
    expect(ids(instrumentosPedidos(BANDEJA, 'broca'))).toEqual(['broca25', 'broca32'])
    // El de una familia anterior va antes aunque el alfabeto dijera lo contrario.
    const dos = [de('z', 'Zeta de corte', 0), de('a', 'Alfa de corte', 3)]
    expect(ids(instrumentosPedidos(dos, 'corte'))).toEqual(['z', 'a'])
  })

  it('por palabras, en cualquier orden y con los números como se escriben', () => {
    expect(ids(instrumentosPedidos(BANDEJA, 'broca 3,2'))).toEqual(['broca32'])
    expect(ids(instrumentosPedidos(BANDEJA, '3,2 broca'))).toEqual(['broca32'])
    expect(ids(instrumentosPedidos(BANDEJA, 'largo tornillo'))).toEqual(['medidor'])
  })

  it('encuentra justo lo mismo que el buscador de la mesa: la misma regla, solo cambia el orden', () => {
    // La regla de `gruposDeLaBandeja`, en la consola.
    const deLaMesa = (escrito: string) => {
      const palabras = paraComparar(escrito).split(' ').filter(Boolean)
      if (palabras.length === 0) return []
      return BANDEJA.filter((i) => palabras.every((p) => paraComparar(`${i.nombre} ${i.descripcion ?? ''}`).includes(p))).map((i) => i.id)
    }
    for (const escrito of ['sep', 'broca', 'de', 'mm', 'pro', 'bisturí 23', 'nada de esto', 'a']) {
      expect([...ids(instrumentosPedidos(BANDEJA, escrito))].sort()).toEqual([...deLaMesa(escrito)].sort())
    }
  })

  it('el orden no depende del orden de la bandeja, que puede seguir al de los pasos', () => {
    // Si el caso declara la bandeja en el orden en que se usa, un desempate por su posición diría cuál toca.
    const alReves = [...BANDEJA].reverse()
    const barajada = [BANDEJA[3], BANDEJA[7], BANDEJA[0], BANDEJA[5], BANDEJA[2], BANDEJA[6], BANDEJA[1], BANDEJA[4]]
    for (const escrito of ['separador', 'broca', 'de', 'mm', 'bisturi', 'e']) {
      const lista = ids(instrumentosPedidos(BANDEJA, escrito))
      expect(ids(instrumentosPedidos(alReves, escrito))).toEqual(lista)
      expect(ids(instrumentosPedidos(barajada, escrito))).toEqual(lista)
    }
  })

  it('un instrumento repetido en la bandeja sale una vez', () => {
    expect(ids(instrumentosPedidos([...BANDEJA, BANDEJA[1]], 'farab'))).toEqual(['farabeuf'])
  })

  it('a la vista, ocho como mucho', () => {
    expect(MAXIMO_A_LA_VISTA).toBe(8)
  })
})

describe('el buscador, en la consola', () => {
  const raiz = join(__dirname, '..', '..', 'src', 'components', 'simulador')
  const consola = readFileSync(join(raiz, 'ConsolaQuirurgica.tsx'), 'utf8')
  const buscador = readFileSync(join(raiz, 'PedirInstrumento.tsx'), 'utf8')

  it('la I lo abre, y también el botón sobre el lienzo', () => {
    const atajo = consola.slice(consola.indexOf("if (e.key === 'i' || e.key === 'I')"), consola.indexOf("if (e.key === 'i' || e.key === 'I')") + 300)
    expect(atajo).toContain('e.preventDefault()')
    expect(atajo).toContain('setPidiendo(true)')
    expect(consola).toContain('aria-keyshortcuts="I"')
    expect(consola).toContain('<PedirInstrumento')
  })

  it('busca en la bandeja sin mirar el paso', () => {
    const inicio = consola.indexOf('const opcionesParaPedir = useMemo(')
    const memo = consola.slice(inicio, consola.indexOf('}, [caso.instrumental])', inicio))
    expect(inicio).toBeGreaterThan(0)
    expect(memo).toContain('caso.instrumental.map(')
    expect(memo).not.toMatch(/paso|enPractica|modoDeJuego/)
  })

  it('Esc cierra el buscador sin llegar a los oyentes que sueltan lo de la mano', () => {
    const esc = buscador.slice(buscador.indexOf("if (e.key === 'Escape')"), buscador.indexOf("if (e.key === 'Escape')") + 400)
    expect(esc).toContain('e.stopPropagation()')
    expect(esc).toContain('alCerrar()')
  })

  it('Enter pone en la mano el marcado, que es el primero mientras no se mueva con las flechas', () => {
    expect(buscador).toContain("if (e.key === 'Enter')")
    expect(buscador).toContain('const elegido = lista[activo]')
    expect(buscador).toContain('setMarcado(0)')
  })
})
