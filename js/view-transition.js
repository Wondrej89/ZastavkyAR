export const MAX_TRANSITION_MS = 500;

export class ViewTransition {
  constructor({ root, overlay, state, config, now = () => Date.now(), setTimer = setTimeout,
    reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true, canStart = () => true,
    onChange = () => {} }) {
    Object.assign(this, { root, overlay, state, config, now, setTimer, reducedMotion, canStart, onChange });
  }

  start(direction) {
    const time = this.now();
    if (!this.canStart() || this.state.viewTransition.active || time < this.state.viewTransitionLockedUntil) return false;
    const reduced = this.reducedMotion();
    const duration = reduced ? 1 : this.config.viewTransitionMs;
    this.state.viewTransition = { active: true, direction };
    this.state.viewTransitionLockedUntil = time + this.config.viewTransitionLockMs;
    this.root.classList.remove('transition-to-map', 'transition-to-ar');
    this.root.classList.add('is-transitioning', `transition-${direction}`, ...(reduced ? ['reduced-motion'] : []));
    this.overlay?.classList.add('active');
    this.onChange();
    this.setTimer(() => this.finish(direction, duration), duration);
    this.setTimer(() => this.finish(direction, duration), MAX_TRANSITION_MS);
    return true;
  }

  finish(direction, duration = this.config.viewTransitionMs) {
    if (!this.state.viewTransition.active || this.state.viewTransition.direction !== direction) return;
    this.state.lastViewTransitionDuration = duration;
    this.state.viewTransition = { active: false, direction: null };
    this.root.classList.remove('is-transitioning', 'transition-to-map', 'transition-to-ar', 'reduced-motion');
    this.overlay?.classList.remove('active');
    this.onChange();
  }
}
