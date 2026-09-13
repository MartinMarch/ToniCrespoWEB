import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Link, useBlocker, useLocation, useNavigate } from "react-router-dom";
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, closestCenter,
  pointerWithin, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown, ArrowLeft, ArrowRightLeft, ArrowUp, Check, EyeOff, GripVertical, ImageOff,
  FolderPlus, LayoutGrid, LoaderCircle, LogOut, MoreHorizontal, Pin, Plus, Redo2, RotateCcw, Save, Search, Settings2, Undo2,
} from "lucide-react";
import { useAdminSession } from "../app/adminSession";
import { useEditableContent } from "../app/editableContent";
import { AdminEditor } from "../components/admin/AdminEditor";
import { OrganizerDialog } from "../components/admin/OrganizerDialog";
import { ContentManagerDialogs, isCatalogEditor, type CatalogAction } from "../components/admin/ContentManagerDialogs";
import { ArtworkReviewBadge, ArtworkReviewNotice, CollectionReviewBadge } from "../components/admin/ContentReviewNotice";
import { chooseOrganizationPanels, createOrganizationState, getOrganizationChanges, getOrganizerReturnPath, moveArtwork, type OrganizationState } from "../lib/artworkOrganization";
import { compareSupportCollections } from "../lib/supportCollections";
import { getArtworkReviewIssues, getCollectionReviewSummary } from "../lib/artworkReview";
import { getArtworkOrganizationErrorMessage, saveArtworkOrganization } from "../services/artworkOrganizationService";
import { getEditableOperationErrorMessage, loadEditableContent, type EditableCollection } from "../services/editableContentService";
import type { CurrentArtwork } from "../types/currentSite";
import type { SupportKind } from "../types/support";
import "../styles/artwork-organizer.css";

type History = { past: OrganizationState[]; present: OrganizationState; future: OrganizationState[] };
type Modal = { kind: "move"; artworkId: string } | { kind: "save" | "discard" | "reload" | "logout" } | null;
type ArtworkFilter = "all" | "visible" | "hidden" | "unavailable" | "review";
const cleanHistory = (state: OrganizationState): History => ({ past: [], present: state, future: [] });
const supportName = (collection: EditableCollection) => collection.supportKind === "canvas" ? "Lienzos" : "Obra en papel";
const normalizeSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function matchesArtwork(artwork: CurrentArtwork, collection: EditableCollection, query: string, filter: ArtworkFilter) {
  const visible = artwork.isPublished && collection.isPublished;
  return (!query || normalizeSearch(`${artwork.title} ${artwork.technique ?? ""} ${artwork.dimensions ?? ""}`).includes(query))
    && (filter === "all" || (filter === "visible" && visible) || (filter === "hidden" && !visible) || (filter === "unavailable" && artwork.isAvailable === false)
      || (filter === "review" && getArtworkReviewIssues(artwork).length > 0));
}

export function ArtworkOrganizerPage() {
  const admin = useAdminSession();
  useEffect(() => {
    const oldTitle = document.title;
    document.title = "Gestor de contenido · Toni Crespo";
    window.scrollTo(0, 0);
    return () => { document.title = oldTitle; };
  }, []);

  if (!admin.isAdmin || !admin.isEditMode || !admin.session) {
    return (
      <main className="artwork-organizer organizer-access">
        <LayoutGrid aria-hidden="true" />
        <h1>Gestor de contenido</h1>
        <p>Este panel está reservado a administradores con el modo edición activo.</p>
        <button type="button" className="admin-primary-button" onClick={admin.requestEditing}>
          {admin.isAdmin ? "Activar modo edición" : "Entrar en modo edición"}
        </button>
        <Link to="/">Volver a la web</Link>
        <AdminEditor />
      </main>
    );
  }
  return <OrganizerWorkspace key={admin.session.user.id} />;
}

