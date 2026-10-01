const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-10-03" → "Saturday, October 3" (matches the template's header style). */
export function formatDateLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${WEEKDAYS[date.getUTCDay()]}, ${MONTHS[m - 1]} ${d}`;
}

/** "13:30" → "1:30 pm" (matches the template's time style). */
export function formatTimeLabel(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Default line breaks: one word per line, like "Notre / Dame" and "San / Diego / State" in the template. */
export function splitNameLines(name: string): string[] {
  return name.trim().split(/\s+/).filter(Boolean);
}
