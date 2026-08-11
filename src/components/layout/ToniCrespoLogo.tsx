import logoMarkup from "../../assets/toni_crespo_logo_vector.svg?raw";

export function ToniCrespoLogo() {
  return <span aria-hidden="true" className="toni-crespo-logo" dangerouslySetInnerHTML={{ __html: logoMarkup }} />;
}
