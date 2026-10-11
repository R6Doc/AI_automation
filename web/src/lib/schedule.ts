// Reads a pasted schedule (e.g. copied from ESPN) into games:
//
//   Saturday, October 10, 2026
//   7 Indiana @ Nebraska: 10:00 AM
//   1 Texas vs Oklahoma: 1:30 PM
//
// Rankings are dropped, "@", "vs" and "at" all work, and lines that aren't games are ignored.
// Teams keep the order they're written in: the first team goes on the left of the graphic.

export type MatchableTeam = { name: string; aliases?: string[] };

export type ParsedGame<T extends MatchableTeam> = {
  /** Team names as written, without rankings. */
  first: string;
  second: string;
  /** Matched teams from teams.json, if found. */
  firstTeam?: T;
  secondTeam?: T;
  /** "HH:MM" (24h) for the time input, or null if the line had no time. */
  time: string | null;
};

export type ParsedSchedule<T extends MatchableTeam> = {
  /** ISO date from a line like "Saturday, October 10, 2026", if present. */
  date: string | null;
  games: ParsedGame<T>[];
};

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const DATE_RE = new RegExp(`(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\\s+(${MONTHS.join("|")})\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?`, "i");
const GAME_RE = /^(.+?)\s+(?:@|vs\.?|v\.?|at)\s+(.+?)(?:\s*[:\-–—,]?\s*(\d{1,2}:\d{2})\s*([ap])\.?\s*m\.?)?\s*$/i;
const RANK_RE = /^\(?#?\d{1,2}\)?\s+/;

/** Lowercase, no accents or punctuation: "San José State" → "san jose state", "Texas A&M" → "texas aandm". */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function makeTeamMatcher<T extends MatchableTeam>(teams: T[]) {
  const byKey = new Map<string, T>();
  for (const t of teams) {
    byKey.set(normalizeName(t.name), t);
    for (const a of t.aliases ?? []) byKey.set(normalizeName(a), t);
  }
  const keys = [...byKey.keys()].sort((a, b) => b.length - a.length); // longest first
  return (raw: string): T | undefined => {
    const n = normalizeName(raw);
    if (byKey.has(n)) return byKey.get(n);
    // Full names like "Notre Dame Fighting Irish": the longest team name it starts with.
    const key = keys.find((k) => n.startsWith(k + " "));
    return key ? byKey.get(key) : undefined;
  };
}

function to24h(time: string, ampm: string): string {
  const [h, m] = time.split(":").map(Number);
  const pm = ampm.toLowerCase() === "p";
  const hour = (h % 12) + (pm ? 12 : 0);
  return `${String(hour).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function parseSchedule<T extends MatchableTeam>(text: string, teams: T[], today = new Date()): ParsedSchedule<T> {
  const match = makeTeamMatcher(teams);
  let date: string | null = null;
  const games: ParsedGame<T>[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\t+/g, " ").trim();
    if (!line || /^https?:\/\//i.test(line)) continue;

    const d: RegExpMatchArray | null = date ? null : line.match(DATE_RE);
    if (d) {
      const month: number = MONTHS.indexOf(d[1].toLowerCase()) + 1;
      const year: number = d[3] ? Number(d[3]) : today.getFullYear();
      date = `${year}-${String(month).padStart(2, "0")}-${String(Number(d[2])).padStart(2, "0")}`;
      continue;
    }

    const g = line.match(GAME_RE);
    if (!g) continue;
    const first = g[1].replace(RANK_RE, "").trim();
    const second = g[2].replace(RANK_RE, "").trim();
    if (!first || !second) continue;
    games.push({
      first,
      second,
      firstTeam: match(first),
      secondTeam: match(second),
      time: g[3] ? to24h(g[3], g[4]) : null,
    });
  }
  return { date, games };
}
