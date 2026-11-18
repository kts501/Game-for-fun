import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createProceduralTextures, type ProceduralTextureSet } from './textures';
import { ProceduralAudio } from './audio';
import {
  buildEnemyActor,
  buildFirstPersonRig,
  createSharedEntityAssets,
  HUMANOID_VARIANTS,
  type EnemyActor,
  type SharedEntityAssets,
} from './entities';
import { buildTajCourtyardWorld, type WorldHandles } from './world';
import type {
  ClimbableZone,
  CompassMarker,
  EnemyKind,
  GamePhase,
  HandPose,
  HudState,
  WeaponKind,
} from './types';

// Pre-allocated scratch math helpers (zero per-frame GC)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _cSkyDusk = new THREE.Color(0xc29248);
const _cSkyNight = new THREE.Color(0x090e1b);
const _cFogDusk = new THREE.Color(0xc89548);
const _cFogNight = new THREE.Color(0x0a1020);
const _cKeyDusk = new THREE.Color(0xffc66d);
const _cKeyNight = new THREE.Color(0xc2d8ff);
const _cHemiSkyDusk = new THREE.Color(0xffcf7a);
const _cHemiSkyNight = new THREE.Color(0x5b7db8);
const _cLerp = new THREE.Color();
const _sunDirDusk = new THREE.Vector3(-0.62, 0.25, -0.74).normalize();

const VIKRAM_CALLOUTS = {
  intro: 'Havildar Vikram: "Dusk is falling over Agra. Grab all 3 GRE Antizin crates before Nightfall—watch the rooftops!"',
  safehouse: 'Havildar Vikram: "Inside the Taj UV Gate. Catch your breath—my M16 covers the perimeter."',
  crateOne: 'Havildar Vikram: "One Antizin crate secured! Two left—use the wooden ramps to reach the bazaar roofs."',
  crateTwo: 'Havildar Vikram: "Two down, one left! Watch for Hazmat Guards with red tanks—they blow sky high."',
  allCrates: 'Havildar Vikram: "All 3 Antizin crates recovered! Bring them back to the Taj UV Safe House Gate!"',
  takedown: 'Havildar Vikram: "Massive shockwave! That 5x takedown cleared the whole pack."',
};

interface ActiveVfxRing {
  mesh: THREE.Mesh;
  age: number;
  maxAge: number;
  maxScale: number;
}

