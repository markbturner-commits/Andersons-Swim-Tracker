// Time formatting helpers — swim times stored as integer milliseconds, displayed MM:SS.hh

export function formatTime(timeMs: number): string {
  if (timeMs < 0 || !Number.isFinite(timeMs)) return "—";
  const totalCs = Math.round(timeMs / 10); // centiseconds
  const cs = totalCs % 100;
  const totalSec = Math.floor(totalCs / 100);
  const sec = totalSec % 60;
  const min = Math.floor(totalSec / 60);
  const csStr = cs.toString().padStart(2, "0");
  if (min === 0) {
    return `${sec}.${csStr}`;
  }
  const secStr = sec.toString().padStart(2, "0");
  return `${min}:${secStr}.${csStr}`;
}

// Parse "MM:SS.hh" or "SS.hh" → integer ms. Returns NaN on failure.
export function parseTime(input: string): number {
  const trimmed = input.trim().replace(/^[xX]/, ""); // strip exhibition prefix
  const match = trimmed.match(/^(?:(\d{1,2}):)?(\d{1,2})\.(\d{2})$/);
  if (!match) return NaN;
  const [, minStr, secStr, csStr] = match;
  const min = minStr ? parseInt(minStr, 10) : 0;
  const sec = parseInt(secStr, 10);
  const cs = parseInt(csStr, 10);
  if (sec >= 60) return NaN;
  return (min * 60 + sec) * 1000 + cs * 10;
}

export function ageOnDate(birthdate: string, onDate: string): number {
  const bd = new Date(birthdate);
  const od = new Date(onDate);
  let age = od.getFullYear() - bd.getFullYear();
  const m = od.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && od.getDate() < bd.getDate())) age--;
  return age;
}

export function strokeLabel(stroke: string): string {
  return { FR: "Freestyle", BK: "Backstroke", BR: "Breaststroke", FL: "Butterfly", IM: "IM" }[stroke] ?? stroke;
}

export function courseLabel(course: string): string {
  return { SCY: "Yards", SCM: "SC Meters", LCM: "LC Meters" }[course] ?? course;
}

export function eventLabel(distance_m: number, stroke: string, course: string): string {
  return `${distance_m} ${courseLabel(course)} ${strokeLabel(stroke)}`;
}
