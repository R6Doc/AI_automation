/** Sports the generator knows. Each has data/<id>.json and public/logos/<id>/; they all share one template. */
export const SPORTS = [
  { id: "college-football", name: "College Football" },
  { id: "nba", name: "NBA" },
] as const;

export type SportId = (typeof SPORTS)[number]["id"];

export const isSportId = (value: unknown): value is SportId => SPORTS.some((s) => s.id === value);
