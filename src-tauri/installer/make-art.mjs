// Draws the installers' artwork from Axiom's logo: the Windows setup's
// sidebar and header, the .msi's dialog and banner, and the macOS disk
// image's background. The results are committed; run this again only after
// changing the logo or the design:
//
//   node src-tauri/installer/make-art.mjs
//
// It borrows `sharp` from the website's dependencies (run `npm install` in site/ first).

import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const sharp = createRequire(path.join(root, "site/package.json"))("sharp");

const DARK = "#17191c";
const LIGHT = "#f2f2f4";
const MARK_PATHS = `<path d="M372 0 623 168 372 339 120 168Z"/><path d="M0 464 274 292V598L0 766Z"/><path d="M470 292 744 464V766L470 598Z"/>`;

/** The mark, `height` pixels tall, as a PNG. */
const mark = (height, color) =>
  sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 744 766" height="${height}" width="${Math.round((height * 744) / 766)}"><g fill="${color}">${MARK_PATHS}</g></svg>`))
    .png()
    .toBuffer();

/** The AXIOM wordmark, `width` pixels wide, as a PNG (from the black-on-white artwork). */
async function wordmark(width, color) {
  const { data, info } = await sharp(path.join(root, "public/branding/Minimal Geometric AXIOM wordmark logo.png"))
    .flatten({ background: "#ffffff" })
    .greyscale()
    .negate()
    .trim({ threshold: 40 })
    .resize({ width })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return sharp({ create: { width: info.width, height: info.height, channels: 3, background: color } })
    .joinChannel(data, { raw: { width: info.width, height: info.height, channels: 1 } })
    .png()
    .toBuffer();
}

