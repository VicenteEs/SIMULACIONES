import { getPayload } from 'payload'
import config from './src/payload.config'
import fs from 'fs'
import path from 'path'

async function createTestModel() {
  const payload = await getPayload({ config })

  // Get admin user
  const users = await payload.find({
    collection: 'usuarios',
    where: { rol: { equals: 'admin' } },
    limit: 1,
  })

  if (!users.docs.length) {
    console.log("No admin user found")
    process.exit(1)
  }

  const admin = users.docs[0]
  const filePath = path.resolve('prueba_rm_monai.glb')
  const fileData = fs.readFileSync(filePath)
  const size = fs.statSync(filePath).size

  const result = await payload.create({
    collection: 'modelos-3d',
    data: {
      nombre: 'Tumor RM Sintético (Procesado con MONAI)',
      origen: 'rm',
      anonimizado: true,
      triangulos: 12000,
      notas: 'Modelo sintético generado por MONAI a partir de un tensor de ruido gaussiano estructurado y exportado con marching cubes para pruebas.',
    },
    file: {
      data: fileData,
      mimetype: 'model/gltf-binary',
      name: 'prueba_rm_monai.glb',
      size: size,
    },
    user: admin,
  })

  console.log("Created 3D model in Payload:", result.id)
  process.exit(0)
}

createTestModel().catch(console.error)
