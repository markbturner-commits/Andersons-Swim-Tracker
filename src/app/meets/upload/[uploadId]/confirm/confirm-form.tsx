"use client";

// Client-side confirm flow.
// - Editable meet info (name/date/course).
// - Swimmer picker (from extracted names + user's own swimmers).
// - Pre-flight conflict check via /api/results/conflicts (not implemented;
//   for now we run the check client-side against fetched results).
// - Per-row status badge: NEW / DUPLICATE / CONFLICT.
// - Save → POST /api/results/confirm → redirect to /meets/[meetId].

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { eventLabel, formatTime, parseTime } from "@/lib/format";
import {
  parseEventKey,
  type Course,
  type ParsedMeetPayload,
  type Swimmer,
} from "@/types/db";

interface Props {
  uploadId: string;
  payload: ParsedMeetPayload;
  swimmers: Swimmer[];
  fallbackTriggered: boolean;
}

type RowStatus = "NEW" | "DUPLICATE" | "CONFLICT";
type RowAction = "NEW" | "SKIP" | "OVERWRITE";

interface ResolvedRow {
  // From the parsed payload, narrowed to the picked swimmer:
  event_key: string;
  time_ms_parsed: number;
  place: number | null;
  exhibition: boolean;
  // Editable:
  time_input: string;
  // Conflict info:
  status: RowStatus;
  existing_time_ms: number | null;
  action: RowAction;
}

