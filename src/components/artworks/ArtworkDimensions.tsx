import { useSitePreferences } from "../../app/sitePreferences";

export function ArtworkDimensions({ value, className = "" }: { value: string; className?: string }) {
  const { labels, language, measurementUnit, setMeasurementUnit } = useSitePreferences();
  const nextUnit = measurementUnit === "cm" ? "in" : "cm";
  const switchLabel = nextUnit === "in" ? labels.actions.showInches : labels.actions.showCentimeters;
  const visibleLabel = measurementUnit === "in" ? labels.actions.dimensionsInches : labels.actions.dimensionsCentimeters;

  return (
    <p className={`artwork-dimensions${className ? ` ${className}` : ""}`} aria-label={visibleLabel}>
      <span>{formatDimensions(value, measurementUnit, language)}</span>
      <button
        type="button"
        className="artwork-dimensions__toggle"
        aria-label={switchLabel}
        title={switchLabel}
        onClick={() => setMeasurementUnit(nextUnit)}
      >
        {measurementUnit}
      </button>
    </p>
  );
}

function formatDimensions(value: string, unit: "cm" | "in", language: string) {
  if (unit === "cm" || !/\bcm\b/i.test(value)) return value;

  const locale = language === "en" ? "en-GB" : language;
  return value
    .replace(/\d+(?:[.,]\d+)?/g, (number) => {
      const centimetres = Number(number.replace(",", "."));
      const inches = centimetres / 2.54;
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(inches);
    })
    .replace(/\bcm\b/gi, "in");
}
