import { expect, test, type Page } from '@playwright/test'

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
  await aceptarElAvisoSiLoPide(page)
}

/**
 * Con el aviso de privacidad completo (D-297), una cuenta que no aceptó la
 * versión vigente entra a la pantalla del aviso y no a la página que pidió
 * (D-292). La cuenta de prueba lo acepta aquí, una vez por versión: sin esto,
 * cada versión nueva dejaría a todas estas pruebas mirando el aviso en vez de
 * lo que comprueban, y fallando por algo que no es suyo.
 *
 * Se recarga antes de mirar porque entrar navega en el cliente (`router.push`):
 * al cambiar la dirección, la página nueva puede no haber llegado, y no ver el
 * botón diría que no hace falta aceptar cuando sí. Recargada, la pantalla del
 * aviso viene en el HTML, porque la pinta la plantilla en el servidor.
 */
async function aceptarElAvisoSiLoPide(page: Page) {
  await page.reload()
  const aceptar = page.getByRole('button', { name: 'Acepto el aviso' })
  if (!(await aceptar.isVisible())) return
  await aceptar.click()
  // Mientras la acción corre, el botón dice «Anotando…». Esperar solo a que no
  // quedara un «Acepto el aviso» daba la aceptación por hecha antes de tiempo,
  // y la página siguiente llegaba todavía con el aviso. Se espera a que no
  // quede ninguno de los dos, que es cuando la plantilla ya pinta la página; si
  // la acción falla, vuelve el «Acepto» y esto falla diciéndolo.
  await expect(page.getByRole('button', { name: /^(Acepto el aviso|Anotando…)$/ })).toHaveCount(0, {
    timeout: 60_000,
  })
}
