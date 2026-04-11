"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Home, Search, MessageCircle, Bell, User } from "lucide-react";
import { useAuthStore, useNotificationStore, useUnreadMessagesStore } from "@/lib/store";
import { haptic } from "@/lib/haptics";

type NavItem = {
  href: string;
  icon: typeof Home;
  label: string;
  isDynamic?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/",              icon: Home,          label: "Главная"  },
  { href: "/search",        icon: Search,        label: "Поиск"    },
  { href: "/messages",      icon: MessageCircle, label: "Чаты"     },
  { href: "/notifications", icon: Bell,          label: "Уведомл." },
  { href: "/profile",       icon: User,          label: "Профиль", isDynamic: true },
];

const PILL_SPRING = { type: "spring", stiffness: 380, damping: 28, mass: 0.9 } as const;
const TAP_SPRING  = { type: "spring", stiffness: 500, damping: 25 } as const;

export function MobileNavBar() {
  const pathname   = usePathname();
  const profile    = useAuthStore((s) => s.profile);
  const unreadNoti = useNotificationStore((s) => s.unreadCount);
  const unreadMsgs = useUnreadMessagesStore((s) => s.unreadMessagesCount);

  function isActive(item: NavItem) {
    if (item.isDynamic) return pathname.startsWith("/profile");
    if (item.href === "/") return pathname === "/";
    return pathname.startsWith(item.href);
  }

  function resolveHref(item: NavItem) {
    if (item.isDynamic && profile?.username) return `/profile/${profile.username}`;
    if (item.isDynamic) return "#";
    return item.href;
  }

  function badgeFor(item: NavItem) {
    if (item.href === "/messages")       return unreadMsgs;
    if (item.href === "/notifications")  return unreadNoti;
    return 0;
  }

  return (
    /* Позиционирующий контейнер — full width только для позиционирования */
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-end",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)",
        pointerEvents: "none",
      }}
      className="lg:hidden"
    >
      {/* Floating pill — ширина по содержимому */}
      <div
        style={{
          pointerEvents: "auto",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "6px 8px",
          borderRadius: 9999,
          background: "rgba(16, 16, 20, 0.88)",
          backdropFilter: "blur(40px) saturate(180%)",
          WebkitBackdropFilter: "blur(40px) saturate(180%)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow:
            "0 4px 6px rgba(0,0,0,0.2), " +
            "0 10px 40px rgba(0,0,0,0.55), " +
            "inset 0 1px 0 rgba(255,255,255,0.09)",
        }}
      >
        {NAV_ITEMS.map((item) => {
          const active = isActive(item);
          const Icon   = item.icon;
          const badge  = badgeFor(item);

          return (
            <Link
              key={item.label}
              href={resolveHref(item)}
              style={{ textDecoration: "none", display: "block" }}
              onClick={() => haptic("light")}
            >
              <motion.div
                whileTap={{ scale: 0.82 }}
                transition={TAP_SPRING}
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 3,
                  width: 62,
                  height: 50,
                  borderRadius: 9999,
                  cursor: "pointer",
                }}
              >
                {/* Плавающий индикатор активного таба */}
                {active && (
                  <motion.div
                    layoutId="active-tab"
                    transition={PILL_SPRING}
                    style={{
                      position: "absolute",
                      inset: 0,
                      borderRadius: 9999,
                      background: "rgba(124, 58, 237, 0.20)",
                      border: "1px solid rgba(167, 139, 250, 0.25)",
                      boxShadow:
                        "inset 0 1px 0 rgba(255,255,255,0.12), " +
                        "0 0 12px rgba(124, 58, 237, 0.15)",
                    }}
                  />
                )}

                {/* Иконка */}
                <div style={{ position: "relative", zIndex: 1 }}>
                  <Icon
                    style={{
                      width: 22,
                      height: 22,
                      strokeWidth: active ? 2.2 : 1.6,
                      color: active
                        ? "rgba(167, 139, 250, 1)"
                        : "rgba(255,255,255,0.38)",
                      filter: active
                        ? "drop-shadow(0 0 6px rgba(139, 92, 246, 0.6))"
                        : "none",
                      transition: "color 0.2s ease, filter 0.2s ease",
                    }}
                  />

                  {/* Badge */}
                  {badge > 0 && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 20 }}
                      style={{
                        position: "absolute",
                        top: -5,
                        right: -7,
                        minWidth: 15,
                        height: 15,
                        borderRadius: 9999,
                        background: "#ef4444",
                        boxShadow: "0 2px 6px rgba(239,68,68,0.55)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "0 3px",
                        color: "#fff",
                        fontSize: 9,
                        fontWeight: 700,
                        lineHeight: 1,
                      }}
                    >
                      {badge > 99 ? "99+" : badge}
                    </motion.div>
                  )}
                </div>

                {/* Лейбл */}
                <span
                  style={{
                    position: "relative",
                    zIndex: 1,
                    fontSize: 10,
                    fontWeight: 500,
                    lineHeight: 1,
                    letterSpacing: "0.01em",
                    color: active
                      ? "rgba(196, 181, 253, 1)"
                      : "rgba(255,255,255,0.36)",
                    transition: "color 0.2s ease",
                  }}
                >
                  {item.label}
                </span>
              </motion.div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
