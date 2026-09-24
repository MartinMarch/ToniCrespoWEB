import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Mail, Menu, Star, X } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useAdminSession } from "../../app/adminSession";
import { languageOptions, useSitePreferences, type SiteLanguage } from "../../app/sitePreferences";
import { getContactLinks } from "../../lib/contact";
import { getEditableOperationErrorMessage } from "../../services/editableContentService";
import { updateSiteSettings } from "../../services/siteSettingsService";
import { ToniCrespoLogo } from "./ToniCrespoLogo";

const HEADER_HIDE_OFFSET = 48;

export function Header() {
  const { isEditMode } = useAdminSession();
  const { contactSettings, defaultLanguage, gradientSettings, labels, language, refreshSiteSettings, setLanguage } = useSitePreferences();
  const contactLinks = getContactLinks(contactSettings);
  const location = useLocation();
  const headerRef = useRef<HTMLElement | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const mobilePanelRef = useRef<HTMLDivElement | null>(null);
  const lastHeaderFocusRef = useRef<Element | null>(null);
  const languageTriggerRef = useRef<HTMLButtonElement | null>(null);
  const languageMenuRef = useRef<HTMLDivElement | null>(null);
  const languageFocusTargetRef = useRef<"active" | "first" | "last">("active");
  const lastScrollY = useRef(0);
  const [isHidden, setIsHidden] = useState(false);
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isSavingDefault, setIsSavingDefault] = useState(false);
  const [defaultLanguageError, setDefaultLanguageError] = useState<string | null>(null);
  const currentLanguageLabel = languageOptions.find((option) => option.code === language)?.label ?? language;
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
    const mobileViewport = window.matchMedia("(max-width: 820px)");
    function rememberHeaderFocus(event: FocusEvent) {
      lastHeaderFocusRef.current = event.target instanceof Element && headerRef.current?.contains(event.target)
        ? event.target : null;
    }
    function forgetOutsidePointerFocus(event: PointerEvent) {
      if (!headerRef.current?.contains(event.target as Node)) lastHeaderFocusRef.current = null;
    }
    function handleBreakpointChange() {
      // CSS can hide a focused control before the media-query event fires.
      // Recover that control only if focus fell to BODY, not after the user left the header.
      const previous = lastHeaderFocusRef.current;
      const focused = document.activeElement === document.body && previous && !previous.getClientRects().length
        ? previous : document.activeElement;
      if (languageMenuRef.current?.contains(focused)) languageTriggerRef.current?.focus();
      else if (mobileViewport.matches && (mobilePanelRef.current?.contains(focused)
        || (headerRef.current?.contains(focused) && focused?.closest(".header-socials__item--social, .header-socials__item--email")))) {
        menuTriggerRef.current?.focus();
      } else if (!mobileViewport.matches && (focused === menuTriggerRef.current
        || mobilePanelRef.current?.querySelector(".header-mobile-shortcuts")?.contains(focused))) {
        headerRef.current?.querySelector<HTMLAnchorElement>(".brand")?.focus();
      }
      setIsMenuOpen(false);
      setIsLanguageOpen(false);
      setIsHidden(false);
    }
    window.addEventListener("focusin", rememberHeaderFocus);
    window.addEventListener("pointerdown", forgetOutsidePointerFocus);
    mobileViewport.addEventListener("change", handleBreakpointChange);
    return () => {
      window.removeEventListener("focusin", rememberHeaderFocus);
      window.removeEventListener("pointerdown", forgetOutsidePointerFocus);
      mobileViewport.removeEventListener("change", handleBreakpointChange);
    };
  }, []);

  useEffect(() => {
    if (!isLanguageOpen && !isMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      // A non-focusable part of the header is outside the language selector too.
      if (!languageTriggerRef.current?.parentElement?.contains(event.target as Node)) setIsLanguageOpen(false);
      if (!headerRef.current?.contains(event.target as Node)) {
        setIsLanguageOpen(false);
        setIsMenuOpen(false);
      }
    }

    function handleFocusIn(event: FocusEvent) {
      if (!languageTriggerRef.current?.parentElement?.contains(event.target as Node)) setIsLanguageOpen(false);
      if (!headerRef.current?.contains(event.target as Node)) setIsMenuOpen(false);
    }

    function handleWindowBlur() {
      setIsLanguageOpen(false);
      setIsMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (isLanguageOpen) languageTriggerRef.current?.focus();
        else if (isMenuOpen) menuTriggerRef.current?.focus();
        setIsLanguageOpen(false);
        setIsMenuOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("focusin", handleFocusIn);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isLanguageOpen, isMenuOpen]);

  useEffect(() => {
    if (!isLanguageOpen) return;
    const frame = requestAnimationFrame(() => {
      const options = languageMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]');
      if (!options?.length) return;
      const active = languageMenuRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]');
      const target = languageFocusTargetRef.current;
      (target === "first" ? options[0] : target === "last" ? options[options.length - 1] : active ?? options[0]).focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [isLanguageOpen]);

  function handleLanguageMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const options = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    if (!options.length) return;
    const current = options.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
      : (current + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
    options[next].focus();
  }

  function selectLanguage(nextLanguage: SiteLanguage) {
    setLanguage(nextLanguage);
    setIsLanguageOpen(false);
    languageTriggerRef.current?.focus();
  }

  async function selectDefaultLanguage(nextLanguage: SiteLanguage) {
    setDefaultLanguageError(null);
    setIsSavingDefault(true);
    try {
      const savedSettings = await updateSiteSettings({ contact: contactSettings, defaultLanguage: nextLanguage, gradient: gradientSettings });
      await refreshSiteSettings(savedSettings);
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
      onBlur={(event) => {
        // Safari may blur a button to null before dispatching a tap's click.
        // Only a known outside focus target proves that the user left the header.
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) {
          setIsMenuOpen(false);
          setIsLanguageOpen(false);
        }
      }}
    >
      <button
        ref={menuTriggerRef}
        type="button"
        className="header-menu-trigger"
        aria-label={isMenuOpen ? labels.aria.closeMenu : labels.aria.openMenu}
        aria-controls="site-header-panel"
        aria-expanded={isMenuOpen}
        onClick={() => {
          setIsLanguageOpen(false);
          setIsMenuOpen((current) => !current);
        }}
      >
        {isMenuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
      </button>

      <NavLink to="/" className="brand" aria-label="Toni Crespo inicio">
        <ToniCrespoLogo />
      </NavLink>

      <div ref={mobilePanelRef} className="header-mobile-panel" id="site-header-panel">
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
          <a className="header-mobile-shortcut" href={contactLinks.emailUrl}>
            <Mail aria-hidden="true" />
            <span>{labels.contact.viaEmail}</span>
          </a>
        </div>
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
          <a
            href={contactLinks.emailUrl}
            className="header-contact-trigger"
            data-social="email"
            aria-label={labels.contact.emailButton}
            title={labels.contact.emailButton}
          >
            <span className="filled" />
            <Mail aria-hidden="true" />
          </a>
        </li>
        <li
          className="header-socials__item header-language"
          onBlur={(event) => {
            if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setIsLanguageOpen(false);
          }}
        >
          <button
            ref={languageTriggerRef}
            type="button"
            className="header-language__trigger"
            aria-label={`${labels.aria.language}: ${currentLanguageLabel}`}
            title={`${labels.aria.language}: ${currentLanguageLabel}`}
            aria-controls="header-language-menu"
            aria-expanded={isLanguageOpen}
            aria-haspopup="menu"
            onKeyDown={(event) => {
              if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
              event.preventDefault();
              languageFocusTargetRef.current = event.key === "ArrowDown" ? "first" : "last";
              setIsMenuOpen(false);
              setIsLanguageOpen(true);
            }}
            onClick={() => {
              languageFocusTargetRef.current = "active";
              setIsMenuOpen(false);
              setIsLanguageOpen((current) => !current);
            }}
          >
            <LanguageFlag language={language} />
          </button>
          {isLanguageOpen ? (
            <div ref={languageMenuRef} id="header-language-menu" className="language-menu" role="menu" aria-label={labels.aria.language} onKeyDown={handleLanguageMenuKeyDown}>
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
                      role="menuitem"
                      className={`language-menu__default${defaultLanguage === option.code ? " is-active" : ""}`}
                      aria-label={`Usar ${option.label} como idioma predeterminado`}
                      title={defaultLanguage === option.code ? "Idioma predeterminado" : "Establecer como predeterminado"}
                      disabled={isSavingDefault || defaultLanguage === option.code}
                      onClick={(event) => {
                        // Disabling the focused star can blur it to the document
                        // in Chromium. Keep focus inside the open language menu.
                        event.currentTarget.parentElement
                          ?.querySelector<HTMLButtonElement>('[role="menuitemradio"]')
                          ?.focus();
                        void selectDefaultLanguage(option.code);
                      }}
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
      </ul>
    </header>
  );
}

export function LanguageFlag({ language }: { language: SiteLanguage }) {
  return (
    <svg className={`language-flag language-flag--${language}`} viewBox="0 0 36 36" aria-hidden="true" focusable="false">
      {language === "ca" ? <>
        <path fill="#f6ce35" d="M0 0h36v36H0z" />
        <path fill="#c72b32" d="M0 4h36v4H0zm0 8h36v4H0zm0 8h36v4H0zm0 8h36v4H0z" />
      </> : null}
      {language === "es" ? <>
        <path fill="#aa151b" d="M0 0h36v36H0z" />
        <path fill="#f1bf00" d="M0 9h36v18H0z" />
      </> : null}
      {language === "de" ? <>
        <path fill="#171717" d="M0 0h36v12H0z" />
        <path fill="#d32630" d="M0 12h36v12H0z" />
        <path fill="#f6c945" d="M0 24h36v12H0z" />
      </> : null}
      {language === "en" ? <>
        <path fill="#012169" d="M0 0h36v36H0z" />
        <path stroke="#ffffff" strokeWidth="8" d="m0 0 36 36m0-36L0 36" />
        <path fill="#c8102e" d="M0 0h3l15 15v3zm36 0v3L21 18h-3zm0 36h-3L18 21v-3zM0 36v-3l15-15h3z" />
        <path stroke="#ffffff" strokeWidth="12" d="M18 0v36M0 18h36" />
        <path stroke="#c8102e" strokeWidth="7" d="M18 0v36M0 18h36" />
      </> : null}
    </svg>
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
