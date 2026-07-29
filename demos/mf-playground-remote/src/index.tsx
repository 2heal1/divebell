import React, { useCallback, useEffect, useRef, useState } from 'react';
import pkg from '../package.json';
import divebellLogo from './divebell.png?inline';
import './index.css';

export type DivebellEnvironment = 'local' | 'staging' | 'production';

export interface DivebellDemoConfig {
  appName: string;
  environment: DivebellEnvironment;
  sessionId?: string;
}

export interface DivebellDemoProps {
  config: DivebellDemoConfig;
}

type BugKind = 'bug' | 'performance' | 'network';
type BugState = 'active' | 'clearing';
type ControlMode = 'idle' | 'pointer' | 'keyboard';

interface BugTarget {
  id: string;
  x: number;
  y: number;
  kind: BugKind;
  state: BugState;
  drift: number;
  rotation: number;
}

interface MotionState {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  velocityX: number;
  velocityY: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  initialized: boolean;
}

const BUG_DETAILS: Record<BugKind, { label: string }> = {
  bug: { label: 'Bug' },
  performance: { label: 'Performance' },
  network: { label: 'Network' },
};
const BUG_KINDS = Object.keys(BUG_DETAILS) as BugKind[];
const ENVIRONMENTS: DivebellEnvironment[] = [
  'local',
  'staging',
  'production',
];
const reportedErrors = new Set<string>();

function describeReceivedProps(props: unknown): string {
  if (!props || typeof props !== 'object') {
    return 'none';
  }

  const keys = Object.keys(props);
  return keys.length > 0 ? keys.join(', ') : 'none';
}

function reportInvalidProps(message: string): never {
  if (!reportedErrors.has(message)) {
    reportedErrors.add(message);
    console.error(message);
  }
  throw new Error(message);
}

