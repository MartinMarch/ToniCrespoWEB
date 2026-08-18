import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type SiteLanguage = "es" | "en" | "de" | "ca";
export type SiteTheme = "light" | "dark";

export const languageOptions: ReadonlyArray<{ code: SiteLanguage; label: string; shortLabel: string }> = [
  { code: "ca", label: "Català", shortLabel: "CA" },
  { code: "es", label: "Español", shortLabel: "ES" },
  { code: "en", label: "English", shortLabel: "EN" },
  { code: "de", label: "Deutsch", shortLabel: "DE" },
];

const preferenceStorageKeys = {
  language: "toni-crespo-language",
  theme: "toni-crespo-theme",
} as const;

const translations = {
  es: {
    nav: {
      work: "Obra",
      photography: "Fotografía",
      news: "Noticias",
      biography: "Trayectoria",
      contact: "Contacto",
    },
    support: {
      canvas: "Lienzos",
      paper: "Láminas",
    },
    settings: {
      open: "Abrir ajustes",
      title: "Ajustes",
      language: "Idioma",
      appearance: "Apariencia",
      light: "Claro",
      dark: "Oscuro",
      editor: "Edición web",
      editorHint: "Entrar",
    },
    contact: {
      artworkDialogTitle: "Contactar por la obra",
      artworkSubjectPrefix: "Interés en la obra",
      cancel: "Cancelar",
      close: "Cerrar",
      defaultSubject: "Consulta desde la web de Toni Crespo",
      email: "Tu correo electrónico",
      emailButton: "Enviar correo",
      emailDialogTitle: "Enviar un correo",
      error: "No se pudo enviar el correo. Inténtalo de nuevo más tarde.",
      instagramMessageReady: "Mensaje copiado para Instagram.",
      message: "Mensaje",
      name: "Nombre",
      send: "Enviar correo",
      sending: "Enviando...",
      sent: "Correo enviado. Toni responderá a la dirección indicada.",
      subject: "Asunto",
      viaEmail: "Correo",
      viaInstagram: "Instagram",
      viaWhatsApp: "WhatsApp",
    },
    actions: {
      backToHome: "Volver al inicio",
      backToWork: "Volver a obra",
      backToSupportCollections: "Volver a colecciones de",
      closeImage: "Cerrar imagen",
      closeMockups: "Cerrar ambientes",
      mockups: "Ambientes",
      mockupsFor: "Ambientes para",
      mockupPrevious: "Ambiente anterior",
      mockupNext: "Ambiente siguiente",
      mockupSelector: "Selector de ambientes",
      viewMockup: "Ver ambiente",
      viewFullscreen: "Ver a pantalla completa",
      viewArtworkInRooms: "Ver obra colocada en ambientes",
      interest: "Me interesa / contacta con el artista por esta obra",
      interestMessagePrefix: "Hola Toni, me interesa esta obra:",
      interestMessageSuffix: "¿Podrías darme más información?",
      search: "Buscar",
      noNews: "No hay noticias que coincidan con la búsqueda.",
      visit: "Visitar aquí",
    },
    status: {
      notFoundPage: "Pagina no encontrada",
      collectionNotFound: "Colección no encontrada",
      noImages: "No se han encontrado imágenes.",
    },
    aria: {
      mainNav: "Navegacion principal",
      secondaryNav: "Navegacion secundaria",
      socials: "Redes sociales",
      breadcrumb: "Ruta de navegación",
      authorPhotos: "Fotografías de Toni Crespo",
      language: "Cambiar idioma",
      theme: "Cambiar tema",
      openMenu: "Abrir navegación",
      closeMenu: "Cerrar navegación",
    },
    footer: {
      location: "Mallorca",
      baseline: "Obra original y láminas",
    },
    rooms: {
      livingRoom: "Salón",
      studio: "Estudio",
      travertineRoom: "Sala de piedra",
      walnutAlcove: "Rincón de nogal",
      bedroom: "Dormitorio",
      linenRoom: "Salón de lino",
      walnutGallery: "Aparador de nogal",
      limestoneGallery: "Galería de caliza",
      oakGallery: "Galería de roble",
    },
  },
  en: {
    nav: {
      work: "Work",
      photography: "Photography",
      news: "News",
      biography: "Biography",
      contact: "Contact",
    },
    support: {
      canvas: "Canvases",
      paper: "Prints",
    },
    settings: {
      open: "Open settings",
      title: "Settings",
      language: "Language",
      appearance: "Appearance",
      light: "Light",
      dark: "Dark",
      editor: "Web editing",
      editorHint: "Sign in",
    },
    contact: {
      artworkDialogTitle: "Contact about artwork",
      artworkSubjectPrefix: "Interest in artwork",
      cancel: "Cancel",
      close: "Close",
      defaultSubject: "Enquiry from Toni Crespo's website",
      email: "Your email address",
      emailButton: "Send email",
      emailDialogTitle: "Send an email",
      error: "The email could not be sent. Please try again later.",
      instagramMessageReady: "Message copied for Instagram.",
      message: "Message",
      name: "Name",
      send: "Send email",
      sending: "Sending...",
      sent: "Email sent. Toni will reply to the address provided.",
      subject: "Subject",
      viaEmail: "Email",
      viaInstagram: "Instagram",
      viaWhatsApp: "WhatsApp",
    },
    actions: {
      backToHome: "Back to home",
      backToWork: "Back to work",
      backToSupportCollections: "Back to collections of",
      closeImage: "Close image",
      closeMockups: "Close room views",
      mockups: "Room views",
      mockupsFor: "Room views for",
      mockupPrevious: "Previous room view",
      mockupNext: "Next room view",
      mockupSelector: "Room view selector",
      viewMockup: "View room",
      viewFullscreen: "View full screen",
      viewArtworkInRooms: "View artwork in room settings",
      interest: "I am interested / contact the artist about this artwork",
      interestMessagePrefix: "Hello Toni, I am interested in this artwork:",
      interestMessageSuffix: "Could you send me more information?",
      search: "Search",
      noNews: "No news items match your search.",
      visit: "Visit here",
    },
    status: {
      notFoundPage: "Page not found",
      collectionNotFound: "Collection not found",
      noImages: "No images were found.",
    },
    aria: {
      mainNav: "Main navigation",
      secondaryNav: "Secondary navigation",
      socials: "Social links",
      breadcrumb: "Breadcrumb",
      authorPhotos: "Photographs of Toni Crespo",
      language: "Change language",
      theme: "Change theme",
      openMenu: "Open navigation",
      closeMenu: "Close navigation",
    },
    footer: {
      location: "Mallorca",
      baseline: "Original artwork and prints",
    },
    rooms: {
      livingRoom: "Living room",
      studio: "Studio",
      travertineRoom: "Stone room",
      walnutAlcove: "Walnut alcove",
      bedroom: "Bedroom",
      linenRoom: "Linen living room",
      walnutGallery: "Walnut sideboard",
      limestoneGallery: "Limestone gallery",
      oakGallery: "Oak gallery",
    },
  },
  de: {
    nav: {
      work: "Werke",
      photography: "Fotografie",
      news: "Neuigkeiten",
      biography: "Biografie",
      contact: "Kontakt",
    },
    support: {
      canvas: "Leinwände",
      paper: "Drucke",
    },
    settings: {
      open: "Einstellungen öffnen",
      title: "Einstellungen",
      language: "Sprache",
      appearance: "Darstellung",
      light: "Hell",
      dark: "Dunkel",
      editor: "Webbearbeitung",
      editorHint: "Anmelden",
    },
    contact: {
      artworkDialogTitle: "Zum Werk Kontakt aufnehmen",
      artworkSubjectPrefix: "Interesse an dem Werk",
      cancel: "Abbrechen",
      close: "Schließen",
      defaultSubject: "Anfrage über die Website von Toni Crespo",
      email: "Ihre E-Mail-Adresse",
      emailButton: "E-Mail senden",
      emailDialogTitle: "E-Mail senden",
      error: "Die E-Mail konnte nicht gesendet werden. Bitte versuchen Sie es später erneut.",
      instagramMessageReady: "Nachricht für Instagram kopiert.",
      message: "Nachricht",
      name: "Name",
      send: "E-Mail senden",
      sending: "Wird gesendet...",
      sent: "E-Mail gesendet. Toni wird an die angegebene Adresse antworten.",
      subject: "Betreff",
      viaEmail: "E-Mail",
      viaInstagram: "Instagram",
      viaWhatsApp: "WhatsApp",
    },
    actions: {
      backToHome: "Zur Startseite",
      backToWork: "Zurück zu Werke",
      backToSupportCollections: "Zurück zu den Sammlungen von",
      closeImage: "Bild schließen",
      closeMockups: "Raumansichten schließen",
      mockups: "Raumansichten",
      mockupsFor: "Raumansichten für",
      mockupPrevious: "Vorherige Raumansicht",
      mockupNext: "Nächste Raumansicht",
      mockupSelector: "Auswahl der Raumansichten",
      viewMockup: "Raumansicht anzeigen",
      viewFullscreen: "Vollbild anzeigen",
      viewArtworkInRooms: "Werk in Raumansichten anzeigen",
      interest: "Ich bin interessiert / den Künstler zu diesem Werk kontaktieren",
      interestMessagePrefix: "Hallo Toni, ich interessiere mich für dieses Werk:",
      interestMessageSuffix: "Könntest du mir weitere Informationen senden?",
      search: "Suchen",
      noNews: "Keine Neuigkeiten entsprechen der Suche.",
      visit: "Hier besuchen",
    },
    status: {
      notFoundPage: "Seite nicht gefunden",
      collectionNotFound: "Sammlung nicht gefunden",
      noImages: "Es wurden keine Bilder gefunden.",
    },
    aria: {
      mainNav: "Hauptnavigation",
      secondaryNav: "Sekundäre Navigation",
      socials: "Soziale Links",
      breadcrumb: "Navigationspfad",
      authorPhotos: "Fotografien von Toni Crespo",
      language: "Sprache ändern",
      theme: "Thema ändern",
      openMenu: "Navigation öffnen",
      closeMenu: "Navigation schließen",
    },
    footer: {
      location: "Mallorca",
      baseline: "Originalwerke und Drucke",
    },
    rooms: {
      livingRoom: "Wohnzimmer",
      studio: "Atelier",
      travertineRoom: "Steinraum",
      walnutAlcove: "Walnussnische",
      bedroom: "Schlafzimmer",
      linenRoom: "Leinenwohnzimmer",
      walnutGallery: "Walnusssideboard",
      limestoneGallery: "Kalksteingalerie",
      oakGallery: "Eichengalerie",
    },
  },
  ca: {
    nav: {
      work: "Obra",
      photography: "Fotografia",
      news: "Notícies",
      biography: "Trajectòria",
      contact: "Contacte",
    },
    support: {
      canvas: "Llenços",
      paper: "Làmines",
    },
    settings: {
      open: "Obrir ajustos",
      title: "Ajustos",
      language: "Idioma",
      appearance: "Aparença",
      light: "Clar",
      dark: "Fosc",
      editor: "Edició web",
      editorHint: "Entrar",
    },
    contact: {
      artworkDialogTitle: "Contactar per l'obra",
      artworkSubjectPrefix: "Interès en l'obra",
      cancel: "Cancel·lar",
      close: "Tancar",
      defaultSubject: "Consulta des del web de Toni Crespo",
      email: "El teu correu electrònic",
      emailButton: "Enviar correu",
      emailDialogTitle: "Enviar un correu",
      error: "No s'ha pogut enviar el correu. Torna-ho a provar més tard.",
      instagramMessageReady: "Missatge copiat per a Instagram.",
      message: "Missatge",
      name: "Nom",
      send: "Enviar correu",
      sending: "Enviant...",
      sent: "Correu enviat. Toni respondrà a l'adreça indicada.",
      subject: "Assumpte",
      viaEmail: "Correu",
      viaInstagram: "Instagram",
      viaWhatsApp: "WhatsApp",
    },
    actions: {
      backToHome: "Tornar a l'inici",
      backToWork: "Tornar a obra",
      backToSupportCollections: "Tornar a col·leccions de",
      closeImage: "Tancar imatge",
      closeMockups: "Tancar ambients",
      mockups: "Ambients",
      mockupsFor: "Ambients per a",
      mockupPrevious: "Ambient anterior",
      mockupNext: "Ambient següent",
      mockupSelector: "Selector d'ambients",
      viewMockup: "Veure ambient",
      viewFullscreen: "Veure a pantalla completa",
      viewArtworkInRooms: "Veure l'obra col·locada en ambients",
      interest: "M'interessa / contacta amb l'artista per aquesta obra",
      interestMessagePrefix: "Hola Toni, m'interessa aquesta obra:",
      interestMessageSuffix: "Em podries enviar més informació?",
      search: "Cercar",
      noNews: "No hi ha notícies que coincideixin amb la cerca.",
      visit: "Visitar aquí",
    },
    status: {
      notFoundPage: "Pàgina no trobada",
      collectionNotFound: "Col·lecció no trobada",
      noImages: "No s'han trobat imatges.",
    },
    aria: {
      mainNav: "Navegació principal",
      secondaryNav: "Navegació secundària",
      socials: "Xarxes socials",
      breadcrumb: "Ruta de navegació",
      authorPhotos: "Fotografies de Toni Crespo",
      language: "Canviar idioma",
      theme: "Canviar tema",
      openMenu: "Obrir navegació",
      closeMenu: "Tancar navegació",
    },
    footer: {
      location: "Mallorca",
      baseline: "Obra original i làmines",
    },
    rooms: {
      livingRoom: "Saló",
      studio: "Estudi",
      travertineRoom: "Sala de pedra",
      walnutAlcove: "Racó de noguera",
      bedroom: "Dormitori",
      linenRoom: "Saló de lli",
      walnutGallery: "Aparador de noguera",
      limestoneGallery: "Galeria de calcària",
      oakGallery: "Galeria de roure",
    },
  },
} as const;