export function ConfirmForm({ uploadId, payload, swimmers, fallbackTriggered }: Props) {
  const router = useRouter();

  // ----- Editable meet info -----
  const [meetName, setMeetName] = useState(payload.meet.name);
  const [meetDate, setMeetDate] = useState(payload.meet.start_date);
  const [meetCourse, setMeetCourse] = useState<Course>(payload.meet.course);
  const [meetLocation, setMeetLocation] = useState(payload.meet.location ?? "");

  // ----- Swimmer picker -----
  // Choose the parsed-payload swimmer first (their name+age+team from the PDF).
  // Then map onto one of the user's existing swimmers (which carry birthdate).
  const [pickedParsedName, setPickedParsedName] = useState<string | null>(
    payload.swimmers[0]?.name ?? null,
  );
  const [pickedSwimmerId, setPickedSwimmerId] = useState<string | null>(
    swimmers[0]?.id ?? null,
  );

  // Results for the picked parsed-name (filter relays out — they can't map to
  // the events catalog yet).
  const rowsForPicked = useMemo(() => {
    if (!pickedParsedName) return [];
    return payload.results.filter(
      (r) => r.swimmer_name === pickedParsedName && !r.event_key.includes("RELAY"),
    );
  }, [payload.results, pickedParsedName]);

  const [rows, setRows] = useState<ResolvedRow[]>([]);
  const [conflictsLoading, setConflictsLoading] = useState(false);
  const [conflictsError, setConflictsError] = useState<string | null>(null);

  // Pre-flight check: when swimmer + meet date are set, fetch existing results
  // for (swimmerId, eventId) at this meet (by name+date) and mark each row.
  const runPreflight = async () => {
    if (!pickedSwimmerId) return;
    setConflictsLoading(true);
    setConflictsError(null);
    try {
      const rs = await fetch(
        `/api/results/preflight?swimmerId=${pickedSwimmerId}&meetName=${encodeURIComponent(meetName)}&meetDate=${meetDate}`,
      );
      const json = (await rs.json().catch(() => ({}))) as {
        existing?: Array<{ event_key: string; time_ms: number }>;
        error?: { code: string; userMessage: string };
      };
      // If the preflight endpoint isn't deployed yet (Lane A may own it),
      // gracefully fall back: every row is NEW.
      const existing = json.existing ?? [];
      const existingMap = new Map(existing.map((x) => [x.event_key, x.time_ms]));

      const resolved: ResolvedRow[] = rowsForPicked.map((r) => {
        const prior = existingMap.get(r.event_key);
        let status: RowStatus = "NEW";
        let action: RowAction = "NEW";
        if (prior !== undefined) {
          if (prior === r.time_ms) {
            status = "DUPLICATE";
            action = "SKIP";
          } else {
            status = "CONFLICT";
            action = "SKIP"; // default safe; user toggles to OVERWRITE
          }
        }
        return {
          event_key: r.event_key,
          time_ms_parsed: r.time_ms,
          place: r.place,
          exhibition: r.exhibition,
          time_input: formatTime(r.time_ms),
          status,
          existing_time_ms: prior ?? null,
          action,
        };
      });
      setRows(resolved);
    } catch (e) {
      setConflictsError(e instanceof Error ? e.message : "Preflight failed");
      // Even on preflight failure, allow the user to proceed with everything NEW.
      const resolved: ResolvedRow[] = rowsForPicked.map((r) => ({
        event_key: r.event_key,
        time_ms_parsed: r.time_ms,
        place: r.place,
        exhibition: r.exhibition,
        time_input: formatTime(r.time_ms),
        status: "NEW",
        existing_time_ms: null,
        action: "NEW",
      }));
      setRows(resolved);
    } finally {
      setConflictsLoading(false);
    }
  };

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!pickedSwimmerId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const body = {
        uploadId,
        swimmerId: pickedSwimmerId,
        meet: {
          name: meetName,
          date: meetDate,
          location: meetLocation || null,
          course: meetCourse,
        },
        results: rows.map((r) => ({
          event_key: r.event_key,
          time_ms: parseTime(r.time_input) || r.time_ms_parsed,
          place: r.place,
          exhibition: r.exhibition,
          action: r.action,
        })),
      };
      const res = await fetch("/api/results/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setSaveError(json.error?.userMessage ?? "Save failed");
        return;
      }
      router.push(`/meets/${json.meetId}`);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-6 space-y-8">
      {fallbackTriggered && (
        <div className="rounded-xl border border-aqua/40 bg-aqua/5 p-3 text-sm text-ink">
          AI fallback parser was used — the regex parser couldn&apos;t lock onto this PDF&apos;s format.
        </div>
      )}

      {/* ----- Meet info ----- */}
      <section className="rounded-xl border border-gray-200 p-4">
        <h2 className="font-display text-lg text-navy">Meet</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-ink/80">Name</span>
            <input
              value={meetName}
              onChange={(e) => setMeetName(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-ink/80">Date</span>
            <input
              type="date"
              value={meetDate}
              onChange={(e) => setMeetDate(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-ink/80">Course</span>
            <select
              value={meetCourse}
              onChange={(e) => setMeetCourse(e.target.value as Course)}
              className="mt-1 block w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="SCY">SCY (yards)</option>
              <option value="SCM">SCM (short-course meters)</option>
              <option value="LCM">LCM (long-course meters)</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-ink/80">Location</span>
            <input
              value={meetLocation}
              onChange={(e) => setMeetLocation(e.target.value)}
              placeholder="Optional"
              className="mt-1 block w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </label>
        </div>
      </section>

      {/* ----- Swimmer picker ----- */}
      <section className="rounded-xl border border-gray-200 p-4">
        <h2 className="font-display text-lg text-navy">Which swimmer is yours?</h2>
        {payload.swimmers.length === 0 ? (
          <p className="mt-2 text-sm text-ink">No swimmers detected in the PDF.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {payload.swimmers.map((s) => (
              <li key={`${s.name}|${s.age}|${s.team}`}>
                <button
                  type="button"
                  onClick={() => setPickedParsedName(s.name)}
                  className={`min-h-11 w-full rounded-xl border px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua ${
                    pickedParsedName === s.name
                      ? "border-navy bg-navy/5 font-medium text-navy"
                      : "border-gray-200 text-ink"
                  }`}
                >
                  {s.name} <span className="text-ink/60">· age {s.age} · {s.team}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 border-t border-gray-200 pt-4">
          <label className="block text-sm">
            <span className="text-ink/80">Save under your swimmer:</span>
            <select
              value={pickedSwimmerId ?? ""}
              onChange={(e) => setPickedSwimmerId(e.target.value || null)}
              className="mt-1 block w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="">— pick one —</option>
              {swimmers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} (born {s.birthdate})
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={runPreflight}
            disabled={!pickedSwimmerId || !pickedParsedName || conflictsLoading}
            className="inline-flex min-h-11 items-center rounded-xl bg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {conflictsLoading ? "Checking…" : "Preview results"}
          </button>
          {!fallbackTriggered && (
            <a
              href={`/meets/upload?fallback=1`}
              className="inline-flex min-h-11 items-center rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-ink"
            >
              Can&apos;t find my swimmer — try AI parser
            </a>
          )}
        </div>
        {conflictsError && (
          <p className="mt-2 text-sm text-std-bb">{conflictsError}</p>
        )}
      </section>

      {/* ----- Results table ----- */}
      {rows.length > 0 && (
        <section className="rounded-xl border border-gray-200 p-4">
          <h2 className="font-display text-lg text-navy">Results to save</h2>
          <ul className="mt-3 divide-y divide-gray-200">
            {rows.map((row, idx) => {
              const ev = parseEventKey(row.event_key);
              return (
                <li key={idx} className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-[1fr_auto_auto_auto]">
                  <div>
                    <div className="font-medium text-navy">
                      {ev ? eventLabel(ev.distance_m, ev.stroke, ev.course) : row.event_key}
                    </div>
                    <div className="text-xs text-ink/60">
                      {row.place != null ? `Place #${row.place}` : ""}
                      {row.exhibition ? " · exhibition" : ""}
                    </div>
                  </div>
                  <input
                    value={row.time_input}
                    onChange={(e) => {
                      const next = [...rows];
                      next[idx] = { ...next[idx], time_input: e.target.value };
                      setRows(next);
                    }}
                    className="w-28 rounded-xl border border-gray-200 px-2 py-1 text-sm tabular-nums"
                  />
                  <StatusBadge status={row.status} />
                  <ConflictControls
                    row={row}
                    onAction={(action) => {
                      const next = [...rows];
                      next[idx] = { ...next[idx], action };
                      setRows(next);
                    }}
                  />
                </li>
              );
            })}
          </ul>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || rows.every((r) => r.action === "SKIP")}
              className="inline-flex min-h-11 items-center rounded-xl bg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save selected results"}
            </button>
            {saveError && <span className="text-sm text-std-bb">{saveError}</span>}
          </div>
        </section>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: RowStatus }) {
  const color =
    status === "NEW"
      ? "bg-std-aa/20 text-std-aa"
      : status === "DUPLICATE"
        ? "bg-std-b text-ink/70"
        : "bg-std-bb/15 text-std-bb";
  const label =
    status === "NEW"
      ? "NEW"
      : status === "DUPLICATE"
        ? "DUPLICATE — skip"
        : "CONFLICT — review";
  return (
    <span className={`inline-flex items-center self-start rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

function ConflictControls({ row, onAction }: { row: ResolvedRow; onAction: (a: RowAction) => void }) {
  if (row.status === "NEW") {
    return (
      <label className="inline-flex items-center gap-1 text-xs text-ink/70">
        <input
          type="checkbox"
          checked={row.action === "NEW"}
          onChange={(e) => onAction(e.target.checked ? "NEW" : "SKIP")}
        />
        Save
      </label>
    );
  }
  if (row.status === "DUPLICATE") {
    return (
      <span className="text-xs text-ink/60">
        Existing: {formatTime(row.existing_time_ms!)} — skipped
      </span>
    );
  }
  // CONFLICT
  return (
    <div className="flex flex-col gap-1 text-xs">
      <label className="inline-flex items-center gap-1">
        <input
          type="radio"
          name={`conflict-${row.event_key}`}
          checked={row.action === "SKIP"}
          onChange={() => onAction("SKIP")}
        />
        Keep existing ({formatTime(row.existing_time_ms!)})
      </label>
      <label className="inline-flex items-center gap-1">
        <input
          type="radio"
          name={`conflict-${row.event_key}`}
          checked={row.action === "OVERWRITE"}
          onChange={() => onAction("OVERWRITE")}
        />
        Overwrite with {formatTime(row.time_ms_parsed)}
      </label>
    </div>
  );
}
