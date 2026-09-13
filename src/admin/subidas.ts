/**
 * El contrato de la subida de archivos: lo que la pantalla manda y lo que la
 * ruta espera recibir.
 *
 * Vive en un módulo aparte porque lo leen los dos extremos —el navegador en
 * `TablaDocumentos.tsx` y en `formulario/Campos.tsx`, y el servidor en
 * `src/app/(frontend)/api/subidas/[coleccion]/route.ts`— y un nombre de
 * cabecera escrito dos veces es un nombre que se puede separar. Cuando se
 * separa no hay error: la ruta lee `null` donde esperaba el nombre del archivo
 * y contesta «llegó sin nombre» sobre un archivo que sí lo traía.
 *
 * Son dos pantallas y no una: el listado de medios, que sube en tandas, y el
 * selector de archivo de un bloque, que sube uno sin salir de la ficha. Esa
 * segunda iba todavía por la acción `subirArchivo`, y por ella sola
 * `serverActions.bodySizeLimit` tuvo que estar en 52 MB: cada vídeo insertado
 * desde el editor se quedaba entero en la memoria del servidor. Desde que las
 * dos suben por aquí, ese número volvió a medir lo que mide una acción —un
 * documento en JSON— y el porqué de la cifra nueva está en `next.config.mjs`.
 *
 * ## Por qué una ruta y no una acción de servidor
 *
 * Un vídeo de quirófano son 20 MB para arriba, y por una acción de servidor
 * —la vía de antes era `subirArchivo`, en `acciones/contenido.ts`— no cabe por
 * dos motivos distintos:
 *
 *  - Next corta el cuerpo de una acción en `serverActions.bodySizeLimit`
 *    **antes** de invocarla, así que el `try/catch` de `accion()` no llega a
 *    ejecutarse y la pantalla se queda muda. Subir ese número no arregla lo
 *    segundo.
 *  - Una acción recibe el cuerpo ya reunido: el archivo entero está en memoria
 *    del servidor durante todo el rato que dure la subida, que por un túnel
 *    doméstico son minutos. Dos residentes subiendo a la vez son dos archivos
 *    enteros en RAM.
 *
 * Un manejador de ruta no lleva ese límite y recibe el cuerpo como flujo, de
 * modo que la ruta lo escribe a disco según llega y solo se lo entrega a
 * Payload al final. Lo que sigue sin poder evitarse es ese último paso:
 * `payload.create` exige un `Buffer`, así que el archivo pasa por memoria una
 * vez, al escribirlo en `medios/`. La diferencia está en cuánto dura: un
 * instante en vez de toda la subida.
 *
 * ## Por qué el cuerpo va en crudo y no en un `FormData`
 *
 * Un `multipart/form-data` habría obligado a la ruta a llamar a
 * `peticion.formData()`, que reúne el cuerpo entero en memoria y deshace justo
 * lo que se venía a ganar. Así que el cuerpo de la petición **son los bytes del
 * archivo y nada más** —lo que viaja por el cable es exactamente lo que pesa el
 * archivo, sin el sobre multiparte— y lo demás viaja en cabeceras. No en la
 * dirección: el nombre de un archivo clínico no tiene por qué quedar escrito en
 * el registro de accesos de un proxy, y una URL se registra entera.
 */

import { ruta } from '@/lib/rutas'
import type { Respuesta } from '@/lib/guardias'

/** El nombre original del archivo, codificado con `encodeURIComponent`. */
export const CABECERA_NOMBRE = 'x-traumahub-nombre'

/**
 * Los campos del formulario que acompañan al archivo (`alt`, `nombre`,
 * `origen`), como JSON codificado con `encodeURIComponent`.
 *
 * Codificados porque una cabecera HTTP solo admite ASCII, y «Radiografía
 * anteroposterior» no lo es. Sin el `encodeURIComponent` el navegador no manda
 * la petición: `setRequestHeader` lanza antes de salir.
 */
export const CABECERA_CAMPOS = 'x-traumahub-campos'

/**
 * La dirección de la subida, con el prefijo puesto.
 *
 * Pasa por `ruta()` como todo lo que se escribe a mano: en el servidor la
 * plataforma cuelga de un prefijo y comparte dominio con otras páginas, así que
 * un `/api/subidas/…` sin prefijo lo atendería el vecino y devolvería un 404
 * que no explica nada.
 */
export const rutaDeSubida = (slug: string): string => ruta(`/api/subidas/${slug}`)

/** Lo que la pantalla necesita saber mientras el archivo viaja. */
export type AvisoDeAvance = (fraccion: number) => void

/**
 * El formulario de un archivo que se sube desde dentro de una ficha.
 *
 * La descripción y el nombre se rellenan con el del archivo sin extensión, en
 * vez de pedirlos antes de subir: quien inserta una radiografía en mitad de un
 * bloque está escribiendo la ficha, y un cuadro que le exige «descripción» antes
 * de dejarle seguir es un cuadro que se rellena con «aaa». Se afinan después en
 * la sección de medios, donde el archivo ya se ve.
 *
 * `origen` no se manda, y no por olvido: es un desplegable obligatorio de los
 * modelos 3D y quien lo rellena es `depurarCampo` con su respaldo, el mismo que
 * aplica al guardar la ficha. Escribirlo aquí sería un tercer sitio donde
 * decidir el valor por omisión, y los otros dos ya se mueven juntos.
 *
 * Está aquí y no dentro del componente para que la forma se pueda probar sin
 * pintar nada (`tests/unit/subidaDesdeElEditor.test.ts`): la suite corre en
 * `node` y `Campos.tsx` no se deja importar.
 */
