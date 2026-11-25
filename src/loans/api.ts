import { authRequest } from "../auth/api.js";

export interface LoanScheduleLine {
  dueDate: string;
  emiAmount: string;
  principalAmount: string;
  interestAmount: string;
  closingBalance: string;
}

export interface Loan {
  id: string;
  name: string;
  provider: string;
  principal: string;
  annualRate: string;
  termMonths: number;
  emiAmount: string;
  dueDay: number;
  startDate: string;
  status: "ACTIVE" | "CLOSED";
  outstanding: string;
  paymentCount: number;
  nextDueDate: string | null;
  schedule: LoanScheduleLine[];
}

export interface LoanAccount {
  id: string;
  name: string;
  accountType: "BANK" | "CASH" | "UPI" | "CREDIT_CARD";
  balance: string;
}

export const listLoans = async (): Promise<Loan[]> =>
  (await authRequest<{ loans: Loan[] }>("/loans")).loans;

export const listLoanAccounts = async (): Promise<LoanAccount[]> =>
  (await authRequest<{ accounts: LoanAccount[] }>("/accounts")).accounts;

export const createLoan = (
  input: {
    name: string;
    provider: string;
    principal: string;
    annualRate: string;
    termMonths: number;
    dueDay: number;
    startDate: string;
    setupMode: "DISBURSEMENT" | "EXISTING_BALANCE";
    fundingAccountId: string | null;
  },
  csrfToken: string,
  idempotencyKey: string,
) =>
  authRequest<{ loan: Loan }>("/loans", {
    method: "POST",
    body: input,
    csrfToken,
    idempotencyKey,
  });

export const postLoanPayment = (
  loanId: string,
  input: {
    effectiveDate: string;
    accountId: string;
    amount: string;
    principalAmount: string;
    interestAmount: string;
    countsAsEmi: boolean;
    note: string;
  },
  csrfToken: string,
  idempotencyKey: string,
) =>
  authRequest<{ posted: boolean }>(`/loans/${encodeURIComponent(loanId)}/payments`, {
    method: "POST",
    body: input,
    csrfToken,
    idempotencyKey,
  });

export const postLoanPrepayment = (
  loanId: string,
  input: {
    effectiveDate: string;
    accountId: string;
    amount: string;
    note: string;
  },
  csrfToken: string,
  idempotencyKey: string,
) =>
  authRequest<{ posted: boolean }>(`/loans/${encodeURIComponent(loanId)}/prepayments`, {
    method: "POST",
    body: input,
    csrfToken,
    idempotencyKey,
  });
