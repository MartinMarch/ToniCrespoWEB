import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../../src/lib/poem.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
const { splitPoemAttribution } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

const verses = [
  "Tras el caos de los pigmentos",
  "derramados sobre la mesa,",
  "las manos quietas y manchadas",
  "y los pinceles desgastados,",
  "quedan los inquietos bisontes",
  "en la penumbra de la cueva,",
  "la mirada de la Gioconda",
  "custodiando la humanidad,",
  "la santa y delicada cena",
  "desprendiéndose del yeso,",
  "un fresco pintado en el cielo,",
  "el Gernika clamando la paz…",
  "y los valientes trazos de luz",
  "sobre la oscuridad de los lienzos.",
];
const poem = `SOBRE LA PINTURA\n\n${verses.join("\n")}`;

test("keeps all fourteen verses and their punctuation unchanged", () => {
  const result = splitPoemAttribution(`${poem}\n\n— Martin March`);
  assert.deepEqual(result, { body: poem, author: "Martin March" });
  assert.deepEqual(result.body.split("\n").slice(2), verses);
  assert.equal(verses.length, 14);
});

test("recognizes dash variants and a bare known attribution with original spelling", () => {
  for (const author of ["Martin March", "Martín March", "MARTÍN MARCH", "martin march", "Marti\u0301n March"]) {
    for (const prefix of ["— ", "– ", "- ", ""]) {
      assert.deepEqual(splitPoemAttribution(`${poem}\n${prefix}${author}`), { body: poem, author });
    }
  }
});

test("normalizes CRLF and outer whitespace but preserves internal stanza breaks", () => {
  const input = ` \r\n${poem.replace(/\n/g, "\r\n")}\r\n \r\n — Martín March \r\n\r\n `;
  assert.deepEqual(splitPoemAttribution(input), { body: poem, author: "Martín March" });
  assert.deepEqual(splitPoemAttribution("Uno\rDos\r\r- Martin March"), { body: "Uno\nDos", author: "Martin March" });
});

test("does not invent an attribution for blank, unsigned or unknown poems", () => {
  for (const body of ["", poem, "Martin March", `${poem}\n\n— Jean-Paul Sartre`, `${poem}\n\nAutor desconocido`]) {
    assert.deepEqual(splitPoemAttribution(body), { body, author: null });
  }
  assert.deepEqual(splitPoemAttribution(" \r\n \n "), { body: "", author: null });
});

test("preserves dashed poetic final lines, including title-case words that resemble names", () => {
  for (const lastLine of ["— las manos quietas y manchadas", "– sobre la oscuridad de los lienzos.", "- La Mirada", "— Noche Oscura", "— Martin March contempla la pintura"]) {
    const body = `${poem}\n\n${lastLine}`;
    assert.deepEqual(splitPoemAttribution(body), { body, author: null });
  }
});

test("does not remove an attribution-shaped line inside the poem", () => {
  const body = `Una voz:\n— Martin March\n\nY siguen los versos.`;
  assert.deepEqual(splitPoemAttribution(body), { body, author: null });
  const signed = splitPoemAttribution(`${body}\n\n– Martín March`);
  assert.deepEqual(signed, { body, author: "Martín March" });
});
