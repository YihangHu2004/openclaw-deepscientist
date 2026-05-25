export default function LobsterLogo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 36" fill="none" aria-label="DeepClaw">
      <defs>
        <filter id="lc-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.1" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="lc-glow-soft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.7" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* ── Antennae ──────────────────────────────────────── */}
      <line x1="14" y1="10" x2="4"  y2="2"  stroke="#00c8e8" strokeWidth="1"   strokeLinecap="round" opacity="0.55" />
      <line x1="16" y1="9"  x2="8"  y2="1"  stroke="#00c8e8" strokeWidth="0.8" strokeLinecap="round" opacity="0.35" />

      {/* ── Rostrum (forward spine) ───────────────────────── */}
      <path d="M13,13 L5,11" stroke="#00c8e8" strokeWidth="1.6" strokeLinecap="round" filter="url(#lc-glow)" />

      {/* ── Large claw (chelae) — upper jaw ──────────────── */}
      {/* arm from body shoulder to claw palm */}
      <path d="M13,14 L7,12" stroke="#00c8e8" strokeWidth="2.2" strokeLinecap="round" filter="url(#lc-glow)" />
      {/* palm segment */}
      <line x1="7" y1="12" x2="7" y2="17" stroke="#00c8e8" strokeWidth="2.2" strokeLinecap="round" filter="url(#lc-glow)" />
      {/* fixed finger (dactylus) */}
      <path d="M7,12 L2,8"  stroke="#00c8e8" strokeWidth="2" strokeLinecap="round" filter="url(#lc-glow)" />
      {/* movable finger (pollex) */}
      <path d="M7,17 L2,21" stroke="#00c8e8" strokeWidth="2" strokeLinecap="round" filter="url(#lc-glow)" />
      {/* claw tip dots */}
      <circle cx="2" cy="8"  r="1.4" fill="#00c8e8" opacity="0.9" filter="url(#lc-glow-soft)" />
      <circle cx="2" cy="21" r="1.4" fill="#00c8e8" opacity="0.9" filter="url(#lc-glow-soft)" />

      {/* ── Small cheliped (second claw, smaller) ─────────── */}
      <path d="M13,18 L8,19 L5,16 M8,19 L5,22"
            stroke="#00c8e8" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
            opacity="0.65" />

      {/* ── Cephalothorax (main carapace) ─────────────────── */}
      {/* outer shell polygon — angular/armored segments */}
      <path d="M13,9  L18,7  L24,8  L27,12
               L28,18 L27,25 L24,29 L18,30
               L13,29 L13,9"
            stroke="#00c8e8" strokeWidth="2" fill="none" strokeLinejoin="round"
            filter="url(#lc-glow)" />
      {/* carapace internal segment groove (mechanical joint line) */}
      <line x1="13" y1="19" x2="28" y2="19" stroke="#00c8e8" strokeWidth="0.7" opacity="0.28" />
      {/* dorsal keel line */}
      <line x1="18" y1="7"  x2="21" y2="8"  stroke="#00c8e8" strokeWidth="0.6" opacity="0.22" />

      {/* ── Eye ───────────────────────────────────────────── */}
      <circle cx="16" cy="10" r="2"   fill="#00c8e8" filter="url(#lc-glow-soft)" />
      <circle cx="16" cy="10" r="0.9" fill="#030b16" />

      {/* ── Walking legs (pereopods) — 4 pairs ────────────── */}
      <line x1="17" y1="29" x2="15" y2="36" stroke="#00c8e8" strokeWidth="1" strokeLinecap="round" opacity="0.42" />
      <line x1="20" y1="30" x2="20" y2="36" stroke="#00c8e8" strokeWidth="1" strokeLinecap="round" opacity="0.42" />
      <line x1="23" y1="30" x2="25" y2="36" stroke="#00c8e8" strokeWidth="1" strokeLinecap="round" opacity="0.38" />
      <line x1="26" y1="28" x2="29" y2="34" stroke="#00c8e8" strokeWidth="1" strokeLinecap="round" opacity="0.30" />

      {/* ── Abdomen segments (tail) ───────────────────────── */}
      {/* segment 1 — largest, connects to carapace */}
      <path d="M27,14 L32,14 L33,18 L32,23 L27,23"
            stroke="#00c8e8" strokeWidth="1.7" fill="none" strokeLinejoin="round"
            opacity="0.82" filter="url(#lc-glow-soft)" />
      {/* segment 2 */}
      <path d="M32,15 L35,16 L36,19 L35,22 L32,22"
            stroke="#00c8e8" strokeWidth="1.4" fill="none" strokeLinejoin="round"
            opacity="0.60" />
      {/* segment 3 */}
      <path d="M35,17 L37,17 L38,19 L37,21 L35,21"
            stroke="#00c8e8" strokeWidth="1.1" fill="none" strokeLinejoin="round"
            opacity="0.42" />

      {/* ── Telson + uropods (tail fan) ───────────────────── */}
      <path d="M37,17 L40,14 M38,19 L40,19 M37,21 L40,24"
            stroke="#00c8e8" strokeWidth="1.1" strokeLinecap="round" opacity="0.45" />

      {/* ── Mechanical joint nodes ────────────────────────── */}
      <circle cx="13" cy="14" r="1.6" fill="#00c8e8" opacity="0.80" />
      <circle cx="13" cy="19" r="1.3" fill="#00c8e8" opacity="0.60" />
      <circle cx="7"  cy="14" r="1.3" fill="#00c8e8" opacity="0.70" />
      <circle cx="27" cy="18" r="1.3" fill="#00c8e8" opacity="0.60" />
      <circle cx="32" cy="18" r="1"   fill="#00c8e8" opacity="0.50" />
    </svg>
  );
}
