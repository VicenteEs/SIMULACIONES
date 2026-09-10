/**
 * Crea el caso quirúrgico de demostración y el vocabulario que necesita.
 *
 *   npx tsx scripts/caso-de-prueba.ts
 *
 * Escribe los cinco catálogos —huesos, clasificaciones AO, técnicas, fases e
 * instrumental—, sube el modelo de prueba y arma con todo ello una fractura de
 * diáfisis tibial 42-A2 tratada con clavo endomedular, en siete pasos.
 *
 * Sirve para dos cosas, y la segunda importa más que la primera. La obvia: dar
 * algo que abrir en la consola antes de que el traumatólogo escriba su primer
 * caso. La otra: **probar el modelo de datos contra un caso real**. Diseñar
 * campos sin un caso escrito delante es diseñar contra una idea, y hoy cambiar
 * la forma de los datos es gratis porque no hay una sola fila; con cuarenta
 * casos dentro, no.
 *
 * Es idempotente: se puede ejecutar las veces que haga falta. Busca cada cosa
 * por su nombre y solo crea lo que falta, de modo que no duplica catálogos ni
 * pisa lo que el traumatólogo haya cambiado a mano. El caso sí se reescribe
 * entero, porque es de demostración.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { getPayload, type Payload } from 'payload'
import config from '../src/payload.config'
import { textoLlanoALexical } from '../src/lib/textoRico'

const MODELO = join(process.cwd(), 'medios', 'modelos', 'tibia-de-prueba.glb')

// --------------------------------------------------------------- catálogos

const HUESOS = [
  { nombre: 'Tibia (diáfisis)', codigo: '42', orden: 1 },
  { nombre: 'Fémur (diáfisis)', codigo: '32', orden: 2 },
  { nombre: 'Húmero (diáfisis)', codigo: '12', orden: 3 },
  { nombre: 'Radio (extremo distal)', codigo: '23', orden: 4 },
]

const CLASIFICACIONES = [
  { codigo: 'A1', nombre: 'Simple espiroidea', tipo: 'A', orden: 1 },
  { codigo: 'A2', nombre: 'Simple oblicua', tipo: 'A', orden: 2 },
  { codigo: 'A3', nombre: 'Simple transversa', tipo: 'A', orden: 3 },
  { codigo: 'B1', nombre: 'En cuña espiroidea', tipo: 'B', orden: 4 },
  { codigo: 'B2', nombre: 'En cuña por flexión', tipo: 'B', orden: 5 },
  { codigo: 'C1', nombre: 'Compleja espiroidea', tipo: 'C', orden: 6 },
  { codigo: 'C2', nombre: 'Compleja segmentaria', tipo: 'C', orden: 7 },
]

const TECNICAS = [
  { nombre: 'Clavo endomedular', orden: 1, descripcion: 'Fijación intramedular con abordaje mínimo.' },
  { nombre: 'Placa de compresión', orden: 2, descripcion: 'Fijación absoluta con abordaje abierto.' },
  { nombre: 'Tornillos canulados', orden: 3, descripcion: 'Fijación percutánea de trazos simples.' },
  { nombre: 'Fijador externo', orden: 4, descripcion: 'Estabilización temporal o definitiva sin abrir el foco.' },
]

const FASES = [
  { nombre: 'Abordaje', orden: 1 },
  { nombre: 'Reducción', orden: 2 },
  { nombre: 'Fijación', orden: 3 },
  { nombre: 'Cierre', orden: 4 },
]

const INSTRUMENTAL = [
  { nombre: 'Bisturí N°10 (piel)', icono: 'bisturi', orden: 1 },
  { nombre: 'Bisturí profundo (fascia)', icono: 'bisturi', orden: 2 },
  { nombre: 'Separador de Farabeuf', icono: 'separador', orden: 3 },
  { nombre: 'Separador de Hohmann', icono: 'separador', orden: 4 },
  { nombre: 'Pinza de reducción', icono: 'pinza', orden: 5 },
  { nombre: 'Punzón de entrada', icono: 'punzon', orden: 6 },
  { nombre: 'Guía endomedular', icono: 'guia', orden: 7 },
  { nombre: 'Fresa flexible', icono: 'fresa', orden: 8 },
  { nombre: 'Impactador de clavo', icono: 'martillo', orden: 9 },
  { nombre: 'Atornillador de bloqueo', icono: 'atornillador', orden: 10 },
  { nombre: 'Pinza de disección', icono: 'pinza', orden: 11 },
  { nombre: 'Porta-agujas', icono: 'aguja', orden: 12 },
  { nombre: 'Tijera de Mayo', icono: 'tijera', orden: 13 },
]

// --------------------------------------------------------------- utilidades

/** Busca por nombre y crea solo si falta. Devuelve el identificador. */
async function asegurar(
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
    overrideAccess: true,
  })
  if (docs[0]) return (docs[0] as { id: string | number }).id

  const creado = await payload.create({
    collection: coleccion as never,
    data: datos as never,
    overrideAccess: true,
  })
  return (creado as { id: string | number }).id
}

