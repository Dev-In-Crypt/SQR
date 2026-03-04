"use client";

import { useEffect, useState } from "react";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

interface SessionResponse {
  walletAddress: string | null;
}

export default function WalletButton({
  onSessionChange
}: {
  onSessionChange?: () => void;
}) {
  const [wallet, setWallet] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshSession() {
    const response = await fetch("/api/v1/session", { cache: "no-store" });
    if (!response.ok) {
      setWallet(null);
      return;
    }

    const data = (await response.json()) as SessionResponse;
    setWallet(data.walletAddress);
    onSessionChange?.();
  }

  useEffect(() => {
    void refreshSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connectWallet() {
    if (!window.ethereum) {
      setError("No injected wallet found (MetaMask/Rabby). ");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts"
      })) as string[];

      const address = accounts?.[0];
      if (!address) {
        throw new Error("No wallet account returned");
      }

      const nonceResp = await fetch("/api/v1/auth/nonce", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ wallet: address })
      });

      const nonceJson = (await nonceResp.json()) as {
        nonce?: string;
        message?: string;
        error?: { message?: string };
      };

      if (!nonceResp.ok || !nonceJson.nonce || !nonceJson.message) {
        throw new Error(nonceJson.error?.message || "Failed to create nonce");
      }

      const signature = (await window.ethereum.request({
        method: "personal_sign",
        params: [nonceJson.message, address]
      })) as string;

      const verifyResp = await fetch("/api/v1/auth/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          wallet: address,
          nonce: nonceJson.nonce,
          signature
        })
      });

      const verifyJson = (await verifyResp.json()) as {
        ok?: boolean;
        error?: { message?: string };
      };

      if (!verifyResp.ok || !verifyJson.ok) {
        throw new Error(verifyJson.error?.message || "Wallet login failed");
      }

      await refreshSession();
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : String(connectError));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    setError(null);
    try {
      await fetch("/api/v1/auth/logout", { method: "POST" });
      await refreshSession();
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : String(logoutError));
    } finally {
      setBusy(false);
    }
  }

  if (!wallet) {
    return (
      <div className="stack">
        <button className="button secondary" type="button" onClick={connectWallet} disabled={busy}>
          {busy ? "Connecting..." : "Connect wallet"}
        </button>
        {error ? <div className="error">{error}</div> : null}
      </div>
    );
  }

  return (
    <div className="row">
      <span className="badge">{wallet.slice(0, 6)}...{wallet.slice(-4)}</span>
      <button className="button secondary" type="button" onClick={logout} disabled={busy}>
        Logout
      </button>
      {error ? <span className="error">{error}</span> : null}
    </div>
  );
}