function validateConfig(
  props: DivebellDemoProps,
): asserts props is DivebellDemoProps {
  const config = props?.config;
  const expected =
    'config={{ appName: string, environment: "local" | "staging" | "production" }}';

  if (!config || typeof config !== 'object') {
    reportInvalidProps(
      `[Divebell MF Playground Remote ${pkg.version}] Invalid props: "config" is required. Expected ${expected}. Received props: ${describeReceivedProps(props)}.`,
    );
  }

  if (typeof config.appName !== 'string' || !config.appName.trim()) {
    reportInvalidProps(
      `[Divebell MF Playground Remote ${pkg.version}] Invalid props: "config.appName" must be a non-empty string. Expected ${expected}.`,
    );
  }

  if (!ENVIRONMENTS.includes(config.environment)) {
    reportInvalidProps(
      `[Divebell MF Playground Remote ${pkg.version}] Invalid props: "config.environment" must be "local", "staging", or "production". Received ${JSON.stringify(config.environment)}.`,
    );
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

const Provider: React.FC<DivebellDemoProps> = (props) => {
  validateConfig(props);

  const { appName, environment, sessionId = 'mf-quickstart' } = props.config;
  const oceanRef = useRef<HTMLElement>(null);
  const divebellRef = useRef<HTMLDivElement>(null);
  const bugsRef = useRef<BugTarget[]>([]);
  const bugIdRef = useRef(1);
  const motionRef = useRef<MotionState>({
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    velocityX: 0,
    velocityY: 0,
    minX: 14,
    minY: 88,
    maxX: 14,
    maxY: 88,
    initialized: false,
  });
  const [bugs, setBugs] = useState<BugTarget[]>([]);
  const [clearedCount, setClearedCount] = useState(0);
  const [controlMode, setControlMode] = useState<ControlMode>('idle');
  const [lastSignal, setLastSignal] = useState('Find an issue to begin');
  const [pingCycle, setPingCycle] = useState(0);

  const sendPing = useCallback(() => {
    setPingCycle((cycle) => cycle + 1);
  }, []);

  useEffect(() => {
    const ocean = oceanRef.current;
    const divebell = divebellRef.current;

    if (!ocean || !divebell) {
      return undefined;
    }

    const motion = motionRef.current;
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const removalTimers = new Set<number>();
    let animationFrame = 0;
    let seeded = false;

    const commitBugs = (next: BugTarget[]) => {
      bugsRef.current = next;
      setBugs(next);
    };

    const bugSize = () => clamp(ocean.clientWidth * 0.055, 48, 64);

    const createBug = (existing: BugTarget[]): BugTarget => {
      const size = bugSize();
      const minX = 22;
      const maxX = Math.max(minX, ocean.clientWidth - size - 22);
      const minY = 112;
      const bottomReserve = ocean.clientWidth <= 520 ? 138 : 108;
      const maxY = Math.max(
        minY,
        ocean.clientHeight - size - bottomReserve,
      );
      let x = minX;
      let y = minY;

      for (let attempt = 0; attempt < 24; attempt += 1) {
        x = minX + Math.random() * (maxX - minX);
        y = minY + Math.random() * (maxY - minY);
        const bugCenterX = x + size / 2;
        const bugCenterY = y + size / 2;
        const isOverIntro =
          bugCenterX < Math.min(460, ocean.clientWidth * 0.55) &&
          bugCenterY < Math.min(360, ocean.clientHeight * 0.55);
        const isNearDiver =
          Math.hypot(
            bugCenterX - (motion.x + divebell.offsetWidth / 2),
            bugCenterY - (motion.y + divebell.offsetHeight / 2),
          ) < 150;
        const isNearBug = existing.some(
          (bug) =>
            bug.state === 'active' &&
            Math.hypot(bug.x - x, bug.y - y) < 106,
        );

        if (!isOverIntro && !isNearDiver && !isNearBug) {
          break;
        }
      }

      const sequence = bugIdRef.current;
      bugIdRef.current += 1;

      return {
        id: `bug-${sequence}`,
        x,
        y,
        kind: BUG_KINDS[(sequence - 1) % BUG_KINDS.length],
        state: 'active',
        drift: -Math.random() * 2.4,
        rotation: -7 + Math.random() * 14,
      };
    };

    const seedBugs = () => {
      if (seeded) {
        return;
      }

      seeded = true;
      const initial: BugTarget[] = [];
      while (initial.length < 3) {
        initial.push(createBug(initial));
      }
      commitBugs(initial);
    };

    const measure = () => {
      const horizontalEdge = 14;
      const topEdge = ocean.clientWidth <= 520 ? 74 : 84;
      const bottomReserve = ocean.clientWidth <= 520 ? 124 : 98;
      motion.minX = horizontalEdge;
      motion.minY = topEdge;
      motion.maxX = Math.max(
        horizontalEdge,
        ocean.clientWidth - divebell.offsetWidth - horizontalEdge,
      );
      motion.maxY = Math.max(
        topEdge,
        ocean.clientHeight - divebell.offsetHeight - bottomReserve,
      );

      if (!motion.initialized) {
        motion.x = motion.minX + (motion.maxX - motion.minX) * 0.26;
        motion.y = motion.minY + (motion.maxY - motion.minY) * 0.7;
        motion.targetX = motion.x;
        motion.targetY = motion.y;
        motion.initialized = true;
      } else {
        motion.x = clamp(motion.x, motion.minX, motion.maxX);
        motion.y = clamp(motion.y, motion.minY, motion.maxY);
        motion.targetX = clamp(motion.targetX, motion.minX, motion.maxX);
        motion.targetY = clamp(motion.targetY, motion.minY, motion.maxY);
      }

      divebell.style.setProperty('--db-x', `${motion.x}px`);
      divebell.style.setProperty('--db-y', `${motion.y}px`);
      divebell.dataset.ready = 'true';

      if (bugsRef.current.length > 0) {
        const size = bugSize();
        const maxBugX = Math.max(22, ocean.clientWidth - size - 22);
        const maxBugY = Math.max(
          112,
          ocean.clientHeight -
            size -
            (ocean.clientWidth <= 520 ? 138 : 108),
        );
        commitBugs(
          bugsRef.current.map((bug) => ({
            ...bug,
            x: clamp(bug.x, 22, maxBugX),
            y: clamp(bug.y, 112, maxBugY),
          })),
        );
      }

      seedBugs();
    };

    const clearCollidingBugs = () => {
      const size = bugSize();
      const diverCenterX = motion.x + divebell.offsetWidth / 2;
      const diverCenterY = motion.y + divebell.offsetHeight / 2;
      const hitIds = bugsRef.current
        .filter(
          (bug) =>
            bug.state === 'active' &&
            Math.hypot(
              bug.x + size / 2 - diverCenterX,
              bug.y + size / 2 - diverCenterY,
            ) <
              divebell.offsetWidth * 0.27 + size * 0.46,
        )
        .map((bug) => bug.id);

      if (hitIds.length === 0) {
        return;
      }

      const hitSet = new Set(hitIds);
      const hitLabels = bugsRef.current
        .filter((bug) => hitSet.has(bug.id))
        .map((bug) => BUG_DETAILS[bug.kind].label);
      commitBugs(
        bugsRef.current.map((bug) =>
          hitSet.has(bug.id) ? { ...bug, state: 'clearing' } : bug,
        ),
      );
      setClearedCount((count) => count + hitIds.length);
      setLastSignal(`${hitLabels.join(' + ')} cleared`);
      sendPing();

      for (const id of hitIds) {
        const timer = window.setTimeout(() => {
          removalTimers.delete(timer);
          commitBugs(bugsRef.current.filter((bug) => bug.id !== id));
        }, 620);
        removalTimers.add(timer);
      }
    };

    const animate = () => {
      if (reducedMotion) {
        motion.x = motion.targetX;
        motion.y = motion.targetY;
        motion.velocityX = 0;
        motion.velocityY = 0;
      } else {
        motion.velocityX =
          (motion.velocityX + (motion.targetX - motion.x) * 0.075) * 0.78;
        motion.velocityY =
          (motion.velocityY + (motion.targetY - motion.y) * 0.075) * 0.78;
        motion.x += motion.velocityX;
        motion.y += motion.velocityY;
      }

      const angle = reducedMotion
        ? 0
        : clamp(motion.velocityX * 0.55, -11, 11);
      const wake = clamp(
        Math.hypot(motion.velocityX, motion.velocityY) / 7,
        0,
        1,
      );

      divebell.style.setProperty('--db-x', `${motion.x}px`);
      divebell.style.setProperty('--db-y', `${motion.y}px`);
      divebell.style.setProperty('--db-angle', `${angle}deg`);
      divebell.style.setProperty('--db-wake', wake.toFixed(2));
      clearCollidingBugs();
      animationFrame = window.requestAnimationFrame(animate);
    };

    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(ocean);
    animationFrame = window.requestAnimationFrame(animate);

    const spawnTimer = window.setInterval(() => {
      const activeCount = bugsRef.current.filter(
        (bug) => bug.state === 'active',
      ).length;
      if (activeCount >= 4) {
        return;
      }

      commitBugs([...bugsRef.current, createBug(bugsRef.current)]);
    }, 2400);

    return () => {
      resizeObserver.disconnect();
      window.cancelAnimationFrame(animationFrame);
      window.clearInterval(spawnTimer);
      removalTimers.forEach((timer) => {
        window.clearTimeout(timer);
      });
    };
  }, [sendPing]);

  const steerTo = (clientX: number, clientY: number) => {
    const ocean = oceanRef.current;
    const divebell = divebellRef.current;

    if (!ocean || !divebell) {
      return;
    }

    const rect = ocean.getBoundingClientRect();
    const motion = motionRef.current;
    motion.targetX = clamp(
      clientX - rect.left - divebell.offsetWidth / 2,
      motion.minX,
      motion.maxX,
    );
    motion.targetY = clamp(
      clientY - rect.top - divebell.offsetHeight / 2,
      motion.minY,
      motion.maxY,
    );
    setControlMode('pointer');
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const key = event.key.toLowerCase();
    const distance = event.shiftKey ? 72 : 38;
    let deltaX = 0;
    let deltaY = 0;

    if (key === 'arrowleft' || key === 'a') deltaX = -distance;
    if (key === 'arrowright' || key === 'd') deltaX = distance;
    if (key === 'arrowup' || key === 'w') deltaY = -distance;
    if (key === 'arrowdown' || key === 's') deltaY = distance;

    if (key === ' ') {
      event.preventDefault();
      sendPing();
      setLastSignal('Manual sonar sent');
      return;
    }

    if (deltaX === 0 && deltaY === 0) {
      return;
    }

    event.preventDefault();
    const motion = motionRef.current;
    motion.targetX = clamp(
      motion.targetX + deltaX,
      motion.minX,
      motion.maxX,
    );
    motion.targetY = clamp(
      motion.targetY + deltaY,
      motion.minY,
      motion.maxY,
    );
    setControlMode('keyboard');
  };

  const activeBugCount = bugs.filter((bug) => bug.state === 'active').length;
  const controlStatus =
    controlMode === 'pointer'
      ? 'Pointer steering'
      : controlMode === 'keyboard'
        ? 'Keyboard steering'
        : 'Controls ready';

  return (
    <main className="db-demo">
      <section
        ref={oceanRef}
        className="db-ocean"
        tabIndex={0}
        aria-label="Divebell issue clearing game"
        aria-describedby="db-control-help"
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight W A S D Space"
        onKeyDown={handleKeyDown}
        onPointerMove={(event) => steerTo(event.clientX, event.clientY)}
        onPointerDown={(event) => {
          event.currentTarget.focus();
          steerTo(event.clientX, event.clientY);
        }}
      >
        <div className="db-surface-light" aria-hidden="true" />
        <div className="db-depth-grid" aria-hidden="true" />
        <div className="db-seabed" aria-hidden="true" />

        <header className="db-topbar">
          <div className="db-brand">
            <span className="db-brand-mark">D</span>
            <div>
              <strong>Divebell</strong>
              <span>Live diagnostics playground</span>
            </div>
          </div>

          <div className="db-mission">
            <span className="db-mission-signal" aria-hidden="true" />
            <span>
              {activeBugCount.toString().padStart(2, '0')} issues detected
            </span>
            <strong>{clearedCount.toString().padStart(2, '0')} cleared</strong>
          </div>
        </header>

        <div className="db-intro">
          <p>Development diagnostics / live mission</p>
          <h1>
            Find the issue.
            <span>Clear the path.</span>
          </h1>
          <p className="db-lede">
            Steer Divebell into each signal. Contact triggers a golden sonar
            pulse and clears it from the scene.
          </p>
        </div>

        <div className="db-context" aria-label="Session context">
          <span>{appName}</span>
          <span>{environment}</span>
          <span>{sessionId}</span>
        </div>

        <div className="db-bug-field" aria-live="polite">
          {bugs.map((bug) => {
            const details = BUG_DETAILS[bug.kind];
            const bugStyle = {
              '--db-bug-x': `${bug.x}px`,
              '--db-bug-y': `${bug.y}px`,
              '--db-bug-drift': `${bug.drift}s`,
              '--db-bug-rotation': `${bug.rotation}deg`,
            } as React.CSSProperties;

            return (
              <div
                key={bug.id}
                className={`db-bug is-${bug.kind} is-${bug.state}`}
                style={bugStyle}
                role="img"
                aria-label={`${details.label} issue${bug.state === 'clearing' ? ' cleared' : ''}`}
              >
                <span className="db-bug-radar" aria-hidden="true" />
                <span className="db-bug-core">
                  <svg viewBox="0 0 64 64" aria-hidden="true">
                    {bug.kind === 'bug' && (
                      <>
                        <path d="M20 20 14 14M44 20l6-6M17 30H9M47 30h8M17 42l-8 6M47 42l8 6" />
                        <path d="M22 20c0-6 4-10 10-10s10 4 10 10" />
                        <rect x="17" y="18" width="30" height="36" rx="15" />
                        <path d="M32 19v35M18 33h28" />
                        <circle cx="27" cy="27" r="2" />
                        <circle cx="38" cy="40" r="2" />
                      </>
                    )}
                    {bug.kind === 'performance' && (
                      <>
                        <path d="M12 43a23 23 0 1 1 40 0" />
                        <path d="M18 43h28M32 16v5M16 27l5 3M48 27l-5 3" />
                        <path d="m32 39 12-13" />
                        <circle cx="32" cy="39" r="4" />
                      </>
                    )}
                    {bug.kind === 'network' && (
                      <>
                        <circle cx="32" cy="14" r="6" />
                        <circle cx="16" cy="46" r="6" />
                        <circle cx="48" cy="46" r="6" />
                        <path d="m29 20-10 20M35 20l10 20M22 46h20" />
                        <circle cx="32" cy="34" r="4" />
                      </>
                    )}
                  </svg>
                </span>
              </div>
            );
          })}
        </div>

        <div
          ref={divebellRef}
          className={`db-diver${pingCycle > 0 ? ' is-pinging' : ''}`}
          aria-hidden="true"
        >
          <span
            key={`sonar-one-${pingCycle}`}
            className="db-sonar db-sonar-one"
          />
          <span
            key={`sonar-two-${pingCycle}`}
            className="db-sonar db-sonar-two"
          />
          <span
            key={`sonar-three-${pingCycle}`}
            className="db-sonar db-sonar-three"
          />
          <span className="db-bubble db-bubble-one" />
          <span className="db-bubble db-bubble-two" />
          <span className="db-bubble db-bubble-three" />
          <div className="db-diver-float">
            <img src={divebellLogo} alt="" />
          </div>
        </div>

        <div className="db-controls" id="db-control-help">
          <div className="db-controls-copy">
            <span className="db-control-status">
              <i aria-hidden="true" />
              {controlStatus}
            </span>
            <strong>{lastSignal}</strong>
          </div>

          <div className="db-control-list">
            <span>
              <kbd>Mouse</kbd>
              Chase
            </span>
            <span>
              <kbd>↑ ↓ ← →</kbd>
              Steer
            </span>
            <span>
              <kbd>Space</kbd>
              Sonar
            </span>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Provider;
