import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";
import { queueMutation } from "../offline/database.js";

const apiBase = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api/v1";

const isOfflineQueueable = (method: string, path: string) =>
  (method === "POST" || method === "PUT") &&
  (/^\/(?:expenses|transfers|ledger\/expenses|ledger\/credit-card-purchases|ledger\/credit-card-payments|people\/transactions)$/.test(
    path,
  ) ||
    /^\/loans\/[A-Za-z0-9_-]{1,30}\/(?:payments|prepayments)$/.test(path) ||
    /^\/investments\/[A-Za-z0-9_-]{1,30}\/(?:buys|sells|contributions|withdrawals|price|valuation)$/.test(
      path,
    ));

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
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  csrfToken?: string;
  setupToken?: string;
  idempotencyKey?: string;
}

export const apiRequest = async <T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> => {
  const headers = new Headers();
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (options.csrfToken) headers.set("X-CSRF-Token", options.csrfToken);
  if (options.setupToken) headers.set("X-Setup-Token", options.setupToken);
  if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey);
  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      method: options.method ?? "GET",
      credentials: "include",
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  } catch (error) {
    if (
      isOfflineQueueable(options.method ?? "GET", path) &&
      options.idempotencyKey &&
      options.csrfToken &&
      typeof options.body === "object" &&
      options.body !== null
    ) {
      const body = options.body as Record<string, unknown>;
      await queueMutation(
        options.idempotencyKey,
        options.method as "POST" | "PUT",
        path,
        body,
        options.csrfToken,
      );
      return {
        transaction: { id: options.idempotencyKey },
        queued: true,
        clientId: options.idempotencyKey,
      } as T;
    }
    throw error;
  }
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

export interface BackupItem {
  id: string;
  createdAt: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  encryption: "age";
  offsite: "copied" | "pending" | "failed";
}

export const listBackups = () => apiRequest<{ backups: BackupItem[] }>("/backups");

export const verifyBackup = (id: string, csrfToken: string) =>
  apiRequest<{ id: string; valid: boolean; checkedAt: string }>(
    `/backups/${encodeURIComponent(id)}/verify`,
    { method: "POST", body: {}, csrfToken },
  );

export const restoreBackupToScratch = (
  id: string,
  confirmation: string,
  csrfToken: string,
) =>
  apiRequest<{ restoreId: string; databaseName: string; status: "started" }>(
    `/backups/${encodeURIComponent(id)}/restore`,
    { method: "POST", body: { confirmation }, csrfToken },
  );

export const downloadBackup = async (id: string) => {
  const response = await fetch(`${apiBase}/backups/${encodeURIComponent(id)}/download`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    const payload = (await response.json()) as { error?: { message?: string } };
    throw new AuthApiError(
      response.status,
      payload.error?.message ?? "Could not download backup.",
    );
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  const fileName = disposition.match(/filename="([^"]+)"/)?.[1] ?? `${id}.sql.age`;
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
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
  apiRequest<{ accounts: FinancialAccount[] }>("/accounts");

export const getDefaultExpenseAccount = () =>
  apiRequest<{ account: FinancialAccount | null }>(
    "/preferences/default-expense-account",
  );

export const setDefaultExpenseAccount = (
  accountId: string | null,
  csrfToken: string,
  idempotencyKey: string,
) =>
  apiRequest<{ account: FinancialAccount | null }>(
    "/preferences/default-expense-account",
    {
      method: "PUT",
      body: { accountId },
      csrfToken,
      idempotencyKey,
    },
  );

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
  apiRequest<{ account: FinancialAccount }>("/accounts", {
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
  apiRequest<{ transaction: { id: string } }>("/transfers", {
    method: "POST",
    body: input,
    csrfToken,
    idempotencyKey,
  });

export type PersonMovement = "GIVE" | "RECEIVE" | "BORROW" | "REPAY";
export type PersonPaymentMethod = "CASH" | "UPI" | "CARD";

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
  movement: PersonMovement;
  paymentMethod: PersonPaymentMethod;
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
    paymentMethod: PersonPaymentMethod;
    personId: string;
    effectiveDate: string;
    amount: string;
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

export interface Expense {
  id: string;
  effectiveDate: string;
  description: string;
  amount: string;
  accountId: string;
  accountName: string;
}

export interface ExpensePeriodTotal {
  period: string;
  total: string;
  previousPeriod: string;
  previousTotal: string;
  difference: string;
}

export interface ExpenseSummary {
  date: string;
  daily: Omit<ExpensePeriodTotal, "previousPeriod" | "previousTotal" | "difference"> & {
    previousTotal: string;
    difference: string;
  };
  monthly: ExpensePeriodTotal;
  yearly: ExpensePeriodTotal;
}

export const listExpenses = (filters: {
  search?: string;
  from?: string;
  to?: string;
  month?: string;
}) => {
  const query = new URLSearchParams();
  if (filters.search) query.set("search", filters.search);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  if (filters.month) query.set("month", filters.month);
  return apiRequest<{ expenses: Expense[] }>(`/expenses${query.size ? `?${query}` : ""}`);
};

export const getExpenseSummary = async (date: string) => {
  const result = await apiRequest<{ summary: ExpenseSummary }>(
    `/expenses/summary?date=${encodeURIComponent(date)}`,
  );
  return result.summary;
};

export const createExpense = (
  input: {
    effectiveDate: string;
    amount: string;
    description: string;
    accountId: string;
  },
  csrfToken: string,
  idempotencyKey: string,
) =>
  apiRequest<{ transaction: { id: string }; queued?: boolean; clientId?: string }>(
    "/expenses",
    {
      method: "POST",
      body: input,
      csrfToken,
      idempotencyKey,
    },
  );

export const editExpense = (
  expenseId: string,
  input: { effectiveDate: string; amount: string; description: string },
  csrfToken: string,
  idempotencyKey: string,
) =>
  apiRequest<{ transaction: { id: string }; reversal: { id: string } }>(
    `/expenses/${encodeURIComponent(expenseId)}`,
    { method: "PATCH", body: input, csrfToken, idempotencyKey },
  );

export const deleteExpense = (
  expenseId: string,
  csrfToken: string,
  idempotencyKey: string,
) =>
  apiRequest<{ transaction: { id: string } }>(
    `/expenses/${encodeURIComponent(expenseId)}`,
    { method: "DELETE", csrfToken, idempotencyKey },
  );
