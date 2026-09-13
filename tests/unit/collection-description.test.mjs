import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const source = await readFile(new URL("../../src/components/support/CollectionDescription.tsx", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
});
const exports = {};
runInNewContext(outputText, { React, exports });
const render = (description, options = {}) => renderToStaticMarkup(React.createElement(exports.CollectionDescription, { description, ...options }));

test("empty collection descriptions have no wrapper or extra spacing", () => {
  for (const value of [undefined, null, "", "  ", "\r\n \t\n "]) assert.equal(render(value), "");
});

test("collection descriptions preserve single line breaks and separate paragraphs", () => {
  assert.equal(render("  Primera línea\r\nSegunda línea\r\n\r\nOtro párrafo.\rÚltima línea.  "),
    '<div class="collection-description"><p>Primera línea\nSegunda línea</p><p>Otro párrafo.\nÚltima línea.</p></div>');
  assert.equal(render("Uno\n \t\n\nDos"), '<div class="collection-description"><p>Uno</p><p>Dos</p></div>');
});

test("collection descriptions are plain text: HTML and event handlers remain escaped", () => {
  const result = render('<script>alert("x")</script>\n<img src=x onerror="alert(1)"> & texto');
  assert.doesNotMatch(result, /<script|<img|<iframe/);
  assert.match(result, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.match(result, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; texto/);
});

test("collection prose retains author capitalization, punctuation and Unicode", () => {
  assert.equal(render("OBRA DISPONIBLE · paper · 2024\n\n«Llum» — 50 × 70 cm"),
    '<div class="collection-description"><p>OBRA DISPONIBLE · paper · 2024</p><p>«Llum» — 50 × 70 cm</p></div>');
});

test("alignment is opt-in and cannot inject arbitrary class names", () => {
  assert.equal(render("Texto", { alignment: "center" }), '<div class="collection-description collection-description--center"><p>Texto</p></div>');
  for (const alignment of [undefined, null, "justify", "left", "center injected-class"]) {
    assert.equal(render("Texto", { alignment }), '<div class="collection-description"><p>Texto</p></div>');
  }
});

test("compact listing keeps every paragraph and hides empty descriptions regardless of alignment", () => {
  assert.equal(render("Uno\n\nDos", { compact: true, alignment: "center" }),
    '<div class="collection-description collection-description--center collection-description--compact"><p>Uno</p><p>Dos</p></div>');
  assert.equal(render("  \n ", { compact: true, alignment: "center" }), "");
});
