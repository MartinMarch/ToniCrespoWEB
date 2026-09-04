import { useState, type FormEvent } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { languageOptions, useSitePreferences, type SiteLanguage } from "../../app/sitePreferences";
import { getEditableOperationErrorMessage } from "../../services/editableContentService";
import { updateSiteSettings } from "../../services/siteSettingsService";
import { AdminDialog, FormMessage } from "./AdminUi";

export function SiteSettingsDialog({ onClose }: { onClose: () => void }) {
  const { contactSettings, defaultLanguage, refreshSiteSettings } = useSitePreferences();
  const [email, setEmail] = useState(contactSettings.email);
  const [instagramHandle, setInstagramHandle] = useState(contactSettings.instagramHandle);
  const [instagramUsername, setInstagramUsername] = useState(contactSettings.instagramUsername);
  const [phoneDisplay, setPhoneDisplay] = useState(contactSettings.phoneDisplay);
  const [phoneNumber, setPhoneNumber] = useState(contactSettings.phoneNumber);
  const [selectedDefaultLanguage, setSelectedDefaultLanguage] = useState<SiteLanguage>(defaultLanguage);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await updateSiteSettings({
        contact: { email, instagramHandle, instagramUsername, phoneDisplay, phoneNumber },
        defaultLanguage: selectedDefaultLanguage,
      });
      await refreshSiteSettings();
      onClose();
    } catch (submitError) {
      setError(getEditableOperationErrorMessage(submitError, "No se pudo guardar la configuración de la web."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AdminDialog title="Configuración general" onClose={isSubmitting ? () => undefined : onClose} className="admin-dialog--wide">
      <form className="admin-form admin-form--dialog admin-form--grid" onSubmit={handleSubmit}>
        <label className="admin-form__wide">
          Idioma predeterminado para nuevos visitantes
          <select value={selectedDefaultLanguage} onChange={(event) => setSelectedDefaultLanguage(event.target.value as SiteLanguage)}>
            {languageOptions.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
          </select>
          <small>Los visitantes que ya hayan elegido un idioma conservarán su preferencia.</small>
        </label>
        <label>
          Correo destinatario
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>
          Usuario de Instagram
          <input value={instagramUsername} onChange={(event) => setInstagramUsername(event.target.value)} placeholder="tonicrespo.art" required />
        </label>
        <label>
          Nombre visible de Instagram
          <input value={instagramHandle} onChange={(event) => setInstagramHandle(event.target.value)} placeholder="@tonicrespo.art" required />
        </label>
        <label>
          Teléfono para enlaces (con prefijo)
          <input inputMode="tel" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} placeholder="34659959352" required />
        </label>
        <label className="admin-form__wide">
          Teléfono visible
          <input inputMode="tel" value={phoneDisplay} onChange={(event) => setPhoneDisplay(event.target.value)} placeholder="+34 659 959 352" required />
        </label>
        <FormMessage error={error} />
        <div className="admin-dialog__actions admin-form__wide">
          <button type="button" className="admin-secondary-button" disabled={isSubmitting} onClick={onClose}>Cancelar</button>
          <button type="submit" className="admin-primary-button" disabled={isSubmitting}>
            {isSubmitting ? <LoaderCircle className="admin-button-spinner" aria-hidden="true" /> : <Save aria-hidden="true" />}
            {isSubmitting ? "Guardando..." : "Guardar configuración"}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}
