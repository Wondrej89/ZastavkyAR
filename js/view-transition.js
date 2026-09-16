export const MAX_TRANSITION_MS = 400;
export const REDUCED_TRANSITION_MS = 120;

export class ViewTransition {
  constructor({ root, overlay, state, config, now = () => Date.now(), setTimer = setTimeout,
    reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true, canStart = () => true,
    onChange = () => {} }) {
    Object.assign(this, { root, overlay, state, config, now, setTimer, reducedMotion, canStart, onChange });
  }

  start(direction, { onMidpoint = () => {}, onComplete = () => {} } = {}) {
    const requestedAt = this.now();
    if (!this.canStart() || this.state.viewTransition.active || requestedAt < this.state.viewTransitionLockedUntil) return false;
    const reduced = this.reducedMotion();
    const duration = reduced ? REDUCED_TRANSITION_MS : this.config.viewTransitionMs;
    const midpointMs = duration / 2;
    this.state.viewTransition = { active: true, direction };
    this.state.viewTransitionLockedUntil = requestedAt + this.config.viewTransitionLockMs;
    this.state.viewTransitionReducedMotion = reduced;
    this.state.viewTransitionVisualStartedAt = null;
    this.state.viewTransitionMidpointReached = false;
    this.state.viewTransitionCompleted = false;
    this.state.viewTransitionStartCount = (this.state.viewTransitionStartCount || 0) + 1;
    this.state.lastViewTransitionDirection = direction;
    this.root.classList.add('is-transitioning');
    this.overlay?.classList.remove('transition-map', 'transition-ar');
    // Force style resolution so the same CSS animation reliably restarts.
    if (this.overlay) void this.overlay.offsetWidth;
    this.overlay?.classList.add(direction === 'to-map' ? 'transition-map' : 'transition-ar');
    this.state.viewTransitionVisualStartedAt = this.now();
    this.onChange();

    let midpointDone = false;
    const midpoint = () => {
      if (midpointDone || !this.state.viewTransition.active) return;
      midpointDone = true;
      this.state.viewTransitionMidpointReached = true;
      onMidpoint();
      this.onChange();
    };
    const complete = () => {
      if (!this.state.viewTransition.active) return;
      midpoint();
      onComplete();
      const startedAt = this.state.viewTransitionVisualStartedAt ?? requestedAt;
      this.state.lastViewTransitionDuration = Math.max(0, this.now() - startedAt);
      this.state.viewTransitionCompleted = true;
      this.state.viewTransition = { active: false, direction: null };
      this.root.classList.remove('is-transitioning');
      this.overlay?.classList.remove('transition-map', 'transition-ar');
      this.onChange();
    };

    this.setTimer(midpoint, midpointMs);
    this.setTimer(complete, duration);
    // A separate fail-safe cannot delay or otherwise control the functional mode.
    this.setTimer(complete, MAX_TRANSITION_MS);
    return true;
  }
}
