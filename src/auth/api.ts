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

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  csrfToken?: string;
  setupToken?: string;
  idempotencyKey?: string;
}

const apiRequest = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const headers = new Headers();
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (options.csrfToken) headers.set("X-CSRF-Token", options.csrfToken);
  if (options.setupToken) headers.set("X-Setup-Token", options.setupToken);
  if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey);
  const response = await fetch(`${apiBase}${path}`, {
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

export const authRequest = <T>(path: string, options: RequestOptions = {}) =>
  apiRequest<T>(`/auth${path}`, options);

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

export type PersonMovement = "GIVE" | "RECEIVE" | "BORROW" | "REPAY";

export interface PersonSummary {
  id: string;
  name: string;
  notes: string | null;
  createdAt: string;
  givenTotal: string;
  receivedTotal: string;
  borrowedTotal: string;
  repaidTotal: string;
  receivableBalance: string;
  payableBalance: string;
  netBalance: string;
  type: "Given" | "Borrowed" | "Both" | "—";
  givenOrBorrowed: string;
  receivedOrRepaid: string;
}

export interface PersonStatementRow {
  id: string;
  effectiveDate: string;
  description: string;
  movement: PersonMovement | "REVERSAL";
  amount: string;
  netEffect: "INCREASED" | "DECREASED";
  runningNetBalance: string;
  reversalOfId: string | null;
}

export interface PersonStatement {
  person: PersonSummary;
  transactions: PersonStatementRow[];
}

export const listPeople = () => apiRequest<{ people: PersonSummary[] }>("/people");

export const createPerson = (
  input: { name: string; notes?: string | null },
  csrfToken: string,
  idempotencyKey: string,
) =>
  apiRequest<{ person: PersonSummary }>("/people", {
    method: "POST",
    body: input,
    csrfToken,
    idempotencyKey,
  });

export const updatePerson = (
  personId: string,
  input: { name: string; notes?: string | null },
  csrfToken: string,
  idempotencyKey: string,
) =>
  apiRequest<{ person: PersonSummary }>(`/people/${encodeURIComponent(personId)}`, {
    method: "PATCH",
    body: input,
    csrfToken,
    idempotencyKey,
  });

export const archivePerson = (
  personId: string,
  csrfToken: string,
  idempotencyKey: string,
) =>
  apiRequest<{ id: string; archived: true }>(`/people/${encodeURIComponent(personId)}`, {
    method: "DELETE",
    csrfToken,
    idempotencyKey,
  });

export const postPersonMovement = (
  input: {
    movement: PersonMovement;
    personId: string;
    effectiveDate: string;
    amount: string;
    accountId: string;
    note?: string;
  },
  csrfToken: string,
  idempotencyKey: string,
) =>
  apiRequest<{ person: PersonSummary; transaction: { id: string } }>(
    "/people/transactions",
    { method: "POST", body: input, csrfToken, idempotencyKey },
  );

export const getPersonStatement = (personId: string) =>
  apiRequest<PersonStatement>(`/people/${encodeURIComponent(personId)}/statement`);
