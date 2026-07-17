"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { NAV_LINKS } from "@/lib/nav-links";

export default function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close on outside click and Escape (same pattern as WalletButton's menu).
  useEffect(() => {
    if (!open) {
      return;
    }

    const onWindowClick = () => setOpen(false);
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("click", onWindowClick);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("click", onWindowClick);
      window.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  // Close when the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="nav-menu-wrap">
      <button
        className="nav-toggle"
        type="button"
        aria-label="Toggle navigation menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <span className="nav-toggle-bar" />
        <span className="nav-toggle-bar" />
        <span className="nav-toggle-bar" />
      </button>
      {open ? (
        <div className="nav-menu" onClick={(event) => event.stopPropagation()}>
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              className="nav-menu-item"
              href={link.href}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
