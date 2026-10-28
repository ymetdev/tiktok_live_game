// Three.js battlefield renderer: draws a shared-sim Match with KayKit characters.  Pure view code — no game rules in here.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ASSETS } from '/config/assets.js';

const TEAM_HEX = ASSETS.teamColors;

export class Battlefield {
  // opts: { width, height, field:{w,h}, maxDetailed (units with full animation + weapons), antialias }
  constructor(canvas, opts = {}) {
    this.o = { width: 1080, height: 1920, field: { w: 36, h: 64 }, maxDetailed: 160, antialias: false, ...opts };
    const { width, height } = this.o, { w, h } = this.o.field;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.o.antialias, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserveDrawingBuffer });
    this.renderer.setPixelRatio(1); this.renderer.setSize(width, height, false); this.renderer.setClearColor(0x0c1018);
    this.scene = new THREE.Scene(); this.scene.fog = new THREE.Fog(0x0c1018, 90, 170);
    // orthographic camera, tilted: the 64-long field takes ~70% of the 9:16 screen, leaving room for the HUD
    const viewW = w + 8, viewH = viewW * (height / width), el = THREE.MathUtils.degToRad(58), D = 120, cx = w / 2, cz = h / 2 + 1;
    this.camera = new THREE.OrthographicCamera(-viewW / 2, viewW / 2, viewH / 2, -viewH / 2, 1, 400);
    this.camera.position.set(cx, Math.sin(el) * D, cz + Math.cos(el) * D); this.camera.lookAt(cx, 0, cz);
    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3550, 1.15)); const sun = new THREE.DirectionalLight(0xfff2dd, 1.6); sun.position.set(-20, 60, 10); this.scene.add(sun);
    this.templates = new Map(); this.variants = new Map(); this.visuals = new Map(); this.projectiles = []; this.rings = []; this.clock = 0; this.frame = 0; this.stats = { drawCalls: 0, units: 0, detailed: 0 };
    this._buildWorld(); this._buildInstanced(); this._buildPools();
  }

  // ---------- world ----------
  _buildWorld() {
    const { w, h } = this.o.field, S = this.scene;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(w + 24, h + 24), new THREE.MeshLambertMaterial({ color: 0x2f5d3a })); ground.rotation.x = -Math.PI / 2; ground.position.set(w / 2, 0, h / 2); S.add(ground);
    const tex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#2f5d3a'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#356a42'; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set((w + 24) / 4, (h + 24) / 4); t.magFilter = THREE.NearestFilter; return t; })();
    ground.material.map = tex;
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.25), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 })); lane.rotation.x = -Math.PI / 2; lane.position.set(w / 2, 0.02, h / 2); S.add(lane);
    this.bases = {};
    for (const team of ['red', 'blue']) {
      const g = new THREE.Group(), col = TEAM_HEX[team], z = team === 'red' ? 4.5 : h - 4.5, mat = (c) => new THREE.MeshLambertMaterial({ color: c });
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.6, 0.5, 8), mat(0x3b3f4a)); pad.position.y = 0.25; g.add(pad);
      const keep = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 5), mat(0x8b8f9c)); keep.position.y = 3; g.add(keep);
      for (const [dx, dz] of [[-3.2, -3.2], [3.2, -3.2], [-3.2, 3.2], [3.2, 3.2]]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 4.2, 8), mat(0x9a9eab)); t.position.set(dx, 2.6, dz); g.add(t); const cap = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.6, 8), mat(col)); cap.position.set(dx, 5.5, dz); g.add(cap); }
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3, 0.15), mat(0xdddddd)); flag.position.set(0, 7.5, 0); g.add(flag); const cloth = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 0.1), mat(col)); cloth.position.set(1.2, 8.3, 0); g.add(cloth);
      g.position.set(w / 2, 0, z); S.add(g); this.bases[team] = { group: g, keep, hitAt: -9 };
    }
  }
  _buildInstanced() {
    const geo = new THREE.RingGeometry(0.55, 0.78, 20); geo.rotateX(-Math.PI / 2); const cap = 2400, mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false });
    this.ringMesh = new THREE.InstancedMesh(geo, mat, cap); this.ringMesh.frustumCulled = false; this.ringMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); this.ringMesh.count = 0; this.scene.add(this.ringMesh);
    const ag = new THREE.CircleGeometry(1.25, 24); ag.rotateX(-Math.PI / 2); this.auraMesh = new THREE.InstancedMesh(ag, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending }), cap); this.auraMesh.frustumCulled = false; this.auraMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); this.auraMesh.count = 0; this.scene.add(this.auraMesh);
    this._m = new THREE.Matrix4(); this._c = new THREE.Color(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
  }
  _buildPools() {
    const pg = new THREE.SphereGeometry(0.28, 8, 6), pm = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    for (let i = 0; i < 120; i++) { const m = new THREE.Mesh(pg, pm.clone()); m.visible = false; this.scene.add(m); this.projectiles.push({ mesh: m, t: 0, dur: 0.25, a: new THREE.Vector3(), b: new THREE.Vector3(), live: false }); }
    const rg = new THREE.RingGeometry(0.85, 1, 32); rg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); m.visible = false; this.scene.add(m); this.rings.push({ mesh: m, t: 0, dur: 0.6, r: 3, live: false }); }
  }

  // ---------- assets ----------
  async load(onProgress) {
    const loader = new GLTFLoader(), names = Object.keys(ASSETS.models); let done = 0;
    await Promise.all(names.map((n) => loader.loadAsync(ASSETS.base + n + '.glb').then((g) => { this.templates.set(n, g); onProgress?.(++done / names.length); })));
  }
  // One skinned mesh per character (all body parts merged) + only the weapons the class shows -> few draw calls per unit.
  _variant(modelKey, show, team) {
    const key = `${modelKey}|${show.join(',')}|${team}`; let v = this.variants.get(key); if (v) return v;
    const g = this.templates.get(modelKey), def = ASSETS.models[modelKey], root = SkeletonUtils.clone(g.scene), skinned = [], cape = [];
    root.traverse((o) => {
      if (def.props.includes(o.name) && !show.includes(o.name)) o.visible = false;
      if (o.isSkinnedMesh) (o.name === def.cape ? cape : skinned).push(o);
    });
    const attach = (list, mat) => {
      if (!list.length) return; const first = list[0], geos = list.map((m) => { const x = m.geometry.clone(); for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight'].includes(k)) x.deleteAttribute(k); return x; });
      const merged = list.length > 1 ? mergeGeometries(geos) : geos[0], sm = new THREE.SkinnedMesh(merged, mat || first.material); sm.bind(first.skeleton, first.bindMatrix); sm.frustumCulled = false; first.parent.add(sm); for (const m of list) m.parent.remove(m);
    };
    attach(skinned);
    if (cape.length) { const mat = cape[0].material.clone(); mat.color.setHex(TEAM_HEX[team]).lerp(new THREE.Color(0xffffff), 0.35); attach(cape, mat); }
    v = { root, clips: g.animations }; this.variants.set(key, v); return v;
  }
  _spec(u) { return u.bot ? ASSETS.bots[Math.abs(u.id) % ASSETS.bots.length] : ASSETS.classes[u.cls] || ASSETS.classes.novice; }

  // ---------- units ----------
  _create(u) {
    const spec = this._spec(u), v = this._variant(spec.model, spec.show, u.team), obj = SkeletonUtils.clone(v.root), mixer = new THREE.AnimationMixer(obj), act = {};
    const add = (k, name, once) => { const clip = v.clips.find((c) => c.name === name); if (!clip) return; const a = mixer.clipAction(clip); if (once) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; } act[k] = a; };
    add('idle', ASSETS.anim.idle); add('run', ASSETS.anim.run); add('attack', spec.attack, true); add('skill', spec.skill, true); add('hit', ASSETS.anim.hit, true); add('death', ASSETS.anim.death, true); add('cheer', ASSETS.anim.cheer);
    if (act.attack) act.attack.timeScale = 1.6; if (act.hit) act.hit.timeScale = 1.8; if (act.run) act.run.timeScale = 1.1;
    const scale = 1.55 * (1 + (u.evo || 0) * 0.06); obj.scale.setScalar(scale); this.scene.add(obj);
    const vis = { obj, mixer, act, cur: null, lastAtk: -9, lastHit: -9, lastSkill: -9, dead: false, hidden: false, deathAt: 0, rot: 0, tick: Math.floor(Math.random() * 3), props: [] };
    obj.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh) vis.props.push(o); });
    this._play(vis, 'idle'); this.visuals.set(u.id, vis); return vis;
  }
  _play(vis, name, fade = 0.15) { const a = vis.act[name]; if (!a || vis.cur === a) return; a.reset().fadeIn(fade).play(); vis.cur?.fadeOut(fade); vis.cur = a; }
  _once(vis, name) { const a = vis.act[name]; if (!a) return; a.reset().setEffectiveWeight(1).play(); a.fadeIn(0.05); vis.cur?.fadeOut(0.08); vis.cur = a; }

  // match: shared-sim Match. alpha = interpolation 0..1 between the last two sim ticks.
  update(match, dt, alpha = 1) {
    this.clock += dt; this.frame++; const t = match.t, units = match.units; let ringN = 0, auraN = 0, detailed = 0;
    // importance order: units with higher level get full detail first
    const order = this._order && this._order.n === units.length ? this._order.a : (this._order = { n: units.length, a: units.map((u, i) => i).sort((a, b) => units[b].level - units[a].level) }).a;
    const rank = this._rank || (this._rank = new Map()); if (this._order.fresh !== units.length) { this._order.fresh = units.length; order.forEach((idx, r) => rank.set(units[idx].id, r)); }
    for (const u of units) {
      const vis = this.visuals.get(u.id) || this._create(u), full = (rank.get(u.id) ?? 0) < this.o.maxDetailed; if (full) detailed++;
      if (u.dead) {
        if (!vis.dead) { vis.dead = true; vis.deathAt = this.clock; this._once(vis, 'death'); }
        if (this.clock - vis.deathAt > 1.6 && !vis.hidden) { vis.obj.visible = false; vis.hidden = true; }
        vis.mixer.update(dt); continue;
      }
      if (vis.dead) { vis.dead = false; vis.hidden = false; vis.obj.visible = true; vis.cur = null; this._play(vis, 'idle', 0.01); }
      let x = u.px + (u.x - u.px) * alpha, z = u.py + (u.y - u.py) * alpha; if (Math.abs(u.x - u.px) > 4 || Math.abs(u.y - u.py) > 4) { x = u.x; z = u.y; }
      vis.obj.position.set(x, 0, z);
      const tgt = Math.atan2(u.hx, u.hy); let d = tgt - vis.rot; d = Math.atan2(Math.sin(d), Math.cos(d)); vis.rot += d * Math.min(1, dt * 12); vis.obj.rotation.y = vis.rot;
      if (u.skillAt > vis.lastSkill) { vis.lastSkill = u.skillAt; this._once(vis, 'skill'); }
      else if (u.atkAt > vis.lastAtk && u.atkAt >= t - 0.12) { vis.lastAtk = u.atkAt; this._once(vis, 'attack'); }
      else if (!vis.cur || vis.cur.loop === THREE.LoopOnce ? !vis.cur?.isRunning() : true) this._play(vis, u.moving ? 'run' : 'idle');
      if (u.hitAt > vis.lastHit && u.hitAt >= t - 0.1) { vis.lastHit = u.hitAt; if (full && !vis.cur?.isRunning?.()) this._once(vis, 'hit'); }
      // animation cost control: far/low-rank units update their mixer every 3rd frame
      if (full || (this.frame + vis.tick) % 3 === 0) vis.mixer.update(full ? dt : dt * 3);
      for (const p of vis.props) p.visible = full ? p.visible : false; // weapons only on detailed units (cheap LOD)
      // team ring + aura (instanced)
      if (ringN < this.ringMesh.instanceMatrix.count) { this._v.set(x, 0.05, z); this._m.compose(this._v, this._q.identity(), this._s); this.ringMesh.setMatrixAt(ringN, this._m); this._c.setHex(TEAM_HEX[u.team]); this.ringMesh.setColorAt(ringN, this._c); ringN++; }
      if (u.auraTier > 0 && auraN < this.auraMesh.instanceMatrix.count) { const sc = 0.9 + u.auraTier * 0.16 + Math.sin(this.clock * 3 + u.id) * 0.05; this._v.set(x, 0.04, z); this._m.compose(this._v, this._q.identity(), this._s.set(sc, 1, sc)); this._s.set(1, 1, 1); this.auraMesh.setMatrixAt(auraN, this._m); this._c.set(u.auraColor || '#ffd33d'); this.auraMesh.setColorAt(auraN, this._c); auraN++; }
    }
    this.ringMesh.count = ringN; this.ringMesh.instanceMatrix.needsUpdate = true; if (this.ringMesh.instanceColor) this.ringMesh.instanceColor.needsUpdate = true;
    this.auraMesh.count = auraN; this.auraMesh.instanceMatrix.needsUpdate = true; if (this.auraMesh.instanceColor) this.auraMesh.instanceColor.needsUpdate = true;
    // bases: flash when hit, shrink the keep as HP drops
    for (const team of ['red', 'blue']) { const b = match.bases[team], v = this.bases[team], f = Math.max(0.35, b.hp / b.maxHp); v.keep.scale.y = 0.4 + 0.6 * f; v.keep.position.y = 0.5 + 2.5 * (0.4 + 0.6 * f); v.keep.material.emissive?.setHex(match.t - (b.hitAt || -9) < 0.15 ? 0x663322 : 0); }
    this._fx(dt); this.stats = { units: units.length, detailed };
  }
  onEvents(events, match) {
    const by = (id) => match.units.find((u) => u.id === id);
    for (const e of events) {
      if (e.k === 'atk') {
        if (e.ranged && typeof e.to === 'number') { const a = by(e.from), b = by(e.to); if (a && b) this._shot(a, b); }
        if (typeof e.to === 'string' && e.to.startsWith('base:')) { const t = e.to.slice(5); this.bases[t].hitAt = match.t; match.bases[t].hitAt = match.t; }
      } else if (e.k === 'skill') {
        const col = { guard: 0x9ad0ff, volley: 0xaef08a, meteor: 0xc58bff, dash: 0xffb3b3 }[e.kind] || 0xffffff; this._ring(e.kind === 'meteor' ? e.tx : e.x, e.kind === 'meteor' ? e.ty : e.y, e.kind === 'meteor' ? 4.5 : 2.2, col);
      }
    }
  }
  _shot(a, b) { const p = this.projectiles.find((q) => !q.live); if (!p) return; p.live = true; p.t = 0; p.dur = 0.22; p.a.set(a.x, 1.6, a.y); p.b.set(b.x, 1.4, b.y); p.mesh.visible = true; p.mesh.material.color.setHex(a.cls === 'mage' ? 0xc58bff : 0xffe9a8); }
  _ring(x, z, r, col) { const q = this.rings.find((y) => !y.live); if (!q) return; q.live = true; q.t = 0; q.r = r; q.mesh.position.set(x, 0.1, z); q.mesh.material.color.setHex(col); q.mesh.visible = true; }
  _fx(dt) {
    for (const p of this.projectiles) if (p.live) { p.t += dt; const k = Math.min(1, p.t / p.dur); p.mesh.position.lerpVectors(p.a, p.b, k); if (k >= 1) { p.live = false; p.mesh.visible = false; } }
    for (const q of this.rings) if (q.live) { q.t += dt; const k = Math.min(1, q.t / q.dur); q.mesh.scale.setScalar(0.3 + q.r * k); q.mesh.material.opacity = (1 - k) * 0.8; if (k >= 1) { q.live = false; q.mesh.visible = false; } }
  }
  resetUnits() { for (const v of this.visuals.values()) { this.scene.remove(v.obj); } this.visuals.clear(); this._order = null; this._rank = null; }
  render() { this.renderer.render(this.scene, this.camera); this.stats.drawCalls = this.renderer.info.render.calls; }
  dispose() { this.resetUnits(); this.renderer.dispose(); }
}
