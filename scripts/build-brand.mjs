/**
 * Generates brand assets from the official logo (public/logo.svg, left untouched):
 *   public/brand/logo-dark.svg   full lock-up, original colours, cropped to the artwork (for dark backgrounds)
 *   public/brand/logo-light.svg  same artwork; white parts → ink, cyan slightly deepened (for light backgrounds)
 *   public/brand/mark.svg        candlestick symbol only (dark-background colours)
 *   public/brand/mark-light.svg  candlestick symbol only (light-background colours)
 *   src/app/icon.svg             favicon: candlestick symbol, adapts to the browser's light/dark UI
 * Run: node scripts/build-brand.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const src = readFileSync("public/logo.svg", "utf8");

// Measured artwork bounds in the original 2400×1600 viewBox (see CLAUDE.md → Branding).
const FULL = { x: 349, y: 654, w: 1701, h: 292 };
const MARK = { x: 349, y: 654, w: 341, h: 292 };
// Paths that make up the candlestick symbol (everything left of the divider at x≈754).
const MARK_CLASSES = ["fil4", "fil5", "fil7", "fil9", "fil10", "fil11", "fil12"];

const style = src.match(/<style[\s\S]*?<\/style>/)[0];
const body = src.match(/<g id="Layer_x0020_1">[\s\S]*<\/g>\s*<\/svg>/)[0].replace(/<\/svg>\s*$/, "");

const svg = (viewBox, css, content, label) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${label}" ` +
  `style="shape-rendering:geometricPrecision;fill-rule:evenodd;clip-rule:evenodd">\n<title>${label}</title>\n${css}\n${content}\n</svg>\n`;

const pad = (b, p) => `${b.x - p} ${b.y - p} ${b.w + 2 * p} ${b.h + 2 * p}`;

// Light-theme recolouring: near-white fills become ink, cyan fills a deeper cyan for contrast on white.
const LIGHT = {
  fil0: "#00B9C2", fil2: "#00B9C2", fil4: "#00B9C2",
  fil1: "#172231", fil3: "#172231", fil6: "#172231", fil7: "#172231",
  fil5: "#2B3A4D", fil8: "#B8C0CB",
  fil9: "#35C9CF", fil10: "#5BD3D8", fil11: "#86DEE1", fil12: "#A9E7E9",
};
const lightStyle = style.replace(/\.(fil\d+) \{fill:#[0-9A-Fa-f]{6}\}/g, (m, c) => (LIGHT[c] ? `.${c} {fill:${LIGHT[c]}}` : m));

const markBody = [...body.matchAll(/<(path|polygon)[^>]*class="(fil\d+)"[^>]*\/>/g)]
  .filter((m) => MARK_CLASSES.includes(m[2]))
  .map((m) => m[0])
  .join("\n");

mkdirSync("public/brand", { recursive: true });
writeFileSync("public/brand/logo-dark.svg", svg(pad(FULL, 12), style, body, "TRADING HQ"));
writeFileSync("public/brand/logo-light.svg", svg(pad(FULL, 12), lightStyle, body, "TRADING HQ"));

// Square viewBox centred on the symbol.
const side = Math.max(MARK.w, MARK.h) + 24;
const cx = MARK.x + MARK.w / 2, cy = MARK.y + MARK.h / 2;
const squareBox = `${Math.round(cx - side / 2)} ${Math.round(cy - side / 2)} ${side} ${side}`;
writeFileSync("public/brand/mark.svg", svg(squareBox, style, `<g>${markBody}</g>`, "TRADING HQ"));
writeFileSync("public/brand/mark-light.svg", svg(squareBox, lightStyle, `<g>${markBody}</g>`, "TRADING HQ"));

// Favicon: dark colours by default, ink + deeper cyan when the browser UI is light.
const lightOverrides = MARK_CLASSES.map((c) => `.${c}{fill:${LIGHT[c]}}`).join("");
const faviconStyle = style.replace("]]>", `@media (prefers-color-scheme: light){${lightOverrides}}\n   ]]>`);
writeFileSync("src/app/icon.svg", svg(squareBox, faviconStyle, `<g>${markBody}</g>`, "TRADING HQ"));

console.log("brand assets written:", { full: pad(FULL, 12), mark: squareBox });
