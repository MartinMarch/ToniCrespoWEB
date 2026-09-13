import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { selectSupportCollections } from "../lib/supportCollections";
import { useSitePreferences } from "./sitePreferences";
import { useAdminSession } from "./adminSession";

type EditableContentContextValue = EditableContentSnapshot & {
  error: string | null;
  isLoading: boolean;
  refreshContent: (confirmedSnapshot?: EditableContentSnapshot) => Promise<void>;
  source: EditableContentSnapshot;
  getPage: (kind: CurrentPage["kind"]) => CurrentPage | null;
  getSupportCollections: (kind: SupportKind) => EditableCollection[];
  getSupportCollection: (kind: SupportKind, slug: string) => EditableCollection | null;
};

const EditableContentContext = createContext<EditableContentContextValue | null>(null);

export function EditableContentProvider({ children }: { children: ReactNode }) {
  const { language } = useSitePreferences();
  const { isAdmin, isEditMode, session } = useAdminSession();
  const accessScope = isAdmin && session ? session.user.id : "public";
  const requestSequence = useRef(0);
  const activeScope = useRef(accessScope);
  activeScope.current = accessScope;
  const [contentState, setContentState] = useState<{
    scope: string | null;
    snapshot: EditableContentSnapshot | null;
    isLoading: boolean;
    error: string | null;
  }>({ scope: null, snapshot: null, isLoading: true, error: null });

  const refreshContent = useCallback(async (confirmedSnapshot?: EditableContentSnapshot) => {
    if (activeScope.current !== accessScope) return;
    const requestId = ++requestSequence.current;
    setContentState((previous) => ({
      scope: accessScope,
      snapshot: previous.scope === accessScope ? previous.snapshot : null,
      isLoading: true,
      error: null,
    }));

    try {
      const nextSnapshot = confirmedSnapshot ?? await loadEditableContent();
      if (requestId === requestSequence.current && activeScope.current === accessScope) {
        setContentState({ scope: accessScope, snapshot: nextSnapshot, isLoading: false, error: null });
      }
    } catch (contentError) {
      if (requestId !== requestSequence.current || activeScope.current !== accessScope) return;
      setContentState({
        scope: accessScope,
        snapshot: getEmptyEditableContentSnapshot(),
        isLoading: false,
        error: getEditableOperationErrorMessage(contentError, "No se pudo cargar el contenido editable."),
      });
    }
  }, [accessScope]);

  useEffect(() => {
    // RLS returns different rows to visitors and admins. Discard the previous
    // identity's snapshot and ignore in-flight responses from an earlier load.
    void refreshContent();
    return () => { requestSequence.current += 1; };
  }, [accessScope, refreshContent]);

  const emptySnapshot = useMemo(() => getEmptyEditableContentSnapshot(), []);

  const value = useMemo(() => {
    // Mask another identity's data during render, before child effects can
    // initialize an editing draft from the previous visitor/admin snapshot.
    const matchesScope = contentState.scope === accessScope;
    const source = matchesScope ? contentState.snapshot ?? emptySnapshot : emptySnapshot;
    const translatedSnapshot = translateEditorialContent(source, language);
    const currentSnapshot = isEditMode ? translatedSnapshot : hideUnpublishedContent(translatedSnapshot);

    return {
      ...currentSnapshot,
      error: matchesScope ? contentState.error : null,
      source,
      getPage(kind: CurrentPage["kind"]) {
        return currentSnapshot.pages.find((page) => page.kind === kind && page.isPublished) ?? null;
      },
      isLoading: !matchesScope || contentState.isLoading,
      refreshContent,
      getSupportCollections(kind: SupportKind) {
        return selectSupportCollections(currentSnapshot.collections, kind);
      },
      getSupportCollection(kind: SupportKind, slug: string) {
        return (
          currentSnapshot.collections.find(
            (collection) => collection.supportKind === kind && collection.slug === slug && collection.isPublished,
          ) ?? null
        );
      },
    };
  }, [accessScope, contentState, emptySnapshot, isEditMode, language, refreshContent]);

  return <EditableContentContext.Provider value={value}>{children}</EditableContentContext.Provider>;
}

function hideUnpublishedContent(snapshot: EditableContentSnapshot): EditableContentSnapshot {
  return {
    ...snapshot,
    collections: snapshot.collections
      .filter((collection) => collection.isPublished)
      .map((collection) => {
        const artworks = collection.artworks.filter((artwork) => artwork.isPublished);
        return {
          ...collection,
          artworks,
          coverImageUrl: artworks[0]?.imageUrl ?? null,
        };
      }),
    newsItems: snapshot.newsItems.filter((item) => item.isPublished),
    pages: snapshot.pages.filter((page) => page.isPublished),
    photoItems: snapshot.photoItems.filter((item) => item.isPublished),
  };
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
