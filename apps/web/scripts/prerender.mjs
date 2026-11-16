/**
 * Post-build prerenderer: renders every static route to HTML and writes it
 * into dist/<route>/index.html, so the first paint shows real content
 * instead of an empty #root. Dynamic pages (booking steps, account) are
 * intentionally left as the SPA shell.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const ssrPath = resolve(root, "dist-ssr", "entry-server.js");
const { render } = await import(pathToFileURL(ssrPath).href);

const roomSlugs = ["garden-room", "garden-twin", "valley-suite", "valley-cottage", "signature-retreat"];
const routes = [
  "/",
  "/availability",
  "/rooms",
  ...roomSlugs.map((s) => `/rooms/${s}`),
  "/dining",
  "/story",
  "/experiences",
  "/privacy",
  "/terms",
];

const templateRaw = readFileSync(resolve(dist, "index.html"), "utf8");
if (!templateRaw.includes('<div id="root"></div>')) {
  console.error("prerender: index.html no longer contains an empty #root — aborting.");
  process.exit(1);
}

// Single source of truth for prices: the meta description's "Rates from" is
// derived from the room catalogue (lowest fromPrice), never typed by hand.
const roomsSrc = readFileSync(resolve(root, "src/data/rooms.js"), "utf8");
const minPrice = Math.min(...[...roomsSrc.matchAll(/fromPrice: (\d+)/g)].map((m) => Number(m[1])));
const ksh = `KSh ${String(minPrice).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
const template = templateRaw.replace(/Rates from KSh [\d,]+ a night\./, `Rates from ${ksh} a night.`);
if (!/Rates from KSh [\d,]+ a night\./.test(templateRaw)) {
  console.warn(`prerender: meta description did not match the expected "Rates from ..." pattern (wanted min fromPrice ${ksh}) — left unchanged`);
}

let failures = 0;
for (const url of routes) {
  try {
    const { status, html } = await render(url);
    if (!html) {
      console.error(`prerender: EMPTY render for ${url} (status ${status})`);
      failures += 1;
      continue;
    }
    const out = url === "/" ? resolve(dist, "index.html") : resolve(dist, url.slice(1), "index.html");
    mkdirSync(dirname(out), { recursive: true });
    // Strip React Router's inline hydration script (it is part of the SSR html,
    // not the template): the client boots its own BrowserRouter via main.jsx,
    // and our strict CSP (script-src 'self') must not carry an inline script.
    const page = template
      .replace('<div id="root"></div>', `<div id="root">${html}</div>`)
      .replace(/<script>window\.__staticRouterHydrationData[^<]*<\/script>/, "");
    writeFileSync(out, page);
    console.log(`prerendered ${url} (${status})`);
  } catch (err) {
    console.error(`prerender: FAILED ${url}: ${err?.message ?? err}`);
    failures += 1;
  }
}
if (failures) {
  console.error(`prerender: ${failures} route(s) failed`);
  process.exit(1);
}
console.log(`prerender: ${routes.length} routes written to dist/`);
