import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * El encuadre de un bloque «Modelo 3D» nace vacío, y vacío hereda del catálogo.
 *
 * ## Por qué existe esta migración, y por qué no basta el cambio de código
 *
 * El traumatólogo pidió poder «dejarle el modelo de la pierna en una pose» para
 * enfocar el punto de vista del alumno, así que un modelo del catálogo guarda
 * desde qué ángulo se abre. La regla de precedencia es: manda el encuadre del
 * bloque; si el bloque no dice nada, el del modelo; si ninguno dice nada, el
 * visor encuadra solo (`encuadreVigente`, `src/lib/aritmeticaDelEncuadre.ts`).
 *
 * Y «no decir nada» no se podía. El bloque declaraba `defaultValue` en sus cinco
 * números —escala 1, giros 0, distancia 3—, y `tieneEncuadre` decide por
 * `distanciaCamara`: un 3 contesta «sí, tengo encuadre». O sea que **todo**
 * bloque ya insertado le ganaba al catálogo sin que nadie hubiera capturado
 * nada, y la pose no llegaba jamás a una ficha escrita. La regla quedaba
 * escrita, probada y muerta, que es exactamente el fallo que esta plataforma
 * lleva pagando toda la jornada.
 *
 * Quitar el `defaultValue` del bloque arregla lo que nazca de ahora en adelante
 * y **no toca una sola fila de las que ya existen**. Por eso esta migración hace
 * dos cosas: suelta el `DEFAULT 3` que PostgreSQL tiene escrito en la columna
 * desde la migración inicial —lo de arriba, que generó `migrate:create`— y
 * vacía las filas que nacieron con él.
 *
 * ## Por qué es seguro vaciar por valor exacto
 *
 * Se vacían solo las filas cuyos cinco números son exactamente (1, 0, 0, 0, 3),
 * que es el tuple por omisión. Una pose capturada de verdad no puede dar ese
 * valor: «Ajustar al modelo» (`encuadreQueLoAbarca`) devuelve siempre 3,01 de
 * distancia —sale de (1/sen 22,5°)·1,15 = 3,0051, y el radio del modelo se
 * absorbe en la escala—, nunca 3,00 exacto. Lo ata
 * `tests/unit/poseEnLasTresPantallas.test.ts`, que falla si esa función llegara
 * a devolver 3 alguna vez.
 *
 * Aun así destruye datos: si alguien tecleó a mano esos cinco números en las
 * casillas queriendo decir «así exactamente», esta migración lo entiende como
 * «no dije nada» y el bloque pasará a heredar la pose del catálogo. Es un
 * cambio visible y reversible a mano —se vuelve a capturar—, y el `down` no lo
 * deshace: devuelve el `DEFAULT` a la columna, no los valores a las filas.
 *
 * Se registra cuántas se vaciaron, porque en el servidor esto ocurre sin que
 * nadie mire y el registro del despliegue es el único sitio donde queda
 * constancia.
 */

