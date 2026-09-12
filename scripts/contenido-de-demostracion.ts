/**
 * Llena la plataforma con una pieza de cada cosa, para comprobar que funciona.
 *
 *   npx tsx scripts/contenido-de-demostracion.ts
 *   npx tsx scripts/contenido-de-demostracion.ts --limpiar
 *
 * **No es contenido clínico.** Es material de prueba, escrito para ejercitar
 * todas las piezas de la plataforma de punta a punta: los cinco módulos, los
 * bloques de contenido, la subida de un archivo con sus miniaturas, el visor 3D
 * dentro de una ficha y las pestañas de una patología. Cada documento lleva un
 * aviso dentro que lo dice, para que nadie lo confunda con material docente
 * revisado. La decisión D-016 es que la plataforma nace vacía: esto solo existe
 * si alguien lo ejecuta a mano, y `--limpiar` lo borra entero.
 *
 * El caso quirúrgico del simulador NO se crea aquí: lo arma
 * `scripts/caso-de-prueba.ts`, que además siembra los cinco catálogos y el
 * modelo. Los dos guiones son idempotentes y se pueden ejecutar en cualquier
 * orden y las veces que haga falta.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

// tsx no carga .env como hace Next.js, y las importaciones estáticas se elevan
// por encima de este bloque: Payload leería su configuración antes de que las
// variables existieran.
const archivoEnv = resolve(process.cwd(), '.env')
if (existsSync(archivoEnv)) process.loadEnvFile(archivoEnv)

const AVISO =
  'Material de demostración, no revisado clínicamente. Sirve para comprobar que la plataforma funciona, no para estudiar.'

// ------------------------------------------------------------------ segmentos

const SEGMENTOS = [
  { nombre: 'Hombro', orden: 10 },
  { nombre: 'Codo', orden: 20 },
  { nombre: 'Muñeca y mano', orden: 30 },
  { nombre: 'Cadera', orden: 40 },
  { nombre: 'Rodilla', orden: 50 },
  { nombre: 'Pierna', orden: 60 },
  { nombre: 'Tobillo y pie', orden: 70 },
]

// ------------------------------------------------------------------ la imagen
//
// Se dibuja aquí y no se trae de ninguna parte: un archivo de prueba que hay
// que conseguir aparte es un archivo que no está el día que se necesita. Además
// pasa por sharp, que es quien genera las miniaturas al subir, de modo que
// subirla comprueba también esa mitad.

const ESQUEMA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="520" viewBox="0 0 900 520">
  <rect width="900" height="520" fill="#eef1f7"/>
  <text x="40" y="60" font-family="Helvetica,Arial" font-size="26" fill="#0c1a38">Trazo de fractura · esquema de demostración</text>
  <text x="40" y="92" font-family="Helvetica,Arial" font-size="16" fill="#6b7a96">Imagen generada por el guion de contenido de prueba</text>
  <g stroke="#46587a" stroke-width="3" fill="#ffffff">
    <rect x="120" y="140" width="90" height="300" rx="24"/>
    <rect x="330" y="140" width="90" height="300" rx="24"/>
    <rect x="540" y="140" width="90" height="300" rx="24"/>
  </g>
  <g stroke="#9e2e27" stroke-width="5" stroke-linecap="round">
    <line x1="120" y1="300" x2="210" y2="300"/>
    <line x1="330" y1="270" x2="420" y2="330"/>
    <line x1="540" y1="250" x2="630" y2="290"/>
    <line x1="540" y1="310" x2="630" y2="350"/>
  </g>
  <g font-family="Helvetica,Arial" font-size="18" fill="#0c1a38" text-anchor="middle">
    <text x="165" y="480">A · simple transversa</text>
    <text x="375" y="480">B · simple oblicua</text>
    <text x="585" y="480">C · tercer fragmento</text>
  </g>
</svg>`

async function dibujarEsquema(): Promise<string> {
  const { default: sharp } = await import('sharp')
  const carpeta = join(process.cwd(), 'medios')
  if (!existsSync(carpeta)) mkdirSync(carpeta, { recursive: true })
  const destino = join(carpeta, '_esquema-de-demostracion.png')
  const png = await sharp(Buffer.from(ESQUEMA_SVG)).png().toBuffer()
  writeFileSync(destino, png)
  return destino
}

// ------------------------------------------------------------------ ayudantes

type Payload = Awaited<ReturnType<typeof import('payload').getPayload>>

/** Crea el documento si no existe, y si existe lo reescribe. */
async function sembrar(
  payload: Payload,
  coleccion: string,
  clave: string,
  valor: string,
  datos: Record<string, unknown>,
): Promise<string | number> {
  const { docs } = await payload.find({
    collection: coleccion as never,
    where: { [clave]: { equals: valor } } as never,
    limit: 1,
    draft: true,
    overrideAccess: true,
  })

  if (docs[0]) {
    const actualizado = await payload.update({
      collection: coleccion as never,
      id: (docs[0] as { id: string | number }).id as never,
      data: datos as never,
      draft: false,
      overrideAccess: true,
    })
    return (actualizado as { id: string | number }).id
  }

  const creado = await payload.create({
    collection: coleccion as never,
    data: datos as never,
    draft: false,
    overrideAccess: true,
  })
  return (creado as { id: string | number }).id
}

