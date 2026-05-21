// Database row shapes — mirror supabase/migrations/0001_init.sql
// These are hand-written; once the schema lands, run
// `npx supabase gen types typescript --local > src/types/db.generated.ts` to auto-generate.

export type Course = "SCY" | "SCM" | "LCM";
export type Stroke = "FR" | "BK" | "BR" | "FL" | "IM";
export type Gender = "M" | "F";
export type StandardLevel = "B" | "BB" | "A" | "AA" | "AAA" | "AAAA";
export type ParseStatus = "pending" | "parsed" | "confirmed" | "failed" | "duplicate";

export interface Profile {
  id: string; // uuid, = auth.users.id
  display_name: string | null;
  is_parent: boolean;
  created_at: string;
}

export interface Swimmer {
  id: string;
  owner_id: string;
  name: string;
  birthdate: string; // ISO date
  gender: Gender;
  usa_swimming_id: string | null;
  share_token: string | null; // opaque public-share token; NULL = not shared
  created_at: string;
}

export interface SwimEvent {
  id: number;
  distance_m: number; // 50, 100, 200, 500, 1000, 1650
  stroke: Stroke;
  course: Course;
}

export interface Meet {
  id: string;
  name: string;
  location: string | null;
  start_date: string;
  end_date: string | null;
  course: Course;
  created_by: string | null;
}

export interface SplitLap {
  lap: number;
  time_ms: number;
}

export interface Result {
  id: string;
  swimmer_id: string;
  meet_id: string;
  event_id: number;
  time_ms: number;
  place: number | null;
  age_at_meet: number;
  splits: SplitLap[] | null;
  is_pr: boolean;
  dq: boolean;
  exhibition: boolean;
  created_at: string;
}

export interface TimeStandard {
  id: number;
  event_id: number;
  age_min: number;
  age_max: number;
  gender: Gender;
  standard: StandardLevel;
  time_ms: number;
  season: string;
}

export interface Goal {
  id: string;
  swimmer_id: string;
  event_id: number;
  target_time_ms: number;
  target_date: string | null;
  created_at: string;
  achieved_at: string | null;
}

export interface PdfUpload {
  id: string;
  uploader_id: string;
  storage_path: string;
  file_sha256: string;
  meet_id: string | null;
  parse_status: ParseStatus;
  raw_text: string | null;
  parsed_payload: ParsedMeetPayload | null;
  error: string | null;
  created_at: string;
}

// PDF parser output (shared between parseHyTek and parseLLM)
export interface ParsedMeetPayload {
  meet: {
    name: string;
    start_date: string;
    end_date: string | null;
    course: Course;
    location: string | null;
  };
  swimmers: Array<{
    name: string; // "Last, First"
    age: number;
    team: string;
  }>;
  results: Array<{
    swimmer_name: string;
    age: number;
    team: string;
    event_key: string; // e.g. "50-FR-SCY"
    time_ms: number;
    place: number | null;
    exhibition: boolean;
  }>;
}

// Public share-link payload — shape returned by the `get_shared_swimmer` RPC.
export interface SharedResult {
  id: string;
  swimmer_id: string;
  meet_id: string;
  event_id: number;
  time_ms: number;
  place: number | null;
  age_at_meet: number;
  is_pr: boolean;
  dq: boolean;
  exhibition: boolean;
  meet: {
    id: string;
    name: string;
    start_date: string;
    end_date: string | null;
    course: Course;
    location: string | null;
  };
  event: SwimEvent;
}

export interface SharedSwimmerPayload {
  swimmer: Pick<Swimmer, "id" | "name" | "birthdate" | "gender">;
  results: SharedResult[];
}

// Event key encoding: "{distance}-{stroke}-{course}" e.g. "50-FR-SCY"
export function eventKey(distance: number, stroke: Stroke, course: Course): string {
  return `${distance}-${stroke}-${course}`;
}

export function parseEventKey(key: string): { distance_m: number; stroke: Stroke; course: Course } | null {
  const parts = key.split("-");
  if (parts.length !== 3) return null;
  const distance = parseInt(parts[0], 10);
  if (isNaN(distance)) return null;
  return { distance_m: distance, stroke: parts[1] as Stroke, course: parts[2] as Course };
}
