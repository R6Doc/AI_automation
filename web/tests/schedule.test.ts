// Run: node --experimental-strip-types tests/schedule.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizeName, parseSchedule } from "../src/lib/schedule.ts";

const teams = JSON.parse(fs.readFileSync(new URL("../data/college-football.json", import.meta.url), "utf8")).teams;

const espn = `https://www.espn.com/college-football/schedule

All times are El Paso time (MDT).

Saturday, October 10, 2026
7 Indiana @ Nebraska: 10:00 AM
Texas A&M @ 14 Missouri: 10:00 AM
1 Texas vs Oklahoma: 1:30 PM
2 Georgia @ 6 Alabama: 5:30 PM
23 Boise State @ Fresno State: 8:30 PM`;

const r = parseSchedule(espn, teams);
assert.equal(r.date, "2026-10-10");
assert.deepEqual(
  r.games.map((g) => [g.firstTeam?.name, g.secondTeam?.name, g.time]),
  [["Indiana", "Nebraska", "10:00"], ["Texas A&M", "Missouri", "10:00"], ["Texas", "Oklahoma", "13:30"], ["Georgia", "Alabama", "17:30"], ["Boise State", "Fresno State", "20:30"]],
);

const odd = parseSchedule("Notre Dame Fighting Irish vs App State\t12:00 PM\nSan José State at Hawai'i\nSome Unknown U @ Miami (OH): 11:05 pm", teams);
assert.equal(odd.date, null);
assert.deepEqual(odd.games.map((g) => [g.firstTeam?.name ?? g.first, g.secondTeam?.name, g.time]), [
  ["Notre Dame", "Appalachian State", "12:00"],
  ["San Jose State", "Hawai'i", null],
  ["Some Unknown U", "Miami (OH)", "23:05"],
]);
assert.equal(odd.games[2].firstTeam, undefined);

// NBA: ESPN writes cities or full names ("LA" is the Clippers, "Los Angeles" the Lakers); nicknames and abbreviations work too.
const nbaTeams = JSON.parse(fs.readFileSync(new URL("../data/nba.json", import.meta.url), "utf8")).teams;
const nba = parseSchedule(`Tuesday, October 20, 2026
Boston @ New York: 7:30 PM
LA vs Los Angeles: 10:00 PM
Golden State Warriors at OKC 8:00 PM
Sixers @ Blazers: 10:30 PM`, nbaTeams);
assert.equal(nba.date, "2026-10-20");
assert.deepEqual(nba.games.map((g) => [g.firstTeam?.name, g.secondTeam?.name, g.time]), [
  ["Celtics", "Knicks", "19:30"],
  ["Clippers", "Lakers", "22:00"],
  ["Warriors", "Thunder", "20:00"],
  ["76ers", "Trail Blazers", "22:30"],
]);
// NBA teams are shown by nickname only, which is also how schedules often list them.
const nicknames = parseSchedule("Hawks @ Magic: 5:00 PM\nTimberwolves @ Heat: 5:30 PM", nbaTeams);
assert.deepEqual(nicknames.games.map((g) => [g.firstTeam?.name, g.secondTeam?.name]), [["Hawks", "Magic"], ["Timberwolves", "Heat"]]);

// No alias may point at two teams.
const seen = new Map<string, string>();
for (const t of nbaTeams as { name: string; aliases?: string[] }[]) {
  for (const key of [t.name, ...(t.aliases ?? [])].map(normalizeName)) {
    assert.ok(!seen.has(key) || seen.get(key) === t.name, `"${key}" is used by ${seen.get(key)} and ${t.name}`);
    seen.set(key, t.name);
  }
}

console.log("✓ schedule parser");
