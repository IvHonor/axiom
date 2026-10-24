// Preserve the supplied wordmarks and use vector geometry for the small symbol. Regenerate desktop
// sizes with: npm run tauri -- icon src-tauri/icons/source/axiom.svg
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const root = new URL("../", import.meta.url);
// Trace the three straight-sided shapes so tiny icons don't inherit PNG texture or soft edges.
const shapes = `<path d="M372 0 623 168 372 339 120 168Z"/>
  <path d="M0 464 274 292V598L0 766Z"/>
  <path d="M470 292 744 464V766L470 598Z"/>`;
const mark = `<svg xmlns="http://www.w3.org/2000/svg" width="751" height="772" viewBox="-3 -3 751 772">
  <style>:root{color:#17191c}@media(prefers-color-scheme:dark){:root{color:#f2f2f4}}</style>
  <g fill="currentColor">${shapes}</g>
</svg>\n`;
// The narrow light edge keeps the transparent mark visible on a dark Windows taskbar.
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="-45 -34 834 834">
  <g fill="#17191c" stroke="#f3f4f6" stroke-width="16" stroke-linejoin="round" paint-order="stroke fill">${shapes}</g>
</svg>\n`;
await writeFile(new URL("public/branding/mark.svg", root), mark);
await writeFile(new URL("src-tauri/icons/source/axiom.svg", root), icon);
await writeFile(new URL("public/favicon.svg", root), icon);
const artwork = [
  { name: "wordmark", file: "Minimal Geometric AXIOM wordmark logo.png", bounds: [327, 248, 1502, 228] },
  { name: "lockup", file: "Minimal Geometric AXIOM Logo + wordmark logo.png", bounds: [186, 294, 878, 777] },
];

for (const { name, file, bounds } of artwork) {
  const png = await readFile(new URL(`public/branding/${file}`, root));
  assert.equal(png.subarray(1, 4).toString(), "PNG", `${file} must be a PNG`);
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
  const [x, y, w, h] = bounds;
  assert.ok(x >= 0 && y >= 0 && x + w <= width && y + h <= height, `${name}: artwork bounds fit`);
  const image = `<image width="${width}" height="${height}" href="data:image/png;base64,${png.toString("base64")}"/>`;
  // Alpha masks preserve the supplied shapes and let the interface use its own text colour.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${bounds.join(" ")}">
  <style>:root{color:#17191c}@media(prefers-color-scheme:dark){:root{color:#f2f2f4}}</style>
  <mask id="art" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}" style="mask-type:alpha">${image}</mask>
  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="currentColor" mask="url(#art)"/>
</svg>\n`;
  await writeFile(new URL(`public/branding/${name}.svg`, root), svg);
  console.log(`Prepared ${name}: ${w} × ${h}`);
}
