'use client';

import { useRef, useEffect } from 'react';

export default function BladeCursor() {
  const dotRef  = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dot  = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;
    let animId: number;

    const mouse = { clientX: -100, clientY: -100, isHovering: false };
    const ringPos = { x: -100, y: -100, scale: 1 };

    const onMove = (e: MouseEvent) => {
      mouse.clientX = e.clientX;
      mouse.clientY = e.clientY;
      mouse.isHovering = !!(e.target as HTMLElement).closest(
        'button, a, input, select, [role="button"]'
      );
    };
    window.addEventListener('mousemove', onMove);

    const loop = () => {
      ringPos.x     += (mouse.clientX - ringPos.x) * 0.35;
      ringPos.y     += (mouse.clientY - ringPos.y) * 0.35;
      const tgtScale = mouse.isHovering ? 0.85 : 1;
      ringPos.scale += (tgtScale - ringPos.scale) * 0.25;

      dot.style.transform  = `translate3d(${mouse.clientX}px,${mouse.clientY}px,0) scale(${mouse.isHovering ? 0.85 : 1})`;
      ring.style.transform = `translate3d(${ringPos.x}px,${ringPos.y}px,0) scale(${ringPos.scale})`;
      ring.style.opacity   = mouse.isHovering ? '0' : '0.6';

      animId = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousemove', onMove);
    };
  }, []);

  return (
    <>
      <div ref={dotRef} className="dc-cursor-blade-main">
        <svg width="28" height="28" viewBox="0 0 28 28">
          <polygon
            points="0,0 22,8 12,12 8,22"
            fill="rgba(16,185,129,0.85)"
            stroke="#06b6d4"
            strokeWidth="1"
            filter="drop-shadow(0 0 4px rgba(16,185,129,0.6))"
          />
        </svg>
      </div>

      <div ref={ringRef} className="dc-cursor-blade-ghost">
        <svg width="28" height="28" viewBox="0 0 28 28">
          <polygon
            points="0,0 22,8 12,12 8,22"
            fill="none"
            stroke="rgba(16,185,129,0.5)"
            strokeWidth="1.5"
          />
        </svg>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .dc-blade-cursor, .dc-blade-cursor * { cursor: none !important; }
        .dc-cursor-blade-main  {
          position: fixed; top: 0; left: 0;
          pointer-events: none; z-index: 99999;
          will-change: transform;
        }
        .dc-cursor-blade-ghost {
          position: fixed; top: 0; left: 0;
          pointer-events: none; z-index: 99998;
          transition: opacity 0.2s ease;
          will-change: transform;
        }
      `}} />
    </>
  );
}
