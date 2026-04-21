"use client";
import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface State { hasError: boolean; error?: Error }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode; fallback?: React.ReactNode }, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError(error: Error): State { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error("ErrorBoundary caught:", error, info); }
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex flex-col items-center justify-center min-h-[200px] gap-4 p-6 text-center">
          <AlertTriangle className="w-10 h-10 text-red-400" />
          <div>
            <p className="font-semibold text-[var(--text-primary)]">Что-то пошло не так</p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">{this.state.error?.message ?? "Неизвестная ошибка"}</p>
          </div>
          <button onClick={() => this.setState({ hasError: false })} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent-blue)] text-white text-sm font-medium">
            <RefreshCw className="w-4 h-4" /> Попробовать снова
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
