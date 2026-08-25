// viewer.js — scene, camera, the two modes, and the walkthrough controls.
//
// Dollhouse: orbit around the model, floors toggleable, roof hidden.
// Walkthrough: eye-height camera, WASD + pointer-lock mouse-look, collision
// against the wall colliders that build.js hands back.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const EYE_HEIGHT = 1.65;
const WALK_SPEED = 3.2;      // m/s
const BODY_RADIUS = 0.28;

export class Viewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf3f0ea);

    this.orbitCam = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    this.orbitCam.position.set(18, 16, 18);
    this.walkCam = new THREE.PerspectiveCamera(72, 1, 0.05, 200);

    this.orbit = new OrbitControls(this.orbitCam, canvas);
    this.orbit.enableDamping = true;
    this.orbit.maxPolarAngle = Math.PI / 2.05;

    this.mode = 'dollhouse';
    this.colliders = [];
    this.keys = new Set();
    this.yaw = 0;
    this.pitch = 0;
    this.walkLevel = 'ground';
    this.levelElevation = 0;
    this._clock = new THREE.Clock();

    this._addLights();
    this._bindInput();
  }

  _addLights() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9a8f80, 1.5));
    this.sun = new THREE.DirectionalLight(0xfff4e0, 1.6);
    this.sun.position.set(-22, 30, 18);
    this.scene.add(this.sun);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 160),
      new THREE.MeshLambertMaterial({ color: 0xdfe3d6 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.16;
    this.scene.add(ground);
  }

  setModel({ root, levels, roof, colliders }) {
    if (this.model) this.scene.remove(this.model);
    this.model = root;
    this.levelGroups = levels;
    this.roofGroup = roof;
    this.colliders = colliders;
    this.scene.add(root);
  }

  setLevelVisible(id, visible) {
    const g = this.levelGroups?.get(id);
    if (g) g.visible = visible;
  }

  setRoofVisible(visible) {
    if (this.roofGroup) this.roofGroup.visible = visible;
  }

  get camera() { return this.mode === 'walk' ? this.walkCam : this.orbitCam; }

  setMode(mode) {
    this.mode = mode;
    this.orbit.enabled = mode === 'dollhouse';
    if (mode === 'walk') this.spawn(this._spawnX ?? 4.94, this._spawnY ?? 0.75, this.levelElevation, this.walkLevel);
    else if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  /** Drop the walker into the middle of the named level. */
  spawn(x = 4.94, y = 0.75, elevation = 0, level = 'ground') {
    this.levelElevation = elevation;
    this.walkLevel = level;
    this._spawnX = x;
    this._spawnY = y;
    this._setPlan(x, y);
    this.walkCam.position.y = elevation + EYE_HEIGHT;
    this.yaw = Math.PI;
    this.pitch = 0;
  }

  _bindInput() {
    const onKey = (e, down) => {
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        if (this.mode === 'walk') e.preventDefault();
        if (down) this.keys.add(k); else this.keys.delete(k);
      }
    };
    window.addEventListener('keydown', (e) => onKey(e, true));
    window.addEventListener('keyup', (e) => onKey(e, false));
    window.addEventListener('blur', () => this.keys.clear());

    this.canvas.addEventListener('click', () => {
      if (this.mode === 'walk' && document.pointerLockElement !== this.canvas) {
        this.canvas.requestPointerLock();
      }
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== this.canvas) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch -= e.movementY * 0.0022;
      this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch));
    });
  }

  /** Nudge a proposed plan-space position out of any wall it lands inside. */
  _resolve(px, py) {
    for (const c of this.colliders) {
      if (c.level !== this.walkLevel) continue;
      const minX = c.minX - BODY_RADIUS;
      const maxX = c.maxX + BODY_RADIUS;
      const minY = c.minY - BODY_RADIUS;
      const maxY = c.maxY + BODY_RADIUS;
      if (px < minX || px > maxX || py < minY || py > maxY) continue;

      // A doorway in this wall lets the walker through. Distance is measured
      // from the wall's own start point, which is not always the min corner.
      const along = c.origin
        ? Math.hypot(px - c.origin[0], py - c.origin[1])
        : (c.horizontal ? px - c.minX : py - c.minY);
      const through = (c.doorways ?? []).some(
        (o) => along > o.start + 0.12 && along < o.end - 0.12,
      );
      if (through && !c.solid) continue;

      // Push out along the shallower overlap.
      const dx = Math.min(px - minX, maxX - px);
      const dy = Math.min(py - minY, maxY - py);
      if (dx < dy) px = (px - minX < maxX - px) ? minX : maxX;
      else py = (py - minY < maxY - py) ? minY : maxY;
    }
    return [px, py];
  }

  _stepWalk(dt) {
    const speed = WALK_SPEED * (this.keys.has('shift') ? 1.9 : 1) * dt;
    let fwd = 0;
    let strafe = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) fwd += 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) fwd -= 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) strafe -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) strafe += 1;

    this.walkCam.rotation.set(0, 0, 0);
    this.walkCam.rotateY(this.yaw);
    this.walkCam.rotateX(this.pitch);

    if (fwd || strafe) {
      const len = Math.hypot(fwd, strafe);
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      // Desired step in WORLD space, from where the camera is looking.
      const dxW = ((-sin * fwd) + (cos * strafe)) / len * speed;
      const dzW = ((-cos * fwd) - (sin * strafe)) / len * speed;
      const [px, py] = this._toPlan(
        this.walkCam.position.x + dxW,
        this.walkCam.position.z + dzW,
      );
      const [nx, ny] = this._resolve(px, py);
      this._setPlan(nx, ny);
    }
    this.walkCam.position.y = this.levelElevation + EYE_HEIGHT;
  }

  /** World (x, z) -> plan (x, y), undoing the model's true-north rotation. */
  _toPlan(x, z) {
    const t = this.model ? this.model.rotation.y : 0;
    const c = Math.cos(-t);
    const s = Math.sin(-t);
    return [(x * c) + (z * s), -((-x * s) + (z * c))];
  }

  /** Plan (x, y) -> world, and write it onto the walk camera. */
  _setPlan(px, py) {
    const t = this.model ? this.model.rotation.y : 0;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const z = -py;
    this.walkCam.position.x = (px * c) + (z * s);
    this.walkCam.position.z = (-px * s) + (z * c);
  }

  resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    for (const cam of [this.orbitCam, this.walkCam]) {
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
  }

  start() {
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      const dt = Math.min(this._clock.getDelta(), 0.1);
      this.resize();
      if (this.mode === 'walk') this._stepWalk(dt);
      else this.orbit.update();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  stop() { cancelAnimationFrame(this._raf); }
}
