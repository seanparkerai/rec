// toc-observer.js — shared in-page TOC scrollspy (3.9a). One mechanism for
// every editorial spine (profile's .about-toc, area-detail's .area-toc —
// components/toc.css styles both): the TOC link of the section in view
// carries aria-current, and on phones (<1024, where the spine is a
// horizontal chip row) the active pill auto-scrolls into view. Replaces the
// two near-identical page inline scripts; profile gains the pill-scroll it
// lacked (behaviour-improving unification, recorded at 3.9a).
const SPINES = ['.area-toc', '.about-toc'];

export function initTocObserver(tocSelector, doc = document) {
  const win = doc.defaultView || globalThis;
  const links = [...doc.querySelectorAll(`${tocSelector} a`)];
  const bySection = new Map();
  links.forEach((a) => {
    const id = (a.getAttribute('href') || '').slice(1);
    const sec = id ? doc.getElementById(id) : null;
    if (sec) bySection.set(sec, a);
  });
  const IO = win.IntersectionObserver || globalThis.IntersectionObserver;
  if (!bySection.size || typeof IO !== 'function') return null;
  const io = new IO((entries) => {
    entries.forEach((e) => {
      const a = bySection.get(e.target);
      if (!a || !e.isIntersecting) return;
      links.forEach((x) => x.removeAttribute('aria-current'));
      a.setAttribute('aria-current', 'true');
      if (win.matchMedia?.('(max-width: 1023.98px)').matches) {
        a.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      }
    });
  }, { rootMargin: '-30% 0px -60% 0px', threshold: 0 });
  bySection.forEach((_a, sec) => io.observe(sec));
  return io;
}

// Self-run on import (module scripts are deferred, so the DOM is parsed).
for (const sel of SPINES) {
  if (typeof document !== 'undefined' && document.querySelector(sel)) initTocObserver(sel);
}
