import test from 'node:test';
import assert from 'node:assert/strict';
import { Orbit } from '../src/orbit.js';
test('drag orbits on a sphere centered on the photograph', () => {
  const orbit = new Orbit(); const before = orbit.position;
  orbit.rotate(100,60); orbit.advance(1,true); const after = orbit.position;
  assert.notEqual(after.x,before.x); assert.notEqual(after.y,before.y);
  assert.ok(Math.abs(Math.hypot(...Object.values(before))-Math.hypot(...Object.values(after)))<1e-8);
});
test('orbit and zoom limits keep the image in front of the camera', () => {
  const o=new Orbit();o.rotate(100000,100000);o.zoom(.0001);o.advance(1,true);
  assert.equal(o.current.yaw,-1.22);assert.equal(o.current.pitch,.48);assert.equal(o.current.zoom,.56);assert.ok(o.position.z>0);
  o.zoom(10000);o.advance(1,true);assert.equal(o.current.zoom,1.48);
});
test('damping converges without overshoot and reset restores every axis', () => {
  const o=new Orbit();o.rotate(-150,-100);o.zoom(.7);
  for(let i=0;i<160;i++)o.advance(1/60);
  assert.deepEqual(o.current,o.target);o.reset();o.advance(1,true);assert.deepEqual(o.current,o.home);
});
test('mobile reframing preserves the chosen orbit and relative zoom', () => {
  const o=new Orbit();o.rotate(80,40);o.zoom(.8);o.advance(1,true);const before={...o.current},distance=o.homeDistance;
  o.resize(390/844);assert.ok(o.homeDistance>distance);assert.deepEqual(o.current,before);
});
