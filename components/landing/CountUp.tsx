"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

// Renders the real value on the server; on the client, drops to 0 before first paint
// and counts up when scrolled into view. Reduced motion skips the animation.
export function CountUp({ value, duration = 1400 }: { value: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  const animate = useRef(false);

  useLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    animate.current = true;
    setShown(0);
  }, [value]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !animate.current) return;
    let frame = 0;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min((now - start) / duration, 1);
        setShown(Math.round(value * (1 - Math.pow(1 - t, 3)))); // ease-out cubic
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, duration]);

  return (
    <span ref={ref} className="tabular">
      {shown.toLocaleString()}
    </span>
  );
}
