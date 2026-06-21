"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Particle {
  id: number;
  emoji: string;
  x: number;
  y: number;
  rotation: number;
  delay: number;
}

const EMOJIS = ["🌟", "✨", "💫", "🎉", "🌸", "✨", "💖", "⭐"];

interface ConfettiEffectProps {
  active: boolean;
  duration?: number;
}

export const ConfettiEffect: React.FC<ConfettiEffectProps> = ({
  active,
  duration = 2000,
}) => {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (!active) {
      setParticles([]);
      return;
    }

    const newParticles: Particle[] = Array.from({ length: 24 }, (_, i) => ({
      id: i,
      emoji: EMOJIS[i % EMOJIS.length],
      x: Math.random() * 100,
      y: -10 - Math.random() * 20,
      rotation: Math.random() * 360,
      delay: Math.random() * 0.4,
    }));

    setParticles(newParticles);

    const timer = setTimeout(() => setParticles([]), duration);
    return () => clearTimeout(timer);
  }, [active, duration]);

  return (
    <AnimatePresence>
      {particles.length > 0 && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            pointerEvents: "none",
            zIndex: 999,
            overflow: "hidden",
          }}
        >
          {particles.map((p) => (
            <motion.div
              key={p.id}
              initial={{
                opacity: 1,
                x: `${p.x}vw`,
                y: `${p.y}vh`,
                rotate: 0,
                scale: 0,
              }}
              animate={{
                opacity: 0,
                y: "100vh",
                rotate: p.rotation * 4,
                scale: [0, 1.2, 1],
              }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 1.5 + Math.random(),
                delay: p.delay,
                ease: "easeOut",
              }}
              style={{
                position: "absolute",
                fontSize: 24,
                left: 0,
                top: 0,
              }}
            >
              {p.emoji}
            </motion.div>
          ))}
        </div>
      )}
    </AnimatePresence>
  );
};
