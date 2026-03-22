"use client";

import React, { useEffect, useRef } from "react";
import { useMotionValue, useSpring, useTransform, motion } from "framer-motion";

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  className?: string;
}

export function AnimatedCounter({ value, duration = 0.8, className }: AnimatedCounterProps) {
  const isFirstRender = useRef(true);
  const motionValue = useMotionValue(value); // Start at actual value, not 0
  const springValue = useSpring(motionValue, {
    stiffness: 100,
    damping: 30,
    duration: duration * 1000,
  });
  const display = useTransform(springValue, (latest) =>
    Math.round(latest).toLocaleString()
  );

  useEffect(() => {
    if (isFirstRender.current) {
      // First render: set immediately, no animation
      isFirstRender.current = false;
      motionValue.jump(value);
    } else {
      // Subsequent updates: animate
      motionValue.set(value);
    }
  }, [value, motionValue]);

  return <motion.span className={className}>{display}</motion.span>;
}
