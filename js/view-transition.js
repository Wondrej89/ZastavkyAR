export class ViewTransition {
  constructor({ root, mapLayer, state, config, now = () => Date.now(), setTimer = setTimeout,
    reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true, canStart = () => true,
    onComplete = () => {}, onChange = () => {} }) {
    Object.assign(this, { root, mapLayer, state, config, now, setTimer, reducedMotion, canStart, onComplete, onChange });
  }

  start(direction) {
    const time = this.now();
    if (!this.canStart() || this.state.viewTransition.active || time < this.state.viewTransitionLockedUntil) return false;
    if ((direction === 'to-map' && this.state.viewMode === 'map') || (direction === 'to-ar' && this.state.viewMode === 'ar')) return false;
    const reduced = this.reducedMotion();
    const duration = reduced ? 1 : this.config.viewTransitionMs;
    this.state.viewTransition = { active: true, direction };
    this.state.viewTransitionLockedUntil = time + this.config.viewTransitionLockMs;
    this.mapLayer.classList.remove('hidden');
    this.root.classList.remove('transition-to-map', 'transition-to-ar');
    this.root.classList.add('is-transitioning', `transition-${direction}`, ...(reduced ? ['reduced-motion'] : []));
    this.onChange();
    this.setTimer(() => this.finish(direction, duration), duration);
    return true;
  }

  finish(direction, duration = this.config.viewTransitionMs) {
    if (!this.state.viewTransition.active || this.state.viewTransition.direction !== direction) return;
    const mode = direction === 'to-map' ? 'map' : 'ar';
    this.state.viewMode = mode;
    this.state.lastViewTransitionDuration = duration;
    this.state.viewTransition = { active: false, direction: null };
    this.root.classList.remove('is-transitioning', 'transition-to-map', 'transition-to-ar', 'reduced-motion', 'is-map-mode', 'is-ar-mode');
    this.root.classList.add(`is-${mode}-mode`);
    if (mode === 'ar') this.mapLayer.classList.add('hidden');
    this.onComplete(mode);
    this.onChange();
  }
}
