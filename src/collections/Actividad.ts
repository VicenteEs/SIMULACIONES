import type { CollectionConfig, FieldAccess } from 'payload'
import {
  accesoDeSeguimiento,
  administracionDeUsuarios,
  creacionEnModuloVisible,
} from '@/access/payload'
// El motor del simulador es TypeScript puro: `src/lib/simulador.ts` solo
// importa `src/lib/reduccion.ts`, que no importa nada. Traerlo aquí no arrastra
// React ni three.js a la configuración de Payload.
import { RESULTADOS } from '@/lib/simulador'

/**
 * Los tres campos que identifican la fila: quién, qué módulo y qué ficha.
 *
 * Los fija el gancho o la acción al crear el registro, y a partir de ahí no se
 * tocan. `admin: { readOnly: true }` no lo impedía: es una indicación para la
 * interfaz de Payload —retirada en D-038— y el servidor nunca la miró. Lo único
 * que filtra campos en escritura es el acceso de campo, y solo sobre los que lo
 * declaran (`fields/hooks/beforeValidate/promise.js`:
 * `if (field.access && field.access[operation])`).
 *
 * El acceso de colección tampoco tapaba el hueco: `accesoDeSeguimiento` devuelve
 * `{ usuario: { equals: <id> } }`, y ese filtro decide **qué fila** se puede
 * tocar, no qué se escribe dentro. Así que un residente hacía
 * `PATCH /api/actividad/<fila-propia>` con `{"usuario": <otra cuenta>}` y movía
 * su historial de lectura a la cuenta de un compañero: las estadísticas del
 * panel —que el administrador usa para saber quién va al día— daban por leídas
 * fichas que ese compañero nunca abrió, y al residente por no haber leído nada.
 *
 * Solo se cierra la modificación: en la creación el gancho de abajo pone el
 * usuario. Y solo actúa por REST, porque el acceso de campo se salta con
 * `overrideAccess`, que es el valor por omisión de la API local con la que
 * escriben el panel y las acciones de servidor.
 */
const FIJADO_AL_CREAR: { update: FieldAccess } = { update: () => false }

/**
 * Los desenlaces que el motor sabe producir, menos el que sale bien.
 *
 * Se derivan de `RESULTADOS` en vez de escribirse aquí: una lista copiada a
 * mano se separa de la del motor en cuanto aparece un desenlace nuevo, y lo que
 * queda entonces es una complicación que el simulador sabe describir y la base
 * rechaza guardar, con el residente delante.
 *
 * `correcto` queda fuera porque una complicación es, por definición, un gesto
 * que dañó: si llega aquí, quien escribe se equivocó de lista.
 */
const DESENLACES_CON_DANO: string[] = Object.values(RESULTADOS).filter(
  (resultado) => resultado !== RESULTADOS.CORRECTO,
)

/**
 * Qué desenlaces acepta la columna, comprobado en código y no con un enum.
 *
 * La tentación era un `select` con estas opciones, y se descartó a sabiendas.
 * Un `select` es un tipo enumerado de PostgreSQL, así que **cada desenlace
 * nuevo del motor exigiría su migración**, y el olvido no lo caza nadie:
 * `tests/unit/migraciones.test.ts` compara nombres de columna y dice en su
 * propia cabecera que no mira tipos ni valores. El fallo aparecería en el
 * servidor, al guardar, como un 500 sin traducir —`invalid input value for
 * enum`—, justo cuando el residente acaba de terminar el caso.
 *
 * En texto, un desenlace nuevo se guarda solo y esta función lo acepta sola,
 * porque las dos leen `RESULTADOS`. Lo que se pierde es la garantía del motor
 * de base de datos; lo que se gana es que la garantía siga siendo cierta.
 *
 * Declarar `validate` **sustituye** a la validación que Payload pondría
 * (`fields/config/sanitize.js`: solo la instala `if (typeof field.validate ===
 * 'undefined'`), y aquí eso no quita nada: el campo no es obligatorio y el
 * valor es un identificador corto.
 */
