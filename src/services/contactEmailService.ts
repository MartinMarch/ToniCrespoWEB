import { supabase } from "../lib/supabaseClient";

export type ContactEmailArtwork = {
  dimensions?: string | null;
  technique?: string | null;
  title: string;
};

export type ContactEmailRequest = {
  artwork?: ContactEmailArtwork;
  message: string;
  pageUrl: string;
  senderEmail: string;
  senderName: string;
  subject: string;
  website?: string;
};

export async function sendContactEmail(input: ContactEmailRequest) {
  if (!supabase) {
    throw new Error("El servicio de correo no está configurado todavía.");
  }

  const { data, error } = await supabase.functions.invoke("send-contact-email", {
    body: input,
  });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error));
  }

  if (!data || data.ok !== true) {
    throw new Error("No se pudo enviar el correo. Inténtalo de nuevo más tarde.");
  }
}

async function getFunctionErrorMessage(error: unknown) {
  const fallback = "No se pudo enviar el correo. Inténtalo de nuevo más tarde.";

  if (!error || typeof error !== "object") return fallback;

  if ("context" in error && error.context instanceof Response) {
    try {
      const body = (await error.context.clone().json()) as { error?: unknown };
      if (typeof body.error === "string" && body.error.trim()) return body.error;
    } catch {
      // The response is not JSON. The generic message is safer for visitors.
    }
  }

  return fallback;
}
