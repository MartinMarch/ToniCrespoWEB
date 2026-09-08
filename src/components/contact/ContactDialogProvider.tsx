import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Mail, MessageCircle, Send } from "lucide-react";
import { useSitePreferences, type SiteLabels } from "../../app/sitePreferences";
import { getContactLinks, getEmailContactUrl, getWhatsAppContactUrl, type EmailContactDraft } from "../../lib/contact";
import type { CurrentArtwork } from "../../types/currentSite";
import { AdminDialog } from "../admin/AdminUi";

type ContactArtwork = Pick<CurrentArtwork, "dimensions" | "technique" | "title">;

type ContactDialogContextValue = {
  openArtworkContact: (artwork: ContactArtwork) => void;
};

const ContactDialogContext = createContext<ContactDialogContextValue | null>(null);

export function ContactDialogProvider({ children }: { children: ReactNode }) {
  const [artwork, setArtwork] = useState<ContactArtwork | null>(null);

  const closeDialog = useCallback(() => setArtwork(null), []);
  const openArtworkContact = useCallback((nextArtwork: ContactArtwork) => setArtwork(nextArtwork), []);
  const value = useMemo(() => ({ openArtworkContact }), [openArtworkContact]);

  return (
    <ContactDialogContext.Provider value={value}>
      {children}
      {artwork ? <ArtworkContactDialog artwork={artwork} onClose={closeDialog} /> : null}
    </ContactDialogContext.Provider>
  );
}

export function useContactDialog() {
  const context = useContext(ContactDialogContext);

  if (!context) {
    throw new Error("useContactDialog must be used within ContactDialogProvider");
  }

  return context;
}

function ArtworkContactDialog({
  artwork,
  onClose,
}: {
  artwork: ContactArtwork;
  onClose: () => void;
}) {
  const { contactSettings, labels } = useSitePreferences();
  const [wasInstagramMessageCopied, setWasInstagramMessageCopied] = useState(false);
  const draft = createArtworkEmailDraft(artwork, labels);
  const contactLinks = getContactLinks(contactSettings);

  async function handleInstagramClick() {
    setWasInstagramMessageCopied(await copyText(draft.message));
  }

  return (
    <AdminDialog title={`${labels.contact.artworkDialogTitle}: ${artwork.title}`} onClose={onClose} className="contact-dialog">
      <div className="contact-dialog__body">
        <div className="contact-channel-grid">
          <a
            className="contact-channel contact-channel--whatsapp"
            href={getWhatsAppContactUrl(contactSettings, draft.message)}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle aria-hidden="true" />
            <span>{labels.contact.viaWhatsApp}</span>
          </a>
          <a
            className="contact-channel contact-channel--instagram"
            href={contactLinks.instagramDirectUrl}
            target="_blank"
            rel="noreferrer"
            onClick={() => void handleInstagramClick()}
          >
            <Send aria-hidden="true" />
            <span>{labels.contact.viaInstagram}</span>
          </a>
          <a
            className="contact-channel contact-channel--email"
            href={getEmailContactUrl(contactSettings, draft)}
            aria-describedby="artwork-email-app-hint"
          >
            <Mail aria-hidden="true" />
            <span>{labels.contact.viaEmail}</span>
          </a>
        </div>
        <p className="contact-dialog__status" id="artwork-email-app-hint">{labels.contact.emailAppHint}</p>
        {wasInstagramMessageCopied ? <p className="contact-dialog__status" role="status">{labels.contact.instagramMessageReady}</p> : null}
      </div>
    </AdminDialog>
  );
}

function createArtworkEmailDraft(
  artwork: ContactArtwork,
  labels: SiteLabels,
): Required<EmailContactDraft> {
  const details = [artwork.technique, artwork.dimensions].filter((value): value is string => Boolean(value?.trim())).join(" · ");
  const artworkDescription = details ? `${artwork.title} (${details})` : artwork.title;

  return {
    message: `${labels.actions.interestMessagePrefix} ${artworkDescription}. ${labels.actions.interestMessageSuffix}`,
    subject: `${labels.contact.artworkSubjectPrefix}: ${artwork.title}`,
  };
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const input = document.createElement("textarea");
    input.value = value;
    input.style.left = "-9999px";
    input.style.position = "fixed";
    document.body.append(input);
    input.select();
    const wasCopied = document.execCommand("copy");
    input.remove();
    return wasCopied;
  }
}
