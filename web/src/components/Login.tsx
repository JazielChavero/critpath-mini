import { useState, type FormEvent } from "react";
import { login, LoginError } from "../api";
import { LangToggle, useI18n } from "../i18n";

export function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      onLoggedIn();
    } catch (err) {
      const wrong = err instanceof LoginError && err.message === "wrong_credentials";
      setError(t(wrong ? "wrongLogin" : "loginFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <LangToggle className="login-lang" />
      <form onSubmit={submit} className="login-form">
        <h1 className="brand">CritPath Mini</h1>
        <p className="login-intro">{t("tagline")}</p>
        <label>
          <span>{t("email")}</span>
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          <span>{t("password")}</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? t("loggingIn") : t("logIn")}
        </button>
      </form>
    </main>
  );
}
