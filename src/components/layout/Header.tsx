import { useEffect, useRef, useState } from "react";
import { ChevronDown, Mail, Menu, Star, X } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useAdminSession } from "../../app/adminSession";
import { languageOptions, useSitePreferences, type SiteLanguage } from "../../app/sitePreferences";
import { getContactLinks } from "../../lib/contact";
import { getEditableOperationErrorMessage } from "../../services/editableContentService";
import { updateSiteSettings } from "../../services/siteSettingsService";
import { useContactDialog } from "../contact/ContactDialogProvider";
import { ToniCrespoLogo } from "./ToniCrespoLogo";

const HEADER_HIDE_OFFSET = 48;

export function Header() {
  const { isEditMode } = useAdminSession();
  const { contactSettings, defaultLanguage, labels, language, refreshSiteSettings, setLanguage } = useSitePreferences();
  const { openEmailComposer } = useContactDialog();
  const contactLinks = getContactLinks(contactSettings);
  const location = useLocation();
  const headerRef = useRef<HTMLElement | null>(null);
  const lastScrollY = useRef(0);
  const [isHidden, setIsHidden] = useState(false);
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isSavingDefault, setIsSavingDefault] = useState(false);
  const [defaultLanguageError, setDefaultLanguageError] = useState<string | null>(null);
  const links = [
    { label: labels.nav.work, path: "/obra" },
    { label: labels.nav.photography, path: "/fotografia" },
    { label: labels.nav.news, path: "/noticias" },
    { label: labels.nav.biography, path: "/trayectoria" },
  ];
  const socials = [
    { href: contactLinks.instagramProfileUrl, label: "Instagram", social: "instagram", Icon: InstagramIcon },
    { href: contactLinks.whatsappUrl, label: "WhatsApp", social: "whatsapp", Icon: WhatsAppIcon },
  ] as const;

  useEffect(() => {
    lastScrollY.current = window.scrollY;
    setIsScrolled(window.scrollY > 8);

    function handleScroll() {
      const currentScrollY = window.scrollY;
      const scrollDelta = currentScrollY - lastScrollY.current;

      setIsScrolled(currentScrollY > 8);
      if (currentScrollY < HEADER_HIDE_OFFSET) setIsHidden(false);
      else if (scrollDelta > 8) setIsHidden(true);
      else if (scrollDelta < -8) setIsHidden(false);

      lastScrollY.current = currentScrollY;
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    lastScrollY.current = window.scrollY;
    setIsHidden(false);
    setIsLanguageOpen(false);
    setIsMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isLanguageOpen && !isMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!headerRef.current?.contains(event.target as Node)) {
        setIsLanguageOpen(false);
        setIsMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsLanguageOpen(false);
        setIsMenuOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isLanguageOpen, isMenuOpen]);

  function selectLanguage(nextLanguage: SiteLanguage) {
    setLanguage(nextLanguage);
    setIsLanguageOpen(false);
  }

  async function selectDefaultLanguage(nextLanguage: SiteLanguage) {
    setDefaultLanguageError(null);
    setIsSavingDefault(true);
    try {
      await updateSiteSettings({ contact: contactSettings, defaultLanguage: nextLanguage });
      await refreshSiteSettings();
    } catch (error) {
      setDefaultLanguageError(getEditableOperationErrorMessage(error, "No se pudo actualizar el idioma predeterminado."));
    } finally {
      setIsSavingDefault(false);
    }
  }

  return (
    <header
      ref={headerRef}
      className={`site-header${isScrolled ? " site-header--scrolled" : " site-header--top"}${
        isHidden && !isMenuOpen && !isLanguageOpen ? " site-header--hidden" : ""
      }${isMenuOpen ? " site-header--menu-open" : ""}`}
    >
      <NavLink to="/" className="brand" aria-label="Toni Crespo inicio">
        <ToniCrespoLogo />
      </NavLink>

      <nav className="main-nav" aria-label={labels.aria.mainNav} id="site-header-navigation">
        {links.map((link) => (
          <NavLink
            key={link.path}
            to={link.path}
            onClick={() => setIsMenuOpen(false)}
            className={({ isActive }) => (isActive || isSectionActive(link.path, location.pathname) ? "active" : undefined)}
          >
            {link.label}
          </NavLink>
        ))}
      </nav>

      <div className="header-mobile-shortcuts" aria-label={labels.aria.socials}>
        {socials.map(({ href, label, social, Icon }) => (
          <a key={social} href={href} target="_blank" rel="noreferrer" className="header-mobile-shortcut">
            <Icon />
            <span>{label}</span>
          </a>
        ))}
        <button type="button" className="header-mobile-shortcut" onClick={() => openEmailComposer()}>
          <Mail aria-hidden="true" />
          <span>{labels.contact.viaEmail}</span>
        </button>
      </div>

      <ul className="header-socials" aria-label={labels.aria.socials}>
        {socials.map(({ href, label, social, Icon }) => (
          <li key={social} className="header-socials__item header-socials__item--social">
            <a href={href} target="_blank" rel="noreferrer" data-social={social} aria-label={label}>
              <span className="filled" />
              <Icon />
            </a>
          </li>
        ))}
        <li className="header-socials__item header-socials__item--email">
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
        <li className="header-socials__item header-language">
          <button
            type="button"
            className="header-language__trigger"
            aria-label={labels.aria.language}
            aria-expanded={isLanguageOpen}
            aria-haspopup="menu"
            onClick={() => {
              setIsMenuOpen(false);
              setIsLanguageOpen((current) => !current);
            }}
          >
            <LanguageFlag language={language} />
            <ChevronDown aria-hidden="true" />
          </button>
          {isLanguageOpen ? (
            <div className="language-menu" role="menu" aria-label={labels.aria.language}>
              {languageOptions.map((option) => (
                <div className="language-menu__option" role="none" key={option.code}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={language === option.code}
                    className={language === option.code ? "is-active" : undefined}
                    onClick={() => selectLanguage(option.code)}
                  >
                    <LanguageFlag language={option.code} />
                    <span>{option.label}</span>
                  </button>
                  {isEditMode ? (
                    <button
                      type="button"
                      className={`language-menu__default${defaultLanguage === option.code ? " is-active" : ""}`}
                      aria-label={`Usar ${option.label} como idioma predeterminado`}
                      title={defaultLanguage === option.code ? "Idioma predeterminado" : "Establecer como predeterminado"}
                      disabled={isSavingDefault || defaultLanguage === option.code}
                      onClick={() => void selectDefaultLanguage(option.code)}
                    >
                      <Star aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              ))}
              {defaultLanguageError ? <p className="language-menu__error" role="alert">{defaultLanguageError}</p> : null}
            </div>
          ) : null}
        </li>
        <li className="header-socials__item header-socials__item--menu">
          <button
            type="button"
            className="header-menu-trigger"
            aria-label={isMenuOpen ? labels.aria.closeMenu : labels.aria.openMenu}
            aria-controls="site-header-navigation"
            aria-expanded={isMenuOpen}
            onClick={() => {
              setIsLanguageOpen(false);
              setIsMenuOpen((current) => !current);
            }}
          >
            {isMenuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </li>
      </ul>
    </header>
  );
}

export function LanguageFlag({ language }: { language: SiteLanguage }) {
  const option = languageOptions.find((candidate) => candidate.code === language);

  return option?.flag ? (
    <span className="language-flag language-flag--emoji" aria-hidden="true">{option.flag}</span>
  ) : (
    <span className="language-flag language-flag--ca" aria-hidden="true" />
  );
}

function isSectionActive(path: string, pathname: string) {
  return path === "/obra" && (pathname.startsWith("/obra") || pathname.startsWith("/lienzos") || pathname.startsWith("/laminas"));
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

function WhatsAppIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path d="M20 11.7a8 8 0 0 1-11.8 7L4 20l1.3-4.1A8 8 0 1 1 20 11.7Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      <path d="M8.2 7.8c.2-.4.4-.4.7-.4h.4c.2 0 .4.1.5.4l.8 1.8c.1.3.1.5-.1.7l-.6.7c-.2.2-.2.4-.1.6.5 1 1.3 1.8 2.3 2.4.2.1.4.1.6-.1l.8-1c.2-.2.4-.3.7-.2l1.9.9c.3.1.4.3.4.6 0 .3-.2 1.3-.8 1.8-.6.5-1.4.8-2.3.6-1.1-.2-2.5-.8-4.1-2.2-1.3-1.2-2.2-2.6-2.5-3.7-.3-1-.1-2 .4-2.6l.4-.4Z" fill="currentColor" />
    </svg>
  );
}