const esDesenlaceDelSimulador = (valor: unknown): string | true => {
  if (valor === null || valor === undefined || valor === '') return true
  if (typeof valor === 'string' && DESENLACES_CON_DANO.includes(valor)) return true
  return `«${String(valor)}» no es un desenlace del simulador: los escribe la consola desde RESULTADOS (src/lib/simulador.ts).`
}

/**
 * Seguimiento de lectura: qué ficha visitó cada usuario y cuál dio por leída.
 *
 * No es analítica de producto sino la base del progreso que ve el residente y
 * del panel de actividad del administrador. Un registro por usuario y ficha; se
 * actualiza en lugar de acumular filas, porque interesa el estado, no el
 * historial completo de visitas.
 *
 * Desde la decisión del traumatólogo de hoy guarda además **lo que pasó en el
 * simulador**: el puntaje y las complicaciones del caso. Hasta ahora esos dos
 * vivían en estado local de `ConsolaQuirurgica.tsx` y se perdían al recargar,
 * con dos consecuencias que se pagaban a la vez: pasarse y quedarse corto
 * terminaban valiendo lo mismo —la distinción solo existía en un registro de
 * diez líneas que moría con la pestaña— y el «registro de complicaciones» que
 * la portada promete no existía en ninguna parte. Ver el porqué entero en
 * `puntosDelPaso` (`src/lib/simulador.ts`), que ya nombraba este campo como lo
 * que le faltaba.
 *
 * Las columnas tienen ya quien las llene y quien las lea, que es la mitad que
 * de verdad costaba: las escribe `registrarResultadoDeCirugia`
 * (`src/app/(frontend)/acciones/actividad.ts`), que comprueba entero lo que
 * compuso el navegador antes de tocar la base; se las manda
 * `ConsolaQuirurgica.tsx` en cada hito del caso; y las leen la portada del
 * residente y la pantalla de actividad del panel. Los enganches los sostiene
 * `tests/unit/cableadoDelProgreso.test.ts`, y esa prueba no sobra: tres
 * columnas declaradas, migradas y probadas que nadie escribe ni lee compilan,
 * pasan sus pruebas y no aparecen en ninguna pantalla, que es lo que fueron
 * durante un rato. La forma exacta que espera esta colección se describe en
 * cada campo, que es el contrato contra el que se cableó.
 */
