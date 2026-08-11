import { useEffect, useRef, useState, type ReactNode } from "react";
import { Mail } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useAdminSession } from "../../app/adminSession";
import { languageOptions, useSitePreferences, type SiteTheme } from "../../app/sitePreferences";
import toniCrespoLogo from "../../assets/toni_crespo_logo_vector.svg";
import { artistContact } from "../../lib/contact";
import { useContactDialog } from "../contact/ContactDialogProvider";

const HEADER_HIDE_OFFSET = 48;
const SOCIAL_LINKS = [
  {
    href: artistContact.instagramProfileUrl,
    label: "Instagram",
    social: "instagram",
    Icon: InstagramIcon,
  },
  {
    href: artistContact.whatsappUrl,
    label: "WhatsApp",
    social: "whatsapp",
    Icon: WhatsAppIcon,
  },
] as const;

export function Header() {
  const { labels, language, setLanguage, setTheme, theme } = useSitePreferences();
  const { isAdmin, isEditMode, requestEditing, setEditMode } = useAdminSession();
  const { openEmailComposer } = useContactDialog();
  const location = useLocation();
  const lastScrollY = useRef(0);
  const settingsRef = useRef<HTMLLIElement | null>(null);
  const [isHidden, setIsHidden] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const links = [
    { label: labels.nav.work, path: "/obra" },
    { label: labels.nav.photography, path: "/fotografia" },
    { label: labels.nav.news, path: "/noticias" },
    { label: labels.nav.biography, path: "/trayectoria" },
  ];

  useEffect(() => {
    lastScrollY.current = window.scrollY;

    function handleScroll() {
      const currentScrollY = window.scrollY;
      const scrollDelta = currentScrollY - lastScrollY.current;

      if (currentScrollY < HEADER_HIDE_OFFSET) {
        setIsHidden(false);
      } else if (scrollDelta > 8) {
        setIsHidden(true);
      } else if (scrollDelta < -8) {
        setIsHidden(false);
      }

      lastScrollY.current = currentScrollY;
    }

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    lastScrollY.current = window.scrollY;
    setIsHidden(false);
    setIsSettingsOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isSettingsOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!settingsRef.current?.contains(event.target as Node)) {
        setIsSettingsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsSettingsOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSettingsOpen]);

  return (
    <header className={`site-header${isHidden && !isSettingsOpen ? " site-header--hidden" : ""}`}>
      <NavLink to="/" className="brand" aria-label="Toni Crespo inicio">
        <img src={toniCrespoLogo} alt="Toni Crespo" />
      </NavLink>
      <nav className="main-nav" aria-label={labels.aria.mainNav}>
        {links.map((link) => (
          <NavLink
            key={link.path}
            to={link.path}
            className={({ isActive }) => (isActive || isSectionActive(link.path, location.pathname) ? "active" : undefined)}
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
      <ul className="header-socials" aria-label={labels.aria.socials}>
        {SOCIAL_LINKS.map(({ href, label, social, Icon }) => (
          <li key={social} className="header-socials__item">
            <a href={href} target="_blank" rel="noreferrer" data-social={social} aria-label={label}>
              <span className="filled" />
              <Icon />
            </a>
          </li>
        ))}
        <li className="header-socials__item">
          <button
            type="button"
            className="header-contact-trigger"
            data-social="email"
            aria-label={labels.contact.emailButton}
            title={labels.contact.emailButton}
            onClick={() => openEmailComposer()}
          >
            <span className="filled" />
            <Mail aria-hidden="true" />
          </button>
        </li>
        <li className="header-socials__item header-settings" ref={settingsRef}>
          <button
            type="button"
            className="header-settings__trigger"
            data-social="settings"
            aria-label={labels.settings.open}
            aria-expanded={isSettingsOpen}
            aria-haspopup="dialog"
            onClick={() => setIsSettingsOpen((current) => !current)}
          >
            <span className="filled" />
            <SettingsIcon />
          </button>
          {isSettingsOpen ? (
            <div className="settings-panel" role="dialog" aria-label={labels.settings.title}>
              <div className="settings-panel__header">
                <h2>{labels.settings.title}</h2>
              </div>
              <PreferenceGroup label={labels.settings.language} ariaLabel={labels.aria.language}>
                {languageOptions.map((option) => (
                  <button
                    key={option.code}
                    type="button"
                    className={`settings-choice${language === option.code ? " is-active" : ""}`}
                    aria-pressed={language === option.code}
                    onClick={() => setLanguage(option.code)}
                  >
                    <span>{option.shortLabel}</span>
                    <strong>{option.label}</strong>
                  </button>
                ))}
              </PreferenceGroup>
              <PreferenceGroup label={labels.settings.appearance} ariaLabel={labels.aria.theme}>
                <ThemeChoice
                  label={labels.settings.light}
                  mode="light"
                  selectedTheme={theme}
                  onSelect={setTheme}
                />
                <ThemeChoice label={labels.settings.dark} mode="dark" selectedTheme={theme} onSelect={setTheme} />
              </PreferenceGroup>
              <div className="settings-panel__editor">
                <button
                  type="button"
                  className={isEditMode ? "is-active" : undefined}
                  onClick={() => {
                    if (isAdmin && isEditMode) {
                      setEditMode(false);
                    } else {
                      requestEditing();
                    }
                    setIsSettingsOpen(false);
                  }}
                >
                  <EditorSettingsIcon />
                  <span>{labels.settings.editor}</span>
                  <small>{isEditMode ? "Activo" : labels.settings.editorHint}</small>
                </button>
              </div>
            </div>
          ) : null}
        </li>
      </ul>
    </header>
  );
}

function PreferenceGroup({ ariaLabel, children, label }: { ariaLabel: string; children: ReactNode; label: string }) {
  return (
    <div className="settings-panel__group">
      <span className="settings-panel__label">{label}</span>
      <div className="settings-panel__choices" aria-label={ariaLabel}>
        {children}
      </div>
    </div>
  );
}

function ThemeChoice({
  label,
  mode,
  onSelect,
  selectedTheme,
}: {
  label: string;
  mode: SiteTheme;
  onSelect: (theme: SiteTheme) => void;
  selectedTheme: SiteTheme;
}) {
  return (
    <button
      type="button"
      className={`settings-choice settings-choice--theme${selectedTheme === mode ? " is-active" : ""}`}
      aria-pressed={selectedTheme === mode}
      onClick={() => onSelect(mode)}
    >
      <span className={`settings-choice__swatch settings-choice__swatch--${mode}`} />
      <strong>{label}</strong>
    </button>
  );
}

function isSectionActive(path: string, pathname: string) {
  if (path === "/obra") {
    return pathname.startsWith("/obra") || pathname.startsWith("/lienzos") || pathname.startsWith("/laminas");
  }

  return false;
}

function InstagramIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <rect x="4" y="4" width="16" height="16" rx="4.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17" cy="7" r="1.1" fill="currentColor" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path
        d="M9.4 4.1 10 2.7h4l.6 1.4c.2.5.7.8 1.2 1l1.5-.6 2.8 2.8-.6 1.5c.2.5.5 1 .9 1.2l1.6.6v4l-1.6.6c-.4.2-.7.7-.9 1.2l.6 1.5-2.8 2.8-1.5-.6c-.5.2-1 .5-1.2 1l-.6 1.4h-4l-.6-1.4c-.2-.5-.7-.8-1.2-1l-1.5.6-2.8-2.8.6-1.5c-.2-.5-.5-1-.9-1.2L2 14.6v-4l1.6-.6c.4-.2.7-.7.9-1.2l-.6-1.5 2.8-2.8 1.5.6c.5-.2 1-.5 1.2-1Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.55"
      />
      <circle cx="12" cy="12.6" r="3.1" fill="none" stroke="currentColor" strokeWidth="1.55" />
    </svg>
  );
}

function EditorSettingsIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="M4 19.5h16" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
      <path
        d="m13.8 5.2 3 3L9.5 15.5l-3.4.7.7-3.4 7-7Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path
        d="M5.2 19.4l1.1-3.4a7.5 7.5 0 1 1 3 2.8l-4.1.6Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M9.2 8.7c.2-.4.4-.5.8-.5h.5c.2 0 .4.1.5.4l.7 1.7c.1.3.1.5-.1.7l-.5.6c.6 1.1 1.5 2 2.7 2.6l.7-.5c.2-.2.5-.2.8-.1l1.6.7c.3.1.4.3.4.6v.4c0 .5-.2.8-.6 1a3.2 3.2 0 0 1-1.7.4c-3.1 0-6.9-3.4-6.9-6.8 0-.5.2-.9.5-1.2Z"
        fill="currentColor"
      />
    </svg>
  );
}
