"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useNotificationStore } from "@/lib/store";
import { useAuthStore } from "@/lib/store";

const navItems = [
  {
    href: "/",
    label: "Home",
    icon: (active: boolean) => (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9.5L12 3l9 6.5V21a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
        <path d="M9 22V12h6v10" />
      </svg>
    ),
  },
  {
    href: "/search",
    label: "Search",
    icon: (active: boolean) => (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.2" : "1.8"} strokeLinecap="round">
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4-4" />
      </svg>
    ),
  },
  {
    href: "/messages",
    label: "Messages",
    icon: (active: boolean) => (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" />
      </svg>
    ),
  },
  {
    href: "/notifications",
    label: "Alerts",
    icon: (active: boolean) => (
      <svg className="w-6 h-6" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 01-3.46 0" />
      </svg>
    ),
  },
];

export function BottomNav() {
  const pathname = usePathname();
  const { unreadCount } = useNotificationStore();
  const { profile } = useAuthStore();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 glass border-t border-[var(--border)] pb-safe lg:hidden">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-col items-center gap-1 px-3 py-1.5 rounded-2xl transition-all duration-150 ${
                active
                  ? "text-[var(--accent-blue)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
              aria-label={item.label}
            >
              <span className="relative">
                {item.icon(active)}
                {item.href === "/notifications" && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-[var(--accent-blue)] text-white text-[10px] font-bold flex items-center justify-center">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </span>
              <span className={`text-[10px] font-medium ${active ? "text-[var(--accent-blue)]" : ""}`}>
                {item.label}
              </span>
            </Link>
          );
        })}

        {/* Profile */}
        <Link
          href={profile ? `/profile/${profile.username}` : "#"}
          className={`relative flex flex-col items-center gap-1 px-3 py-1.5 rounded-2xl transition-all duration-150 ${
            pathname.startsWith("/profile")
              ? "text-[var(--accent-blue)]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          }`}
          aria-label="Profile"
        >
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.username}
              className="w-6 h-6 rounded-full object-cover"
            />
          ) : (
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill={pathname.startsWith("/profile") ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          )}
          <span className={`text-[10px] font-medium ${pathname.startsWith("/profile") ? "text-[var(--accent-blue)]" : ""}`}>
            Profile
          </span>
        </Link>
      </div>
    </nav>
  );
}
