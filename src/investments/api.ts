import { apiRequest } from "../auth/api.js";

export type InvestmentType = "NPS" | "MUTUAL_FUND" | "STOCK" | "FD" | "PPF" | "EPF";
export interface Investment {
  id: string;
  investmentType: InvestmentType;
  name: string;
  provider: string | null;
  symbol: string | null;
  annualRate: string | null;
  maturityDate: string | null;
  units: string;
  invested: string;
  currentValue: string;
  realizedPl: string;
  unrealizedPl: string;
  xirr: string | null;
  price: string | null;
  priceSource: "AMFI" | "MANUAL" | "PROVIDER" | null;
  priceDate: string | null;
  stale: boolean;
  activities: Array<{
    id: string;
    type: string;
    effectiveDate: string;
    amount: string;
    units: string | null;
    unitPrice: string | null;
  }>;
}
export interface InvestmentAccount {
  id: string;
  name: string;
  accountType: "BANK" | "CASH" | "UPI" | "CREDIT_CARD";
}

export const listInvestments = async (): Promise<{
  investments: Investment[];
  mutualFundXirr: string | null;
}> =>
  apiRequest<{ investments: Investment[]; mutualFundXirr: string | null }>(
    "/investments",
  );
export const listInvestmentAccounts = async (): Promise<InvestmentAccount[]> =>
  (await apiRequest<{ accounts: InvestmentAccount[] }>("/accounts")).accounts;
export const createInvestment = (
  body: unknown,
  csrfToken: string,
  idempotencyKey: string,
) =>
  apiRequest<{ investmentId: string }>("/investments", {
    method: "POST",
    body,
    csrfToken,
    idempotencyKey,
  });
export const postInvestmentActivity = (
  id: string,
  action: "buys" | "sells" | "contributions" | "withdrawals",
  body: unknown,
  csrfToken: string,
  idempotencyKey: string,
) =>
  apiRequest<{ posted: boolean }>(`/investments/${encodeURIComponent(id)}/${action}`, {
    method: "POST",
    body,
    csrfToken,
    idempotencyKey,
  });
export const updateInvestmentPrice = (
  id: string,
  body: unknown,
  csrfToken: string,
  idempotencyKey: string,
) =>
  apiRequest<{ updated: boolean }>(`/investments/${encodeURIComponent(id)}/price`, {
    method: "PUT",
    body,
    csrfToken,
    idempotencyKey,
  });
export const updateInvestmentValuation = (
  id: string,
  body: unknown,
  csrfToken: string,
  idempotencyKey: string,
) =>
  apiRequest<{ updated: boolean }>(`/investments/${encodeURIComponent(id)}/valuation`, {
    method: "PUT",
    body,
    csrfToken,
    idempotencyKey,
  });
export const syncAmfiNav = (csrfToken: string) =>
  apiRequest<{
    updated: number;
    missing: string[];
    sourceDates: string[];
    source: "AMFI";
  }>("/investments/market-data/amfi/sync", {
    method: "POST",
    body: {},
    csrfToken,
    idempotencyKey: crypto.randomUUID(),
  });
