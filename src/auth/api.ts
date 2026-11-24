import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";

const apiBase = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api/v1";

export interface AuthSession {
  userId: string;
  csrfToken: string;
  expiresAt: string;
  recoveryOnly: boolean;
}

interface ApiEnvelope<T> {
  data: T;
}

export class AuthApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AuthApiError";
  }
}

export const authRequest = async <T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "DELETE";
    body?: unknown;
    csrfToken?: string;
    setupToken?: string;
  } = {},
): Promise<T> => {
  const headers = new Headers();
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (options.csrfToken) headers.set("X-CSRF-Token", options.csrfToken);
  if (options.setupToken) headers.set("X-Setup-Token", options.setupToken);
  const response = await fetch(`${apiBase}/auth${path}`, {
    method: options.method ?? "GET",
    credentials: "include",
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const payload = (await response.json()) as
    ApiEnvelope<T> | { error?: { message?: string } };
  if (!response.ok) {
    throw new AuthApiError(
      response.status,
      "error" in payload
        ? (payload.error?.message ?? "The request failed.")
        : "The request failed.",
    );
  }
  return (payload as ApiEnvelope<T>).data;
};

export const readCurrentSession = () => authRequest<AuthSession>("/session");

export const getRegistrationOptions = (setupToken?: string, csrfToken?: string) =>
  authRequest<{
    options: PublicKeyCredentialCreationOptionsJSON;
    isInitialSetup: boolean;
  }>("/register/options", {
    method: "POST",
    body: {},
    ...(setupToken ? { setupToken } : {}),
    ...(csrfToken ? { csrfToken } : {}),
  });

export const finishRegistration = (
  challenge: string,
  credential: RegistrationResponseJSON,
  csrfToken?: string,
) =>
  authRequest<{
    userId: string;
    session?: Omit<AuthSession, "recoveryOnly">;
    recoveryCodes?: string[];
  }>("/register/verify", {
    method: "POST",
    body: { challenge, credential },
    ...(csrfToken ? { csrfToken } : {}),
  });

export const getAuthenticationOptions = () =>
  authRequest<{ options: PublicKeyCredentialRequestOptionsJSON }>("/login/options", {
    method: "POST",
    body: {},
  });

export const finishAuthentication = (
  challenge: string,
  credential: AuthenticationResponseJSON,
) =>
  authRequest<Omit<AuthSession, "recoveryOnly">>("/login/verify", {
    method: "POST",
    body: { challenge, credential },
  });

export const recoverSession = (code: string) =>
  authRequest<Omit<AuthSession, "recoveryOnly">>("/recovery/verify", {
    method: "POST",
    body: { code },
  });

export const logoutSession = (csrfToken: string) =>
  authRequest<{ loggedOut: boolean }>("/logout", {
    method: "POST",
    body: {},
    csrfToken,
  });

export interface AuthDevice {
  id: string;
  deviceName: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export const listAuthDevices = () => authRequest<{ devices: AuthDevice[] }>("/devices");

export const revokeAuthDevice = (id: string, csrfToken: string) =>
  authRequest<{ removed: boolean }>(`/devices/${encodeURIComponent(id)}`, {
    method: "DELETE",
    csrfToken,
  });
