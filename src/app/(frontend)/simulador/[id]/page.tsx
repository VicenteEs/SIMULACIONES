import { notFound } from 'next/navigation'
import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { SinAcceso, Miga } from '@/components/Estados'
import { ConsolaQuirurgica } from '@/components/simulador/ConsolaQuirurgica'
import { FormularioComentario } from '@/components/FormularioComentario'
import { casoParaLaConsola } from '@/lib/casoQuirurgico'
import { recorridoGuardado } from '@/lib/progresoDelSimulador'
import { Rico } from '@/components/Rico'
import { RastreadorActividad } from '@/components/RastreadorActividad'

export const dynamic = 'force-dynamic'

export default async function CirugiaSimulada({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { activo, usuarioEfectivo } = await obtenerSesion()
  if (!activo) return <SinAcceso titulo="Simulador quirúrgico" />

  const payload = await getPayload({ config })
  const cirugia = await payload
    .findByID({
      collection: 'cirugias',
      id,
      overrideAccess: false,
      user: usuarioEfectivo as never,
      // Profundidad 2: el paso trae su instrumento y su fase ya poblados, y el
      // caso trae su modelo con la dirección del archivo. Con profundidad 1 el
      // instrumento llegaría como número y la bandeja saldría vacía.
      depth: 2,
    })
    .catch(() => null)
  if (!cirugia) notFound()

  const caso = casoParaLaConsola(cirugia as unknown as Record<string, unknown>)

  const usuarioId = (usuarioEfectivo as { id?: string | number } | null)?.id

  // La casilla de «leída» tiene que nacer sabiendo si ya lo está, y
  // `RastreadorActividad` es de cliente: no puede consultarlo él. Sin esto la
  // casilla aparece en blanco en cada carga y el residente vuelve a marcar lo
  // que ya había marcado.
  //
  // De la misma fila sale ahora el recorrido guardado del simulador —puntaje y
  // complicaciones—, y por el mismo motivo: `ConsolaQuirurgica` corre en el
  // navegador y no puede preguntarlo. Es una consulta y no dos: los tres campos
  // viven en esta misma fila (`src/collections/Actividad.ts`), y `depth: 0` no
  // se lleva por delante la lista de complicaciones, que es un `array` del
  // documento y no una relación.
  //
  // El seguimiento de lectura solo estaba montado en la biblioteca, así que la
  // portada contaba las fichas de los cinco módulos como «por leer» y ninguna
  // cirugía podía salir nunca de esa cuenta: `totalFichas - leidas` no bajaba.
  //
  // Es la segunda copia literal de esta consulta —la otra está en
  // `biblioteca/[id]/page.tsx`— y su sitio es `src/lib`, que no entra en este
  // lote. Queda anotado ahí: la tercera copia llega con `tecnica-ao`.
  //
  // El `.catch` está porque la actividad es una comodidad y el caso quirúrgico
  // es el contenido: una avería en esa tabla no puede llevarse por delante la
  // página entera, que es lo que pasaría sin él.
  const registroDeLectura = usuarioId
    ? await payload
        .find({
          collection: 'actividad',
          where: {
            and: [
              { usuario: { equals: usuarioId } },
              { coleccion: { equals: 'cirugias' } },
              { documentoId: { equals: id } },
            ],
          },
          user: usuarioEfectivo as never,
          limit: 1,
          depth: 0,
        })
        .then((r) => r.docs[0] ?? null)
        .catch(() => null)
    : null

  return (
    <main>
      <Miga href="/simulador" texto="Simulador" />
      <h1>{caso.nombre}</h1>
      <Rico valor={cirugia.resumen} className="entrada" />

      {/*
        Arriba y no al final: el caso se marca a mano, y quien termina la
        consola se queda dentro de ella —no hay nada que empuje a seguir
        bajando—. En la biblioteca la casilla vive en la cabecera por lo mismo.

        Terminar el caso sigue sin marcarla solo. Ya no es que no se pueda —la
        consola escribe en esta misma fila desde que guarda el recorrido—, es
        que son dos cosas distintas: «leída» la marca el residente cuando da la
        ficha por estudiada, en los cinco módulos, y terminar un recorrido con
        tres complicaciones no es haberla estudiado. Darlo por hecho le quitaría
        el caso de «Continúa leyendo» justo cuando más le conviene volver.
      */}
      <RastreadorActividad
        coleccion="cirugias"
        documentoId={id}
        completadoInicial={registroDeLectura?.completado === true}
      />

      {/* `documentoId` es lo que le da a la consola dónde escribir, y
          `recorridoGuardado` lo que le devuelve lo de la vez anterior. Sin los
          dos, el puntaje y las complicaciones vuelven a ser estado local que
          muere con la pestaña, que es de donde se viene. */}
      <ConsolaQuirurgica
        caso={caso}
        documentoId={id}
        recorridoGuardado={recorridoGuardado(registroDeLectura)}
      />

      <FormularioComentario
        coleccion="cirugias"
        documentoId={id}
        label="¿Sugerencia o corrección sobre este caso? Comentar"
      />
    </main>
  )
}
