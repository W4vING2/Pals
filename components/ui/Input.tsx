"use client";

import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function Input({
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  id,
  className = "",
  ...props
}: InputProps) {
  const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-[var(--text-secondary)]"
        >
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {leftIcon && (
          <span className="absolute left-3 text-[var(--text-secondary)] pointer-events-none">
            {leftIcon}
          </span>
        )}
        <input
          id={inputId}
          className={[
            "w-full rounded-2xl px-4 py-3 text-sm",
            "bg-[var(--bg-input)] text-[var(--text-primary)]",
            "border border-[var(--border)]",
            "placeholder:text-[var(--text-secondary)]",
            "transition-all duration-150 ease-out",
            "focus:outline-none focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[var(--accent-blue)]/20",
            error ? "border-red-500/70 focus:border-red-500 focus:ring-red-500/20" : "",
            leftIcon ? "pl-10" : "",
            rightIcon ? "pr-10" : "",
            className,
          ].join(" ")}
          {...props}
        />
        {rightIcon && (
          <span className="absolute right-3 text-[var(--text-secondary)]">
            {rightIcon}
          </span>
        )}
      </div>
      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1">
          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm.75 4.25a.75.75 0 10-1.5 0v4a.75.75 0 001.5 0v-4zm-.75 6a.875.875 0 100 1.75A.875.875 0 008 11.25z" />
          </svg>
          {error}
        </p>
      )}
      {helperText && !error && (
        <p className="text-xs text-[var(--text-secondary)]">{helperText}</p>
      )}
    </div>
  );
}
