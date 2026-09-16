export const MAX_TRANSITION_MS = 560;
export const REDUCED_TRANSITION_MS = 120;

export class ViewTransition {
  constructor({ root, overlay, state, config, now = () => Date.now(), setTimer = setTimeout,
    requestFrame = callback => globalThis.requestAnimationFrame?.(callback) ?? callback(),
    reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true, canStart = () => true,
    onChange = () => {} }) {
    Object.assign(this, { root, overlay, state, config, now, setTimer, requestFrame, reducedMotion, canStart, onChange });
    this.runId = 0;
  }

  start(direction, { onMidpoint = () => {}, onComplete = () => {} } = {}) {
    const requestedAt = this.now();
    if (!this.canStart() || this.state.viewTransition.active || requestedAt < this.state.viewTransitionLockedUntil) return false;
    const reduced = this.reducedMotion();
    const duration = reduced ? REDUCED_TRANSITION_MS : this.config.viewTransitionMs;
    const midpointMs = reduced ? duration / 2 : Math.min(140, duration / 2);
    const runId = ++this.runId;
    this.state.viewTransition = { active: true, direction };
    this.state.viewTransitionLockedUntil = requestedAt + this.config.viewTransitionLockMs;
    this.state.viewTransitionReducedMotion = reduced;
    this.state.viewTransitionVisualStartedAt = null;
    this.state.viewTransitionMidpointReached = false;
    this.state.viewTransitionCompleted = false;
    this.root.classList.remove('transition-to-map', 'transition-to-ar', 'reduced-motion');
    this.root.classList.add('is-transitioning', `transition-${direction}`, ...(reduced ? ['reduced-motion'] : []));
    this.overlay?.classList.add('active');
    this.onChange();

    let midpointDone = false;
    const midpoint = () => {
      if (runId !== this.runId || midpointDone) return;
      midpointDone = true;
      this.state.viewTransitionMidpointReached = true;
      onMidpoint();
      this.onChange();
    };
    const complete = () => {
      if (runId !== this.runId || !this.state.viewTransition.active) return;
      midpoint();
      onComplete();
      const startedAt = this.state.viewTransitionVisualStartedAt ?? requestedAt;
      this.state.lastViewTransitionDuration = Math.max(0, this.now() - startedAt);
      this.state.viewTransitionCompleted = true;
      this.state.viewTransition = { active: false, direction: null };
      this.root.classList.remove('is-transitioning', 'transition-to-map', 'transition-to-ar', 'reduced-motion');
      this.overlay?.classList.remove('active');
      this.onChange();
    };

    // This is independent of WAAPI callbacks and guarantees the target presentation.
    this.setTimer(complete, MAX_TRANSITION_MS);
    this.requestFrame(() => this.requestFrame(() => {
      if (runId !== this.runId || !this.state.viewTransition.active) return;
      this.state.viewTransitionVisualStartedAt = this.now();
      this.onChange();
      this.setTimer(midpoint, midpointMs);
      const translate = reduced ? 'translateY(0)' : direction === 'to-map' ? 'translateY(-12px)' : 'translateY(12px)';
      const translateOut = reduced ? 'translateY(0)' : direction === 'to-map' ? 'translateY(12px)' : 'translateY(-12px)';
      const animation = this.overlay?.animate?.([
        { opacity: 0, transform: translate },
        { opacity: 1, transform: 'translateY(0)', offset: midpointMs / duration },
        { opacity: 0, transform: translateOut }
      ], { duration, easing: 'ease-in-out', fill: 'both' });
      if (animation) animation.finished.then(complete, complete);
      else this.setTimer(complete, duration);
    }));
    return true;
  }
}
