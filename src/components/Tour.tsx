import { useEffect, useState, useCallback, type RefObject } from 'react';
import { TourStep } from '@/utils/tourSteps';

interface TourProps {
  steps: TourStep[];
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  containerRef?: RefObject<HTMLElement>;
}

/* ── Rule 7: Centralized z-index constants ─────────────────────────────── */
const Z = {
  OVERLAY: 10000,
  SPOTLIGHT: 10001,
  TOOLTIP: 10002,
} as const;

/* ── Layout constants ──────────────────────────────────────────────────── */
const MAX_TOOLTIP_WIDTH = 300;
const MIN_TOOLTIP_WIDTH = 280;
const MIN_TOOLTIP_HEIGHT = 200;
const TOOLTIP_GAP = 20;          // Rule 4: breathing room between spotlight & card
const EDGE_THRESHOLD = 24;       // Rule 5: edge proximity threshold
const CONTAINER_MARGIN = 12;     // breathing room from container edges
const SPOTLIGHT_PAD = 6;         // padding around highlighted target

/* ── Positioning candidate ─────────────────────────────────────────────── */
interface Candidate {
  top: number;
  left: number;
  overlaps: boolean;
  overlapArea: number;
  availableSpace: number;
}

export default function Tour({ steps, isOpen, onClose, onComplete, containerRef }: TourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetEl, setTargetEl] = useState<HTMLElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [cardReady, setCardReady] = useState(false);

  /* ── Helpers ──────────────────────────────────────────────────────────── */

  const getContainer = useCallback(
    () => containerRef?.current || document.body,
    [containerRef],
  );

  const getTooltipWidth = useCallback(
    (containerW: number) => {
      const maxW = Math.min(MAX_TOOLTIP_WIDTH, containerW - CONTAINER_MARGIN * 2);
      return Math.max(MIN_TOOLTIP_WIDTH, maxW);
    },
    [],
  );

  /* ── Rule 3: Viewport Safety ─────────────────────────────────────────── */
  const isTargetCompletelyHidden = useCallback(
    (target: HTMLElement): boolean => {
      const container = getContainer();
      const cRect = container.getBoundingClientRect();
      const tRect = target.getBoundingClientRect();

      return (
        tRect.bottom <= cRect.top ||
        tRect.top >= cRect.bottom ||
        tRect.right <= cRect.left ||
        tRect.left >= cRect.right
      );
    },
    [getContainer],
  );

  /* ── Score-based positioning (Rules 1, 4, 5) ─────────────────────────── */
  const calculatePosition = useCallback(
    (target: HTMLElement) => {
      const container = getContainer();
      const cRect = container.getBoundingClientRect();
      const tRect = target.getBoundingClientRect();

      const tooltipW = getTooltipWidth(cRect.width);
      const tooltipH = MIN_TOOLTIP_HEIGHT;

      // Relative coords within container
      const tTop = tRect.top - cRect.top;
      const tBottom = tRect.bottom - cRect.top;
      const tCenterX = (tRect.left - cRect.left) + tRect.width / 2;

      // Available space above and below the target
      const spaceAbove = tTop - SPOTLIGHT_PAD;
      const spaceBelow = cRect.height - tBottom - SPOTLIGHT_PAD;

      // Horizontal: center on target, clamped to container
      const rawLeft = tCenterX - tooltipW / 2;
      const left = Math.max(
        CONTAINER_MARGIN,
        Math.min(rawLeft, cRect.width - tooltipW - CONTAINER_MARGIN),
      );

      // Target bounding box (with spotlight padding) for overlap checks
      const targetBox = {
        top: tTop - SPOTLIGHT_PAD,
        left: (tRect.left - cRect.left) - SPOTLIGHT_PAD,
        right: (tRect.right - cRect.left) + SPOTLIGHT_PAD,
        bottom: tBottom + SPOTLIGHT_PAD,
      };

      // Helper: check overlap between card rect and target rect
      const checkOverlap = (cardTop: number) => {
        const cardBox = {
          top: cardTop,
          left,
          right: left + tooltipW,
          bottom: cardTop + tooltipH,
        };

        const overlapX = Math.max(0,
          Math.min(cardBox.right, targetBox.right) - Math.max(cardBox.left, targetBox.left)
        );
        const overlapY = Math.max(0,
          Math.min(cardBox.bottom, targetBox.bottom) - Math.max(cardBox.top, targetBox.top)
        );
        const overlapArea = overlapX * overlapY;

        return {
          overlaps: overlapArea > 0,
          overlapArea,
        };
      };

      // Build candidate for a given direction
      const buildCandidate = (direction: 'bottom' | 'top'): Candidate => {
        let rawTop: number;
        if (direction === 'bottom') {
          rawTop = tBottom + SPOTLIGHT_PAD + TOOLTIP_GAP;
        } else {
          rawTop = tTop - SPOTLIGHT_PAD - TOOLTIP_GAP - tooltipH;
        }

        // Clamp within container
        const clampedTop = Math.max(
          CONTAINER_MARGIN,
          Math.min(rawTop, cRect.height - tooltipH - CONTAINER_MARGIN),
        );

        const { overlaps, overlapArea } = checkOverlap(clampedTop);

        return {
          top: clampedTop,
          left,
          overlaps,
          overlapArea,
          availableSpace: direction === 'bottom' ? spaceBelow : spaceAbove,
        };
      };

      // Score candidate: non-overlapping wins, then more space wins
      const score = (c: Candidate) => {
        if (!c.overlaps) return 10000 + c.availableSpace;
        return c.availableSpace - c.overlapArea;
      };

      // Rule 5: Edge Target Rule — force direction
      const nearTop = tTop < EDGE_THRESHOLD;
      const nearBottom = (cRect.height - tBottom) < EDGE_THRESHOLD;

      let best: Candidate;

      if (nearTop && !nearBottom) {
        // Target near top → force below
        best = buildCandidate('bottom');
      } else if (nearBottom && !nearTop) {
        // Target near bottom → force above
        best = buildCandidate('top');
      } else {
        // Evaluate both, pick best by score
        const bottomC = buildCandidate('bottom');
        const topC = buildCandidate('top');
        best = score(bottomC) >= score(topC) ? bottomC : topC;
      }

      // Rule 1: If best still overlaps, push to the furthest edge from target
      if (best.overlaps) {
        const targetCenterY = (tTop + tBottom) / 2;
        const containerCenter = cRect.height / 2;

        if (targetCenterY < containerCenter) {
          // Target in upper half → push card to bottom edge
          best.top = Math.max(
            tBottom + SPOTLIGHT_PAD + TOOLTIP_GAP,
            cRect.height - tooltipH - CONTAINER_MARGIN,
          );
        } else {
          // Target in lower half → push card to top edge
          best.top = CONTAINER_MARGIN;
        }
      }

      setPos({ top: best.top, left: best.left });
    },
    [getContainer, getTooltipWidth],
  );

  /* ── Find target & position ──────────────────────────────────────────── */
  const acquireTarget = useCallback(() => {
    if (!isOpen || currentStep >= steps.length) return;

    const step = steps[currentStep];
    const container = getContainer();
    const target = container.querySelector(
      `[data-tour-id="${step.target}"]`,
    ) as HTMLElement | null;

    if (!target) {
      console.warn(`[Tour] Target not found: ${step.target}`);
      if (currentStep < steps.length - 1) {
        setCurrentStep(s => s + 1);
      } else {
        onComplete();
      }
      return;
    }

    // Rule 3: scroll only if completely hidden
    if (isTargetCompletelyHidden(target)) {
      target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTargetEl(target);
          calculatePosition(target);
          setCardReady(true);
        });
      });
    } else {
      setTargetEl(target);
      calculatePosition(target);
      setCardReady(true);
    }
  }, [isOpen, currentStep, steps, getContainer, onComplete, isTargetCompletelyHidden, calculatePosition]);

  /* ── Step change ─────────────────────────────────────────────────────── */
  useEffect(() => {
    if (isOpen) {
      setCardReady(false);
      const t = setTimeout(() => acquireTarget(), 50);
      return () => clearTimeout(t);
    }
  }, [isOpen, currentStep, acquireTarget]);

  /* ── Resize handler ──────────────────────────────────────────────────── */
  useEffect(() => {
    if (!isOpen || !targetEl) return;
    const onResize = () => calculatePosition(targetEl);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isOpen, targetEl, calculatePosition]);

  /* ── Keyboard (ESC, arrows) ──────────────────────────────────────────── */
  useEffect(() => {
    if (!isOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (currentStep < steps.length - 1) setCurrentStep(s => s + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (currentStep > 0) setCurrentStep(s => s - 1);
      }
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, currentStep, steps.length, onClose]);

  /* ── Reset on close ──────────────────────────────────────────────────── */
  useEffect(() => {
    if (!isOpen) {
      setCurrentStep(0);
      setTargetEl(null);
      setPos(null);
      setCardReady(false);
    }
  }, [isOpen]);

  /* ── Navigation ──────────────────────────────────────────────────────── */
  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(s => s + 1);
    } else {
      onComplete();
    }
  };
  const handleBack = () => {
    if (currentStep > 0) setCurrentStep(s => s - 1);
  };

  /* ── Render ──────────────────────────────────────────────────────────── */
  if (!isOpen || !targetEl || !pos || !cardReady) return null;

  const step = steps[currentStep];
  const container = getContainer();
  const cRect = container.getBoundingClientRect();
  const tRect = targetEl.getBoundingClientRect();

  // Spotlight coords relative to container
  const sTop = tRect.top - cRect.top - SPOTLIGHT_PAD;
  const sLeft = tRect.left - cRect.left - SPOTLIGHT_PAD;
  const sWidth = tRect.width + SPOTLIGHT_PAD * 2;
  const sHeight = tRect.height + SPOTLIGHT_PAD * 2;
  const sBottom = sTop + sHeight;
  const sRight = sLeft + sWidth;

  const tooltipW = getTooltipWidth(cRect.width);
  const prefersRM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const anim = prefersRM ? 'none' : 'tourFadeIn 0.2s ease-out';

  return (
    <>
      {/* ── 4-Panel Overlay ────────────────────────────────────────────── */}
      {/* Top panel */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: Math.max(0, sTop),
        background: 'rgba(0, 0, 0, 0.55)',
        zIndex: Z.OVERLAY,
        pointerEvents: 'auto',
        transition: prefersRM ? 'none' : 'all 0.2s ease',
      }} onClick={onClose} />
      {/* Bottom panel */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        top: Math.min(cRect.height, sBottom),
        background: 'rgba(0, 0, 0, 0.55)',
        zIndex: Z.OVERLAY,
        pointerEvents: 'auto',
        transition: prefersRM ? 'none' : 'all 0.2s ease',
      }} onClick={onClose} />
      {/* Left panel */}
      <div style={{
        position: 'absolute',
        top: Math.max(0, sTop),
        left: 0,
        width: Math.max(0, sLeft),
        height: sHeight,
        background: 'rgba(0, 0, 0, 0.55)',
        zIndex: Z.OVERLAY,
        pointerEvents: 'auto',
        transition: prefersRM ? 'none' : 'all 0.2s ease',
      }} onClick={onClose} />
      {/* Right panel */}
      <div style={{
        position: 'absolute',
        top: Math.max(0, sTop),
        left: Math.min(cRect.width, sRight),
        right: 0,
        height: sHeight,
        background: 'rgba(0, 0, 0, 0.55)',
        zIndex: Z.OVERLAY,
        pointerEvents: 'auto',
        transition: prefersRM ? 'none' : 'all 0.2s ease',
      }} onClick={onClose} />

      {/* ── Spotlight highlight ring (overlay-only, reduced glow) ───────── */}
      <div style={{
        position: 'absolute',
        top: sTop,
        left: sLeft,
        width: sWidth,
        height: sHeight,
        borderRadius: '6px',
        border: '2px solid #f59e0b',
        boxShadow: [
          '0 0 0 1px rgba(245, 158, 11, 0.25)',
          '0 0 16px rgba(245, 158, 11, 0.22)',
        ].join(', '),
        zIndex: Z.SPOTLIGHT,
        pointerEvents: 'none',
        transition: prefersRM ? 'none' : 'all 0.2s ease',
      }} />

      {/* ── Tooltip Card ───────────────────────────────────────────────── */}
      <div
        role="dialog"
        aria-label={`Step ${currentStep + 1} of ${steps.length}: ${step.title}`}
        style={{
          position: 'absolute',
          top: pos.top,
          left: pos.left,
          width: tooltipW,
          minHeight: MIN_TOOLTIP_HEIGHT,
          background: '#ffffff',
          border: '1.5px solid #e8ecf0',
          borderRadius: '14px',
          padding: '24px 22px 20px',
          color: '#1e293b',
          boxShadow: '0 12px 40px rgba(15, 23, 42, 0.12), 0 4px 12px rgba(15, 23, 42, 0.06)',
          zIndex: Z.TOOLTIP,
          animation: anim,
          display: 'flex',
          flexDirection: 'column' as const,
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        }}
      >
        {/* Step indicator */}
        <div style={{
          fontSize: '11px',
          fontWeight: 700,
          color: '#b45309',
          textTransform: 'uppercase' as const,
          letterSpacing: '0.1em',
          marginBottom: '14px',
          lineHeight: 1,
        }}>
          Step {currentStep + 1} of {steps.length}
        </div>

        {/* Title */}
        <h3 style={{
          margin: '0 0 8px 0',
          fontSize: '18px',
          fontWeight: 800,
          lineHeight: 1.2,
          color: '#0f172a',
          letterSpacing: '-0.01em',
        }}>
          {step.title}
        </h3>

        {/* Description */}
        <p style={{
          margin: '0',
          fontSize: '13.5px',
          fontWeight: 450,
          lineHeight: 1.55,
          color: '#64748b',
          letterSpacing: '0.005em',
        }}>
          {step.description}
        </p>

        {/* Divider */}
        <div
          aria-hidden="true"
          style={{
            height: '1px',
            width: '100%',
            background: '#e8ecf0',
            margin: '18px 0 16px',
            flexShrink: 0,
          }}
        />

        {/* Navigation */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
          marginTop: 'auto',
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
              padding: '6px 0',
              transition: 'color 0.15s',
              whiteSpace: 'nowrap' as const,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#64748b'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8'; }}
          >
            Maybe Later
          </button>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {currentStep > 0 && (
              <button
                type="button"
                onClick={handleBack}
                style={{
                  background: '#f8fafc',
                  border: '1.5px solid #e8ecf0',
                  color: '#374151',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  transition: 'background 0.15s, border-color 0.15s',
                  whiteSpace: 'nowrap' as const,
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = '#fffbeb';
                  e.currentTarget.style.borderColor = '#f59e0b';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = '#f8fafc';
                  e.currentTarget.style.borderColor = '#e8ecf0';
                }}
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              style={{
                background: '#f59e0b',
                border: '1.5px solid #d97706',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 800,
                cursor: 'pointer',
                padding: '9px 20px',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(245, 158, 11, 0.25)',
                transition: 'background 0.15s, box-shadow 0.15s',
                whiteSpace: 'nowrap' as const,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = '#d97706';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(245, 158, 11, 0.35)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = '#f59e0b';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(245, 158, 11, 0.25)';
              }}
            >
              {currentStep < steps.length - 1 ? 'Next \u2192' : 'Finish'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Keyframe animation ─────────────────────────────────────────── */}
      <style>{`
        @keyframes tourFadeIn {
          from { opacity: 0; transform: scale(0.97) translateY(4px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </>
  );
}
