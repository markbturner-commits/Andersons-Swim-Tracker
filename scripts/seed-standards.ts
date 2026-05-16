#!/usr/bin/env tsx
/**
 * Loads supabase/seed/time_standards_2024_2028.csv into public.time_standards
 * via the service-role Supabase client. Idempotent — uses upsert on the
 * natural unique key (event_id, age_min, age_max, gender, standard, season).
 *
 * Pre-req: events catalog must already be seeded (supabase/seed/events.sql).
 *
 * Run: npm run seed
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parseTime } from "../src/lib/format";

const CSV_PATH = resolve(process.cwd(), "supabase/seed/time_standards_2024_2028.csv");
const SEASON = "2024-2028";

interface Row {
  distance_m: number;
  stroke: string;
  course: string;
  age_min: number;
  age_max: number;
  gender: "M" | "F";
  standard: "B" | "BB" | "A" | "AA" | "AAA" | "AAAA";
  time_ms: number;
}

function parseCsv(text: string): Row[] {
  const rows: Row[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(",");
    if (parts.length !== 8) {
      throw new Error(`Bad CSV line (expected 8 fields): ${line}`);
    }
    const [distance, stroke, course, ageMin, ageMax, gender, standard, timeStr] = parts;
    const ms = parseTime(timeStr);
    if (!Number.isFinite(ms)) {
      throw new Error(`Bad time on line: ${line}`);
    }
    rows.push({
      distance_m: parseInt(distance, 10),
      stroke,
      course,
      age_min: parseInt(ageMin, 10),
      age_max: parseInt(ageMax, 10),
      gender: gender as "M" | "F",
      standard: standard as Row["standard"],
      time_ms: ms,
    });
  }
  return rows;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const csv = readFileSync(CSV_PATH, "utf8");
  const rows = parseCsv(csv);
  console.log(`Parsed ${rows.length} standards rows from CSV.`);

  // Look up each event's id.
  const { data: events, error: eventsErr } = await supabase
    .from("events")
    .select("id, distance_m, stroke, course");
  if (eventsErr) throw eventsErr;
  if (!events || events.length === 0) {
    console.error("No events in DB. Run supabase/seed/events.sql first.");
    process.exit(1);
  }

  const eventLookup = new Map<string, number>();
  for (const e of events) {
    eventLookup.set(`${e.distance_m}-${e.stroke}-${e.course}`, e.id);
  }

  const upserts = rows.map((r) => {
    const key = `${r.distance_m}-${r.stroke}-${r.course}`;
    const event_id = eventLookup.get(key);
    if (!event_id) {
      throw new Error(`No event_id for ${key} — seed events.sql first.`);
    }
    return {
      event_id,
      age_min: r.age_min,
      age_max: r.age_max,
      gender: r.gender,
      standard: r.standard,
      time_ms: r.time_ms,
      season: SEASON,
    };
  });

  // Batch upsert in chunks of 200 to keep payload small.
  const CHUNK = 200;
  for (let i = 0; i < upserts.length; i += CHUNK) {
    const chunk = upserts.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("time_standards")
      .upsert(chunk, {
        onConflict: "event_id,age_min,age_max,gender,standard,season",
      });
    if (error) throw error;
    console.log(`Upserted ${Math.min(i + CHUNK, upserts.length)} / ${upserts.length}`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