export type SiteLabels = (typeof translations)[SiteLanguage];

type SitePreferencesContextValue = {
  language: SiteLanguage;
  labels: SiteLabels;
  setLanguage: (language: SiteLanguage) => void;
  setTheme: (theme: SiteTheme) => void;
  theme: SiteTheme;
};

const SitePreferencesContext = createContext<SitePreferencesContextValue | null>(null);

export function SitePreferencesProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<SiteLanguage>(() => readStoredLanguage());
  const [theme, setTheme] = useState<SiteTheme>(() => readStoredTheme());
  const labels = translations[language];

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(preferenceStorageKeys.language, language);
    window.localStorage.setItem(preferenceStorageKeys.theme, theme);
  }, [language, theme]);

  const value = useMemo(
    () => ({
      language,
      labels,
      setLanguage,
      setTheme,
      theme,
    }),
    [labels, language, theme],
  );

  return <SitePreferencesContext.Provider value={value}>{children}</SitePreferencesContext.Provider>;
}

export function useSitePreferences() {
  const context = useContext(SitePreferencesContext);

  if (!context) {
    throw new Error("useSitePreferences must be used within SitePreferencesProvider");
  }

  return context;
}

function readStoredLanguage(): SiteLanguage {
  if (typeof window === "undefined") return "ca";

  const storedLanguage = window.localStorage.getItem(preferenceStorageKeys.language);
  return isSiteLanguage(storedLanguage) ? storedLanguage : "ca";
}

function readStoredTheme(): SiteTheme {
  if (typeof window === "undefined") return "light";

  const storedTheme = window.localStorage.getItem(preferenceStorageKeys.theme);
  return storedTheme === "dark" || storedTheme === "light" ? storedTheme : "light";
}

function isSiteLanguage(value: string | null): value is SiteLanguage {
  return value === "es" || value === "en" || value === "de" || value === "ca";
}
