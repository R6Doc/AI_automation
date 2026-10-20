import fs from "node:fs";
import path from "node:path";
import collegeFootball from "../../data/college-football.json";
import nba from "../../data/nba.json";
import { SPORTS, type SportId } from "./sports";

export type Team = {
  id: string;
  name: string;
  /** Optional override for how the name breaks into lines, e.g. ["San Diego", "State"]. */
  lines?: string[];
  /** Other spellings used when reading a pasted schedule, e.g. ["App State"]. */
  aliases?: string[];
  /** Public path to the logo, e.g. "/logos/nba/boston-celtics.svg". Null when no logo file exists. */
  logo: string | null;
};

type RawTeam = { id: string; name: string; lines?: string[]; aliases?: string[] };

const DATA: Record<SportId, { teams: RawTeam[] }> = { "college-football": collegeFootball, nba };
const LOGO_EXTENSIONS = [".svg", ".png"];

/**
 * Logos are matched by convention: public/logos/<sport>/<team-id>.svg (or .png).
 * Dropping a correctly named file into that folder is all it takes to add one.
 */
export function getTeams(sport: SportId): Team[] {
  const logoDir = path.join(process.cwd(), "public", "logos", sport);
  const files = new Set(fs.existsSync(logoDir) ? fs.readdirSync(logoDir) : []);

  return DATA[sport].teams
    .map((t) => {
      const ext = LOGO_EXTENSIONS.find((e) => files.has(t.id + e));
      return { id: t.id, name: t.name, lines: t.lines, aliases: t.aliases, logo: ext ? `/logos/${sport}/${t.id}${ext}` : null };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type TeamsBySport = Record<SportId, Team[]>;

export const getTeamsBySport = (): TeamsBySport =>
  Object.fromEntries(SPORTS.map((s) => [s.id, getTeams(s.id)])) as TeamsBySport;
