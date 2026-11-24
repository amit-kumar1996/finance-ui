import { useState } from "react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import {
  finishAuthentication,
  finishRegistration,
  getAuthenticationOptions,
  getRegistrationOptions,
  logoutSession,
  recoverSession,
} from "./api.js";
import { useAuth } from "./AuthProvider.js";

export function AuthScreen() {
  const { error, setError, establishSession } = useAuth();
  const [setupOpen, setSetupOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [setupToken, setSetupToken] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [pending, setPending] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The passkey operation could not be completed.",
      );
    } finally {
      setPending(false);
    }
  };

  const signIn = () =>
    run(async () => {
      const { options } = await getAuthenticationOptions();
      const credential = await startAuthentication({ optionsJSON: options });
      const session = await finishAuthentication(options.challenge, credential);
      establishSession(session);
    });

  const setUpPasskey = () =>
    run(async () => {
      if (!setupToken.trim()) throw new Error("Enter the one-time setup token first.");
      const { options } = await getRegistrationOptions(setupToken.trim());
      const credential = await startRegistration({ optionsJSON: options });
      const result = await finishRegistration(options.challenge, credential);
      if (!result.session)
        throw new Error("The initial passkey did not create a session.");
      establishSession(result.session, result.recoveryCodes);
      setSetupToken("");
    });

  const recover = () =>
    run(async () => {
      if (!recoveryCode.trim()) throw new Error("Enter one of your recovery codes.");
      const session = await recoverSession(recoveryCode.trim());
      establishSession({ ...session, recoveryOnly: true });
      setRecoveryCode("");
    });

  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="auth-title">
        <p className="auth-eyebrow">Private finance manager</p>
        <h1 id="auth-title">Sign in securely</h1>
        <p className="auth-description">
          Use a passkey saved on this device or in your password manager.
        </p>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="primary-button auth-primary"
          type="button"
          onClick={signIn}
          disabled={pending}
        >
          {pending ? "Please wait…" : "Continue with passkey"}
        </button>

        <div className="auth-separator">
          <span>First time here?</span>
        </div>
        {!setupOpen ? (
          <button
            className="text-button"
            type="button"
            onClick={() => setSetupOpen(true)}
          >
            Set up the first passkey
          </button>
        ) : (
          <form
            className="auth-form"
            onSubmit={(event) => {
              event.preventDefault();
              void setUpPasskey();
            }}
          >
            <label htmlFor="setup-token">One-time setup token</label>
            <input
              id="setup-token"
              autoComplete="off"
              type="password"
              value={setupToken}
              onChange={(event) => setSetupToken(event.target.value)}
            />
            <button className="primary-button" type="submit" disabled={pending}>
              Create passkey
            </button>
          </form>
        )}

        <div className="auth-separator">
          <span>Lost access to your passkeys?</span>
        </div>
        {!recoveryOpen ? (
          <button
            className="text-button"
            type="button"
            onClick={() => setRecoveryOpen(true)}
          >
            Use a recovery code
          </button>
        ) : (
          <form
            className="auth-form"
            onSubmit={(event) => {
              event.preventDefault();
              void recover();
            }}
          >
            <label htmlFor="recovery-code">Recovery code</label>
            <input
              id="recovery-code"
              autoComplete="off"
              value={recoveryCode}
              onChange={(event) => setRecoveryCode(event.target.value)}
            />
            <button className="primary-button" type="submit" disabled={pending}>
              Recover account
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

export function RecoveryPasskeyScreen() {
  const { session, establishSession, error, setError, clearSession } = useAuth();
  const [pending, setPending] = useState(false);

  const registerReplacement = async () => {
    setPending(true);
    setError(null);
    try {
      if (!session) throw new Error("Your recovery session has expired.");
      const { options } = await getRegistrationOptions(undefined, session.csrfToken);
      const credential = await startRegistration({ optionsJSON: options });
      const result = await finishRegistration(
        options.challenge,
        credential,
        session.csrfToken,
      );
      if (!result.session) throw new Error("The replacement passkey was not saved.");
      establishSession(result.session, result.recoveryCodes);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not register a new passkey.",
      );
    } finally {
      setPending(false);
    }
  };

  const cancelRecovery = async () => {
    try {
      if (session) {
        await logoutSession(session.csrfToken);
      }
    } finally {
      clearSession();
    }
  };

  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="recovery-title">
        <p className="auth-eyebrow">Account recovery</p>
        <h1 id="recovery-title">Register a replacement passkey</h1>
        <p className="auth-description">
          Your previous passkeys and sessions were invalidated. Create a new passkey to
          finish recovery.
        </p>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="primary-button auth-primary"
          type="button"
          onClick={() => void registerReplacement()}
          disabled={pending}
        >
          {pending ? "Please wait…" : "Create replacement passkey"}
        </button>
        <button
          className="text-button"
          type="button"
          onClick={() => void cancelRecovery()}
        >
          Cancel recovery
        </button>
      </section>
    </main>
  );
}
