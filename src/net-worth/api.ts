import { apiRequest } from "../auth/api.js";

export interface PositionItem {
  id: string;
  label: string;
  bucket: string;
  value: string;
}
export interface Position {
  asOfDate: string;
  totalAssets: string;
  totalLiabilities: string;
  netWorth: string;
  debtToAssetRatio: string | null;
  assetBreakdown: PositionItem[];
  liabilityBreakdown: PositionItem[];
}
export interface HistoryPoint {
  date: string;
  assets: string;
  liabilities: string;
  netWorth: string;
}
export interface MonthSummary {
  month: string;
  income: string;
  expenses: string;
  invested: string;
  cashFlow: string;
}
export interface DashboardData {
  asOfDate: string;
  position: Position;
  whereMoneyStands: {
    cash: string;
    investments: string;
    loans: string;
    creditCards: string;
  };
  peopleTracker: {
    receivable: string;
    payable: string;
    net: string;
    peopleCount: number;
  };
  month: MonthSummary;
  history: HistoryPoint[];
  upcoming: Array<{ name: string; dueDate: string; amount: string }>;
  priceFreshness: Array<{
    id: string;
    name: string;
    source: string | null;
    date: string | null;
    stale: boolean;
  }>;
}
export interface NetWorthData {
  position: Position;
  changeThisMonth: string | null;
  history: HistoryPoint[];
  priceFreshness: DashboardData["priceFreshness"];
}
export interface ReportsData {
  year: number;
  asOfDate: string;
  position: Position;
  monthly: MonthSummary[];
  history: HistoryPoint[];
}

export const loadDashboard = () => apiRequest<DashboardData>("/dashboard");
export const loadNetWorth = () => apiRequest<NetWorthData>("/net-worth");
export const loadReports = (year: number) =>
  apiRequest<ReportsData>(`/reports?year=${year}`);
