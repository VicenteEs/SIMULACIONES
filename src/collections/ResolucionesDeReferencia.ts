import type { CollectionConfig } from 'payload'
import { escrituraDeModulo } from '@/access/payload'

/**
 * La resolución de referencia de cada caso del simulador (D-373, E3 de P-016).
 *
 * Es un recorrido que el editor hizo entero en la consola y guardó con el botón
 * del final: los gestos de cada paso tal como los mide la consola, con la nota
 * que sacaron. El ensayo de los casos (`scripts/ensayarCasos.ts`) vuelve a
 * calificarlo con el código que se va a desplegar y avisa si la nota cambió.
 * Así un cambio del motor que deja un caso sin solución se ve antes de subirlo,
 * en vez de cuando un residente no logra pasar un paso que antes pasaba.
 *
 * Colección aparte y no un campo de `cirugias`, por dos motivos:
 *  - guardarla en el caso sería un `update` de un documento con borradores, que
 *    crea una versión y puede publicar el borrador que el editor tenga a medias;
 *  - la referencia no es contenido: el residente no la lee, no se revisa ni se
 *    firma, y el historial del caso no tiene por qué llenarse de grabaciones.
 *
 * Una por caso, y que lo garantice la base: grabar otra vez reemplaza la de
 * antes. `cirugia` no es obligatoria solo para que la matriz de roles pueda
 * fabricar filas sin un caso por fila; la única acción que escribe aquí
 * (`grabarResolucionDeReferencia`) la pone siempre, y el ensayo trata una fila
 * sin caso como sobrante.
 *
 * Solo la lee y la escribe quien puede editar el simulador: el recorrido es la
 * solución del caso, paso por paso.
 */
export const ResolucionesDeReferencia: CollectionConfig = {
  slug: 'resoluciones-de-referencia',
  labels: { singular: 'Resolución de referencia', plural: 'Resoluciones de referencia' },
  admin: {
    useAsTitle: 'nombre',
    defaultColumns: ['nombre', 'puntaje', 'updatedAt'],
    group: 'Simulador',
  },
  access: {
    read: escrituraDeModulo('cirugias'),
    create: escrituraDeModulo('cirugias'),
    update: escrituraDeModulo('cirugias'),
    delete: escrituraDeModulo('cirugias'),
  },
  fields: [
    { name: 'nombre', type: 'text', required: true, label: 'Nombre' },
    {
      name: 'cirugia',
      type: 'relationship',
      relationTo: 'cirugias',
      unique: true,
      index: true,
      label: 'Caso',
    },
    // El recorrido tal como lo valida `recorridoValido`: gestos medidos, no
    // una grabación de la pantalla. Es lo mismo que el servidor recibe con
    // cada resultado para rehacer la nota (D-310).
    { name: 'recorrido', type: 'json', required: true, label: 'Recorrido' },
    // La nota que dio el servidor al grabarla, no la del navegador: es la que
    // el ensayo tiene que volver a sacar.
    { name: 'puntaje', type: 'number', required: true, label: 'Puntaje' },
    { name: 'puntajeMaximo', type: 'number', required: true, label: 'Puntaje máximo' },
    // De qué caso se grabó: el formato y la fecha de guardado que tenía. Si el
    // caso se editó después, una nota distinta puede ser el cambio del editor y
    // no un fallo del código, y el ensayo lo dice así en vez de pararse.
    { name: 'versionDelFormato', type: 'number', label: 'Versión del formato del caso' },
    { name: 'casoGuardadoEn', type: 'date', label: 'El caso, guardado el' },
  ],
}
