import { LoadingImage } from "../ui/Loaders";
import type { CurrentArtwork } from "../../types/currentSite";

type ArtworkCardProps = {
  artwork: CurrentArtwork;
};

export function ArtworkCard({ artwork }: ArtworkCardProps) {
  const caption = artwork.caption.trim();
  const shouldShowCaption =
    !artwork.technique && !artwork.dimensions && caption && caption.toLowerCase() !== artwork.title.toLowerCase();

  return (
    <article className="artwork-card">
      <a href={artwork.imageUrl} target="_blank" rel="noreferrer" className="artwork-card__image">
        <LoadingImage src={artwork.imageUrl} alt={artwork.title} loading="lazy" />
      </a>
      <div className="card-body">
        <h3>{artwork.title}</h3>
        {artwork.technique ? <p>{artwork.technique}</p> : null}
        {artwork.dimensions ? <p>{artwork.dimensions}</p> : null}
        {shouldShowCaption ? <p>{caption}</p> : null}
      </div>
    </article>
  );
}
