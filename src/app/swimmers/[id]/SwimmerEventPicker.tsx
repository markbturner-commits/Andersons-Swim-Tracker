"use client";

import { useRouter } from "next/navigation";
import { eventLabel } from "@/lib/format";
import type { SwimEvent } from "@/types/db";

export interface SwimmerEventPickerProps {
  events: SwimEvent[];
  selectedEventId: number;
  swimmerId: string;
}

export function SwimmerEventPicker({
  events,
  selectedEventId,
  swimmerId,
}: SwimmerEventPickerProps) {
  const router = useRouter();

  return (
    <div>
      <label
        htmlFor="event-picker"
        className="block text-xs font-medium uppercase tracking-wide text-ink/60"
      >
        Event
      </label>
      <select
        id="event-picker"
        value={selectedEventId}
        onChange={(e) => {
          const id = e.target.value;
          router.push(`/swimmers/${swimmerId}?tab=progression&event=${id}`);
        }}
        className="mt-1 block w-full min-h-11 rounded-md border border-gray-200 bg-white px-3 text-sm text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-aqua"
      >
        {events.map((ev) => (
          <option key={ev.id} value={ev.id}>
            {eventLabel(ev.distance_m, ev.stroke, ev.course)}
          </option>
        ))}
      </select>
    </div>
  );
}

export default SwimmerEventPicker;
