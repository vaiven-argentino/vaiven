// Dispara `actualizar.yml` por workflow_dispatch con un token de grano fino (solo Actions: write en este repo).
// El token se guarda como secreto del Worker: `npx wrangler secret put GITHUB_TOKEN_DISPARO`.

const REPO = "vaiven-argentino/vaiven";
const WORKFLOW = "actualizar.yml";
const RAMA = "main";

export function pedidoDeDisparo(token: string): Request {
  return new Request(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "user-agent": "vaiven-worker",
      "x-github-api-version": "2022-11-28",
      "content-type": "application/json",
    },
    body: JSON.stringify({ ref: RAMA }),
  });
}

export async function dispararActualizacion(env: Env, momento: number): Promise<void> {
  if (!env.GITHUB_TOKEN_DISPARO) {
    // Sin token no se puede disparar; el workflow semanal de respaldo abre un issue si pasan 3 días sin disparos.
    console.error("Falta el secreto GITHUB_TOKEN_DISPARO: no se disparó la actualización.");
    return;
  }
  const respuesta = await fetch(pedidoDeDisparo(env.GITHUB_TOKEN_DISPARO));
  const cuando = new Date(momento).toISOString();
  if (respuesta.status === 204 || respuesta.status === 200) {
    console.log(`Actualización disparada (${cuando}).`);
    return;
  }
  // El error queda en los registros del Worker; el respaldo semanal detecta la falta de disparos.
  console.error(`GitHub respondió ${respuesta.status} al disparar ${WORKFLOW} (${cuando}): ${(await respuesta.text()).slice(0, 500)}`);
}