function OrganizerWorkspace() {
  const { source, isLoading, error: contentError, refreshContent } = useEditableContent();
  const { signOut } = useAdminSession();
  const navigate = useNavigate();
  const location = useLocation();
  const candidateReturn = (location.state as { returnTo?: unknown } | null)?.returnTo;
  const returnTo = getOrganizerReturnPath(candidateReturn);
  const [baseline, setBaseline] = useState<EditableCollection[] | null>(null);
  const [history, setHistory] = useState<History>(() => cleanHistory({}));
  const [activeKind, setActiveKind] = useState<SupportKind>("canvas");
  const [selectedPanels, setSelectedPanels] = useState<Record<SupportKind, { left: string; right: string }>>({
    canvas: { left: "", right: "" }, paper: { left: "", right: "" },
  });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ArtworkFilter>("all");
  const [modal, setModal] = useState<Modal>(null);
  const [catalogAction, setCatalogAction] = useState<CatalogAction | null>(null);
  const [pendingCatalogAction, setPendingCatalogAction] = useState<CatalogAction | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const acceptSnapshot = useCallback((collections: EditableCollection[]) => {
    setBaseline(collections);
    setHistory(cleanHistory(createOrganizationState(collections)));
    setNeedsReload(false);
  }, []);

  useEffect(() => {
    if (baseline === null && !isLoading && !contentError) acceptSnapshot(source.collections);
  }, [acceptSnapshot, baseline, contentError, isLoading, source.collections]);

  useEffect(() => {
    if (!catalogAction || !baseline) return;
    const missing = "collectionId" in catalogAction
      ? !baseline.some((collection) => collection.id === catalogAction.collectionId)
      : "artworkId" in catalogAction
        ? !baseline.some((collection) => collection.artworks.some((artwork) => artwork.id === catalogAction.artworkId)) : false;
    if (missing) {
      setCatalogAction(null);
      setError("La obra o colección ya no está en el catálogo. La vista se ha actualizado; selecciona otro destino.");
    }
  }, [baseline, catalogAction]);

  const collections = baseline ?? [];
  const branchCollections = useMemo(() => collections.filter((collection) => collection.supportKind === activeKind).sort(compareSupportCollections), [activeKind, baseline]);
  const { left: leftId, right: rightId } = chooseOrganizationPanels(branchCollections.map((collection) => collection.id), selectedPanels[activeKind]);
  const draft = history.present;
  const original = useMemo(() => createOrganizationState(collections), [baseline]);
  const changes = useMemo(() => getOrganizationChanges(original, draft), [original, draft]);
  const artworkById = useMemo(() => new Map(collections.flatMap((collection) => collection.artworks.map((artwork) => [artwork.id, artwork] as const))), [baseline]);
  const collectionById = useMemo(() => new Map(collections.map((collection) => [collection.id, collection])), [baseline]);
  const reviewCounts = useMemo(() => new Map(collections.map((collection) => [collection.id, getCollectionReviewSummary({
    ...collection,
    artworks: (draft[collection.id] ?? []).map((id) => artworkById.get(id)!).filter(Boolean),
  }).artworkCount])), [artworkById, baseline, draft]);
  const dirty = changes.length > 0 && !needsReload;
  const busy = isSaving || editorBusy;
  const editorOpen = isCatalogEditor(catalogAction);
  const disabled = busy || needsReload || Boolean(activeId);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => (dirty || busy || editorOpen) && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!dirty && !busy && !editorOpen) return;
    function beforeUnload(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = ""; }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [busy, dirty, editorOpen]);

  function openCatalogAction(action: CatalogAction) {
    if (disabled) return;
    setError(null); setSuccess(null); setModal(null);
    if (dirty) setPendingCatalogAction(action);
    else setCatalogAction(action);
  }

  async function refreshAfterMutation() {
    const snapshot = await loadEditableContent();
    if (!alive.current) return;
    await refreshContent(snapshot);
    acceptSnapshot(snapshot.collections);
  }

  async function catalogSaved() {
    // The form has already committed. Never throw back into its create handler:
    // a failed refresh must not offer a second insert or remove the uploaded image.
    if (!alive.current) return;
    try {
      await refreshAfterMutation();
      if (alive.current) setSuccess("Contenido guardado correctamente.");
    } catch {
      if (alive.current) {
        setNeedsReload(true);
        setError("El contenido se ha guardado, pero no se ha podido recargar. Recarga el catálogo antes de seguir editando; no vuelvas a crear la misma obra.");
      }
    } finally { if (alive.current) setCatalogAction(null); }
  }

  async function mutateCatalog(operation: () => Promise<unknown>, message: string) {
    if (busy || dirty || needsReload) return;
    setIsSaving(true); setError(null); setSuccess(null);
    let committed = false;
    try {
      await operation(); committed = true;
      if (!alive.current) return;
      await refreshAfterMutation();
      if (alive.current) { setCatalogAction(null); setSuccess(message); }
    } catch (failure) {
      if (!alive.current) return;
      if (committed) {
        setCatalogAction(null); setNeedsReload(true);
        setError("El cambio se ha guardado, pero falta recargar el catálogo. No repitas la operación; recarga para ver el resultado.");
      } else setError(getEditableOperationErrorMessage(failure, "No se pudo actualizar el contenido."));
    } finally { if (alive.current) setIsSaving(false); }
  }

  function commit(next: OrganizationState, message: string) {
    if (next === draft || JSON.stringify(next) === JSON.stringify(draft)) return;
    setHistory((previous) => ({ past: [...previous.past, previous.present].slice(-50), present: next, future: [] }));
    setError(null); setSuccess(null); setAnnouncement(message);
  }

  function focusArtwork(artworkId: string) {
    requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(`[data-artwork-id="${window.CSS.escape(artworkId)}"] .organizer-drag-handle`)?.focus({ preventScroll: true });
    });
  }

  function move(artworkId: string, targetId: string, index: number) {
    if (busy || needsReload) return;
    const sourceId = Object.keys(draft).find((id) => draft[id].includes(artworkId));
    if (!sourceId || collectionById.get(sourceId)?.supportKind !== collectionById.get(targetId)?.supportKind) return;
    const next = moveArtwork(draft, artworkId, targetId, index);
    commit(next, `${artworkById.get(artworkId)?.title.trim() || "Sin título"}, posición ${next[targetId]?.indexOf(artworkId) + 1} en ${collectionById.get(targetId)?.title}. Cambio pendiente de guardar.`);
    if (targetId !== leftId && targetId !== rightId) setSelectedPanels((current) => ({ ...current, [activeKind]: { left: leftId, right: targetId } }));
    focusArtwork(artworkId);
  }

  function selectLeft(id: string) {
    if (!branchCollections.some((collection) => collection.id === id)) return;
    setSelectedPanels((current) => ({ ...current, [activeKind]: { left: id, right: id === rightId ? leftId : rightId } }));
  }
  function selectRight(id: string) {
    if (!branchCollections.some((collection) => collection.id === id)) return;
    setSelectedPanels((current) => ({ ...current, [activeKind]: { left: id === leftId ? rightId : leftId, right: id } }));
  }

  async function reloadCatalog() {
    setIsSaving(true); setError(null);
    try {
      const snapshot = await loadEditableContent();
      if (!alive.current) return;
      await refreshContent(snapshot);
      acceptSnapshot(snapshot.collections);
      setModal(null); setSuccess("Catálogo actualizado.");
    } catch (failure) {
      if (alive.current) { setError(getArtworkOrganizationErrorMessage(failure)); setModal(null); }
    } finally { if (alive.current) setIsSaving(false); }
  }

  async function save() {
    if (busy || !baseline || !dirty) return false;
    setIsSaving(true); setError(null); setSuccess(null);
    let committed = false;
    try {
      await saveArtworkOrganization(baseline, draft);
      committed = true;
      if (!alive.current) return;
      const snapshot = await loadEditableContent();
      if (!alive.current) return;
      await refreshContent(snapshot);
      acceptSnapshot(snapshot.collections);
      setSuccess("Organización guardada. Las colecciones se han actualizado respetando sus reglas de publicación.");
      setAnnouncement("Cambios guardados correctamente.");
      return true;
    } catch (failure) {
      if (!alive.current) return;
      if (committed) {
        setPendingCatalogAction(null);
        setNeedsReload(true);
        setError("La organización se ha guardado, pero no se ha podido recargar la vista. Recarga el catálogo antes de seguir editando; no necesitas volver a guardar.");
      } else setError(getArtworkOrganizationErrorMessage(failure));
      return false;
    } finally {
      if (alive.current) { setIsSaving(false); setModal(null); }
    }
  }

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const collisionDetection: CollisionDetection = useCallback((args) => {
    if (!args.pointerCoordinates) return closestCenter(args);
    const hits = pointerWithin(args);
    const artworkHits = hits.filter((hit) => args.droppableContainers.find((container) => container.id === hit.id)?.data.current?.type === "artwork");
    return artworkHits.length ? artworkHits : hits;
  }, []);

  function finishDrag({ active, over }: DragEndEvent) {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const targetId = over.data.current?.collectionId as string | undefined;
    if (!targetId || !draft[targetId]) return;
    const overArtwork = over.data.current?.type === "artwork" ? String(over.id) : null;
    const targetIndex = overArtwork ? draft[targetId].indexOf(overArtwork) : draft[targetId].length;
    move(String(active.id), targetId, targetIndex);
  }

  const activeArtwork = activeId ? artworkById.get(activeId) : null;
  const moveArtworkItem = modal?.kind === "move" ? artworkById.get(modal.artworkId) : null;
  const changedCollections = new Set(changes.flatMap((change) => [change.fromCollectionId, change.toCollectionId]));
  const movedToHidden = changes.filter((change) => change.fromCollectionId !== change.toCollectionId
    && artworkById.get(change.artworkId)?.isPublished && !collectionById.get(change.toCollectionId)?.isPublished);
  const searchQuery = normalizeSearch(search.trim());
  const hasFilters = Boolean(searchQuery) || filter !== "all";
  const branchMatches = hasFilters ? branchCollections.flatMap((collection) => (draft[collection.id] ?? []).flatMap((id) => {
    const artwork = artworkById.get(id);
    return artwork && matchesArtwork(artwork, collection, searchQuery, filter) ? [{ artwork, collection }] : [];
  })) : [];

  return (
    <main className="artwork-organizer" aria-busy={busy}>
      <header className="organizer-header">
        <div className="organizer-brand"><span>TONI CRESPO · EDICIÓN</span><h1>Gestor de contenido</h1><p>Tu archivo de obras, fácil de encontrar y de cuidar.</p></div>
        <div className="organizer-header-actions">
          <button type="button" className="admin-secondary-button" disabled={busy} onClick={() => navigate(returnTo)}><ArrowLeft aria-hidden="true" /> Volver a la web</button>
          <button type="button" className="organizer-icon-button" aria-label="Cerrar sesión" title="Cerrar sesión" disabled={busy} onClick={() => setModal({ kind: "logout" })}><LogOut aria-hidden="true" /></button>
          <button type="button" className="admin-primary-button" disabled={!dirty || disabled} onClick={() => setModal({ kind: "save" })}>
            {isSaving ? <LoaderCircle className="admin-button-spinner" aria-hidden="true" /> : <Save aria-hidden="true" />} {isSaving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
      </header>
      <div className="content-manager-navigation">
        <nav className="content-manager-branches" aria-label="Ramas del catálogo">
          {(["canvas", "paper"] as const).map((kind) => <button key={kind} type="button" aria-label={kind === "canvas" ? "Lienzos" : "Obra en papel"} aria-pressed={activeKind === kind} disabled={busy || Boolean(activeId)} onClick={() => { setActiveKind(kind); setSearch(""); setFilter("all"); }}>
            <span>{kind === "canvas" ? "Lienzos" : "Obra en papel"}</span><small>{collections.filter((collection) => collection.supportKind === kind).reduce((total, collection) => total + collection.artworks.length, 0)} obras</small>
          </button>)}
        </nav>
        <div className="content-manager-create">
          <button type="button" disabled={disabled || baseline === null} onClick={() => openCatalogAction({ kind: "new-collection", supportKind: activeKind })}><FolderPlus aria-hidden="true" /> Nueva colección</button>
          <button type="button" className="admin-primary-button" disabled={disabled || !leftId} onClick={() => openCatalogAction({ kind: "new-artwork", collectionId: leftId })}><Plus aria-hidden="true" /> Nueva obra</button>
        </div>
      </div>
      <div className="organizer-toolbar">
        <label className="organizer-search"><Search aria-hidden="true" /><span className="sr-only">Buscar obra</span><input type="search" placeholder="Buscar por título, técnica o medidas…" value={search} disabled={busy || Boolean(activeId)} onChange={(event) => setSearch(event.target.value)} /></label>
        <label className="content-manager-filter"><span className="sr-only">Filtrar obras</span><select value={filter} disabled={busy || Boolean(activeId)} onChange={(event) => setFilter(event.target.value as ArtworkFilter)}><option value="all">Todas las obras</option><option value="visible">Visibles</option><option value="hidden">Ocultas</option><option value="unavailable">No disponibles</option><option value="review">Por revisar</option></select></label>
        <div className="organizer-history">
          <button type="button" className="organizer-icon-button" aria-label="Deshacer" title="Deshacer" disabled={!history.past.length || disabled} onClick={() => {
            setHistory((previous) => ({ past: previous.past.slice(0, -1), present: previous.past[previous.past.length - 1], future: [previous.present, ...previous.future] }));
            setSuccess(null); setError(null); setAnnouncement("Último movimiento deshecho.");
          }}><Undo2 aria-hidden="true" /></button>
          <button type="button" className="organizer-icon-button" aria-label="Rehacer" title="Rehacer" disabled={!history.future.length || disabled} onClick={() => {
            setHistory((previous) => ({ past: [...previous.past, previous.present], present: previous.future[0], future: previous.future.slice(1) }));
            setSuccess(null); setError(null); setAnnouncement("Movimiento recuperado.");
          }}><Redo2 aria-hidden="true" /></button>
          <button type="button" className="admin-secondary-button" disabled={!dirty || disabled} onClick={() => setModal({ kind: "discard" })}>Descartar cambios</button>
        </div>
        <p className="organizer-status" role="status">{needsReload ? "Guardado · pendiente de recargar" : dirty ? `${changes.length} obras con cambios · ${changedCollections.size} colecciones` : "Sin cambios pendientes"}</p>
      </div>
      {hasFilters ? <section className="content-manager-search-results" aria-label="Resultados en toda la rama">
        <p>{branchMatches.length} coincidencias en {activeKind === "canvas" ? "Lienzos" : "Obra en papel"}</p>
        <div>{branchMatches.slice(0, 40).map(({ artwork, collection }) => <button key={artwork.id} type="button" disabled={disabled} onClick={() => { selectLeft(collection.id); focusArtwork(artwork.id); }}>
          {artwork.thumbnailUrl || artwork.imageUrl ? <img src={artwork.thumbnailUrl || artwork.imageUrl} alt="" loading="lazy" /> : <ImageOff aria-label="Sin imagen" />}<span><strong>{artwork.title.trim() || "Sin título"}</strong><small>{collection.title}</small><ArtworkReviewBadge artwork={artwork} /></span>
        </button>)}</div>
        {branchMatches.length > 40 ? <p>Se muestran las primeras 40 coincidencias. Afina la búsqueda para localizar tu obra.</p> : null}
      </section> : null}
      <p className="organizer-notice">Arrastra desde <GripVertical aria-label="el asa de puntos" /> para ordenar o mover dentro de esta rama. Guarda el orden con «Guardar cambios». Usa <MoreHorizontal aria-label="Gestionar" /> para editar la ficha, ocultar, eliminar o marcar una obra como no disponible.</p>
      {baseline && !branchCollections.some((collection) => collection.isRecent) ? <p className="organizer-notice">Pendiente de activar el gestor en Supabase: esta rama todavía no tiene su colección permanente «Obras recientes». La actualización de la base de datos la creará sin mover tus obras existentes.</p> : null}
      {search || filter !== "all" ? <p className="organizer-notice">Los filtros solo afectan a las miniaturas. Los números siguen indicando la posición real de cada obra; las demás se conservan.</p> : null}
      {error && !catalogAction && !pendingCatalogAction ? <div className="organizer-error" role="alert"><p>{error}</p><button type="button" className="admin-secondary-button" disabled={busy} onClick={() => dirty ? setModal({ kind: "reload" }) : void reloadCatalog()}><RotateCcw aria-hidden="true" /> Recargar catálogo</button></div> : null}
      {success ? <p className="organizer-success" role="status"><Check aria-hidden="true" /> {success}</p> : null}
      <span className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</span>

      {baseline === null ? (
        <div className="organizer-empty" role="status">
          <h2>{contentError ? "No se pudo cargar el catálogo" : "Cargando tus obras…"}</h2>
          {contentError ? <><p>{contentError}</p><button type="button" className="admin-secondary-button" onClick={() => void refreshContent()}>Reintentar</button></> : <LoaderCircle className="admin-button-spinner" aria-hidden="true" />}
        </div>
      ) : !branchCollections.length ? (
        <div className="organizer-empty"><h2>Todavía no hay colecciones en esta rama</h2><p>Usa «Nueva colección» para empezar. Lienzos y Obra en papel mantienen archivos independientes.</p></div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={({ active }) => { setActiveId(String(active.id)); setSuccess(null); }} onDragEnd={finishDrag} onDragCancel={() => { setActiveId(null); setAnnouncement("Movimiento cancelado. El orden no ha cambiado."); }} accessibility={{
          screenReaderInstructions: { draggable: "Para arrastrar, pulsa espacio. Usa las flechas para elegir posición y espacio para soltar. Escape cancela. También puedes usar Adelantar, Retrasar y Mover." },
          announcements: {
            onDragStart: ({ active }) => `Has recogido ${artworkById.get(String(active.id))?.title.trim() || "una obra sin título"}.`,
            onDragOver: ({ over }) => over ? `Destino: ${collectionById.get(over.data.current?.collectionId)?.title ?? "colección"}.` : "Fuera de las colecciones. Suelta para cancelar.",
            onDragEnd: ({ over }) => over ? "Obra colocada. Revisa y guarda los cambios." : "Movimiento cancelado.",
            onDragCancel: () => "Movimiento cancelado.",
          },
        }}>
          <div className="organizer-workspace">
            <aside className="organizer-sidebar"><h2>{activeKind === "canvas" ? "Lienzos" : "Obra en papel"}</h2><p>{branchCollections.reduce((total, collection) => total + (draft[collection.id]?.length ?? 0), 0)} obras · {branchCollections.length} colecciones</p><nav className="organizer-collection-list" aria-label="Todas las colecciones">
              {branchCollections.map((collection) => <CollectionShortcut key={collection.id} collection={collection} count={draft[collection.id]?.length ?? 0} reviewCount={reviewCounts.get(collection.id) ?? 0} active={leftId === collection.id} disabled={busy || needsReload} onSelect={() => selectLeft(collection.id)} />)}
            </nav><p>También puedes soltar una obra sobre el nombre de una colección para colocarla al final.</p></aside>
            <div className="organizer-board">
              <CollectionPane label="Colección de origen" collection={collectionById.get(leftId)} collections={branchCollections} state={draft} artworkById={artworkById} reviewCounts={reviewCounts} search={search} filter={filter} disabled={busy || needsReload} isDragging={Boolean(activeId)} onSelect={selectLeft} onMove={move} onOpenMove={(artworkId) => setModal({ kind: "move", artworkId })} onCatalogAction={openCatalogAction} />
              {branchCollections.length > 1 ? <CollectionPane label="Colección de destino" collection={collectionById.get(rightId)} collections={branchCollections} state={draft} artworkById={artworkById} reviewCounts={reviewCounts} search={search} filter={filter} disabled={busy || needsReload} isDragging={Boolean(activeId)} onSelect={selectRight} onMove={move} onOpenMove={(artworkId) => setModal({ kind: "move", artworkId })} onCatalogAction={openCatalogAction} /> : <div className="organizer-empty"><h2>Un espacio para comparar</h2><p>Crea otra colección de esta rama y podrás mover obras entre ambas. «Obras recientes» seguirá en primer lugar.</p></div>}
            </div>
          </div>
          {createPortal(<DragOverlay dropAnimation={null}>{activeArtwork ? <div className="organizer-drag-preview"><ArtworkThumbnail artwork={activeArtwork} /><strong>{activeArtwork.title.trim() || "Sin título"}</strong></div> : null}</DragOverlay>, document.body)}
        </DndContext>
      )}

      {blocker.state !== "blocked" ? <>
      {moveArtworkItem ? <MoveDialog artwork={moveArtworkItem} collections={branchCollections} state={draft} preferredTarget={rightId} onClose={() => setModal(null)} onMove={(id, index) => { move(moveArtworkItem.id, id, index); setModal(null); }} /> : null}
      {modal?.kind === "save" ? <OrganizerDialog title="Guardar organización" busy={isSaving} onClose={() => setModal(null)}>
        <p>Se actualizarán {changes.length} obras en {changedCollections.size} colecciones. Se conservan las imágenes, los textos y el estado publicado u oculto de cada obra. Una obra aparece en la web cuando tanto ella como su colección son visibles.</p>
        {movedToHidden.length > 0 ? <p className="organizer-notice">{movedToHidden.length} obras publicadas se moverán a colecciones ocultas. No se mostrarán dentro de esas colecciones al público, aunque conserven su estado publicado.</p> : null}
        <ul className="organizer-summary-list">{changes.slice(0, 50).map((change) => <li key={change.artworkId}><strong>{artworkById.get(change.artworkId)?.title.trim() || "Sin título"}</strong><span>{collectionById.get(change.fromCollectionId)?.title} · {change.fromIndex + 1} → {collectionById.get(change.toCollectionId)?.title} · {change.toIndex + 1}</span></li>)}</ul>
        {changes.length > 50 ? <p>Y {changes.length - 50} cambios de posición más.</p> : null}
        <div className="organizer-dialog-actions"><button type="button" className="admin-secondary-button" disabled={isSaving} onClick={() => setModal(null)}>Seguir organizando</button><button type="button" className="admin-primary-button" disabled={isSaving} onClick={() => void save()}>{isSaving ? "Guardando…" : "Guardar organización"}</button></div>
      </OrganizerDialog> : null}
      {modal?.kind === "discard" || modal?.kind === "reload" ? <OrganizerDialog title={modal.kind === "reload" ? "Recargar el catálogo" : "Descartar cambios"} busy={isSaving} onClose={() => setModal(null)}>
        <p>{modal.kind === "reload" ? "Se descartará este borrador y se cargará la última organización guardada en Supabase. No se borrará ninguna obra." : "Se recuperará la organización con la que abriste el panel. No se modificará la web ni se borrará ninguna obra."}</p>
        <div className="organizer-dialog-actions"><button type="button" className="admin-secondary-button" disabled={isSaving} onClick={() => setModal(null)}>Seguir organizando</button><button type="button" className="admin-primary-button" disabled={isSaving} onClick={() => {
          if (modal.kind === "reload") { void reloadCatalog(); return; }
          setHistory(cleanHistory(original)); setModal(null); setError(null); setSuccess(null); setAnnouncement("Borrador descartado.");
        }}>{modal.kind === "reload" ? "Descartar y recargar" : "Descartar borrador"}</button></div>
      </OrganizerDialog> : null}
      {modal?.kind === "logout" ? <OrganizerDialog title="Cerrar sesión" onClose={() => setModal(null)}><p>{dirty ? "Tienes cambios sin guardar. Si cierras sesión, se descartará este borrador; las obras publicadas no cambiarán." : "¿Quieres salir del modo edición?"}</p><div className="organizer-dialog-actions"><button type="button" className="admin-secondary-button" onClick={() => setModal(null)}>Seguir organizando</button><button type="button" className="admin-primary-button" onClick={() => void signOut()}>{dirty ? "Descartar y cerrar sesión" : "Confirmar cierre de sesión"}</button></div></OrganizerDialog> : null}
      {pendingCatalogAction ? <OrganizerDialog title="Orden pendiente de guardar" busy={busy} onClose={() => setPendingCatalogAction(null)}>
        <p>Tienes movimientos pendientes. Guarda o descarta ese orden antes de editar el contenido. No se eliminará ninguna obra al descartar el orden.</p>
        {error ? <p className="organizer-error" role="alert">{error}</p> : null}
        <div className="organizer-dialog-actions"><button type="button" disabled={busy} onClick={() => setPendingCatalogAction(null)}>Seguir organizando</button>
          <button type="button" disabled={busy || needsReload} onClick={() => { setHistory(cleanHistory(original)); setError(null); setCatalogAction(pendingCatalogAction); setPendingCatalogAction(null); }}>Descartar orden y continuar</button>
          <button type="button" className="admin-primary-button" disabled={busy || needsReload} onClick={() => void (async () => {
            const nextAction = pendingCatalogAction;
            if (await save() && alive.current) { setPendingCatalogAction(null); setCatalogAction(nextAction); }
          })()}>Guardar y continuar</button></div>
      </OrganizerDialog> : null}
      </> : null}
      {catalogAction ? <ContentManagerDialogs action={catalogAction} collections={collections} busy={busy} active={blocker.state !== "blocked"} error={error}
        onClose={() => { if (!busy) setCatalogAction(null); }} onAction={(action) => { setError(null); setCatalogAction(action); }}
        onSaved={catalogSaved} onPendingChange={setEditorBusy} onMutate={mutateCatalog} /> : null}
      {blocker.state === "blocked" ? <OrganizerDialog title="Cambios sin guardar" busy={busy} onClose={() => blocker.reset()}><p>{busy ? "Espera a que termine el guardado antes de salir." : "Si sales ahora se descartará el borrador o la ficha abierta. Puedes volver al panel para guardar o seguir organizando."}</p><div className="organizer-dialog-actions"><button type="button" className="admin-secondary-button" disabled={busy} onClick={() => blocker.reset()}>Seguir organizando</button><button type="button" className="admin-primary-button" disabled={busy} onClick={() => blocker.proceed()}>Salir sin guardar</button></div></OrganizerDialog> : null}
    </main>
  );
}