export function formularioDeArchivo(coleccion: string, archivo: File): FormData {
  const sinExtension = archivo.name.replace(/\.[^.]+$/, '')
  const formulario = new FormData()
  formulario.set('coleccion', coleccion)
  formulario.set('archivo', archivo)
  formulario.set('alt', sinExtension)
  formulario.set('nombre', sinExtension)
  return formulario
}

/**
 * Compone un subidor que va avisando del avance.
 *
 * Se compone con quien tiene que enterarse y después se llama por cada archivo,
 * en vez de recibir el aviso como segundo argumento, porque en una tanda de
 * varios el aviso cambia con cada uno: lleva dentro de qué archivo se está
 * hablando.
 *
 * **Solo funciona en el navegador**, y usa `XMLHttpRequest` a sabiendas de que
 * está anticuado: `fetch` no informa del avance de la **subida**. Su
 * `ReadableStream` de petición existe pero ningún navegador entrega eventos de
 * progreso al enviar, y sin eso un vídeo de 40 MB por un túnel doméstico deja
 * el botón en «Subiendo…» varios minutos sin una sola señal de que algo pasa.
 * El servidor no lo llama nunca: de este módulo solo importa las dos cabeceras.
 */
export function subidorQueAvisa(
  avisar: AvisoDeAvance,
): (formulario: FormData) => Promise<Respuesta<{ id: string }>> {
  return (formulario) =>
    new Promise((resolver) => {
      const archivo = formulario.get('archivo')
      const coleccion = formulario.get('coleccion')
      if (!(archivo instanceof File) || typeof coleccion !== 'string') {
        resolver({ exito: false, mensaje: 'No llegó ningún archivo que subir.' })
        return
      }

      // Todo lo que no es el archivo se convierte en cabecera. Se recorre el
      // formulario en vez de nombrar los tres campos para que un campo nuevo en
      // el esquema llegue solo: la ruta ya los filtra contra `camposDe`, así
      // que mandar de más no abre nada.
      const campos: Record<string, string> = {}
      for (const [clave, valor] of formulario.entries()) {
        if (clave === 'archivo' || clave === 'coleccion') continue
        if (typeof valor === 'string') campos[clave] = valor
      }

      const peticion = new XMLHttpRequest()
      peticion.open('POST', rutaDeSubida(coleccion))
      // El tipo declarado por el navegador. La ruta no se fía de él —deja que
      // Payload lo deduzca del contenido—, pero mandarlo ayuda a que un proxy
      // intermedio no invente otro.
      peticion.setRequestHeader('Content-Type', archivo.type || 'application/octet-stream')
      peticion.setRequestHeader(CABECERA_NOMBRE, encodeURIComponent(archivo.name))
      peticion.setRequestHeader(CABECERA_CAMPOS, encodeURIComponent(JSON.stringify(campos)))

      peticion.upload.addEventListener('progress', (evento) => {
        if (evento.lengthComputable && evento.total > 0) avisar(evento.loaded / evento.total)
      })
      // Cuando sale el último byte la subida no ha terminado: falta que el
      // servidor escriba el archivo, genere las miniaturas y cree el registro.
      // Se avisa con el 1 para que la pantalla pueda cambiar de «subiendo» a
      // «procesando» en vez de quedarse clavada en el 99 %.
      peticion.upload.addEventListener('load', () => avisar(1))

      /**
       * Lo que contestó, sea de la plataforma o de quien esté delante de ella.
       *
       * El caso que importa es el segundo. Un proxy que corta por tamaño
       * responde un 413 con su propia página de error, no con la `Respuesta` de
       * la plataforma, y sin este respaldo el panel enseñaría «no se pudo
       * subir» a secas sobre el único fallo que tiene arreglo conocido.
       */
      const leerRespuesta = (): Respuesta<{ id: string }> => {
        try {
          const cuerpo = JSON.parse(peticion.responseText) as Respuesta<{ id: string }>
          if (cuerpo && typeof cuerpo.exito === 'boolean') return cuerpo
        } catch {
          // No es una respuesta de la plataforma; se compone una abajo.
        }
        if (peticion.status === 413) {
          return {
            exito: false,
            mensaje:
              'El servidor que está delante de la plataforma rechazó el archivo por tamaño (413) ' +
              'antes de que llegara a ella. Hay que subir «client_max_body_size» en ese proxy: ' +
              'está explicado en despliegue/paginas/LEEME.md.',
          }
        }
        return {
          exito: false,
          mensaje: peticion.status
            ? `El servidor respondió ${peticion.status} sin explicar por qué.`
            : 'Se cortó la conexión durante la subida. Vuelva a intentarlo.',
        }
      }

      peticion.addEventListener('load', () => resolver(leerRespuesta()))
      peticion.addEventListener('error', () =>
        resolver({
          exito: false,
          mensaje: 'Se cortó la conexión durante la subida. Vuelva a intentarlo.',
        }),
      )
      peticion.addEventListener('abort', () =>
        resolver({ exito: false, mensaje: 'La subida se canceló.' }),
      )

      // El cuerpo es el `File` tal cual: el navegador lo lee del disco por
      // trozos y no lo carga entero en la memoria de la pestaña.
      peticion.send(archivo)
    })
}
