/**
 * Contenido de demostración para comprobar el renderizado.
 *
 * NO es contenido clínico: son textos de relleno que ejercitan los siete tipos
 * de bloque. La plataforma nace vacía por decisión D-016, así que esto se crea
 * solo cuando se ejecuta a mano y se borra con `npm run demo:limpiar`.
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

// tsx no carga .env como hace Next.js, y las importaciones estáticas se elevan
// por encima de este bloque: Payload leería su configuración antes de que las
// variables existieran. Por eso se cargan aquí y el resto se importa dentro de
// main(), de forma dinámica.
const archivoEnv = resolve(process.cwd(), '.env')
if (existsSync(archivoEnv)) process.loadEnvFile(archivoEnv)

const parrafo = (texto: string) => ({
  root: {
    type: 'root',
    format: '',
    indent: 0,
    version: 1,
    direction: 'ltr' as const,
    children: [
      {
        type: 'paragraph',
        format: '',
        indent: 0,
        version: 1,
        direction: 'ltr' as const,
        children: [{ type: 'text', text: texto, format: 0, style: '', mode: 'normal', detail: 0, version: 1 }],
      },
    ],
  },
})

async function main() {
  const { getPayload } = await import('payload')
  const config = (await import('@payload-config')).default
  const payload = await getPayload({ config })

  const segmento = await payload.create({
    collection: 'segmentos',
    data: { nombre: 'Fémur', orden: 1 },
    overrideAccess: true,
  })

  await payload.create({
    collection: 'patologias',
    overrideAccess: true,
    data: {
      nombre: 'Ficha de demostración',
      subtitulo: 'Contenido de relleno para revisar la presentación',
      segmento: segmento.id,
      codigo: 'DEMO',
      tipo: 'trauma',
      _status: 'published',
      definicion: [
        { blockType: 'texto', titulo: 'Cómo se ve un bloque de texto', cuerpo: parrafo('Este párrafo ejercita el editor de texto enriquecido. El autor escribe con negrita, cursiva, listas y encabezados, y el resultado se guarda como árbol estructurado, nunca como HTML.') },
        { blockType: 'advertencia', tono: 'perla', texto: 'Las advertencias tienen tres tonos: atención, error frecuente y perla clínica. Cada una se ve distinta sin que el autor elija colores.' },
      ],
      mecanismo: [
        { blockType: 'lista-clinica', titulo: 'Cómo se ve una lista clínica', puntos: [
          { destacado: 'Punto con idea destacada.', texto: 'El autor puede resaltar la idea principal y desarrollarla a continuación.' },
          { destacado: 'El bloque de modelo 3D', texto: 'Exige un archivo cargado, de modo que aparece en la ficha solo cuando hay un modelo real que mostrar.' },
          { texto: 'Un punto también puede ir sin destacado, simplemente como texto corrido.' },
        ] },
      ],
      clasificacion: [
        { blockType: 'tabla-clasificacion', titulo: 'Cómo se ve una tabla de clasificación', filas: [
          { clave: 'Tipo A', descripcion: 'Primera categoría de la clasificación.' },
          { clave: 'Tipo B', descripcion: 'Segunda categoría, con su descripción correspondiente.' },
          { clave: 'Tipo C', descripcion: 'Tercera categoría.' },
        ] },
      ],
      manejo: [
        { blockType: 'texto', cuerpo: parrafo('Una pestaña puede tener un solo bloque. Las pestañas vacías no se muestran al lector: una ficha en construcción parece incompleta, no rota.') },
        { blockType: 'advertencia', tono: 'error-frecuente', texto: 'Este es el aspecto de una advertencia de error frecuente.' },
      ],
      fases: [
        { cuando: 'Semanas 0 a 3', titulo: 'Primera fase', contenido: 'Las fases de rehabilitación se dibujan como una línea de tiempo.', criterio: 'Criterio para pasar a la fase siguiente.' },
        { cuando: 'Semanas 3 a 6', titulo: 'Segunda fase', contenido: 'Cada fase lleva periodo, objetivo, contenido y criterio de progresión.', criterio: 'Otro criterio de progresión.' },
      ],
    } as never,
  })

  console.log('Contenido de demostración creado. Ver http://localhost:3000/biblioteca')
  process.exit(0)
}

main().catch((e: unknown) => {
  const err = e as { message?: string; data?: { errors?: unknown[] }; errors?: unknown[] }
  console.error('FALLO:', err.message)
  console.error('DETALLE:', JSON.stringify(err.data?.errors ?? err.errors ?? e, null, 2))
  process.exit(1)
})
