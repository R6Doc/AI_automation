// Run: node --experimental-strip-types tests/schedule.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseSchedule } from "../src/lib/schedule.ts";

const teams = JSON.parse(fs.readFileSync(new URL("../data/teams.json", import.meta.url), "utf8")).teams;

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

console.log("✓ schedule parser");
