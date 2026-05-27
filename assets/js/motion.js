// motion.js — motion preference helpers. Browser-only.

const _mq = typeof matchMedia === 'function'
  ? matchMedia('(prefers-reduced-motion: reduce)')
  : null;

/** @returns {boolean} true if the user has requested reduced motion. */
export const prefersReducedMotion = () => !!_mq?.matches;
