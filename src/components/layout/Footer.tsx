import { useState } from "react";
import { LogOut, Pencil, Settings2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useAdminSession } from "../../app/adminSession";
import { useSitePreferences } from "../../app/sitePreferences";
import { getContactLinks } from "../../lib/contact";
import { SiteSettingsDialog } from "../admin/SiteSettingsDialog";
import { ToniCrespoLogo } from "./ToniCrespoLogo";

export function Footer() {
  const { contactSettings, labels } = useSitePreferences();
  const { isAdmin, isEditMode, requestEditing, setEditMode, signOut } = useAdminSession();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const contactLinks = getContactLinks(contactSettings);

  return (
    <>
      <footer className="site-footer">
        <div className="site-footer__inner">
          <div className="site-footer__brand-block">
            <Link to="/" className="site-footer__logo" aria-label="Toni Crespo inicio">
              <ToniCrespoLogo />
            </Link>
            <p>{labels.footer.location}</p>
          </div>

          <div className="site-footer__contact">
            <a href={`mailto:${contactSettings.email}`}>{contactSettings.email}</a>
            <a href={contactLinks.telephoneUrl}>{contactSettings.phoneDisplay}</a>
            <a href={contactLinks.instagramProfileUrl} target="_blank" rel="noreferrer">
              {contactSettings.instagramHandle}
            </a>
          </div>
        </div>
        <div className="site-footer__bottom">
          <div className="site-footer__legal">
            <span>© 2026 Toni Crespo</span>
            <span>{labels.footer.baseline}</span>
          </div>
          <div className="site-footer__editor-actions">
            {isAdmin && isEditMode ? (
              <>
                <button type="button" onClick={() => setIsSettingsOpen(true)}>
                  <Settings2 aria-hidden="true" />
                  Configurar web
                </button>
                <button type="button" onClick={() => void signOut()}>
                  <LogOut aria-hidden="true" />
                  Cerrar sesión
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => {
                if (isAdmin && isEditMode) setEditMode(false);
                else requestEditing();
              }}
            >
              <Pencil aria-hidden="true" />
              {isEditMode ? "Salir de edición" : "Edición web"}
            </button>
          </div>
        </div>
      </footer>

      {isSettingsOpen ? <SiteSettingsDialog onClose={() => setIsSettingsOpen(false)} /> : null}
    </>
  );
}
