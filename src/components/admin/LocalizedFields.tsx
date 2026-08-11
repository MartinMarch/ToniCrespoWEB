import type { ReactNode } from "react";
import { contentLocales, type ContentLocale, type LocalizedFields } from "../../types/localization";

export type EditorLocale = "es" | ContentLocale;
export type LocaleValues<T extends object> = Record<EditorLocale, T>;

export const editorLocales: Array<{ code: EditorLocale; label: string; shortLabel: string }> = [
  { code: "es", label: "Español", shortLabel: "ES" },
  { code: "en", label: "English", shortLabel: "EN" },
  { code: "de", label: "Deutsch", shortLabel: "DE" },
  { code: "ca", label: "Català", shortLabel: "CA" },
];

export function createLocaleValues<T extends object>(
  spanish: T,
  translations?: LocalizedFields<T>,
  defaults?: LocalizedFields<T>,
): LocaleValues<T> {
  const emptyTranslation = createEmptyTranslation(spanish);

  return {
    es: { ...spanish },
    en: mergeLocaleValue(emptyTranslation, defaults?.en, translations?.en),
    de: mergeLocaleValue(emptyTranslation, defaults?.de, translations?.de),
    ca: mergeLocaleValue(emptyTranslation, defaults?.ca, translations?.ca),
  };
}

export function toStoredTranslations<T extends object>(values: LocaleValues<T>): LocalizedFields<T> {
  return contentLocales.reduce<LocalizedFields<T>>((translations, locale) => {
    const value = compactTranslation(values[locale]);
    if (Object.keys(value).length > 0) translations[locale] = value;
    return translations;
  }, {});
}

function createEmptyTranslation<T extends object>(source: T): T {
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [key, typeof value === "string" ? "" : value]),
  ) as T;
}

function mergeLocaleValue<T extends object>(empty: T, ...sources: Array<Partial<T> | undefined>): T {
  const value = { ...empty } as T;

  for (const source of sources) {
    if (!source) continue;

    for (const [key, sourceValue] of Object.entries(source)) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      const currentValue = value[key as keyof T];
      if (typeof currentValue === "string") {
        if (typeof sourceValue === "string") {
          (value as Record<string, unknown>)[key] = sourceValue;
        }
        continue;
      }

      if (sourceValue !== null && sourceValue !== undefined) {
        (value as Record<string, unknown>)[key] = sourceValue;
      }
    }
  }

  return value;
}

function compactTranslation<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, fieldValue]) => {
      if (typeof fieldValue === "string") {
        const trimmed = fieldValue.trim();
        return trimmed ? [[key, trimmed]] : [];
      }

      return fieldValue === null || fieldValue === undefined ? [] : [[key, fieldValue]];
    }),
  ) as Partial<T>;
}

export function TranslationTabs({
  activeLocale,
  children,
  isComplete,
  onSelect,
}: {
  activeLocale: EditorLocale;
  children: ReactNode;
  isComplete?: (locale: EditorLocale) => boolean;
  onSelect: (locale: EditorLocale) => void;
}) {
  return (
    <div className="translation-fields">
      <div className="translation-tabs" role="tablist" aria-label="Idioma del contenido">
        {editorLocales.map((locale) => (
          <button
            key={locale.code}
            type="button"
            className={`${activeLocale === locale.code ? "is-active" : ""}${
              isComplete?.(locale.code) ? " is-complete" : ""
            }`}
            role="tab"
            aria-selected={activeLocale === locale.code}
            onClick={() => onSelect(locale.code)}
          >
            <span>{locale.shortLabel}</span>
            <small>{locale.label}</small>
          </button>
        ))}
      </div>
      <div className="translation-fields__content" role="tabpanel">
        {children}
      </div>
    </div>
  );
}
