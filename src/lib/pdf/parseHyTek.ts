// Hy-Tek Meet Manager PDF parser.
//
// Pipeline:
//   1. pdf-parse extracts raw text per page. A custom pagerender callback clusters
//      text items by x-coordinate so 2-column pages emit left column first, then right.
//   2. parseHyTekText scans the text linearly, recognizing meet header, event-section
//      headers, individual results, and relay rows (which span multiple lines).
//   3. Returns { payload, coverage } where coverage is the fraction of "result-looking"
//      lines that actually matched the regex. Callers throw PdfFormatUnrecognized
//      when coverage < 0.5.
//
// Hy-Tek format reference (Sailfish vs Aquadux 2.8.26):
//   Header:   HY-TEK's MEET MANAGER 8.0 — <ts>  Page N
//             <Meet name>
//             Results - <Meet name> <m/d/yy>
//   Section:  Event 15  Boys 9-10 50 Yard Freestyle
//   Result:   2  Turner, Anderson  9  AQUA  44.56  3
//   Exhib:    1  Smith, Jane  10  HOME  x1:02.34
//   Relay:    1  AQUA A  2:15.43  10
//                1) Turner, Anderson 9   2) Smith, Jane 10
//                3) Doe, John 9          4) Roe, Jane 10

import { parseTime } from "@/lib/format";
import {
  eventKey,
  type Course,
  type ParsedMeetPayload,
  type Stroke,
} from "@/types/db";
import { PdfFormatUnrecognized, PdfTextExtractionEmpty } from "./errors";

// ---------- regexes ----------