function CollectionShortcut({ collection, count, reviewCount, active, disabled, onSelect }: { collection: EditableCollection; count: number; reviewCount: number; active: boolean; disabled: boolean; onSelect: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `collection:${collection.id}`, data: { type: "collection", collectionId: collection.id }, disabled });
  return <button ref={setNodeRef} type="button" data-drop-collection-id={collection.id} className={`organizer-collection-item${active ? " is-active" : ""}${isOver ? " is-over" : ""}${!collection.isPublished ? " is-hidden" : ""}`} disabled={disabled} aria-pressed={active} onClick={onSelect}>
    <div><strong>{collection.isRecent ? <Pin aria-hidden="true" /> : null}{collection.title}</strong><small>{collection.isRecent ? "Siempre primero" : supportName(collection)}{!collection.isPublished ? " · Oculta" : ""}</small><CollectionReviewBadge count={reviewCount} /></div><span className="organizer-count">{count}</span>
  </button>;
}

type PaneProps = {
  label: string; collection?: EditableCollection; collections: EditableCollection[]; state: OrganizationState;
  artworkById: Map<string, CurrentArtwork>; search: string; disabled: boolean; isDragging: boolean;
  filter: ArtworkFilter;
  reviewCounts: Map<string, number>;
  onSelect: (id: string) => void; onMove: (artworkId: string, collectionId: string, index: number) => void; onOpenMove: (id: string) => void;
  onCatalogAction: (action: CatalogAction) => void;
};
function CollectionPane(props: PaneProps) {
  const { collection, label, state, search, artworkById, disabled } = props;
  const { setNodeRef, isOver } = useDroppable({ id: `pane:${collection?.id ?? label}`, data: { type: "collection", collectionId: collection?.id }, disabled: disabled || !collection });
  if (!collection) return null;
  const ids = state[collection.id] ?? [];
  const query = normalizeSearch(search.trim());
  const filtered = ids.filter((id) => {
    const artwork = artworkById.get(id);
    return artwork && matchesArtwork(artwork, collection, query, props.filter);
  });
  const hiddenCount = ids.filter((id) => !artworkById.get(id)?.isPublished).length;
  return <section className="organizer-pane" aria-label={label} data-collection-id={collection.id}>
    <header className="organizer-pane-header"><label>{label}<select value={collection.id} disabled={disabled || props.isDragging} onChange={(event) => props.onSelect(event.target.value)}>{props.collections.map((item) => <option key={item.id} value={item.id}>{item.title}{item.isRecent ? " · Siempre primero" : ""}{!item.isPublished ? " · Oculta" : ""}{props.reviewCounts.get(item.id) ? ` · ${props.reviewCounts.get(item.id)} por revisar` : ""}</option>)}</select></label>
      <div className="content-manager-pane-heading"><h2>{collection.title}</h2><button type="button" className="organizer-icon-button" aria-label={`Gestionar colección ${collection.title}`} disabled={disabled || props.isDragging} onClick={() => props.onCatalogAction({ kind: "manage-collection", collectionId: collection.id })}><Settings2 aria-hidden="true" /></button></div>
      <p className="organizer-pane-summary">{ids.length} obras{hiddenCount ? ` · ${hiddenCount} ocultas` : ""}{!collection.isPublished ? " · Colección oculta al público" : ""}{collection.isRecent ? " · Siempre en primer lugar" : ""}</p>
      <CollectionReviewBadge count={props.reviewCounts.get(collection.id) ?? 0} />
      <button type="button" className="content-manager-add-artwork" disabled={disabled || props.isDragging} onClick={() => props.onCatalogAction({ kind: "new-artwork", collectionId: collection.id })}><Plus aria-hidden="true" /> Añadir obra aquí</button>
    </header>
    <div ref={setNodeRef} className={`organizer-pane-body${isOver ? " is-over" : ""}`}>
      <SortableContext items={filtered} strategy={rectSortingStrategy}>
        <div className="organizer-grid">{filtered.map((id) => <SortableArtwork key={id} artwork={artworkById.get(id)!} collectionId={collection.id} index={ids.indexOf(id)} total={ids.length} disabled={disabled} onMove={props.onMove} onOpenMove={props.onOpenMove} onManage={(artworkId) => props.onCatalogAction({ kind: "manage-artwork", artworkId })} onEdit={(artworkId) => props.onCatalogAction({ kind: "edit-artwork", artworkId })} />)}</div>
      </SortableContext>
      {!filtered.length ? <div className="organizer-empty"><LayoutGrid aria-hidden="true" /><h3>{ids.length ? "No hay coincidencias" : "Colección vacía"}</h3><p>{ids.length ? "Prueba otra búsqueda. Las demás obras siguen en su sitio." : "Arrastra aquí una obra o usa «Mover» desde otra colección."}</p></div> : null}
      <DropEnd collection={collection} disabled={disabled} />
    </div>
  </section>;
}

