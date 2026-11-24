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
    idempotencyKey?: string;
  } = {},
): Promise<T> => {
  const headers = new Headers();
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (options.csrfToken) headers.set("X-CSRF-Token", options.csrfToken);
  if (options.setupToken) headers.set("X-Setup-Token", options.setupToken);
  if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey);
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

export type FinancialAccountType = "BANK" | "CASH" | "UPI" | "CREDIT_CARD";

export interface FinancialAccount {
  id: string;
  name: string;
  accountType: FinancialAccountType;
  institutionName: string | null;
  balance: string;
  createdAt: string;
}

export const listFinancialAccounts = () =>
  authRequest<{ accounts: FinancialAccount[] }>("/accounts");

export const createFinancialAccount = (
  input: {
    name: string;
    accountType: FinancialAccountType;
    institutionName: string | null;
    openingBalance: string;
    effectiveDate: string;
  },
  csrfToken: string,
  idempotencyKey: string,
) =>
  authRequest<{ account: FinancialAccount }>("/accounts", {
    method: "POST",
    body: input,
    csrfToken,
    idempotencyKey,
  });

export const createAccountTransfer = (
  input: {
    fromAccountId: string;
    toAccountId: string;
    effectiveDate: string;
    amount: string;
    description: string;
  },
  csrfToken: string,
  idempotencyKey: string,
) =>
  authRequest<{ transaction: { id: string } }>("/transfers", {
    method: "POST",
    body: input,
    csrfToken,
    idempotencyKey,
  });
