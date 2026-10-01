/**
 * The exact payload the dashboard sends to the Mac agent (POST /generate).
 * Keep in sync with validateJob() in agent/server.js.
 */
export type JobTeam = {
  name: string;
  /** How the name is broken into lines in the graphic. */
  lines: string[];
  /** Absolute URL of the logo on the dashboard's domain, or null for no logo. */
  logoUrl: string | null;
};

export type JobMatch = {
  home: JobTeam;
  away: JobTeam;
  /** Already formatted, e.g. "10:00 am". */
  time: string;
};

export type Job = {
  /** ISO date, e.g. "2026-10-03" (used for the output file name). */
  date: string;
  /** Already formatted, e.g. "Saturday, October 3". */
  dateLabel: string;
  matches: JobMatch[];
};

export const MAX_MATCHES = 10;

export const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL ?? "http://127.0.0.1:3030";