// ---------------------------------------------------------------- principal

async function principal() {
  const limpiar = process.argv.includes('--limpiar')

  const { getPayload } = await import('payload')
  const config = (await import('../src/payload.config')).default
  const { textoLlanoALexical } = await import('../src/lib/textoRico')
  const payload = await getPayload({ config })

  const parrafo = (t: string) => textoLlanoALexical(t)

  if (limpiar) {
    console.log('Borrando el contenido de demostración…')
    for (const [coleccion, clave, valores] of [
      ['patologias', 'nombre', ['Fractura de la diáfisis tibial']],
      ['maniobras', 'nombre', ['Maniobra de Lachman', 'Cajón anterior de rodilla']],
      ['casos-ao', 'titulo', ['Osteosíntesis con placa de compresión en diáfisis']],
      ['estudios-ia', 'nombre', ['Fractura distal de radio · lectura asistida']],
      ['medios', 'alt', ['Esquema de trazos de fractura, material de demostración']],
    ] as const) {
      for (const valor of valores) {
        const { docs } = await payload.find({
          collection: coleccion as never,
          where: { [clave]: { equals: valor } } as never,
          limit: 10,
          draft: true,
          overrideAccess: true,
        })
        for (const d of docs) {
          await payload.delete({
            collection: coleccion as never,
            id: (d as { id: string | number }).id as never,
            overrideAccess: true,
          })
          console.log(`  borrado ${coleccion} «${valor}»`)
        }
      }
    }
    console.log('Los segmentos no se borran: los usa el resto del contenido.')
    process.exit(0)
  }

  // --- segmentos -----------------------------------------------------------
  console.log('Segmentos')
  const segmentos = new Map<string, string | number>()
  for (const s of SEGMENTOS) {
    segmentos.set(s.nombre, await sembrar(payload, 'segmentos', 'nombre', s.nombre, s))
  }
  console.log(`  ${segmentos.size} segmentos`)

  // --- la imagen -----------------------------------------------------------
  console.log('Imagen de apoyo')
  const alt = 'Esquema de trazos de fractura, material de demostración'
  const { docs: yaEsta } = await payload.find({
    collection: 'medios',
    where: { alt: { equals: alt } },
    limit: 1,
    overrideAccess: true,
  })
  let imagenId = yaEsta[0]?.id
  if (!imagenId) {
    const ruta = await dibujarEsquema()
    const creada = await payload.create({
      collection: 'medios',
      data: { alt } as never,
      filePath: ruta,
      overrideAccess: true,
    })
    imagenId = (creada as { id: string | number }).id as never
  }
  console.log(`  imagen #${imagenId}`)

  // --- el modelo 3D que ya existe ------------------------------------------
  const { docs: modelos } = await payload.find({
    collection: 'modelos-3d',
    limit: 1,
    overrideAccess: true,
  })
  const modeloId = modelos[0]?.id
  console.log(modeloId ? `Modelo 3D existente #${modeloId}` : 'Sin modelo 3D todavía')

  // --- patología, con sus seis pestañas ------------------------------------
  console.log('Patología')
  const bloqueTexto = (titulo: string, cuerpo: string) => ({
    blockType: 'texto',
    titulo,
    cuerpo: parrafo(cuerpo),
  })

  await sembrar(payload, 'patologias', 'nombre', 'Fractura de la diáfisis tibial', {
    nombre: 'Fractura de la diáfisis tibial',
    subtitulo: 'Adulto · trazo simple y multifragmentario',
    segmento: segmentos.get('Pierna'),
    codigo: '42',
    tipo: 'trauma',
    definicion: [
      { blockType: 'advertencia', tono: 'atencion', texto: AVISO },
      bloqueTexto(
        'Qué es',
        'Solución de continuidad de la diáfisis tibial, entre el extremo proximal y el distal del hueso. Es la fractura de hueso largo más frecuente y la que con más frecuencia se presenta abierta, porque la cara anteromedial de la tibia es subcutánea en toda su longitud.',
      ),
      {
        blockType: 'lista-clinica',
        titulo: 'Lo que no se puede pasar por alto',
        puntos: [
          {
            destacado: 'Estado de la piel',
            texto:
              'La cara anteromedial no tiene músculo por delante. Una fractura cerrada con la piel tensa y ampollas es una urgencia distinta de una fractura cerrada sin ellas.',
          },
          {
            destacado: 'Síndrome compartimental',
            texto:
              'La pierna tiene cuatro compartimentos y es la localización más frecuente. El dolor desproporcionado y el dolor al estiramiento pasivo mandan sobre cualquier otra cosa.',
          },
          {
            destacado: 'Pulsos distales',
            texto: 'Pedio y tibial posterior, comparados con el lado sano, antes y después de reducir.',
          },
        ],
      },
    ],
    mecanismo: [
      bloqueTexto(
        'Cómo se produce',
        'Dos patrones. El de baja energía, por torsión con el pie fijo, da un trazo espiroideo u oblicuo largo con poca lesión de partes blandas. El de alta energía, por impacto directo, da trazos transversos, conminutos o segmentarios y lesión de partes blandas que condiciona el pronóstico más que el propio hueso.',
      ),
      bloqueTexto(
        'Por qué importa la distinción',
        'La energía del traumatismo predice la consolidación mejor que la clasificación radiológica. Dos fracturas con la misma imagen y distinta energía no se comportan igual.',
      ),
    ],
    clasificacion: [
      {
        blockType: 'tabla-clasificacion',
        titulo: 'AO/OTA 42 · diáfisis tibial',
        filas: [
          { clave: '42-A', descripcion: 'Simple. Un solo trazo y dos fragmentos: espiroidea, oblicua o transversa.' },
          { clave: '42-B', descripcion: 'En cuña. Hay un tercer fragmento, pero al reducirlo los dos principales contactan.' },
          { clave: '42-C', descripcion: 'Compleja. Los dos fragmentos principales no contactan tras la reducción.' },
        ],
      },
      {
        blockType: 'imagen',
        imagen: imagenId,
        pie: 'Esquema de los tres tipos de trazo. Imagen de demostración, dibujada por el guion de prueba.',
        ancho: 'completo',
      },
      {
        blockType: 'advertencia',
        tono: 'perla',
        texto:
          'La clasificación describe el hueso. El pronóstico lo pone la envoltura: una 42-A abierta grado III va peor que una 42-C cerrada.',
      },
    ],
    evaluacion: [
      bloqueTexto(
        'Exploración',
        'Inspección de toda la circunferencia de la pierna, incluida la cara posterior. Palpación de los cuatro compartimentos. Pulsos distales y relleno capilar. Exploración neurológica del peroneo profundo, del superficial y del tibial posterior, y dejarla escrita antes de cualquier manipulación.',
      ),
      {
        blockType: 'lista-clinica',
        titulo: 'Imagen',
        puntos: [
          { destacado: 'Radiografía', texto: 'Dos proyecciones que incluyan rodilla y tobillo. Una diáfisis fotografiada sin sus dos articulaciones esconde lesiones asociadas.' },
          { destacado: 'Tomografía', texto: 'Cuando el trazo llega a la metáfisis o se sospecha extensión articular.' },
        ],
      },
    ],
    manejo: [
      bloqueTexto(
        'Enclavado endomedular',
        'Es el tratamiento de referencia de la fractura diafisaria cerrada del adulto. Respeta la envoltura de partes blandas, permite carga precoz y reparte la carga con el hueso en vez de sustituirlo.',
      ),
      ...(modeloId
        ? [
            {
              blockType: 'modelo-3d',
              modelo: modeloId,
              pie: 'Modelo de demostración con los dos fragmentos separados. Gire con el ratón.',
              encuadre: { escala: 1, giroX: 0, giroY: 0, giroZ: 0, distanciaCamara: 3 },
            },
          ]
        : []),
      {
        blockType: 'advertencia',
        tono: 'error-frecuente',
        texto:
          'El bloqueo distal no es opcional. Sin él, el clavo controla el eje pero no la rotación ni el acortamiento, y eso es un tutor, no una osteosíntesis.',
      },
    ],
    rehabilitacion: [
      bloqueTexto(
        'Antes de la pauta',
        'La progresión depende de la estabilidad del montaje y del estado de las partes blandas, no del calendario. Lo que sigue es un esquema orientativo de demostración.',
      ),
    ],
    fases: [
      {
        cuando: 'Semanas 0 a 2',
        titulo: 'Proteger la herida y evitar la rigidez',
        contenido:
          'Elevación, control del edema y movilidad activa de tobillo y rodilla desde el primer día. Carga según el montaje.',
        criterio: 'Herida seca y sin signos de infección, y dorsiflexión activa completa.',
      },
      {
        cuando: 'Semanas 2 a 6',
        titulo: 'Recuperar el arco de movimiento',
        contenido:
          'Progresión de carga según tolerancia con un montaje estable. Trabajo de cuádriceps y de la musculatura de la pantorrilla sin resistencia.',
        criterio: 'Marcha con dos bastones sin dolor en el foco.',
      },
      {
        cuando: 'Semanas 6 a 12',
        titulo: 'Carga completa y fuerza',
        contenido:
          'Retirada progresiva de las ayudas. Fortalecimiento con resistencia creciente y trabajo propioceptivo.',
        criterio: 'Signos radiológicos de consolidación en tres corticales y marcha sin ayudas.',
      },
    ],
    _status: 'published',
  })
  console.log('  «Fractura de la diáfisis tibial» con sus seis pestañas')

  // --- maniobras -----------------------------------------------------------
  console.log('Maniobras')
  const MANIOBRAS = [
    {
      nombre: 'Maniobra de Lachman',
      segmento: 'Rodilla',
      evalua: 'Integridad del ligamento cruzado anterior',
      tecnica:
        'Paciente en decúbito supino con la rodilla en veinte o treinta grados de flexión. Una mano estabiliza el fémur distal y la otra sujeta la tibia proximal. Se traslada la tibia hacia delante con un movimiento firme y breve.',
      positivo:
        'Traslación anterior aumentada respecto del lado sano y, sobre todo, tope final blando en vez de firme. El tope importa más que los milímetros.',
      nota: 'Es más sensible que el cajón anterior porque a treinta grados la contractura de los isquiotibiales no bloquea la traslación.',
    },
    {
      nombre: 'Cajón anterior de rodilla',
      segmento: 'Rodilla',
      evalua: 'Traslación anterior de la tibia a noventa grados',
      tecnica:
        'Paciente en decúbito supino, cadera a cuarenta y cinco grados y rodilla a noventa, con el pie apoyado en la camilla. El explorador se sienta sobre el pie, sujeta la tibia proximal con las dos manos y tira hacia delante.',
      positivo: 'Traslación anterior mayor que en el lado sano, con tope blando.',
      nota: 'Menos sensible que Lachman en la fase aguda: el dolor y la contractura limitan la flexión a noventa grados y enmascaran la traslación.',
    },
  ]
  for (const m of MANIOBRAS) {
    await sembrar(payload, 'maniobras', 'nombre', m.nombre, {
      nombre: m.nombre,
      segmento: segmentos.get(m.segmento),
      evalua: m.evalua,
      tecnica: parrafo(m.tecnica),
      positivo: parrafo(m.positivo),
      nota: parrafo(`${m.nota} · ${AVISO}`),
      _status: 'published',
    })
  }
  console.log(`  ${MANIOBRAS.length} maniobras`)

  // --- caso AO -------------------------------------------------------------
  console.log('Caso AO')
  await sembrar(
    payload,
    'casos-ao',
    'titulo',
    'Osteosíntesis con placa de compresión en diáfisis',
    {
      titulo: 'Osteosíntesis con placa de compresión en diáfisis',
      codigo: '42-A2',
      procedimiento: parrafo(
        `Recorrido de los principios AO sobre una fractura simple de diáfisis tratada con compresión interfragmentaria. ${AVISO}`,
      ),
      pasos: [
        {
          titulo: 'Reducción anatómica bajo visión directa',
          descripcion: parrafo(
            'Se expone el foco lo justo, se limpia el hematoma sin desperiostizar y se enfrentan los dos fragmentos hasta que el trazo encaja. En una fractura simple la reducción es anatómica o no es.',
          ),
          principio: 'Reducción anatómica de la fractura',
          nota: parrafo('Cada milímetro de periostio que se levanta es vascularización que se pierde.'),
        },
        {
          titulo: 'Compresión interfragmentaria',
          descripcion: parrafo(
            'Tornillo de tracción perpendicular al trazo, o placa en modo compresión con el tornillo excéntrico. El objetivo es que el foco no se mueva nada, para que consolide por vía directa y sin callo visible.',
          ),
          principio: 'Estabilidad absoluta',
          nota: parrafo('Estabilidad absoluta y estabilidad relativa no se mezclan en el mismo foco: eligen vías de consolidación distintas.'),
        },
        {
          titulo: 'Preservación de la vascularización',
          descripcion: parrafo(
            'Se evita desperiostizar más allá de lo necesario para colocar la placa, y no se toca el tercer fragmento si lo hubiera. El hueso consolida con sangre, no con metal.',
          ),
          principio: 'Preservación de la irrigación',
          ...(modeloId ? { modelo: modeloId } : {}),
        },
        {
          titulo: 'Movilización precoz',
          descripcion: parrafo(
            'Con el montaje estable se empieza el arco de movimiento el primer día. La rigidez cuesta más de recuperar que la fractura de consolidar.',
          ),
          principio: 'Movilización precoz y segura',
        },
      ],
      _status: 'published',
    },
  )
  console.log('  «Osteosíntesis con placa de compresión» con 4 pasos')

  // --- estudio de imagen ---------------------------------------------------
  console.log('Estudio de imagen')
  await sembrar(
    payload,
    'estudios-ia',
    'nombre',
    'Fractura distal de radio · lectura asistida',
    {
      nombre: 'Fractura distal de radio · lectura asistida',
      codigo: '23-A2',
      confianza: 72,
      hallazgos: [
        { texto: 'Trazo extraarticular metafisario distal de radio con impactación dorsal.' },
        { texto: 'Báscula dorsal de la superficie articular, estimada en veintidós grados.' },
        { texto: 'Acortamiento radial de cuatro milímetros respecto del cúbito contralateral.' },
        { texto: 'No se identifica trazo que alcance la articulación radiocarpiana.' },
        { texto: `Estiloides cubital íntegra. ${AVISO}` },
      ],
      opciones: [
        {
          titulo: 'Reducción cerrada e inmovilización con yeso',
          frecuente: true,
          aFavor: [
            { texto: 'Fractura extraarticular en paciente de baja demanda funcional.' },
            { texto: 'Evita la anestesia y el riesgo quirúrgico.' },
          ],
          enContra: [
            { texto: 'La impactación dorsal y el acortamiento predicen pérdida de reducción en el yeso.' },
            { texto: 'Exige control radiológico estrecho en las tres primeras semanas.' },
          ],
        },
        {
          titulo: 'Placa volar bloqueada',
          frecuente: false,
          aFavor: [
            { texto: 'Permite corregir la báscula dorsal y mantener la longitud radial.' },
            { texto: 'Movilización precoz de la muñeca.' },
          ],
          enContra: [
            { texto: 'Cirugía y sus riesgos en una fractura que puede no necesitarla.' },
            { texto: 'En hueso osteoporótico el bloqueo no siempre compensa la conminución dorsal.' },
          ],
        },
      ],
      _status: 'published',
    },
  )
  console.log('  «Fractura distal de radio» con 5 hallazgos y 2 opciones')

  console.log('\nListo. Para el caso del simulador: npx tsx scripts/caso-de-prueba.ts')
  console.log('Para deshacerlo:        npx tsx scripts/contenido-de-demostracion.ts --limpiar')
  process.exit(0)
}

void principal()
