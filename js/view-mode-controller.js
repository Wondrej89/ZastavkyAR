export function cameraDownAngle(beta, gamma) {
  if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return null;
  const downness = Math.cos(beta * Math.PI / 180) * Math.cos(gamma * Math.PI / 180);
  return Math.acos(Math.max(-1, Math.min(1, downness))) * 180 / Math.PI;
}

export class ViewModeController {
  constructor({ config, getMode, isEnabled, isPaused, enterMap, exitMap, now = () => performance.now() }) {
    Object.assign(this, { config, getMode, isEnabled, isPaused, enterMap, exitMap, now });
    this.angle = null; this.enterSince = null; this.exitSince = null;
  }
  update(beta, gamma) {
    this.angle = cameraDownAngle(beta, gamma);
    return this.evaluate();
  }
  evaluate() {
    const time = this.now(), mode = this.getMode();
    if (!this.isEnabled() || this.isPaused() || this.angle === null) { this.resetTimers(); return mode; }
    if (mode === 'ar') {
      this.exitSince = null;
      if (this.angle <= this.config.mapEnterAngleDeg) {
        this.enterSince ??= time;
        if (time - this.enterSince >= this.config.mapEnterDwellMs) { this.resetTimers(); this.enterMap(); return 'map'; }
      } else this.enterSince = null;
    } else {
      this.enterSince = null;
      if (this.angle >= this.config.mapExitAngleDeg) {
        this.exitSince ??= time;
        if (time - this.exitSince >= this.config.mapExitDwellMs) { this.resetTimers(); this.exitMap(); return 'ar'; }
      } else this.exitSince = null;
    }
    return mode;
  }
  resetTimers() { this.enterSince = this.exitSince = null; }
  diagnostics() { return { angle: this.angle, enterSince: this.enterSince, exitSince: this.exitSince }; }
}
