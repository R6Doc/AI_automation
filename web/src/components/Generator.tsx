"use client";

import { useEffect, useMemo, useState } from "react";
import type { Team } from "@/lib/teams";
import { AGENT_URL, MAX_MATCHES, type Job, type JobTeam } from "@/lib/job";
import { formatDateLabel, formatTimeLabel, splitNameLines } from "@/lib/format";

type MatchRow = { key: number; home: string; away: string; time: string };
type AgentStatus = "checking" | "online" | "offline";
type RunState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; file: string; warnings: string[] }
  | { kind: "error"; message: string };

const DRAFT_KEY = "match-generator-draft-v1";
let nextKey = 1;
const newRow = (time = "19:00"): MatchRow => ({ key: nextKey++, home: "", away: "", time });

function nextSaturday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function Generator({ teams }: { teams: Team[] }) {
  const [date, setDate] = useState(nextSaturday);
  const [rows, setRows] = useState<MatchRow[]>(() => [newRow()]);
  const [agent, setAgent] = useState<AgentStatus>("checking");
  const [run, setRun] = useState<RunState>({ kind: "idle" });
  const [loaded, setLoaded] = useState(false);

  const teamsByName = useMemo(
    () => new Map(teams.map((t) => [t.name.toLowerCase(), t])),
    [teams],
  );
  const findTeam = (name: string) => teamsByName.get(name.trim().toLowerCase());

  // Restore the last draft so a page refresh doesn't wipe the form. Done in an effect (not the
  // useState initializer) because localStorage doesn't exist during server rendering.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as { date: string; rows: Omit<MatchRow, "key">[] };
        if (draft.date) setDate(draft.date);
        if (draft.rows?.length) setRows(draft.rows.map((r) => ({ ...r, key: nextKey++ })));
      }
    } catch {}
    setLoaded(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ date, rows: rows.map(({ home, away, time }) => ({ home, away, time })) }),
      );
    } catch {}
  }, [date, rows, loaded]);

  // Poll the Mac agent so the designer always sees whether Generate will work.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch(`${AGENT_URL}/health`, {
          cache: "no-store",
          signal: AbortSignal.timeout(3000),
        });
        if (!cancelled) setAgent(res.ok ? "online" : "offline");
      } catch {
        if (!cancelled) setAgent("offline");
      }
    };
    check();
    const id = setInterval(check, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const updateRow = (key: number, patch: Partial<MatchRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeRow = (key: number) => setRows((rs) => rs.filter((r) => r.key !== key));
  const moveRow = (index: number, delta: number) =>
    setRows((rs) => {
      const target = index + delta;
      if (target < 0 || target >= rs.length) return rs;
      const copy = [...rs];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  const addRow = () =>
    setRows((rs) => (rs.length >= MAX_MATCHES ? rs : [...rs, newRow(rs.at(-1)?.time)]));

  const problems = useMemo(() => {
    const list: string[] = [];
    if (!date) list.push("Pick a date.");
    rows.forEach((r, i) => {
      if (!r.home.trim() || !r.away.trim()) list.push(`Match ${i + 1} needs both teams.`);
      if (!r.time) list.push(`Match ${i + 1} needs a time.`);
    });
    return list;
  }, [date, rows]);

  const toJobTeam = (name: string): JobTeam => {
    const team = findTeam(name);
    const clean = team?.name ?? name.trim();
    return {
      name: clean,
      lines: team?.lines ?? splitNameLines(clean),
      logoUrl: team?.logo ? new URL(team.logo, window.location.origin).href : null,
    };
  };

  const generate = async () => {
    if (problems.length || run.kind === "running") return;
    const job: Job = {
      date,
      dateLabel: formatDateLabel(date),
      matches: rows.map((r) => ({
        home: toJobTeam(r.home),
        away: toJobTeam(r.away),
        time: formatTimeLabel(r.time),
      })),
    };
    setRun({ kind: "running" });
    try {
      const res = await fetch(`${AGENT_URL}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(job),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || `The generator returned an error (${res.status}).`);
      setRun({ kind: "done", file: data.file, warnings: data.warnings ?? [] });
    } catch (err) {
      const message =
        err instanceof TypeError
          ? "Couldn't reach the generator on this Mac. Make sure you're using Chrome on the design Mac."
          : (err as Error).message;
      setRun({ kind: "error", message });
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-40 pt-8 sm:px-6">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Cabo Joe&apos;s</p>
          <h1 className="text-2xl font-bold tracking-tight">College Football Graphic</h1>
        </div>
        <StatusPill status={agent} />
      </header>

      <datalist id="team-options">
        {teams.map((t) => (
          <option key={t.id} value={t.name} />
        ))}
      </datalist>

      <section className="card mb-6">
        <label className="label" htmlFor="date">Game day</label>
        <div className="flex flex-wrap items-center gap-4">
          <input
            id="date"
            type="date"
            className="field w-auto"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          {date && <span className="text-sm text-muted">Header will read: <strong className="text-fg">{formatDateLabel(date)}</strong></span>}
        </div>
      </section>

      <section className="space-y-3">
        {rows.map((row, i) => (
          <div key={row.key} className="card">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-muted">Match {i + 1}</span>
              <div className="flex gap-1">
                <IconButton label="Move up" disabled={i === 0} onClick={() => moveRow(i, -1)}>↑</IconButton>
                <IconButton label="Move down" disabled={i === rows.length - 1} onClick={() => moveRow(i, 1)}>↓</IconButton>
                <IconButton label="Remove match" disabled={rows.length === 1} onClick={() => removeRow(row.key)}>✕</IconButton>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_8rem] sm:items-end">
              <TeamField label="Home team" value={row.home} team={findTeam(row.home)} onChange={(v) => updateRow(row.key, { home: v })} />
              <span className="hidden pb-3 text-center text-sm font-bold text-accent sm:block">VS</span>
              <TeamField label="Away team" value={row.away} team={findTeam(row.away)} onChange={(v) => updateRow(row.key, { away: v })} />
              <div>
                <label className="label">Time</label>
                <input type="time" className="field" value={row.time} onChange={(e) => updateRow(row.key, { time: e.target.value })} />
              </div>
            </div>
          </div>
        ))}
      </section>

      <button
        type="button"
        onClick={addRow}
        disabled={rows.length >= MAX_MATCHES}
        className="mt-4 w-full rounded-xl border-2 border-dashed border-line py-3 text-sm font-semibold text-muted transition hover:border-accent hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
      >
        {rows.length >= MAX_MATCHES ? `Maximum of ${MAX_MATCHES} matches` : "+ Add match"}
      </button>

      <footer className="fixed inset-x-0 bottom-0 border-t border-line bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-4 px-4 py-4 sm:px-6">
          <div className="min-w-0 flex-1 text-sm">
            <RunMessage run={run} problems={problems} agent={agent} />
          </div>
          <button
            type="button"
            onClick={generate}
            disabled={problems.length > 0 || run.kind === "running" || agent !== "online"}
            className="rounded-xl bg-accent px-8 py-3 font-bold text-accent-fg shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {run.kind === "running" ? "Generating…" : "Generate"}
          </button>
        </div>
      </footer>
    </div>
  );
}

function TeamField({ label, value, team, onChange }: { label: string; value: string; team?: Team; onChange: (v: string) => void }) {
  const custom = value.trim() !== "" && !team;
  return (
    <div className="min-w-0">
      <label className="label">{label}</label>
      <div className="flex items-center gap-2">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-logo">
          {team?.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={team.logo} alt="" className="h-9 w-9 object-contain" />
          ) : (
            <span className="text-xs text-muted">{value.trim() ? "—" : ""}</span>
          )}
        </div>
        <input
          list="team-options"
          className="field"
          placeholder="Type to search…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      <p className="mt-1 h-4 text-xs text-muted">
        {custom ? "Not in the list: name only, no logo" : team && !team.logo ? "No logo on file" : ""}
      </p>
    </div>
  );
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="h-8 w-8 rounded-lg text-muted transition hover:bg-line hover:text-fg disabled:opacity-25 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function StatusPill({ status }: { status: AgentStatus }) {
  const styles = {
    checking: { dot: "bg-muted", text: "Checking generator…" },
    online: { dot: "bg-ok", text: "Generator connected" },
    offline: { dot: "bg-bad", text: "Generator not running" },
  }[status];
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm">
      <span className={`h-2.5 w-2.5 rounded-full ${styles.dot}`} />
      {styles.text}
    </span>
  );
}

function RunMessage({ run, problems, agent }: { run: RunState; problems: string[]; agent: AgentStatus }) {
  if (run.kind === "running") return <span className="text-muted">Building the graphic in Illustrator…</span>;
  if (run.kind === "done")
    return (
      <span>
        <strong className="text-ok">Done!</strong> Opened in Illustrator as <code className="break-all">{run.file}</code>
        {run.warnings.length > 0 && <span className="block text-xs text-muted">{run.warnings.join(" ")}</span>}
      </span>
    );
  if (run.kind === "error") return <span className="text-bad">{run.message}</span>;
  if (agent === "offline")
    return <span className="text-muted">The generator isn&apos;t responding. Use Chrome on the design Mac, or restart the Mac.</span>;
  if (problems.length) return <span className="text-muted">{problems[0]}</span>;
  return <span className="text-muted">Ready. The file opens in Illustrator when it&apos;s done.</span>;
}
