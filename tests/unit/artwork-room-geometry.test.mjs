import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

// Keep the geometry independent from the application, browser and remote data.
const source = await readFile(new URL("../../src/lib/artworkRoomGeometry.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
const { getArtworkMetrics, getArtworkPlacement, getMockupsForArtwork } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

const artwork = (dimensions, rest = {}) => ({ dimensions, description: "", caption: "", width: null, height: null, ...rest });
const scene = (rest = {}) => ({
  id: "medium", labelKey: "livingRoom", backgroundUrl: "/test-room.webp", imageAspectRatio: 1.5,
  wall: { left: 10, top: 5, right: 90, bottom: 65 },
  reference: { widthCm: 200, imageWidthPercent: 50 },
  artworkCenter: { x: 50, y: 35 }, brightness: 0.88, sizeRange: { min: 60, max: 160 }, ...rest,
});
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.000001, `${actual} != ${expected}`);

test("explicit physical units and decimal commas convert to centimetres", () => {
  for (const [value, width, height] of [
    ["80 × 60 cm", 80, 60], ["80 cm x 60 cm", 80, 60],
    ["800 x 600 mm", 80, 60], ["0,8 x 0,6 m", 80, 60],
    ["20 x 10 in", 50.8, 25.4], ['20″ × 10″', 50.8, 25.4],
    ["20 inches x 10 inches", 50.8, 25.4], ["50,5 cm × 400 mm", 50.5, 40],
    ["20” × 10”", 50.8, 25.4], ["80 cm. x 60 cm.", 80, 60],
    ["<p>Óleo sobre tela. 80 &times; 60 cm.</p>", 80, 60],
  ]) {
    const result = getArtworkMetrics(artwork(value));
    close(result.widthCm, width);
    close(result.heightCm, height);
  }
});

test("photo orientation can swap sides but never changes either recorded dimension", () => {
  const result = getArtworkMetrics(artwork("100 x 70 cm", { width: 820, height: 1100 }));
  assert.deepEqual(result, { widthCm: 70, heightCm: 100, ratio: 0.7, longestCm: 100 });
  const landscape = getArtworkMetrics(artwork("70 x 100 cm", { width: 1800, height: 900 }));
  assert.deepEqual(landscape, { widthCm: 100, heightCm: 70, ratio: 100 / 70, longestCm: 100 });
  const almostSquare = getArtworkMetrics(artwork("100 x 70 cm", { width: 999, height: 1000 }));
  assert.equal(almostSquare.widthCm, 100);
});

test("absent dimensions use description or caption, but ambiguous data never creates a false scale", () => {
  assert.equal(getArtworkMetrics(artwork(null, { description: "Acrílico 100 × 80 cm" })).widthCm, 100);
  assert.equal(getArtworkMetrics(artwork("", { description: "Acrílico", caption: "100 × 80 cm" })).widthCm, 100);
  assert.equal(getArtworkMetrics(artwork("100 × 80", { description: "50 × 40 cm" })).widthCm, null);
  assert.equal(getArtworkMetrics(artwork(null, { description: "100 × 80 cm", caption: "50 × 40 cm" })).widthCm, null);
  for (const value of ["", "100 × 80", "-100 x 80 cm", "0 x 50 cm", "40-50 x 60 cm", "40 - 50 x 60 cm", "10 1/2 x 8 in", "20 cm x 10 1/2 cm", "50 × 40 × 2 cm", "Díptico de 2 piezas de 50 × 40 cm", "Total de 2 piezas, cada pieza 50 × 40 cm", "50 × 40 cm y 60 × 40 cm"]) {
    assert.equal(getArtworkMetrics(artwork(value)).widthCm, null, value);
  }
  assert.equal(getArtworkMetrics(artwork("Díptico, tamaño total 100 × 40 cm")).widthCm, 100);
});

test("real catalogue dimension variants retain known sizes without guessing legacy filename units", () => {
  for (const value of ["20 x20 cm", "20 X 20 cm", "140 x 140 cm.", "146 x 114 cm", "180 x 90 cm (díptico)", "200 x 100 cm (díptico)", "220 x 120 cm"]) {
    assert.notEqual(getArtworkMetrics(artwork(value)).widthCm, null, value);
  }
  for (const value of ["120x200", "280x140", "70x120", "60x70", "100x120", "25x25", "28x28"]) {
    assert.equal(getArtworkMetrics(artwork(value)).widthCm, null, value);
  }
  assert.equal(getArtworkMetrics(artwork(null, { caption: "El cuervo (Edgar Allan Poe, 1809–1849), 80 x 60 cm" })).widthCm, 80);
  for (const caption of ["Díptico 200 x 100 cm", "Díptic 200 x 100 cm", "Diptychon 200 x 100 cm", "Obra compuesta por 4 tablillas 20 x20 cm"]) {
    assert.equal(getArtworkMetrics(artwork(null, { caption })).widthCm, null, caption);
  }
});

test("one furniture reference produces the same real scale in both axes", () => {
  const metrics = getArtworkMetrics(artwork("100 × 80 cm"));
  const placement = getArtworkPlacement(metrics, scene());
  assert.deepEqual(placement, { x: 50, y: 20, width: 25, height: 30, fits: true, isEstimated: false });
  close(placement.width / placement.height * 1.5, metrics.ratio);
  for (const screenWidth of [360, 390, 1440]) {
    const artworkWidthPixels = screenWidth * placement.width / 100;
    const artworkHeightPixels = screenWidth / 1.5 * placement.height / 100;
    close(artworkWidthPixels / artworkHeightPixels, 100 / 80);
    const sofaWidthPixels = screenWidth * 50 / 100;
    close(artworkWidthPixels / sofaWidthPixels, 100 / 200);
  }
});

test("oversized work is rejected instead of silently shrunk or moved outside the wall", () => {
  const placement = getArtworkPlacement(getArtworkMetrics(artwork("400 × 300 cm")), scene());
  assert.equal(placement.width, 100);
  assert.equal(placement.height, 112.5);
  assert.equal(placement.fits, false);
  assert.equal(placement.isEstimated, false);
  const offCenter = scene({ artworkCenter: { x: 20, y: 35 } });
  assert.equal(getArtworkPlacement(getArtworkMetrics(artwork("100 × 80 cm")), offCenter).fits, false);
});

test("selects fitting size-matched rooms and only uses physically fitting larger fallbacks", () => {
  const small = scene({ id: "small", sizeRange: { min: 0, max: 59 }, reference: { widthCm: 60, imageWidthPercent: 50 } });
  const mediumA = scene({ id: "medium-a" });
  const mediumB = scene({ id: "medium-b" });
  const large = scene({ id: "large", sizeRange: { min: 161, max: 300 }, reference: { widthCm: 300, imageWidthPercent: 50 } });
  const rooms = [small, mediumA, mediumB, large];
  assert.deepEqual(getMockupsForArtwork(artwork("100 × 80 cm"), rooms).map(({ id }) => id), ["medium-a", "medium-b"]);
  assert.deepEqual(getMockupsForArtwork(artwork("100 × 170 cm"), rooms).map(({ id }) => id), ["large"]);
  assert.deepEqual(getMockupsForArtwork(artwork("100 × 150 cm"), [small, mediumA, large]).map(({ id }) => id), ["medium-a", "large"]);
  assert.deepEqual(getMockupsForArtwork(artwork("800 × 600 cm"), rooms), []);
});

test("unknown sizes remain explicitly estimated and preserve image shape", () => {
  const metrics = getArtworkMetrics(artwork(null, { width: 400, height: 1000 }));
  assert.deepEqual(metrics, { ratio: 0.4, widthCm: null, heightCm: null, longestCm: null });
  const placement = getArtworkPlacement(metrics, scene());
  assert.equal(placement.fits, true);
  assert.equal(placement.isEstimated, true);
  close(placement.width / placement.height * 1.5, 0.4);
  const invalidImage = getArtworkMetrics(artwork(null, { width: -1, height: 0 }));
  assert.equal(invalidImage.ratio, 1);
});

test("preferred size ceilings never hide a physically fitting panoramic artwork", () => {
  const normal = scene();
  const broad = scene({ id: "broad", sizeRange: { min: 140, max: 320 }, reference: { widthCm: 300, imageWidthPercent: 50 } });
  const broadest = scene({ id: "broadest", sizeRange: { min: 140, max: 320 }, reference: { widthCm: 400, imageWidthPercent: 50 } });
  const rooms = [normal, broad, broadest];
  assert.deepEqual(getMockupsForArtwork(artwork("400 x 100 cm"), rooms).map(({ id }) => id), ["broadest", "broad"]);
  for (const room of getMockupsForArtwork(artwork("400 x 100 cm"), rooms)) {
    const placement = getArtworkPlacement(getArtworkMetrics(artwork("400 x 100 cm")), room);
    assert.equal(placement.fits, true);
    close(placement.width / room.reference.imageWidthPercent, 400 / room.reference.widthCm);
  }
  assert.deepEqual(getMockupsForArtwork(artwork("1000 x 1000 cm"), rooms), []);
  assert.deepEqual(getMockupsForArtwork(artwork("100 x 80 cm"), rooms).map(({ id }) => id), ["medium", "broad"]);
});
