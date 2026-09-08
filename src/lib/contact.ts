import { defaultSiteSettings, type SiteContactSettings } from "../types/siteSettings";

export type EmailContactDraft = {
  message?: string;
  subject?: string;
};

export function getEmailContactUrl(contact: SiteContactSettings, draft: EmailContactDraft = {}) {
  const candidate = contact.email.trim();
  // Accept one mailbox, never a URL, recipient list, or pre-encoded headers.
  const recipient = /^[^\s\u0000-\u001f\u007f@<>,;:"\\?&#%]+@[^\s\u0000-\u001f\u007f@<>,;:"\\?&#%]+$/.test(candidate)
    ? candidate
    : defaultSiteSettings.contact.email;
  const url = `mailto:${encodeURIComponent(recipient).replace(/%40/g, "@")}`;
  const parameters: string[] = [];

  if (draft.subject) {
    const subject = draft.subject.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
    if (subject) parameters.push(`subject=${encodeURIComponent(subject)}`);
  }
  if (draft.message) {
    const message = draft.message.replace(/\r\n|\r|\n/g, "\r\n");
    parameters.push(`body=${encodeURIComponent(message)}`);
  }

  return parameters.length ? `${url}?${parameters.join("&")}` : url;
}

export function getContactLinks(contact: SiteContactSettings) {
  return {
    emailUrl: getEmailContactUrl(contact),
    instagramDirectUrl: `https://ig.me/m/${contact.instagramUsername}`,
    instagramProfileUrl: `https://www.instagram.com/${contact.instagramUsername}/`,
    telephoneUrl: `tel:+${contact.phoneNumber}`,
    whatsappUrl: `https://wa.me/${contact.phoneNumber}`,
  };
}

export function getWhatsAppContactUrl(contact: SiteContactSettings, message: string) {
  return `${getContactLinks(contact).whatsappUrl}?text=${encodeURIComponent(message)}`;
}
