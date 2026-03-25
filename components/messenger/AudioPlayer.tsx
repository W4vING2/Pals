"use client";

import React, { useState, useRef, useEffect } from "react";
import { Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";

interface AudioPlayerProps {
  src: string;
  isOwn?: boolean;
}

export function AudioPlayer({ src, isOwn = false }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const setRealDuration = () => {
      const d = audio.duration;
      if (d && isFinite(d) && d > 0) {
        setDuration(d);
      }
    };
    const onLoaded = () => {
      // WebM files often report Infinity on loadedmetadata
      if (!isFinite(audio.duration)) {
        // Seek to a large value to force the browser to resolve the real duration
        audio.currentTime = 1e10;
      } else {
        setRealDuration();
      }
    };
    const onDurationChange = () => {
      setRealDuration();
      // Reset currentTime if we forced a seek to resolve duration
      if (audio.currentTime > 1e9) {
        audio.currentTime = 0;
      }
    };
    const onTime = () => {
      // Ignore the seek we use to resolve duration
      if (audio.currentTime < 1e9) {
        setCurrentTime(audio.currentTime);
      }
    };
    const onEnded = () => { setPlaying(false); setCurrentTime(0); };
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); } else { audio.play(); }
    setPlaying(!playing);
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pct * duration;
  };

  const cycleSpeed = () => {
    const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const fmt = (s: number) => {
    if (!s || !isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={cn("flex items-center gap-2 min-w-[180px] max-w-[240px]")}>
      <audio ref={audioRef} src={src} preload="metadata" />
      <button onClick={togglePlay} className={cn("size-8 rounded-full flex items-center justify-center shrink-0 transition-colors", isOwn ? "bg-white/20 hover:bg-white/30" : "bg-[var(--accent-blue)]/20 hover:bg-[var(--accent-blue)]/30")}>
        {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5 ml-0.5" />}
      </button>
      <div className="flex-1 flex flex-col gap-1">
        <div className="h-1 rounded-full bg-white/20 cursor-pointer relative" onClick={seek}>
          <div className="h-full rounded-full bg-current transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] opacity-70">{fmt(currentTime)}/{fmt(duration)}</span>
          <button onClick={cycleSpeed} className="text-[10px] opacity-70 hover:opacity-100 transition-opacity">
            {speed}x
          </button>
        </div>
      </div>
    </div>
  );
}
