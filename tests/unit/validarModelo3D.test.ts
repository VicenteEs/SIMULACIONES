import { describe, it, expect } from 'vitest'
import { validarModelo3D, LIMITE_BYTES_MODELO_3D } from '@/uploads/validarModelo3D'

/** Cabecera real de un archivo glTF binario: "glTF" + versión 2 + longitud total. */
function glbValido(bytesTotales = 128): Buffer {
  const b = Buffer.alloc(bytesTotales)
  b.write('glTF', 0, 'ascii')
  b.writeUInt32LE(2, 4)
  b.writeUInt32LE(bytesTotales, 8)
  return b
}

describe('validarModelo3D', () => {
  it('acepta un glTF binario bien formado', () => {
    const r = validarModelo3D({ nombre: 'femur.glb', contenido: glbValido() })
    expect(r.valido).toBe(true)
  })

  it('rechaza un ejecutable renombrado a .glb: la extensión no es prueba de nada', () => {
    const exe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00])
    const r = validarModelo3D({ nombre: 'femur.glb', contenido: exe })
    expect(r.valido).toBe(false)
    expect(r.motivo).toMatch(/contenido/i)
  })

  it('rechaza una extensión que no corresponde a un modelo', () => {
    const r = validarModelo3D({ nombre: 'femur.exe', contenido: glbValido() })
    expect(r.valido).toBe(false)
    expect(r.motivo).toMatch(/extensión/i)
  })

  it('rechaza un archivo más pesado que el límite servible en navegador', () => {
    const r = validarModelo3D({
      nombre: 'femur.glb',
      contenido: glbValido(),
      bytes: LIMITE_BYTES_MODELO_3D + 1,
    })
    expect(r.valido).toBe(false)
    expect(r.motivo).toMatch(/tamaño|peso/i)
  })

  it('rechaza un archivo demasiado corto para contener siquiera una cabecera', () => {
    const r = validarModelo3D({ nombre: 'femur.glb', contenido: Buffer.from([0x67, 0x6c]) })
    expect(r.valido).toBe(false)
  })

  it('rechaza un glTF binario de una versión que el visor no soporta', () => {
    const b = glbValido()
    b.writeUInt32LE(1, 4)
    const r = validarModelo3D({ nombre: 'femur.glb', contenido: b })
    expect(r.valido).toBe(false)
    expect(r.motivo).toMatch(/versión/i)
  })

  it('normaliza el nombre para que no pueda escapar del directorio de subidas', () => {
    const r = validarModelo3D({ nombre: '../../etc/passwd.glb', contenido: glbValido() })
    expect(r.valido).toBe(true)
    expect(r.nombreSeguro).toBe('etc-passwd.glb')
  })

  it('acepta también la extensión .gltf', () => {
    expect(validarModelo3D({ nombre: 'femur.gltf', contenido: glbValido() }).valido).toBe(true)
  })
  it('tambien neutraliza una ruta al estilo de Windows', () => {
    const bs = String.fromCharCode(92) // barra invertida de Windows
    const ruta = ['..', '..', 'Windows', 'System32', 'algo.glb'].join(bs)
    const r = validarModelo3D({ nombre: ruta, contenido: glbValido() })
    expect(r.valido).toBe(true)
    expect(r.nombreSeguro).toBe('Windows-System32-algo.glb')
  })

  it('usa el largo del contenido cuando no se declara el peso del archivo', () => {
    const enorme = Buffer.alloc(LIMITE_BYTES_MODELO_3D + 1)
    enorme.write('glTF', 0, 'ascii')
    enorme.writeUInt32LE(2, 4)
    const r = validarModelo3D({ nombre: 'femur.glb', contenido: enorme })
    expect(r.valido).toBe(false)
    expect(r.motivo).toMatch(/tamaño|peso/i)
  })
})
