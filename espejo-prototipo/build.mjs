/* ==========================================================================
   ESPEJO · Build para despliegue autónomo
   --------------------------------------------------------------------------
   index.html está escrito para publicarse como Artifact, donde el contenedor
   aporta <!doctype>, <head>, charset y viewport. Un despliegue propio no tiene
   contenedor: sin ese envoltorio el móvil renderiza a 980 px y los acentos
   castellanos salen rotos.

   Este script envuelve la misma fuente en un documento completo y deja el
   resultado en dist/. Una sola fuente, dos destinos.

       node build.mjs

   ========================================================================== */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = dirname(fileURLToPath(import.meta.url));
const dist = join(raiz, 'dist');

const GUIONES = ['i18n.js', 'engine.js', 'perfil.js', 'catalogo.js', 'calibracion.js', 'app.js'];

/* Favicon en línea: un SVG con emoji evita una petición extra y que el
   despliegue dependa de un fichero binario. */
const FAVICON =
  'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    '<rect width="64" height="64" fill="#04080C"/>' +
    '<text y="48" x="32" font-size="42" text-anchor="middle">🪞</text></svg>'
  ).replace(/'/g, '%27');

const cuerpo = readFileSync(join(raiz, 'index.html'), 'utf8');

/* El <title> vive en la fuente para que el Artifact lo tome de ahí; aquí se
   extrae para colocarlo en el <head> real y no duplicarlo en el <body>. */
const mTitulo = cuerpo.match(/^<title>([^<]*)<\/title>\s*/);
const titulo = mTitulo ? mTitulo[1] : 'Espejo Cutáneo';
const resto = mTitulo ? cuerpo.slice(mTitulo[0].length) : cuerpo;

const documento = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${titulo}</title>
<meta name="description" content="Análisis cutáneo óptico · Lococo × Oki Doki Labs, Madrid 2026. Todo el procesamiento ocurre en el dispositivo.">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#04080C">
<!-- Añadido a la pantalla de inicio del iPad, arranca sin barra del navegador:
     es el modo en el que va a funcionar el puesto. -->
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Espejo">
<link rel="icon" href="${FAVICON}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
</head>
<body>
${resto.trim()}
</body>
</html>
`;

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
writeFileSync(join(dist, 'index.html'), documento, 'utf8');
for (const g of GUIONES) copyFileSync(join(raiz, g), join(dist, g));

/* La cámara sólo se pide a sí misma y desde el propio origen. Sin esta línea
   el navegador aplica su política por defecto; con ella queda explícito y no
   depende de cambios futuros en ese valor por defecto. */
writeFileSync(join(dist, '_headers'), [
  '/*',
  '  Permissions-Policy: camera=(self), microphone=(), geolocation=()',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: no-referrer',
  ''
].join('\n'), 'utf8');

writeFileSync(join(dist, 'robots.txt'), 'User-agent: *\nDisallow: /\n', 'utf8');

const kb = (n) => (n / 1024).toFixed(1) + ' kB';
console.log('dist/ generado');
console.log('  index.html   ' + kb(Buffer.byteLength(documento)));
for (const g of GUIONES) {
  console.log('  ' + g.padEnd(13) + kb(readFileSync(join(raiz, g)).length));
}
