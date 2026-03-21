"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface AnimatedListProps {
  children: React.ReactNode;
  className?: string;
  staggerDelay?: number;
}

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.04,
    },
  },
};

const containerReducedMotion = {
  hidden: {},
  visible: {},
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] } },
};

const itemReducedMotion = {
  hidden: { opacity: 1, y: 0 },
  visible: { opacity: 1, y: 0 },
};

export function AnimatedList({ children, className, staggerDelay = 0.04 }: AnimatedListProps) {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const cVariants = prefersReducedMotion
    ? containerReducedMotion
    : {
        hidden: {},
        visible: { transition: { staggerChildren: staggerDelay } },
      };

  const iVariants = prefersReducedMotion ? itemReducedMotion : itemVariants;

  return (
    <motion.div
      className={cn(className)}
      variants={cVariants}
      initial="hidden"
      animate="visible"
    >
      {React.Children.map(children, (child) => (
        <motion.div variants={iVariants}>{child}</motion.div>
      ))}
    </motion.div>
  );
}
