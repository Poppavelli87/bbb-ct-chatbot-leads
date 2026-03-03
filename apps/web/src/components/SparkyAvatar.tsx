import { useEffect, useState } from "react";
import { motion } from "framer-motion";

const minBlinkDelayMs = 6000;
const maxBlinkDelayMs = 10000;
const minBlinkDurationMs = 180;
const maxBlinkDurationMs = 250;

const randomBetween = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

export const SparkyAvatar = () => {
  const [isBlinking, setIsBlinking] = useState(false);

  useEffect(() => {
    let active = true;
    let blinkTimer: ReturnType<typeof setTimeout> | null = null;
    let reopenTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleBlink = () => {
      blinkTimer = setTimeout(() => {
        if (!active) {
          return;
        }

        setIsBlinking(true);
        const blinkDuration = randomBetween(minBlinkDurationMs, maxBlinkDurationMs);

        reopenTimer = setTimeout(() => {
          if (!active) {
            return;
          }

          setIsBlinking(false);
          scheduleBlink();
        }, blinkDuration);
      }, randomBetween(minBlinkDelayMs, maxBlinkDelayMs));
    };

    scheduleBlink();

    return () => {
      active = false;
      if (blinkTimer) {
        clearTimeout(blinkTimer);
      }
      if (reopenTimer) {
        clearTimeout(reopenTimer);
      }
    };
  }, []);

  return (
    <motion.div
      className="relative"
      animate={{ y: [0, -2, 0], rotate: [0, 1, 0, -1, 0] }}
      transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
    >
      <div className="pointer-events-none absolute inset-0 rounded-full bg-orange-400/30 blur-md opacity-60" />
      <img
        src={isBlinking ? "/sparky-blink.svg" : "/sparky.svg"}
        alt="Sparky avatar"
        className="relative z-10 h-10 w-10 rounded-full bg-white p-1"
      />
      <span className="absolute -bottom-0.5 -right-0.5 z-20 flex h-3.5 w-3.5 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
        <span className="relative inline-flex h-3 w-3 rounded-full border border-white bg-emerald-500" />
      </span>
    </motion.div>
  );
};
