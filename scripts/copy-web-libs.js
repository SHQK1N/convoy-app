/**
 * Copies MapLibre GL JS's ready-made browser build into public/maplibre/ (served at /maplibre/).
 * Runs automatically after `npm install` (package.json → postinstall).
 *
 * Why: bundling maplibre-gl through Metro breaks its background map worker ("Worker failed to
 * load"). The official prebuilt maplibre-gl.js (v5: one classic file with the worker inside) is
 * loaded by a <script> tag in public/index.html instead, and puts `window.maplibregl` in place for
 * the web map (src/components/map/TripMap.web.tsx).
 * Stay on maplibre-gl 5.x: v6 ships separate module-worker files whose worker didn't start here.
 */
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', 'maplibre-gl', 'dist');
const dest = path.join(__dirname, '..', 'public', 'maplibre');
if (!fs.existsSync(src)) {
  console.log('[copy-web-libs] maplibre-gl not installed, skipping');
  process.exit(0);
}
fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
for (const f of ['maplibre-gl.js', 'maplibre-gl.css']) fs.copyFileSync(path.join(src, f), path.join(dest, f));
console.log('[copy-web-libs] copied maplibre-gl', require(path.join(src, '..', 'package.json')).version, 'to public/maplibre');
