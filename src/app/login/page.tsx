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
  const [googleLoading, setGoogleLoading] = useState(false);

  async function signInWithGoogle() {
    setGoogleLoading(true);
    setServerError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) {
        setServerError(classifyAuthError(error.message) || error.message);
        setGoogleLoading(false);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setServerError(classifyAuthError(msg) || msg);
      setGoogleLoading(false);
    }
  }

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
          <div className="mt-8 space-y-4">
            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={googleLoading || status === "sending"}
              className="flex w-full min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 font-medium text-navy transition hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-aqua focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
            >
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18">
                <path
                  fill="#4285F4"
                  d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
                />
                <path
                  fill="#34A853"
                  d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
                />
                <path
                  fill="#FBBC05"
                  d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
                />
                <path
                  fill="#EA4335"
                  d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
                />
              </svg>
              {googleLoading ? "Redirecting..." : "Continue with Google"}
            </button>

            <div className="flex items-center gap-3 text-xs text-ink/50">
              <div className="h-px flex-1 bg-gray-200" />
              <span>or</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            <form
              className="space-y-4"
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
                Invite only — if you haven&apos;t been added, sign-in won&apos;t
                work.
              </p>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
