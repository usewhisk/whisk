"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "@/lib/auth-client";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<"github" | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGithub() {
    setPending("github");
    setError(null);
    try {
      await signIn.social({ provider: "github", callbackURL: "/dashboard" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
      setPending(null);
    }
  }

  async function handleEmail(e: FormEvent) {
    e.preventDefault();
    setPending("email");
    setError(null);
    try {
      const res = await signIn.email({
        email,
        password,
        callbackURL: "/dashboard",
      });
      if (res.error) throw new Error(res.error.message ?? "Sign in failed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
      setPending(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <button
        type="button"
        className="btn btn-primary"
        onClick={handleGithub}
        disabled={pending !== null}
        style={{ width: "100%" }}
      >
        {pending === "github" ? "Redirecting…" : "Continue with GitHub"}
      </button>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          color: "var(--fg-muted)",
          fontSize: 12,
        }}
      >
        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        or
        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
      </div>

      <form
        onSubmit={handleEmail}
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button
          type="submit"
          className="btn btn-secondary"
          disabled={pending !== null}
          style={{ width: "100%" }}
        >
          {pending === "email" ? "Signing in…" : "Sign in with email"}
        </button>
      </form>

      {error ? (
        <p
          style={{
            color: "var(--danger)",
            fontSize: 13,
            margin: 0,
          }}
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