// Two Hy-Tek header dialects are supported:
//   Championship-style:  "Event 15  Boys 9-10 50 Yard Freestyle"
//   Dual-meet-style:     "#15 Boys 9-10 50 Yard Free"
// The dual-meet exports (e.g. DYC vs Weymouth Blue Sharks) prefix the event
// number with "#" and abbreviate stroke names (Free/Back/Breast/Fly), so both
// the "Event N"/"#N" prefix and the long/short stroke spellings must match.
//
// Age group can include digits, ranges, "& Under", "8&U", "& Over", "Open", etc.
// Stroke alternation is ordered longest-first so "Free Relay" wins over "Free"
// and "Freestyle" wins over "Free" (the trailing \b alone isn't enough when a
// shorter alternative is also a valid word boundary, e.g. "Free" in "Free Relay").
const SECTION_RE =
  /^\s*(?:Event\s+|#)(\d+)\s+(Boys|Girls|Women|Men|Mixed)\s+([\d&\s\-+A-Za-z]+?)\s+(\d+)\s+(Yard|Meter)\s+(Medley\s+Relay|Freestyle\s+Relay|Free\s+Relay|Freestyle|Backstroke|Breaststroke|Butterfly|Individual\s+Medley|Free|Back|Breast|Fly|IM)\b/i;

// Individual result line:
// "2  Turner, Anderson  9  AQUA  44.56  3"
// "1  Smith, Jane  10  HOME  x1:02.34"
// "*8  Nahmias, Sienna  10  DYC  x25.50"  (leading "*" marks a tied place)
// "---  Doe, John  10  AQUA  DQ"  (we ignore DQ rows — no time)
const RESULT_RE =
  /^\s*\*?(\d+|---)\s+([A-Z][\w'\-]+,\s+[A-Z][\w'\-\s.]+?)\s+(\d{1,2})\s+([A-Z][A-Z0-9\-]*)\s+(x|X)?((?:\d{1,2}:)?\d{1,2}\.\d{2})(?:\s+(\d+))?\s*$/;

// Relay finals row:
// "1  AQUA  A  2:15.43  10"   (place team relay-letter time [points])
// "2  HOME 'B'  2:18.99"
// "2  DYC B  x1:48.63"        (leading "x" on the time marks an exhibition relay)
const RELAY_RESULT_RE =
  /^\s*\*?(\d+|---)\s+([A-Z][A-Z0-9\-]*)\s+['"]?([A-D])['"]?\s+(x|X)?((?:\d{1,2}:)?\d{1,2}\.\d{2})(?:\s+(\d+))?\s*$/;

// Relay swimmer indented row. Two dialects:
//   Numbered:   "1) Turner, Anderson 9   2) Smith, Jane 10"
//   Unnumbered: "Turner, Anderson 9   Collingwood, Matias 10"  (dual-meet exports)
// The "N)" lead-in is optional so both forms are captured.
const RELAY_SWIMMER_RE =
  /(?:\d\)\s+)?([A-Z][\w'\-]+,\s+[A-Z][\w'\-\s.]+?)\s+(\d{1,2})\b/g;

// "Results - Sailfish vs Aquadux 2/8/26"  → captures the meet name + optional date.
// Dual-meet exports drop the trailing m/d/yy ("Results - DYC vs Blue Sharks 2026"),
// so the date group is optional and callers must null-check it.
const RESULTS_HEADER_RE = /^Results\s*-\s*(.+?)(?:\s+(\d{1,2}\/\d{1,2}\/\d{2,4}))?\s*$/;

// "Sailfish vs Aquadux 2.8.26"  → an alternate header form with dot-separated date
const TITLE_DATE_RE = /^(.+?)\s+(\d{1,2}\.\d{1,2}\.\d{2,4})\s*$/;

// Anything that *looks* like a result row (starts with place, "*place", or "---")
// — used for the coverage denominator. We only need the rough shape, not full
// validity.
const CANDIDATE_RESULT_RE = /^\s*\*?(?:\d+|---)\s+\S/;

// ---------- stroke + course mapping ----------

function strokeFromHyTek(s: string): Stroke {
  const norm = s.toLowerCase().replace(/\s+/g, " ").trim();
  if (norm.startsWith("free")) return "FR";
  if (norm.startsWith("back")) return "BK";
  if (norm.startsWith("breast")) return "BR";
  if (norm.startsWith("butter") || norm === "fly") return "FL";
  if (norm === "im" || norm === "individual medley") return "IM";
  if (norm === "medley relay") return "FR"; // relay leg encoded as FR fallback (relay handled separately)
  if (norm === "freestyle relay") return "FR";
  // sensible default
  return "FR";
}

function courseFromUnit(unit: string, _inferredCourse: Course | null): Course {
  // 'Yard' → SCY. 'Meter' is ambiguous (SCM vs LCM); without pool length context
  // we default to SCM and let the user correct in the confirm screen.
  if (/yard/i.test(unit)) return "SCY";
  return "SCM";
}

function isRelay(eventTypeLabel: string): boolean {
  return /relay/i.test(eventTypeLabel);
}

// ---------- date parsing ----------

function parseDateLoose(raw: string): string | null {
  // Accept m/d/yy, m/d/yyyy, m.d.yy, m.d.yyyy
  const m = raw.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})$/);
  if (!m) return null;
  const [, monthStr, dayStr, yearStr] = m;
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  let year = parseInt(yearStr, 10);
  if (yearStr.length === 2) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const mm = month.toString().padStart(2, "0");
  const dd = day.toString().padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

// ---------- types ----------

interface ParsedSection {
  eventNumber: number;
  gender: "Boys" | "Girls" | "Women" | "Men" | "Mixed";
  ageGroup: string; // e.g. "9-10", "Open", "13 & Over"
  distance: number;
  unit: "Yard" | "Meter";
  eventTypeLabel: string; // "Freestyle" | "Medley Relay" | ...
  isRelay: boolean;
}

// ---------- main entry ----------

export interface ParseHyTekResult {
  payload: ParsedMeetPayload;
  coverage: number;
}

/**
 * Parse a Hy-Tek Meet Manager PDF buffer. Throws PdfTextExtractionEmpty when
 * no text can be extracted, and PdfFormatUnrecognized when regex coverage is
 * below 50% (caller should fall back to LLM).
 */
export async function parseHyTek(buffer: Buffer): Promise<ParseHyTekResult> {
  const text = await extractTextTwoColumn(buffer);
  if (!text || text.trim().length === 0) {
    throw new PdfTextExtractionEmpty();
  }
  const result = parseHyTekText(text);
  if (result.coverage < 0.5) {
    throw new PdfFormatUnrecognized(result.coverage);
  }
  return result;
}

// ---------- text extraction with multi-column re-ordering ----------

