// Generate desktop assets and exact Windows icon sizes for 100–400% display scaling.
import { execFileSync } from "node:child_process";
import { copyFile, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const cli = join(root, "node_modules/@tauri-apps/cli/tauri.js");
const source = join(root, "src-tauri/icons/source/axiom.svg");
const output = join(root, "src-tauri/icons");
const sizes = [16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 72, 80, 96, 112, 128, 192, 256];
const temporary = await mkdtemp(join(tmpdir(), "axiom-icons-"));
try {
  const desktop = join(temporary, "desktop");
  const frames = join(temporary, "frames");
  execFileSync(process.execPath, [cli, "icon", source, "--output", desktop], { cwd: root, stdio: "inherit" });
  // The CLI also produces mobile directories; this desktop app only uses the root files.
  for (const entry of await readdir(desktop, { withFileTypes: true })) {
    if (entry.isFile()) await copyFile(join(desktop, entry.name), join(output, entry.name));
  }
  execFileSync(process.execPath, [cli, "icon", source, "--output", frames,
    ...sizes.flatMap(size => ["--png", String(size)])], { cwd: root, stdio: "inherit" });
  const images = await Promise.all(sizes.map(size => readFile(join(frames, `${size}x${size}.png`))));
  const directory = Buffer.alloc(6 + 16 * sizes.length);
  directory.writeUInt16LE(1, 2); // ICO, with PNG frames supported by modern Windows.
  directory.writeUInt16LE(sizes.length, 4);
  let offset = directory.length;
  images.forEach((png, index) => {
    const entry = 6 + index * 16;
    directory[entry] = directory[entry + 1] = sizes[index] === 256 ? 0 : sizes[index];
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(png.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  await writeFile(join(output, "icon.ico"), Buffer.concat([directory, ...images]));
  console.log(`Windows ICO: ${sizes.join(", ")}px`);
} finally {
  // Only remove the dedicated directory returned by mkdtemp above.
  await rm(temporary, { recursive: true, force: true });
}
