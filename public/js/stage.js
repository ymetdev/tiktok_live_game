// Cutscene stage: one animated character on a podium with an aura disc, drawn into its own canvas (bottom half of the post-match screen).
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { ASSETS } from '/config/assets.js';

export class Stage {
  constructor(canvas, field, { width = 1080, height = 960 } = {}) {
    this.field = field; this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); this.renderer.setPixelRatio(1); this.renderer.setSize(width, height, false); this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 100); this.camera.position.set(0, 3.4, 12.5); this.camera.lookAt(0, 2.7, 0);
    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3550, 1.3)); const sun = new THREE.DirectionalLight(0xfff2dd, 1.8); sun.position.set(-4, 8, 6); this.scene.add(sun);
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.3, 32), new THREE.MeshLambertMaterial({ color: 0x2a3040 })); pod.position.y = -0.15; this.scene.add(pod);
    this.aura = new THREE.Mesh(new THREE.RingGeometry(1.2, 2.3, 48), new THREE.MeshBasicMaterial({ color: 0xffd33d, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })); this.aura.rotation.x = -Math.PI / 2; this.aura.position.y = 0.03; this.scene.add(this.aura);
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.1, 6, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd33d, transparent: true, opacity: 0, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false })); this.beam.position.y = 3; this.scene.add(this.beam);
    this.t = 0; this.model = null; this.flash = 0;
  }
  _clear() { if (this.model) { this.scene.remove(this.model.obj); this.model = null; } }
  // cls: class key; auraColor/auraTier: current aura after the upgrade
  set(cls, team, auraColor, auraTier) {
    this._clear(); const spec = ASSETS.classes[cls] || ASSETS.classes.novice, v = this.field._variant(spec.model, spec.show, team), obj = SkeletonUtils.clone(v.root), mixer = new THREE.AnimationMixer(obj);
    const clip = v.clips.find((c) => c.name === ASSETS.anim.cheer) || v.clips.find((c) => c.name === ASSETS.anim.idle); if (clip) mixer.clipAction(clip).play();
    obj.scale.setScalar(1.9); this.scene.add(obj); this.model = { obj, mixer };
    this.aura.material.color.set(auraColor || '#ffd33d'); this.beam.material.color.set(auraColor || '#ffd33d'); this.tier = auraTier | 0;
  }
  burst() { this.flash = 1; }
  update(dt) {
    this.t += dt; this.flash = Math.max(0, this.flash - dt * 1.6); this.model?.mixer.update(dt); if (this.model) this.model.obj.rotation.y = Math.sin(this.t * 0.9) * 0.5;
    const on = this.tier > 0 ? 0.35 + 0.1 * Math.sin(this.t * 4) : 0; this.aura.material.opacity = on + this.flash * 0.6; this.aura.rotation.z += dt * 0.8; this.beam.material.opacity = (this.tier > 0 ? 0.06 : 0) + this.flash * 0.5; this.beam.scale.set(1 + this.flash * 0.3, 1, 1 + this.flash * 0.3);
  }
  render() { this.renderer.render(this.scene, this.camera); }
  clear() { this._clear(); this.aura.material.opacity = 0; this.beam.material.opacity = 0; this.renderer.clear(); }
}
