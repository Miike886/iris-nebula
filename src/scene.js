import { clamp, mix, materialWeights, randomGenerator, zoomAt } from './math.js';

// A single sampled photograph supplies every point, glyph, color and wisp.
// Canvas 2D is the renderer on all devices: no GPU/WebGL dependency or remote assets.
export class IrisScene {
  constructor(canvas, onChange) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    if (!this.ctx) throw new Error('Canvas 2D no está disponible.');
    this.onChange = onChange;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.paused = this.reduced;
    this.current = { x: 0, y: 0, zoom: 1, material: .38 };
    this.target = { ...this.current };
    this.pointer = { x: -10000, y: -10000, strength: 0, active: false };
    this.pointers = new Map();
    this.ripples = [];
    this.time = 0;
    this.dirty = true;
    this.ready = false;
    this.frame = 0;
    this.last = 0;
    this.lastPaint = 0;
    this.listeners = new AbortController();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    this.bindEvents();
    this.resize();
  }

  async load(url) {
    const img = new Image();
    img.src = url;
    await img.decode();
    this.image = img;
    this.prepareImage();
    this.makeMatter();
    this.ready = true;
    this.invalidate();
    this.notify();
  }

  prepareImage() {
    // Detect the photograph's lit band, excluding the original black letterbox.
    const probe = document.createElement('canvas');
    probe.width = 96; probe.height = Math.round(96 * this.image.height / this.image.width);
    const context = probe.getContext('2d', { willReadFrequently: true });
    context.drawImage(this.image, 0, 0, probe.width, probe.height);
    const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
    let top = probe.height, bottom = 0;
    for (let y = 0; y < probe.height; y++) {
      let light = 0;
      for (let x = 0; x < probe.width; x++) { const k = (y * probe.width + x) * 4; light += pixels[k] + pixels[k + 1] + pixels[k + 2]; }
      if (light / (probe.width * 3) > 19) { top = Math.min(top, y); bottom = y; }
    }
    if (bottom <= top) { top = 0; bottom = probe.height - 1; }
    this.crop = { y: top / probe.height * this.image.height, h: (bottom - top + 1) / probe.height * this.image.height };
    this.aspect = this.crop.h / this.image.width;
    this.texture = document.createElement('canvas');
    this.texture.width = Math.min(1280, this.image.width);
    this.texture.height = Math.round(this.texture.width * this.aspect);
    const tc = this.texture.getContext('2d');
    tc.drawImage(this.image, 0, this.crop.y, this.image.width, this.crop.h, 0, 0, this.texture.width, this.texture.height);
    // Feather the actual pixels into the field instead of presenting a rectangular photo.
    tc.globalCompositeOperation = 'destination-in';
    const vertical = tc.createLinearGradient(0, 0, 0, this.texture.height);
    vertical.addColorStop(0, 'transparent'); vertical.addColorStop(.18, '#000');
    vertical.addColorStop(.72, '#000'); vertical.addColorStop(1, 'transparent');
    tc.fillStyle = vertical; tc.fillRect(0, 0, this.texture.width, this.texture.height);
    const horizontal = tc.createLinearGradient(0, 0, this.texture.width, 0);
    horizontal.addColorStop(0, 'transparent'); horizontal.addColorStop(.15, '#000');
    horizontal.addColorStop(.85, '#000'); horizontal.addColorStop(1, 'transparent');
    tc.fillStyle = horizontal; tc.fillRect(0, 0, this.texture.width, this.texture.height);
    this.glow = document.createElement('canvas'); this.glow.width = this.glow.height = 128;
    const gc = this.glow.getContext('2d'); const gradient = gc.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, '#c58c6640'); gradient.addColorStop(.3, '#9767471a'); gradient.addColorStop(1, '#97674700');
    gc.fillStyle = gradient; gc.fillRect(0, 0, 128, 128);
  }

  makeMatter() {
    if (!this.image) return;
    const random = randomGenerator();
    const sample = document.createElement('canvas');
    sample.width = this.mobile ? 150 : 236;
    sample.height = Math.round(sample.width * this.aspect);
    const sc = sample.getContext('2d', { willReadFrequently: true });
    sc.drawImage(this.image, 0, this.crop.y, this.image.width, this.crop.h, 0, 0, sample.width, sample.height);
    const data = sc.getImageData(0, 0, sample.width, sample.height).data;
    this.points = [];
    this.dust = [];
    const chars = ' .·:+*ox%#@';
    this.atlas = document.createElement('canvas'); this.atlas.width = 32 * chars.length; this.atlas.height = 32 * 12;
    const ac = this.atlas.getContext('2d'); ac.font = '23px monospace'; ac.textAlign = 'center'; ac.textBaseline = 'middle';
    for (let tone = 0; tone < 12; tone++) {
      ac.fillStyle = `rgb(${115 + tone * 12},${102 + tone * 10},${81 + tone * 9})`;
      for (let c = 0; c < chars.length; c++) ac.fillText(chars[c], c * 32 + 16, tone * 32 + 16);
    }
    for (let y = 0; y < sample.height; y++) {
      for (let x = 0; x < sample.width; x++) {
        const k = (y * sample.width + x) * 4;
        const r = data[k], g = data[k + 1], b = data[k + 2];
        const luminance = (.2126 * r + .7152 * g + .0722 * b) / 255;
        const px = (x + .5) / sample.width - .5, py = ((y + .5) / sample.height - .5) * this.aspect;
        const edge = Math.pow(Math.abs(py) / (this.aspect / 2), 3);
        const fade = Math.min(1, (1 - Math.abs(px) * 2) * 6) * Math.min(1, (1 - Math.abs(py) * 2 / this.aspect) * 6);
        const salt = random(), phase = random() * Math.PI * 2;
        const tone = Math.min(11, Math.floor(luminance * 15));
        const char = Math.min(chars.length - 1, Math.floor(luminance * (chars.length + 2)));
        this.points.push({ x: px, y: py, r, g, b, luminance, edge, fade, salt, phase, tone, char,
          color: `rgb(${Math.round(r * .8 + 45)},${Math.round(g * .85 + 30)},${Math.round(b * .85 + 21)})` });
        if (salt < .16 && luminance > .12) {
          const spread = random();
          this.dust.push({ x: px * (1 + spread * .65), y: py + (random() - .5) * .4,
            phase, size: random() * 1.25 + .3, color: `rgb(${Math.min(255,r+65)},${Math.min(255,g+53)},${Math.min(255,b+40)})`, alpha: .12 + random() * .5,
            depth: .5 + random() * 1.4, char, tone });
        }
      }
    }
    this.stars = Array.from({ length: this.mobile ? 110 : 230 }, () => ({ x: random(), y: random(), size: random() < .08 ? 1.3 : .55, alpha: .1 + random() * .35, depth: random() }));
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.width = rect.width; this.height = rect.height;
    const previousMobile = this.mobile;
    this.mobile = this.width <= 700;
    this.dpr = Math.min(devicePixelRatio || 1, this.mobile ? 1.5 : 1.75);
    this.canvas.width = Math.round(this.width * this.dpr); this.canvas.height = Math.round(this.height * this.dpr);
    this.baseWidth = this.mobile ? this.width * 1.36 : Math.min(this.width * .84, 1400);
    this.center = { x: this.width / 2, y: this.height * (this.mobile ? .48 : .505) };
    if (this.height < 550 && this.width > this.height) this.center.y = this.height * .49;
    if (this.ready && previousMobile !== this.mobile) this.makeMatter();
    this.constrain();
    this.invalidate();
  }

  constrain() {
    this.target.x = clamp(this.target.x, -this.baseWidth * this.target.zoom * .43, this.baseWidth * this.target.zoom * .43);
    this.target.y = clamp(this.target.y, -this.height * .4 * this.target.zoom, this.height * .4 * this.target.zoom);
  }
  zoom(factor, anchor = this.center) {
    Object.assign(this.target, zoomAt(this.target, this.target.zoom * factor, anchor, this.center));
    this.constrain(); this.invalidate(); this.notify();
  }
  setMaterial(value) { this.target.material = clamp(value, 0, 2); this.invalidate(); this.notify(); }
  reset() { Object.assign(this.target, { x: 0, y: 0, zoom: 1, material: .38 }); this.ripples = []; this.pointer.active = false; this.pointer.strength = 0; this.invalidate(); this.notify(); }
  setPaused(paused) { this.paused = paused; this.ripples = []; this.pointer.strength = 0; this.invalidate(); this.notify(); }
  notify() { this.onChange?.({ ...this.target, paused: this.paused, reduced: this.reduced }); }
  invalidate() { this.dirty = true; if (!this.frame && !document.hidden) this.frame = requestAnimationFrame(t => this.tick(t)); }

  bindEvents() {
    const options = { signal: this.listeners.signal };
    const local = event => { const rect = this.canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };
    this.canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      this.canvas.setPointerCapture(event.pointerId);
      this.canvas.focus({ preventScroll: true });
      const point = local(event); this.pointers.set(event.pointerId, point);
      Object.assign(this.pointer, point, { active: true });
      if (!this.paused && !this.reduced) {
        this.ripples.push({ x: point.x, y: point.y, born: this.time });
        if (this.ripples.length > 4) this.ripples.shift();
      }
      this.invalidate();
    }, options);
    this.canvas.addEventListener('pointermove', event => {
      const point = local(event), previous = this.pointers.get(event.pointerId);
      Object.assign(this.pointer, point, { active: true });
      if (previous) {
        if (this.pointers.size === 2) {
          const other = [...this.pointers.entries()].find(([id]) => id !== event.pointerId)[1];
          const oldDistance = Math.hypot(previous.x - other.x, previous.y - other.y);
          const distance = Math.hypot(point.x - other.x, point.y - other.y);
          if (oldDistance > 10) this.zoom(distance / oldDistance, { x: (point.x + other.x) / 2, y: (point.y + other.y) / 2 });
          this.target.x += (point.x - previous.x) / 2; this.target.y += (point.y - previous.y) / 2;
        } else { this.target.x += point.x - previous.x; this.target.y += point.y - previous.y; }
        this.pointers.set(event.pointerId, point); this.constrain();
      }
      this.invalidate();
    }, options);
    const release = event => { this.pointers.delete(event.pointerId); if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId); if (event.pointerType !== 'mouse') this.pointer.active = false; this.invalidate(); };
    this.canvas.addEventListener('pointerup', release, options);
    this.canvas.addEventListener('pointercancel', release, options);
    this.canvas.addEventListener('lostpointercapture', event => { this.pointers.delete(event.pointerId); }, options);
    this.canvas.addEventListener('pointerleave', () => { this.pointer.active = false; this.invalidate(); }, options);
    this.canvas.addEventListener('wheel', event => { event.preventDefault(); const dy = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.height : 1); this.zoom(Math.exp(-clamp(dy, -180, 180) * .0018), local(event)); }, { ...options, passive: false });
    this.canvas.addEventListener('keydown', event => {
      const key = event.key.toLowerCase();
      if (!['arrowleft','arrowright','arrowup','arrowdown','+','=','-','r','0',' '].includes(key)) return;
      event.preventDefault();
      if (key === 'arrowleft') this.target.x += 45;
      if (key === 'arrowright') this.target.x -= 45;
      if (key === 'arrowup') this.target.y += 45;
      if (key === 'arrowdown') this.target.y -= 45;
      if (key === '+' || key === '=') this.zoom(1.2);
      if (key === '-') this.zoom(1 / 1.2);
      if (key === 'r' || key === '0') this.reset();
      if (key === ' ') this.setPaused(!this.paused);
      this.constrain(); this.invalidate();
    }, options);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { cancelAnimationFrame(this.frame); this.frame = 0; this.last = 0; }
      else this.invalidate();
    }, options);
    this.motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
    this.motionQuery.addEventListener('change', event => { this.reduced = event.matches; if (event.matches) this.setPaused(true); else { this.invalidate(); this.notify(); } }, options);
  }

  tick(now) {
    this.frame = 0;
    if (document.hidden || !this.ready) return;
    // 30 fps bounds CPU cost; pause is truly demand-driven, with no hidden idle loop.
    if (now - this.lastPaint < 30 && !this.dirty) { this.frame = requestAnimationFrame(t => this.tick(t)); return; }
    const dt = this.last ? Math.min((now - this.last) / 1000, .05) : .033;
    this.last = now; this.lastPaint = now;
    if (!this.paused && !this.reduced) this.time += dt;
    const easing = this.paused || this.reduced ? 1 : 1 - Math.exp(-dt * 11);
    let moving = false;
    for (const key of ['x', 'y', 'zoom', 'material']) {
      this.current[key] = mix(this.current[key], this.target[key], easing);
      if (Math.abs(this.current[key] - this.target[key]) < .0001) this.current[key] = this.target[key];
      else moving = true;
    }
    const strength = this.pointer.active ? 1 : 0;
    this.pointer.strength = mix(this.pointer.strength, strength, easing);
    if (Math.abs(this.pointer.strength - strength) < .001) this.pointer.strength = strength;
    this.ripples = this.ripples.filter(r => this.time - r.born < 2.4);
    this.draw(); this.dirty = false;
    if ((!this.paused && !this.reduced) || moving) this.frame = requestAnimationFrame(t => this.tick(t));
  }

  drawTexture(ctx, cx, cy, size, alpha) {
    if (alpha < .005) return;
    const height = size * this.aspect;
    ctx.globalAlpha = alpha;
    // Narrow strips share the field's ripple; texture remains part of the matter.
    const strips = 42;
    for (let i = 0; i < strips; i++) {
      const x = cx + (i / strips - .5) * size;
      let offset = 0;
      for (const ripple of this.ripples) {
        const age = this.time - ripple.born;
        const d = Math.hypot(x - ripple.x, cy - ripple.y);
        const front = d - age * 240;
        offset += Math.sin(front * .035) * Math.exp(-Math.pow(front / 80, 2)) * 14 * Math.exp(-age);
      }
      ctx.drawImage(this.texture, i / strips * this.texture.width, 0, this.texture.width / strips, this.texture.height,
        x, cy - height / 2 + offset, size / strips + .7, height);
    }
  }

  draw() {
    const ctx = this.ctx, w = this.width, h = this.height, t = this.time;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#090b0c'; ctx.fillRect(0, 0, w, h);
    const { x, y, zoom, material } = this.current;
    const weights = materialWeights(material);
    const cx = this.center.x + x, cy = this.center.y + y;
    const size = this.baseWidth * zoom;
    const pointer = this.pointer;
    // Quiet background, with camera-linked depth rather than independent random motion.
    ctx.fillStyle = '#c0c8bd';
    for (const star of this.stars) {
      ctx.globalAlpha = star.alpha;
      const sx = ((star.x * w + x * star.depth * .1) % w + w) % w;
      const sy = ((star.y * h + y * star.depth * .1) % h + h) % h;
      ctx.fillRect(sx, sy, star.size, star.size);
    }
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 7; i++) {
      const radius = size * (.27 + (i % 3) * .065);
      ctx.globalAlpha = .38 - weights.photo * .18;
      ctx.drawImage(this.glow, cx + (i / 6 - .5) * size * .8 - radius / 2, cy + Math.sin(i * 2.4) * size * .07 - radius / 2, radius, radius);
    }
    ctx.globalCompositeOperation = 'source-over';
    const textureAlpha = .16 * weights.particles + .035 * weights.ascii + weights.photo;
    this.drawTexture(ctx, cx, cy, size, textureAlpha);
    // In any material, hovering uncovers a small piece of its photographic origin.
    if (pointer.strength > .01 && weights.photo < .9) {
      ctx.save(); ctx.beginPath(); ctx.arc(pointer.x, pointer.y, this.mobile ? 48 : 73, 0, Math.PI * 2); ctx.clip();
      this.drawTexture(ctx, cx, cy, size, pointer.strength * .35); ctx.restore();
    }
    const particleAlpha = weights.particles + weights.ascii * .1 + weights.photo * .035;
    const glyphAlpha = weights.ascii;
    const cell = size / (this.mobile ? 150 : 236);
    const driftScale = Math.max(.12, 1 - weights.photo);
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      if (p.fade < .01) continue;
      // Dark pixels remain dark, preserving pupils and lashes at every scale.
      const warp = p.edge * .035 * driftScale;
      let px = cx + (p.x + Math.sin(p.phase + t * .15) * warp) * size;
      let py = cy + (p.y + Math.cos(p.phase + t * .12) * warp * .8) * size;
      if (px < -30 || px > w + 30 || py < -30 || py > h + 30) continue;
      const dx = px - pointer.x, dy = py - pointer.y, distance2 = dx * dx + dy * dy;
      const influence = this.mobile ? 95 : 125;
      if (pointer.strength > .01 && distance2 < influence * influence) {
        const d = Math.sqrt(distance2) || 1;
        const force = Math.pow(1 - d / influence, 2) * 38 * pointer.strength * driftScale;
        px += dx / d * force; py += dy / d * force;
      }
      for (const ripple of this.ripples) {
        const age = t - ripple.born, rx = px - ripple.x, ry = py - ripple.y;
        const distance = Math.hypot(rx, ry) || 1, front = distance - age * 240;
        if (Math.abs(front) < 130) { const force = Math.sin(front * .035) * Math.exp(-Math.pow(front / 65, 2)) * 22 * Math.exp(-age); px += rx / distance * force; py += ry / distance * force; }
      }
      if (particleAlpha > .01) {
        ctx.globalAlpha = p.fade * particleAlpha * (.3 + p.luminance * .7);
        ctx.fillStyle = p.color;
        const dot = Math.max(.65, cell * (.16 + p.luminance * .3) * (p.salt * .7 + .7));
        ctx.fillRect(px - dot / 2, py - dot / 2, dot, dot);
      }
      if (glyphAlpha > .015 && i % 2 === 0) {
        ctx.globalAlpha = p.fade * glyphAlpha * (.22 + p.luminance * .8);
        const glyphSize = Math.max(3.5, cell * 1.55);
        ctx.drawImage(this.atlas, p.char * 32, p.tone * 32, 32, 32, px - glyphSize / 2, py - glyphSize / 2, glyphSize, glyphSize);
      }
    }
    // Loosened image fragments carry their source color and character into the void.
    const dustAlpha = 1 - weights.photo * .68;
    for (let i = 0; i < this.dust.length; i++) {
      const p = this.dust[i];
      let px = cx + (p.x + Math.sin(t * .07 + p.phase) * .012) * size;
      let py = cy + (p.y + Math.cos(t * .06 + p.phase) * .016) * size;
      const dx = px - pointer.x, dy = py - pointer.y, d = Math.hypot(dx, dy);
      if (d < 140 && d > 0) { const force = (1 - d / 140) * 32 * pointer.strength; px += dx / d * force; py += dy / d * force; }
      if (px < 0 || px > w || py < 0 || py > h) continue;
      ctx.globalAlpha = p.alpha * dustAlpha; ctx.fillStyle = p.color;
      const dot = p.size * Math.min(zoom, 2);
      if (i % 13 === 0) {
        const gs = clamp(9 * zoom, 7, 22); ctx.globalAlpha *= .75;
        ctx.drawImage(this.atlas, p.char * 32, p.tone * 32, 32, 32, px, py, gs, gs);
      } else ctx.fillRect(px, py, dot, dot);
    }
    ctx.globalAlpha = 1;
  }
  destroy() { cancelAnimationFrame(this.frame); this.resizeObserver.disconnect(); this.listeners.abort(); }
}
