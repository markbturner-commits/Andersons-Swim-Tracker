import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSwimmer } from "@/lib/queries/swimmers";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1, "Name is required").max(80),
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  gender: z.enum(["M", "F"]),
  usa_swimming_id: z.string().max(40).optional().or(z.literal("")),
});

async function createSwimmerAction(formData: FormData) {
  "use server";

  const parsed = schema.safeParse({
    name: formData.get("name"),
    birthdate: formData.get("birthdate"),
    gender: formData.get("gender"),
    usa_swimming_id: formData.get("usa_swimming_id") ?? "",
  });

  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join("; ");
    redirect(`/swimmers/new?error=${encodeURIComponent(msg)}`);
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Ensure a profile row exists (FK target for swimmers.owner_id).
  await supabase
    .from("profiles")
    .upsert(
      { id: user.id, display_name: user.email ?? null, is_parent: true },
      { onConflict: "id" },
    );

  await createSwimmer(
    {
      name: parsed.data.name,
      birthdate: parsed.data.birthdate,
      gender: parsed.data.gender,
      usa_swimming_id: parsed.data.usa_swimming_id || null,
    },
    user.id,
    supabase,
  );

  redirect("/swimmers");
}

export default async function NewSwimmerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const error = params.error;

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="font-display text-2xl font-semibold text-navy">
        Add a swimmer
      </h1>
      <p className="mt-1 text-sm text-ink/70">
        Name, birthdate, and gender — that&apos;s all we need to start.
      </p>

      <form action={createSwimmerAction} className="mt-6 space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-navy">
            Name
          </label>
          <input
            id="name"
            name="name"
            required
            maxLength={80}
            className="mt-1 block w-full min-h-11 rounded-xl border border-gray-200 px-3 py-2 text-ink focus-visible:ring-2 focus-visible:ring-aqua focus-visible:outline-none"
            placeholder="Anderson Turner"
          />
        </div>

        <div>
          <label
            htmlFor="birthdate"
            className="block text-sm font-medium text-navy"
          >
            Birthdate
          </label>
          <input
            id="birthdate"
            name="birthdate"
            type="date"
            required
            className="mt-1 block w-full min-h-11 rounded-xl border border-gray-200 px-3 py-2 text-ink focus-visible:ring-2 focus-visible:ring-aqua focus-visible:outline-none"
          />
        </div>

        <fieldset>
          <legend className="block text-sm font-medium text-navy">
            Gender
          </legend>
          <div className="mt-1 flex gap-4">
            <label className="inline-flex items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                name="gender"
                value="F"
                required
                className="h-4 w-4"
              />
              Girl
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                name="gender"
                value="M"
                required
                className="h-4 w-4"
              />
              Boy
            </label>
          </div>
        </fieldset>

        <div>
          <label
            htmlFor="usa_swimming_id"
            className="block text-sm font-medium text-navy"
          >
            USA Swimming ID <span className="text-ink/50">(optional)</span>
          </label>
          <input
            id="usa_swimming_id"
            name="usa_swimming_id"
            maxLength={40}
            className="mt-1 block w-full min-h-11 rounded-xl border border-gray-200 px-3 py-2 text-ink focus-visible:ring-2 focus-visible:ring-aqua focus-visible:outline-none"
          />
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-gray-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          className="block w-full min-h-11 rounded-xl bg-aqua px-4 py-2 font-semibold text-white"
        >
          Save swimmer
        </button>
      </form>
    </main>
  );
}
