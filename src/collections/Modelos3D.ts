import type { CollectionConfig } from 'payload'
import { lecturaSimple, escrituraDeContenido } from '@/access/payload'
import { validarModelo3D } from '@/uploads/validarModelo3D'
import { cacheDeArchivoPrivado } from './hooks/cacheDeArchivos'

/**
 * Modelos tridimensionales obtenidos de TC y RM segmentadas (decisión D-022).
 *
 * La validación mira el contenido real del archivo, no su extensión, y hace
 * cumplir el techo de peso: una malla sin reducir deja la plataforma
 * inservible en equipos modestos (observación O-008).
 */
export const Modelos3D: CollectionConfig = {
  slug: 'modelos-3d',
  labels: { singular: 'Modelo 3D', plural: 'Modelos 3D' },
  admin: { useAsTitle: 'nombre', defaultColumns: ['nombre', 'origen'], group: 'Estructura' },
  access: {
    read: lecturaSimple,
    create: escrituraDeContenido,
    update: escrituraDeContenido,
    delete: escrituraDeContenido,
  },
  upload: {
    // Fuera de `public/`, por lo mismo que los medios: ver Medios.ts. Se queda
    // como subcarpeta de `medios/` para que el volumen del servidor siga
    // siendo uno solo y los archivos ya subidos no haya que moverlos.
    staticDir: 'medios/modelos',
    // Privada y con `Vary: Cookie`: ver el comentario de la función.
    modifyResponseHeaders: cacheDeArchivoPrivado,
    // Solo glTF binario. `model/gltf+json` estuvo aquí anunciando un formato
    // que no se podía subir: un `.gltf` es JSON, no lleva la firma «glTF» que
    // exige `validarModelo3D`, y antes de llegar siquiera a esa comprobación
    // `checkFileRestrictions` lo rechaza porque `file-type` no reconoce JSON y
    // lo da por `text/plain`. Aparte del formato, el glTF de texto arrastra un
    // `.bin` y las texturas sueltas, y esta colección guarda un archivo por
    // documento: no habría dónde ponerlos.
    mimeTypes: ['model/gltf-binary', 'application/octet-stream'],
  },
  hooks: {
    // `beforeOperation` y no `beforeValidate`, y la diferencia no es de estilo.
    //
    // Payload prepara el archivo en `generateFileData`, que corre **antes** del
    // `beforeValidate` de la colección (`collections/operations/create.js`: la
    // llamada está por encima del bucle de ganchos). De ahí salían dos cosas:
    //
    // 1. El nombre del archivo ya estaba decidido cuando el gancho corría, así
    //    que `nombreSeguro` se calculaba, se probaba y no se aplicaba en
    //    ninguna subida real. Payload sanea por su cuenta el nombre base con
    //    `sanitize-filename`, pero no la extensión, que sale de un
    //    `split('.').pop()` sin tocar.
    // 2. `checkFileRestrictions`, dentro de `generateFileData`, rechazaba antes
    //    que nosotros y con su mensaje en inglés («The following field is
    //    invalid: file»); el motivo en español no llegaba nunca a la pantalla.
    //
    // `beforeOperation` es el único gancho anterior a todo eso. Cubre además la
    // otra vía de subida, `exportarComoModelo` del atlas, que llama a
    // `payload.create` con su propio `file`.
    beforeOperation: [
      ({ req }) => {
        const archivo = req?.file
        if (!archivo) return
        const resultado = validarModelo3D({
          nombre: archivo.name,
          contenido: archivo.data,
          bytes: archivo.size,
        })
        if (!resultado.valido) {
          throw new Error(resultado.motivo ?? 'El archivo no es un modelo 3D válido.')
        }
        if (resultado.nombreSeguro) archivo.name = resultado.nombreSeguro
      },
    ],
  },
  fields: [
    { name: 'nombre', type: 'text', required: true, label: 'Nombre del modelo' },
    {
      name: 'origen',
      type: 'select',
      required: true,
      defaultValue: 'tc',
      label: 'Origen',
      options: [
        { label: 'Tomografía computarizada', value: 'tc' },
        { label: 'Resonancia magnética', value: 'rm' },
        { label: 'Modelo sintético o de referencia', value: 'sintetico' },
      ],
    },
    {
      name: 'anonimizado',
      type: 'checkbox',
      defaultValue: false,
      label: 'Confirmo que el estudio de origen está anonimizado',
      admin: {
        description:
          'Los metadatos DICOM guardan nombre, identificador y fecha de nacimiento aunque la imagen se vea anónima. Ver Q-007 de la bitácora.',
      },
    },
    {
      name: 'triangulos',
      type: 'number',
      label: 'Triángulos de la malla',
      admin: {
        description: 'Referencia de rendimiento. El objetivo para navegador va de 50.000 a 150.000.',
      },
    },
    { name: 'notas', type: 'textarea', label: 'Notas del procesamiento' },
    {
      /**
       * Desde qué ángulo abre este modelo, para que el residente lo vea
       * encuadrado como lo dejó el profesor.
       *
       * Lo pidió el traumatólogo con estas palabras: «enfocar el punto de vista
       * del alumno, dejarle el modelo de la pierna por ejemplo en una pose».
       * Hasta hoy el encuadre lo decidía el visor —mide la caja del modelo y lo
       * abarca entero—, y eso es honesto pero es la vista de nadie: la fractura
       * puede quedar detrás, y el residente que no sabe qué busca no gira el
       * modelo, mira el que le enseñan.
       *
       * **La forma es la de `Encuadre` (`src/lib/encuadre.ts`), no la del
       * atlas.** Las dos existían ya, y elegir mal era crear la tercera:
       *
       * - `VistaDeInstancia` (`src/atlas/formato.ts`) guarda dos puntos en el
       *   espacio —cámara y objetivo— más la separación de las piezas. Se puede
       *   porque el atlas es UNA escena compartida, un cuerpo entero en metros:
       *   ahí una coordenada absoluta significa siempre lo mismo. Un `.glb`
       *   subido viene en la unidad del estudio del que salió y centrado donde
       *   quiso Blender, de modo que «cámara en (0.6, 1.1, 2.6)» no dice nada
       *   sobre él; y `separacion` no tiene equivalente, porque aquí no hay
       *   piezas que apartar.
       * - `Encuadre` guarda lo que sí es propio del modelo: cuánto hay que
       *   girarlo para verlo así, a qué distancia mirarlo y con qué escala.
       *   Es lo que produce `encuadreCapturado`, lo que consume `Visor3D` y lo
       *   que ya guarda el bloque «Modelo 3D» de una ficha
       *   (`src/blocks/index.ts`), con estos cinco nombres. Compartir nombre y
       *   forma es lo que permite que un lector caiga de uno al otro sin
       *   traducir nada: el del bloque si lo trae y, si no, el del modelo.
       *
       * **Ese cable está tendido, y no es un `??`.** La regla de precedencia
       * vive en `encuadreVigente` (`src/lib/encuadre.ts`): manda el del bloque,
       * si el bloque no dice nada manda este, y si ninguno dice nada el visor
       * abarca la pieza por su cuenta. Quien abra un modelo del catálogo le pide
       * a ella el encuadre en vez de leer lo suyo —el primero en hacerlo fue el
       * bloque «Modelo 3D» de una ficha (`src/components/Bloques.tsx`)—, y esa
       * es la única forma de que esto no vuelva a ser un campo que se ve lleno
       * en el panel y no se ve en ninguna parte: el traumatólogo captura la
       * pose, la guarda, y no tiene dónde ir a corregir lo que el residente
       * sigue viendo. La regla se dejó como aritmética sin biblioteca
       * justamente para que un componente de servidor pueda llamarla.
       *
       * Lo que no vale es `bloque.encuadre ?? modelo.encuadre`, que es lo que
       * pide el cuerpo: `depurarCampos` (`src/admin/depurar.ts`) reconstruye el
       * documento recorriendo el esquema y **escribe siempre las cinco claves
       * del grupo**, de modo que un bloque guardado desde el panel trae un
       * `encuadre` que es un objeto aunque esté entero a nulos. El `??` no
       * caería al modelo jamás y el respaldo quedaría escrito, probado y muerto.
       * La pregunta que sí distingue los dos casos es `tieneEncuadre`
       * (`src/lib/encuadre.ts`, que `Visor3D.tsx` reexporta), y mira
       * `distanciaCamara`, que es la misma con la que el visor decide si
       * encuadra él.
       *
       * **Sin `defaultValue`, igual que el bloque**, y esa igualdad es el campo
       * entero. Vacío significa «encuadra tú solo»: `tieneEncuadre`
       * (`src/lib/encuadre.ts`) mira si hay `distanciaCamara`, y si no la hay el
       * visor abarca el modelo por su cuenta. Un `defaultValue: 3` haría que
       * todo modelo naciera con un encuadre puesto sin que nadie lo hubiera
       * capturado, el respaldo automático dejaría de actuar y los modelos en
       * milímetros —que los hay— volverían a abrirse como un punto en el centro
       * de la pantalla.
       *
       * El bloque sí lo tuvo —escala 1, giros 0, distancia 3—, y ahí el daño era
       * otro y mayor: como el bloque manda sobre el modelo, todo bloque
       * contestaba «sí, tengo encuadre» sin que nadie hubiera capturado nada, y
       * la pose de aquí no llegaba nunca al residente. Se quitó; el porqué
       * entero, y lo que quitarlo **no** arregla —las filas que nacieron con él
       * siguen ganando hasta que una migración las vacíe—, está en
       * `src/blocks/index.ts`. Hoy los dos campos significan lo mismo, que es lo
       * que permite caer de uno al otro sin traducir nada.
       */
      name: 'encuadre',
      type: 'group',
      label: 'Encuadre inicial',
      admin: {
        description:
          'Con qué ángulo y a qué distancia abre este modelo. Vacío: lo encuadra el visor.',
      },
      fields: [
        // Los topes dicen lo único que de verdad no puede pasar: la escala no
        // puede ser cero —el modelo desaparece— y la cámara no puede estar
        // dentro de él.
        //
        // El suelo de la escala es 0,0001 y no el 0,01 que hubo aquí. Con 0,01
        // este campo impedía justo el caso que existe para proteger:
        // `encuadreQueLoAbarca` (`src/lib/encuadre.ts`) devuelve `1/radio`, y un
        // fémur de 250 mm de radio da 0,004. Guardando desde el panel eso no
        // daba error: `depurarCampo` (`src/admin/depurar.ts`) recorta contra el
        // tope **sin decir nada**, así que «Ajustar al modelo» capturaba 0,004,
        // se guardaba 0,01 y el hueso se abría dos veces y media más grande de
        // lo que el traumatólogo dejó en pantalla —y el factor crece con la
        // pieza: un modelo del doble de radio se abría cinco veces más grande—.
        // Por la API local o por un guion era peor de otra manera: este `min`
        // lo rechazaba de plano.
        //
        // 0,0001 sigue impidiendo el cero, que es lo único que había que
        // impedir, y deja pasar los milímetros.
        //
        // El mismo número lo declaran otros dos sitios, y los tres se mueven a
        // la vez o no se mueve ninguno: el bloque «Modelo 3D» de una ficha
        // (`src/blocks/index.ts`), que guarda esta misma captura para una ficha
        // concreta, y el panel (`src/admin/esquema.ts`), que recorta antes de
        // que Payload llegue a validar. El bloque se quedó en 0,01 cuando esto
        // bajó, y esa mitad sin hacer se notaba solo al guardar: la misma pose
        // que el catálogo admitía, en un bloque la rechazaba Payload con su
        // mensaje en inglés. Ahora los atan dos pruebas —el tope del bloque, en
        // `tests/unit/encuadreDelModelo.test.ts`; el del panel, en
        // `tests/unit/esquema.test.ts`—, que es lo que faltaba: los tres números
        // estaban escritos y nada los comparaba.
        { name: 'escala', type: 'number', min: 0.0001, max: 100, label: 'Escala' },
        { name: 'giroX', type: 'number', label: 'Giro en X (grados)' },
        { name: 'giroY', type: 'number', label: 'Giro en Y (grados)' },
        { name: 'giroZ', type: 'number', label: 'Giro en Z (grados)' },
        {
          name: 'distanciaCamara',
          type: 'number',
          min: 0.1,
          label: 'Distancia de la cámara',
        },
      ],
    },
  ],
}