// Two sorted column left-margins closer than this are treated as the same
// column. Hy-Tek columns sit ~190pt apart, while the token indents *within* a
// column (place number vs. name vs. relay-swimmer indent) vary by ≤ ~40pt, so
// 80pt cleanly separates real columns from intra-column jitter.
const COLUMN_GAP = 80;

/**
 * Run pdf-parse with a custom pagerender that detects how many columns a page
 * uses (1, 2, or 3) by clustering the per-row left edges, then emits each
 * column top-to-bottom in left-to-right order. Dual-meet Hy-Tek exports lay
 * results out in three columns; a fixed midpoint split mangles them (adjacent
 * columns' rows share a y and were being merged into one line). Falls back to
 * default rendering if the custom render throws.
 */
async function extractTextTwoColumn(buffer: Buffer): Promise<string> {
  // Dynamic import — pdf-parse is CJS and Node-only; keeping it out of the
  // module-top import list lets this file load in test environments that mock it.
  type PdfParseFn = (
    data: Buffer,
    opts?: { pagerender?: (pageData: unknown) => Promise<string> },
  ) => Promise<{ text: string }>;
  const mod = (await import("pdf-parse")) as unknown as { default?: PdfParseFn } & PdfParseFn;
  const pdfParse: PdfParseFn = (mod.default ?? mod) as PdfParseFn;

  // The pagerender receives a PDF.js PageProxy. Its getTextContent() returns
  // items with `transform: [a, b, c, d, x, y]` and `str` content.
  interface TextItem {
    str: string;
    transform: number[];
  }
  interface TextContent {
    items: TextItem[];
  }
  interface PageProxy {
    getTextContent(opts?: { normalizeWhitespace?: boolean; disableCombineTextItems?: boolean }): Promise<TextContent>;
  }

  const renderPage = async (pageData: PageProxy): Promise<string> => {
    const content = await pageData.getTextContent({
      normalizeWhitespace: false,
      disableCombineTextItems: false,
    });
    if (!content.items || content.items.length === 0) return "";

    // Each item has x = transform[4], y = transform[5]. PDF y increases upward.
    type Positioned = { x: number; y: number; str: string };
    const items: Positioned[] = content.items.map((it) => ({
      x: it.transform[4],
      y: it.transform[5],
      str: it.str,
    }));

    const linesFromItems = (group: Positioned[]): string => {
      // Group by y (rounded to int) → each line is items sharing a y bucket.
      const byY = new Map<number, Positioned[]>();
      for (const it of group) {
        const key = Math.round(it.y);
        const bucket = byY.get(key) ?? [];
        bucket.push(it);
        byY.set(key, bucket);
      }
      const lines = [...byY.entries()]
        .sort((a, b) => b[0] - a[0]) // top of page first (higher y)
        .map(([, line]) => line.sort((a, b) => a.x - b.x).map((i) => i.str).join(" ").replace(/\s+/g, " ").trim())
        .filter(Boolean);
      return lines.join("\n");
    };

    // Detect the column layout: cluster the *left edge* of each y-row. Result
    // rows in every column start at that column's left margin, so the distinct
    // margins reveal the column count regardless of how wide each column's
    // content runs. (Clustering every item's x instead would smear together —
    // a column spans a range of x, not a single value.)
    const rowLeftEdge = new Map<number, number>();
    for (const it of items) {
      const key = Math.round(it.y);
      const cur = rowLeftEdge.get(key);
      if (cur === undefined || it.x < cur) rowLeftEdge.set(key, it.x);
    }
    const sortedEdges = [...rowLeftEdge.values()].sort((a, b) => a - b);

    // Column margins = the minimum of each left-edge cluster.
    const margins: number[] = [];
    let prev: number | null = null;
    for (const e of sortedEdges) {
      if (prev === null || e - prev > COLUMN_GAP) margins.push(e);
      prev = e;
    }

    // Single column (or no items) → plain top-to-bottom rendering.
    if (margins.length <= 1) return linesFromItems(items);

    // Multi-column: assign each item to the column whose margin is the largest
    // one still ≤ its x. Single-item title/header lines (the meet name sits in
    // one text run) stay whole — they land in whichever column their x falls
    // in, and the meet-name scan in parseHyTekText searches every line, not
    // just the first column's.
    const colOf = (x: number): number => {
      let idx = 0;
      for (let c = 0; c < margins.length; c++) {
        if (x >= margins[c] - 1) idx = c;
        else break;
      }
      return idx;
    };
    const columns: Positioned[][] = margins.map(() => []);
    for (const it of items) columns[colOf(it.x)].push(it);
    return columns.map(linesFromItems).filter(Boolean).join("\n");
  };

  try {
    const result = await pdfParse(buffer, { pagerender: renderPage as (p: unknown) => Promise<string> });
    return result.text ?? "";
  } catch {
    // If pagerender blows up (e.g. items without transforms), fall back to default.
    const result = await pdfParse(buffer);
    return result.text ?? "";
  }
}

