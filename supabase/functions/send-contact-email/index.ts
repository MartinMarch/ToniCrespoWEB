const recipientEmail = Deno.env.get("CONTACT_RECIPIENT_EMAIL") ?? "tonicrespo.art@gmail.com";
const resendApiKey = Deno.env.get("RESEND_API_KEY");
const senderEmail = Deno.env.get("CONTACT_FROM_EMAIL");
const allowedOrigins = (Deno.env.get("CONTACT_ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);

type ContactArtwork = {
  dimensions?: string | null;
  technique?: string | null;
  title: string;
};

type ContactPayload = {
  artwork?: ContactArtwork;
  message?: unknown;
  pageUrl?: unknown;
  senderEmail?: unknown;
  senderName?: unknown;
  subject?: unknown;
  website?: unknown;
};

Deno.serve(async (request) => {
  const origin = request.headers.get("origin")?.replace(/\/$/, "") ?? "";
  const corsHeaders = getCorsHeaders(origin);

  if (allowedOrigins.length > 0 && origin && !allowedOrigins.includes(origin)) {
    return json({ error: "Origen no permitido." }, 403, corsHeaders);
  }

  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Método no permitido." }, 405, corsHeaders);
  }

  if (!resendApiKey || !senderEmail) {
    console.error("Faltan RESEND_API_KEY o CONTACT_FROM_EMAIL en los secretos de la Edge Function.");
    return json({ error: "El servicio de correo no está configurado todavía." }, 503, corsHeaders);
  }

  const payload = await readPayload(request);
  if (!payload) {
    return json({ error: "La solicitud no contiene datos válidos." }, 400, corsHeaders);
  }

  if (typeof payload.website === "string" && payload.website.trim()) {
    return json({ ok: true }, 200, corsHeaders);
  }

  const validation = validatePayload(payload);
  if (!validation.ok) {
    return json({ error: validation.error }, 400, corsHeaders);
  }

  const response = await fetch("https://api.resend.com/emails", {
    body: JSON.stringify({
      from: senderEmail,
      reply_to: validation.senderEmail,
      subject: `[Web Toni Crespo] ${validation.subject}`,
      text: formatEmailText(validation),
      to: [recipientEmail],
    }),
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    console.error("Resend rechazó el correo:", response.status, await response.text());
    return json({ error: "No se pudo enviar el correo. Inténtalo de nuevo más tarde." }, 502, corsHeaders);
  }

  return json({ ok: true }, 200, corsHeaders);
});

async function readPayload(request: Request): Promise<ContactPayload | null> {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? (value as ContactPayload) : null;
  } catch {
    return null;
  }
}

function validatePayload(payload: ContactPayload):
  | { ok: true; artwork?: ContactArtwork; message: string; pageUrl: string; senderEmail: string; senderName: string; subject: string }
  | { error: string; ok: false } {
  const senderName = cleanText(payload.senderName, 120);
  const senderEmail = cleanText(payload.senderEmail, 254).toLowerCase();
  const subject = cleanText(payload.subject, 180).replace(/[\r\n]+/g, " ");
  const message = cleanText(payload.message, 5000);
  const pageUrl = cleanText(payload.pageUrl, 2048);

  if (!isEmail(senderEmail)) return { error: "Introduce un correo electrónico válido.", ok: false };
  if (!subject) return { error: "Introduce un asunto.", ok: false };
  if (!message) return { error: "Escribe un mensaje.", ok: false };

  const artwork = normalizeArtwork(payload.artwork);
  return { artwork, message, ok: true, pageUrl, senderEmail, senderName, subject };
}

function cleanText(value: unknown, maximumLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maximumLength) : "";
}

function normalizeArtwork(value: unknown): ContactArtwork | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

  const artwork = value as ContactArtwork;
  const title = cleanText(artwork.title, 180);
  if (!title) return undefined;

  return {
    dimensions: cleanText(artwork.dimensions, 120) || null,
    technique: cleanText(artwork.technique, 180) || null,
    title,
  };
}

function formatEmailText(payload: Extract<ReturnType<typeof validatePayload>, { ok: true }>) {
  const artworkDetails = payload.artwork
    ? [
        "",
        "Obra consultada:",
        `- Título: ${payload.artwork.title}`,
        ...(payload.artwork.technique ? [`- Técnica: ${payload.artwork.technique}`] : []),
        ...(payload.artwork.dimensions ? [`- Medidas: ${payload.artwork.dimensions}`] : []),
      ]
    : [];

  return [
    "Nuevo contacto desde tonicrespo.com",
    `Nombre: ${payload.senderName || "No indicado"}`,
    `Correo: ${payload.senderEmail}`,
    `Página: ${payload.pageUrl || "No indicada"}`,
    ...artworkDetails,
    "",
    "Mensaje:",
    payload.message,
  ].join("\n");
}

function getCorsHeaders(origin: string) {
  const allowedOrigin = allowedOrigins.length === 0 ? origin || "*" : allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  return {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": allowedOrigin,
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  };
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function json(body: Record<string, unknown>, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { headers, status });
}
