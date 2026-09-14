import { test, type Page } from '@playwright/test'

/**
 * La cuenta con la que entran al panel las pruebas de extremo a extremo que lo
 * necesitan, y qué hacer cuando no la hay.
 *
 * Se lee de `E2E_CORREO` y `E2E_CLAVE` al correr, y la clave no se escribe en
 * ningún registro ni en ningún nombre de prueba. Tiene que poder editar
 * patologías, y la base tiene que tener al menos un segmento anatómico.
 *
 * Sin cuenta, las pruebas que la piden se omiten, porque `npm run test:e2e` se
 * lanza también en máquinas sin base con datos. Pero un omitido sale en verde,
 * y quien las lanzó precisamente para comprobar el panel creería haberlo
 * comprobado: con `EXIGIR_E2E_PANEL=1` fallan en vez de omitirse. Es la misma
 * trampa, y el mismo remedio, que `EXIGIR_INTEGRACION` en las de integración.
 */

const CORREO = process.env.E2E_CORREO ?? ''
const CLAVE = process.env.E2E_CLAVE ?? ''
const HAY_CUENTA = CORREO !== '' && CLAVE !== ''
const EXIGIDA = process.env.EXIGIR_E2E_PANEL === '1'

/** Dentro de un `test.describe`: omite el grupo sin cuenta, salvo que se exija. */
export function pedirCuentaDePrueba() {
  test.skip(
    !HAY_CUENTA && !EXIGIDA,
    'Sin E2E_CORREO y E2E_CLAVE. Con EXIGIR_E2E_PANEL=1 esto falla en vez de omitirse.',
  )
}

/** Entra al panel con la cuenta de prueba, o falla diciendo qué falta. */
export async function entrarConLaCuentaDePrueba(page: Page) {
  if (!HAY_CUENTA) {
    throw new Error('EXIGIR_E2E_PANEL=1 pide esta prueba, pero faltan E2E_CORREO y E2E_CLAVE.')
  }
  await page.goto('/entrar')
  await page.getByLabel('Correo electrónico').fill(CORREO)
  await page.getByLabel('Contraseña').fill(CLAVE)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL((url) => !url.pathname.endsWith('/entrar'))
}