const parrafo = (texto: string) => textoLlanoALexical(texto)

// ------------------------------------------------------------------ guion

interface PasoDePrueba {
  titulo: string
  fase: string
  objetivo: 'instrumento' | 'trazo' | 'reduccion' | 'fuerza'
  instrumento: string
  puntos: number
  descripcion: string
  exito: string
  insuficiente?: string
  excesivo?: string
  riesgo?: string
  muestra?: string[]
  extra?: Record<string, number>
}

const PASOS: PasoDePrueba[] = [
  {
    titulo: 'Incisión de abordaje proximal',
    fase: 'Abordaje',
    objetivo: 'trazo',
    instrumento: 'Bisturí N°10 (piel)',
    puntos: 20,
    descripcion:
      'Incisión longitudinal sobre el tendón rotuliano, centrada en el punto de entrada. Se traza sobre la piel y se profundiza por planos.',
    exito: 'Incisión adecuada: da acceso al punto de entrada sin exponer de más.',
    insuficiente:
      'La incisión es demasiado corta: no permite trabajar y obliga a traccionar los bordes, que es lo que necrosa la piel.',
    excesivo:
      'La incisión es mayor de lo necesario. No impide seguir, pero deja cicatriz y expone tejido sin motivo.',
    riesgo:
      'El tendón rotuliano. La incisión lo respeta o lo divide longitudinalmente, nunca lo secciona en sentido transversal.',
    muestra: ['piel', 'musculo', 'tibia_proximal', 'tibia_distal'],
    extra: { trazoMinimo: 25, trazoMaximo: 80 },
  },
  {
    titulo: 'Apertura del punto de entrada',
    fase: 'Abordaje',
    objetivo: 'instrumento',
    instrumento: 'Punzón de entrada',
    puntos: 20,
    descripcion:
      'Apertura de la cortical en el punto de entrada, justo proximal y medial a la tuberosidad tibial, en línea con el canal medular.',
    exito: 'Punto de entrada abierto y alineado con el canal.',
    riesgo:
      'Un punto de entrada demasiado anterior angula la fractura en recurvatum al pasar el clavo. El error se paga al final, no al abrir.',
    muestra: ['tibia_proximal', 'tibia_distal'],
  },
  {
    titulo: 'Reducción cerrada de la fractura',
    fase: 'Reducción',
    objetivo: 'reduccion',
    instrumento: 'Pinza de reducción',
    puntos: 30,
    descripcion:
      'Reducción por tracción y manipulación externa, sin abrir el foco. Se comprueba en los dos planos antes de pasar la guía.',
    exito: 'Reducción aceptable: la alineación permite pasar la guía por el fragmento distal.',
    insuficiente:
      'La reducción todavía no es aceptable. Pasar la guía así deja el clavo fuera del canal distal y consolida en mala posición.',
    riesgo:
      'La reducción se hace ANTES de fresar. Un canal fresado en mala alineación ya no se corrige moviendo el hueso.',
    muestra: ['tibia_proximal', 'tibia_distal'],
    extra: { toleranciaDesplazamiento: 5, toleranciaDiastasis: 4, toleranciaAngulacion: 5 },
  },
  {
    titulo: 'Paso de la guía endomedular',
    fase: 'Fijación',
    objetivo: 'instrumento',
    instrumento: 'Guía endomedular',
    puntos: 20,
    descripcion:
      'La guía se pasa desde el punto de entrada hasta el fragmento distal, centrada en el canal y comprobada en los dos planos.',
    exito: 'Guía centrada en el canal distal.',
    riesgo:
      'Si la guía queda excéntrica, la fresa labra el canal donde no debe y la cortical se adelgaza por un lado.',
    muestra: ['tibia_proximal', 'tibia_distal'],
  },
  {
    titulo: 'Fresado del canal medular',
    fase: 'Fijación',
    objetivo: 'fuerza',
    instrumento: 'Fresa flexible',
    puntos: 20,
    descripcion:
      'Fresado progresivo, de medio en medio milímetro, con la fresa girando siempre al entrar y al salir.',
    exito: 'Canal fresado de forma progresiva y sin calentar el hueso.',
    insuficiente: 'El canal queda estrecho para el diámetro de clavo elegido.',
    excesivo:
      'Fresado demasiado agresivo: la necrosis térmica de la cortical es una complicación que no se ve en el pabellón y sí a los tres meses.',
    riesgo: 'El calor. Se fresa con la fresa girando y sin forzar el avance.',
    muestra: ['tibia_proximal', 'tibia_distal'],
    extra: { fuerzaMinima: 20, fuerzaMaxima: 60 },
  },
  {
    titulo: 'Inserción del clavo endomedular',
    fase: 'Fijación',
    objetivo: 'fuerza',
    instrumento: 'Impactador de clavo',
    puntos: 20,
    descripcion:
      'El clavo entra a golpes suaves y controlados, comprobando que la reducción se mantiene mientras avanza.',
    exito: 'Clavo alojado a la profundidad correcta, con la reducción mantenida.',
    insuficiente: 'El clavo queda alto y sobresale en el punto de entrada.',
    excesivo:
      'Impactación excesiva: se puede estallar la cortical o hundir el clavo más allá de su posición.',
    riesgo:
      'Si el canal no está bien fresado, forzar el clavo rompe la diáfisis. La fuerza no arregla un canal estrecho.',
    muestra: ['tibia_proximal', 'tibia_distal'],
    extra: { fuerzaMinima: 30, fuerzaMaxima: 70 },
  },
  {
    titulo: 'Bloqueo proximal y distal',
    fase: 'Fijación',
    objetivo: 'instrumento',
    instrumento: 'Atornillador de bloqueo',
    puntos: 20,
    descripcion:
      'Bloqueo distal a mano alzada bajo fluoroscopia y proximal por la guía, comprobando longitud y rotación antes de cerrar.',
    exito: 'Montaje bloqueado en los dos extremos: la fractura queda estable en rotación y longitud.',
    riesgo:
      'Sin bloqueo distal, el clavo controla el eje pero no la rotación ni el acortamiento. Es el paso que convierte un tutor en una osteosíntesis.',
    muestra: ['tibia_proximal', 'tibia_distal'],
  },
]

