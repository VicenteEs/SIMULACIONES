import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Escribir en la columna el objetivo que el motor ya deduce, para que la regla
 * nueva no deje encerrados los casos viejos.
 *
 * De dónde sale la población. `20260910_125801_caso_quirurgico.ts:46` añadió
 * `objetivo` con `DEFAULT 'instrumento'`, y en PostgreSQL un `ADD COLUMN ...
 * DEFAULT` rellena con ese valor **todas** las filas que ya estaban.
 * `fuerza_minima` y `fuerza_maxima` vienen de la migración inicial
 * (`20260906_150718_inicial.ts:857-858`), de cuando cada paso exigía un rango
 * de fuerza aunque el gesto fuera trazar una incisión. Es decir: todo paso
 * creado entre el 6 y el 10 de septiembre quedó con `objetivo='instrumento'`
 * **más** su rango de fuerza, que es justo la combinación que desde hoy
 * rechaza `exigeElRangoDeSuObjetivo` (`src/collections/Cirugias.ts`).
 *
 * Qué se rompía sin esto. `validate` no corre solo sobre lo que se escribe:
 * corre en cada guardado sobre el documento entero, también sobre los pasos que
 * ya estaban guardados. El traumatólogo abría un caso de esos, corregía una
 * coma y ya no podía publicarlo: le salía «borre esos números, o cambie el
 * objetivo al que de verdad se mide» sobre números que él no tecleó nunca.
 * Mientras tanto el motor seguía evaluando esos pasos como fuerza, así que la
 * columna y la evaluación decían cosas distintas.
 *
 * Por qué no cambia ni una evaluación. El `CASE` de abajo es la transcripción
 * literal de `objetivoDelPaso` (`src/lib/simulador.ts`), que es la función por
 * la que ya pasan hoy tanto la consola —`casoParaLaConsola` resuelve el
 * objetivo antes de mandar el caso al navegador— como la puntuación. Lo que la
 * migración hace es dejar escrito en la columna lo que la aplicación venía
 * deduciendo en memoria; al residente no le cambia un solo paso.
 *
 * El orden de las ramas importa y es el suyo: primero la fuerza, luego el
 * trazo. La tercera —`reduccion`— solo la alcanzan las filas con `objetivo`
 * nulo, porque una fila con `'instrumento'` escrito no entra en el `WHERE` si
 * no trae rango de fuerza o de trazo, y con él se va por una de las dos
 * primeras. Eso replica el `!paso.objetivo &&` de la función, que existe
 * porque las tres tolerancias tienen `DEFAULT 5` y las lleva toda fila: deducir
 * de ellas convertiría cada paso de instrumento en uno de reducción imposible.
 *
 * Se toca también `_cirugias_v_version_pasos`: ahí viven los borradores y el
 * historial, Payload salta las validaciones al guardar un borrador, y publicar
 * uno viejo es exactamente el gesto que se quedaba bloqueado.
 *
 * No hay cambio de esquema, y por eso la instantánea que acompaña a este
 * archivo es copia de la de `20260913_033442_actividad_una_fila_por_ficha`:
 * `migrate:create` no encuentra nada que diferenciar y las pruebas de
 * `tests/unit/migraciones.test.ts` leen la más reciente.
 *
 * En la base de desarrollo esto no toca nada —está resembrada: 7 filas en
 * `cirugias_pasos` y 21 en la de versiones, ninguna con esa combinación—. La
 * población en riesgo solo puede estar en el servidor, y de ahí no ha mirado
 * nadie; por eso se despliega la migración en vez de fiarse de una consulta
 * hecha contra la base equivocada. Si allí también son cero, el `UPDATE` no
 * escribe una sola fila y el registro lo dirá.
 */

/**
 * El `CASE` de `objetivoDelPaso`, para las dos tablas de pasos.
 *
 * Una sola copia porque las dos tablas tienen las mismas columnas y la
 * regla que se transcribe es una: con dos copias, afinar la deducción en la
 * tabla publicada y olvidarla en la de versiones deja el borrador de un caso
 * diciendo una cosa y el caso publicado otra. El nombre de la tabla y el del
 * enumerado son lo único que cambia, y van por `sql.identifier` para que los
 * entrecomille el propio constructor.
 */
const reescribirObjetivo = (tabla: string, enumerado: string) => {
  const tipo = sql.identifier(enumerado)
  return sql`
  UPDATE ${sql.identifier(tabla)}
     SET "objetivo" = CASE
       WHEN "fuerza_minima" IS NOT NULL OR "fuerza_maxima" IS NOT NULL
         THEN 'fuerza'::${tipo}
       WHEN "trazo_minimo" IS NOT NULL OR "trazo_maximo" IS NOT NULL
         THEN 'trazo'::${tipo}
       WHEN "tolerancia_desplazamiento" IS NOT NULL
         OR "tolerancia_diastasis" IS NOT NULL
         OR "tolerancia_angulacion" IS NOT NULL
         THEN 'reduccion'::${tipo}
       ELSE 'instrumento'::${tipo}
     END
   WHERE "objetivo" IS NULL
      OR (
        "objetivo" = 'instrumento'
        AND (
          "fuerza_minima" IS NOT NULL OR "fuerza_maxima" IS NOT NULL
          OR "trazo_minimo" IS NOT NULL OR "trazo_maximo" IS NOT NULL
        )
      )
  RETURNING "id";`
}

export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  // El `::` de cada rama no es adorno: los literales de un `CASE` sin contexto
  // se resuelven como `text`, y PostgreSQL no convierte `text` a un enumerado
  // en una asignación. Sin la conversión explícita la migración muere con
  // «column "objetivo" is of type enum_… but expression is of type text» y se
  // lleva el despliegue por delante.
  const { rows: pasos } = await db.execute(
    reescribirObjetivo('cirugias_pasos', 'enum_cirugias_pasos_objetivo'),
  )
  const { rows: versiones } = await db.execute(
    reescribirObjetivo('_cirugias_v_version_pasos', 'enum__cirugias_v_version_pasos_objetivo'),
  )

  payload.logger.info(
    `cirugias: ${pasos.length} paso(s) publicado(s) y ${versiones.length} de borrador o historial pasaron a declarar el objetivo que el motor ya les aplicaba.`,
  )
}

export async function down({ payload }: MigrateDownArgs): Promise<void> {
  // No se deshace, y no por pereza: la columna no guarda quién escribió su
  // valor. Devolver estas filas a `'instrumento'` arrastraría también los pasos
  // que un médico marcó como de fuerza a propósito, porque a estas alturas son
  // indistinguibles. Y deshacerlo no haría falta: el valor que se escribió es
  // el que `objetivoDelPaso` seguiría deduciendo si la columna volviera atrás.
  payload.logger.info(
    'cirugias: el objetivo de los pasos antiguos no se revierte; ver la cabecera de la migración.',
  )
}
