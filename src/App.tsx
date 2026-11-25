import { useEffect, useRef, useState } from "react";
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

function PageHeading({ title }: { title: string }) {
  return (
    <div className="page-heading">
      <div>
        <h1 id="page-heading-title">{title}</h1>
        <p>Your personal financial position</p>
      </div>
      <div className="heading-actions">
        <SyncBadge />
      </div>
    </div>
  );
}

function Page({
  title,
  personDetail = false,
}: {
  title: string;
  personDetail?: boolean;
}) {
  return (
    <>
      <PageHeading title={title} />
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

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

function UserMenu({
  className,
  menuRef,
  buttonRef,
  isOpen,
  onToggle,
  onClose,
  theme,
  onToggleTheme,
  onLogout,
  userId,
}: {
  className: string;
  menuRef: React.RefObject<HTMLDivElement | null>;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onLogout: () => void;
  userId: string;
}) {
  return (
    <div className={`user-menu ${className}`} ref={menuRef}>
      <button
        ref={buttonRef}
        type="button"
        className="user-menu-trigger"
        aria-label="Open user menu"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        <UserIcon />
      </button>
      {isOpen && (
        <div className="user-menu-panel" role="dialog" aria-label="User menu">
          <div className="user-menu-identity">
            <strong>Account owner</strong>
            <span>Signed in user</span>
            <code>{userId}</code>
          </div>
          <button type="button" className="user-menu-action" onClick={onToggleTheme}>
            <span>{theme === "light" ? "Dark mode" : "Light mode"}</span>
            <span className="user-menu-value">{theme === "light" ? "Off" : "On"}</span>
          </button>
          <button
            type="button"
            className="user-menu-action user-menu-logout"
            onClick={() => {
              onClose();
              onLogout();
            }}
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

function AppContent() {
  const { checkingSession, session, error, setError, clearSession, clearRecoveryCodes } =
    useAuth();
  const [theme, setTheme] = useState<"light" | "dark">(getSavedTheme);
  const [moreOpen, setMoreOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userButtonRef = useRef<HTMLButtonElement>(null);
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
    <Page title={title} personDetail={personDetail} />
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
    if (!userMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!userMenuRef.current?.contains(target)) {
        setUserMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setUserMenuOpen(false);
      userButtonRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [userMenuOpen]);

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

      <UserMenu
        className="global-user-menu"
        menuRef={userMenuRef}
        buttonRef={userButtonRef}
        isOpen={userMenuOpen}
        onToggle={() => setUserMenuOpen((open) => !open)}
        onClose={() => setUserMenuOpen(false)}
        theme={theme}
        onToggleTheme={toggleTheme}
        onLogout={() => void signOut()}
        userId={session.userId}
      />

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
