// Una sola dirección: www.feehund.com y feehund-web.pages.dev redirigen a https://feehund.com
// (las vistas previas <hash>.feehund-web.pages.dev no se tocan).
export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.hostname === "www.feehund.com" || url.hostname === "feehund-web.pages.dev") {
    url.hostname = "feehund.com";
    url.protocol = "https:";
    return Response.redirect(url.toString(), 301);
  }
  return context.next();
}
