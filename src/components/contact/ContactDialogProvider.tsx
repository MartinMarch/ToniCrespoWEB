import { createContext, useCallback, useContext, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Mail, MessageCircle, Send } from "lucide-react";
import { useSitePreferences, type SiteLabels } from "../../app/sitePreferences";
import { artistContact, getWhatsAppContactUrl } from "../../lib/contact";
import { sendContactEmail, type ContactEmailArtwork } from "../../services/contactEmailService";
import type { CurrentArtwork } from "../../types/currentSite";
import { AdminDialog, FormMessage } from "../admin/AdminUi";

type ContactArtwork = Pick<CurrentArtwork, "dimensions" | "technique" | "title">;

type EmailDraft = {
  artwork?: ContactArtwork;
  message?: string;
  subject?: string;
};

type ContactDialogState =
  | { draft: EmailDraft; kind: "email" }
  | { artwork: ContactArtwork; kind: "artwork" }
  | null;

type ContactDialogContextValue = {
  openArtworkContact: (artwork: ContactArtwork) => void;
  openEmailComposer: (draft?: EmailDraft) => void;
};

const ContactDialogContext = createContext<ContactDialogContextValue | null>(null);

export function ContactDialogProvider({ children }: { children: ReactNode }) {
  const { labels } = useSitePreferences();
  const [dialog, setDialog] = useState<ContactDialogState>(null);

  const closeDialog = useCallback(() => setDialog(null), []);
  const openArtworkContact = useCallback((artwork: ContactArtwork) => setDialog({ artwork, kind: "artwork" }), []);
  const openEmailComposer = useCallback((draft: EmailDraft = {}) => setDialog({ draft, kind: "email" }), []);
  const value = useMemo(
    () => ({ openArtworkContact, openEmailComposer }),
    [openArtworkContact, openEmailComposer],
  );

  return (
    <ContactDialogContext.Provider value={value}>
      {children}
      {dialog?.kind === "artwork" ? (
        <ArtworkContactDialog
          artwork={dialog.artwork}
          onClose={closeDialog}
          onEmail={() => openEmailComposer(createArtworkEmailDraft(dialog.artwork, labels))}
        />
      ) : null}
      {dialog?.kind === "email" ? (
        <EmailComposerDialog
          key={`${dialog.draft.subject ?? ""}-${dialog.draft.artwork?.title ?? ""}`}
          draft={dialog.draft}
          onClose={closeDialog}
        />
      ) : null}
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
  onEmail,
}: {
  artwork: ContactArtwork;
  onClose: () => void;
  onEmail: () => void;
}) {
  const { labels } = useSitePreferences();
  const [wasInstagramMessageCopied, setWasInstagramMessageCopied] = useState(false);
  const draft = createArtworkEmailDraft(artwork, labels);

  async function handleInstagramClick() {
    setWasInstagramMessageCopied(await copyText(draft.message ?? ""));
  }

  return (
    <AdminDialog title={`${labels.contact.artworkDialogTitle}: ${artwork.title}`} onClose={onClose} className="contact-dialog">
      <div className="contact-dialog__body">
        <div className="contact-channel-grid">
          <a
            className="contact-channel contact-channel--whatsapp"
            href={getWhatsAppContactUrl(draft.message ?? "")}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle aria-hidden="true" />
            <span>{labels.contact.viaWhatsApp}</span>
          </a>
          <a
            className="contact-channel contact-channel--instagram"
            href={artistContact.instagramDirectUrl}
            target="_blank"
            rel="noreferrer"
            onClick={() => void handleInstagramClick()}
          >
            <Send aria-hidden="true" />
            <span>{labels.contact.viaInstagram}</span>
          </a>
          <button type="button" className="contact-channel contact-channel--email" onClick={onEmail}>
            <Mail aria-hidden="true" />
            <span>{labels.contact.viaEmail}</span>
          </button>
        </div>
        {wasInstagramMessageCopied ? <p className="contact-dialog__status" role="status">{labels.contact.instagramMessageReady}</p> : null}
      </div>
    </AdminDialog>
  );
}

function EmailComposerDialog({ draft, onClose }: { draft: EmailDraft; onClose: () => void }) {
  const { labels } = useSitePreferences();
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [subject, setSubject] = useState(draft.subject ?? labels.contact.defaultSubject);
  const [message, setMessage] = useState(draft.message ?? "");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      await sendContactEmail({
        artwork: draft.artwork ? toEmailArtwork(draft.artwork) : undefined,
        message: message.trim(),
        pageUrl: window.location.href,
        senderEmail: senderEmail.trim(),
        senderName: senderName.trim(),
        subject: subject.trim(),
        website,
      });
      setSuccess(labels.contact.sent);
    } catch {
      setError(labels.contact.error);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AdminDialog title={labels.contact.emailDialogTitle} onClose={isSubmitting ? () => undefined : onClose} className="contact-dialog">
      <form className="admin-form admin-form--dialog contact-form" onSubmit={(event) => void handleSubmit(event)}>
        <div className="contact-form__grid">
          <label>
            {labels.contact.name}
            <input
              value={senderName}
              onChange={(event) => setSenderName(event.target.value)}
              autoComplete="name"
              maxLength={120}
            />
          </label>
          <label>
            {labels.contact.email}
            <input
              type="email"
              value={senderEmail}
              onChange={(event) => setSenderEmail(event.target.value)}
              autoComplete="email"
              maxLength={254}
              required
            />
          </label>
        </div>
        <label>
          {labels.contact.subject}
          <input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={180} required />
        </label>
        <label>
          {labels.contact.message}
          <textarea rows={7} value={message} onChange={(event) => setMessage(event.target.value)} maxLength={5000} required />
        </label>
        <label className="contact-form__honeypot" aria-hidden="true">
          Website
          <input value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" />
        </label>
        <FormMessage error={error} success={success} />
        <div className="admin-dialog__actions">
          <button type="button" className="admin-secondary-button" disabled={isSubmitting} onClick={onClose}>
            {success ? labels.contact.close : labels.contact.cancel}
          </button>
          {!success ? (
            <button type="submit" className="admin-primary-button" disabled={isSubmitting}>
              <Send aria-hidden="true" />
              {isSubmitting ? labels.contact.sending : labels.contact.send}
            </button>
          ) : null}
        </div>
      </form>
    </AdminDialog>
  );
}

function createArtworkEmailDraft(
  artwork: ContactArtwork,
  labels: SiteLabels,
): Required<Pick<EmailDraft, "message" | "subject">> & Pick<EmailDraft, "artwork"> {
  const details = [artwork.technique, artwork.dimensions].filter((value): value is string => Boolean(value?.trim())).join(" · ");
  const artworkDescription = details ? `${artwork.title} (${details})` : artwork.title;

  return {
    artwork,
    message: `${labels.actions.interestMessagePrefix} ${artworkDescription}. ${labels.actions.interestMessageSuffix}`,
    subject: `${labels.contact.artworkSubjectPrefix}: ${artwork.title}`,
  };
}

function toEmailArtwork(artwork: ContactArtwork): ContactEmailArtwork {
  return {
    dimensions: artwork.dimensions,
    technique: artwork.technique,
    title: artwork.title,
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
