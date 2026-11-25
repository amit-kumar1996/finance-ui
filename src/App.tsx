import { useEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router";
import { AuthProvider, useAuth } from "./auth/AuthProvider.js";
import { AuthScreen, RecoveryPasskeyScreen } from "./auth/AuthScreen.js";
import { logoutSession } from "./auth/api.js";
import { SecuritySettings } from "./auth/SecuritySettings.js";
import { BackupSettings } from "./auth/BackupSettings.js";
import { AccountsPage } from "./accounts/AccountsPage.js";
import { PeoplePage } from "./people/PeoplePage.js";
import { PersonDetailPage } from "./people/PersonDetailPage.js";
import { ExpensesPage } from "./expenses/ExpensesPage.js";
import { LoansPage } from "./loans/LoansPage.js";
import { InvestmentsPage } from "./investments/InvestmentsPage.js";
import { DashboardPage } from "./net-worth/DashboardPage.js";
import { NetWorthPage } from "./net-worth/NetWorthPage.js";
import { ReportsPage } from "./net-worth/ReportsPage.js";
import {
  getSyncSnapshot,
  refreshPendingCount,
  subscribeSyncState,
} from "./offline/database.js";
import { registerOfflineWorker, syncNow } from "./offline/sync.js";
import { SyncQueuePanel } from "./offline/SyncQueuePanel.js";

const primaryNavigation = [
  { label: "Dashboard", path: "/", mobileLabel: "Home" },
  { label: "Accounts", path: "/accounts" },
  { label: "People", path: "/people" },
  { label: "Expenses", path: "/expenses" },
];

const moreNavigation = [
  { label: "Loans & EMI", path: "/loans" },
  { label: "Investments", path: "/investments" },
  { label: "Net Worth", path: "/net-worth" },
  { label: "Reports", path: "/reports" },
  { label: "Settings", path: "/settings" },
];

const allNavigation = [...primaryNavigation, ...moreNavigation];

function getSavedTheme(): "light" | "dark" {
  try {
    return localStorage.getItem("pfm-theme") === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function SyncBadge() {
  const [state, setState] = useState(getSyncSnapshot);
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  useEffect(() => {
    const unsubscribe = subscribeSyncState(() => setState(getSyncSnapshot()));
    const updateNetwork = () => setOnline(navigator.onLine);
    void refreshPendingCount();
    window.addEventListener("online", updateNetwork);
    window.addEventListener("offline", updateNetwork);
    return () => {
      unsubscribe();
      window.removeEventListener("online", updateNetwork);
      window.removeEventListener("offline", updateNetwork);
    };
  }, []);
  const label = state.conflicts
    ? `${state.pending} pending, ${state.conflicts} conflict${state.conflicts === 1 ? "" : "s"}`
    : state.syncing
      ? `Syncing, ${state.pending} pending`
      : !online
        ? `Offline, ${state.pending} pending`
        : state.pending
          ? `${state.pending} pending sync`
          : "Synced, zero pending";
  const display = state.syncing
    ? `Syncing · ${state.pending} pending`
    : !online
      ? `Offline · ${state.pending} pending`
      : state.conflicts
        ? `${state.pending} pending · ${state.conflicts} conflict${state.conflicts === 1 ? "" : "s"}`
        : state.pending
          ? `${state.pending} pending sync`
          : "Synced · 0 pending";
  return (
    <div
      className={`sync-badge${state.pending ? " sync-pending" : ""}`}
      aria-label={label}
    >
      <span className="sync-dot" /> {display}
    </div>
  );
}

function PageHeading({
  title,
  theme,
  onToggleTheme,
  onLogout,
}: {
  title: string;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1 id="page-heading-title">{title}</h1>
        <p>Your personal financial position</p>
      </div>
      <div className="heading-actions">
        <button
          className="theme-toggle"
          type="button"
          aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
          onClick={onToggleTheme}
        >
          {theme === "light" ? "Dark mode" : "Light mode"}
        </button>
        <button className="theme-toggle" type="button" onClick={onLogout}>
          Sign out
        </button>
        <SyncBadge />
      </div>
    </div>
  );
}

function Page({
  title,
  theme,
  onToggleTheme,
  onLogout,
  personDetail = false,
}: {
  title: string;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onLogout: () => void;
  personDetail?: boolean;
}) {
  return (
    <>
      <PageHeading
        title={title}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onLogout={onLogout}
      />
      {title === "Settings" ? (
        <>
          <SecuritySettings />
          <BackupSettings />
          <SyncQueuePanel />
        </>
      ) : title === "Accounts" ? (
        <AccountsPage />
      ) : title === "People" ? (
        personDetail ? (
          <PersonDetailPage />
        ) : (
          <PeoplePage />
        )
      ) : title === "Expenses" ? (
        <ExpensesPage />
      ) : title === "Loans & EMI" ? (
        <LoansPage />
      ) : title === "Investments" ? (
        <InvestmentsPage />
      ) : title === "Dashboard" ? (
        <DashboardPage />
      ) : title === "Net Worth" ? (
        <NetWorthPage />
      ) : title === "Reports" ? (
        <ReportsPage />
      ) : (
        <section className="welcome-panel">
          <p>Welcome to your Personal Finance Manager</p>
          <span>
            Account totals and reports will appear here as you record transactions.
          </span>
        </section>
      )}
    </>
  );
}

function AppContent() {
  const { checkingSession, session, error, setError, clearSession, clearRecoveryCodes } =
    useAuth();
  const [theme, setTheme] = useState<"light" | "dark">(getSavedTheme);
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const toggleTheme = () =>
    setTheme((current) => (current === "light" ? "dark" : "light"));
  const signOut = async () => {
    if (!session) return;
    try {
      await logoutSession(session.csrfToken);
      clearSession();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign out.");
    }
  };
  const page = (title: string, personDetail = false) => (
    <Page
      title={title}
      theme={theme}
      onToggleTheme={toggleTheme}
      onLogout={() => void signOut()}
      personDetail={personDetail}
    />
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("pfm-theme", theme);
    } catch {
      // The selected theme still applies for this session if storage is unavailable.
    }
  }, [theme]);

  useEffect(() => setMoreOpen(false), [location.pathname]);

  useEffect(() => {
    if (!session || session.recoveryOnly) return;
    const runSync = () => {
      if (navigator.onLine) void syncNow(session.csrfToken).catch(() => undefined);
    };
    const onWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === "pfm-sync-complete") runSync();
    };
    void registerOfflineWorker();
    void refreshPendingCount();
    runSync();
    window.addEventListener("online", runSync);
    navigator.serviceWorker?.addEventListener("message", onWorkerMessage);
    return () => {
      window.removeEventListener("online", runSync);
      navigator.serviceWorker?.removeEventListener("message", onWorkerMessage);
    };
  }, [session?.csrfToken, session?.recoveryOnly]);

  if (checkingSession) {
    return (
      <main className="auth-screen">
        <p role="status">Checking your sign-in…</p>
      </main>
    );
  }
  if (!session) return <AuthScreen />;
  if (session.recoveryOnly) return <RecoveryPasskeyScreen />;

  return (
    <div className="app-shell">
      <aside className="desktop-sidebar" aria-label="Main navigation">
        <div className="brand">Personal Finance Manager</div>
        <nav>
          {allNavigation.map(({ label, path }) => (
            <NavLink
              key={path}
              to={path}
              end={path === "/"}
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="main-content">
        {error && (
          <p className="auth-error global-error" role="alert">
            {error}
          </p>
        )}
        {session.recoveryCodes && (
          <section className="recovery-codes" aria-labelledby="recovery-codes-title">
            <div>
              <h2 id="recovery-codes-title">Save your recovery codes</h2>
              <p>
                Each code works once. This list is shown only now, so store it somewhere
                private.
              </p>
            </div>
            <ul>
              {session.recoveryCodes.map((code) => (
                <li key={code}>{code}</li>
              ))}
            </ul>
            <button className="text-button" type="button" onClick={clearRecoveryCodes}>
              I’ve saved these codes
            </button>
          </section>
        )}
        <header className="mobile-header">
          <span className="mobile-brand">Personal Finance Manager</span>
          <SyncBadge />
        </header>
        <Routes>
          <Route path="/" element={page("Dashboard")} />
          <Route path="/accounts" element={page("Accounts")} />
          <Route path="/people" element={page("People")} />
          <Route path="/people/:personId" element={page("People", true)} />
          <Route path="/expenses" element={page("Expenses")} />
          <Route path="/loans" element={page("Loans & EMI")} />
          <Route path="/investments" element={page("Investments")} />
          <Route path="/net-worth" element={page("Net Worth")} />
          <Route path="/reports" element={page("Reports")} />
          <Route path="/settings" element={page("Settings")} />
          <Route path="*" element={page("Not found")} />
        </Routes>
      </main>

      <nav className="mobile-bottom-bar" aria-label="Mobile navigation">
        {primaryNavigation.map(({ label, path, mobileLabel }) => (
          <NavLink
            key={path}
            to={path}
            end={path === "/"}
            className={({ isActive }) => `mobile-nav-link${isActive ? " active" : ""}`}
          >
            {mobileLabel ?? label}
          </NavLink>
        ))}
        <button
          type="button"
          className={`mobile-nav-link${moreOpen ? " active" : ""}`}
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
        >
          More
        </button>
      </nav>

      {moreOpen && (
        <nav className="more-menu" aria-label="More pages">
          {moreNavigation.map(({ label, path }) => (
            <NavLink key={path} to={path} className="more-menu-link">
              {label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
