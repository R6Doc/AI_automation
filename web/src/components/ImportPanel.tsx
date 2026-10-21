"use client";

import { useMemo, useState } from "react";
import type { Team } from "@/lib/teams";
import type { SportId } from "@/lib/sports";
import { MAX_MATCHES, graphicCount } from "@/lib/job";
import { formatDateLabel, formatTimeLabel } from "@/lib/format";
import { parseSchedule, type ParsedGame } from "@/lib/schedule";

export type ImportedGame = { home: string; away: string; time: string | null };

const EXAMPLES: Record<SportId, string> = {
  "college-football": "Saturday, October 10, 2026\n7 Indiana @ Nebraska: 10:00 AM\n1 Texas vs Oklahoma: 1:30 PM",
  nfl: "Sunday, October 25, 2026\nBills @ Chiefs: 1:00 PM\nNY Giants vs Dallas: 4:25 PM",
  nba: "Tuesday, October 20, 2026\nBoston @ New York: 7:30 PM\nGolden State vs LA Lakers: 10:00 PM",
  mlb: "Tuesday, October 20, 2026\nYankees @ Dodgers: 5:08 PM\nToronto vs Seattle: 8:08 PM",
};

const firstSelection = (count: number) => new Set(Array.from({ length: Math.min(count, MAX_MATCHES) }, (_, i) => i));

export default function ImportPanel({ sport, teams, onApply }: { sport: SportId; teams: Team[]; onApply: (date: string | null, games: ImportedGame[]) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const parsed = useMemo(() => parseSchedule(text, teams), [text, teams]);
  const games = parsed.games;

  const onTextChange = (value: string) => {
    setText(value);
    setSelected(firstSelection(parseSchedule(value, teams).games.length));
  };

  const toggle = (i: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else if (next.size < MAX_MATCHES) next.add(i);
      return next;
    });

  const apply = () => {
    const picked = games
      .filter((_, i) => selected.has(i))
      .map((g) => ({ home: g.firstTeam?.name ?? g.first, away: g.secondTeam?.name ?? g.second, time: g.time }));
    onApply(parsed.date, picked);
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-6 w-full rounded-2xl border border-line bg-card px-4 py-3 text-left text-sm font-semibold transition hover:border-accent sm:px-5"
      >
        📋 Paste a schedule <span className="font-normal text-muted">to fill everything at once</span>
      </button>
    );
  }

  const unmatched = games.filter((g) => !g.firstTeam || !g.secondTeam).length;

  return (
    <section className="card mb-6">
      <div className="mb-3 flex items-center justify-between">
        <span className="label mb-0">Paste a schedule</span>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted hover:text-fg">Close</button>
      </div>
      <textarea
        className="field h-40 resize-y py-2 font-mono text-sm"
        placeholder={EXAMPLES[sport]}
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
      />

      {text.trim() && (
        <div className="mt-4">
          <p className="mb-2 text-sm text-muted">
            {games.length === 0
              ? `No games found. Each game needs a line like “${EXAMPLES[sport].split("\n")[1]}”.`
              : <>Found <strong className="text-fg">{games.length}</strong> games{parsed.date && <> for <strong className="text-fg">{formatDateLabel(parsed.date)}</strong></>}. Pick up to {MAX_MATCHES}.</>}
          </p>

          {games.length > 0 && (
            <ul className="max-h-80 space-y-1 overflow-y-auto rounded-lg border border-line p-1">
              {games.map((g, i) => {
                const checked = selected.has(i);
                const disabled = !checked && selected.size >= MAX_MATCHES;
                return (
                  <li key={i}>
                    <label className={`flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-bg ${disabled ? "cursor-not-allowed opacity-40" : ""}`}>
                      <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={checked} disabled={disabled} onChange={() => toggle(i)} />
                      <GameLine game={g} />
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {unmatched > 0 && (
            <p className="mt-2 text-xs text-muted">Teams marked <span className="text-bad">not in list</span> will be placed by name only, without a logo.</p>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
            <span className="text-sm text-muted">
              {selected.size} selected{selected.size > 0 && ` = ${graphicCount(selected.size)} graphic${graphicCount(selected.size) > 1 ? "s" : ""}`}
            </span>
            <button
              type="button"
              onClick={apply}
              disabled={selected.size === 0}
              className="rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-accent-fg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Use {selected.size} {selected.size === 1 ? "game" : "games"}
            </button>
          </div>
          <p className="mt-2 text-right text-xs text-muted">This replaces the matches below.</p>
        </div>
      )}
    </section>
  );
}

function GameLine({ game }: { game: ParsedGame<Team> }) {
  return (
    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
      <TeamName raw={game.first} team={game.firstTeam} />
      <span className="text-xs font-bold text-accent">VS</span>
      <TeamName raw={game.second} team={game.secondTeam} />
      <span className="ml-auto whitespace-nowrap text-muted">{game.time ? formatTimeLabel(game.time) : <span className="text-bad">no time</span>}</span>
    </span>
  );
}

function TeamName({ raw, team }: { raw: string; team?: Team }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {team?.logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.logo} alt="" className="h-5 w-5 object-contain" />
      )}
      <span>{team?.name ?? raw}</span>
      {!team && <span className="text-xs text-bad">not in list</span>}
    </span>
  );
}
