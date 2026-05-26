'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import LobsterLogo from '@/components/LobsterLogo';
import LaunchDialog from '@/components/LaunchDialog';

// DeepClaw identity — workflow (even idx) / architecture (odd idx)
const ACADEMIC_KEYWORDS = [
  'Literature Scout',          'Quest-driven Workflow',
  'Hypothesis Formation',      'Long-horizon Planning',
  'Baseline Reproduction',     'Multi-agent Orchestration',
  'Experiment Design',         'Git-backed State',
  'Result Analysis',           'Local-first AI',
  'Paper Writing',             'Research Memory',
  'Skill Chaining',            'Autonomous Research',
];

const PAPER_IDS = ['[arXiv:2512]','[arXiv:2601]','[Doc:241]','[Nature:901]','[IEEE:142]','[ACM:302]','[Science:88]'];

export default function LandingPage() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [logoHovered, setLogoHovered] = useState(false);
  const [logoGlitching, setLogoGlitching] = useState(false);

  const canvasRef          = useRef<HTMLCanvasElement>(null);
  const logoWrapperRef     = useRef<HTMLDivElement>(null);
  const dotRef             = useRef<HTMLDivElement>(null);
  const ringRef            = useRef<HTMLDivElement>(null);
  const logoHoveredRef     = useRef(false);
  const triggerClickRef    = useRef<((mode: number) => void) | null>(null);

  const handleLogoEnter = () => { setLogoHovered(true);  logoHoveredRef.current = true;  };
  const handleLogoLeave = () => { setLogoHovered(false); logoHoveredRef.current = false; };
  const handleLogoClick = () => {
    const mode = Math.ceil(Math.random() * 3);   // random 1 / 2 / 3
    triggerClickRef.current?.(mode);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let W = (canvas.width  = window.innerWidth);
    let H = (canvas.height = window.innerHeight);

    const mouse = { clientX: W/2, clientY: H/2, canvasX: W/2, canvasY: H/2, dampedX: W/2, dampedY: H/2, isHovering: false };
    const ringPos = { x: W/2, y: H/2, scale: 1, rotate: 0 };

    // ── constellation nodes (with push fields for spectral wave) ──────────
    const nodes = Array.from({ length: 200 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.8, vy: (Math.random() - 0.5) * 0.8,
      r: Math.random() * 1.5 + 0.5,
      pushX: 0, pushY: 0,
    }));

    type Spark = { x:number; y:number; vx:number; vy:number; alpha:number; size:number; color:string };
    let sparks: Spark[] = [];

    // ── click effect data pools ───────────────────────────────────────────
    type CitNode = { startX:number; startY:number; targetX:number; targetY:number; currX:number; currY:number; alpha:number; label:string; progress:number; color:string };
    type ConvP   = { x:number; y:number; targetX:number; targetY:number; progress:number; speed:number; color:string; size:number };
    type SpecBand= { x:number; y:number; radius:number; maxRadius:number; opacity:number; color:string; label:string; speed:number };
    // fly → hold (4 s) → fade (1.5 s)
    type FloatWord={ x:number; y:number; tx:number; ty:number; text:string; size:number; rotate:number; color:string; phase:'fly'|'hold'|'fade'; holdTimer:number; fadeAlpha:number; trail:{x:number;y:number}[] };
    type Optimum = { x:number; y:number; radius:number; maxRadius:number; opacity:number; color:string } | null;

    let citNodes:  CitNode[]   = [];
    let convPs:    ConvP[]     = [];
    let specBands: SpecBand[]  = [];
    let floatWords:FloatWord[] = [];
    let optimum:   Optimum     = null;

    // ── click blast trigger (called from React, executed in canvas) ───────
    triggerClickRef.current = (mode: number) => {
      const cx = W / 2, cy = H * 0.42 - 12;

      // always: burst academic keywords toward left/right margins
      const picked = [...ACADEMIC_KEYWORDS].sort(() => 0.5 - Math.random()).slice(0, Math.floor(Math.random() * 3) + 5);
      picked.forEach((word, i) => {
        const side = i % 2 === 0 ? 'right' : 'left';
        const tx = side === 'right'
          ? W * 0.70 + Math.random() * W * 0.24
          : W * 0.06 + Math.random() * W * 0.22;
        const ty = H * 0.10 + Math.random() * H * 0.78;
        floatWords.push({
          x: cx, y: cy, tx, ty,
          text: word,
          size: Math.floor(Math.random() * 6) + 20,
          rotate: (Math.random() - 0.5) * 14,
          color: i % 2 === 0 ? '#10b981' : '#06b6d4',  // green=workflow, cyan=architecture
          phase: 'fly',
          holdTimer: 240,   // 4 s × 60 fps
          fadeAlpha: 1,
          trail: [],
        });
      });

      if (mode === 1) {
        // citation topology
        setLogoGlitching(true); setTimeout(() => setLogoGlitching(false), 200);
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
          const dist  = Math.random() * 60 + 80;
          citNodes.push({ startX: cx, startY: cy, targetX: cx + Math.cos(angle) * dist, targetY: cy + Math.sin(angle) * dist, currX: cx, currY: cy, alpha: 1, label: PAPER_IDS[Math.floor(Math.random() * PAPER_IDS.length)], progress: 0, color: i % 2 === 0 ? '#10b981' : '#00f0ff' });
        }
      }

      if (mode === 2) {
        // convergence
        optimum = null;
        for (let i = 0; i < 55; i++) {
          const a = (i / 55) * Math.PI * 2;
          convPs.push({ x: cx + Math.cos(a) * 240, y: cy + Math.sin(a) * 240, targetX: cx, targetY: cy, progress: 0, speed: Math.random() * 0.03 + 0.04, color: Math.random() > 0.4 ? '#8b5cf6' : '#d946ef', size: Math.random() * 2 + 1.5 });
        }
      }

      if (mode === 3) {
        // spectral scan
        setLogoGlitching(true); setTimeout(() => setLogoGlitching(false), 150);
        [
          { color: '#8b5cf6', label: 'λ:420nm VIOLET', speed: 3.5 },
          { color: '#06b6d4', label: 'λ:480nm CYAN',   speed: 4.8 },
          { color: '#10b981', label: 'λ:520nm EMERALD', speed: 5.8 },
          { color: '#ef4444', label: 'λ:680nm INFRARED',speed: 7.2 },
        ].forEach(s => specBands.push({ x: cx, y: cy, radius: 10, maxRadius: 280, opacity: 1, ...s }));
      }
    };

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.clientX = e.clientX; mouse.clientY = e.clientY;
      mouse.canvasX = e.clientX - rect.left; mouse.canvasY = e.clientY - rect.top;
      mouse.isHovering = !!(e.target as HTMLElement).closest('button, a, input, select, .dc-logo-container-outer, .dc-text-shimmer');

      if (logoWrapperRef.current) {
        const lh = logoHoveredRef.current;
        const tf = lh ? 25 : 20, sv = lh ? 1.12 : 1.05;
        const rx = (mouse.canvasY - H/2) / tf, ry = -(mouse.canvasX - W/2) / tf;
        logoWrapperRef.current.style.transform = `perspective(800px) rotateX(${rx}deg) rotateY(${ry}deg) scale3d(${sv},${sv},${sv})`;
        logoWrapperRef.current.style.setProperty('--glare-x', `${(mouse.canvasX / W) * 100}%`);
        logoWrapperRef.current.style.setProperty('--glare-y', `${(mouse.canvasY / H) * 100}%`);
      }
      document.querySelectorAll<HTMLButtonElement>('.dc-glare-btn').forEach(btn => {
        const r = btn.getBoundingClientRect();
        btn.style.setProperty('--x', `${e.clientX - r.left}px`);
        btn.style.setProperty('--y', `${e.clientY - r.top}px`);
      });
    };
    const onLeave  = () => { if (logoWrapperRef.current) logoWrapperRef.current.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)'; };
    const onResize = () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseleave', onLeave);
    window.addEventListener('resize', onResize);

    const tick = () => {
      const lh = logoHoveredRef.current;
      ctx.fillStyle = 'rgba(3,7,18,0.20)';
      ctx.fillRect(0, 0, W, H);

      mouse.dampedX += (mouse.canvasX - mouse.dampedX) * 0.15;
      mouse.dampedY += (mouse.canvasY - mouse.dampedY) * 0.15;

      // radar scan
      const scanY = (Date.now() / 25) % (H * 1.5);
      ctx.fillStyle = lh ? 'rgba(217,70,239,0.004)' : 'rgba(16,185,129,0.005)';
      ctx.fillRect(0, scanY - 60, W, 120);

      // ── effect 1: citation topology ──────────────────────────────────────
      for (let i = citNodes.length - 1; i >= 0; i--) {
        const n = citNodes[i];
        n.progress += (1 - n.progress) * 0.08;
        n.currX = n.startX + (n.targetX - n.startX) * n.progress;
        n.currY = n.startY + (n.targetY - n.startY) * n.progress;
        if (n.progress > 0.6) n.alpha -= 0.015;
        if (n.alpha <= 0) { citNodes.splice(i, 1); continue; }
        ctx.save(); ctx.globalAlpha = n.alpha;
        ctx.beginPath(); ctx.moveTo(n.startX, n.startY); ctx.lineTo(n.currX, n.currY);
        ctx.strokeStyle = `rgba(16,185,129,${0.35 * n.alpha})`; ctx.lineWidth = 0.8; ctx.setLineDash([2,5]); ctx.stroke();
        citNodes.forEach(o => { if (o === n) return; ctx.beginPath(); ctx.moveTo(n.currX, n.currY); ctx.lineTo(o.currX, o.currY); ctx.strokeStyle = `rgba(6,182,212,${0.12 * n.alpha})`; ctx.lineWidth = 0.6; ctx.setLineDash([]); ctx.stroke(); });
        ctx.beginPath(); ctx.arc(n.currX, n.currY, 3, 0, Math.PI * 2); ctx.fillStyle = n.color; ctx.shadowBlur = 6; ctx.shadowColor = n.color; ctx.fill();
        ctx.font = 'bold 9px monospace'; ctx.fillStyle = '#f1f5f9'; ctx.fillText(n.label, n.currX + 8, n.currY + 3);
        ctx.restore();
      }

      // ── effect 2: convergence ────────────────────────────────────────────
      const prevLen = convPs.length;
      for (let i = convPs.length - 1; i >= 0; i--) {
        const p = convPs[i];
        p.progress += (1 - p.progress) * p.speed;
        const cx = p.x + (p.targetX - p.x) * p.progress, cy = p.y + (p.targetY - p.y) * p.progress;
        if (p.progress >= 0.98) { convPs.splice(i, 1); continue; }
        ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color; ctx.globalAlpha = 1 - p.progress; ctx.fill(); ctx.restore();
      }
      if (prevLen > 0 && convPs.length === 0) {
        setLogoGlitching(true); setTimeout(() => setLogoGlitching(false), 200);
        optimum = { x: W/2, y: H * 0.42 - 12, radius: 1, maxRadius: 180, opacity: 1, color: '#06b6d4' };
      }
      if (optimum) {
        optimum.radius += (optimum.maxRadius - optimum.radius) * 0.08;
        optimum.opacity -= 0.025;
        if (optimum.opacity <= 0) { optimum = null; }
        else {
          ctx.save(); ctx.globalAlpha = optimum.opacity;
          ctx.beginPath(); ctx.arc(optimum.x, optimum.y, optimum.radius, 0, Math.PI * 2);
          ctx.strokeStyle = optimum.color; ctx.lineWidth = 1.5; ctx.shadowBlur = 12; ctx.shadowColor = optimum.color; ctx.stroke();
          ctx.strokeStyle = '#10b981'; ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(optimum.x - optimum.radius - 15, optimum.y); ctx.lineTo(optimum.x - optimum.radius + 5, optimum.y);
          ctx.moveTo(optimum.x + optimum.radius - 5, optimum.y); ctx.lineTo(optimum.x + optimum.radius + 15, optimum.y);
          ctx.moveTo(optimum.x, optimum.y - optimum.radius - 15); ctx.lineTo(optimum.x, optimum.y - optimum.radius + 5);
          ctx.moveTo(optimum.x, optimum.y + optimum.radius - 5); ctx.lineTo(optimum.x, optimum.y + optimum.radius + 15);
          ctx.stroke();
          ctx.font = 'bold 9px monospace'; ctx.fillStyle = '#22d3ee';
          ctx.fillText('GLOBAL_OPTIMUM_FOUND //', optimum.x + 12, optimum.y - optimum.radius - 8);
          ctx.restore();
        }
      }

      // ── effect 3: spectral bands ─────────────────────────────────────────
      for (let i = specBands.length - 1; i >= 0; i--) {
        const b = specBands[i];
        b.radius += b.speed; b.opacity -= 0.02;
        if (b.opacity <= 0 || b.radius >= b.maxRadius) { specBands.splice(i, 1); continue; }
        ctx.save(); ctx.globalAlpha = b.opacity;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.strokeStyle = b.color; ctx.lineWidth = 1.2; ctx.shadowBlur = 8; ctx.shadowColor = b.color; ctx.stroke();
        ctx.font = 'bold 8px monospace'; ctx.fillStyle = b.color;
        ctx.fillText(b.label, b.x + Math.cos(Math.PI/4)*b.radius + 4, b.y + Math.sin(Math.PI/4)*b.radius + 4);
        ctx.restore();
      }

      // ── floating academic words  (fly → hold 4s → fade 1.5s) ─────────────
      for (let i = floatWords.length - 1; i >= 0; i--) {
        const w = floatWords[i];
        ctx.save();

        if (w.phase === 'fly') {
          w.trail.push({ x: w.x, y: w.y });
          if (w.trail.length > 10) w.trail.shift();
          w.x += (w.tx - w.x) * 0.06;
          w.y += (w.ty - w.y) * 0.06;
          if (Math.hypot(w.tx - w.x, w.ty - w.y) < 2) {
            w.x = w.tx; w.y = w.ty; w.phase = 'hold'; w.trail = [];
          }
          // motion trail
          w.trail.forEach((h, hi) => {
            ctx.save();
            ctx.globalAlpha = (hi / w.trail.length) * 0.15;
            ctx.font = `bold ${w.size}px monospace`; ctx.fillStyle = w.color;
            ctx.translate(h.x, h.y); ctx.rotate(w.rotate * Math.PI / 180);
            ctx.fillText(w.text, 0, 0);
            ctx.restore();
          });
          // word in-flight (semi-transparent)
          ctx.globalAlpha = 0.6;
          ctx.shadowBlur = 6; ctx.shadowColor = w.color;
          ctx.font = `bold ${w.size}px monospace`; ctx.fillStyle = '#f8fafc';
          ctx.translate(w.x, w.y); ctx.rotate(w.rotate * Math.PI / 180);
          ctx.fillText(w.text, 0, 0);

        } else if (w.phase === 'hold') {
          if (--w.holdTimer <= 0) w.phase = 'fade';
          ctx.globalAlpha = 1;
          ctx.shadowBlur = 14; ctx.shadowColor = w.color;
          ctx.font = `bold ${w.size}px monospace`; ctx.fillStyle = '#f8fafc';
          ctx.translate(w.x, w.y); ctx.rotate(w.rotate * Math.PI / 180);
          ctx.fillText(w.text, 0, 0);
          // underline accent
          ctx.strokeStyle = w.color; ctx.lineWidth = 1; ctx.globalAlpha = 0.7;
          ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(ctx.measureText(w.text).width, 4); ctx.stroke();

        } else {
          // fade over 1.5 s (90 frames)
          w.fadeAlpha -= 1 / 90;
          if (w.fadeAlpha <= 0) { ctx.restore(); floatWords.splice(i, 1); continue; }
          ctx.globalAlpha = w.fadeAlpha;
          ctx.shadowBlur = 8; ctx.shadowColor = w.color;
          ctx.font = `bold ${w.size}px monospace`; ctx.fillStyle = '#f8fafc';
          ctx.translate(w.x, w.y); ctx.rotate(w.rotate * Math.PI / 180);
          ctx.fillText(w.text, 0, 0);
        }

        ctx.restore();
      }

      // ── constellation (spectral wave push) ───────────────────────────────
      nodes.forEach((node, i) => {
        // spectral wave displacement
        [...specBands, ...(optimum ? [optimum] : [])].forEach(sw => {
          const dx = node.x - sw.x, dy = node.y - sw.y;
          const dist = Math.hypot(dx, dy);
          if (Math.abs(dist - sw.radius) < 30) {
            const f = (1 - Math.abs(dist - sw.radius) / 30) * 14 * ((sw as SpecBand).opacity ?? 1);
            node.pushX = (dx / dist) * f; node.pushY = (dy / dist) * f;
          }
        });
        node.pushX *= 0.92; node.pushY *= 0.92;
        node.x += node.vx + node.pushX; node.y += node.vy + node.pushY;
        if (node.x < 0 || node.x > W) node.vx *= -1;
        if (node.y < 0 || node.y > H) node.vy *= -1;

        ctx.beginPath(); ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
        ctx.fillStyle = lh ? 'rgba(139,92,246,0.2)' : 'rgba(16,185,129,0.28)'; ctx.fill();

        const dm = Math.hypot(mouse.dampedX - node.x, mouse.dampedY - node.y);
        if (dm < 160) {
          ctx.beginPath(); ctx.moveTo(node.x, node.y); ctx.lineTo(mouse.dampedX, mouse.dampedY);
          ctx.strokeStyle = lh ? `rgba(139,92,246,${0.35*(1-dm/160)})` : `rgba(6,182,212,${0.18*(1-dm/160)})`; ctx.lineWidth = 0.8; ctx.stroke();
        }
        for (let j = i + 1; j < nodes.length; j++) {
          const n2 = nodes[j], d = Math.hypot(node.x - n2.x, node.y - n2.y);
          if (d < 120) {
            ctx.beginPath(); ctx.moveTo(node.x, node.y); ctx.lineTo(n2.x, n2.y);
            ctx.strokeStyle = lh ? `rgba(139,92,246,${0.06*(1-d/120)})` : `rgba(16,185,129,${0.08*(1-d/120)})`; ctx.lineWidth = 0.5; ctx.stroke();
          }
        }
      });

      // ── sparkle trail ─────────────────────────────────────────────────────
      const spawnChance = lh ? 0.95 : 0.55;
      if (Math.random() < spawnChance) {
        const speed = lh ? 6.5 : 3, angle = Math.random() * Math.PI * 2;
        sparks.push({
          x: mouse.dampedX, y: mouse.dampedY,
          vx: lh ? Math.cos(angle)*speed + (Math.random()-0.5)*2 : (Math.random()-0.5)*speed,
          vy: lh ? Math.sin(angle)*speed + (Math.random()-0.5)*2 : (Math.random()-0.5)*speed,
          alpha: 1, size: Math.random()*(lh?3.5:2.2)+0.5,
          color: lh ? (Math.random()>0.6?'#d946ef':Math.random()>0.3?'#8b5cf6':'#06b6d4') : (Math.random()>0.3?'#10b981':'#06b6d4'),
        });
      }
      sparks = sparks.filter(p => {
        p.x += p.vx; p.y += p.vy; p.alpha -= 0.02;
        if (p.alpha <= 0) return false;
        ctx.save(); ctx.globalAlpha = p.alpha; ctx.shadowBlur = 8; ctx.shadowColor = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fillStyle = p.color; ctx.fill(); ctx.restore();
        return true;
      });

      // ── matrix crosshair cursor ───────────────────────────────────────────
      ringPos.x      += (mouse.clientX - ringPos.x) * 0.35;
      ringPos.y      += (mouse.clientY - ringPos.y) * 0.35;
      const tgtScale  = mouse.isHovering ? 1.5 : 1;
      ringPos.scale  += (tgtScale - ringPos.scale) * 0.25;
      const tgtRot    = mouse.isHovering ? 45 : 0;
      ringPos.rotate += (tgtRot - ringPos.rotate) * 0.2;

      if (dotRef.current)
        dotRef.current.style.transform = `translate3d(${mouse.clientX}px,${mouse.clientY}px,0) scale(${mouse.isHovering?1.5:1})`;
      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${ringPos.x}px,${ringPos.y}px,0) scale(${ringPos.scale}) rotate(${ringPos.rotate}deg)`;
        ringRef.current.style.opacity = mouse.isHovering ? '0.95' : '0.65';
      }

      animId = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const showToast = (msg: string) => {
    const el = document.getElementById('dc-hud-toast');
    if (!el) return;
    el.innerText = msg; el.style.opacity = '1'; el.style.transform = 'translateY(0)';
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(10px)'; }, 3000);
  };

  return (
    <div className="cursor-custom-active" style={{ height: '100%', background: '#030712', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1, pointerEvents: 'auto' }} />

      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, background: `
        radial-gradient(ellipse 70% 60% at 50% 42%, rgba(16,185,129,0.06) 0%, transparent 60%),
        radial-gradient(ellipse 40% 40% at 85% 75%, rgba(6,182,212,0.03) 0%, transparent 55%),
        radial-gradient(ellipse 30% 30% at 15% 25%, rgba(99,102,241,0.02) 0%, transparent 50%)` }} />

      {/* Header */}
      <header style={{ position: 'relative', zIndex: 10, padding: '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(3,7,18,0.78)', backdropFilter: 'blur(20px)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LobsterLogo size={24} />
          <span className="dc-text-shimmer" style={{ fontFamily: 'var(--font-brand)', fontSize: 14, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase' }}>DeepClaw</span>
        </div>
        <button className="dc-glare-btn is-secondary" onClick={() => { showToast('TRANSMITTING // NAVIGATING TO: /PROJECTS'); router.push('/projects'); }} style={{ padding: '8px 16px', fontSize: 12, borderRadius: 8 }}>PROJECTS //</button>
      </header>

      {/* Hero */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px 48px', position: 'relative', zIndex: 5, textAlign: 'center' }}>

        <div
          className="dc-logo-container-outer"
          onMouseEnter={handleLogoEnter}
          onMouseLeave={handleLogoLeave}
          onClick={handleLogoClick}
          style={{ position: 'relative', marginBottom: 48, transformStyle: 'preserve-3d', perspective: '800px', cursor: 'pointer' }}
        >
          <div style={{ position: 'absolute', inset: -60, borderRadius: '50%', pointerEvents: 'none',
            background: logoHovered ? 'radial-gradient(circle, rgba(217,70,239,0.18) 0%, rgba(6,182,212,0.04) 50%, transparent 80%)' : 'radial-gradient(circle, rgba(16,185,129,0.12) 0%, rgba(6,182,212,0.05) 50%, transparent 80%)',
            animation: 'heroGlowPulse 4s ease-in-out infinite', transition: 'all 0.8s cubic-bezier(0.16,1,0.3,1)' }} />

          <div style={{ position: 'absolute', inset: -18, borderRadius: '50%', pointerEvents: 'none',
            borderColor: logoHovered ? 'rgba(217,70,239,0.45)' : 'rgba(16,185,129,0.2)', borderWidth: '1px', borderStyle: 'solid',
            animation: logoHovered ? 'heroRingExpandFast 4s ease-in-out infinite' : 'heroRingExpand 6s ease-in-out infinite',
            transition: 'border-color 0.8s cubic-bezier(0.16,1,0.3,1)' }} />

          <div style={{ position: 'absolute', inset: -34, borderRadius: '50%', pointerEvents: 'none',
            borderColor: logoHovered ? 'rgba(6,182,212,0.4)' : 'rgba(6,182,212,0.1)', borderWidth: '1px', borderStyle: 'dashed',
            animation: logoHovered ? 'heroRingExpandFast 5s ease-in-out infinite 0.3s' : 'heroRingExpand 8s ease-in-out infinite 0.6s',
            transition: 'border-color 0.8s cubic-bezier(0.16,1,0.3,1)' }} />

          <div ref={logoWrapperRef} style={{ transition: 'transform 100ms cubic-bezier(0.25,0.8,0.25,1)', transformOrigin: 'center', position: 'relative', zIndex: 1, animation: 'heroFloat 6s ease-in-out infinite', transformStyle: 'preserve-3d' }}>
            <div className="dc-logo-glare" />
            <LobsterLogo size={140} isHovered={logoHovered} isGlitching={logoGlitching} />
          </div>
        </div>

        <h1 className="dc-text-shimmer" style={{ fontFamily: 'var(--font-brand)', fontSize: 'clamp(44px,7.5vw,88px)', fontWeight: 800, letterSpacing: '0.24em', textTransform: 'uppercase', lineHeight: 0.95, margin: '0 0 16px', paddingLeft: '0.24em', cursor: 'pointer' }}>DeepClaw</h1>

        <div style={{ fontFamily: 'monospace', fontSize: 'clamp(10px,1.3vw,12px)', letterSpacing: '0.42em', color: '#10b981', textTransform: 'uppercase', marginBottom: 24, opacity: 0.9, fontWeight: 600, paddingLeft: '0.42em', textShadow: '0 0 15px rgba(16,185,129,0.4)' }}>Autonomous Research Studio</div>

        <div style={{ width: 120, height: 1, marginBottom: 28, background: 'linear-gradient(90deg, transparent, rgba(16,185,129,0.6), transparent)' }} />

        <p style={{ maxWidth: 540, fontSize: 'clamp(12px,1.4vw,14px)', lineHeight: 1.8, color: '#94a3b8', fontFamily: 'var(--font-ui)', margin: '0 0 44px', letterSpacing: '0.015em' }}>
          AI-driven research workflows — literature review, experiment execution and paper writing, all in one place. Start a project and let the agent handle the rest.
        </p>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', zIndex: 10 }}>
          <button className="dc-glare-btn is-primary" onClick={() => setOpen(true)}>
            <span style={{ position: 'relative', zIndex: 1 }}>Launch New Project</span>
          </button>
          <button className="dc-glare-btn is-secondary" onClick={() => { showToast('TRANSMITTING // NAVIGATING TO: /PROJECTS'); router.push('/projects'); }}>
            <span style={{ position: 'relative', zIndex: 1 }}>View Projects →</span>
          </button>
        </div>
      </main>

      <footer style={{ padding: '14px 32px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: '1px solid rgba(255,255,255,0.03)', background: 'rgba(3,7,18,0.4)', position: 'relative', zIndex: 5 }}>
        <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#475569', letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.8 }}>Powered by OpenClaw · Local Autonomous Core</span>
      </footer>

      {/* matrix crosshair cursor */}
      <div ref={dotRef} style={{ position: 'fixed', top: -2, left: -2, width: 4, height: 4, background: '#10b981', boxShadow: '0 0 8px #10b981', pointerEvents: 'none', zIndex: 99999, willChange: 'transform' }} />
      <div ref={ringRef} style={{ position: 'fixed', top: -20, left: -20, width: 40, height: 40, pointerEvents: 'none', zIndex: 99998, willChange: 'transform', transition: 'opacity 0.2s ease' }}>
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <path d="M2,10 L2,2 L10,2"    stroke="#10b981" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M30,2 L38,2 L38,10"  stroke="#10b981" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M38,30 L38,38 L30,38" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M10,38 L2,38 L2,30"  stroke="#10b981" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="20" y1="16" x2="20" y2="24" stroke="rgba(16,185,129,0.5)" strokeWidth="0.8"/>
          <line x1="16" y1="20" x2="24" y2="20" stroke="rgba(16,185,129,0.5)" strokeWidth="0.8"/>
        </svg>
      </div>

      <div id="dc-hud-toast" style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: 'rgba(3,7,18,0.95)', border: '1px solid #10b981', boxShadow: '0 0 15px rgba(16,185,129,0.2)', borderRadius: 6, padding: '10px 16px', color: '#34d399', fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.1em', opacity: 0, transform: 'translateY(10px)', transition: 'all 300ms cubic-bezier(0.16,1,0.3,1)', pointerEvents: 'none' }}>TRANSMITTING_DIRECTIVE…</div>

      <style dangerouslySetInnerHTML={{ __html: `
        .cursor-custom-active, .cursor-custom-active * { cursor: none !important; }

        .dc-text-shimmer {
          background: linear-gradient(120deg, #ffffff 25%, #10b981 40%, #00f0ff 50%, #10b981 60%, #ffffff 75%);
          background-size: 200% auto; -webkit-background-clip: text; background-clip: text;
          -webkit-text-fill-color: transparent; display: inline-block; transition: filter 0.3s ease;
        }
        .dc-text-shimmer:hover { animation: dc-shimmer-move 1.5s linear infinite; filter: drop-shadow(0 0 12px rgba(0,240,255,0.5)); }
        @keyframes dc-shimmer-move { 0%{background-position:100% 0} 100%{background-position:-100% 0} }

        .dc-glare-btn {
          position: relative; border-radius: 12px; padding: 14px 32px;
          font-family: var(--font-ui), sans-serif; font-size: 13px; font-weight: 600;
          letter-spacing: 0.04em; text-transform: uppercase;
          transition: all 0.25s cubic-bezier(0.25,0.8,0.25,1); overflow: hidden;
        }
        .dc-glare-btn.is-primary  { border: 1px solid rgba(16,185,129,0.5); background: rgba(16,185,129,0.12); color: #34d399; box-shadow: 0 4px 20px rgba(16,185,129,0.06), inset 0 1px 1px rgba(255,255,255,0.05); }
        .dc-glare-btn.is-secondary{ border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.02); color: #94a3b8; }
        .dc-glare-btn::before { content:''; position:absolute; inset:0; pointer-events:none; background:radial-gradient(circle 70px at var(--x,0px) var(--y,0px),rgba(255,255,255,0.12),transparent 80%); opacity:0; transition:opacity 0.3s; }
        .dc-glare-btn.is-primary::before { background:radial-gradient(circle 70px at var(--x,0px) var(--y,0px),rgba(16,185,129,0.35),transparent 80%); }
        .dc-glare-btn:hover { transform: translateY(-2px); }
        .dc-glare-btn.is-primary:hover  { border-color: #10b981; box-shadow: 0 0 30px rgba(16,185,129,0.22); }
        .dc-glare-btn.is-secondary:hover{ border-color: rgba(255,255,255,0.2); color: #fff; background: rgba(255,255,255,0.05); }
        .dc-glare-btn:hover::before { opacity: 1; }

        .dc-logo-glare { position:absolute; inset:0; border-radius:50%; pointer-events:none; z-index:10; background:radial-gradient(circle at var(--glare-x,50%) var(--glare-y,50%),rgba(255,255,255,0.1) 0%,transparent 60%); transition:background 0.1s; }

        @keyframes heroFloat         { 0%,100%{transform:translateY(0)}    50%{transform:translateY(-8px)} }
        @keyframes heroGlowPulse     { 0%,100%{opacity:.6;transform:scale(.96)} 50%{opacity:1;transform:scale(1.04)} }
        @keyframes heroRingExpand    { 0%,100%{transform:scale(.97);opacity:.35} 50%{transform:scale(1.03);opacity:.9} }
        @keyframes heroRingExpandFast{ 0%,100%{transform:scale(.95);opacity:.5}  50%{transform:scale(1.06);opacity:.95} }
        @keyframes dc-fade-in        { from{opacity:0;transform:scale(0.98) translateY(10px)} to{opacity:1;transform:scale(1) translateY(0)} }
      `}} />

      <LaunchDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
