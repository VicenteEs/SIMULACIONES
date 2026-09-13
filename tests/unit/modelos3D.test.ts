import { describe, it, expect } from 'vitest'
import { Modelos3D } from '@/collections/Modelos3D'

/**
 * El gancho que valida el modelo subido, en el sitio donde sirve de algo.
 *
 * `tests/unit/validarModelo3D.test.ts` prueba la función pura; esto prueba que
 * alguien la llama, y que la llama **antes** de que Payload decida el nombre
 * del archivo. Mientras estuvo en `beforeValidate` corría después de
 * `generateFileData`: el nombre seguro se calculaba y se tiraba, y el rechazo
 * llegaba en inglés desde `checkFileRestrictions`.
 */

/** Cabecera real de un glTF binario: "glTF" + versión 2 + longitud total. */
function glbValido(bytesTotales = 128): Buffer {
  const b = Buffer.alloc(bytesTotales)
  b.write('glTF', 0, 'ascii')
  b.writeUInt32LE(2, 4)
  b.writeUInt32LE(bytesTotales, 8)
  return b
}

const archivoDePrueba = (nombre: string, contenido = glbValido()) => ({
  data: contenido,
  mimetype: 'model/gltf-binary',
  name: nombre,
  size: contenido.length,
})

const ganchos = Modelos3D.hooks?.beforeOperation ?? []
const correr = (file: unknown) => ganchos[0]!({ req: { file } } as never)

describe('la subida de un modelo 3D se comprueba antes de tocar el disco', () => {
  it('el gancho está en beforeOperation y no en beforeValidate', () => {
    // Payload prepara el archivo en `generateFileData`, que corre antes del
    // `beforeValidate` de la colección. Devolver el gancho ahí lo deja llegando
    // tarde a las dos cosas que hace: sanear el nombre y explicar el rechazo en
    // español.
    expect(ganchos.length, 'nadie valida el modelo subido').toBe(1)
    expect(Modelos3D.hooks?.beforeValidate ?? []).toHaveLength(0)
  })

  it('sanea el nombre del archivo antes de que Payload lo lea', () => {
    const archivo = archivoDePrueba('../../etc/passwd.glb')
    correr(archivo)
    expect(archivo.name).toBe('etc-passwd.glb')
  })

  it('también con una ruta al estilo de Windows', () => {
    const bs = String.fromCharCode(92)
    const archivo = archivoDePrueba(['..', '..', 'Windows', 'System32', 'algo.glb'].join(bs))
    correr(archivo)
    expect(archivo.name).toBe('Windows-System32-algo.glb')
  })

  it('rechaza en español lo que no es un modelo, sin esperar a Payload', () => {
    const exe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00])
    expect(() => correr(archivoDePrueba('femur.glb', exe))).toThrow(/contenido/i)
  })

  it('no estorba a las operaciones que no traen archivo', () => {
    expect(() => correr(undefined)).not.toThrow()
  })

  it('no anuncia el glTF de texto, que no se puede subir', () => {
    // Un `.gltf` es JSON: nunca lleva la firma binaria, y arrastra un `.bin` y
    // sus texturas, que esta colección no sabe guardar.
    const tipos = (Modelos3D.upload as { mimeTypes?: string[] }).mimeTypes ?? []
    expect(tipos).not.toContain('model/gltf+json')
    expect(tipos).toContain('model/gltf-binary')
  })
})