export const Actividad: CollectionConfig = {
  slug: 'actividad',
  labels: { singular: 'Actividad', plural: 'Actividad' },
  admin: {
    useAsTitle: 'documentoId',
    defaultColumns: ['usuario', 'coleccion', 'completado', 'ultimaVisita'],
    group: 'Administración',
    description: 'Qué ha visitado y marcado como leído cada residente.',
  },
  access: {
    // El seguimiento es del administrador: el editor lleva el contenido, no el
    // progreso de los residentes, y con `accesoDePropiedad` leía y reescribía
    // las filas de todos. Ver `filtroDeSeguimiento`.
    read: accesoDeSeguimiento,
    // Crear una fila exige poder ver su módulo: sin eso, una cuenta con el
    // simulador vetado hacía `POST /api/actividad` con
    // `{"coleccion":"cirugias","completado":true}` y las estadísticas le
    // contaban como leída una ficha que no puede abrir. La regla vivía aquí
    // como `CREACION_DEL_MODULO_PROPIO`; se mudó a `src/access/payload.ts`
    // cuando `comentarios` necesitó la misma.
    create: creacionEnModuloVisible,
    update: accesoDeSeguimiento,
    delete: administracionDeUsuarios,
  },
  /**
   * Una sola fila por usuario y ficha, y que lo garantice la base.
   *
   * El invariante lo prometía la cabecera de esta colección —«un registro por
   * usuario y ficha»— y no lo sostenía nadie: la migración inicial declara
   * índices sueltos sobre `usuario_id`, `documento_id` y `ultima_visita`, y
   * ninguno compuesto. `anotar` consulta y, si no hay fila, crea; entre esas
   * dos operaciones caben dos pestañas abiertas a la vez —abrir una ficha y
   * marcarla enseguida son dos llamadas que viajan en paralelo— y quedaban dos
   * filas. Entonces marcar como leída tocaba una y la otra se quedaba en
   * `completado: false` para siempre: la portada seguía ofreciendo en «Continúa
   * leyendo» una ficha que el residente marcaba una vez y otra sin entender por
   * qué, y `resumenDeActividad` contaba la lectura dos veces.
   *
   * El lado de la aplicación ya estaba puesto para esto: el `catch` del
   * `create` de `acciones/actividad.ts` reintenta sobre lo que ya existe, así
   * que el choque del índice no le llega al residente como un error.
   *
   * Ojo al tocarlo: cambiar estos tres campos —o el orden— no basta con
   * escribirlo aquí. Necesita su `npx payload migrate:create`, y la migración
   * tiene que empezar borrando los duplicados que ya haya o `CREATE UNIQUE
   * INDEX` falla y con él el despliegue entero.
   */
  indexes: [{ fields: ['usuario', 'coleccion', 'documentoId'], unique: true }],
  hooks: {
    beforeChange: [
      ({ req, data, operation }) => {
        const ahora = new Date().toISOString()
        if (operation === 'create') {
          return { ...data, usuario: req.user?.id, ultimaVisita: ahora }
        }
        if (operation === 'update') {
          return { ...data, ultimaVisita: ahora }
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'usuario',
      type: 'relationship',
      relationTo: 'usuarios',
      required: true,
      access: FIJADO_AL_CREAR,
      admin: { readOnly: true },
    },
    {
      name: 'coleccion',
      type: 'select',
      required: true,
      options: [
        { label: 'patologias', value: 'patologias' },
        { label: 'maniobras', value: 'maniobras' },
        { label: 'casos-ao', value: 'casos-ao' },
        { label: 'cirugias', value: 'cirugias' },
        { label: 'estudios-ia', value: 'estudios-ia' },
      ],
      access: FIJADO_AL_CREAR,
      admin: { readOnly: true },
    },
    {
      name: 'documentoId',
      type: 'text',
      required: true,
      index: true,
      access: FIJADO_AL_CREAR,
      admin: { readOnly: true },
    },
    {
      // Este no lleva acceso de campo y no hace falta: el gancho de arriba lo
      // reescribe con la hora actual en cada creación y en cada modificación,
      // así que lo que mande el cliente se pierde de todos modos. Si algún día
      // el gancho deja de fijarlo, este campo necesita el mismo cierre que los
      // tres de arriba.
      name: 'ultimaVisita',
      type: 'date',
      index: true,
      admin: { readOnly: true },
    },
    {
      name: 'completado',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      /**
       * Lo que el residente lleva cobrado en este caso del simulador.
       *
       * Vacío en las cuatro colecciones que no son `cirugias`, y vacío también
       * en una cirugía que todavía no se ha jugado: el campo no distingue «cero
       * puntos» de «no empezado» por el valor, sino por el nulo. Por eso no
       * lleva `defaultValue: 0`, que pondría a todo el mundo un cero de salida
       * y dejaría el marcador contando partidas que nadie jugó.
       *
       * Lo calcula `puntosDelPaso` en el navegador y lo manda la consola; el
       * servidor no lo recalcula y no puede: tendría que repetir la simulación
       * entera. Eso significa que un residente puede escribir el puntaje que
       * quiera con un `PATCH` a su propia fila, igual que podía hasta hoy
       * inspeccionar la consola. Se acepta porque esto es seguimiento de
       * progreso y no una nota: sirve para que él vea lo que le costó el caso y
       * para que el administrador sepa quién lo ha recorrido. El día que cuente
       * como evaluación, la cuenta tiene que mudarse al servidor —el gesto
       * viaja, el puntaje se calcula aquí— y no basta con cerrar el campo.
       */
      name: 'puntaje',
      type: 'number',
      min: 0,
      label: 'Puntaje del caso',
    },
    {
      /**
       * Lo que valía el caso cuando se jugó, no lo que vale hoy.
       *
       * `puntajeMaximo` (`src/lib/simulador.ts`) suma los pasos del guion, y el
       * guion lo edita el traumatólogo: sin esta copia, añadir un paso a un caso
       * publicado convertiría «18 de 20» en «18 de 30» en el historial de quien
       * ya lo había terminado, sin que él hubiera hecho nada. El numerador y el
       * denominador de un marcador se guardan juntos o mienten por separado.
       */
      name: 'puntajeMaximo',
      type: 'number',
      min: 0,
      label: 'Puntaje máximo del caso en ese momento',
    },
    {
      /**
       * Las complicaciones del caso, una fila por gesto que dañó.
       *
       * Es el «registro de complicaciones» que la portada promete y que hasta
       * hoy no existía: la consola lo pintaba recortado a diez líneas, debajo de
       * seiscientos píxeles de interfaz, y lo perdía al recargar.
       *
       * Guarda el **último recorrido**, no el historial de todos: la fila es una
       * por usuario y ficha —índice único de más arriba— y describe un estado,
       * como `completado`. Quien escriba manda la lista entera y sustituye la
       * anterior; acumular intentos pide otra colección y otra decisión.
       *
       * `paso` es el identificador de la fila del guion (`pasos[].id` de la
       * cirugía) y no una relación: los pasos viven dentro del documento del
       * caso, no en una colección propia, así que Payload no puede apuntar a
       * ellos. Por eso se guardan al lado el número y el título con los que el
       * residente los vio: si el traumatólogo reordena el guion —o borra un
       * paso—, el identificador deja de encontrar nada y sin esas dos columnas
       * la complicación se queda sin poder nombrarse.
       */
      name: 'complicaciones',
      type: 'array',
      label: 'Complicaciones',
      // Un caso son unas decenas de pasos y esta lista es la del último
      // recorrido, así que cien filas están muy por encima de cualquier partida
      // real. El tope no es una regla de quirófano: es el suelo de un bucle mal
      // cerrado en el navegador, que sin esto escribiría hasta llenar la tabla.
      //
      // El mismo número está escrito en `MAXIMO_DE_COMPLICACIONES`
      // (`src/lib/progresoDelSimulador.ts`), que es donde la consola recorta
      // antes de mandar, y los dos se mueven juntos. Si este bajara solo,
      // Payload rechazaría la lista **entera** —y con ella el puntaje del
      // caso—, así que el residente terminaría el caso y no se le guardaría
      // nada, sin un error que lo explique.
      maxRows: 100,
      fields: [
        {
          name: 'paso',
          type: 'text',
          required: true,
          label: 'Identificador del paso',
        },
        {
          name: 'numero',
          type: 'number',
          min: 1,
          label: 'Número del paso, como lo vio el residente',
        },
        { name: 'titulo', type: 'text', label: 'Título del paso' },
        {
          name: 'resultado',
          type: 'text',
          label: 'Desenlace',
          // Texto y no `select`, y el porqué —que no es comodidad— está entero
          // en `esDesenlaceDelSimulador`.
          validate: esDesenlaceDelSimulador,
        },
        {
          // El mensaje exacto que leyó el residente, con sus números: «La
          // incisión es mayor de lo necesario. (24.5 mm · se esperan 8–15 mm)».
          // Lo compone `evaluarGesto` y es lo único de esta fila que explica
          // *cuánto* se pasó; el desenlace solo dice por dónde.
          name: 'detalle',
          type: 'textarea',
          label: 'Lo que dijo la consola',
        },
      ],
    },
  ],
}
