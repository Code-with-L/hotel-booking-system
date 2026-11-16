/** SSR entry for build-time prerendering (see scripts/prerender.mjs). */
import { renderToString } from "react-dom/server";
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from "react-router-dom";
import { routes } from "@/app/router.jsx";
import { BookingProvider } from "@/features/reservations/BookingContext.jsx";
import { AuthProvider } from "@/features/guest-account/AuthContext.jsx";

export async function render(url) {
  const handler = createStaticHandler(routes);
  const request = new Request(`http://local${url}`);
  const context = await handler.query(request);
  if (context instanceof Response) {
    return { status: context.status, location: context.headers.get("Location"), html: "" };
  }
  const router = createStaticRouter(handler.dataRoutes, context);
  const html = renderToString(
    <AuthProvider>
      <BookingProvider>
        <StaticRouterProvider router={router} context={context} />
      </BookingProvider>
    </AuthProvider>,
  );
  return { status: context.statusCode ?? 200, html };
}

