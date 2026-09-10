/**
 * Los bloques de contenido, descritos para el panel propio.
 *
 * Paralelo a `src/blocks/index.ts`, igual que `esquema.ts` lo es a
 * `src/collections`: allí se define cómo se guarda cada bloque, aquí cómo se
 * edita. `tests/unit/esquema.test.ts` comprueba que ninguno de los dos se mueva
 * sin el otro.
 */

import type { Campo } from './esquema'
import { textoPlano } from '@/lib/textoRico'

export interface EsquemaDeBloque {
  slug: string
  nombre: string
  /** Frase que resume el bloque cuando está plegado en el editor. */
  resumen: (valores: Record<string, unknown>) => string
  campos: Campo[]
}

const recorta = (valor: unknown, largo = 60): string => {
  const texto = typeof valor === 'string' ? valor.trim() : ''
  if (!texto) return ''
  return texto.length > largo ? `${texto.slice(0, largo)}…` : texto
}

export const BLOQUES: EsquemaDeBloque[] = [
  {
    slug: 'texto',
    nombre: 'Texto',
    resumen: (v) => recorta(v.titulo) || recorta(textoPlano(v.cuerpo)) || 'sin contenido',
    campos: [
      { tipo: 'texto', nombre: 'titulo', etiqueta: 'Título de la sección (opcional)' },
      { tipo: 'rico', nombre: 'cuerpo', etiqueta: 'Contenido', requerido: true },
    ],
  },
  {
    slug: 'lista-clinica',
    nombre: 'Lista clínica',
    resumen: (v) => {
      const puntos = Array.isArray(v.puntos) ? v.puntos.length : 0
      return recorta(v.titulo) || `${puntos} punto${puntos === 1 ? '' : 's'}`
    },
    campos: [
      { tipo: 'texto', nombre: 'titulo', etiqueta: 'Encabezado de la lista' },
      {
        tipo: 'lista',
        nombre: 'puntos',
        etiqueta: 'Puntos',
        singular: 'Punto',
        campos: [
          { tipo: 'texto', nombre: 'destacado', etiqueta: 'Idea en negrita (opcional)' },
          { tipo: 'area', nombre: 'texto', etiqueta: 'Desarrollo', requerido: true },
        ],
      },
    ],
  },
  {
    slug: 'tabla-clasificacion',
    nombre: 'Tabla de clasificación',
    resumen: (v) => {
      const filas = Array.isArray(v.filas) ? v.filas.length : 0
      return recorta(v.titulo) || `${filas} fila${filas === 1 ? '' : 's'}`
    },
    campos: [
      {
        tipo: 'texto',
        nombre: 'titulo',
        etiqueta: 'Nombre de la clasificación',
        requerido: true,
      },
      {
        tipo: 'lista',
        nombre: 'filas',
        etiqueta: 'Filas',
        singular: 'Fila',
        campos: [
          { tipo: 'texto', nombre: 'clave', etiqueta: 'Código o tipo', requerido: true, medio: true },
          { tipo: 'area', nombre: 'descripcion', etiqueta: 'Descripción', requerido: true },
        ],
      },
    ],
  },
  {
    slug: 'advertencia',
    nombre: 'Advertencia',
    resumen: (v) => recorta(v.texto),
    campos: [
      {
        tipo: 'seleccion',
        nombre: 'tono',
        etiqueta: 'Tipo',
        requerido: true,
        opciones: [
          { valor: 'atencion', etiqueta: 'Atención' },
          { valor: 'error-frecuente', etiqueta: 'Error frecuente' },
          { valor: 'perla', etiqueta: 'Perla clínica' },
        ],
      },
      { tipo: 'area', nombre: 'texto', etiqueta: 'Texto', requerido: true },
    ],
  },
  {
    slug: 'imagen',
    nombre: 'Imagen',
    resumen: (v) => recorta(v.pie) || 'imagen',
    campos: [
      {
        tipo: 'archivo',
        nombre: 'imagen',
        etiqueta: 'Archivo',
        coleccion: 'medios',
        requerido: true,
      },
      { tipo: 'texto', nombre: 'pie', etiqueta: 'Pie de imagen' },
      {
        tipo: 'seleccion',
        nombre: 'ancho',
        etiqueta: 'Ancho',
        opciones: [
          { valor: 'completo', etiqueta: 'Ancho completo' },
          { valor: 'media', etiqueta: 'Media columna' },
          { valor: 'pequena', etiqueta: 'Pequeña, alineada a la derecha' },
        ],
      },
    ],
  },
  {
    slug: 'video',
    nombre: 'Video',
    resumen: (v) => recorta(v.pie) || 'video',
    campos: [
      {
        tipo: 'archivo',
        nombre: 'video',
        etiqueta: 'Archivo de video',
        coleccion: 'medios',
        requerido: true,
      },
      { tipo: 'texto', nombre: 'pie', etiqueta: 'Pie del video' },
    ],
  },
  {
    slug: 'instancia-atlas',
    nombre: 'Preparación anatómica',
    resumen: (v) => recorta(v.pie) || 'preparación del atlas',
    campos: [
      {
        tipo: 'relacion',
        nombre: 'preparacion',
        etiqueta: 'Preparación',
        coleccion: 'instancias-atlas',
        requerido: true,
        ayuda: 'Se arman en el taller anatómico del panel.',
      },
      { tipo: 'texto', nombre: 'pie', etiqueta: 'Pie del visor' },
    ],
  },
  {
    slug: 'modelo-3d',
    nombre: 'Modelo 3D',
    resumen: (v) => recorta(v.pie) || 'modelo 3D',
    campos: [
      {
        tipo: 'relacion',
        nombre: 'modelo',
        etiqueta: 'Modelo',
        coleccion: 'modelos-3d',
        requerido: true,
      },
      { tipo: 'texto', nombre: 'pie', etiqueta: 'Pie del visor' },
      {
        tipo: 'grupo',
        nombre: 'encuadre',
        etiqueta: 'Encuadre inicial',
        // El visor y el botón de capturar viven en `EditorDeEncuadre`. Sin
        // esta bandera esto son cinco casillas numéricas y una ayuda que le
        // pide al traumatólogo que pulse un botón inexistente: así estuvo desde
        // que se retiró la interfaz de Payload, que era donde vivía el botón.
        editor: 'encuadre3d',
        ayuda:
          'Con qué ángulo y a qué distancia abre el modelo el residente. ' +
          'Use el visor de aquí abajo; los números se rellenan solos.',
        campos: [
          { tipo: 'numero', nombre: 'escala', etiqueta: 'Escala', medio: true },
          { tipo: 'numero', nombre: 'distanciaCamara', etiqueta: 'Distancia de cámara', medio: true },
          { tipo: 'numero', nombre: 'giroX', etiqueta: 'Giro X (grados)', medio: true },
          { tipo: 'numero', nombre: 'giroY', etiqueta: 'Giro Y (grados)', medio: true },
          { tipo: 'numero', nombre: 'giroZ', etiqueta: 'Giro Z (grados)', medio: true },
        ],
      },
    ],
  },
]

export const bloqueDe = (slug: string): EsquemaDeBloque | undefined =>
  BLOQUES.find((b) => b.slug === slug)

export const esBloqueConocido = (slug: unknown): slug is string =>
  typeof slug === 'string' && BLOQUES.some((b) => b.slug === slug)
