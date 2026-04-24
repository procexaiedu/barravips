"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/utils/supabase/client";

type LoginFormProps = {
  next: string;
};

export function LoginForm({ next }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setSubmitting(false);
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <form className="login-form" onSubmit={handleSubmit} noValidate>
      <label className="form-field">
        <span>E-mail</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={submitting}
        />
      </label>
      <label className="form-field">
        <span>Senha</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={submitting}
        />
      </label>
      {error ? <p className="login-error" role="alert">{error}</p> : null}
      <button type="submit" className="button" disabled={submitting}>
        {submitting ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
