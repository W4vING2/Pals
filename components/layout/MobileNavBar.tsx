"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Home, Search, PlusCircle, MessageCircle, User } from "lucide-react";
import { useAuthStore, useNotificationStore, useCreatePostStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  icon: typeof Home;
  label: string;
  isCreate?: boolean;
  isDynamic?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/search", icon: Search, label: "Search" },
  { href: "/create", icon: PlusCircle, label: "Create", isCreate: true },
  { href: "/messages", icon: MessageCircle, label: "Messages" },
  { href: "/profile", icon: User, label: "Profile", isDynamic: true },
];

export function MobileNavBar() {
  const pathname = usePathname();
  const profile = useAuthStore((s) => s.profile);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const openCreatePost = useCreatePostStore((s) => s.setOpen);

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
    <nav
      className="fixed inset-x-0 bottom-0 z-50 lg:hidden"
      style={{
        background: "rgba(15, 18, 25, 0.72)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        borderTop: "1px solid rgba(255, 255, 255, 0.06)",
        boxShadow: "0 -1px 20px rgba(0, 0, 0, 0.3)",
      }}
    >
      <div
        className="flex items-center justify-around px-2"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href, item.isDynamic);
          const Icon = item.icon;
          const href = resolveHref(item);

          // Create button opens dialog instead of navigating
          if (item.isCreate) {
            return (
              <button
                key={item.label}
                onClick={() => openCreatePost(true)}
                className="relative flex flex-1 flex-col items-center py-2"
              >
                <motion.div
                  className="relative flex flex-col items-center gap-0.5"
                  whileTap={{ scale: 0.92 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                >
                  <div className="gradient-bg relative flex h-8 w-8 items-center justify-center rounded-full">
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <span className="relative text-[10px] text-[var(--text-secondary)]">
                    {item.label}
                  </span>
                </motion.div>
              </button>
            );
          }

          return (
            <Link
              key={item.label}
              href={href}
              className="relative flex flex-1 flex-col items-center py-2"
            >
              <motion.div
                className="relative flex flex-col items-center gap-0.5"
                whileTap={{ scale: 0.92 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
              >
                {active && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute -inset-x-3 -inset-y-1 rounded-xl"
                    style={{ background: "rgba(26, 109, 255, 0.1)" }}
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}

                {/* isCreate items handled above with early return */}
                <motion.div
                    animate={active ? { scale: 1.1 } : { scale: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    className="relative"
                  >
                    <Icon
                      className={cn(
                        "h-5 w-5 transition-colors",
                        active
                          ? "text-[var(--accent-blue)]"
                          : "text-[var(--text-secondary)]"
                      )}
                    />
                    {item.label === "Messages" && unreadCount > 0 && (
                      <span className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--destructive)] px-1 text-[10px] font-bold text-white">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </motion.div>

                <span
                  className={cn(
                    "relative text-[10px]",
                    active
                      ? "font-semibold text-[var(--accent-blue)]"
                      : "text-[var(--text-secondary)]"
                  )}
                >
                  {item.label}
                </span>
              </motion.div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
