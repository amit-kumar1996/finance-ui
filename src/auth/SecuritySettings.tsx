import { useCallback, useEffect, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import {
  finishRegistration,
  getRegistrationOptions,
  listAuthDevices,
  revokeAuthDevice,
  type AuthDevice,
} from "./api.js";
import { useAuth } from "./AuthProvider.js";

export function SecuritySettings() {
  const { session, establishSession, setError } = useAuth();
  const [devices, setDevices] = useState<AuthDevice[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const result = await listAuthDevices();
      setDevices(result.devices);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load passkeys.");
    }
  }, [setError]);

  useEffect(() => {
    if (session && !session.recoveryOnly) void refresh();
  }, [session, refresh]);

  const addDevice = async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const { options } = await getRegistrationOptions(undefined, session.csrfToken);
      const credential = await startRegistration({ optionsJSON: options });
      const result = await finishRegistration(
        options.challenge,
        credential,
        session.csrfToken,
      );
      if (result.session) establishSession(result.session, result.recoveryCodes);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add a passkey.");
    } finally {
      setBusy(false);
    }
  };

  const removeDevice = async (device: AuthDevice) => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      await revokeAuthDevice(device.id, session.csrfToken);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove the passkey.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="welcome-panel security-panel">
      <div className="security-heading">
        <div>
          <h2>Passkeys and devices</h2>
          <p>Only your registered passkeys can sign in to this account.</p>
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={() => void addDevice()}
          disabled={busy}
        >
          Add passkey
        </button>
      </div>
      {devices.length === 0 ? (
        <p>No passkeys are available.</p>
      ) : (
        <ul className="device-list">
          {devices.map((device) => (
            <li key={device.id}>
              <div>
                <strong>{device.deviceName}</strong>
                <span>Added {new Date(device.createdAt).toLocaleDateString()}</span>
              </div>
              <button
                type="button"
                className="text-button danger-button"
                onClick={() => void removeDevice(device)}
                disabled={busy}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="security-note">
        You can’t remove the last passkey. Use a recovery code to replace lost devices.
      </p>
    </section>
  );
}
