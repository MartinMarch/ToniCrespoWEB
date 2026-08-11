export const artistContact = {
  email: "tonicrespo.art@gmail.com",
  instagramDirectUrl: "https://ig.me/m/tonicrespo.art",
  instagramProfileUrl: "https://www.instagram.com/tonicrespo.art/",
  whatsappUrl: "https://wa.me/34659959352",
} as const;

export function getWhatsAppContactUrl(message: string) {
  return `${artistContact.whatsappUrl}?text=${encodeURIComponent(message)}`;
}
