import test from 'node:test';
import assert from 'node:assert/strict';
import { Flight } from '../src/flight.js';
test('look changes orientation without orbiting or moving the camera', () => {
  const f = new Flight(); const before = { ...f.position }; f.look(100, 50);
  assert.deepEqual(f.position, before); assert.notEqual(f.yaw, 0); assert.notEqual(f.pitch, 0);
});
test('travel follows camera orientation in all three dimensions', () => {
  const f = new Flight(); f.yaw = Math.PI/2; f.move(0,0,5);
  assert.ok(Math.abs(f.position.x + 5) < 1e-8); assert.equal(f.position.z, 26);
  f.pitch = Math.PI/4; f.move(0,0,5); assert.ok(f.position.y > 3);
});
test('strafe, vertical travel and reset are independent of camera zoom', () => {
  const f = new Flight(); f.move(4,3,2); assert.deepEqual(f.position,{x:4,y:3,z:24});
  f.reset(); assert.deepEqual(f.position,{x:0,y:0,z:26}); assert.equal(f.pitch,0);
});
test('pitch and world bounds prevent inverted or lost navigation', () => {
  const f = new Flight(); f.look(0,100000); assert.equal(f.pitch,-1.45);
  f.move(1000,1000,1000); assert.ok(Math.hypot(...Object.values(f.position)) <= 110.00001);
});
test('visits converge and manual input interrupts camera transitions', () => {
  const f = new Flight(); f.visit({x:8,y:1,z:9},{x:8,y:1,z:0},true);
  assert.ok(Math.abs(f.position.x-8)<.001); f.move(1,0,0); assert.equal(f.goal,null);
});
