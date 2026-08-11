import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  getEmptyEditableContentSnapshot,
  getEditableOperationErrorMessage,
  loadEditableContent,
  type BiographyContent,
  type EditableCollection,
  type EditableContentSnapshot,
} from "../services/editableContentService";
import { translateEditorialContent } from "../data/editorialTranslations";
import type { CurrentArtwork, CurrentPage } from "../types/currentSite";
import type { NewsItem } from "../types/domain";
import type { SupportKind } from "../types/support";
import { useSitePreferences } from "./sitePreferences";

type EditableContentContextValue = EditableContentSnapshot & {
  error: string | null;
  isLoading: boolean;
  refreshContent: () => Promise<void>;
  source: EditableContentSnapshot;
  getPage: (kind: CurrentPage["kind"]) => CurrentPage | null;
  getSupportCollections: (kind: SupportKind) => EditableCollection[];
  getSupportCollection: (kind: SupportKind, slug: string) => EditableCollection | null;
};

const EditableContentContext = createContext<EditableContentContextValue | null>(null);

export function EditableContentProvider({ children }: { children: ReactNode }) {
  const { language } = useSitePreferences();
  const [snapshot, setSnapshot] = useState<EditableContentSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshContent = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      setSnapshot(await loadEditableContent());
    } catch (contentError) {
      setError(getEditableOperationErrorMessage(contentError, "No se pudo cargar el contenido editable."));
      setSnapshot(getEmptyEditableContentSnapshot());
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshContent();
  }, [refreshContent]);

  const emptySnapshot = useMemo(() => getEmptyEditableContentSnapshot(), []);

  const value = useMemo(() => {
    const source = snapshot ?? emptySnapshot;
    const currentSnapshot = translateEditorialContent(source, language);

    return {
      ...currentSnapshot,
      error,
      source,
      getPage(kind: CurrentPage["kind"]) {
        return currentSnapshot.pages.find((page) => page.kind === kind && page.isPublished) ?? null;
      },
      isLoading,
      refreshContent,
      getSupportCollections(kind: SupportKind) {
        return currentSnapshot.collections
          .filter((collection) => collection.supportKind === kind && collection.isPublished)
          .map((collection) =>
            kind === "canvas" && collection.source === "legacy-wordpress"
              ? {
                  ...collection,
                  artworks: collection.artworks.filter((artwork) =>
                    normalizeSupportText([artwork.technique, artwork.caption, artwork.description].filter(Boolean).join(" ")).includes(
                      "lienzo",
                    ),
                  ),
                }
              : collection,
          )
          .filter((collection) => kind === "paper" || collection.source !== "legacy-wordpress" || collection.artworks.length > 0)
          .filter(
            (collection, index, collections) =>
              collections.findIndex(
                (candidate) =>
                  candidate.slug === collection.slug && candidate.supportKind === collection.supportKind && candidate.source !== "legacy-wordpress",
              ) === -1 || collection.source !== "legacy-wordpress",
          )
          .sort((a, b) => a.sortOrder - b.sortOrder);
      },
      getSupportCollection(kind: SupportKind, slug: string) {
        return (
          currentSnapshot.collections.find(
            (collection) => collection.supportKind === kind && collection.slug === slug && collection.isPublished,
          ) ?? null
        );
      },
    };
  }, [emptySnapshot, error, isLoading, language, refreshContent, snapshot]);

  return <EditableContentContext.Provider value={value}>{children}</EditableContentContext.Provider>;
}

function normalizeSupportText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function useEditableContent() {
  const context = useContext(EditableContentContext);

  if (!context) {
    throw new Error("useEditableContent must be used within EditableContentProvider");
  }

  return context;
}

export function useSupportCollections(kind: SupportKind) {
  return useEditableContent().getSupportCollections(kind);
}

export function useSupportCollection(kind: SupportKind, slug: string | undefined) {
  const { getSupportCollection } = useEditableContent();
  return slug ? getSupportCollection(kind, slug) : null;
}

export function useBiographyContent(): BiographyContent {
  return useEditableContent().biography;
}

export function useEditablePage(kind: CurrentPage["kind"]): CurrentPage | null {
  return useEditableContent().getPage(kind);
}

export function useEditableNewsItems(): NewsItem[] {
  return useEditableContent().newsItems;
}

export function useEditablePhotoItems(): CurrentArtwork[] {
  return useEditableContent().photoItems;
}

export function useEditingContent(): EditableContentSnapshot {
  return useEditableContent().source;
}
