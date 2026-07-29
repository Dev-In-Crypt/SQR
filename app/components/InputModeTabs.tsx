"use client";

import type { InputTab } from "@/app/hooks/useSolidityInputValidation";

export function InputModeTabs({
  tab,
  onChange,
  ariaLabel
}: {
  tab: InputTab;
  onChange: (tab: InputTab) => void;
  ariaLabel: string;
}) {
  return (
    <div className="home-tab-row" role="tablist" aria-label={ariaLabel}>
      <button
        className={`home-tab ${tab === "PASTE_CODE" ? "is-active" : ""}`}
        aria-pressed={tab === "PASTE_CODE"}
        type="button"
        onClick={() => onChange("PASTE_CODE")}
      >
        Paste code
      </button>
      <button
        className={`home-tab ${tab === "BASE_ADDRESS" ? "is-active" : ""}`}
        aria-pressed={tab === "BASE_ADDRESS"}
        type="button"
        onClick={() => onChange("BASE_ADDRESS")}
      >
        Contract address
      </button>
    </div>
  );
}