// ---------- the actual line-level parser (exported for tests) ----------

/**
 * Parse pre-extracted Hy-Tek text. Exported so tests can run against the
 * text-proxy fixture without needing a real PDF.
 */
export function parseHyTekText(rawText: string): ParseHyTekResult {
  const lines = rawText.split(/\r?\n/);

  // First pass: meet header (name + date) + course inference.
  let meetName = "";
  let meetDate: string | null = null;
  let inferredCourse: Course = "SCY"; // refined as we see "Yard" / "Meter" events

  // Scan every line for the "Results - <name> <date?>" header. Only genuine
  // header lines start with "Results", so first-match-wins is safe — and we
  // can't cap the scan at the first 50 lines: in a multi-column layout the
  // header can land in the second/third column, well past line 50.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const r = line.match(RESULTS_HEADER_RE);
    if (r) {
      meetName = r[1].trim();
      // The date group is optional in the dual-meet dialect — only parse it
      // when the "Results -" line actually carried an m/d/yy suffix.
      if (r[2]) {
        const d = parseDateLoose(r[2]);
        if (d) meetDate = d;
      }
      break;
    }
  }
  if (!meetName) {
    // try the title-with-dot-date pattern as a fallback
    for (let i = 0; i < lines.length && i < 50; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      if (/HY-TEK|MEET MANAGER|Page \d+|License|Sanction/i.test(line)) continue;
      const t = line.match(TITLE_DATE_RE);
      if (t) {
        meetName = t[1].trim();
        const d = parseDateLoose(t[2]);
        if (d) meetDate = d;
        break;
      }
      // First non-noise line is probably the meet name. Take the first one
      // only (don't overwrite with later uppercase lines like "Team" or a
      // swimmer's surname), then keep scanning for a date to attach.
      if (!meetName && line.length > 3 && /^[A-Z]/.test(line)) {
        meetName = line;
      }
    }
  }

  // Second pass: iterate lines, track current section, parse result rows + relays.
  const swimmersMap = new Map<string, { name: string; age: number; team: string }>();
  const results: ParsedMeetPayload["results"] = [];
  let currentSection: ParsedSection | null = null;
  let candidateCount = 0;
  let matchedCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    // section header?
    const secM = trimmed.match(SECTION_RE);
    if (secM) {
      const [, num, gender, ageGroup, dist, unit, type] = secM;
      currentSection = {
        eventNumber: parseInt(num, 10),
        gender: gender as ParsedSection["gender"],
        ageGroup: ageGroup.trim(),
        distance: parseInt(dist, 10),
        unit: unit as "Yard" | "Meter",
        eventTypeLabel: type.replace(/\s+/g, " "),
        isRelay: isRelay(type),
      };
      // Refine course inference from the first event we see.
      // TODO: distinguish SCM vs LCM — pool length isn't in the Hy-Tek event
      // title; for now Meter events default to SCM and the user can correct.
      if (currentSection.unit === "Yard") {
        inferredCourse = "SCY";
      } else {
        inferredCourse = "SCM";
      }
      continue;
    }

    // Skip obvious header/footer noise.
    if (
      /HY-TEK|MEET MANAGER|Page \d+|^Name\b|^Time\s+Points|^Finals\s+Points|^Place/i.test(trimmed)
    ) {
      continue;
    }

    // Looks like a result candidate?
    const isCandidate = CANDIDATE_RESULT_RE.test(trimmed);
    if (!isCandidate || !currentSection) continue;

    candidateCount++;

    if (currentSection.isRelay) {
      // Relay finals row, then read the next non-empty line(s) for 4 swimmer names.
      const relayM = trimmed.match(RELAY_RESULT_RE);
      if (!relayM) continue;
      // Groups: 1 place, 2 team, 3 relay-letter, 4 exhibition flag, 5 time.
      const [, placeStr, team, , , timeStr] = relayM;
      const place = placeStr === "---" ? null : parseInt(placeStr, 10);
      const timeMs = parseTime(timeStr);
      if (isNaN(timeMs)) continue;

      matchedCount++;

      // Look ahead for swimmer names. Hy-Tek packs them on 1–2 lines, "1) Last, First age".
      const relaySwimmers: Array<{ name: string; age: number }> = [];
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const next = lines[j].trim();
        if (!next) continue;
        // Stop scanning if we hit the next section, next result, or section break.
        if (SECTION_RE.test(next) || CANDIDATE_RESULT_RE.test(next)) break;
        let mm: RegExpExecArray | null;
        RELAY_SWIMMER_RE.lastIndex = 0;
        while ((mm = RELAY_SWIMMER_RE.exec(next))) {
          // Groups: 1 name ("Last, First"), 2 age. The "N)" lead-in is a
          // non-capturing optional, so the name/age indices are stable across
          // the numbered and unnumbered dialects.
          relaySwimmers.push({ name: mm[1].replace(/\s+/g, " ").trim(), age: parseInt(mm[2], 10) });
        }
        if (relaySwimmers.length >= 4) break;
      }

      // Emit one result *per swimmer* in the relay so each swimmer gets credit.
      // We use a relay-prefixed event_key that intentionally does NOT match the
      // standard Stroke enum (FR/BK/BR/FL/IM) — relays aren't in the `events`
      // catalog (Lane A), so the confirm endpoint filters these rows. Format:
      //   "<distance>-RELAY-<MR|FRR>-<course>"
      // TODO(coord-with-lane-a): If/when the events catalog grows relay entries,
      // switch this to eventKey() with the proper stroke codes.
      const course = courseFromUnit(currentSection.unit, inferredCourse);
      const relayKind = currentSection.eventTypeLabel.toLowerCase().includes("medley") ? "MR" : "FRR";
      const ek = `${currentSection.distance}-RELAY-${relayKind}-${course}`;
      for (const s of relaySwimmers) {
        swimmersMap.set(`${s.name}|${s.age}|${team}`, { name: s.name, age: s.age, team });
        results.push({
          swimmer_name: s.name,
          age: s.age,
          team,
          event_key: ek,
          time_ms: timeMs,
          place,
          exhibition: false,
        });
      }
      continue;
    }

    // Individual result.
    const m = trimmed.match(RESULT_RE);
    if (!m) {
      // Some DQ / NT rows match the candidate shape but not the time-bearing regex;
      // they don't count against coverage in the strict sense but they don't help.
      continue;
    }
    matchedCount++;

    const [, placeStr, nameRaw, ageStr, team, exFlag, timeStr] = m;
    const place = placeStr === "---" ? null : parseInt(placeStr, 10);
    const timeMs = parseTime(timeStr);
    if (isNaN(timeMs)) continue;
    const age = parseInt(ageStr, 10);
    const name = nameRaw.replace(/\s+/g, " ").trim();
    const exhibition = exFlag === "x" || exFlag === "X";

    swimmersMap.set(`${name}|${age}|${team}`, { name, age, team });

    const stroke = strokeFromHyTek(currentSection.eventTypeLabel);
    const course = courseFromUnit(currentSection.unit, inferredCourse);
    results.push({
      swimmer_name: name,
      age,
      team,
      event_key: eventKey(currentSection.distance, stroke, course),
      time_ms: timeMs,
      place,
      exhibition,
    });
  }

  const coverage = candidateCount === 0 ? 0 : matchedCount / candidateCount;

  const payload: ParsedMeetPayload = {
    meet: {
      name: meetName || "Untitled Meet",
      start_date: meetDate ?? new Date().toISOString().slice(0, 10),
      end_date: null,
      course: inferredCourse,
      location: null,
    },
    swimmers: [...swimmersMap.values()],
    results,
  };
  return { payload, coverage };
}