/** Places `layers` ({ input, left, top }, or centred with `cx`/`cy`) on an SVG background. */
async function compose(width, height, backgroundSvg, layers) {
  const placed = await Promise.all(
    layers.map(async ({ input, cx, cy, left, top }) => {
      const { width: w, height: h } = await sharp(input).metadata();
      return { input, left: Math.round(left ?? cx - w / 2), top: Math.round(top ?? cy - h / 2) };
    }),
  );
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${backgroundSvg}</svg>`))
    .composite(placed)
    .flatten({ background: "#ffffff" });
}

/** NSIS and WiX only read uncompressed 24-bit BMPs. */
async function writeBmp(image, file) {
  const { data, info } = await image.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const stride = Math.ceil((width * 3) / 4) * 4;
  const out = Buffer.alloc(54 + stride * height);
  out.write("BM", 0);
  out.writeUInt32LE(out.length, 2);
  out.writeUInt32LE(54, 10);
  out.writeUInt32LE(40, 14);
  out.writeInt32LE(width, 18);
  out.writeInt32LE(height, 22);
  out.writeUInt16LE(1, 26);
  out.writeUInt16LE(24, 28);
  out.writeUInt32LE(stride * height, 34);
  out.writeInt32LE(2835, 38);
  out.writeInt32LE(2835, 42);
  for (let y = 0; y < height; y++) {
    const row = 54 + (height - 1 - y) * stride;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      out[row + x * 3] = data[i + 2];
      out[row + x * 3 + 1] = data[i + 1];
      out[row + x * 3 + 2] = data[i];
    }
  }
  writeFileSync(path.join(here, file), out);
}

/** The dark panel beside the welcome and finish pages: the mark and wordmark, and a faint mark behind. */
async function sidebar(width, height) {
  const ghost = (height * 0.62).toFixed(0);
  const background = `
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d1e21"/><stop offset="1" stop-color="#0e0e0f"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <svg x="${width * 0.38}" y="${height * 0.6}" height="${ghost}" width="${ghost}" viewBox="0 0 744 766"><g fill="#ffffff" fill-opacity="0.035">${MARK_PATHS}</g></svg>
    <rect x="${width - 1}" width="1" height="100%" fill="#2a2a2a"/>`;
  return compose(width, height, background, [
    { input: await mark(54, LIGHT), cx: width / 2, cy: height * 0.36 },
    { input: await wordmark(Math.round(width * 0.56), LIGHT), cx: width / 2, cy: height * 0.36 + 52 },
  ]);
}

// Windows setup (NSIS): the welcome/finish sidebar, and the header on the
// other pages (on its left, before the page's title).
await writeBmp(await sidebar(164, 314), "nsis-sidebar.bmp");
await writeBmp(
  await compose(150, 57, `<rect width="100%" height="100%" fill="#ffffff"/><rect x="8" y="8" width="134" height="41" rx="6" fill="${DARK}"/>`, [
    { input: await mark(23, LIGHT), cx: 32, cy: 28.5 },
    { input: await wordmark(74, LIGHT), cx: 90, cy: 28.5 },
  ]),
  "nsis-header.bmp",
);

// .msi (WiX): its text is drawn over these images, on the right of the
// dialog and the left of the banner, so those parts stay white.
const panel = await (await sidebar(164, 312)).png().toBuffer();
await writeBmp(await compose(493, 312, `<rect width="100%" height="100%" fill="#ffffff"/>`, [{ input: panel, left: 0, top: 0 }]), "wix-dialog.bmp");
await writeBmp(
  await compose(493, 58, `<rect width="100%" height="100%" fill="#ffffff"/><rect y="57" width="100%" height="1" fill="#e4e4e4"/>`, [{ input: await mark(30, DARK), cx: 460, cy: 29 }]),
  "wix-banner.bmp",
);

// macOS disk image: light, as Finder labels the icons in dark text. Icons
// sit at (180, 220) and (480, 220), set in tauri.conf.json. Drawn at 1x and
// 2x, and kept in one TIFF so Retina screens get the sharp one.
const dmgAt = async (scale) =>
  (
    await compose(
      660 * scale,
      400 * scale,
      `<g transform="scale(${scale})">
         <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fafaf9"/><stop offset="1" stop-color="#ececea"/></linearGradient></defs>
         <rect width="660" height="400" fill="url(#g)"/>
         <g stroke="#9a9a9c" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
           <path d="M272 220H384" stroke-dasharray="2 8"/><path d="M376 210 388 220 376 230"/>
         </g>
         <text x="330" y="352" text-anchor="middle" font-family="Segoe UI, Helvetica Neue, Arial, sans-serif" font-size="13" fill="#6e6e72">Drag Axiom into Applications to install it</text>
       </g>`,
      [{ input: await wordmark(132 * scale, DARK), cx: 330 * scale, cy: 62 * scale }],
    )
  )
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
writeFileSync(path.join(here, "dmg-background.tiff"), hidpiTiff([await dmgAt(1), await dmgAt(2)]));

/**
 * A TIFF holding one image at several resolutions, as macOS's
 * `tiffutil -cathidpicheck` makes: each at 72 dpi per 1x of scale, so
 * Finder shows them all at the first one's size. Deflate-compressed RGB.
 */
function hidpiTiff(images) {
  const parts = [];
  let offset = 8;
  const add = (buffer) => {
    const at = offset;
    parts.push(buffer);
    offset += buffer.length + (buffer.length % 2);
    if (buffer.length % 2) parts.push(Buffer.alloc(1));
    return at;
  };
  const header = Buffer.alloc(8);
  header.write("II", 0);
  header.writeUInt16LE(42, 2);
  parts.push(header);
  const ifds = [];
  images.forEach(({ data, info }, i) => {
    const strip = deflateSync(data);
    const dpi = 72 * (info.width / images[0].info.width);
    const stripAt = add(strip);
    const bitsAt = add(Buffer.from([8, 0, 8, 0, 8, 0]));
    const rational = Buffer.alloc(8);
    rational.writeUInt32LE(Math.round(dpi), 0);
    rational.writeUInt32LE(1, 4);
    const resolutionAt = add(rational);
    // [tag, type (3 short, 4 long, 5 rational), value or offset]
    const entries = [
      [256, 4, info.width], [257, 4, info.height], [258, 3, bitsAt, 3], [259, 3, 8], [262, 3, 2],
      [273, 4, stripAt], [277, 3, 3], [278, 4, info.height], [279, 4, strip.length],
      [282, 5, resolutionAt], [283, 5, resolutionAt], [284, 3, 1], [296, 3, 2],
    ];
    const ifd = Buffer.alloc(2 + entries.length * 12 + 4);
    ifd.writeUInt16LE(entries.length, 0);
    entries.forEach(([tag, type, value, count = 1], n) => {
      const at = 2 + n * 12;
      ifd.writeUInt16LE(tag, at);
      ifd.writeUInt16LE(type, at + 2);
      ifd.writeUInt32LE(count, at + 4);
      if (type === 3 && count === 1) ifd.writeUInt16LE(value, at + 8);
      else ifd.writeUInt32LE(value, at + 8);
    });
    ifds.push({ at: add(ifd), buffer: ifd });
  });
  header.writeUInt32LE(ifds[0].at, 4);
  ifds.forEach(({ buffer }, i) => buffer.writeUInt32LE(ifds[i + 1]?.at ?? 0, buffer.length - 4));
  return Buffer.concat(parts);
}

console.log("Wrote the installer artwork to", here);
