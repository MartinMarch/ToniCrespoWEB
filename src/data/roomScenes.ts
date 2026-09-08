import type { SiteLabels } from "../app/sitePreferences";
import type { RoomScene } from "../lib/artworkRoomGeometry";
import smallOak from "../assets/rooms/small-oak-v2.webp";
import smallWalnut from "../assets/rooms/small-walnut-v2.webp";
import smallStone from "../assets/rooms/small-stone-v2.webp";
import mediumLinen from "../assets/rooms/medium-linen-v2.webp";
import mediumSideboard from "../assets/rooms/medium-sideboard-v2.webp";
import mediumReading from "../assets/rooms/medium-reading-v2.webp";
import largeTravertine from "../assets/rooms/large-travertine-v2.webp";
import largeGallery from "../assets/rooms/large-gallery-v2.webp";
import largeCharcoal from "../assets/rooms/large-charcoal-v2.webp";

export type ArtworkRoomScene = RoomScene & { labelKey: keyof SiteLabels["rooms"] };

/**
 * AI-generated rooms: furniture widths are design references, not surveyed
 * measurements. Image percentages and safe wall areas were checked against the
 * final 1536 × 1024 assets. Never crop a background or scale axes independently.
 * See context/mockup-backgrounds.md for calibration and generation provenance.
 */
export const roomScenes: readonly ArtworkRoomScene[] = [
  {
    id: "small-oak", labelKey: "oakNook", backgroundUrl: smallOak,
    imageAspectRatio: 1.5, brightness: 0.91, sizeRange: { min: 0, max: 65 },
    reference: { widthCm: 100, imageWidthPercent: 65.1 },
    wall: { left: 22, top: 5, right: 88, bottom: 53 }, artworkCenter: { x: 50, y: 29 },
  },
  {
    id: "small-walnut", labelKey: "walnutAlcove", backgroundUrl: smallWalnut,
    imageAspectRatio: 1.5, brightness: 0.87, sizeRange: { min: 0, max: 65 },
    reference: { widthCm: 100, imageWidthPercent: 60.2 },
    wall: { left: 10, top: 5, right: 90, bottom: 54 }, artworkCenter: { x: 50, y: 29.5 },
  },
  {
    id: "small-stone", labelKey: "stoneNook", backgroundUrl: smallStone,
    imageAspectRatio: 1.5, brightness: 0.92, sizeRange: { min: 0, max: 65 },
    reference: { widthCm: 110, imageWidthPercent: 53.4 },
    wall: { left: 16, top: 5, right: 90, bottom: 60 }, artworkCenter: { x: 50, y: 32.5 },
  },
  {
    id: "medium-linen", labelKey: "linenRoom", backgroundUrl: mediumLinen,
    imageAspectRatio: 1.5, brightness: 0.94, sizeRange: { min: 65, max: 160 },
    reference: { widthCm: 220, imageWidthPercent: 74.7 },
    wall: { left: 10, top: 4, right: 90, bottom: 52 }, artworkCenter: { x: 50, y: 28 },
  },
  {
    id: "medium-sideboard", labelKey: "walnutGallery", backgroundUrl: mediumSideboard,
    imageAspectRatio: 1.5, brightness: 0.87, sizeRange: { min: 65, max: 160 },
    reference: { widthCm: 200, imageWidthPercent: 58.5 },
    wall: { left: 12, top: 4, right: 90, bottom: 62 }, artworkCenter: { x: 50, y: 33 },
  },
  {
    id: "medium-reading", labelKey: "readingRoom", backgroundUrl: mediumReading,
    imageAspectRatio: 1.5, brightness: 0.89, sizeRange: { min: 65, max: 160 },
    reference: { widthCm: 200, imageWidthPercent: 52.4 },
    wall: { left: 10, top: 4, right: 90, bottom: 65 }, artworkCenter: { x: 50, y: 34.5 },
  },
  {
    id: "large-travertine", labelKey: "travertineRoom", backgroundUrl: largeTravertine,
    imageAspectRatio: 1.5, brightness: 0.9, sizeRange: { min: 140, max: 320 },
    reference: { widthCm: 300, imageWidthPercent: 66 },
    wall: { left: 10, top: 4, right: 90, bottom: 61 }, artworkCenter: { x: 50, y: 32.5 },
  },
  {
    id: "large-gallery", labelKey: "oakGallery", backgroundUrl: largeGallery,
    imageAspectRatio: 1.5, brightness: 0.95, sizeRange: { min: 140, max: 320 },
    reference: { widthCm: 280, imageWidthPercent: 41.3 },
    wall: { left: 8, top: 4, right: 92, bottom: 67 }, artworkCenter: { x: 50, y: 35.5 },
  },
  {
    id: "large-charcoal", labelKey: "charcoalRoom", backgroundUrl: largeCharcoal,
    imageAspectRatio: 1.5, brightness: 0.73, sizeRange: { min: 140, max: 320 },
    reference: { widthCm: 300, imageWidthPercent: 44.4 },
    wall: { left: 8, top: 4, right: 92, bottom: 64 }, artworkCenter: { x: 50, y: 34 },
  },
];
