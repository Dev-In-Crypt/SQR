"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface SessionResponse {
  walletAddress: string | null;
}

export default function WalletButton({
  onSessionChange
}: {
  onSessionChange?: () => void;
}) {
  const pathname = usePathname();
  const [wallet, setWallet] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  async function refreshSession() {
    const response = await fetch("/api/v1/session", { cache: "no-store" });
    if (!response.ok) {
      setWallet(null);
      window.dispatchEvent(new Event("sqr:session-changed"));
      return;
    }

    const data = (await response.json()) as SessionResponse;
    setWallet(data.walletAddress);
    window.dispatchEvent(new Event("sqr:session-changed"));
    onSessionChange?.();
  }

  useEffect(() => {
    void refreshSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const onWindowClick = () => setMenuOpen(false);
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    window.addEventListener("click", onWindowClick);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("click", onWindowClick);
      window.removeEventListener("keydown", onEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

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
      setMenuOpen(false);
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
    <div className="wallet-menu-wrap">
      <button
        className="button secondary"
        type="button"
        disabled={busy}
        onClick={(event) => {
          event.stopPropagation();
          setMenuOpen((open) => !open);
        }}
      >
        {wallet.slice(0, 6)}...{wallet.slice(-4)}
      </button>
      {menuOpen ? (
        <div className="wallet-menu" onClick={(event) => event.stopPropagation()}>
          {pathname !== "/history" ? (
            <Link className="wallet-menu-item" href="/history" onClick={() => setMenuOpen(false)}>
              History
            </Link>
          ) : null}
          <button className="wallet-menu-item" type="button" onClick={logout} disabled={busy}>
            Disconnect
          </button>
        </div>
      ) : null}
      {error ? <div className="error">{error}</div> : null}
    </div>
  );
}
