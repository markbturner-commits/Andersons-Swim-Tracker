"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const schema = z.object({
  email: z.string().email("Enter a valid email."),
});

type FormValues = z.infer<typeof schema>;

type Status = "idle" | "sending" | "sent" | "error";

const SIGNUP_DENIED_HINTS = [
  "invitation only",
  "not allowed",
  "signupnotapproved",
];

function classifyAuthError(message: string | null): string {
  if (!message) return "";
  const lower = message.toLowerCase();
  if (SIGNUP_DENIED_HINTS.some((hint) => lower.includes(hint))) {
    return "Sign-up by invitation only. Email mark@... to be added.";
  }
  return message;
}

export default function LoginPage() {
  const searchParams = useSearchParams();
  const queryError = classifyAuthError(searchParams.get("error"));

  const [status, setStatus] = useState<Status>("idle");
  const [serverError, setServerError] = useState<string>(queryError);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: { email: "" },
  });

  async function onSubmit(values: FormValues) {
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      setServerError(parsed.error.errors[0]?.message ?? "Invalid input");
      return;
    }

    setStatus("sending");
    setServerError("");

    try {
      const supabase = createSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.signInWithOtp({
        email: parsed.data.email,
        options: { emailRedirectTo: redirectTo },
      });

      if (error) {
        const msg = classifyAuthError(error.message);
        setServerError(msg || error.message);
        setStatus("error");
        return;
      }

      setStatus("sent");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setServerError(classifyAuthError(msg) || msg);
      setStatus("error");
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-white p-6">
      <div className="w-full max-w-sm">
        <header className="text-center">
          <h1 className="font-display text-3xl font-semibold text-navy">
            Anderson&apos;s Swim Tracker
          </h1>
          <p className="mt-2 text-ink">
            Track every meet. See if you&apos;re getting faster. That&apos;s it.
          </p>
        </header>

        {status === "sent" ? (
          <div
            className="mt-8 rounded-xl border border-gray-200 p-4 text-center"
            role="status"
            aria-live="polite"
          >
            <p className="font-semibold text-navy">Check your email.</p>
            <p className="mt-1 text-sm text-ink">
              We sent you a magic link. Click it to sign in.
            </p>
          </div>
        ) : (
          <form
            className="mt-8 space-y-4"
            onSubmit={handleSubmit(onSubmit)}
            noValidate
          >
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-navy"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? "email-error" : undefined}
                className="mt-1 block w-full min-h-11 rounded-xl border border-gray-200 px-3 py-2 text-ink focus-visible:ring-2 focus-visible:ring-aqua focus-visible:outline-none"
                placeholder="you@example.com"
                {...register("email", { required: true })}
              />
              {errors.email && (
                <p id="email-error" className="mt-1 text-sm text-red-600">
                  {errors.email.message ?? "Email is required."}
                </p>
              )}
            </div>

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
              disabled={status === "sending"}
              className="block w-full min-h-11 rounded-xl bg-aqua px-4 py-2 font-semibold text-white transition hover:bg-cyan-600 focus-visible:ring-2 focus-visible:ring-aqua focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
            >
              {status === "sending" ? "Sending..." : "Email me a magic link"}
            </button>

            <p className="text-center text-xs text-ink/60">
              Invite only — if you haven&apos;t been added, the link won&apos;t
              work.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
