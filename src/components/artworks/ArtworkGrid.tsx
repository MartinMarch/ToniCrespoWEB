import type { CurrentArtwork } from "../../types/currentSite";
import { ArtworkCard } from "./ArtworkCard";

type ArtworkGridProps = {
  artworks: CurrentArtwork[];
};

export function ArtworkGrid({ artworks }: ArtworkGridProps) {
  if (artworks.length === 0) {
    return <p className="empty-state">No se han encontrado imágenes.</p>;
  }

  return (
    <div className="artwork-grid">
      {artworks.map((artwork) => (
        <ArtworkCard key={artwork.id} artwork={artwork} />
      ))}
    </div>
  );
}
