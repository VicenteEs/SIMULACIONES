import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { emparejarNodos, normalizarNombreDeNodo, sinSufijoNumerico } from '@/lib/emparejarNodos'

/** El caso nombra sus piezas y el modelo puede traerlas con otro nombre: sin emparejarlas no hay fragmento que reducir. */

describe('normalizar el nombre de un nodo', () => {
  it('quita mayúsculas, tildes y signos, y deja un solo guion bajo entre palabras', () => {
    expect(normalizarNombreDeNodo('Tibia derecha.001')).toBe('tibia_derecha_001')
    expect(normalizarNombreDeNodo('Tibia_derecha_fragmento_distal')).toBe('tibia_derecha_fragmento_distal')
    expect(normalizarNombreDeNodo('  Fémur (diáfisis)  ')).toBe('femur_diafisis')
  })

  it('el cargador de glTF sanea los nombres y quedan iguales al normalizarlos', () => {
    // «Tibia derecha.001» llega como «Tibia_derecha001»: se normalizan a lo mismo una vez quitado el sufijo.
    expect(sinSufijoNumerico(normalizarNombreDeNodo('Tibia_derecha001'))).toBe(sinSufijoNumerico(normalizarNombreDeNodo('Tibia derecha.001')))
  })

  it('el sufijo numérico se quita con o sin guion bajo', () => {
    expect(sinSufijoNumerico('tibia_derecha_001')).toBe('tibia_derecha')
    expect(sinSufijoNumerico('tibia_derecha1')).toBe('tibia_derecha')
    expect(sinSufijoNumerico('tibia_derecha')).toBe('tibia_derecha')
  })
})

describe('emparejar los nodos del caso con los del modelo', () => {
  it('lo que ya coincide exacto no se toca', () => {
    expect(emparejarNodos(['Tibia', 'Piel'], ['Tibia', 'Piel']).size).toBe(0)
  })

  it('un nombre que cambió solo de mayúsculas, tildes o separadores se empareja', () => {
    const m = emparejarNodos(['tibia_derecha_fragmento_distal', 'Piel'], ['Tibia derecha fragmento distal', 'Piel'])
    expect([...m]).toEqual([['Tibia derecha fragmento distal', 'tibia_derecha_fragmento_distal']])
  })

  it('el sufijo que añade el cargador o Blender al duplicar un nombre no impide emparejarlo', () => {
    const m = emparejarNodos(['Tibia_derecha_fragmento_distal001', 'Tibia_derecha_fragmento_proximal001'], ['Tibia_derecha_fragmento_distal', 'Tibia_derecha_fragmento_proximal'])
    expect(m.get('Tibia_derecha_fragmento_distal')).toBe('Tibia_derecha_fragmento_distal001')
    expect(m.get('Tibia_derecha_fragmento_proximal')).toBe('Tibia_derecha_fragmento_proximal001')
  })

  it('un nodo se usa una sola vez: el segundo nombre del caso que lo reclama se queda sin él', () => {
    const m = emparejarNodos(['Hueso.001'], ['Hueso', 'Hueso 1'])
    expect([...m.values()]).toEqual(['Hueso.001'])
    expect(m.size).toBe(1)
  })

  it('no le quita a una pieza el nodo que otra ya tiene por nombre exacto', () => {
    // «Hueso» existe exacto en el modelo y es de la pieza «Hueso»; «Hueso 1» no debe quedarse con él.
    const m = emparejarNodos(['Hueso'], ['Hueso', 'Hueso 1'])
    expect(m.size).toBe(0)
  })

  it('lo que no se parece a nada no se empareja', () => {
    expect(emparejarNodos(['Peroné'], ['Tibia']).size).toBe(0)
  })

  it('distingue proximal de distal', () => {
    const m = emparejarNodos(['Tibia_fragmento_proximal.001', 'Tibia_fragmento_distal.001'], ['Tibia fragmento distal'])
    expect(m.get('Tibia fragmento distal')).toBe('Tibia_fragmento_distal.001')
  })
})

describe('el lienzo reconcilia los nombres antes de buscar el fragmento', () => {
  it('renombra los nodos del modelo al cargar, antes de aplicar las piezas y buscar el fragmento', () => {
    const lienzo = readFileSync(join(process.cwd(), 'src/components/simulador/LienzoQuirurgico.tsx'), 'utf8')
    expect(lienzo).toContain('emparejarNodos')
    expect(lienzo.indexOf('renombrarSegunElCaso(')).toBeLessThan(lienzo.indexOf('buscarFragmento(raiz, ultimas.current.piezas)'))
  })
})
