/**
 * The files of the icons a person makes on their phone (ADR 0179): `node made-files.mjs <dir>`. They are never
 * committed (336 icons): the phone's plugin (apps/mobile/plugins/with-app-icons.js) runs this when the app is built
 * and keeps the result while these scripts stay the same.
 *
 * - <id>/ios.png: the 1024 icon (one look; a made icon has no dark or tinted version).
 * - <id>/android-foreground.png (432) and <id>/android-legacy.png (192, Android before 8).
 * - sky-<sky>/android-background.png and mono-<look>/android-monochrome.png (432): shared by every icon of that sky
 *   and of that face or accessory.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { png, render, resize } from "./raster.mjs";
import {
  backLayers,
  MADE_COLORS,
  MADE_FACES,
  MADE_LOOKS,
  MADE_SKIES,
  madeIcons,
  madeId,
  madeScene,
  monoLayers,
  tiled,
} from "./scenes.mjs";

/** Android's layers are 108 dp and the launcher shows the middle 72: the 1024 scene fills the middle two thirds. */
const ANDROID = { k: 1536 / 432, ox: -256, oy: -256 };

/** `top` drawn over `under` (both premultiplied, the same size). */
function over(under, top) {
  const px = new Float32Array(under.px.length);
  for (let i = 0; i < px.length; i += 4) {
    const keep = 1 - top.px[i + 3];
    px[i] = top.px[i] + under.px[i] * keep;
    px[i + 1] = top.px[i + 1] + under.px[i + 1] * keep;
    px[i + 2] = top.px[i + 2] + under.px[i + 2] * keep;
    px[i + 3] = top.px[i + 3] + under.px[i + 3] * keep;
  }
  return { N: under.N, px };
}
/** `img` kept only where `shape` is (its alpha). */
function cut(img, shape) {
  const px = new Float32Array(img.px.length);
  for (let i = 0; i < px.length; i += 4) {
    const a = shape.px[i + 3];
    px[i] = img.px[i] * a;
    px[i + 1] = img.px[i + 1] * a;
    px[i + 2] = img.px[i + 2] * a;
    px[i + 3] = img.px[i + 3] * a;
  }
  return { N: img.N, px };
}

/**
 * An icon is its sky, its body and its face or accessory, one over the other, and each of those is the same in many
 * icons: every part is drawn once (40 of them) and the 336 icons are put together from the pictures.
 */
export function writeMadeIcons(dir) {
  const write = (path, data) => {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, data);
  };
  const kept = new Map();
  const once = (key, draw) => {
    if (!kept.has(key)) kept.set(key, draw());
    return kept.get(key);
  };
  const isFace = (l) => l.part === "eyes" || l.part === "accessory";
  /** One part of an icon's scene, for the iPhone (the 1024 scene as it is) or in Android's layer. */
  const part = (icon, which, android) => {
    const wears = !MADE_FACES.includes(icon.look);
    const key = which === "back" ? icon.sky : which === "body" ? `${icon.color}|${wears}` : icon.look;
    return once(`${which}|${android}|${key}`, () => {
      const scene = madeScene(icon);
      const layers =
        which === "back" ? backLayers(scene) : scene.filter((l) => (which === "body" ? l.part === "agent" : isFace(l)));
      return android ? render(432, layers, ANDROID) : render(1024, layers);
    });
  };
  const corners = render(192, tiled([{ mask: () => true, color: () => "#ffffff" }]), { k: 1024 / 192 });
  for (const icon of madeIcons()) {
    const id = madeId(icon);
    const whole = over(over(part(icon, "back", false), part(icon, "body", false)), part(icon, "face", false));
    write(`${id}/ios.png`, png(whole, { opaque: true }));
    write(`${id}/android-foreground.png`, png(over(part(icon, "body", true), part(icon, "face", true))));
    write(`${id}/android-legacy.png`, png(cut(resize(whole, 192), corners)));
  }
  const [color] = MADE_COLORS;
  const [look] = MADE_LOOKS;
  for (const sky of MADE_SKIES)
    write(`sky-${sky}/android-background.png`, png(part({ sky, color, look }, "back", true), { opaque: true }));
  const [sky] = MADE_SKIES;
  for (const each of MADE_LOOKS)
    write(
      `mono-${each}/android-monochrome.png`,
      png(render(432, monoLayers(madeScene({ sky, color, look: each })), ANDROID)),
    );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [, , dir] = process.argv;
  if (!dir) throw new Error("made-files: which directory?");
  writeMadeIcons(dir);
}
