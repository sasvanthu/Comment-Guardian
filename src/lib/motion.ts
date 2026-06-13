import type { Transition, Variants } from "framer-motion";

// Ultra-premium ease-out expo — crisp, mechanical, non-springy.
export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

export const tween: Transition = {
  type: "tween",
  ease: EASE_OUT_EXPO,
  duration: 0.4,
};

export const tweenFast: Transition = {
  type: "tween",
  ease: EASE_OUT_EXPO,
  duration: 0.18,
};

// Rail morph (active-indicator glide).
export const railTransition: Transition = {
  type: "tween",
  ease: EASE_OUT_EXPO,
  duration: 0.32,
};

// Enterprise data mount — micro-stagger, 4px lift, alpha fade.
export const dataStagger: Variants = {
  hidden: { opacity: 1 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.03, delayChildren: 0.02 },
  },
};

export const dataItem: Variants = {
  hidden: { opacity: 0, y: 4 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "tween", ease: EASE_OUT_EXPO, duration: 0.28 },
  },
};