function DropEnd({ collection, disabled }: { collection: EditableCollection; disabled: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `end:${collection.id}`, data: { type: "end", collectionId: collection.id }, disabled });
  return <div ref={setNodeRef} className={`organizer-drop-end${isOver ? " is-over" : ""}`} aria-label={`Soltar al final de ${collection.title}`}>Soltar aquí para colocar al final</div>;
}

function SortableArtwork({ artwork, collectionId, index, total, disabled, onMove, onOpenMove, onManage, onEdit }: {
  artwork: CurrentArtwork; collectionId: string; index: number; total: number; disabled: boolean;
  onMove: PaneProps["onMove"]; onOpenMove: PaneProps["onOpenMove"];
  onManage: (artworkId: string) => void;
  onEdit: (artworkId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging, isOver } = useSortable({ id: artwork.id, data: { type: "artwork", collectionId }, disabled });
  const title = artwork.title.trim() || "Sin título";
  return <article ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} data-artwork-id={artwork.id} className={`organizer-artwork${isDragging ? " is-dragging" : ""}${isOver ? " is-over" : ""}`} aria-label={`${title}, posición ${index + 1}`}>
    <div className="organizer-artwork-top"><button ref={setActivatorNodeRef} type="button" className="organizer-drag-handle" {...attributes} {...listeners} aria-label={`Arrastrar ${title}`} disabled={disabled} onContextMenu={(event) => event.preventDefault()}><GripVertical aria-hidden="true" /></button><span>#{index + 1}</span><button type="button" className="content-manager-card-menu" aria-label={`Gestionar ${title}`} disabled={disabled} onClick={() => onManage(artwork.id)}><MoreHorizontal aria-hidden="true" /></button></div>
    <ArtworkThumbnail artwork={artwork} />
    <h3 className="organizer-artwork-title">{title}</h3>
    {!artwork.isPublished || artwork.isAvailable === false ? <div className="content-manager-badges">{!artwork.isPublished ? <span><EyeOff aria-hidden="true" /> Oculta</span> : null}{artwork.isAvailable === false ? <span>No disponible</span> : null}</div> : null}
    <small className="organizer-artwork-details">{[artwork.technique, artwork.dimensions].filter(Boolean).join(" · ") || "Sin ficha técnica"}</small>
    <ArtworkReviewNotice artwork={artwork} disabled={disabled} onEdit={() => onEdit(artwork.id)} />
    <div className="organizer-artwork-actions"><button type="button" aria-label={`Adelantar ${title}`} title="Adelantar una posición" disabled={disabled || index === 0} onClick={() => onMove(artwork.id, collectionId, index - 1)}><ArrowUp aria-hidden="true" /></button><button type="button" aria-label={`Retrasar ${title}`} title="Retrasar una posición" disabled={disabled || index === total - 1} onClick={() => onMove(artwork.id, collectionId, index + 1)}><ArrowDown aria-hidden="true" /></button><button type="button" aria-label={`Mover ${title}`} disabled={disabled} onClick={() => onOpenMove(artwork.id)}><ArrowRightLeft aria-hidden="true" /> Mover</button></div>
  </article>;
}