interface ActiveTracer {
  line: THREE.Line;
  age: number;
}

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class AgraNightfallEngine {
  private container: HTMLElement;
  private onHudUpdate: (hud: HudState) => void;
  private onContextError: (msg: string) => void;

  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;

  private hemiLight: THREE.HemisphereLight;
  private keyLight: THREE.DirectionalLight;
  private skyDome: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private sunSprite: THREE.Sprite;

  private textures: ProceduralTextureSet;
  private audio: ProceduralAudio;
  private entityAssets: SharedEntityAssets;
  private world: WorldHandles;

  private fpRig: THREE.Group;
  private rightArm: THREE.Group;
  private leftArm: THREE.Group;
  private leftHandPivot: THREE.Group;
  private rightHandPivot: THREE.Group;
  private dropkickLeg: THREE.Group;
  private pistolMuzzleFlash: THREE.Mesh;
  private setRigWeapon: (w: WeaponKind) => void;
  private updateHandPoses: (leftPose: HandPose, rightPose: HandPose, dt: number, slideKick: number) => void;
  private disposeFpRig: () => void;

  private enemies: EnemyActor[] = [];
  private nextEnemyId = 1;
  private vfxRings: ActiveVfxRing[] = [];
  private tracers: ActiveTracer[] = [];
  private vfxRingGeo: THREE.RingGeometry;

  // Game & Player State
  private phase: GamePhase = 'title';
  private weapon: WeaponKind = 'kukri';
  private playerPos = new THREE.Vector3(0, 0, 22);
  private playerVel = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0.03;
  private grounded = true;
  private eyeHeight = 1.72;
  private currentEyeHeight = 1.72;

  private health = 100;
  private maxHealth = 100;
  private stamina = 100;
  private maxStamina = 100;
  private combo = 0;
  private maxCombo = 0;
  private comboDecayTimer = 0;
  private score = 0;
  private kills = 0;

  // Day/Night & Mission State
  private cycleTime = 0; // 0 = Golden Dusk, progresses smoothly toward 1 = Nightfall
  private spawnTimer = 0;
  private vikramFireTimer = 1.2;
  private vikramFlashTimer = 0;
  private unlockHoldTimer = 0;

  // Parkour, Pistol & Articulated Hand Action Timers
  private slideTimer = 0;
  private vaultTimer = 0;
  private vaultTarget = new THREE.Vector3();
  private dropkickTimer = 0;
  private swingTimer = 0;
  private counterAnimTimer = 0;
  private leftJabTimer = 0;
  private gesturePose: HandPose = 'open';
  private gestureTimer = 0;
  private pistolAmmo = 12;
  private pistolMagSize = 12;
  private pistolReserve = 72;
  private pistolFireTimer = 0;
  private pistolReloadTimer = 0;
  private pistolFlashTimer = 0;
  private slideKick = 0;
  private aimingDownSights = false;
  private takedownTimer = 0;
  private lungeTimer = 0;
  private lungeDir = new THREE.Vector3();
  private activeClimb: ClimbableZone | null = null;
  private climbSoundCooldown = 0;
  private parkourLabel = '';
  private parkourLabelTimer = 0;
  private vikramLine = VIKRAM_CALLOUTS.intro;
  private vikramTimer = 7.5;
  private wasInSafeHouse = false;
  private damageFlash = 0;
  private bobPhase = 0;

  // Input State
  private keys = new Set<string>();
  private pointerLocked = false;
  private frameId = 0;
  private disposed = false;
  private clock = new THREE.Clock();
  private hudAccumulator = 0;

  constructor(
    container: HTMLElement,
    onHudUpdate: (hud: HudState) => void,
    onContextError: (msg: string) => void,
  ) {
    this.container = container;
    this.onHudUpdate = onHudUpdate;
    this.onContextError = onContextError;

    this.isSoftwareGl = detectSoftwareWebGL();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 1.5),
    );
    this.renderer.setSize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight,
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = _cSkyDusk.clone();
    this.scene.fog = new THREE.FogExp2(_cFogDusk.getHex(), 0.0085);

    this.camera = new THREE.PerspectiveCamera(
      76,
      (container.clientWidth || window.innerWidth) /
        Math.max(1, container.clientHeight || window.innerHeight),
      0.1,
      340,
    );
    this.scene.add(this.camera);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.48;
    pmrem.dispose();

    // Golden-Hour Hazy Sky & Moonlit Night Lighting Rig (no purple world fog)
    this.hemiLight = new THREE.HemisphereLight(0xffcf7a, 0x2b241c, 1.05);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xffc66d, 2.45);
    this.keyLight.position.set(-62, 25, -42);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.left = -52;
    this.keyLight.shadow.camera.right = 52;
    this.keyLight.shadow.camera.top = 52;
    this.keyLight.shadow.camera.bottom = -52;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);

    const rimLight = new THREE.DirectionalLight(0xf59e0b, 0.42);
    rimLight.position.set(34, 22, 36);
    this.scene.add(rimLight);

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createProceduralTextures(maxAniso);

    // Procedural Golden-Hour Hazy Sky Dome transitioning smoothly to Nightfall
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uNightT: { value: 0 },
        uSunDir: { value: _sunDirDusk.clone() },
      },
      vertexShader: `
        varying vec3 vLocalDir;
        void main() {
          vLocalDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uNightT;
        uniform vec3 uSunDir;
        varying vec3 vLocalDir;
        void main() {
          vec3 dir = normalize(vLocalDir);
          float h = clamp(dir.y, -0.15, 1.0);
          float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);

          // Golden-hour hazy gradient (warm amber horizon -> dusty ochre-slate zenith)
          vec3 duskHorizon = vec3(0.84, 0.62, 0.28);
          vec3 duskMid = vec3(0.73, 0.56, 0.34);
          vec3 duskZenith = vec3(0.45, 0.41, 0.35);
          vec3 duskCol = mix(duskHorizon, duskMid, smoothstep(-0.02, 0.26, h));
          duskCol = mix(duskCol, duskZenith, smoothstep(0.24, 0.85, h));

          // Intense soft golden sun bloom scatter in upper-left sky
          float sunHalo = pow(sunDot, 5.0) * 0.46 + pow(sunDot, 36.0) * 0.55;
          duskCol += vec3(1.0, 0.84, 0.44) * sunHalo;

          // Moonlit indigo Nightfall gradient
          vec3 nightHorizon = vec3(0.055, 0.085, 0.16);
          vec3 nightZenith = vec3(0.022, 0.036, 0.075);
          vec3 nightCol = mix(nightHorizon, nightZenith, smoothstep(0.0, 0.72, h));

          vec3 finalCol = mix(duskCol, nightCol, uNightT);
          gl_FragColor = vec4(finalCol, 1.0);
        }
      `,
    });
    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(260, 24, 16), this.skyMat);
    this.skyDome.renderOrder = -10;
    this.scene.add(this.skyDome);

    // Soft additive Golden Sun Halo Sprite in upper-left sky
    const sunSpriteMat = new THREE.SpriteMaterial({
      map: this.textures.sunHalo,
      color: 0xffdf88,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.sunSprite = new THREE.Sprite(sunSpriteMat);
    this.sunSprite.scale.set(115, 115, 1);
    this.sunSprite.position.copy(_sunDirDusk).multiplyScalar(210);
    this.scene.add(this.sunSprite);

    this.audio = new ProceduralAudio();
    this.entityAssets = createSharedEntityAssets(this.textures);
    this.world = buildTajCourtyardWorld(this.scene, this.textures, this.isSoftwareGl);
    this.vfxRingGeo = new THREE.RingGeometry(0.6, 1.0, 32);

    const fp = buildFirstPersonRig(this.textures);
    this.fpRig = fp.rig;
    this.rightArm = fp.rightArmGroup;
    this.leftArm = fp.leftArmGroup;
    this.leftHandPivot = fp.leftHandPivot;
    this.rightHandPivot = fp.rightHandPivot;
    this.dropkickLeg = fp.dropkickLeg;
    this.pistolMuzzleFlash = fp.pistolMuzzleFlash;
    this.setRigWeapon = fp.setWeapon;
    this.updateHandPoses = fp.updateHandPoses;
    this.disposeFpRig = fp.dispose;
    this.camera.add(this.fpRig);
    this.fpRig.visible = false;

    if (!this.isSoftwareGl) {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.35, 0.4, 0.85);
      this.composer.addPass(this.bloomPass);
    }

    this.spawnCourtyardInfected(10);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.pushHudState();
    this.startLoop();
  }

  public startGame() {
    if (this.phase === 'gameover' || this.phase === 'victory') {
      this.resetRun();
    }
    this.phase = 'playing';
    this.fpRig.visible = true;
    this.requestLock();
    this.pushHudState();
  }

  public resumeGame() {
    if (this.phase === 'paused' || this.phase === 'radio') {
      this.phase = 'playing';
      this.fpRig.visible = true;
      this.requestLock();
      this.pushHudState();
    }
  }

  public restartGame() {
    this.resetRun();
    this.phase = 'playing';
    this.fpRig.visible = true;
    this.requestLock();
    this.pushHudState();
  }

  public toggleMute(): boolean {
    const next = !this.audio.isMuted();
    this.audio.setMuted(next);
    return next;
  }

  public getWeapon(): WeaponKind {
    return this.weapon;
  }

  private requestLock() {
    const el = this.renderer.domElement;
    if (document.pointerLockElement !== el && el.requestPointerLock) {
      try {
        const res = el.requestPointerLock() as unknown as Promise<void> | undefined;
        if (res && typeof res.catch === 'function') {
          res.catch(() => {
            // Ignore in sandboxed/headless environments
          });
        }
      } catch {
        // Ignore in sandboxed/headless environments
      }
    }
  }

  private resetRun() {
    this.enemies.forEach((e) => this.scene.remove(e.root));
    this.enemies = [];

    this.world.crates.forEach((c) => {
      c.state.collected = false;
      c.beaconMat.color.setHex(0x22d3ee);
      c.beaconRing.visible = true;
    });

    this.playerPos.set(0, 0, 22);
    this.playerVel.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0.03;
    this.grounded = true;
    this.health = this.maxHealth;
    this.stamina = this.maxStamina;
    this.combo = 0;
    this.maxCombo = 0;
    this.score = 0;
    this.kills = 0;
    this.cycleTime = 0;
    this.unlockHoldTimer = 0;
    this.slideTimer = 0;
    this.vaultTimer = 0;
    this.activeClimb = null;
    this.dropkickTimer = 0;
    this.takedownTimer = 0;
    this.leftJabTimer = 0;
    this.gesturePose = 'open';
    this.gestureTimer = 0;
    this.pistolAmmo = this.pistolMagSize;
    this.pistolReserve = 72;
    this.pistolFireTimer = 0;
    this.pistolReloadTimer = 0;
    this.pistolFlashTimer = 0;
    this.pistolMuzzleFlash.visible = false;
    this.slideKick = 0;
    this.aimingDownSights = false;
    this.damageFlash = 0;
    this.vikramLine = VIKRAM_CALLOUTS.intro;
    this.vikramTimer = 7.5;

    this.spawnCourtyardInfected(10);
  }

  private spawnCourtyardInfected(count: number) {
    const roster: EnemyKind[] = [
      'agra_biter',
      'viral_runner',
      'hazmat_guard',
      'riot_brute',
      'hound',
      ...HUMANOID_VARIANTS.map((v) => v.id),
    ];

    for (let i = 0; i < count; i++) {
      const kind = roster[(this.nextEnemyId + i) % roster.length];
      const actor = buildEnemyActor(this.nextEnemyId++, kind, this.entityAssets);

      const angle = ((this.nextEnemyId * 1.7 + i) % 12) * ((Math.PI * 2) / 12);
      const dist = 16 + (i % 4) * 7;
      let sx = Math.cos(angle) * dist;
      let sz = Math.sin(angle) * dist + 4;

      // Keep clear of Taj UV Safe House perimeter
      const dxSh = sx - this.world.safeHouseCenter.x;
      const dzSh = sz - this.world.safeHouseCenter.z;
      const dSh = Math.hypot(dxSh, dzSh);
      if (dSh < this.world.safeHouseRadius + 4) {
        sx = this.world.safeHouseCenter.x + (dxSh / Math.max(0.1, dSh)) * (this.world.safeHouseRadius + 6);
        sz = this.world.safeHouseCenter.z + (dzSh / Math.max(0.1, dSh)) * (this.world.safeHouseRadius + 6);
      }

      actor.root.position.set(
        THREE.MathUtils.clamp(sx, -46, 46),
        0,
        THREE.MathUtils.clamp(sz, -34, 48),
      );
      this.scene.add(actor.root);
      this.enemies.push(actor);
    }
  }

  private setVikramCallout(line: string, duration = 6.0) {
    this.vikramLine = line;
    this.vikramTimer = duration;
  }

  private setParkourLabel(label: string) {
    this.parkourLabel = label;
    this.parkourLabelTimer = 1.05;
  }

  private spawnShockwaveRing(pos: THREE.Vector3, colorHex: number, maxScale: number) {
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.vfxRingGeo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(pos.x, pos.y + 0.2, pos.z);
    this.scene.add(mesh);
    this.vfxRings.push({ mesh, age: 0, maxAge: 0.45, maxScale });
  }

  private spawnBulletTracer(from: THREE.Vector3, to: THREE.Vector3) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, age: 0 });
  }

  private bindEvents() {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    window.addEventListener('wheel', this.handleWheel, { passive: true });
    window.addEventListener('contextmenu', this.handleContextMenu);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored);
  }

  private handleContextLost = (e: Event) => {
    e.preventDefault();
    this.onContextError('WebGL rendering context interrupted. Recovering...');
  };

  private handleContextRestored = () => {
    this.onContextError('');
  };

  private handleResize = () => {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) this.composer.setSize(w, h);
    if (this.bloomPass) this.bloomPass.resolution.set(w, h);
  };

  private handlePointerLockChange = () => {
    const locked = document.pointerLockElement === this.renderer.domElement;
    this.pointerLocked = locked;
    if (!locked && this.phase === 'playing') {
      this.phase = 'paused';
      this.keys.clear();
      this.pushHudState();
    }
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (this.phase !== 'playing') return;
    if (!this.pointerLocked && e.buttons !== 1) return;
    const sens = 0.0022;
    this.yaw -= e.movementX * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * sens, -1.35, 1.35);
  };

  private handleContextMenu = (e: MouseEvent) => {
    if (this.phase === 'playing') {
      e.preventDefault();
    }
  };

  private handleMouseDown = (e: MouseEvent) => {
    if (this.phase !== 'playing') return;
    if (!this.pointerLocked) {
      this.requestLock();
    }
    if (e.button === 0) {
      if (!this.grounded && this.dropkickTimer <= 0 && this.stamina >= 18) {
        this.triggerDropkick();
      } else if (this.weapon === 'pistol') {
        this.triggerPistolShot();
      } else {
        this.triggerMeleeStrike();
      }
    } else if (e.button === 2) {
      const hasAttacker = this.enemies.some(
        (en) => !en.dead && en.windupTimer > 0 && en.root.position.distanceTo(this.playerPos) < 4.6,
      );
      if (hasAttacker || this.weapon !== 'pistol') {
        this.triggerCounter();
      } else {
        this.aimingDownSights = true;
      }
    }
  };

  private handleMouseUp = (e: MouseEvent) => {
    if (e.button === 2) {
      this.aimingDownSights = false;
    }
  };

  private handleWheel = (e: WheelEvent) => {
    if (this.phase !== 'playing') return;
    const order: WeaponKind[] = ['kukri', 'pipe', 'pistol'];
    const idx = order.indexOf(this.weapon);
    const next = order[(idx + (e.deltaY > 0 ? 1 : order.length - 1)) % order.length];
    this.switchWeapon(next);
  };

  private switchWeapon(next: WeaponKind) {
    if (this.weapon === next) return;
    this.weapon = next;
    this.aimingDownSights = false;
    this.pistolReloadTimer = 0;
    this.setRigWeapon(next);
    const label =
      next === 'kukri' ? 'EQUIP: SERRATED KUKRI' : next === 'pipe' ? 'EQUIP: IRON PIPE' : 'EQUIP: TACTICAL PISTOL';
    this.setParkourLabel(label);
    this.pushHudState();
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (this.phase === 'radio' && e.code === 'Escape') {
      e.preventDefault();
      this.resumeGame();
      return;
    }
    if (this.phase !== 'playing') return;
    const code = e.code;
    this.keys.add(code);

    if (code === 'Digit1') {
      this.switchWeapon('kukri');
    } else if (code === 'Digit2') {
      this.switchWeapon('pipe');
    } else if (code === 'Digit3') {
      this.switchWeapon('pistol');
    } else if (code === 'Space') {
      e.preventDefault();
      this.tryJumpVaultOrMantle();
    } else if (code === 'KeyC' || code === 'ControlLeft') {
      this.trySlide();
    } else if (code === 'KeyF') {
      this.triggerDropkick();
    } else if (code === 'KeyV') {
      this.triggerLeftFistJab();
    } else if (code === 'KeyG') {
      this.cycleHandGesture();
    } else if (code === 'KeyE') {
      if (this.activeClimb) {
        this.activeClimb = null;
        this.setParkourLabel('DISMOUNT');
        this.pushHudState();
        return;
      }
      // Priority: 1. Watchtower Radio if close, 2. Interactable Climbable, 3. Counter
      const nearCrate = this.getNearestUncollectedCrate(3.4);
      const nearTower = this.isNearWatchtower();
      const nearClimb = this.getNearestClimbable();
      if (!nearCrate && nearTower) {
        this.openVikramRadio();
      } else if (!nearCrate && nearClimb) {
        this.activeClimb = nearClimb;
        this.playerVel.set(0, 0, 0);
        this.playerPos.y = Math.max(this.playerPos.y, nearClimb.yMin + 0.15);
        this.audio.playParkour();
        this.setParkourLabel(`CLIMBING · ${nearClimb.label.toUpperCase()}`);
        this.pushHudState();
      } else if (!nearCrate) {
        this.triggerCounter();
      }
    } else if (code === 'KeyR') {
      if (this.combo >= 5) {
        this.triggerHeavyTakedown();
      } else if (this.weapon === 'pistol') {
        this.startPistolReload();
      }
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    if (e.code === 'KeyE') {
      this.unlockHoldTimer = 0;
    }
  };

  private openVikramRadio() {
    this.phase = 'radio';
    this.keys.clear();
    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }
    this.pushHudState();
  }

  private getNearestUncollectedCrate(maxDist: number) {
    for (const c of this.world.crates) {
      if (c.state.collected) continue;
      const d = Math.hypot(c.state.x - this.playerPos.x, c.state.z - this.playerPos.z);
      const dy = Math.abs(c.state.y - this.playerPos.y);
      if (d <= maxDist && dy <= 2.2) return c;
    }
    return null;
  }

  private getNearestClimbable(): ClimbableZone | null {
    let best: ClimbableZone | null = null;
    let bestDist = Infinity;
    for (const c of this.world.climbables) {
      const d = Math.hypot(c.x - this.playerPos.x, c.z - this.playerPos.z);
      if (
        d <= c.radius &&
        this.playerPos.y >= c.yMin - 0.9 &&
        this.playerPos.y <= c.yMax + 0.5 &&
        d < bestDist
      ) {
        bestDist = d;
        best = c;
      }
    }
    return best;
  }

  private isNearWatchtower(): boolean {
    const d = Math.hypot(
      this.world.watchtowerPos.x - this.playerPos.x,
      this.world.watchtowerPos.z - this.playerPos.z,
    );
    return d <= 9.5;
  }

  private getForwardVector(out: THREE.Vector3): THREE.Vector3 {
    out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
    return out;
  }

  private tryJumpVaultOrMantle() {
    if (this.activeClimb) {
      const c = this.activeClimb;
      if (this.playerPos.y >= c.yMax - 1.6) {
        this.vaultTimer = 0.28;
        this.vaultTarget.set(c.exitX, c.yMax, c.exitZ);
        this.activeClimb = null;
        this.audio.playParkour();
        this.setParkourLabel('SUMMIT MANTLE');
      } else {
        this.activeClimb = null;
        this.playerVel.y = 6.8;
        this.grounded = false;
        this.audio.playParkour();
        this.setParkourLabel('LADDER LEAP');
      }
      return;
    }
    if (this.vaultTimer > 0) return;

    this.getForwardVector(_forward);
    const probeX = this.playerPos.x + _forward.x * 1.45;
    const probeZ = this.playerPos.z + _forward.z * 1.45;

    for (const obs of this.world.obstacles) {
      const withinX = Math.abs(probeX - obs.x) <= obs.halfW + 0.65;
      const withinZ = Math.abs(probeZ - obs.z) <= obs.halfD + 0.65;
      if (!withinX || !withinZ) continue;

      if (obs.vaultable && this.playerPos.y < obs.height + 0.4) {
        this.vaultTimer = 0.32;
        this.vaultTarget.set(
          this.playerPos.x + _forward.x * 2.5,
          0,
          this.playerPos.z + _forward.z * 2.5,
        );
        this.audio.playParkour();
        this.setParkourLabel('VAULT');
        return;
      }

      if (obs.mantleable && this.playerPos.y >= obs.height - 2.3 && this.playerPos.y < obs.height) {
        this.vaultTimer = 0.36;
        this.vaultTarget.set(
          THREE.MathUtils.clamp(probeX, obs.x - obs.halfW + 0.5, obs.x + obs.halfW - 0.5),
          obs.height,
          THREE.MathUtils.clamp(probeZ, obs.z - obs.halfD + 0.5, obs.z + obs.halfD - 0.5),
        );
        this.audio.playParkour();
        this.setParkourLabel('LEDGE MANTLE');
        return;
      }
    }

    if (this.grounded) {
      this.playerVel.y = 7.4;
      this.grounded = false;
      this.audio.playParkour();
    }
  }

  private trySlide() {
    if (!this.grounded || this.slideTimer > 0 || this.stamina < 14) return;
    const moving =
      this.keys.has('KeyW') || this.keys.has('KeyA') || this.keys.has('KeyS') || this.keys.has('KeyD');
    if (!moving) return;

    this.stamina = Math.max(0, this.stamina - 14);
    this.slideTimer = 0.52;
    this.audio.playParkour();
    this.setParkourLabel('SLIDE');
  }

  private triggerDropkick() {
    if (this.dropkickTimer > 0 || this.stamina < 18) return;
    this.stamina = Math.max(0, this.stamina - 18);
    this.dropkickTimer = 0.48;
    if (this.grounded) {
      this.playerVel.y = 4.6;
      this.grounded = false;
    }
    this.getForwardVector(_forward);
    this.lungeTimer = 0.25;
    this.lungeDir.copy(_forward).multiplyScalar(14);
    this.audio.playSwing();
    this.setParkourLabel('DROPKICK');

    const target = this.findNearestTarget(3.6, 0.35);
    if (target) {
      this.applyDamageToEnemy(target, 48, 12, true);
    }
  }

  private findNearestTarget(maxDist: number, minDot: number): EnemyActor | null {
    this.getForwardVector(_forward);
    let best: EnemyActor | null = null;
    let bestScore = Infinity;

    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      _v1.subVectors(enemy.root.position, this.playerPos);
      _v1.y = 0;
      const dist = _v1.length();
      if (dist > maxDist || dist < 0.01) continue;
      _v1.divideScalar(dist);
      const dot = _v1.dot(_forward);
      if (dot < minDot) continue;
      const weighted = dist - dot * 1.4;
      if (weighted < bestScore) {
        bestScore = weighted;
        best = enemy;
      }
    }
    return best;
  }

  private triggerMeleeStrike() {
    const cooldown = this.weapon === 'kukri' ? 0.3 : 0.38;
    if (this.swingTimer > 0 || this.takedownTimer > 0) return;
    this.swingTimer = cooldown;
    this.audio.playSwing();

    const target = this.findNearestTarget(4.8, 0.45);
    if (target) {
      _v1.subVectors(target.root.position, this.playerPos);
      _v1.y = 0;
      const dist = _v1.length();
      if (dist > 1.35) {
        _v1.divideScalar(dist);
        this.lungeTimer = 0.16;
        this.lungeDir.copy(_v1).multiplyScalar(Math.min(13, (dist - 1.1) * 7.5));
      }
      const baseDmg = this.weapon === 'kukri' ? 35 : 30;
      const kb = this.weapon === 'pipe' ? 7.0 : 4.2;
      this.applyDamageToEnemy(target, baseDmg + Math.min(24, this.combo * 3), kb, this.weapon === 'pipe');
    }
  }

  private triggerCounter() {
    if (this.counterAnimTimer > 0) return;
    let attacker: EnemyActor | null = null;
    let bestDist = 4.6;
    for (const enemy of this.enemies) {
      if (enemy.dead || enemy.windupTimer <= 0) continue;
      const d = enemy.root.position.distanceTo(this.playerPos);
      if (d < bestDist) {
        bestDist = d;
        attacker = enemy;
      }
    }

    this.counterAnimTimer = 0.34;
    if (attacker) {
      attacker.windupTimer = 0;
      attacker.counterIcon.visible = false;
      attacker.staggerTimer = 1.6;
      this.audio.playCounter();
      this.setParkourLabel('COUNTER PARRY');
      this.applyDamageToEnemy(attacker, 46, 8.0, true);

      for (const other of this.enemies) {
        if (other !== attacker && !other.dead && other.root.position.distanceTo(this.playerPos) < 3.6) {
          other.staggerTimer = 1.15;
          other.windupTimer = 0;
          other.counterIcon.visible = false;
        }
      }
    } else {
      this.audio.playSwing();
    }
  }

  private startPistolReload() {
    if (this.pistolReloadTimer > 0 || this.pistolAmmo >= this.pistolMagSize || this.pistolReserve <= 0) {
      return;
    }
    this.pistolReloadTimer = 1.05;
    this.aimingDownSights = false;
    this.audio.playParkour();
    this.setParkourLabel('RELOADING 9MM');
  }

  private triggerPistolShot() {
    if (this.pistolFireTimer > 0 || this.pistolReloadTimer > 0 || this.takedownTimer > 0) return;
    if (this.pistolAmmo <= 0) {
      this.startPistolReload();
      return;
    }

    this.pistolAmmo -= 1;
    this.pistolFireTimer = 0.21;
    this.pistolFlashTimer = 0.055;
    this.slideKick = 1.0;
    this.pistolMuzzleFlash.visible = true;
    this.audio.playGunshot();

    // Camera-aligned ray check against zombies up to 48m (supports headshots & Hazmat tank bursts)
    this.camera.getWorldDirection(_forward);
    let bestEnemy: EnemyActor | null = null;
    let bestDist = 48.0;
    let isHeadshot = false;

    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      const isHound = enemy.kind === 'hound';
      _v1.copy(enemy.root.position);
      _v1.y += isHound ? 0.55 : 1.15;
      _v2.subVectors(_v1, this.camera.position);
      const proj = _v2.dot(_forward);
      if (proj < 0.8 || proj > bestDist) continue;
      const perpSq = _v2.lengthSq() - proj * proj;
      const hitRadius = enemy.radius + (this.aimingDownSights ? 0.34 : 0.42);
      if (perpSq <= hitRadius * hitRadius) {
        bestDist = proj;
        bestEnemy = enemy;
        const headY = enemy.root.position.y + (isHound ? 0.68 : 1.55);
        const rayY = this.camera.position.y + _forward.y * proj;
        isHeadshot = Math.abs(rayY - headY) < 0.42;
      }
    }

    const muzzleWorld = new THREE.Vector3();
    this.pistolMuzzleFlash.getWorldPosition(muzzleWorld);
    const hitPoint = bestEnemy
      ? new THREE.Vector3(
          bestEnemy.root.position.x,
          bestEnemy.root.position.y + (isHeadshot ? 1.55 : 1.12),
          bestEnemy.root.position.z,
        )
      : this.camera.position.clone().addScaledVector(_forward, 36);
    this.spawnBulletTracer(muzzleWorld, hitPoint);

    if (bestEnemy) {
      const dmg = isHeadshot ? 58 : 34;
      this.applyDamageToEnemy(bestEnemy, dmg, 4.5, isHeadshot);
      if (isHeadshot) {
        this.setParkourLabel('HEADSHOT');
      }
    }

    if (this.pistolAmmo === 0 && this.pistolReserve > 0) {
      this.startPistolReload();
    }
  }

  private triggerLeftFistJab() {
    if (this.leftJabTimer > 0 || this.counterAnimTimer > 0) return;
    this.leftJabTimer = 0.34;
    this.gesturePose = 'fist';
    this.gestureTimer = 0.42;
    this.audio.playSwing();
    this.setParkourLabel('FIST JAB');

    const target = this.findNearestTarget(2.8, 0.35);
    if (target) {
      target.staggerTimer = Math.max(target.staggerTimer, 1.35);
      this.applyDamageToEnemy(target, 24, 7.5, true);
    }
  }

  private cycleHandGesture() {
    const order: HandPose[] = ['point', 'peace', 'thumbsUp', 'fist', 'open'];
    const idx = order.indexOf(this.gesturePose);
    const next = order[(idx + 1) % order.length];
    this.gesturePose = next;
    this.gestureTimer = next === 'open' ? 0 : 2.2;
    this.audio.playParkour();
    const labelMap: Record<HandPose, string> = {
      point: 'SIGNAL · POINT',
      peace: 'GESTURE · PEACE SIGN',
      thumbsUp: 'SIGNAL · THUMBS UP',
      fist: 'STANCE · CLENCHED FIST',
      open: 'STANCE · OPEN HAND',
      gripMelee: 'GRIP',
      gripPistol: 'GRIP',
    };
    this.setParkourLabel(labelMap[next]);
  }

  private triggerHeavyTakedown() {
    // Requirement 2: [R] Heavy Takedown shockwave at 5x combo
    if (this.combo < 5 || this.takedownTimer > 0) return;
    const target = this.findNearestTarget(5.8, 0.2);
    if (!target) return;

    this.takedownTimer = 0.48;
    this.combo = Math.max(0, this.combo - 5);
    this.gesturePose = 'thumbsUp';
    this.gestureTimer = 1.4;
    this.audio.playTakedown();
    this.setParkourLabel('HEAVY TAKEDOWN SHOCKWAVE');
    this.setVikramCallout(VIKRAM_CALLOUTS.takedown, 4.5);

    _v1.subVectors(target.root.position, this.playerPos);
    _v1.y = 0;
    const dist = _v1.length();
    if (dist > 1.2) {
      _v1.divideScalar(Math.max(0.01, dist));
      this.lungeTimer = 0.2;
      this.lungeDir.copy(_v1).multiplyScalar(Math.min(18, dist * 5));
    }

    // Shockwave burst at target location damaging/staggering nearby zombies
    this.spawnShockwaveRing(target.root.position, 0xfbbf24, 4.8);
    for (const other of this.enemies) {
      if (other.dead || other === target) continue;
      const d = other.root.position.distanceTo(target.root.position);
      if (d <= 4.8) {
        this.applyDamageToEnemy(other, 55, 11, true, false);
      }
    }

    this.applyDamageToEnemy(target, 999, 10, true, true);
    this.health = Math.min(this.maxHealth, this.health + 24);
    this.stamina = Math.min(this.maxStamina, this.stamina + 35);
    this.score += 200;
  }

  private detonateHazmatTank(hazmat: EnemyActor) {
    this.audio.playExplosion();
    this.spawnShockwaveRing(hazmat.root.position, 0xef4444, 4.4);
    this.setParkourLabel('HAZMAT TANK BLAST');

    for (const other of this.enemies) {
      if (other.dead || other === hazmat) continue;
      const d = other.root.position.distanceTo(hazmat.root.position);
      if (d <= 4.4) {
        this.applyDamageToEnemy(other, 70, 12, true, false);
      }
    }
  }

  private applyDamageToEnemy(
    enemy: EnemyActor,
    amount: number,
    knockback: number,
    heavy: boolean,
    countCombo = true,
  ) {
    enemy.hp -= amount;
    enemy.hitFlashTimer = 0.16;
    enemy.windupTimer = 0;
    enemy.counterIcon.visible = false;
    enemy.staggerTimer = Math.max(enemy.staggerTimer, heavy ? 0.85 : 0.32);

    _v2.subVectors(enemy.root.position, this.playerPos).setY(0).normalize();
    enemy.velocity.addScaledVector(_v2, knockback);

    if (countCombo) {
      this.combo += 1;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.comboDecayTimer = 4.4;
      this.score += (heavy ? 45 : 25) * Math.min(5, 1 + Math.floor(this.combo / 3));
    }
    this.audio.playImpact(heavy);

    if (enemy.hp <= 0 && !enemy.dead) {
      enemy.dead = true;
      enemy.deathTimer = 0.75;
      this.kills += 1;
      this.score += enemy.kind === 'hound' ? 120 : 100;
      if (enemy.hasExplosiveTank) {
        this.detonateHazmatTank(enemy);
      }
    }
  }

  private startLoop() {
    const tick = () => {
      if (this.disposed) return;
      const dt = Math.min(0.05, this.clock.getDelta());
      const elapsed = this.clock.elapsedTime;

      this.updateAtmosphere(dt, elapsed);
      this.updateVfx(dt);

      if (this.phase === 'title') {
        const angle = elapsed * 0.12;
        this.camera.position.set(
          Math.sin(angle) * 30,
          7.2 + Math.sin(elapsed * 0.35) * 0.6,
          12 + Math.cos(angle) * 22,
        );
        this.camera.lookAt(0, 9.0, -34);
      } else if (this.phase === 'playing') {
        this.updatePlayer(dt);
        this.updateCrates(dt, elapsed);
        this.updateVikramOverwatch(dt);
        this.updateEnemies(dt, elapsed);
        this.updateFirstPersonRig(dt);
      }

      if (this.composer && !this.isSoftwareGl) {
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }

      this.hudAccumulator += dt;
      if (this.hudAccumulator >= 0.045) {
        this.hudAccumulator = 0;
        this.pushHudState();
      }

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.frameId = window.setTimeout(tick, 16);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private updateAtmosphere(dt: number, elapsed: number) {
    // Requirement 1: Golden Dusk -> Dark Moonlit Nightfall Cycle (no purple world fog)
    if (this.phase === 'playing') {
      this.cycleTime = Math.min(1, this.cycleTime + dt / 95);
    }
    const t = THREE.MathUtils.smoothstep(this.cycleTime, 0.15, 0.85);

    _cLerp.copy(_cSkyDusk).lerp(_cSkyNight, t);
    (this.scene.background as THREE.Color).copy(_cLerp);

    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(_cFogDusk).lerp(_cFogNight, t);
      this.scene.fog.density = THREE.MathUtils.lerp(0.0092, 0.0112, t);
    }

    // Keep Sky Dome & Sun Halo anchored around camera horizon
    this.skyDome.position.copy(this.camera.position);
    this.skyMat.uniforms.uNightT.value = t;
    this.sunSprite.position
      .copy(_sunDirDusk)
      .multiplyScalar(210)
      .add(this.camera.position);
    this.sunSprite.material.opacity = Math.max(0, 0.92 * (1 - t * 1.15));
    this.sunSprite.visible = this.sunSprite.material.opacity > 0.02;

    this.keyLight.color.copy(_cKeyDusk).lerp(_cKeyNight, t);
    this.keyLight.intensity = THREE.MathUtils.lerp(2.45, 1.65, t);
    this.keyLight.position.set(
      THREE.MathUtils.lerp(-62, 28, t),
      THREE.MathUtils.lerp(25, 54, t),
      THREE.MathUtils.lerp(-42, 22, t),
    );

    this.hemiLight.color.copy(_cHemiSkyDusk).lerp(_cHemiSkyNight, t);
    this.hemiLight.intensity = THREE.MathUtils.lerp(1.05, 0.68, t);

    // Animate reflective Charbagh water pool, Al-Kawthar ripples & fountain jets
    this.textures.waterNormal.offset.y = (elapsed * 0.038) % 1;
    this.textures.waterNormal.offset.x = Math.sin(elapsed * 0.28) * 0.04;
    this.world.fountainJets.forEach((jet, idx) => {
      jet.scale.y = 0.9 + Math.sin(elapsed * 7 + idx) * 0.14;
    });
    this.world.rippleRings.forEach((ring) => {
      const phase = ((elapsed * 0.45 + Number(ring.userData?.phase ?? 0)) % 1);
      const s = 0.8 + phase * 2.5;
      ring.scale.set(s, s, 1);
      (ring.material as THREE.MeshBasicMaterial).opacity = (1 - phase) * 0.42;
    });
    this.world.headlightMats.forEach((mat, idx) => {
      const flicker = Math.sin(elapsed * (17 + idx * 5)) * Math.cos(elapsed * 7.3) > -0.35 ? 1 : 0.18;
      mat.color.setRGB(1.0 * flicker, 0.92 * flicker, 0.72 * flicker);
    });

    const uvMat = this.world.uvBarrierMesh.material as THREE.MeshStandardMaterial;
    uvMat.opacity = 0.14 + Math.sin(elapsed * 2.4) * 0.03;

    if (this.vikramTimer > 0) this.vikramTimer = Math.max(0, this.vikramTimer - dt);
    if (this.parkourLabelTimer > 0) {
      this.parkourLabelTimer = Math.max(0, this.parkourLabelTimer - dt);
      if (this.parkourLabelTimer === 0) this.parkourLabel = '';
    }
    if (this.damageFlash > 0) this.damageFlash = Math.max(0, this.damageFlash - dt * 2.5);
  }

  private updateVfx(dt: number) {
    for (let i = this.vfxRings.length - 1; i >= 0; i--) {
      const r = this.vfxRings[i];
      r.age += dt;
      const p = Math.min(1, r.age / r.maxAge);
      const s = 0.5 + p * r.maxScale;
      r.mesh.scale.set(s, s, 1);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.85;
      if (r.age >= r.maxAge) {
        this.scene.remove(r.mesh);
        (r.mesh.material as THREE.Material).dispose();
        this.vfxRings.splice(i, 1);
      }
    }

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.age += dt;
      if (tr.age >= 0.08) {
        this.scene.remove(tr.line);
        tr.line.geometry.dispose();
        (tr.line.material as THREE.Material).dispose();
        this.tracers.splice(i, 1);
      }
    }
  }

  private updateCrates(dt: number, elapsed: number) {
    // Pulse GRE beacon rings
    for (const c of this.world.crates) {
      if (!c.state.collected) {
        const s = 0.92 + Math.sin(elapsed * 4.5) * 0.12;
        c.beaconRing.scale.set(s, s, 1);
      }
    }

    const near = this.getNearestUncollectedCrate(3.4);
    if (near && this.keys.has('KeyE')) {
      this.unlockHoldTimer += dt;
      if (this.unlockHoldTimer >= 2.5) {
        this.unlockHoldTimer = 0;
        near.state.collected = true;
        near.beaconMat.color.setHex(0x22c55e);
        near.beaconRing.visible = false;
        this.audio.playCrateUnlock();
        this.score += 350;
        this.pistolReserve = Math.min(96, this.pistolReserve + 24);
        this.gesturePose = 'thumbsUp';
        this.gestureTimer = 1.8;

        const collectedCount = this.world.crates.filter((c) => c.state.collected).length;
        if (collectedCount === 1) {
          this.setVikramCallout(VIKRAM_CALLOUTS.crateOne, 6.5);
        } else if (collectedCount === 2) {
          this.setVikramCallout(VIKRAM_CALLOUTS.crateTwo, 6.5);
        } else {
          this.setVikramCallout(VIKRAM_CALLOUTS.allCrates, 8.0);
        }
        this.setParkourLabel(`ANTIZIN RECOVERED (${collectedCount}/3)`);
      }
    } else {
      this.unlockHoldTimer = 0;
    }

    // Check mission completion when all 3 crates collected & player reaches Taj UV Safe House Gate
    const allDone = this.world.crates.every((c) => c.state.collected);
    if (allDone) {
      const distSafe = Math.hypot(
        this.playerPos.x - this.world.safeHouseCenter.x,
        this.playerPos.z - this.world.safeHouseCenter.z,
      );
      if (distSafe <= this.world.safeHouseRadius) {
        this.phase = 'victory';
        if (document.pointerLockElement === this.renderer.domElement) {
          document.exitPointerLock();
        }
        this.pushHudState();
      }
    }
  }

  private updateVikramOverwatch(dt: number) {
    if (this.vikramFlashTimer > 0) {
      this.vikramFlashTimer -= dt;
      if (this.vikramFlashTimer <= 0) {
        this.world.vikramMuzzleFlash.visible = false;
      }
    }

    this.vikramFireTimer -= dt;
    if (this.vikramFireTimer > 0) return;

    // Find closest zombie within 18m of Havildar Vikram's Watchtower
    let closest: EnemyActor | null = null;
    let bestD = 18.0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(
        e.root.position.x - this.world.watchtowerPos.x,
        e.root.position.z - this.world.watchtowerPos.z,
      );
      if (d < bestD) {
        bestD = d;
        closest = e;
      }
    }

    if (closest) {
      this.vikramFireTimer = 1.65;
      const dx = closest.root.position.x - this.world.watchtowerPos.x;
      const dz = closest.root.position.z - (this.world.watchtowerPos.z + 1.2);
      this.world.vikramNpc.rotation.y = Math.atan2(dx, dz);

      this.world.vikramMuzzleFlash.visible = true;
      this.vikramFlashTimer = 0.09;
      this.audio.playGunshot();

      const muzzleOrigin = new THREE.Vector3(
        this.world.watchtowerPos.x,
        4.48,
        this.world.watchtowerPos.z + 1.2,
      );
      const hitPos = closest.root.position.clone().setY(1.25);
      this.spawnBulletTracer(muzzleOrigin, hitPos);

      this.applyDamageToEnemy(closest, 24, 3.0, false, false);
    } else {
      this.vikramFireTimer = 0.5;
    }
  }

  private updatePlayer(dt: number) {
    if (this.swingTimer > 0) this.swingTimer = Math.max(0, this.swingTimer - dt);
    if (this.counterAnimTimer > 0) this.counterAnimTimer = Math.max(0, this.counterAnimTimer - dt);
    if (this.leftJabTimer > 0) this.leftJabTimer = Math.max(0, this.leftJabTimer - dt);
    if (this.gestureTimer > 0) {
      this.gestureTimer = Math.max(0, this.gestureTimer - dt);
      if (this.gestureTimer === 0) this.gesturePose = 'open';
    }
    if (this.pistolFireTimer > 0) this.pistolFireTimer = Math.max(0, this.pistolFireTimer - dt);
    if (this.pistolFlashTimer > 0) {
      this.pistolFlashTimer = Math.max(0, this.pistolFlashTimer - dt);
      if (this.pistolFlashTimer <= 0) this.pistolMuzzleFlash.visible = false;
    }
    if (this.pistolReloadTimer > 0) {
      this.pistolReloadTimer = Math.max(0, this.pistolReloadTimer - dt);
      if (this.pistolReloadTimer === 0) {
        const needed = this.pistolMagSize - this.pistolAmmo;
        const take = Math.min(needed, this.pistolReserve);
        this.pistolAmmo += take;
        this.pistolReserve -= take;
      }
    }
    this.slideKick = THREE.MathUtils.damp(this.slideKick, 0, 22, dt);
    if (this.takedownTimer > 0) this.takedownTimer = Math.max(0, this.takedownTimer - dt);
    if (this.dropkickTimer > 0) this.dropkickTimer = Math.max(0, this.dropkickTimer - dt);

    if (this.combo > 0) {
      this.comboDecayTimer -= dt;
      if (this.comboDecayTimer <= 0) this.combo = 0;
    }

    const distSafe = Math.hypot(
      this.playerPos.x - this.world.safeHouseCenter.x,
      this.playerPos.z - this.world.safeHouseCenter.z,
    );
    const inSafe = distSafe <= this.world.safeHouseRadius;
    if (inSafe && !this.wasInSafeHouse) {
      this.setVikramCallout(VIKRAM_CALLOUTS.safehouse, 5.0);
      this.pistolReserve = Math.max(this.pistolReserve, 72);
    }
    this.wasInSafeHouse = inSafe;
    if (inSafe && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + dt * 8.0);
    }

    if (this.climbSoundCooldown > 0) this.climbSoundCooldown = Math.max(0, this.climbSoundCooldown - dt);

    if (this.activeClimb) {
      const c = this.activeClimb;
      this.playerPos.x = THREE.MathUtils.damp(this.playerPos.x, c.x, 12, dt);
      this.playerPos.z = THREE.MathUtils.damp(this.playerPos.z, c.z, 12, dt);
      const climbDir = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
      this.playerPos.y += climbDir * 4.8 * dt;
      this.playerVel.set(0, 0, 0);
      this.grounded = false;

      if (climbDir !== 0) {
        this.bobPhase += dt * 9.5;
        if (this.climbSoundCooldown <= 0) {
          this.climbSoundCooldown = 0.24;
          this.audio.playParkour();
        }
      }

      if (this.playerPos.y >= c.yMax - 0.15) {
        this.vaultTimer = 0.28;
        this.vaultTarget.set(c.exitX, c.yMax, c.exitZ);
        this.activeClimb = null;
        this.audio.playParkour();
        this.setParkourLabel('SUMMIT MANTLE');
      } else if (this.playerPos.y < c.yMin - 0.15) {
        this.playerPos.y = c.yMin;
        this.activeClimb = null;
        this.grounded = true;
        this.setParkourLabel('DISMOUNT');
      }
    } else if (this.vaultTimer > 0) {
      this.vaultTimer = Math.max(0, this.vaultTimer - dt);
      const alpha = 1 - Math.exp(-16 * dt);
      this.playerPos.lerp(this.vaultTarget, alpha);
      this.playerPos.y = Math.max(
        this.playerPos.y,
        this.vaultTarget.y + Math.sin((this.vaultTimer / 0.34) * Math.PI) * 0.75,
      );
      if (this.vaultTimer === 0) {
        this.playerPos.copy(this.vaultTarget);
        this.playerVel.y = 0;
        this.grounded = true;
      }
    } else {
      this.getForwardVector(_forward);
      _right.crossVectors(_forward, _up).normalize();

      const moveF = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
      const moveR = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);

      const wantsSprint = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) && moveF > 0;
      const isSprinting = wantsSprint && this.stamina > 2 && this.slideTimer <= 0;

      if (isSprinting) {
        this.stamina = Math.max(0, this.stamina - dt * 15);
      } else {
        this.stamina = Math.min(this.maxStamina, this.stamina + dt * 20);
      }

      if (this.slideTimer > 0) {
        this.slideTimer = Math.max(0, this.slideTimer - dt);
        _v1.copy(_forward).multiplyScalar(11.5);
        this.playerVel.x = THREE.MathUtils.damp(this.playerVel.x, _v1.x, 10, dt);
        this.playerVel.z = THREE.MathUtils.damp(this.playerVel.z, _v1.z, 10, dt);
      } else if (this.lungeTimer > 0) {
        this.lungeTimer = Math.max(0, this.lungeTimer - dt);
        this.playerVel.x = this.lungeDir.x;
        this.playerVel.z = this.lungeDir.z;
      } else {
        _v1.set(0, 0, 0).addScaledVector(_forward, moveF).addScaledVector(_right, moveR);
        if (_v1.lengthSq() > 0.001) _v1.normalize();
        const speed = isSprinting ? 9.6 : 6.2;
        this.playerVel.x = THREE.MathUtils.damp(this.playerVel.x, _v1.x * speed, 12, dt);
        this.playerVel.z = THREE.MathUtils.damp(this.playerVel.z, _v1.z * speed, 12, dt);
      }

      this.playerVel.y -= 19.5 * dt;
      this.playerPos.x += this.playerVel.x * dt;
      this.playerPos.z += this.playerVel.z * dt;
      this.playerPos.y += this.playerVel.y * dt;

      this.playerPos.x = THREE.MathUtils.clamp(this.playerPos.x, -52, 52);
      this.playerPos.z = THREE.MathUtils.clamp(this.playerPos.z, -76, 54);

      let floorY = 0;

      // Wooden Parkour Ramp Height Calculation
      for (const ramp of this.world.ramps) {
        if (
          Math.abs(this.playerPos.x - ramp.x) <= ramp.halfW &&
          Math.abs(this.playerPos.z - ramp.z) <= ramp.halfD
        ) {
          let frac = 0;
          if (ramp.axis === 'z-') {
            frac = (ramp.z + ramp.halfD - this.playerPos.z) / (ramp.halfD * 2);
          } else if (ramp.axis === 'z+') {
            frac = (this.playerPos.z - (ramp.z - ramp.halfD)) / (ramp.halfD * 2);
          } else if (ramp.axis === 'x+') {
            frac = (this.playerPos.x - (ramp.x - ramp.halfW)) / (ramp.halfW * 2);
          } else {
            frac = (ramp.x + ramp.halfW - this.playerPos.x) / (ramp.halfW * 2);
          }
          const rampY = THREE.MathUtils.lerp(ramp.yLow, ramp.yHigh, THREE.MathUtils.clamp(frac, 0, 1));
          if (this.playerPos.y >= rampY - 0.85) {
            floorY = Math.max(floorY, rampY);
          }
        }
      }

      // Box Obstacles & Elevated Bazaar Rooftop Floors
      const pRad = 0.45;
      for (const obs of this.world.obstacles) {
        const dx = this.playerPos.x - obs.x;
        const dz = this.playerPos.z - obs.z;
        const overlapX = obs.halfW + pRad - Math.abs(dx);
        const overlapZ = obs.halfD + pRad - Math.abs(dz);
        if (overlapX > 0 && overlapZ > 0) {
          if (this.playerPos.y >= obs.height - 0.4 && this.playerVel.y <= 0) {
            floorY = Math.max(floorY, obs.height);
          } else if (this.playerPos.y < obs.height - 0.4) {
            if (overlapX < overlapZ) {
              this.playerPos.x += dx > 0 ? overlapX : -overlapX;
            } else {
              this.playerPos.z += dz > 0 ? overlapZ : -overlapZ;
            }
          }
        }
      }

      if (this.playerPos.y <= floorY) {
        this.playerPos.y = floorY;
        this.playerVel.y = 0;
        this.grounded = true;
      } else {
        this.grounded = false;
      }
    }

    const targetEye = this.slideTimer > 0 ? 0.92 : this.eyeHeight;
    this.currentEyeHeight = THREE.MathUtils.damp(this.currentEyeHeight, targetEye, 14, dt);

    const horizSpeed = Math.hypot(this.playerVel.x, this.playerVel.z);
    if (this.grounded && horizSpeed > 0.6 && this.slideTimer <= 0) {
      this.bobPhase += dt * horizSpeed * 1.45;
    }
    const bobOffset =
      this.grounded && this.slideTimer <= 0
        ? Math.sin(this.bobPhase) * 0.045 * Math.min(1, horizSpeed / 6)
        : 0;

    this.camera.position.set(
      this.playerPos.x,
      this.playerPos.y + this.currentEyeHeight + bobOffset,
      this.playerPos.z,
    );
    const slideTilt = this.slideTimer > 0 ? -0.11 : 0;
    this.camera.rotation.set(this.pitch, this.yaw, slideTilt, 'YXZ');

    const targetFov = horizSpeed > 7.5 || this.lungeTimer > 0 ? 84 : 76;
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 8, dt);
      this.camera.updateProjectionMatrix();
    }
  }

  private updateFirstPersonRig(dt: number) {
    const idleX = Math.sin(this.bobPhase * 0.5) * 0.011;
    const idleY = Math.cos(this.bobPhase) * 0.012;

    if (this.weapon === 'pistol') {
      // Exact two-tone tactical pistol & tan/black glove pose from image_70c3ca82.png + ADS + Recoil
      const ads = this.aimingDownSights && this.pistolReloadTimer <= 0 ? 1 : 0;
      const reloadDrop = this.pistolReloadTimer > 0 ? Math.sin((this.pistolReloadTimer / 1.05) * Math.PI) * 0.24 : 0;
      const recoilKick = this.slideKick;

      const targetX = THREE.MathUtils.lerp(0.28 + idleX * 0.6, 0.018, ads);
      const targetY = THREE.MathUtils.lerp(-0.22 + idleY * 0.6, -0.145, ads) - reloadDrop + recoilKick * 0.025;
      const targetZ = THREE.MathUtils.lerp(-0.37, -0.32, ads) + recoilKick * 0.042;

      this.rightArm.position.x = THREE.MathUtils.damp(this.rightArm.position.x, targetX, 18, dt);
      this.rightArm.position.y = THREE.MathUtils.damp(this.rightArm.position.y, targetY, 18, dt);
      this.rightArm.position.z = THREE.MathUtils.damp(this.rightArm.position.z, targetZ, 18, dt);

      const targetRotX = THREE.MathUtils.lerp(0.06, 0.01, ads) + recoilKick * 0.26 - reloadDrop * 1.4;
      const targetRotY = THREE.MathUtils.lerp(0.16, 0.0, ads);
      const targetRotZ = THREE.MathUtils.lerp(0.22, 0.04, ads);
      this.rightArm.rotation.x = THREE.MathUtils.damp(this.rightArm.rotation.x, targetRotX, 18, dt);
      this.rightArm.rotation.y = THREE.MathUtils.damp(this.rightArm.rotation.y, targetRotY, 18, dt);
      this.rightArm.rotation.z = THREE.MathUtils.damp(this.rightArm.rotation.z, targetRotZ, 18, dt);

      this.rightHandPivot.rotation.x = THREE.MathUtils.damp(this.rightHandPivot.rotation.x, 0.02, 16, dt);
      this.rightHandPivot.rotation.y = THREE.MathUtils.damp(this.rightHandPivot.rotation.y, -0.12, 16, dt);
      this.rightHandPivot.rotation.z = THREE.MathUtils.damp(this.rightHandPivot.rotation.z, 0.14, 16, dt);
    } else {
      let swingRotX = 0;
      let swingRotY = 0;
      let swingRotZ = 0;
      let swingPosX = 0.32 + idleX;
      let swingPosZ = -0.41;
      if (this.takedownTimer > 0) {
        const p = 1 - this.takedownTimer / 0.48;
        swingRotX = -Math.sin(p * Math.PI) * 1.15;
        swingRotY = Math.sin(p * Math.PI) * 0.55;
        swingRotZ = Math.sin(p * Math.PI) * 0.65;
        swingPosX = 0.32 - Math.sin(p * Math.PI) * 0.14;
        swingPosZ = -0.41 - Math.sin(p * Math.PI) * 0.22;
      } else if (this.swingTimer > 0) {
        const dur = this.weapon === 'kukri' ? 0.3 : 0.38;
        const p = 1 - this.swingTimer / dur;
        swingRotX = -Math.sin(p * Math.PI) * 0.92;
        swingRotY = Math.sin(p * Math.PI) * 0.58;
        swingRotZ = Math.sin(p * Math.PI) * 0.72;
        swingPosX = 0.32 - Math.sin(p * Math.PI) * 0.12;
        swingPosZ = -0.41 - Math.sin(p * Math.PI) * 0.15;
      }

      this.rightArm.position.set(swingPosX, -0.28 + idleY, swingPosZ);
      this.rightArm.rotation.set(swingRotX, swingRotY, swingRotZ);
      this.rightHandPivot.rotation.x = THREE.MathUtils.damp(this.rightHandPivot.rotation.x, 0.18, 16, dt);
      this.rightHandPivot.rotation.y = THREE.MathUtils.damp(this.rightHandPivot.rotation.y, 0.32, 16, dt);
      this.rightHandPivot.rotation.z = THREE.MathUtils.damp(this.rightHandPivot.rotation.z, 0.36, 16, dt);
    }

    // Left articulated bare hand + cyan watch: supports Open, Fist Jab/Parry, Point, Peace V, ThumbsUp
    const parryLift =
      this.counterAnimTimer > 0 ? Math.sin((1 - this.counterAnimTimer / 0.34) * Math.PI) * 0.26 : 0;
    const jabThrust =
      this.leftJabTimer > 0 ? Math.sin((1 - this.leftJabTimer / 0.34) * Math.PI) : 0;
    const gestureActive = this.gestureTimer > 0 && this.leftJabTimer <= 0 && this.counterAnimTimer <= 0 ? 1 : 0;

    let activeLeftPose: HandPose = this.gestureTimer > 0 ? this.gesturePose : 'open';
    if (this.counterAnimTimer > 0 || this.leftJabTimer > 0 || this.activeClimb) {
      activeLeftPose = 'fist';
    }

    const leftX = -0.34 - idleX + jabThrust * 0.19 + gestureActive * 0.11;
    const leftY = -0.27 + idleY + parryLift + jabThrust * 0.12 + gestureActive * 0.08;
    const leftZ = -0.43 - parryLift * 0.26 - jabThrust * 0.24 - gestureActive * 0.04;
    this.leftArm.position.set(leftX, leftY, leftZ);
    this.leftArm.rotation.set(parryLift * 1.2 + jabThrust * 0.35, -jabThrust * 0.35, -parryLift * 0.65);

    // Angle the left wrist nicely when showing hand signs (thumbsUp / peace / point / fist)
    let lpX = -0.46;
    let lpY = 0.24;
    let lpZ = -0.78;
    if (activeLeftPose === 'fist') {
      lpX = -0.95;
      lpY = 0.38;
      lpZ = -0.35;
    } else if (activeLeftPose === 'thumbsUp') {
      lpX = -0.18;
      lpY = 0.65;
      lpZ = -0.25;
    } else if (activeLeftPose === 'peace') {
      lpX = -0.15;
      lpY = 0.18;
      lpZ = -0.18;
    } else if (activeLeftPose === 'point') {
      lpX = -1.15;
      lpY = 0.14;
      lpZ = -0.22;
    }
    this.leftHandPivot.rotation.x = THREE.MathUtils.damp(this.leftHandPivot.rotation.x, lpX, 14, dt);
    this.leftHandPivot.rotation.y = THREE.MathUtils.damp(this.leftHandPivot.rotation.y, lpY, 14, dt);
    this.leftHandPivot.rotation.z = THREE.MathUtils.damp(this.leftHandPivot.rotation.z, lpZ, 14, dt);

    const rightPose: HandPose = this.weapon === 'pistol' ? 'gripPistol' : 'gripMelee';
    this.updateHandPoses(activeLeftPose, rightPose, dt, this.slideKick);

    this.dropkickLeg.visible = this.dropkickTimer > 0;
    if (this.dropkickTimer > 0) {
      const p = 1 - this.dropkickTimer / 0.48;
      this.dropkickLeg.position.z = -0.25 - Math.sin(p * Math.PI) * 0.52;
      this.dropkickLeg.position.y = -0.52 + Math.sin(p * Math.PI) * 0.3;
    }
  }

  private updateEnemies(dt: number, elapsed: number) {
    let aliveCount = 0;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead) {
        e.deathTimer -= dt;
        e.bodyPivot.rotation.x = THREE.MathUtils.damp(e.bodyPivot.rotation.x, -Math.PI / 2, 9, dt);
        e.root.position.y = THREE.MathUtils.damp(e.root.position.y, -0.25, 6, dt);
        if (e.deathTimer <= 0) {
          this.scene.remove(e.root);
          this.enemies.splice(i, 1);
        }
        continue;
      }

      aliveCount++;
      if (e.hitFlashTimer > 0) e.hitFlashTimer = Math.max(0, e.hitFlashTimer - dt);
      if (e.attackCooldown > 0) e.attackCooldown = Math.max(0, e.attackCooldown - dt);

      if (e.staggerTimer > 0) {
        e.staggerTimer = Math.max(0, e.staggerTimer - dt);
        e.bodyPivot.rotation.x = THREE.MathUtils.damp(e.bodyPivot.rotation.x, -0.25, 10, dt);
      } else {
        e.bodyPivot.rotation.x = THREE.MathUtils.damp(e.bodyPivot.rotation.x, 0.08, 10, dt);

        _v1.subVectors(this.playerPos, e.root.position);
        _v1.y = 0;
        const dist = _v1.length();

        const dxSh = e.root.position.x - this.world.safeHouseCenter.x;
        const dzSh = e.root.position.z - this.world.safeHouseCenter.z;
        const distSh = Math.hypot(dxSh, dzSh);
        if (distSh < this.world.safeHouseRadius + 0.8) {
          const pushX = dxSh / Math.max(0.01, distSh);
          const pushZ = dzSh / Math.max(0.01, distSh);
          e.velocity.x += pushX * 22 * dt;
          e.velocity.z += pushZ * 22 * dt;
        } else if (dist > 0.01) {
          _v1.divideScalar(dist);
          e.root.rotation.y = Math.atan2(_v1.x, _v1.z);

          if (dist > 1.75) {
            e.velocity.x = THREE.MathUtils.damp(e.velocity.x, _v1.x * e.speed, 6, dt);
            e.velocity.z = THREE.MathUtils.damp(e.velocity.z, _v1.z * e.speed, 6, dt);
          } else {
            e.velocity.x = THREE.MathUtils.damp(e.velocity.x, 0, 10, dt);
            e.velocity.z = THREE.MathUtils.damp(e.velocity.z, 0, 10, dt);
            if (
              e.windupTimer <= 0 &&
              e.attackCooldown <= 0 &&
              Math.abs(this.playerPos.y - e.root.position.y) < 1.8
            ) {
              e.windupTimer = 0.78;
            }
          }
        }
      }

      if (e.windupTimer > 0) {
        e.windupTimer -= dt;
        e.counterIcon.visible = true;
        e.counterIcon.lookAt(this.camera.position);
        e.counterIcon.scale.setScalar(0.95 + Math.sin(elapsed * 22) * 0.15);

        if (e.windupTimer <= 0) {
          e.counterIcon.visible = false;
          e.attackCooldown = 1.25;
          const distNow = e.root.position.distanceTo(this.playerPos);
          if (distNow < 2.4 && Math.abs(this.playerPos.y - e.root.position.y) < 1.8) {
            this.health = Math.max(0, this.health - e.damage);
            this.combo = 0;
            this.damageFlash = 1.0;
            this.audio.playHurt();
            if (this.health <= 0) {
              this.phase = 'gameover';
              if (document.pointerLockElement === this.renderer.domElement) {
                document.exitPointerLock();
              }
              this.pushHudState();
            }
          }
        }
      } else {
        e.counterIcon.visible = false;
      }

      e.root.position.x = THREE.MathUtils.clamp(e.root.position.x + e.velocity.x * dt, -50, 50);
      e.root.position.z = THREE.MathUtils.clamp(e.root.position.z + e.velocity.z * dt, -38, 54);
      e.velocity.x = THREE.MathUtils.damp(e.velocity.x, 0, 5, dt);
      e.velocity.z = THREE.MathUtils.damp(e.velocity.z, 0, 5, dt);

      const speedMag = Math.hypot(e.velocity.x, e.velocity.z);
      e.walkPhase += dt * (2.5 + speedMag * 1.8);
      const stride = Math.sin(e.walkPhase) * Math.min(0.65, speedMag * 0.15);
      e.leftLeg.rotation.x = stride;
      e.rightLeg.rotation.x = -stride;
      if (e.kind === 'hound') {
        e.leftArm.rotation.x = -stride;
        e.rightArm.rotation.x = stride;
      } else {
        const windupLift = e.windupTimer > 0 ? -1.15 : -0.45;
        e.leftArm.rotation.x = windupLift + stride * 0.35;
        e.rightArm.rotation.x = windupLift - stride * 0.35;
      }
    }

    // Crowd separation physics (no stacking)
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      if (a.dead) continue;
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j];
        if (b.dead) continue;
        const dx = a.root.position.x - b.root.position.x;
        const dz = a.root.position.z - b.root.position.z;
        const minDist = a.radius + b.radius + 0.22;
        const distSq = dx * dx + dz * dz;
        if (distSq < minDist * minDist) {
          const dist = Math.sqrt(Math.max(0.0001, distSq));
          const overlap = (minDist - dist) * 0.5;
          const nx = dx / dist;
          const nz = dz / dist;
          a.root.position.x += nx * overlap;
          a.root.position.z += nz * overlap;
          b.root.position.x -= nx * overlap;
          b.root.position.z -= nz * overlap;
        }
      }
    }

    // Ambient courtyard replenishment during the 3-crate Antizin mission
    this.spawnTimer += dt;
    if (aliveCount < 10 && this.spawnTimer > 4.5 && this.phase === 'playing') {
      this.spawnTimer = 0;
      this.spawnCourtyardInfected(3);
    }
  }

  private pushHudState() {
    const headingDeg = ((THREE.MathUtils.radToDeg(-this.yaw) % 360) + 360) % 360;
    const distSafe = Math.hypot(
      this.playerPos.x - this.world.safeHouseCenter.x,
      this.playerPos.z - this.world.safeHouseCenter.z,
    );

    const counterPrompt = this.enemies.some(
      (e) => !e.dead && e.windupTimer > 0 && e.root.position.distanceTo(this.playerPos) < 4.6,
    );

    const alive = this.enemies.filter((e) => !e.dead);
    const cratesCollected = this.world.crates.filter((c) => c.state.collected).length;
    const totalCrates = this.world.crates.length;
    const nearCrate = this.getNearestUncollectedCrate(3.4);

    const markers: CompassMarker[] = [];
    const addMarker = (id: string, label: string, x: number, z: number, kind: CompassMarker['kind']) => {
      const dx = x - this.playerPos.x;
      const dz = z - this.playerPos.z;
      const distance = Math.round(Math.hypot(dx, dz));
      const worldAngle = THREE.MathUtils.radToDeg(Math.atan2(dx, -dz));
      let rel = ((worldAngle - headingDeg + 540) % 360) - 180;
      if (rel < -180) rel += 360;
      markers.push({ id, label, angleDeg: rel, distance, kind });
    };

    addMarker('taj', 'Taj', this.world.tajPosition.x, this.world.tajPosition.z, 'taj');
    addMarker('safehouse', 'UV', this.world.safeHouseCenter.x, this.world.safeHouseCenter.z, 'safehouse');

    for (const c of this.world.crates) {
      if (!c.state.collected) {
        addMarker(c.state.id, 'GRE', c.state.x, c.state.z, 'antizin');
      }
    }

    const missionObjective =
      cratesCollected < totalCrates
        ? `Recover GRE Antizin Crates (${cratesCollected}/${totalCrates})`
        : 'Deliver Antizin to Havildar Vikram at the Taj UV Gate';

    const nearClimb = this.activeClimb ?? this.getNearestClimbable();
    const climbPrompt = this.activeClimb
      ? `[W/S] Climb · [Space] Mantle/Leap · [E] Dismount (${this.activeClimb.label})`
      : nearClimb
        ? `[E] Climb · ${nearClimb.label}`
        : '';

    const currentLeftPose: HandPose =
      this.counterAnimTimer > 0 || this.leftJabTimer > 0 || this.activeClimb
        ? 'fist'
        : this.gestureTimer > 0
          ? this.gesturePose
          : 'open';

    this.onHudUpdate({
      phase: this.phase,
      weapon: this.weapon,
      pistolAmmo: this.pistolAmmo,
      pistolMagSize: this.pistolMagSize,
      pistolReserve: this.pistolReserve,
      leftHandPose: currentLeftPose,
      health: Math.round(this.health),
      maxHealth: this.maxHealth,
      stamina: Math.round(this.stamina),
      maxStamina: this.maxStamina,
      combo: this.combo,
      maxCombo: this.maxCombo,
      score: this.score,
      kills: this.kills,
      enemiesAlive: alive.length,
      cratesCollected,
      totalCrates,
      nearCrateLabel: nearCrate ? nearCrate.state.label : '',
      unlockProgress: Math.min(1, this.unlockHoldTimer / 2.5),
      nearWatchtower: !nearCrate && this.isNearWatchtower(),
      climbPrompt,
      isClimbing: Boolean(this.activeClimb),
      missionObjective,
      timeOfDayLabel: this.cycleTime < 0.55 ? 'Golden Dusk' : 'Nightfall',
      cycleProgress: this.cycleTime,
      inSafeHouse: distSafe <= this.world.safeHouseRadius,
      counterPrompt,
      takedownReady: this.combo >= 5,
      parkourLabel: this.parkourLabel,
      headingDeg,
      markers,
      vikramLine: this.vikramTimer > 0 ? this.vikramLine : '',
      damageFlash: this.damageFlash,
      playerX: this.playerPos.x,
      playerZ: this.playerPos.z,
      playerYaw: this.yaw,
      crates: this.world.crates.map((c) => ({ ...c.state })),
      safeHouseX: this.world.safeHouseCenter.x,
      safeHouseZ: this.world.safeHouseCenter.z,
      safeHouseRadius: this.world.safeHouseRadius,
      watchtowerX: this.world.watchtowerPos.x,
      watchtowerZ: this.world.watchtowerPos.z,
      threatDots: alive.map((e) => ({ x: e.root.position.x, z: e.root.position.z })),
    });
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('wheel', this.handleWheel);
    window.removeEventListener('contextmenu', this.handleContextMenu);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);

    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock();
    }

    this.vfxRings.forEach((r) => {
      this.scene.remove(r.mesh);
      (r.mesh.material as THREE.Material).dispose();
    });
    this.tracers.forEach((tr) => {
      this.scene.remove(tr.line);
      tr.line.geometry.dispose();
      (tr.line.material as THREE.Material).dispose();
    });
    this.vfxRingGeo.dispose();
    this.skyDome.geometry.dispose();
    this.skyMat.dispose();
    this.sunSprite.material.dispose();
    this.disposeFpRig();

    this.world.dispose();
    this.entityAssets.dispose();
    this.textures.dispose();
    this.audio.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
