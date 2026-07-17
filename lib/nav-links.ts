export interface NavLink {
  href: string;
  label: string;
}

// Single source of truth for the primary navigation, shared by the desktop nav
// (server-rendered in app/layout.tsx) and the mobile hamburger menu.
export const NAV_LINKS: readonly NavLink[] = [
  { href: "/#analyze", label: "New Analysis" },
  { href: "/quick", label: "Quick Scan" },
  { href: "/#capabilities", label: "Capabilities" },
  { href: "/#faq", label: "FAQ" },
  { href: "/#roadmap", label: "Roadmap" },
  { href: "/history", label: "History" }
];
