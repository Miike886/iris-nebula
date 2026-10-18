import { clamp } from './math.js';

// Positions are world coordinates. Looking never changes position; moving follows
// the camera basis, with no orbit target and no simulated image scaling.
export class Flight {
  constructor(z = 26) { this.homeZ = z; this.reset(); }
  reset() { this.position = { x: 0, y: 0, z: this.homeZ }; this.yaw = 0; this.pitch = 0; this.goal = null; }
  look(dx, dy) { this.goal = null; this.yaw -= dx * .0035; this.pitch = clamp(this.pitch - dy * .0035, -1.45, 1.45); }
  move(right, up, forward) {
    this.goal = null;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw), sp = Math.sin(this.pitch), cp = Math.cos(this.pitch);
    this.position.x += cy * right - sy * cp * forward + sy * sp * up;
    this.position.y += sp * forward + cp * up;
    this.position.z += -sy * right - cy * cp * forward + cy * sp * up;
    const distance = Math.hypot(this.position.x, this.position.y, this.position.z);
    if (distance > 110) for (const axis of ['x','y','z']) this.position[axis] *= 110 / distance;
  }
  visit(position, target, immediate = false) {
    const dx = target.x - position.x, dy = target.y - position.y, dz = target.z - position.z;
    let yaw = Math.atan2(-dx, -dz);
    yaw = this.yaw + Math.atan2(Math.sin(yaw - this.yaw), Math.cos(yaw - this.yaw));
    this.goal = { ...position, yaw, pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
    if (immediate) this.advance(10);
  }
  advance(dt) {
    if (!this.goal) return false;
    const a = 1 - Math.exp(-dt * 2.8);
    for (const axis of ['x','y','z']) this.position[axis] += (this.goal[axis] - this.position[axis]) * a;
    this.yaw += (this.goal.yaw - this.yaw) * a;
    this.pitch += (this.goal.pitch - this.pitch) * a;
    if (Math.hypot(this.position.x-this.goal.x,this.position.y-this.goal.y,this.position.z-this.goal.z) < .005) this.goal = null;
    return true;
  }
}
