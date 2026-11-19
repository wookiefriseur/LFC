// The two palettes in style.css: same tokens in both, readable text on every surface (WCAG AA, 4.5:1),
// and no colour written outside the palettes.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { applyTheme, THEMES } from "../../docs/prefs.js";

const css = fs.readFileSync(new URL("../../docs/style.css", import.meta.url), "utf8");
const END = css.indexOf("}", css.indexOf(':root[data-theme="dark"]')) + 1;

function tokens(block) {
  return Object.fromEntries([...block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}
const light = tokens(css.slice(css.indexOf(":root {"), css.indexOf("@media (prefers-color-scheme: dark)")));
const darkSystem = tokens(css.slice(css.indexOf("@media (prefers-color-scheme: dark)"), css.indexOf(':root[data-theme="dark"]')));
const darkChosen = tokens(css.slice(css.indexOf(':root[data-theme="dark"]'), END));

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [text, surface it is written on]
const PAIRS = [
  ...["bg", "surface", "surface-2", "surface-3", "selected", "dirty", "warn-bg", "danger-bg", "ok-bg", "info-bg"].map((s) => ["fg", s]),
  ...["bg", "surface", "surface-2", "surface-3", "selected", "dirty", "warn-bg"].map((s) => ["muted", s]),
  ...["bg", "surface", "surface-2", "selected"].map((s) => ["accent", s]),
  ["on-accent", "accent"], ["on-accent", "accent-hover"], ["on-accent", "danger"], ["on-accent", "ok-fg"],
  ["danger", "bg"], ["danger", "surface"], ["danger", "danger-bg"],
  ["warn-fg", "surface"], ["warn-fg", "warn-bg"], ["ok-fg", "surface"], ["ok-fg", "ok-bg"],
  ["info-fg", "surface"], ["info-fg", "info-bg"], ["special-fg", "surface"], ["special-fg", "special-bg"],
];

test("the dark palette defines exactly the light palette's colour tokens, in both of its blocks", () => {
  const names = (p) => Object.keys(p).filter((k) => k !== "screen-width").sort();
  assert.deepEqual(names(darkSystem), names(light));
  assert.deepEqual(darkChosen, darkSystem);
});

for (const [name, palette] of [["light", light], ["dark", darkSystem]]) {
  test(`${name} palette: text keeps 4.5:1 on every surface it is used on`, () => {
    const low = PAIRS.map(([fg, bg]) => [fg, bg, contrast(palette[fg], palette[bg])]).filter(([, , c]) => c < 4.5)
      .map(([fg, bg, c]) => `${fg} on ${bg}: ${c.toFixed(2)}`);
    assert.deepEqual(low, []);
  });
}

test("no colour is written outside the palettes, except shadows", () => {
  const rules = css.slice(END).replace(/\/\*[\s\S]*?\*\//g, "");
  const literal = [...rules.matchAll(/^.*(#[0-9a-fA-F]{3,8}\b|\bwhite\b(?!-)|\brgba?\().*$/gm)]
    .map((m) => m[0].trim()).filter((line) => !/box-shadow|::backdrop/.test(line));
  assert.deepEqual(literal, []);
});

test("a chosen theme is an attribute on the root, and System removes it", () => {
  const root = { dataset: {} };
  applyTheme("dark", root);
  assert.equal(root.dataset.theme, "dark");
  applyTheme("light", root);
  assert.equal(root.dataset.theme, "light");
  applyTheme("system", root);
  assert.equal("theme" in root.dataset, false);
  assert.deepEqual(THEMES, ["system", "light", "dark"]);
});
