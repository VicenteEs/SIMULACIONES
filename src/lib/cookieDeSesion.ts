import config from '@payload-config'

/**
 * Nombre con el que Payload firma y lee la sesión: `<cookiePrefix>-token`.
 *
 * Se le pregunta a la configuración en lugar de escribirlo aquí porque el
 * nombre es la única salida al choque que se describe junto a `OPCIONES_COOKIE`,
 * en `acciones/sesion.ts` —la cookie que las sesiones antiguas dejaron en
 * `/`—, y tenía que poder moverse solo. Ya se
 * movió: `payload.config.ts` declara `cookiePrefix: 'traumahub'`, de modo que
 * Payload firma `traumahub-token`
 * (`auth/cookies.js` arma el nombre así) y lo busca con ese mismo nombre
 * (`auth/extractJWT.js`). Si aquí hubiera quedado escrito a mano el anterior,
 * `entrar()` escribiría una cookie que nadie lee: entrar respondería «exito» y
 * la plataforma seguiría cerrada, sin un error en ninguna parte. Y por eso
 * tampoco conviene escribir ahora el nuevo a mano: el siguiente cambio de
 * prefijo volvería a abrir ese mismo fallo mudo.
 *
 * Vivía en `acciones/sesion.ts`, que es donde se escribe la cookie. Salió de
 * allí cuando la plantilla y el flujo de `/api/cambios` tuvieron que leerla
 * también (D-388), y un archivo `use server` no puede exportar nada que no
 * sea una acción.
 *
 * El `?? 'payload'` es el mismo valor por omisión que pone `buildConfig`
 * cuando nadie declara el prefijo (`config/defaults.js`), y hace falta porque
 * las pruebas sustituyen el módulo de configuración por un objeto vacío.
 */
export async function nombreDeLaCookieDeSesion(): Promise<string> {
  const { cookiePrefix } = await config
  return `${cookiePrefix ?? 'payload'}-token`
}

/**
 * El testigo de sesión que trae la petición, o `undefined`.
 *
 * Para cuando `payload.auth` ya dijo que no hay sesión y hace falta saber por
 * qué: la cookie sigue ahí aunque su sesión ya no (`motivoDelCierre`,
 * `entradasServidor.ts`). Lee la cabecera `Cookie` y no `cookies()` de Next para
 * que sirva igual en una página, en una acción y en el flujo de `/api/cambios`.
 */
export async function testigoDeLaPeticion(cabeceras: Headers): Promise<string | undefined> {
  const nombre = await nombreDeLaCookieDeSesion()
  const crudas = cabeceras.get('cookie')
  if (!crudas) return undefined
  // Gana la última, como en `parseCookies` de Payload: es la que él habría leído.
  let testigo: string | undefined
  for (const par of crudas.split(';')) {
    const igual = par.indexOf('=')
    if (igual > 0 && par.slice(0, igual).trim() === nombre) testigo = par.slice(igual + 1).trim()
  }
  if (!testigo) return undefined
  try {
    return decodeURIComponent(testigo)
  } catch {
    return testigo
  }
}
