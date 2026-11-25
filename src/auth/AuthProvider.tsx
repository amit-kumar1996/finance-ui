import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AuthApiError, readCurrentSession, type AuthSession } from "./api.js";

export interface SignedInState extends AuthSession {
  recoveryCodes?: string[];
}

let initialSessionRequest: Promise<AuthSession> | null = null;

function readInitialSession(): Promise<AuthSession> {
  if (!initialSessionRequest) {
    const request = readCurrentSession();
    initialSessionRequest = request;
    void request.then(
      () => {
        if (initialSessionRequest === request) initialSessionRequest = null;
      },
      () => {
        if (initialSessionRequest === request) initialSessionRequest = null;
      },
    );
  }
  return initialSessionRequest;
}

interface AuthContextValue {
  checkingSession: boolean;
  session: SignedInState | null;
  error: string | null;
  setError: (message: string | null) => void;
  establishSession: (
    session: Omit<AuthSession, "recoveryOnly"> & { recoveryOnly?: boolean },
    recoveryCodes?: string[],
  ) => void;
  clearSession: () => void;
  clearRecoveryCodes: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [checkingSession, setCheckingSession] = useState(true);
  const [session, setSession] = useState<SignedInState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void readInitialSession()
      .then((current) => {
        if (active) setSession(current);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if (!(cause instanceof AuthApiError && cause.status === 401)) {
          setError(cause instanceof Error ? cause.message : "Could not reach the API.");
        }
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const establishSession = useCallback(
    (
      value: Omit<AuthSession, "recoveryOnly"> & { recoveryOnly?: boolean },
      recoveryCodes?: string[],
    ) => {
      setSession({
        ...value,
        recoveryOnly: value.recoveryOnly ?? false,
        ...(recoveryCodes ? { recoveryCodes } : {}),
      });
      setError(null);
    },
    [],
  );
  const clearSession = useCallback(() => setSession(null), []);
  const clearRecoveryCodes = useCallback(() => {
    setSession((current) => {
      if (!current) return null;
      const { recoveryCodes: _recoveryCodes, ...withoutCodes } = current;
      return withoutCodes;
    });
  }, []);
  const value = useMemo(
    () => ({
      checkingSession,
      session,
      error,
      setError,
      establishSession,
      clearSession,
      clearRecoveryCodes,
    }),
    [checkingSession, session, error, establishSession, clearSession, clearRecoveryCodes],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
