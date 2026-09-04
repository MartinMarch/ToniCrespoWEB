import type { SiteContactSettings } from "../types/siteSettings";

export function getContactLinks(contact: SiteContactSettings) {
  return {
    instagramDirectUrl: `https://ig.me/m/${contact.instagramUsername}`,
    instagramProfileUrl: `https://www.instagram.com/${contact.instagramUsername}/`,
    telephoneUrl: `tel:+${contact.phoneNumber}`,
    whatsappUrl: `https://wa.me/${contact.phoneNumber}`,
  };
}

export function getWhatsAppContactUrl(contact: SiteContactSettings, message: string) {
  return `${getContactLinks(contact).whatsappUrl}?text=${encodeURIComponent(message)}`;
}
