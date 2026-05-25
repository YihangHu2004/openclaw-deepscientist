'use client';

import React, { useId } from 'react';

export default function LobsterLogo({ size = 36, isHovered = false, isGlitching = false }: { size?: number; isHovered?: boolean; isGlitching?: boolean }) {
  const uid      = useId().replace(/:/g, '');
  const gradId   = `quantum-grad-${uid}`;
  const filterId = `quantum-glow-${uid}`;

  return (
    <div
      className={`relative flex items-center justify-center select-none${isHovered ? ' is-hovered' : ''}`}
      style={{ width: size, height: size, transformStyle: 'preserve-3d' }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        className={isGlitching ? 'dc-glare-glitch' : ''}
        style={{
          animation: isHovered
            ? 'dc-quantum-pulse-fast 1.2s infinite ease-in-out'
            : 'dc-quantum-pulse 4s infinite ease-in-out',
          transformOrigin: 'center',
          transform: isHovered ? 'translateZ(60px) scale(1.15)' : 'translateZ(30px)',
          transition: 'transform 0.8s cubic-bezier(0.16,1,0.3,1)',
          filter: isHovered ? 'drop-shadow(0 0 25px rgba(217,70,239,0.5))' : 'none',
        }}
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   className="dc-stop1" />
            <stop offset="100%" className="dc-stop2" />
          </linearGradient>
          <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        <path d="M6 22 L6 10 L16 4 L19 6.5 L9 12.5 L9 20.5 Z"
          fill={`url(#${gradId})`} filter={`url(#${filterId})`} />
        <path d="M13 28 L23 22 L23 13 L20 11.5 L20 18.5 L12 23.5 Z"
          fill={`url(#${gradId})`} opacity="0.85" />
        <path d="M14 8 L26 15 L23 18 L14 12.5 Z"
          fill={`url(#${gradId})`} opacity="0.4" />
        <circle cx="16" cy="15" r="1.8" fill="#ffffff" filter={`url(#${filterId})`} />
      </svg>

      {/* Ring 1 — clockwise */}
      <div style={{
        position: 'absolute', inset: '-15%', borderRadius: '50%',
        border: isHovered ? '1.5px solid rgba(217,70,239,0.5)' : '1px solid rgba(16,185,129,0.2)',
        transform: isHovered ? 'translateZ(-25px) rotateX(65deg) rotateY(10deg)' : 'translateZ(-15px) rotateX(60deg)',
        animation: isHovered ? 'dc-spin 4s linear infinite' : 'dc-spin 8s linear infinite',
        pointerEvents: 'none',
        boxShadow: isHovered ? '0 0 15px rgba(217,70,239,0.2)' : 'none',
        transition: 'border 0.8s cubic-bezier(0.16,1,0.3,1), box-shadow 0.8s cubic-bezier(0.16,1,0.3,1)',
      }} />

      {/* Ring 2 — counter-clockwise dashed */}
      <div style={{
        position: 'absolute', inset: '-30%', borderRadius: '50%',
        border: isHovered ? '1.2px dashed rgba(6,182,212,0.6)' : '1px dashed rgba(6,182,212,0.1)',
        transform: isHovered ? 'translateZ(-45px) rotateX(55deg) rotateY(-15deg)' : 'translateZ(-25px) rotateX(60deg)',
        animation: isHovered ? 'dc-spin-reverse 2.5s linear infinite' : 'dc-spin-reverse 12s linear infinite',
        pointerEvents: 'none',
        boxShadow: isHovered ? '0 0 20px rgba(6,182,212,0.15)' : 'none',
        transition: 'border 0.8s cubic-bezier(0.16,1,0.3,1), box-shadow 0.8s cubic-bezier(0.16,1,0.3,1)',
      }} />

      {/* Ring 3 — hover only */}
      {isHovered && (
        <div style={{
          position: 'absolute', inset: '-5%', borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.2)',
          transform: 'translateZ(10px) rotateX(70deg)',
          animation: 'dc-spin 6s linear infinite',
          pointerEvents: 'none',
          boxShadow: '0 0 10px rgba(255,255,255,0.1)',
        }} />
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .dc-stop1 { stop-color: #10b981; transition: stop-color 0.8s cubic-bezier(0.16,1,0.3,1); }
        .dc-stop2 { stop-color: #06b6d4; transition: stop-color 0.8s cubic-bezier(0.16,1,0.3,1); }
        .is-hovered .dc-stop1 { stop-color: #d946ef; }
        .is-hovered .dc-stop2 { stop-color: #3b82f6; }

        @keyframes dc-quantum-pulse {
          0%,100% { transform: scale(0.95) translateZ(30px); filter: drop-shadow(0 0 5px rgba(16,185,129,0.25)); opacity: 0.85; }
          50%      { transform: scale(1.05) translateZ(30px); filter: drop-shadow(0 0 15px #10b981); opacity: 1; }
        }
        @keyframes dc-quantum-pulse-fast {
          0%,100% { transform: scale(0.92) translateZ(50px); filter: drop-shadow(0 0 12px rgba(217,70,239,0.4)); opacity: 0.9; }
          50%      { transform: scale(1.12) translateZ(50px); filter: drop-shadow(0 0 25px rgba(217,70,239,0.6)); opacity: 1; }
        }
        @keyframes dc-spin         { from { transform: translateZ(-15px) rotateX(60deg) rotateZ(0deg); }   to { transform: translateZ(-15px) rotateX(60deg) rotateZ(360deg); } }
        @keyframes dc-spin-reverse { from { transform: translateZ(-35px) rotateX(55deg) rotateZ(360deg); } to { transform: translateZ(-35px) rotateX(55deg) rotateZ(0deg); } }
        .dc-glare-glitch { animation: dc-chromatic-glitch 0.25s infinite steps(2); }
        @keyframes dc-chromatic-glitch {
          0%   { transform: translate(2px,-1px) skewX(2deg);  filter: hue-rotate(90deg) contrast(1.2); }
          50%  { transform: translate(-3px,2px) skewX(-3deg); filter: invert(0.05) saturate(1.8); }
          100% { transform: translate(1px,1px); }
        }
      `}} />
    </div>
  );
}
