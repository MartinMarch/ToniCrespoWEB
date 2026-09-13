import { useSitePreferences } from "../../app/sitePreferences";
import "../../styles/artwork-availability.css";

/** Old records and generic photographs have no flag and must not gain a badge. */
export function ArtworkAvailability({ isAvailable }: { isAvailable?: boolean }) {
  const { labels } = useSitePreferences();

  if (isAvailable !== false) return null;

  return <small className="artwork-availability">{labels.status.artworkUnavailable}</small>;
}
