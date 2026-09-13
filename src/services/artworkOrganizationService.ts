import { buildOrganizationPayload, type OrganizationState } from "../lib/artworkOrganization";
import { supabase } from "../lib/supabaseClient";
import type { EditableCollection } from "./editableContentService";

export function getArtworkOrganizationErrorMessage(error: unknown): string {
  const failure = error && typeof error === "object" ? error as { code?: string; message?: string } : {};
  const message = failure.message ?? (typeof error === "string" ? error : "");
  if (/ARTWORK_BRANCH_MISMATCH|COLLECTION_BRANCH_IMMUTABLE/i.test(message)) {
    return "No se pueden mover obras entre Lienzos y Obra en papel. Elige una colección de la misma sección.";
  }
  if (/RECENT_COLLECTION_PROTECTED/i.test(message)) {
    return "Obras recientes es una colección permanente. Puedes mostrarla u ocultarla y organizar sus obras, pero no eliminarla ni cambiar su nombre o sección.";
  }
  if (failure.code === "40001" || /ORGANIZATION_CONFLICT/i.test(message)) {
    return "El catálogo ha cambiado desde que lo abriste. Tus cambios no se han guardado. Recarga el catálogo y vuelve a organizarlos.";
  }
  if (failure.code === "PGRST202" || /reorganize_artworks.*(schema cache|does not exist)|schema cache.*reorganize_artworks/i.test(message)) {
    return "Falta activar el organizador en Supabase. Aplica la migración 20260912144544_artwork_organization.sql y vuelve a intentarlo. No se ha modificado ninguna obra.";
  }
  if (failure.code === "42501" || failure.code === "PGRST301" || /permission denied|not authorized|row-level security|JWT.*expired/i.test(message)) {
    return "Tu sesión no tiene permisos para organizar obras. Vuelve a entrar con una cuenta administradora.";
  }
  if (["40P01", "55P03", "57014"].includes(failure.code ?? "")) {
    return "Otra edición está utilizando estas colecciones. No se han guardado cambios; vuelve a intentarlo en unos segundos.";
  }
  if (["22023", "22P02", "23505"].includes(failure.code ?? "")) {
    return "No se pudo validar la organización. No se ha modificado ninguna obra. Recarga el catálogo y vuelve a intentarlo.";
  }
  if (/fetch|network|connection|timeout|conexión/i.test(message)) {
    return "No se ha podido confirmar el guardado. Comprueba la conexión y recarga el catálogo antes de volver a intentarlo; tus cambios siguen en este borrador.";
  }
  return message || "No se pudo guardar la organización. Tu borrador se mantiene para que puedas volver a intentarlo.";
}

export async function saveArtworkOrganization(collections: EditableCollection[], next: OrganizationState): Promise<void> {
  if (!supabase) throw new Error("La conexión con Supabase no está configurada.");
  const payload = buildOrganizationPayload(collections, next);
  if (payload.next_state.length === 0) return;
  const { error } = await supabase.rpc("reorganize_artworks", payload);
  if (error) throw error;
}
