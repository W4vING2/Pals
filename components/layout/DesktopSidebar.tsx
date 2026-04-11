"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Home, Search, MessageCircle, User, Bell } from "lucide-react";
import { useAuthStore, useNotificationStore, useUnreadMessagesStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  icon: typeof Home;
  label: string;
  isDynamic?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", icon: Home, label: "Главная" },
  { href: "/search", icon: Search, label: "Поиск" },
  { href: "/messages", icon: MessageCircle, label: "Сообщения" },
  { href: "/notifications", icon: Bell, label: "Уведомления" },
  { href: "/profile", icon: User, label: "Профиль", isDynamic: true },
];

export function DesktopSidebar() {
  const pathname = usePathname();
  const profile = useAuthStore((s) => s.profile);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const unreadMessages = useUnreadMessagesStore((s) => s.unreadMessagesCount);

  function isActive(href: string, isDynamic?: boolean) {
    if (isDynamic) {
      return pathname.startsWith("/profile");
    }
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  function resolveHref(item: NavItem) {
    if (item.isDynamic && profile?.username) {
      return `/profile/${profile.username}`;
    }
    if (item.isDynamic) return "#";
    return item.href;
  }

  return (
    <aside className="desktop-sidebar fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-[var(--border)] bg-[var(--bg-surface)] lg:flex">
      {/* Logo */}
      <div className="flex h-16 items-center px-6">
        <Link href="/" className="gradient-text text-xl font-bold">
          Pals
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 px-3 py-2">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href, item.isDynamic);
          const Icon = item.icon;
          const href = resolveHref(item);

          return (
            <Link
              key={item.label}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-[var(--accent-blue)]/10 font-semibold text-[var(--accent-blue)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
              )}
            >
              <span className="relative">
                <Icon className="h-5 w-5" />
                {item.label === "Уведомления" && unreadCount > 0 && (
                  <span className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--destructive)] px-1 text-[10px] font-bold text-white">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
                {item.label === "Сообщения" && unreadMessages > 0 && (
                  <span className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--destructive)] px-1 text-[10px] font-bold text-white">
                    {unreadMessages > 99 ? "99+" : unreadMessages}
                  </span>
                )}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Profile section */}
      {profile && (
        <div className="border-t border-[var(--border)] p-3">
          <Link
            href={`/${profile.username}`}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-[var(--bg-elevated)]"
          >
            {profile.avatar_url ? (
              <Image
                src={profile.avatar_url}
                alt={profile.display_name || profile.username}
                width={36}
                height={36}
                className="rounded-full object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-elevated)]">
                <User className="h-4 w-4 text-[var(--text-secondary)]" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                {profile.display_name || profile.username}
              </p>
              <p className="truncate text-xs text-[var(--text-secondary)]">
                @{profile.username}
              </p>
            </div>
          </Link>
        </div>
      )}
    </aside>
  );
}
