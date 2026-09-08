import type { SiteLanguage } from "../app/sitePreferences";

export type SiteContactSettings = {
  email: string;
  instagramHandle: string;
  instagramUsername: string;
  phoneDisplay: string;
  phoneNumber: string;
};

export type SiteSettings = {
  contact: SiteContactSettings;
  defaultLanguage: SiteLanguage;
};

export const defaultSiteSettings: SiteSettings = {
  contact: {
    email: "eulaliaricart@gmail.com",
    instagramHandle: "@tonicrespo.art",
    instagramUsername: "tonicrespo.art",
    phoneDisplay: "+34 659 959 352",
    phoneNumber: "34659959352",
  },
  defaultLanguage: "ca",
};
