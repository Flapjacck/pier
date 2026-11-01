import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { PierStackedLogo } from "../components/brand/PierStackedLogo";
import { Button } from "../components/ui/Button";
import { Field } from "../components/ui/Field";
import { Input } from "../components/ui/Input";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { ApiError } from "../api/errors";

function loginErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.kind === "unauthorized") {
      return "That token did not match. Check the value and try again.";
    }
    if (err.kind === "rate_limited") {
      return "Too many attempts. Wait a minute, then try again.";
    }
    if (err.status === 400 && err.error === "auth disabled") {
      return "Login is off because PIER_API_TOKEN is not set on the backend.";
    }
    if (err.kind === "network" || err.kind === "unavailable") {
      return "Cannot reach Pier. Check that the backend is running, then try again.";
    }
  }
  return "Sign-in failed. Try again.";
}

interface Props {
  nextPath: string;
}

export function LoginPage({ nextPath }: Props) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const patternUrl =
    theme === "dark" ? "/patterns/pattern-waves-dark.svg" : "/patterns/pattern-waves-light.svg";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token.trim() || pending) return;
    setPending(true);
    setError(undefined);
    try {
      await login(token.trim());
      setToken("");
      navigate(nextPath, { replace: true });
    } catch (err) {
      setError(loginErrorMessage(err));
      inputRef.current?.focus();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative flex min-h-svh items-center justify-center bg-pier-bg px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] bg-center bg-repeat"
        style={{ backgroundImage: `url(${patternUrl})`, backgroundSize: "320px 320px" }}
      />
      <div className="relative w-full max-w-sm rounded-pier-lg border border-pier-border bg-pier-bg p-8">
        <div className="mb-8 flex justify-center text-pier-fg">
          <PierStackedLogo height={72} />
        </div>
        <h1 className="m-0 text-center text-lg font-bold text-pier-fg">Sign in</h1>
        <p className="mt-2 mb-6 text-center text-sm text-pier-muted m-0">
          Enter the API token configured on the Pier backend.
        </p>
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Field id="api-token" label="API token" error={error}>
              <Input
                ref={inputRef}
                name="token"
                type={showToken ? "text" : "password"}
                autoComplete="current-password"
                spellCheck={false}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                disabled={pending}
                invalid={Boolean(error)}
              />
            </Field>
            <Button
              type="button"
              variant="ghost"
              className="self-start px-0 text-[12px] text-pier-muted hover:text-pier-fg"
              aria-pressed={showToken}
              onClick={() => setShowToken((v) => !v)}
            >
              {showToken ? "Hide token" : "Show token"}
            </Button>
          </div>
          <Button type="submit" variant="primary" disabled={!token.trim() || pending} className="w-full">
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
