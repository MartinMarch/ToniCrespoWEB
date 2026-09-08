import { stripVTControlCharacters } from "node:util";

export function hasAnnouncedViteOrigin(output, origin) {
  return stripVTControlCharacters(output).includes(`${origin}/`);
}
