import { useState, type FormEvent } from "react";
import { ArrowRight, LayoutGrid, LoaderCircle, Save } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { languageOptions, useSitePreferences, type SiteLanguage } from "../../app/sitePreferences";
import { buildSiteGradient, isHexColor, normalizeGradientSettings } from "../../lib/siteGradient";
import { getEditableOperationErrorMessage } from "../../services/editableContentService";
import { updateSiteSettings } from "../../services/siteSettingsService";
import { defaultSiteSettings, type SiteGradientSettings } from "../../types/siteSettings";
import { AdminDialog, FormMessage } from "./AdminUi";

export function SiteSettingsDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { contactSettings, defaultLanguage, gradientSettings, refreshSiteSettings } = useSitePreferences();
  const [email, setEmail] = useState(contactSettings.email);
  const [instagramHandle, setInstagramHandle] = useState(contactSettings.instagramHandle);
  const [instagramUsername, setInstagramUsername] = useState(contactSettings.instagramUsername);
  const [phoneDisplay, setPhoneDisplay] = useState(contactSettings.phoneDisplay);
  const [phoneNumber, setPhoneNumber] = useState(contactSettings.phoneNumber);
  const [selectedDefaultLanguage, setSelectedDefaultLanguage] = useState<SiteLanguage>(defaultLanguage);
  const [gradientDraft, setGradientDraft] = useState<SiteGradientSettings>({ ...gradientSettings });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOpeningOrganizer, setIsOpeningOrganizer] = useState(false);
  const hasSettingsChanges = email !== contactSettings.email || instagramHandle !== contactSettings.instagramHandle
    || instagramUsername !== contactSettings.instagramUsername || phoneDisplay !== contactSettings.phoneDisplay
    || phoneNumber !== contactSettings.phoneNumber || selectedDefaultLanguage !== defaultLanguage
    || gradientDraft.startColor !== gradientSettings.startColor || gradientDraft.endColor !== gradientSettings.endColor;
  const previewGradient = normalizeGradientSettings(gradientDraft);
  const gradientFields = [
    { key: "startColor", label: "Color inicial", pickerLabel: "Elegir color inicial" },
    { key: "endColor", label: "Color final", pickerLabel: "Elegir color final" },
  ] as const;

  function openOrganizer() {
    onClose();
    navigate("/admin/contenido", { state: { returnTo: location.pathname + location.search } });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    if (!isHexColor(gradientDraft.startColor) || !isHexColor(gradientDraft.endColor)) {
      setError("Escribe ambos colores en formato HEX de seis dígitos, por ejemplo #d4d0c3.");
      return;
    }
    setError(null);
    setIsSubmitting(true);

    try {
      const savedSettings = await updateSiteSettings({
        contact: { email, instagramHandle, instagramUsername, phoneDisplay, phoneNumber },
        defaultLanguage: selectedDefaultLanguage,
        gradient: normalizeGradientSettings(gradientDraft),
      });
      await refreshSiteSettings(savedSettings);
      onClose();
    } catch (submitError) {
      setError(getEditableOperationErrorMessage(submitError, "No se pudo guardar la configuración de la web."));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isOpeningOrganizer) {
    return (
      <AdminDialog title="Configuración sin guardar" onClose={() => setIsOpeningOrganizer(false)}>
        <div className="admin-dialog__body">
          <p>Has cambiado la configuración. Vuelve para guardarla, o descarta esos cambios antes de abrir el gestor de contenido.</p>
          <div className="admin-dialog__actions">
            <button type="button" className="admin-secondary-button" onClick={() => setIsOpeningOrganizer(false)}>Volver a configuración</button>
            <button type="button" className="admin-primary-button" onClick={openOrganizer}>Descartar y abrir gestor</button>
          </div>
        </div>
      </AdminDialog>
    );
  }

  return (
    <AdminDialog title="Configuración general" onClose={isSubmitting ? () => undefined : onClose} className="admin-dialog--wide">
      <div className="site-organizer-entry">
        <LayoutGrid aria-hidden="true" />
        <div>
          <strong>Gestor de contenido</strong>
          <p>Administra las colecciones de Lienzos y Obra en papel: imágenes, fichas, orden, visibilidad y disponibilidad.</p>
        </div>
        <button type="button" className="admin-secondary-button" disabled={isSubmitting} onClick={() => hasSettingsChanges ? setIsOpeningOrganizer(true) : openOrganizer()}>
          Administrar contenido <ArrowRight aria-hidden="true" />
        </button>
      </div>
      <form className="admin-form admin-form--dialog admin-form--grid" onSubmit={handleSubmit}>
        <label className="admin-form__wide">
          Idioma predeterminado para nuevos visitantes
          <select value={selectedDefaultLanguage} disabled={isSubmitting} onChange={(event) => setSelectedDefaultLanguage(event.target.value as SiteLanguage)}>
            {languageOptions.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
          </select>
          <small>Los visitantes que ya hayan elegido un idioma conservarán su preferencia.</small>
        </label>
        <label>
          Correo destinatario
          <input type="email" value={email} disabled={isSubmitting} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>
          Usuario de Instagram
          <input value={instagramUsername} disabled={isSubmitting} onChange={(event) => setInstagramUsername(event.target.value)} placeholder="tonicrespo.art" required />
        </label>
        <label>
          Nombre visible de Instagram
          <input value={instagramHandle} disabled={isSubmitting} onChange={(event) => setInstagramHandle(event.target.value)} placeholder="@tonicrespo.art" required />
        </label>
        <label>
          Teléfono para enlaces (con prefijo)
          <input inputMode="tel" value={phoneNumber} disabled={isSubmitting} onChange={(event) => setPhoneNumber(event.target.value)} placeholder="34659959352" required />
        </label>
        <label className="admin-form__wide">
          Teléfono visible
          <input inputMode="tel" value={phoneDisplay} disabled={isSubmitting} onChange={(event) => setPhoneDisplay(event.target.value)} placeholder="+34 659 959 352" required />
        </label>
        <fieldset className="site-gradient-fields admin-form__wide" disabled={isSubmitting}>
          <legend>Fondo de la web</legend>
          <p id="site-gradient-help">Elige el color del inicio y del final del degradado. También puedes escribir su código HEX, por ejemplo #d4d0c3.</p>
          <div className="site-gradient-colors">
            {gradientFields.map(({ key, label, pickerLabel }) => (
              <div className="site-gradient-control" key={key}>
                <label htmlFor={`site-gradient-${key}`}>{label}</label>
                <div className="site-gradient-inputs">
                  <input
                    type="color"
                    aria-label={pickerLabel}
                    aria-describedby="site-gradient-help"
                    value={previewGradient[key]}
                    onChange={(event) => setGradientDraft((current) => ({ ...current, [key]: event.target.value }))}
                  />
                  <input
                    id={`site-gradient-${key}`}
                    type="text"
                    value={gradientDraft[key]}
                    pattern="#[0-9a-fA-F]{6}"
                    title="Escribe # seguido de seis dígitos hexadecimales, por ejemplo #d4d0c3."
                    aria-describedby="site-gradient-help"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    onChange={(event) => setGradientDraft((current) => ({ ...current, [key]: event.target.value }))}
                    onInvalid={() => setError("Escribe ambos colores en formato HEX de seis dígitos, por ejemplo #d4d0c3.")}
                  />
                </div>
              </div>
            ))}
          </div>
          <div
            className="site-gradient-preview"
            role="img"
            aria-label="Vista previa del fondo"
            style={{ background: buildSiteGradient(previewGradient), color: "#171717" }}
          >
            <strong>Toni Crespo</strong>
            <span>Así se verá el texto sobre el fondo.</span>
          </div>
          <p>Elige colores que permitan leer bien el texto oscuro. Esta vista previa no cambia la web hasta que guardes la configuración.</p>
          <button
            type="button"
            className="admin-secondary-button"
            onClick={() => setGradientDraft({ ...defaultSiteSettings.gradient })}
          >
            Restaurar colores originales
          </button>
        </fieldset>
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
