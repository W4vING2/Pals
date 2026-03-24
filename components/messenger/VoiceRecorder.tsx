"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Send, X } from "lucide-react";
import { motion } from "framer-motion";

interface VoiceRecorderProps {
  onRecorded: (blob: Blob) => void;
  onCancel: () => void;
}

export function VoiceRecorder({ onRecorded, onCancel }: VoiceRecorderProps) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  // Keep latest callback in a ref so mr.onstop always uses the current one
  const onRecordedRef = useRef(onRecorded);
  onRecordedRef.current = onRecorded;
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4"
        : "";
      const mr = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType });
        if (blob.size > 0) {
          onRecordedRef.current(blob);
        } else {
          onCancelRef.current();
        }
      };
      mr.start(250); // collect data every 250ms to avoid empty chunks
      mediaRecorderRef.current = mr;
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } catch {
      onCancelRef.current();
    }
  }, []);

  useEffect(() => {
    startRecording();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [startRecording]);

  const stop = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const cancel = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      mediaRecorderRef.current = null;
    }
    onCancel();
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center gap-3 flex-1"
    >
      <button onClick={cancel} className="p-2 text-[var(--text-secondary)] hover:text-red-400 transition-colors">
        <X className="size-5" />
      </button>
      <div className="flex items-center gap-2 flex-1">
        <div className="size-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-sm text-[var(--text-primary)] font-mono">{fmt(elapsed)}</span>
        {/* Simple waveform bars animation */}
        <div className="flex items-center gap-0.5 flex-1">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="w-1 rounded-full bg-[var(--accent-blue)]"
              style={{
                height: recording ? `${4 + Math.random() * 12}px` : "4px",
                transition: "height 0.15s",
                animationDelay: `${i * 50}ms`,
              }}
            />
          ))}
        </div>
      </div>
      <button onClick={stop} className="p-2.5 rounded-full bg-[var(--accent-blue)] text-white hover:opacity-90 transition-opacity">
        <Send className="size-4" />
      </button>
    </motion.div>
  );
}
