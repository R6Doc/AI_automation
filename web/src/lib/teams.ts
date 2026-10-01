import fs from "node:fs";
import path from "node:path";
import teamsData from "../../data/teams.json";

export type Team = {
  id: string;
  name: string;
  /** Optional override for how the name breaks into lines, e.g. ["San Diego", "State"]. */
  lines?: string[];
  /** Public path to the logo, e.g. "/logos/notre-dame.svg". Null when no logo file exists. */
  logo: string | null;
};

type RawTeam = { id: string; name: string; lines?: string[] };

const LOGO_EXTENSIONS = [".svg", ".png"];

/**
 * Logos are matched by convention: public/logos/<team-id>.svg (or .png).
 * Dropping a correctly named file into public/logos is all it takes to add one.
 */
export function getTeams(): Team[] {
  const logoDir = path.join(process.cwd(), "public", "logos");
  const files = new Set(fs.existsSync(logoDir) ? fs.readdirSync(logoDir) : []);

  return (teamsData.teams as RawTeam[])
    .map((t) => {
      const ext = LOGO_EXTENSIONS.find((e) => files.has(t.id + e));
      return { ...t, logo: ext ? `/logos/${t.id}${ext}` : null };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
