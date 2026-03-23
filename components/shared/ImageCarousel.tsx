"use client";

import React, { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ImageLightbox } from "./ImageLightbox";
import { cn } from "@/lib/utils";

interface ImageCarouselProps {
  images: string[];
  priority?: boolean;
}

export function ImageCarousel({ images, priority = false }: ImageCarouselProps) {
  const [index, setIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (images.length === 0) return null;

  if (images.length === 1) {
    return (
      <>
        <div className="relative w-full overflow-hidden rounded-xl cursor-zoom-in" onClick={() => setLightboxOpen(true)}>
          <Image
            src={images[0]}
            alt="Фото"
            width={600}
            height={400}
            className="w-full h-auto object-cover rounded-xl"
            style={{ width: "auto", height: "auto", maxHeight: 400 }}
            sizes="(max-width: 640px) 100vw, 600px"
            priority={priority}
          />
        </div>
        <ImageLightbox src={lightboxOpen ? images[0] : null} alt="Фото" onClose={() => setLightboxOpen(false)} />
      </>
    );
  }

  const prev = () => setIndex((i) => (i === 0 ? images.length - 1 : i - 1));
  const next = () => setIndex((i) => (i === images.length - 1 ? 0 : i + 1));

  return (
    <>
      <div className="relative w-full overflow-hidden rounded-xl group">
        <div className="relative aspect-square cursor-zoom-in" onClick={() => setLightboxOpen(true)}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={index}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0"
            >
              <Image
                src={images[index]}
                alt={`Фото ${index + 1}`}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 100vw, 600px"
                priority={priority && index === 0}
              />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Arrows - desktop only */}
        <button
          onClick={(e) => { e.stopPropagation(); prev(); }}
          className="absolute left-2 top-1/2 -translate-y-1/2 size-8 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <ChevronLeft className="size-5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); next(); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 size-8 rounded-full bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <ChevronRight className="size-5" />
        </button>

        {/* Dots */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
          {images.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); setIndex(i); }}
              className={cn(
                "size-1.5 rounded-full transition-all",
                i === index ? "bg-white w-3" : "bg-white/50"
              )}
            />
          ))}
        </div>

        {/* Counter */}
        <div className="absolute top-3 right-3 bg-black/50 text-white text-xs px-2 py-0.5 rounded-full">
          {index + 1}/{images.length}
        </div>
      </div>
      <ImageLightbox src={lightboxOpen ? images[index] : null} alt={`Фото ${index + 1}`} onClose={() => setLightboxOpen(false)} />
    </>
  );
}
