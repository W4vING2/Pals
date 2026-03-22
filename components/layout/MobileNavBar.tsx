"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Home, Search, MessageCircle, Bell, User } from "lucide-react";
import { useAuthStore, useNotificationStore, useUnreadMessagesStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  icon: typeof Home;
  label: string;
  isDynamic?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/search", icon: Search, label: "Search" },
  { href: "/messages", icon: MessageCircle, label: "Chat" },
  { href: "/notifications", icon: Bell, label: "Notifications" },
  { href: "/profile", icon: User, label: "Profile", isDynamic: true },
];

const spring = { type: "spring", stiffness: 500, damping: 35, mass: 0.8 } as const;

export function MobileNavBar() {
  const pathname = usePathname();
  const profile = useAuthStore((s) => s.profile);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const unreadMessages = useUnreadMessagesStore((s) => s.unreadMessagesCount);

  function isActive(href: string, isDynamic?: boolean) {
    if (isDynamic) return pathname.startsWith("/profile");
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  function resolveHref(item: NavItem) {
    if (item.isDynamic && profile?.username) return `/profile/${profile.username}`;
    if (item.isDynamic) return "#";
    return item.href;
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 lg:hidden"
      style={{
        background: "rgba(0, 0, 0, 0.85)",
        backdropFilter: "blur(28px) saturate(180%)",
        WebkitBackdropFilter: "blur(28px) saturate(180%)",
        borderTop: "1px solid rgba(255, 255, 255, 0.06)",
        boxShadow: "0 -1px 20px rgba(0, 0, 0, 0.5)",
      }}
    >
      <div
        className="flex items-center justify-around px-4"
        style={{ paddingBottom: "env(safe-area-inset-bottom)", height: 56 }}
      >
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href, item.isDynamic);
          const Icon = item.icon;
          const href = resolveHref(item);

          // Badge count for this item
          const badgeCount =
            item.label === "Chat"
              ? unreadMessages
              : item.label === "Notifications"
              ? unreadCount
              : 0;

          return (
            <Link
              key={item.label}
              href={href}
              className="relative flex items-center justify-center w-12 h-12"
            >
              <motion.div
                className="relative flex items-center justify-center"
                whileTap={{ scale: 0.85 }}
                transition={spring}
              >
                {/* Background pill indicator */}
                {active && (
                  <motion.div
                    layoutId="nav-pill"
                    className="absolute -inset-x-2 -inset-y-1.5 rounded-2xl"
                    style={{ background: "rgba(168, 85, 247, 0.15)" }}
                    transition={spring}
                  />
                )}

                <motion.div
                  animate={active ? { scale: 1.15 } : { scale: 1 }}
                  transition={spring}
                  className="relative"
                >
                  <Icon
                    className={cn(
                      "h-6 w-6 transition-colors duration-200",
                      active
                        ? "text-[var(--accent-blue)]"
                        : "text-[var(--text-secondary)]"
                    )}
                    strokeWidth={active ? 2.4 : 1.8}
                  />
                  {badgeCount > 0 && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 20 }}
                      className="absolute -right-2 -top-1.5 flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-[var(--destructive)] px-1 text-[10px] font-bold text-white"
                    >
                      {badgeCount > 99 ? "99+" : badgeCount}
                    </motion.span>
                  )}
                </motion.div>
              </motion.div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
