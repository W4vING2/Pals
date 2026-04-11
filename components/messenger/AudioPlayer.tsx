"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";

interface AudioPlayerProps {
  src: string;
  isOwn?: boolean;
}

const BARS = 40; // number of waveform bars

/** Generate pseudo-random but consistent waveform heights from a seed string */
function generateWaveform(seed: string): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const bars: number[] = [];
  for (let i = 0; i < BARS; i++) {
    // Use LCG to generate values
    hash = (Math.imul(1664525, hash) + 1013904223) | 0;
    const u = ((hash >>> 0) / 0xffffffff);
    // Shape: taller in middle, smaller at edges
    const shape = Math.sin((i / BARS) * Math.PI);
    const val = 0.15 + shape * 0.55 * (0.5 + u * 0.5);
    bars.push(val);
  }
  return bars;
}

/** Try to extract real waveform from audio using Web Audio API */
async function extractWaveform(src: string, bars: number): Promise<number[] | null> {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return null;

    const response = await fetch(src, { cache: "force-cache" });
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const ctx = new AudioContext();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    await ctx.close();

    const channelData = audioBuffer.getChannelData(0);
    const blockSize = Math.floor(channelData.length / bars);
    const waveform: number[] = [];
    for (let b = 0; b < bars; b++) {
      const start = b * blockSize;
      let sum = 0;
      for (let s = 0; s < blockSize; s++) {
        sum += Math.abs(channelData[start + s] ?? 0);
      }
      waveform.push(sum / blockSize);
    }
    // Normalize
    const maxVal = Math.max(...waveform, 0.001);
    return waveform.map((v) => 0.05 + (v / maxVal) * 0.85);
  } catch {
    return null;
  }
}

export function AudioPlayer({ src, isOwn = false }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [waveform, setWaveform] = useState<number[]>(() => generateWaveform(src));
  const [waveformReady, setWaveformReady] = useState(false);
  const extractedRef = useRef(false);

  // Try to extract real waveform once
  const tryExtractWaveform = useCallback(async () => {
    if (extractedRef.current) return;
    extractedRef.current = true;
    const real = await extractWaveform(src, BARS);
    if (real) {
      setWaveform(real);
      setWaveformReady(true);
    } else {
      setWaveformReady(true);
    }
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const setRealDuration = () => {
      const d = audio.duration;
      if (d && isFinite(d) && d > 0) setDuration(d);
    };

    const onLoaded = () => {
      if (!isFinite(audio.duration)) {
        audio.currentTime = 1e10;
      } else {
        setRealDuration();
      }
      // Extract waveform once metadata is available
      tryExtractWaveform();
    };

    const onDurationChange = () => {
      setRealDuration();
      if (audio.currentTime > 1e9) audio.currentTime = 0;
    };

    const onTime = () => {
      if (audio.currentTime < 1e9) setCurrentTime(audio.currentTime);
    };

    const onEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
    };

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
  }, [tryExtractWaveform]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play().catch(() => {});
      // Extract waveform on first play if not done yet
      tryExtractWaveform();
    }
    setPlaying(!playing);
  };

  const seekToBar = (barIndex: number) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    audio.currentTime = (barIndex / BARS) * duration;
  };

  const seekToClick = (e: React.MouseEvent<SVGSVGElement>) => {
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

  const progress = duration > 0 ? currentTime / duration : 0;
  const activeBar = Math.floor(progress * BARS);

  // Colors
  const activeColor = isOwn ? "rgba(255,255,255,0.95)" : "var(--accent-blue)";
  const inactiveColor = isOwn ? "rgba(255,255,255,0.25)" : "rgba(150,150,180,0.35)";

  return (
    <div className="flex items-center gap-2.5 min-w-[200px] max-w-[260px] select-none">
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Play/Pause button */}
      <button
        onClick={togglePlay}
        className={cn(
          "size-9 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-90",
          isOwn
            ? "bg-white/20 hover:bg-white/30 text-white"
            : "bg-[var(--accent-blue)]/15 hover:bg-[var(--accent-blue)]/25 text-[var(--accent-blue)]"
        )}
        aria-label={playing ? "Пауза" : "Воспроизвести"}
      >
        {playing
          ? <Pause className="size-4" />
          : <Play className="size-4 ml-0.5" />
        }
      </button>

      {/* Waveform + time */}
      <div className="flex-1 flex flex-col gap-1.5 min-w-0">
        {/* SVG Waveform */}
        <svg
          viewBox={`0 0 ${BARS * 4} 28`}
          className="w-full cursor-pointer"
          style={{ height: 28 }}
          onClick={seekToClick}
        >
          {waveform.map((height, i) => {
            const barH = Math.max(height * 28, 3);
            const y = (28 - barH) / 2;
            const isActive = i <= activeBar && progress > 0;
            // Playing animation: bars ahead of playhead get a subtle pulse
            const isCurrentBar = i === activeBar && playing;
            return (
              <rect
                key={i}
                x={i * 4}
                y={y}
                width={2.5}
                rx={1.25}
                height={barH}
                fill={isActive ? activeColor : inactiveColor}
                style={{
                  transition: "fill 0.1s ease",
                  transform: isCurrentBar ? "scaleY(1.15)" : "scaleY(1)",
                  transformOrigin: "center",
                  transformBox: "fill-box",
                }}
                onClick={(e) => { e.stopPropagation(); seekToBar(i); }}
              />
            );
          })}
        </svg>

        {/* Time + speed */}
        <div className="flex items-center justify-between">
          <span
            className="text-[10px] font-medium tabular-nums"
            style={{ color: isOwn ? "rgba(255,255,255,0.65)" : "var(--text-secondary)" }}
          >
            {playing || currentTime > 0 ? fmt(currentTime) : fmt(duration)}
          </span>
          <button
            onClick={cycleSpeed}
            className="text-[10px] font-semibold px-1 rounded transition-colors"
            style={{ color: isOwn ? "rgba(255,255,255,0.65)" : "var(--text-secondary)" }}
          >
            {speed}×
          </button>
        </div>
      </div>
    </div>
  );
}