// ---------------------------------------------------------------- principal

async function principal() {
  if (!existsSync(MODELO)) {
    console.error(
      `No encuentro el modelo de prueba en:\n  ${MODELO}\n\nEjecute antes:  node scripts/modelo-de-prueba.mjs`,
    )
    process.exit(1)
  }

  const payload = await getPayload({ config })

  console.log('Catálogos')
  const huesos = new Map<string, string | number>()
  for (const h of HUESOS) {
    huesos.set(h.nombre, await asegurar(payload, 'huesos-ao', 'nombre', h.nombre, h))
  }
  const clasificaciones = new Map<string, string | number>()
  for (const c of CLASIFICACIONES) {
    clasificaciones.set(c.codigo, await asegurar(payload, 'clasificaciones-ao', 'codigo', c.codigo, c))
  }
  const tecnicas = new Map<string, string | number>()
  for (const t of TECNICAS) {
    tecnicas.set(t.nombre, await asegurar(payload, 'tecnicas-quirurgicas', 'nombre', t.nombre, t))
  }
  const fases = new Map<string, string | number>()
  for (const f of FASES) {
    fases.set(f.nombre, await asegurar(payload, 'fases-quirurgicas', 'nombre', f.nombre, f))
  }
  const instrumental = new Map<string, string | number>()
  for (const i of INSTRUMENTAL) {
    instrumental.set(i.nombre, await asegurar(payload, 'instrumental', 'nombre', i.nombre, i))
  }
  console.log(
    `  ${huesos.size} huesos · ${clasificaciones.size} clasificaciones · ${tecnicas.size} técnicas · ${fases.size} fases · ${instrumental.size} instrumentos`,
  )

  console.log('Modelo 3D')
  const { docs: modelosExistentes } = await payload.find({
    collection: 'modelos-3d',
    where: { nombre: { equals: 'Tibia de prueba (partida)' } },
    limit: 1,
    overrideAccess: true,
  })
  let modeloId = modelosExistentes[0]?.id
  if (!modeloId) {
    const creado = await payload.create({
      collection: 'modelos-3d',
      data: {
        nombre: 'Tibia de prueba (partida)',
        origen: 'sintetico',
        anonimizado: true,
        notas:
          'Generado por scripts/modelo-de-prueba.mjs. Cuatro objetos con nombre: tibia_proximal, tibia_distal, musculo, piel. Sirve de ejemplo de la estructura que espera la consola.',
      } as never,
      filePath: MODELO,
      overrideAccess: true,
    })
    modeloId = (creado as { id: string | number }).id as never
  }
  console.log(`  modelo #${modeloId}`)

  console.log('Caso quirúrgico')
  const pasos = PASOS.map((p) => ({
    titulo: p.titulo,
    fase: fases.get(p.fase),
    objetivo: p.objetivo,
    instrumento: instrumental.get(p.instrumento),
    puntos: p.puntos,
    descripcion: parrafo(p.descripcion),
    exito: p.exito,
    insuficiente: p.insuficiente ?? null,
    excesivo: p.excesivo ?? null,
    riesgo: p.riesgo ? parrafo(p.riesgo) : null,
    muestra: (p.muestra ?? []).map((nodo) => ({ nodo })),
    ...(p.extra ?? {}),
  }))

  const datos = {
    nombre: 'Fractura de diáfisis tibial · clavo endomedular',
    hueso: huesos.get('Tibia (diáfisis)'),
    clasificacion: clasificaciones.get('A2'),
    tecnica: tecnicas.get('Clavo endomedular'),
    resumen: parrafo(
      'Varón de 34 años, caída de altura. Fractura simple oblicua de la diáfisis tibial, cerrada, sin compromiso neurovascular. Se plantea enclavado endomedular fresado con bloqueo proximal y distal.',
    ),
    modelo: modeloId,
    milimetrosPorUnidad: 1000,
    ejeLargo: 'y',
    piezas: [
      { nodo: 'piel', etiqueta: 'Piel', rol: 'piel' },
      { nodo: 'musculo', etiqueta: 'Compartimento anterior', rol: 'musculo' },
      { nodo: 'tibia_proximal', etiqueta: 'Fragmento proximal', rol: 'hueso' },
      { nodo: 'tibia_distal', etiqueta: 'Fragmento distal', rol: 'fragmento' },
    ],
    // Los tres números que ve el residente al abrir el caso. Salen de aquí y no
    // del archivo: el modelo se exporta reducido.
    desplazamientoInicial: { x: 12.5, y: 18, z: 0, giroX: 0, giroY: 0, giroZ: 9.8 },
    pasos,
    _status: 'published',
  }

  const { docs: existentes } = await payload.find({
    collection: 'cirugias',
    where: { nombre: { equals: datos.nombre } },
    limit: 1,
    draft: true,
    overrideAccess: true,
  })

  const caso = existentes[0]
    ? await payload.update({
        collection: 'cirugias',
        id: existentes[0].id,
        data: datos as never,
        draft: false,
        overrideAccess: true,
      })
    : await payload.create({
        collection: 'cirugias',
        data: datos as never,
        draft: false,
        overrideAccess: true,
      })

  const total = PASOS.reduce((t, p) => t + p.puntos, 0)
  console.log(`  «${datos.nombre}» #${(caso as { id: unknown }).id}`)
  console.log(`  ${PASOS.length} pasos · ${total} puntos`)
  console.log(`\nAbra /simulador y entre al caso.`)
  process.exit(0)
}

void principal()
