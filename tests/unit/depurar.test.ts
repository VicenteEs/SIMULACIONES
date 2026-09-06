import { describe, it, expect } from 'vitest'
import { depurarDocumento, faltantes, LIMITES } from '@/admin/depurar'
import { esquemaDe } from '@/admin/esquema'
import { textoPlano } from '@/lib/textoRico'

/**
 * `depurarDocumento` es la frontera del editor genérico.
 *
 * Una acción de servidor se puede llamar por HTTP con el objeto que quiera
 * quien tenga sesión de editor. Esta función no «limpia» ese objeto: reconstruye
 * el documento a partir del esquema, de modo que lo que no está descrito
 * sencillamente no existe. Estas pruebas comprueban justo eso.
 */

const patologias = esquemaDe('patologias')
const modelos = esquemaDe('modelos-3d')

describe('reconstrucción del documento', () => {
  it('conserva los campos del esquema', () => {
    const documento = depurarDocumento(patologias, {
      nombre: '  Fractura de fémur  ',
      subtitulo: 'diáfisis',
      codigo: '32-A1',
      tipo: 'trauma',
      segmento: 7,
    })
    expect(documento.nombre).toBe('Fractura de fémur')
    expect(documento.codigo).toBe('32-A1')
    expect(documento.segmento).toBe(7)
  })

  it('descarta cualquier campo que el esquema no describa', () => {
    const documento = depurarDocumento(patologias, {
      nombre: 'Ficha',
      _status: 'published',
      id: 99,
      createdAt: '2020-01-01',
      password: 'x',
      loQueSea: true,
    })
    expect(documento._status).toBeUndefined()
    expect(documento.id).toBeUndefined()
    expect(documento.password).toBeUndefined()
    expect(documento.loQueSea).toBeUndefined()
  })

  it('convierte a entero el identificador de una relación', () => {
    // Un desplegable siempre entrega texto y las claves de PostgreSQL son
    // enteros: sin esta conversión Payload rechaza la relación entera.
    expect(depurarDocumento(patologias, { segmento: '7' }).segmento).toBe(7)
    expect(depurarDocumento(patologias, { segmento: { id: 7, nombre: 'Fémur' } }).segmento).toBe(7)
    expect(depurarDocumento(patologias, { segmento: '../../etc' }).segmento).toBeNull()
  })

  it('un valor fuera de la lista de opciones no se guarda tal cual', () => {
    expect(depurarDocumento(patologias, { tipo: 'inventado' }).tipo).toBeNull()
    // El origen del modelo sí es obligatorio: cae en la primera opción.
    expect(depurarDocumento(modelos, { origen: 'inventado' }).origen).toBe('tc')
  })

  it('normaliza los números y respeta los topes del esquema', () => {
    const estudios = esquemaDe('estudios-ia')
    expect(depurarDocumento(estudios, { confianza: '80' }).confianza).toBe(80)
    expect(depurarDocumento(estudios, { confianza: 500 }).confianza).toBe(100)
    expect(depurarDocumento(estudios, { confianza: -5 }).confianza).toBe(0)
    expect(depurarDocumento(estudios, { confianza: 'mucha' }).confianza).toBeNull()
  })

  it('una casilla solo es verdadera si llega verdadera', () => {
    expect(depurarDocumento(modelos, { anonimizado: true }).anonimizado).toBe(true)
    for (const valor of ['true', 1, 'on', {}, null]) {
      expect(depurarDocumento(modelos, { anonimizado: valor }).anonimizado).toBe(false)
    }
  })
})