function ArtworkThumbnail({ artwork }: { artwork: CurrentArtwork }) {
  const [failed, setFailed] = useState(false);
  const [useFullImage, setUseFullImage] = useState(false);
  const source = !useFullImage && artwork.thumbnailUrl ? artwork.thumbnailUrl : artwork.imageUrl;
  return <div className="organizer-thumbnail">{failed || !source ? <ImageOff aria-label="Miniatura no disponible" /> : <img src={source} alt={artwork.title} draggable={false} loading="lazy" onError={() => !useFullImage && artwork.thumbnailUrl ? setUseFullImage(true) : setFailed(true)} />}</div>;
}

function MoveDialog({ artwork, collections, state, preferredTarget, onClose, onMove }: {
  artwork: CurrentArtwork; collections: EditableCollection[]; state: OrganizationState; preferredTarget: string;
  onClose: () => void; onMove: (collectionId: string, index: number) => void;
}) {
  const current = Object.keys(state).find((id) => state[id].includes(artwork.id))!;
  const firstTarget = preferredTarget && preferredTarget !== current ? preferredTarget : collections.find((item) => item.id !== current)?.id ?? current;
  const [targetId, setTargetId] = useState(firstTarget);
  const [position, setPosition] = useState(String(state[firstTarget].filter((id) => id !== artwork.id).length));
  const ids = state[targetId].filter((id) => id !== artwork.id);
  const targetCollection = collections.find((collection) => collection.id === targetId);
  const titles = new Map(collections.flatMap((collection) => collection.artworks.map((item) => [item.id, item.title.trim() || "Sin título"])));
  function submit(event: FormEvent) { event.preventDefault(); onMove(targetId, Number(position)); }
  return <OrganizerDialog title={`Mover ${artwork.title.trim() || "Sin título"}`} onClose={onClose}>
    <p>Elige dónde colocar esta obra. Solo se moverá cuando guardes la organización.</p>
    <form onSubmit={submit} className="organizer-dialog-content">
      <label>Colección destino<select value={targetId} onChange={(event) => { setTargetId(event.target.value); setPosition(String(state[event.target.value].filter((id) => id !== artwork.id).length)); }}>{collections.map((item) => <option key={item.id} value={item.id}>{item.title} · {supportName(item)}{!item.isPublished ? " · Oculta" : ""}</option>)}</select></label>
      {targetCollection && !targetCollection.isPublished ? <p className="organizer-notice">Esta colección está oculta. La obra no se mostrará dentro de ella al público; no se cambiará el estado publicado u oculto de la obra.</p> : null}
      <label>Posición<select value={position} onChange={(event) => setPosition(event.target.value)}>{ids.map((id, index) => <option key={id} value={index}>{index + 1} · Antes de {titles.get(id) ?? "esta obra"}</option>)}<option value={ids.length}>{ids.length + 1} · {ids.length ? "Al final de la colección" : "Primera obra de la colección"}</option></select></label>
      <div className="organizer-dialog-actions"><button type="button" className="admin-secondary-button" onClick={onClose}>Cancelar</button><button type="submit" className="admin-primary-button">Aplicar al borrador</button></div>
    </form>
  </OrganizerDialog>;
}
