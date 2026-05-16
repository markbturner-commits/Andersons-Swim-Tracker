"use client";

import { useEffect, useMemo, useState } from "react";
import type { Swimmer, Meet, SwimEvent } from "@/types/db";
import { eventLabel, formatTime } from "@/lib/format";

interface SavedFlash {
  isPr: boolean;
  deltaMs: number | null;
  time: string;
}

interface Props {
  swimmers: Swimmer[];
  meets: Meet[];
  events: SwimEvent[];
  initialSwimmerId: string | null;
  serverError: string | null;
  savedFlash: SavedFlash | null;
  action: (formData: FormData) => Promise<void>;
}

const NEW_MEET = "__new__";

export function ResultEntryForm({
  swimmers,
  meets,
  events,
  initialSwimmerId,
  serverError,
  savedFlash,
  action,
}: Props) {
  const [swimmerId, setSwimmerId] = useState<string>(
    initialSwimmerId ?? swimmers[0]?.id ?? "",
  );
  const [meetId, setMeetId] = useState<string>(meets[0]?.id ?? NEW_MEET);
  const [showToast, setShowToast] = useState<boolean>(!!savedFlash);

  useEffect(() => {
    if (savedFlash) {
      setShowToast(true);
      const t = setTimeout(() => setShowToast(false), 6000);
      return () => clearTimeout(t);
    }
  }, [savedFlash]);

  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      if (a.course !== b.course) return a.course.localeCompare(b.course);
      if (a.stroke !== b.stroke) return a.stroke.localeCompare(b.stroke);
      return a.distance_m - b.distance_m;
    });
  }, [events]);

  return (
    <>
      {showToast && savedFlash && (
        <div
          role="status"
          aria-live="polite"
          className="fixed left-1/2 top-6 z-50 -translate-x-1/2 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
        >
          {savedFlash.isPr ? (
            <p className="text-sm font-semibold text-navy">
              <span aria-hidden="true">✨ </span>
              New PR! {savedFlash.time}
              {savedFlash.deltaMs !== null && (
                <span className="ml-1 text-ink/70 font-normal">
                  — {formatTime(savedFlash.deltaMs)} faster
                </span>
              )}
            </p>
          ) : (
            <p className="text-sm text-navy">Saved — {savedFlash.time}.</p>
          )}
        </div>
      )}

      <form action={action} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="swimmer_id"
            className="block text-sm font-medium text-navy"
          >
            Swimmer
          </label>
          <select
            id="swimmer_id"
            name="swimmer_id"
            value={swimmerId}
            onChange={(e) => setSwimmerId(e.target.value)}
            required
            className="mt-1 block w-full min-h-11 rounded-xl border border-gray-200 px-3 py-2 text-ink focus-visible:ring-2 focus-visible:ring-aqua focus-visible:outline-none"
          >
            {swimmers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="meet_id"
            className="block text-sm font-medium text-navy"
          >
            Meet
          </label>
          <select
            id="meet_id"
            name="meet_id"
            value={meetId}
            onChange={(e) => setMeetId(e.target.value)}
            required
            className="mt-1 block w-full min-h-11 rounded-xl border border-gray-200 px-3 py-2 text-ink focus-visible:ring-2 focus-visible:ring-aqua focus-visible:outline-none"
          >
            {meets.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} — {m.start_date}
              </option>
            ))}
            <option value={NEW_MEET}>+ Create new meet…</option>
          </select>
        </div>

        {meetId === NEW_MEET && (
          <fieldset className="rounded-xl border border-gray-200 p-4">
            <legend className="px-2 text-sm font-medium text-navy">
              New meet
            </legend>
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="new_meet_name"
                  className="block text-sm font-medium text-navy"
                >
                  Name
                </label>
                <input
                  id="new_meet_name"
                  name="new_meet_name"
                  required
                  className="mt-1 block w-full min-h-11 rounded-xl border border-gray-200 px-3 py-2 text-ink focus-visible:ring-2 focus-visible:ring-aqua focus-visible:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="new_meet_date"
                  className="block text-sm font-medium text-navy"
                >
                  Date
                </label>
                <input
                  id="new_meet_date"
                  name="new_meet_date"
                  type="date"
                  required
                  className="mt-1 block w-full min-h-11 rounded-xl border border-gray-200 px-3 py-2 text-ink focus-visible:ring-2 focus-visible:ring-aqua focus-visible:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="new_meet_course"
                  className="block text-sm font-medium text-navy"
                >
                  Course
                </label>
                <select
                  id="new_meet_course"
                  name="new_meet_course"
                  defaultValue="SCY"
                  required
                  className="mt-1 block w-full min-h-11 rounded-xl border border-gray-200 px-3 py-2 text-ink focus-visible:ring-2 focus-visible:ring-aqua focus-visible:outline-none"
                >
                  <option value="SCY">Short Course Yards</option>
                  <option value="SCM">Short Course Meters</option>
                  <option value="LCM">Long Course Meters</option>
                </select>
              </div>
            </div>
          </fieldset>
        )}

        <div>
          <label
            htmlFor="event_id"
            className="block text-sm font-medium text-navy"
          >
            Event
          </label>
          <select
            id="event_id"
            name="event_id"
            required
            className="mt-1 block w-full min-h-11 rounded-xl border border-gray-200 px-3 py-2 text-ink focus-visible:ring-2 focus-visible:ring-aqua focus-visible:outline-none"
          >
            {sortedEvents.map((e) => (
              <option key={e.id} value={e.id}>
                {eventLabel(e.distance_m, e.stroke, e.course)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="time" className="block text-sm font-medium text-navy">
            Time
          </label>
          <input
            id="time"
            name="time"
            required
            inputMode="decimal"
            placeholder="MM:SS.hh or SS.hh"
            className="mt-1 block w-full min-h-11 rounded-xl border border-gray-200 px-3 py-2 text-ink focus-visible:ring-2 focus-visible:ring-aqua focus-visible:outline-none"
          />
        </div>

        <div>
          <label htmlFor="place" className="block text-sm font-medium text-navy">
            Place <span className="text-ink/50">(optional)</span>
          </label>
          <input
            id="place"
            name="place"
            type="number"
            min={1}
            className="mt-1 block w-full min-h-11 rounded-xl border border-gray-200 px-3 py-2 text-ink focus-visible:ring-2 focus-visible:ring-aqua focus-visible:outline-none"
          />
        </div>

        <label className="inline-flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="exhibition" value="1" className="h-4 w-4" />
          Exhibition swim (x time — counts but doesn&apos;t score)
        </label>

        <label className="inline-flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="overwrite" value="1" className="h-4 w-4" />
          Replace existing result for this swimmer/meet/event
        </label>

        {serverError && (
          <div
            role="alert"
            className="rounded-xl border border-gray-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {serverError}
          </div>
        )}

        <button
          type="submit"
          className="block w-full min-h-11 rounded-xl bg-aqua px-4 py-2 font-semibold text-white"
        >
          Save result
        </button>
      </form>
    </>
  );
}
