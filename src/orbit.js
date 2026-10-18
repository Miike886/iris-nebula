import { clamp } from './math.js';

// Spherical camera coordinates around a fixed origin; no panning or free flight.
export class Orbit {
  constructor(aspect = 1.6) {
    this.home = { yaw: .13, pitch: .09, zoom: 1 };
    this.current = { ...this.home };
    this.target = { ...this.home };
    this.resize(aspect);
  }
  resize(aspect) {
    const fill = aspect < .8 ? .94 : .81;
    const verticalFov = 42 * Math.PI / 180;
    this.homeDistance = Math.max(aspect>1.9?32:23, 16 / (Math.tan(verticalFov / 2) * aspect * fill));
  }
  rotate(dx, dy) {
    this.target.yaw = clamp(this.target.yaw - dx * .004, -1.22, 1.22);
    this.target.pitch = clamp(this.target.pitch + dy * .0035, -.48, .48);
  }
  zoom(factor) { this.target.zoom = clamp(this.target.zoom * factor, .56, 1.48); }
  reset() { this.target = { ...this.home }; }
  stop() { this.target = { ...this.current }; }
  advance(dt, immediate = false) {
    const alpha = immediate ? 1 : 1 - Math.exp(-dt * 12);
    let moving = false;
    for (const key of ['yaw', 'pitch', 'zoom']) {
      this.current[key] += (this.target[key] - this.current[key]) * alpha;
      if (Math.abs(this.target[key] - this.current[key]) < .00005) this.current[key] = this.target[key];
      else moving = true;
    }
    return moving;
  }
  get position() {
    const {yaw, pitch, zoom} = this.current;
    const r = this.homeDistance * zoom;
    return {x:r*Math.sin(yaw)*Math.cos(pitch), y:r*Math.sin(pitch), z:r*Math.cos(yaw)*Math.cos(pitch)};
  }
}
