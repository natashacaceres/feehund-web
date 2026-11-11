// Una sola dirección: www.feehund.com y feehund-web.pages.dev redirigen a https://feehund.com
// (las vistas previas <hash>.feehund-web.pages.dev no se tocan).
// /es/ ya no es una página: redirige a la portada. La vuelta del pago de Stripe (/es/?pago=ok) sigue yendo a la
// calculadora, como antes. /es/ca/ y /es/en/ van a la portada en catalán e inglés (o a su calculadora tras el pago).
const VIEJAS = {
  "/es": ["/", "/datafono/"],
  "/es/ca": ["/ca/", "/ca/datafon/"],
  "/es/en": ["/en/", "/en/card-machine/"],
};

// Páginas de Design que nunca se rellenaron («[VERIFICAR]»): llevan a la guía comprobada en español
// (las de catalán e inglés aún no existen) o, la del gimnasio genérico, a la sección de gimnasios de /baja/.
const SIN_RELLENAR = {};
for (const s of ["netflix", "spotify", "amazon-prime", "disney-plus"]) {
  SIN_RELLENAR["/ca/baixa/" + s] = "/baja/" + s + "/";
  SIN_RELLENAR["/en/cancel/" + s] = "/baja/" + s + "/";
}
for (const r of ["/baja/gimnasio", "/ca/baixa/gimnasio", "/en/cancel/gimnasio"]) SIN_RELLENAR[r] = "/baja/#bj-gimnasios";

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.hostname === "www.feehund.com" || url.hostname === "feehund-web.pages.dev") {
    url.hostname = "feehund.com";
    url.protocol = "https:";
    return Response.redirect(url.toString(), 301);
  }
  const ruta = url.pathname.replace(/\/(index\.html)?$/, "");
  if (SIN_RELLENAR[ruta]) return Response.redirect(url.origin + SIN_RELLENAR[ruta], 301);
  const vieja = VIEJAS[ruta];
  if (vieja) {
    if (url.searchParams.has("pago")) {
      // 302: es la vuelta de un pago, no una dirección que Google deba recordar
      return Response.redirect(url.origin + vieja[1] + url.search + url.hash, 302);
    }
    return Response.redirect(url.origin + vieja[0], 301);
  }
  return context.next();
}