/** Las diez tablas del bloque: cinco colecciones, cada una con su gemela de versiones. */
const TABLAS_DEL_BLOQUE = [
  'patologias_blocks_modelo_3d',
  '_patologias_v_blocks_modelo_3d',
  'maniobras_blocks_modelo_3d',
  '_maniobras_v_blocks_modelo_3d',
  'casos_ao_blocks_modelo_3d',
  '_casos_ao_v_blocks_modelo_3d',
  'cirugias_blocks_modelo_3d',
  '_cirugias_v_blocks_modelo_3d',
  'estudios_ia_blocks_modelo_3d',
  '_estudios_ia_v_blocks_modelo_3d',
]

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "patologias_blocks_modelo_3d" ALTER COLUMN "encuadre_escala" DROP DEFAULT;
  ALTER TABLE "patologias_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_x" DROP DEFAULT;
  ALTER TABLE "patologias_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_y" DROP DEFAULT;
  ALTER TABLE "patologias_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_z" DROP DEFAULT;
  ALTER TABLE "patologias_blocks_modelo_3d" ALTER COLUMN "encuadre_distancia_camara" DROP DEFAULT;
  ALTER TABLE "_patologias_v_blocks_modelo_3d" ALTER COLUMN "encuadre_escala" DROP DEFAULT;
  ALTER TABLE "_patologias_v_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_x" DROP DEFAULT;
  ALTER TABLE "_patologias_v_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_y" DROP DEFAULT;
  ALTER TABLE "_patologias_v_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_z" DROP DEFAULT;
  ALTER TABLE "_patologias_v_blocks_modelo_3d" ALTER COLUMN "encuadre_distancia_camara" DROP DEFAULT;
  ALTER TABLE "maniobras_blocks_modelo_3d" ALTER COLUMN "encuadre_escala" DROP DEFAULT;
  ALTER TABLE "maniobras_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_x" DROP DEFAULT;
  ALTER TABLE "maniobras_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_y" DROP DEFAULT;
  ALTER TABLE "maniobras_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_z" DROP DEFAULT;
  ALTER TABLE "maniobras_blocks_modelo_3d" ALTER COLUMN "encuadre_distancia_camara" DROP DEFAULT;
  ALTER TABLE "_maniobras_v_blocks_modelo_3d" ALTER COLUMN "encuadre_escala" DROP DEFAULT;
  ALTER TABLE "_maniobras_v_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_x" DROP DEFAULT;
  ALTER TABLE "_maniobras_v_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_y" DROP DEFAULT;
  ALTER TABLE "_maniobras_v_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_z" DROP DEFAULT;
  ALTER TABLE "_maniobras_v_blocks_modelo_3d" ALTER COLUMN "encuadre_distancia_camara" DROP DEFAULT;
  ALTER TABLE "casos_ao_blocks_modelo_3d" ALTER COLUMN "encuadre_escala" DROP DEFAULT;
  ALTER TABLE "casos_ao_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_x" DROP DEFAULT;
  ALTER TABLE "casos_ao_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_y" DROP DEFAULT;
  ALTER TABLE "casos_ao_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_z" DROP DEFAULT;
  ALTER TABLE "casos_ao_blocks_modelo_3d" ALTER COLUMN "encuadre_distancia_camara" DROP DEFAULT;
  ALTER TABLE "_casos_ao_v_blocks_modelo_3d" ALTER COLUMN "encuadre_escala" DROP DEFAULT;
  ALTER TABLE "_casos_ao_v_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_x" DROP DEFAULT;
  ALTER TABLE "_casos_ao_v_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_y" DROP DEFAULT;
  ALTER TABLE "_casos_ao_v_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_z" DROP DEFAULT;
  ALTER TABLE "_casos_ao_v_blocks_modelo_3d" ALTER COLUMN "encuadre_distancia_camara" DROP DEFAULT;
  ALTER TABLE "cirugias_blocks_modelo_3d" ALTER COLUMN "encuadre_escala" DROP DEFAULT;
  ALTER TABLE "cirugias_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_x" DROP DEFAULT;
  ALTER TABLE "cirugias_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_y" DROP DEFAULT;
  ALTER TABLE "cirugias_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_z" DROP DEFAULT;
  ALTER TABLE "cirugias_blocks_modelo_3d" ALTER COLUMN "encuadre_distancia_camara" DROP DEFAULT;
  ALTER TABLE "_cirugias_v_blocks_modelo_3d" ALTER COLUMN "encuadre_escala" DROP DEFAULT;
  ALTER TABLE "_cirugias_v_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_x" DROP DEFAULT;
  ALTER TABLE "_cirugias_v_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_y" DROP DEFAULT;
  ALTER TABLE "_cirugias_v_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_z" DROP DEFAULT;
  ALTER TABLE "_cirugias_v_blocks_modelo_3d" ALTER COLUMN "encuadre_distancia_camara" DROP DEFAULT;
  ALTER TABLE "estudios_ia_blocks_modelo_3d" ALTER COLUMN "encuadre_escala" DROP DEFAULT;
  ALTER TABLE "estudios_ia_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_x" DROP DEFAULT;
  ALTER TABLE "estudios_ia_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_y" DROP DEFAULT;
  ALTER TABLE "estudios_ia_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_z" DROP DEFAULT;
  ALTER TABLE "estudios_ia_blocks_modelo_3d" ALTER COLUMN "encuadre_distancia_camara" DROP DEFAULT;
  ALTER TABLE "_estudios_ia_v_blocks_modelo_3d" ALTER COLUMN "encuadre_escala" DROP DEFAULT;
  ALTER TABLE "_estudios_ia_v_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_x" DROP DEFAULT;
  ALTER TABLE "_estudios_ia_v_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_y" DROP DEFAULT;
  ALTER TABLE "_estudios_ia_v_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_z" DROP DEFAULT;
  ALTER TABLE "_estudios_ia_v_blocks_modelo_3d" ALTER COLUMN "encuadre_distancia_camara" DROP DEFAULT;`)

  // Las versiones de un documento cuentan: publicar un borrador viejo copiaría
  // su encuadre de mentira encima del publicado, y el defecto volvería por la
  // puerta de atrás.
  let vaciadas = 0
  for (const tabla of TABLAS_DEL_BLOQUE) {
    const { rows } = await db.execute(sql`
      UPDATE ${sql.identifier(tabla)}
         SET "encuadre_escala" = NULL,
             "encuadre_giro_x" = NULL,
             "encuadre_giro_y" = NULL,
             "encuadre_giro_z" = NULL,
             "encuadre_distancia_camara" = NULL
       WHERE "encuadre_escala" = 1
         AND "encuadre_giro_x" = 0
         AND "encuadre_giro_y" = 0
         AND "encuadre_giro_z" = 0
         AND "encuadre_distancia_camara" = 3
      RETURNING "id";`)
    vaciadas += rows.length
  }

  payload.logger.info(
    `bloques «Modelo 3D»: ${vaciadas} encuadre(s) por omisión vaciado(s); esos bloques pasan a ` +
      'heredar la pose que el modelo tenga guardada en el catálogo.',
  )
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "patologias_blocks_modelo_3d" ALTER COLUMN "encuadre_escala" SET DEFAULT 1;
  ALTER TABLE "patologias_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_x" SET DEFAULT 0;
  ALTER TABLE "patologias_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_y" SET DEFAULT 0;
  ALTER TABLE "patologias_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_z" SET DEFAULT 0;
  ALTER TABLE "patologias_blocks_modelo_3d" ALTER COLUMN "encuadre_distancia_camara" SET DEFAULT 3;
  ALTER TABLE "_patologias_v_blocks_modelo_3d" ALTER COLUMN "encuadre_escala" SET DEFAULT 1;
  ALTER TABLE "_patologias_v_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_x" SET DEFAULT 0;
  ALTER TABLE "_patologias_v_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_y" SET DEFAULT 0;
  ALTER TABLE "_patologias_v_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_z" SET DEFAULT 0;
  ALTER TABLE "_patologias_v_blocks_modelo_3d" ALTER COLUMN "encuadre_distancia_camara" SET DEFAULT 3;
  ALTER TABLE "maniobras_blocks_modelo_3d" ALTER COLUMN "encuadre_escala" SET DEFAULT 1;
  ALTER TABLE "maniobras_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_x" SET DEFAULT 0;
  ALTER TABLE "maniobras_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_y" SET DEFAULT 0;
  ALTER TABLE "maniobras_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_z" SET DEFAULT 0;
  ALTER TABLE "maniobras_blocks_modelo_3d" ALTER COLUMN "encuadre_distancia_camara" SET DEFAULT 3;
  ALTER TABLE "_maniobras_v_blocks_modelo_3d" ALTER COLUMN "encuadre_escala" SET DEFAULT 1;
  ALTER TABLE "_maniobras_v_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_x" SET DEFAULT 0;
  ALTER TABLE "_maniobras_v_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_y" SET DEFAULT 0;
  ALTER TABLE "_maniobras_v_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_z" SET DEFAULT 0;
  ALTER TABLE "_maniobras_v_blocks_modelo_3d" ALTER COLUMN "encuadre_distancia_camara" SET DEFAULT 3;
  ALTER TABLE "casos_ao_blocks_modelo_3d" ALTER COLUMN "encuadre_escala" SET DEFAULT 1;
  ALTER TABLE "casos_ao_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_x" SET DEFAULT 0;
  ALTER TABLE "casos_ao_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_y" SET DEFAULT 0;
  ALTER TABLE "casos_ao_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_z" SET DEFAULT 0;
  ALTER TABLE "casos_ao_blocks_modelo_3d" ALTER COLUMN "encuadre_distancia_camara" SET DEFAULT 3;
  ALTER TABLE "_casos_ao_v_blocks_modelo_3d" ALTER COLUMN "encuadre_escala" SET DEFAULT 1;
  ALTER TABLE "_casos_ao_v_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_x" SET DEFAULT 0;
  ALTER TABLE "_casos_ao_v_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_y" SET DEFAULT 0;
  ALTER TABLE "_casos_ao_v_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_z" SET DEFAULT 0;
  ALTER TABLE "_casos_ao_v_blocks_modelo_3d" ALTER COLUMN "encuadre_distancia_camara" SET DEFAULT 3;
  ALTER TABLE "cirugias_blocks_modelo_3d" ALTER COLUMN "encuadre_escala" SET DEFAULT 1;
  ALTER TABLE "cirugias_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_x" SET DEFAULT 0;
  ALTER TABLE "cirugias_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_y" SET DEFAULT 0;
  ALTER TABLE "cirugias_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_z" SET DEFAULT 0;
  ALTER TABLE "cirugias_blocks_modelo_3d" ALTER COLUMN "encuadre_distancia_camara" SET DEFAULT 3;
  ALTER TABLE "_cirugias_v_blocks_modelo_3d" ALTER COLUMN "encuadre_escala" SET DEFAULT 1;
  ALTER TABLE "_cirugias_v_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_x" SET DEFAULT 0;
  ALTER TABLE "_cirugias_v_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_y" SET DEFAULT 0;
  ALTER TABLE "_cirugias_v_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_z" SET DEFAULT 0;
  ALTER TABLE "_cirugias_v_blocks_modelo_3d" ALTER COLUMN "encuadre_distancia_camara" SET DEFAULT 3;
  ALTER TABLE "estudios_ia_blocks_modelo_3d" ALTER COLUMN "encuadre_escala" SET DEFAULT 1;
  ALTER TABLE "estudios_ia_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_x" SET DEFAULT 0;
  ALTER TABLE "estudios_ia_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_y" SET DEFAULT 0;
  ALTER TABLE "estudios_ia_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_z" SET DEFAULT 0;
  ALTER TABLE "estudios_ia_blocks_modelo_3d" ALTER COLUMN "encuadre_distancia_camara" SET DEFAULT 3;
  ALTER TABLE "_estudios_ia_v_blocks_modelo_3d" ALTER COLUMN "encuadre_escala" SET DEFAULT 1;
  ALTER TABLE "_estudios_ia_v_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_x" SET DEFAULT 0;
  ALTER TABLE "_estudios_ia_v_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_y" SET DEFAULT 0;
  ALTER TABLE "_estudios_ia_v_blocks_modelo_3d" ALTER COLUMN "encuadre_giro_z" SET DEFAULT 0;
  ALTER TABLE "_estudios_ia_v_blocks_modelo_3d" ALTER COLUMN "encuadre_distancia_camara" SET DEFAULT 3;`)
}
