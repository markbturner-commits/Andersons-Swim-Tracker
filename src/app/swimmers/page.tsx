import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSwimmersForUser } from "@/lib/queries/swimmers";
import { ageOnDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SwimmersPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const swimmers = await getSwimmersForUser(supabase);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold text-navy">Swimmers</h1>
        <Link
          href="/swimmers/new"
          className="inline-flex min-h-11 items-center rounded-xl bg-aqua px-4 py-2 font-semibold text-white"
        >
          + Add swimmer
        </Link>
      </header>

      {swimmers.length === 0 ? (
        <div className="mt-8 rounded-xl border border-gray-200 p-6 text-center">
          <p className="text-ink">
            No swimmers yet. Add yourself or your kid to start tracking times.
          </p>
          <Link
            href="/swimmers/new"
            className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-aqua px-4 py-2 font-semibold text-white"
          >
            Add your first swimmer
          </Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {swimmers.map((s) => (
            <li
              key={s.id}
              className="rounded-xl border border-gray-200 p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-navy">{s.name}</p>
                  <p className="text-sm text-ink/70">
                    {s.gender === "F" ? "Girl" : "Boy"} · age{" "}
                    {ageOnDate(s.birthdate, today)}
                  </p>
                </div>
                <Link
                  href={`/results/new?swimmer=${s.id}`}
                  className="text-sm font-medium text-aqua hover:underline"
                >
                  + Log result
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
