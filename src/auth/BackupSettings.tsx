import { useCallback, useEffect, useState } from "react";
import {
  downloadBackup,
  listBackups,
  restoreBackupToScratch,
  verifyBackup,
  type BackupItem,
} from "./api.js";
import { useAuth } from "./AuthProvider.js";

const formatBytes = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function BackupSettings() {
  const { session, setError } = useAuth();
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const refresh = useCallback(async () => {
    try {
      setBackups((await listBackups()).backups);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load backup history.");
    }
  }, [setError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const verify = async (backup: BackupItem) => {
    if (!session) return;
    setBusyId(backup.id);
    setNotice("");
    try {
      const result = await verifyBackup(backup.id, session.csrfToken);
      setNotice(
        result.valid
          ? `Integrity check passed for ${backup.id}. The encrypted file matches its recorded SHA-256.`
          : `Integrity check failed for ${backup.id}. Do not restore this file.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not verify this backup.");
    } finally {
      setBusyId(null);
    }
  };

  const download = async (backup: BackupItem) => {
    setBusyId(backup.id);
    setError(null);
    try {
      await downloadBackup(backup.id);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not download this backup.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const restore = async (backup: BackupItem) => {
    if (!session) return;
    const confirmation = window.prompt(
      `This creates a new scratch database and does not replace the live database. Type RESTORE ${backup.id} to continue:`,
    );
    if (confirmation === null) return;
    setBusyId(backup.id);
    setNotice("");
    try {
      const result = await restoreBackupToScratch(
        backup.id,
        confirmation,
        session.csrfToken,
      );
      setNotice(
        `Restore completed into new scratch database ${result.databaseName}. Inspect it on the VM before any recovery decision.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not restore this backup.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="welcome-panel backup-panel" aria-labelledby="backup-title">
      <div className="security-heading">
        <div>
          <h2 id="backup-title">Encrypted database backups</h2>
          <p>
            Daily encrypted copies are retained on the VM and copied to off-site storage.
          </p>
        </div>
        <button type="button" className="theme-toggle" onClick={() => void refresh()}>
          Refresh history
        </button>
      </div>
      {notice && (
        <p className="backup-notice" role="status">
          {notice}
        </p>
      )}
      {backups.length === 0 ? (
        <p>No backups are listed. The VM backup job must be configured and run first.</p>
      ) : (
        <div className="backup-list">
          {backups.map((backup) => (
            <article className="backup-row" key={backup.id}>
              <div className="backup-info">
                <strong>{new Date(backup.createdAt).toLocaleString()}</strong>
                <span>
                  {backup.fileName} · {formatBytes(backup.sizeBytes)} ·{" "}
                  {backup.offsite === "copied"
                    ? "Off-site copy complete"
                    : "Off-site copy pending"}
                </span>
              </div>
              <div className="backup-actions">
                <button
                  className="theme-toggle"
                  type="button"
                  disabled={busyId === backup.id}
                  onClick={() => void verify(backup)}
                >
                  {busyId === backup.id ? "Working…" : "Check integrity"}
                </button>
                <button
                  className="theme-toggle"
                  type="button"
                  disabled={busyId === backup.id}
                  onClick={() => void download(backup)}
                >
                  Download encrypted
                </button>
                <button
                  className="text-button"
                  type="button"
                  disabled={busyId === backup.id}
                  onClick={() => void restore(backup)}
                >
                  Restore to scratch
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="security-note">
        Integrity check verifies the encrypted file hash. Restore also authenticates the
        encryption and imports into a new scratch database. It cannot overwrite the live
        database.
      </p>
    </section>
  );
}