describe('bloques', () => {
  it('descarta un tipo de bloque que no existe', () => {
    const documento = depurarDocumento(patologias, {
      definicion: [
        { blockType: 'texto', titulo: 'Uno' },
        { blockType: 'inventado', malicia: true },
        { blockType: 'advertencia', tono: 'perla', texto: 'Ojo' },
      ],
    })
    const bloques = documento.definicion as Record<string, unknown>[]
    expect(bloques).toHaveLength(2)
    expect(bloques.map((b) => b.blockType)).toEqual(['texto', 'advertencia'])
  })

  it('dentro de un bloque solo sobreviven sus propios campos', () => {
    const documento = depurarDocumento(patologias, {
      definicion: [{ blockType: 'advertencia', tono: 'perla', texto: 'Ojo', extra: 'colado' }],
    })
    const [bloque] = documento.definicion as Record<string, unknown>[]
    expect(bloque.extra).toBeUndefined()
    expect(bloque.tono).toBe('perla')
  })

  it('el texto rico se reconstruye, de modo que un árbol inventado no sobrevive', () => {
    const documento = depurarDocumento(patologias, {
      definicion: [
        {
          blockType: 'texto',
          cuerpo: {
            root: {
              children: [
                {
                  type: 'paragraph',
                  children: [{ type: 'text', text: 'legítimo', format: 0 }],
                },
                { type: 'nodo-inventado', onClick: 'alert(1)', children: [] },
              ],
            },
          },
        },
      ],
    })
    const [bloque] = documento.definicion as Record<string, unknown>[]
    expect(textoPlano(bloque.cuerpo)).toBe('legítimo')
    expect(JSON.stringify(bloque.cuerpo)).not.toContain('nodo-inventado')
    expect(JSON.stringify(bloque.cuerpo)).not.toContain('onClick')
  })

  it('pone techo a la cantidad de bloques', () => {
    const muchos = Array.from({ length: LIMITES.MAXIMO_BLOQUES + 50 }, () => ({
      blockType: 'advertencia',
      tono: 'perla',
      texto: 'x',
    }))
    const documento = depurarDocumento(patologias, { definicion: muchos })
    expect((documento.definicion as unknown[]).length).toBe(LIMITES.MAXIMO_BLOQUES)
  })

  it('un campo de bloques que no llega como arreglo queda vacío', () => {
    expect(depurarDocumento(patologias, { definicion: 'texto suelto' }).definicion).toEqual([])
  })
})

describe('listas', () => {
  it('conserva el identificador de fila para no recrearla en la base', () => {
    const documento = depurarDocumento(patologias, {
      fases: [{ id: 'abc123', cuando: '0-2 semanas', titulo: 'Protección', contenido: 'reposo' }],
    })
    const [fila] = documento.fases as Record<string, unknown>[]
    expect(fila.id).toBe('abc123')
    expect(fila.cuando).toBe('0-2 semanas')
  })

  it('pone techo a la cantidad de filas', () => {
    const muchas = Array.from({ length: LIMITES.MAXIMO_FILAS + 20 }, () => ({ cuando: 'x' }))
    const documento = depurarDocumento(patologias, { fases: muchas })
    expect((documento.fases as unknown[]).length).toBe(LIMITES.MAXIMO_FILAS)
  })

  it('recorre las listas anidadas', () => {
    const estudios = esquemaDe('estudios-ia')
    const documento = depurarDocumento(estudios, {
      opciones: [
        {
          titulo: 'Clavo endomedular',
          frecuente: true,
          aFavor: [{ texto: 'carga precoz', colado: 'x' }],
          enContra: [{ texto: 'irradiación' }],
        },
      ],
    })
    const [opcion] = documento.opciones as Record<string, unknown>[]
    const [aFavor] = opcion.aFavor as Record<string, unknown>[]
    expect(aFavor.texto).toBe('carga precoz')
    expect(aFavor.colado).toBeUndefined()
  })
})

describe('campos obligatorios', () => {
  it('señala en español lo que falta', () => {
    const problemas = faltantes(patologias, depurarDocumento(patologias, {}))
    expect(problemas.join(' ')).toContain('nombre de la patología')
    expect(problemas.join(' ')).toContain('segmento anatómico')
  })

  it('no se queja cuando está todo', () => {
    const documento = depurarDocumento(patologias, { nombre: 'Ficha', segmento: 7 })
    expect(faltantes(patologias, documento)).toEqual([])
  })
})
