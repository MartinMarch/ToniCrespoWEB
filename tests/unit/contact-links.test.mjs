import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Run the real frontend helpers with their real defaults, without a browser,
// Supabase, environment variables, network access, or a native mail application.
async function loadTypeScript(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const exports = {};
  runInNewContext(outputText, {
    exports,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}

const settings = await loadTypeScript("../../src/types/siteSettings.ts");
const { getContactLinks, getEmailContactUrl, getWhatsAppContactUrl } = await loadTypeScript(
  "../../src/lib/contact.ts",
  { "../types/siteSettings": settings },
);
const contact = { ...settings.defaultSiteSettings.contact, email: "artist@example.test" };

function parseEmail(url) {
  const email = new URL(url);
  assert.equal(email.protocol, "mailto:");
  assert.equal(email.hash, "");
  return email;
}

test("plain contact email uses the configured recipient without subject or body", () => {
  assert.equal(getEmailContactUrl(contact), "mailto:artist@example.test");
  assert.equal(getEmailContactUrl(contact, {}), "mailto:artist@example.test");
  assert.equal(getEmailContactUrl(contact, { subject: "", message: "" }), "mailto:artist@example.test");
  assert.equal(getContactLinks(contact).emailUrl, "mailto:artist@example.test");
  assert.equal(getEmailContactUrl({ ...contact, email: "  artist@example.test  " }), "mailto:artist@example.test");
});

test("all default contact links use Eulalia as the fallback email recipient", () => {
  assert.equal(settings.defaultSiteSettings.contact.email, "eulaliaricart@gmail.com");
  assert.equal(getContactLinks(settings.defaultSiteSettings.contact).emailUrl, "mailto:eulaliaricart@gmail.com");
});

test("recipient plus aliases are encoded and still address the exact configured mailbox", () => {
  const email = parseEmail(getEmailContactUrl({ ...contact, email: "artist+paper@example.test" }));
  assert.equal(email.pathname, "artist%2Bpaper@example.test");
  assert.equal(decodeURIComponent(email.pathname), "artist+paper@example.test");
  assert.equal(email.search, "");
});

test("drafts encode artwork accents and URL punctuation without adding recipients or mail headers", () => {
  const subject = "Interés en la obra: Ànima & mar? #1 — «Luz» + 50%";
  const message = 'Hola Toni, «Ànima» (Óleo & collage · 30 × 30 cm).\n\n¿Disponible?\n"Correo" &bcc=unwanted@example.test #firma + 50%';
  const url = getEmailContactUrl(contact, { subject, message });
  const email = parseEmail(url);
  assert.equal(decodeURIComponent(email.pathname), contact.email);
  assert.equal(email.searchParams.get("subject"), subject);
  assert.equal(email.searchParams.get("body"), message.replace(/\n/g, "\r\n"));
  assert.deepEqual([...email.searchParams.keys()].sort(), ["body", "subject"]);
  assert.equal(email.searchParams.get("bcc"), null);
  assert.match(url, /%C3%80nima/);
  assert.match(url, /%26/);
  assert.match(url, /%3F/);
  assert.match(url, /%23/);
  assert.match(url, /%25/);
});

test("draft bodies normalize LF, CR and CRLF to native-mail CRLF while preserving blank paragraphs", () => {
  const message = "Primer párrafo.\n\nSegon paràgraf.\r\rThird paragraph.\r\n\r\nVierter Absatz.\n";
  const email = parseEmail(getEmailContactUrl(contact, { message }));
  assert.equal(email.searchParams.get("body"), "Primer párrafo.\r\n\r\nSegon paràgraf.\r\n\r\nThird paragraph.\r\n\r\nVierter Absatz.\r\n");
  assert.deepEqual([...email.searchParams.keys()], ["body"]);
});

test("subject-only drafts omit a body and collapse control characters so they cannot inject mail headers", () => {
  const email = parseEmail(getEmailContactUrl(contact, { subject: "  Ànima\r\nBcc: visitor@example.test\u0000\u007fDisponible\t?  " }));
  assert.equal(email.searchParams.get("subject"), "Ànima Bcc: visitor@example.test Disponible ?");
  assert.doesNotMatch(email.searchParams.get("subject"), /[\u0000-\u001f\u007f]/);
  assert.deepEqual([...email.searchParams.keys()], ["subject"]);
  assert.equal(getEmailContactUrl(contact, { subject: "\r\n\t\u0000\u007f " }), "mailto:artist@example.test");
});

for (const [name, email] of [
  ["empty address", ""],
  ["whitespace address", "  "],
  ["missing at-sign", "not-an-email"],
  ["missing mailbox", "@example.test"],
  ["missing domain", "artist@"],
  ["multiple at-signs", "artist@example@test"],
  ["mailto URL", "mailto:artist@example.test"],
  ["HTTP URL", "https://artist@example.test"],
  ["comma recipient list", "artist@example.test,second@example.test"],
  ["semicolon recipient list", "artist@example.test;second@example.test"],
  ["display-name syntax", "Artist <artist@example.test>"],
  ["embedded whitespace", "art ist@example.test"],
  ["newline header injection", "artist@example.test\r\nBcc:second@example.test"],
  ["null character", "artist\u0000@example.test"],
  ["DEL character", "artist\u007f@example.test"],
  ["query header injection", "artist@example.test?bcc=second@example.test"],
  ["ampersand header injection", "artist@example.test&body=Injected"],
  ["fragment injection", "artist@example.test#injected"],
  ["pre-encoded header injection", "artist@example.test%0D%0ABcc:second@example.test"],
]) {
  test(`invalid recipient falls back safely: ${name}`, () => {
    const plain = getEmailContactUrl({ ...contact, email });
    assert.equal(plain, "mailto:eulaliaricart@gmail.com");
    const draft = parseEmail(getEmailContactUrl({ ...contact, email }, { subject: "Interés & dudas?", message: "Primera línea.\n\nSegunda línea." }));
    assert.equal(decodeURIComponent(draft.pathname), "eulaliaricart@gmail.com");
    assert.equal(draft.searchParams.get("subject"), "Interés & dudas?");
    assert.equal(draft.searchParams.get("body"), "Primera línea.\r\n\r\nSegunda línea.");
    assert.deepEqual([...draft.searchParams.keys()].sort(), ["body", "subject"]);
  });
}

test("WhatsApp, Instagram and telephone keep their configured destinations alongside native email", () => {
  const custom = { ...contact, phoneNumber: "34600111222", instagramUsername: "toni.fixture" };
  const links = getContactLinks(custom);
  assert.equal(links.whatsappUrl, "https://wa.me/34600111222");
  assert.equal(links.instagramDirectUrl, "https://ig.me/m/toni.fixture");
  assert.equal(links.instagramProfileUrl, "https://www.instagram.com/toni.fixture/");
  assert.equal(links.telephoneUrl, "tel:+34600111222");
  assert.equal(links.emailUrl, "mailto:artist@example.test");
  const message = "Hola Toni, ¿Mar & llum?\n30 × 30 cm #1";
  const whatsapp = new URL(getWhatsAppContactUrl(custom, message));
  assert.equal(whatsapp.pathname, "/34600111222");
  assert.equal(whatsapp.searchParams.get("text"), message);
  assert.deepEqual([...whatsapp.searchParams.keys()], ["text"]);
});
