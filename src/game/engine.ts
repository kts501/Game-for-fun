import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type {
  BoxCollider,
  CounterIndicator,
  DirectionalDamageIndicator,
  GamePhase,
  HudSnapshot,
  LadderVolume,
  ZiplineRoute,
} from '../types/game';
import { SoundEngine } from './audio';
import { createProceduralTextures, type ProceduralTextureSet } from './textures';
import { WeaponAndEffects } from './viewmodel';
import { buildAgraWorld, type WorldBuildResult } from './world';
import { ZombieManager, type ZombieActor } from './zombies';

// Pre-allocated math helpers (zero GC inside animation loop)
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _moveDir = new THREE.Vector3();
const _projVec = new THREE.Vector3();
const _sunDir = new THREE.Vector3();
const _tmpVecA = new THREE.Vector3();
const _tmpVecB = new THREE.Vector3();
const _skyTopDay = new THREE.Color(0x6d829c);
const _skyHorizDay = new THREE.Color(0xdfa05d); // Warm golden Agra sunset horizon without blowing bloom threshold
const _skyTopTwilight = new THREE.Color(0x281e45);
const _skyHorizTwilight = new THREE.Color(0x7c3454);
const _skyTopNight = new THREE.Color(0x050814);
const _skyHorizNight = new THREE.Color(0x16213d);
const _skyFogCurrent = new THREE.Color();
const _sunColorDay = new THREE.Color(0xffc985);
const _sunColorMoon = new THREE.Color(0x9cb8f2);
const _hemiSkyDay = new THREE.Color(0xffdba8);
const _hemiSkyNight = new THREE.Color(0x304570);
const _hemiGroundDay = new THREE.Color(0x523b2e);
const _hemiGroundNight = new THREE.Color(0x111520);

const FULL_CYCLE_SECONDS = 120; // 2 minutes per full 24h cycle
const PLAYER_EYE_HEIGHT = 1.68;
const PLAYER_RADIUS = 0.4;

export class AgraSurvivalEngine {
  private readonly mountEl: HTMLElement;
  private readonly onHudUpdate: (hud: HudSnapshot) => void;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer | null = null;
  private readonly bloomPass: UnrealBloomPass | null = null;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly isSoftwareGl: boolean;
  private readonly textures: ProceduralTextureSet;
  private readonly world: WorldBuildResult;
  private readonly viewmodel: WeaponAndEffects;
  private readonly zombies: ZombieManager;
  public readonly sound = new SoundEngine();

  // SkyDome Shader & Lighting rig
  private readonly skyMesh: THREE.Mesh;
  private readonly skyMat: THREE.ShaderMaterial;
  private readonly sunLight: THREE.DirectionalLight;
  private readonly hemiLight: THREE.HemisphereLight;
  private readonly flashlight: THREE.SpotLight;
  private readonly flashlightTarget = new THREE.Object3D();

  // Loop & lifecycle
  private frameId = 0;
  private disposed = false;
  private lastNow = performance.now();
  private elapsed = 0;
  private hudThrottle = 0;

  // Game & Player state
  private phase: GamePhase = 'start';
  private pointerLocked = false;
  private readonly playerPos = new THREE.Vector3(5.8, 0, 24.5);
  private readonly playerVel = new THREE.Vector3();
  private yaw = 0.11;
  private pitch = -0.04;
  private onGround = true;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private canMantle = false;

  // Mantle, Speed Vault & Lunge kinematics
  private mantling = false;
  private mantleTimer = 0;
  private readonly mantleStart = new THREE.Vector3();
  private readonly mantleEnd = new THREE.Vector3();

  private vaulting = false;
  private vaultTimer = 0;
  private readonly vaultStart = new THREE.Vector3();
  private readonly vaultEnd = new THREE.Vector3();
  private vaultPeakY = 0;

  private lungeTimer = 0;
  private readonly lungeVel = new THREE.Vector3();
  private targetYawGoal: number | null = null;

  // Parkour Slide, Wall-Run, Safety Roll, Momentum Flow & Zipline state
  private slideTimer = 0;
  private slideCooldown = 0;
  private slideDustTimer = 0;
  private readonly slideDir = new THREE.Vector3();
  private wallRunTimer = 0;
  private wallRunCooldown = 0;
  private wallRunSide: -1 | 0 | 1 = 0;
  private readonly wallRunNormal = new THREE.Vector3();
  private readonly wallRunTangent = new THREE.Vector3();
  private wallRunStepTimer = 0;
  private wallRunStepCount = 0;
  private lastWallColliderId = '';
  private rollBufferTimer = 0;
  private rollTimer = 0;
  private readonly rollDir = new THREE.Vector3();
  private rollPitchOffset = 0;
  private parkourFlow = 0;
  private flowDecayTimer = 0;
  private parkourMoveLabel = '';
  private parkourMoveTimer = 0;
  private eyeHeightOffset = 0;
  private landingDipOffset = 0;
  private sprintWindTimer = 0;
  private activeZipline: ZiplineRoute | null = null;
  private ziplineReverse = false;
  private ziplineT = 0;
  private activeLadder: LadderVolume | null = null;
  private ladderStepTimer = 0;
  private radioOpen = false;

  // Player stats, combat & camera feedback
  private health = 100;
  private readonly maxHealth = 100;
  private stamina = 100;
  private readonly maxStamina = 100;
  private staminaPauseTimer = 0;
  private comboCount = 0;
  private maxCombo = 0;
  private comboTimer = 0;
  private killCount = 0;
  private attackCooldown = 0;
  private kickCooldown = 0;
  private dropkickTimer = 0;
  private mantlePitchOffset = 0;
  private mantleRollOffset = 0;
  private slowMoTimer = 0;
  private hitstopTimer = 0;
  private cameraShake = 0;
  private damageFlash = 0;
  private parryFlash = 0;
  private preVaultSpeed = 0;
  private preMantleSpeed = 0;
  private directionalHits: DirectionalDamageIndicator[] = [];
  private nextHitId = 1;

  // Gadgets & Day/Night
  private flashlightOn = false;
  private firecrackerCooldown = 0;
  private timeOfDay = 0.0; // Starts at 17:15 warm golden sunset
  private wasNight = false;
  private nightSubtitleShown = false;

  // Story & Subtitles
  private subtitleSpeaker = 'OVERWATCH RADIO';
  private subtitleText = '';
  private subtitleTimer = 0;
  private playTimeSeconds = 0;

  private readonly keys: Record<string, boolean> = {};

  constructor(mountEl: HTMLElement, onHudUpdate: (hud: HudSnapshot) => void) {
    this.mountEl = mountEl;
    this.onHudUpdate = onHudUpdate;

    // 1. Software WebGL detection
    this.isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.94;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(mountEl.clientWidth || window.innerWidth, mountEl.clientHeight || window.innerHeight);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    mountEl.appendChild(this.renderer.domElement);

    // 2. Scene, Camera, SkyDome Shader, RoomEnvironment IBL & Horizon Fog
    this.scene = new THREE.Scene();
    this.scene.background = _skyHorizDay.clone();
    this.scene.fog = new THREE.FogExp2(_skyHorizDay.getHex(), 0.0095);

    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: _skyTopDay.clone() },
        horizonColor: { value: _skyHorizDay.clone() },
        sunDir: { value: new THREE.Vector3(0.3, 0.25, -0.9).normalize() },
        sunColor: { value: new THREE.Color(0xffdfa0) },
        sunIntensity: { value: 0.85 },
      },
      vertexShader: `
        varying vec3 vWorldDir;
        void main() {
          vWorldDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 sunDir;
        uniform vec3 sunColor;
        uniform float sunIntensity;
        varying vec3 vWorldDir;
        void main() {
          vec3 dir = normalize(vWorldDir);
          float h = clamp(dir.y, 0.0, 1.0);
          vec3 sky = mix(horizonColor, topColor, pow(h, 0.55));
          float sunDot = max(dot(dir, normalize(sunDir)), 0.0);
          float halo = pow(sunDot, 12.0) * 0.28 * sunIntensity;
          float disc = smoothstep(0.9965, 0.9988, sunDot) * 0.85 * sunIntensity;
          sky += sunColor * (halo + disc);
          gl_FragColor = vec4(sky, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(210, 24, 16), this.skyMat);
    this.scene.add(this.skyMesh);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.32;
    pmremGenerator.dispose();

    this.camera = new THREE.PerspectiveCamera(
      76,
      (mountEl.clientWidth || window.innerWidth) / (mountEl.clientHeight || window.innerHeight),
      0.1,
      260,
    );
    this.camera.layers.enable(1); // Render Layer 1 instanced grass tufts while Reflector skips them
    this.scene.add(this.camera);

    // 3. Three-point / Outdoor Day-Night Lighting + Player Flashlight
    this.hemiLight = new THREE.HemisphereLight(_hemiSkyDay.getHex(), _hemiGroundDay.getHex(), 0.58);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(_sunColorDay.getHex(), 1.45);
    this.sunLight.position.set(28, 22, -65);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 190;
    const d = 64;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);

    this.flashlight = new THREE.SpotLight(0xfef9c3, 0, 42, Math.PI / 4.2, 0.55, 1.55);
    this.flashlight.castShadow = false;
    this.flashlight.position.set(0.18, -0.08, 0);
    this.flashlightTarget.position.set(0, 0, -12);
    this.camera.add(this.flashlight);
    this.camera.add(this.flashlightTarget);
    this.flashlight.target = this.flashlightTarget;

    // 4. Build World, Textures, Viewmodel, and Zombies
    this.textures = createProceduralTextures(this.renderer.capabilities.getMaxAnisotropy());
    this.world = buildAgraWorld(this.scene, this.textures, this.isSoftwareGl);
    this.viewmodel = new WeaponAndEffects(this.scene, this.camera, this.textures);
    this.zombies = new ZombieManager(this.scene, this.textures);

    if (!this.isSoftwareGl) {
      const w = mountEl.clientWidth || window.innerWidth;
      const h = mountEl.clientHeight || window.innerHeight;
      this.composer = new EffectComposer(this.renderer);
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.35, 0.4, 0.85);
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.syncCameraToPlayer(0);
    this.updateAtmosphere(0);
    this.emitHud();
    this.startLoop();
  }

  public startGame(): void {
    this.sound.unlock();
    this.resetState();
    this.phase = 'playing';
    this.setSubtitle(
      'OVERWATCH RADIO',
      'Runner, the Agra quarantine zone is collapsing. Scavenge 3 Antizin supply crates from the bazaar and return to the Taj Mahal UV gate before nightfall.',
      11,
    );
    this.syncCameraToPlayer(0);
    this.lockPointer();
    this.emitHud();
  }

  public restartGame(): void {
    this.startGame();
  }

  public lockPointer(): void {
    this.sound.unlock();
    if (document.pointerLockElement !== this.renderer.domElement) {
      try {
        this.renderer.domElement.requestPointerLock();
      } catch {
        // Ignore if browser rejects outside gesture
      }
    }
  }

  public skipTime(): void {
    this.timeOfDay = (this.timeOfDay + 0.19) % 1;
    this.updateAtmosphere(0);
    this.emitHud();
  }

  public isNearGuardTower(): boolean {
    return (
      Math.hypot(
        this.playerPos.x - this.world.guardTowerCenter.x,
        this.playerPos.z - this.world.guardTowerCenter.z,
      ) <= 5.2
    );
  }

  public openRadio(): void {
    if (this.phase !== 'playing' || this.radioOpen) return;
    this.radioOpen = true;
    for (const k of Object.keys(this.keys)) {
      this.keys[k] = false;
    }
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    this.sound.playFlashlightClick();
    this.emitHud();
  }

  public closeRadio(): void {
    if (!this.radioOpen) return;
    this.radioOpen = false;
    this.sound.playFlashlightClick();
    this.lockPointer();
    this.emitHud();
  }

  private resetState(): void {
    this.playerPos.set(5.8, 0, 24.5);
    this.playerVel.set(0, 0, 0);
    this.yaw = 0.11;
    this.pitch = -0.04;
    this.onGround = true;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.canMantle = false;
    this.mantling = false;
    this.vaulting = false;
    this.vaultTimer = 0;
    this.lungeTimer = 0;
    this.targetYawGoal = null;
    this.slideTimer = 0;
    this.slideCooldown = 0;
    this.slideDustTimer = 0;
    this.wallRunTimer = 0;
    this.wallRunCooldown = 0;
    this.wallRunSide = 0;
    this.wallRunStepTimer = 0;
    this.wallRunStepCount = 0;
    this.lastWallColliderId = '';
    this.rollBufferTimer = 0;
    this.rollTimer = 0;
    this.rollPitchOffset = 0;
    this.parkourFlow = 0;
    this.flowDecayTimer = 0;
    this.parkourMoveLabel = '';
    this.parkourMoveTimer = 0;
    this.eyeHeightOffset = 0;
    this.landingDipOffset = 0;
    this.sprintWindTimer = 0;
    this.activeZipline = null;
    this.ziplineT = 0;
    this.activeLadder = null;
    this.ladderStepTimer = 0;
    this.radioOpen = false;

    this.health = this.maxHealth;
    this.stamina = this.maxStamina;
    this.comboCount = 0;
    this.maxCombo = 0;
    this.comboTimer = 0;
    this.killCount = 0;
    this.attackCooldown = 0;
    this.kickCooldown = 0;
    this.dropkickTimer = 0;
    this.mantlePitchOffset = 0;
    this.mantleRollOffset = 0;
    this.slowMoTimer = 0;
    this.hitstopTimer = 0;
    this.cameraShake = 0;
    this.damageFlash = 0;
    this.parryFlash = 0;
    this.preVaultSpeed = 0;
    this.preMantleSpeed = 0;
    this.directionalHits = [];
    this.firecrackerCooldown = 0;
    this.flashlightOn = false;
    this.flashlight.intensity = 0;

    this.timeOfDay = 0.0;
    this.wasNight = false;
    this.nightSubtitleShown = false;
    this.playTimeSeconds = 0;

    this.world.crates.forEach((c) => {
      c.collected = false;
      c.group.visible = true;
    });

    this.zombies.resetAll();
  }

  private setSubtitle(speaker: string, text: string, duration = 7.5): void {
    this.subtitleSpeaker = speaker;
    this.subtitleText = text;
    this.subtitleTimer = duration;
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('mousemove', this.onMouseMove);
    this.renderer.domElement.addEventListener('mousedown', this.onMouseDown);
    this.renderer.domElement.addEventListener('contextmenu', this.onContextMenu);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
  }

  private unbindEvents(): void {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('mousemove', this.onMouseMove);
    this.renderer.domElement.removeEventListener('mousedown', this.onMouseDown);
    this.renderer.domElement.removeEventListener('contextmenu', this.onContextMenu);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
  }

  private onContextLost = (e: Event) => {
    e.preventDefault();
  };

  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  private onResize = () => {
    const w = this.mountEl.clientWidth || window.innerWidth;
    const h = this.mountEl.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(w, h);
    if (this.composer && this.bloomPass) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
      this.bloomPass.setSize(w, h);
    }
  };

  private onPointerLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
    this.emitHud();
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.pointerLocked || this.phase !== 'playing') return;
    const sensitivity = 0.0022;
    this.yaw -= e.movementX * sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * sensitivity, -1.42, 1.42);
  };

  private onMouseDown = (e: MouseEvent) => {
    if (this.phase !== 'playing' || this.radioOpen) return;
    this.sound.unlock();
    if (!this.pointerLocked) {
      this.lockPointer();
      return;
    }

    if (e.button === 0) {
      this.performMeleeAttack();
    } else if (e.button === 2) {
      this.performCounterParry();
    }
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.radioOpen) {
      if (e.code === 'Escape' && !e.repeat) {
        e.preventDefault();
        this.closeRadio();
      }
      return;
    }
    this.keys[e.code] = true;
    if (this.phase === 'start') {
      const ignored = [
        'Escape',
        'Tab',
        'ShiftLeft',
        'ShiftRight',
        'ControlLeft',
        'ControlRight',
        'AltLeft',
        'AltRight',
        'MetaLeft',
        'MetaRight',
      ];
      if (!e.repeat && !ignored.includes(e.code)) {
        e.preventDefault();
        this.startGame();
      }
      return;
    }
    if (this.phase !== 'playing') return;

    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) {
        if (this.activeZipline) {
          this.activeZipline = null;
          this.playerVel.x = -Math.sin(this.yaw) * 11.8;
          this.playerVel.z = -Math.cos(this.yaw) * 11.8;
          this.playerVel.y = 8.4;
          this.onGround = false;
          this.triggerFlowBoost('ZIPLINE LAUNCH', 0.35);
          this.sound.playWindRush(0.75);
          return;
        }
        if (this.wallRunSide !== 0) {
          this.performWallKick();
          return;
        }
        if (this.slideTimer > 0) {
          this.slideTimer = 0;
          const speed = 13.4 + this.parkourFlow * 1.4;
          this.playerVel.x = -Math.sin(this.yaw) * speed;
          this.playerVel.z = -Math.cos(this.yaw) * speed;
          this.playerVel.y = 9.2;
          this.onGround = false;
          this.coyoteTimer = 0;
          this.jumpBufferTimer = 0;
          this.triggerFlowBoost('SLIDE-HOP', 0.38);
          this.sound.playWindRush(0.85);
          return;
        }
        this.jumpBufferTimer = 0.16;
        this.tryJumpOrMantle();
      }
    } else if (e.code === 'KeyF' && !e.repeat) {
      this.toggleFlashlight();
    } else if (e.code === 'KeyQ' && !e.repeat) {
      this.throwFirecracker();
    } else if (e.code === 'KeyE' && !e.repeat) {
      this.tryInteract();
    } else if (e.code === 'KeyR' && !e.repeat) {
      this.performHeavyTakedown();
    } else if (e.code === 'KeyC' && !e.repeat) {
      if (!this.onGround && !this.mantling && !this.vaulting && !this.activeZipline) {
        this.rollBufferTimer = 0.32;
        if (this.playerVel.y > -8.5) {
          this.performParkourKick();
        }
      } else {
        const horizSpeed = Math.hypot(this.playerVel.x, this.playerVel.z);
        const wantsSprint = Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight']);
        if (this.onGround && wantsSprint && horizSpeed > 6.4) {
          this.tryParkourSlide();
        } else {
          this.performParkourKick();
        }
      }
    } else if (e.code === 'KeyV' && !e.repeat) {
      this.performParkourKick();
    } else if ((e.code === 'ControlLeft' || e.code === 'KeyX') && !e.repeat) {
      if (!this.onGround) {
        this.rollBufferTimer = 0.34;
      } else {
        this.tryParkourSlide();
      }
    } else if (e.code === 'Digit1' && !e.repeat) {
      this.viewmodel.setWeapon('bat');
      this.emitHud();
    } else if (e.code === 'Digit2' && !e.repeat) {
      this.viewmodel.setWeapon('machete');
      this.emitHud();
    } else if (e.code === 'Digit3' && !e.repeat) {
      this.viewmodel.setWeapon('pipe');
      this.emitHud();
    } else if (e.code === 'KeyT' && !e.repeat) {
      this.skipTime();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };

  private toggleFlashlight(): void {
    this.flashlightOn = !this.flashlightOn;
    this.flashlight.intensity = this.flashlightOn ? 6.5 : 0;
    this.sound.playFlashlightClick();
    this.emitHud();
  }

  private throwFirecracker(): void {
    if (this.firecrackerCooldown > 0) return;
    this.firecrackerCooldown = 3.2;

    _tmpVecA.set(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    _tmpVecB.copy(this.camera.position).addScaledVector(_tmpVecA, 0.7);
    this.viewmodel.throwFirecracker(_tmpVecB, _tmpVecA);
    this.sound.playFirecrackerFuse();
  }

  private findNearbyZipline(): { route: ZiplineRoute; reverse: boolean } | null {
    for (let i = 0; i < this.world.ziplines.length; i++) {
      const z = this.world.ziplines[i];
      if (this.playerPos.distanceTo(z.start) < 3.0) {
        return { route: z, reverse: false };
      }
      if (this.playerPos.distanceTo(z.end) < 3.0) {
        return { route: z, reverse: true };
      }
    }
    return null;
  }

  private tryInteract(): void {
    for (let i = 0; i < this.world.crates.length; i++) {
      const c = this.world.crates[i];
      if (c.collected) continue;
      if (this.playerPos.distanceTo(c.position) < 3.6) {
        c.collected = true;
        c.group.visible = false;
        this.sound.playScavenge();

        const collectedCount = this.world.crates.filter((cr) => cr.collected).length;
        if (collectedCount === 1) {
          this.setSubtitle(
            'OVERWATCH RADIO',
            'First Antizin crate secured! Two left — watch the alleys, armored Brutes guard the heavy caches.',
            7.5,
          );
        } else if (collectedCount === 2) {
          this.setSubtitle(
            'OVERWATCH RADIO',
            'Two Antizin crates recovered! One remaining. Use rooftop ziplines if Night Hunters chase!',
            7.5,
          );
        } else if (collectedCount === 3) {
          this.setSubtitle(
            'OVERWATCH RADIO',
            'All 3 Antizin crates secured! Zip or sprint north to the Taj Mahal UV Safe House gate now!',
            9.5,
          );
        }
        this.emitHud();
        return;
      }
    }

    if (this.isNearGuardTower()) {
      this.openRadio();
      return;
    }

    const zipHit = this.findNearbyZipline();
    if (zipHit && !this.activeZipline) {
      this.activeZipline = zipHit.route;
      this.ziplineReverse = zipHit.reverse;
      this.ziplineT = 0;
      this.slideTimer = 0;
      this.mantling = false;
      this.sound.playMantle();
    }
  }

  private tryParkourSlide(): void {
    if (
      !this.onGround ||
      this.mantling ||
      this.vaulting ||
      this.activeZipline ||
      this.slideTimer > 0 ||
      this.slideCooldown > 0
    ) {
      return;
    }
    const speed = Math.hypot(this.playerVel.x, this.playerVel.z);
    if (speed < 4.5) return;

    this.slideTimer = 0.54;
    this.slideCooldown = 0.85;
    this.slideDustTimer = 0.08;
    this.slideDir.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
    this.viewmodel.spawnDustPuffs(this.playerPos, 6);
    this.sound.playSlideScrape();
    this.sound.playWindRush(0.6);
  }

  // =========================================================================
  // ARKHAM-STYLE FREEFLOW COMBAT: STRIKE + LUNGE, COUNTER, KICK, TAKEDOWN
  // =========================================================================
  private performMeleeAttack(): void {
    if (this.attackCooldown > 0 || this.mantling) return;
    this.attackCooldown = 0.34;
    this.viewmodel.triggerSwing();
    this.sound.playPipeSwing();

    const lookX = -Math.sin(this.yaw);
    const lookZ = -Math.cos(this.yaw);
    let bestTarget: ZombieActor | null = null;
    let bestScore = Infinity;

    for (const z of this.zombies.zombies) {
      if (z.state === 'dead') continue;
      const dx = z.pos.x - this.playerPos.x;
      const dz = z.pos.z - this.playerPos.z;
      const dy = Math.abs(z.pos.y - this.playerPos.y);
      const dist = Math.hypot(dx, dz);
      if (dist > 4.6 || dy > 2.2) continue;

      const dot = (dx * lookX + dz * lookZ) / (dist || 1);
      if (dot > 0.25) {
        const score = dist - dot * 1.4;
        if (score < bestScore) {
          bestScore = score;
          bestTarget = z;
        }
      }
    }

    if (bestTarget) {
      const dx = bestTarget.pos.x - this.playerPos.x;
      const dz = bestTarget.pos.z - this.playerPos.z;
      const dist = Math.hypot(dx, dz) || 1;
      const nx = dx / dist;
      const nz = dz / dist;

      this.targetYawGoal = Math.atan2(-nx, -nz);
      if (dist > 1.65) {
        this.lungeTimer = 0.14;
        this.lungeVel.set(nx * 14, 0, nz * 14);
      }

      const bruteToPlayerX = -nx;
      const bruteToPlayerZ = -nz;
      const bruteForwardX = Math.sin(bestTarget.yaw);
      const bruteForwardZ = Math.cos(bestTarget.yaw);
      const facingPlayer = bruteToPlayerX * bruteForwardX + bruteToPlayerZ * bruteForwardZ;
      const lureActive = this.viewmodel.getActiveLurePosition() !== null;

      if (bestTarget.kind === 'brute' && bestTarget.state !== 'stunned' && facingPlayer > 0.2 && !lureActive) {
        this.viewmodel.triggerBlocked();
        this.sound.playPipeHit(false, true);
        this.cameraShake = 0.22;
        _tmpVecA.copy(bestTarget.pos).setY(bestTarget.pos.y + 1.3);
        this.viewmodel.spawnSparks(_tmpVecA, 0x94a3b8, 12);
        this.setSubtitle(
          'COMBAT TIP',
          'Brute blocked frontal strike! Counter [Right-Click], Kick [C], or lure with Firecracker [Q]!',
          4.2,
        );
        return;
      }

      const damage = 32 + Math.min(20, this.comboCount * 3);
      _tmpVecB.set(nx, 0, nz);
      const killed = this.zombies.damageZombie(bestTarget, damage, _tmpVecB, 5.4, 0.45);
      if (killed) this.killCount++;

      this.hitstopTimer = 0.04;
      this.cameraShake = 0.18;
      this.registerComboHit(1);
      this.sound.playPipeHit(false, false);
      const sparkY = bestTarget.kind === 'dog' ? 0.65 : 1.35;
      _tmpVecA.copy(bestTarget.pos).setY(bestTarget.pos.y + sparkY);
      this.viewmodel.spawnBloodAndSparks(_tmpVecA, _tmpVecB, 11);
    }
  }

  private performParkourKick(): void {
    if (this.kickCooldown > 0 || this.mantling) return;
    const airborne = !this.onGround;
    this.kickCooldown = airborne ? 1.05 : 0.85;
    this.viewmodel.triggerKick(airborne);

    const lookX = -Math.sin(this.yaw);
    const lookZ = -Math.cos(this.yaw);

    if (airborne) {
      // Flying Dropkick forward kinetic boost!
      this.dropkickTimer = 0.36;
      this.playerVel.x += lookX * 5.5;
      this.playerVel.z += lookZ * 5.5;
      this.playerVel.y = Math.max(this.playerVel.y, 1.8);
    }

    const reach = airborne ? 4.2 : 3.6;
    const damage = airborne ? 38 : 24;
    const knockForce = airborne ? 15.5 : 12.5;
    const stunDur = airborne ? 1.7 : 1.35;
    let kickedAny = false;

    for (const z of this.zombies.zombies) {
      if (z.state === 'dead') continue;
      const dx = z.pos.x - this.playerPos.x;
      const dz = z.pos.z - this.playerPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > reach || Math.abs(z.pos.y - this.playerPos.y) > 2.4) continue;

      const dot = (dx * lookX + dz * lookZ) / (dist || 1);
      if (dot > 0.32) {
        kickedAny = true;
        const nx = dx / (dist || 1);
        const nz = dz / (dist || 1);
        _tmpVecB.set(nx, 0, nz);
        const killed = this.zombies.damageZombie(z, damage, _tmpVecB, knockForce, stunDur);
        if (killed) this.killCount++;
        const sparkY = z.kind === 'dog' ? 0.6 : 1.1;
        _tmpVecA.copy(z.pos).setY(z.pos.y + sparkY);
        this.viewmodel.spawnBloodAndSparks(_tmpVecA, _tmpVecB, airborne ? 10 : 7);
      }
    }

    this.sound.playKick(kickedAny);
    if (kickedAny) {
      this.hitstopTimer = airborne ? 0.055 : 0.04;
      this.cameraShake = airborne ? 0.3 : 0.22;
      this.registerComboHit(1);
    }
  }

  private performCounterParry(): void {
    if (this.mantling) return;
    let counteredAny = false;

    for (const z of this.zombies.zombies) {
      if (z.state !== 'windup') continue;
      const dx = z.pos.x - this.playerPos.x;
      const dz = z.pos.z - this.playerPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= 5.5 && Math.abs(z.pos.y - this.playerPos.y) < 2.5) {
        counteredAny = true;
        const nx = dx / (dist || 1);
        const nz = dz / (dist || 1);
        this.targetYawGoal = Math.atan2(-nx, -nz);

        _tmpVecB.set(nx, 0, nz);
        const killed = this.zombies.damageZombie(z, 52, _tmpVecB, 12.5, 1.85);
        if (killed) this.killCount++;

        const sparkY = z.kind === 'dog' ? 0.72 : 1.4;
        _tmpVecA.copy(z.pos).setY(z.pos.y + sparkY);
        this.viewmodel.spawnSparks(_tmpVecA, 0xfef08a, 14);
        this.viewmodel.spawnBloodAndSparks(_tmpVecA, _tmpVecB, 10);
        this.registerComboHit(2);
      }
    }

    this.viewmodel.triggerParry();
    if (counteredAny) {
      this.parryFlash = 0.48;
      this.hitstopTimer = 0.045;
      this.cameraShake = 0.24;
      this.sound.playCounterClang();
      this.attackCooldown = 0.14;
    } else {
      this.sound.playPipeSwing();
      this.attackCooldown = 0.22;
    }
  }

  private performHeavyTakedown(): void {
    if (this.comboCount < 5 || this.mantling) return;

    this.comboCount = 0;
    this.comboTimer = 0;
    this.slowMoTimer = 0.38;
    this.cameraShake = 0.4;
    this.parryFlash = 0.5;
    this.viewmodel.triggerTakedown(this.playerPos);
    this.sound.playHeavyTakedown();

    for (const z of this.zombies.zombies) {
      if (z.state === 'dead') continue;
      const dx = z.pos.x - this.playerPos.x;
      const dz = z.pos.z - this.playerPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= 7.0 && Math.abs(z.pos.y - this.playerPos.y) < 3.0) {
        const nx = dx / (dist || 1);
        const nz = dz / (dist || 1);
        _tmpVecB.set(nx, 0, nz);
        const killed = this.zombies.damageZombie(z, 95, _tmpVecB, 13.5, 2.2);
        if (killed) this.killCount++;
        const sparkY = z.kind === 'dog' ? 0.65 : 1.2;
        _tmpVecA.copy(z.pos).setY(z.pos.y + sparkY);
        this.viewmodel.spawnBloodAndSparks(_tmpVecA, _tmpVecB, 12);
      }
    }
    this.emitHud();
  }

  private registerComboHit(amount = 1): void {
    this.comboCount += amount;
    if (this.comboCount > this.maxCombo) this.maxCombo = this.comboCount;
    this.comboTimer = 4.8;
    this.sound.playComboChime(this.comboCount);
  }

  // =========================================================================
  // FIXED PARKOUR JUMPING, COYOTE TIME & STRICT UPWARD LEDGE MANTLING
  // =========================================================================
  private getColliderTopAt(b: BoxCollider, x: number, z: number): number {
    if (!b.ramp) return b.maxY;
    const coord = b.ramp.axis === 'x' ? x : z;
    const span = b.ramp.highCoord - b.ramp.lowCoord;
    const t = span !== 0 ? THREE.MathUtils.clamp((coord - b.ramp.lowCoord) / span, 0, 1) : 1;
    return THREE.MathUtils.lerp(b.ramp.lowY, b.ramp.highY, t);
  }

  private triggerFlowBoost(label: string, amount = 0.36): void {
    this.parkourFlow = Math.min(1, this.parkourFlow + amount);
    this.flowDecayTimer = 2.8;
    this.parkourMoveLabel = label;
    this.parkourMoveTimer = 1.35;
  }

  private performWallKick(): void {
    const fwdX = -Math.sin(this.yaw);
    const fwdZ = -Math.cos(this.yaw);
    this.playerVel.x = this.wallRunNormal.x * 7.6 + fwdX * 8.8;
    this.playerVel.z = this.wallRunNormal.z * 7.6 + fwdZ * 8.8;
    this.playerVel.y = 9.9;
    this.wallRunSide = 0;
    this.wallRunTimer = 0;
    this.wallRunCooldown = 0.22;
    this.onGround = false;
    this.jumpBufferTimer = 0;
    this.triggerFlowBoost('WALL KICK', 0.42);
    this.sound.playLedgeGrab();
    this.sound.playWindRush(0.78);
  }

  private probeWallRunSurface(): {
    side: -1 | 1;
    normalX: number;
    normalZ: number;
    tangentX: number;
    tangentZ: number;
    id: string;
  } | null {
    _forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();

    const probeReach = PLAYER_RADIUS + 0.58;
    const sides: Array<-1 | 1> = [-1, 1];

    for (const side of sides) {
      const dirX = _right.x * side;
      const dirZ = _right.z * side;
      const px = this.playerPos.x + dirX * probeReach;
      const pz = this.playerPos.z + dirZ * probeReach;

      for (let i = 0; i < this.world.colliders.length; i++) {
        const b = this.world.colliders[i];
        if (b.ramp) continue;
        if (!b.wallrunnable && b.maxY - b.minY < 2.2) continue;
        if (b.id && b.id === this.lastWallColliderId) continue;
        if (this.playerPos.y < b.minY - 0.35 || this.playerPos.y > b.maxY - 0.85) continue;

        if (px >= b.minX && px <= b.maxX && pz >= b.minZ && pz <= b.maxZ) {
          // Determine outward normal of the closest vertical face of the box
          const dMinX = Math.abs(this.playerPos.x - b.minX);
          const dMaxX = Math.abs(b.maxX - this.playerPos.x);
          const dMinZ = Math.abs(this.playerPos.z - b.minZ);
          const dMaxZ = Math.abs(b.maxZ - this.playerPos.z);
          const minDist = Math.min(dMinX, dMaxX, dMinZ, dMaxZ);

          let nx = 0;
          let nz = 0;
          if (minDist === dMinX) nx = -1;
          else if (minDist === dMaxX) nx = 1;
          else if (minDist === dMinZ) nz = -1;
          else nz = 1;

          // Must be oriented somewhat along the wall (not running head-on into it)
          const fwdDot = Math.abs(_forward.x * nx + _forward.z * nz);
          if (fwdDot > 0.68) continue;

          // Tangent direction along wall matching player's forward heading
          let tx = _forward.x - (_forward.x * nx + _forward.z * nz) * nx;
          let tz = _forward.z - (_forward.x * nx + _forward.z * nz) * nz;
          const tLen = Math.hypot(tx, tz) || 1;
          tx /= tLen;
          tz /= tLen;

          return {
            side,
            normalX: nx,
            normalZ: nz,
            tangentX: tx,
            tangentZ: tz,
            id: b.id ?? `wall_${i}`,
          };
        }
      }
    }
    return null;
  }

  private findMantleTarget(): {
    box: BoxCollider;
    targetX: number;
    targetZ: number;
    isLowVault: boolean;
  } | null {
    _forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();

    const probeDists = [0.65, 1.32, 1.72];
    let bestBox: BoxCollider | null = null;
    let bestY = -Infinity;
    let bestTX = 0;
    let bestTZ = 0;
    let bestLowVault = false;
    const wantsSprint = Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight']);

    for (const d of probeDists) {
      const px = this.playerPos.x + _forward.x * d;
      const pz = this.playerPos.z + _forward.z * d;

      for (let i = 0; i < this.world.colliders.length; i++) {
        const b = this.world.colliders[i];
        if (!b.mantleable || b.ramp) continue;

        if (px >= b.minX - 0.5 && px <= b.maxX + 0.5 && pz >= b.minZ - 0.5 && pz <= b.maxZ + 0.5) {
          const ledgeDelta = b.maxY - this.playerPos.y;
          const isRickshaw = b.id.startsWith('rickshaw_');
          const maxVaultH = isRickshaw ? 2.08 : 1.55;
          // Low obstacle Speed Vault window when sprinting (hurdles, walls, stalls, barricades, rickshaws)
          if (wantsSprint && ledgeDelta >= 0.22 && ledgeDelta <= maxVaultH && b.maxY > bestY) {
            bestY = b.maxY;
            bestBox = b;
            bestLowVault = true;

            const spanX = b.maxX - b.minX;
            const spanZ = b.maxZ - b.minZ;
            const isThinCross = Math.abs(_forward.x) > Math.abs(_forward.z) ? spanX < 2.85 : spanZ < 2.85;
            if (isThinCross) {
              // Project forward past the far exit face so diagonal vaults never snag on box corners
              const txMin = Math.abs(_forward.x) > 0.001 ? ((b.minX - 0.62) - this.playerPos.x) / _forward.x : Infinity;
              const txMax = Math.abs(_forward.x) > 0.001 ? ((b.maxX + 0.62) - this.playerPos.x) / _forward.x : Infinity;
              const tzMin = Math.abs(_forward.z) > 0.001 ? ((b.minZ - 0.62) - this.playerPos.z) / _forward.z : Infinity;
              const tzMax = Math.abs(_forward.z) > 0.001 ? ((b.maxZ + 0.62) - this.playerPos.z) / _forward.z : Infinity;
              const exitT = Math.min(Math.max(txMin, txMax), Math.max(tzMin, tzMax));
              const stepDist = Number.isFinite(exitT) && exitT > d && exitT < 3.6 ? exitT : d + 1.85;
              bestTX = this.playerPos.x + _forward.x * stepDist;
              bestTZ = this.playerPos.z + _forward.z * stepDist;
            } else {
              const padX = Math.min(0.45, spanX * 0.35);
              const padZ = Math.min(0.45, spanZ * 0.35);
              bestTX = THREE.MathUtils.clamp(this.playerPos.x + _forward.x * (d + 0.72), b.minX + padX, b.maxX - padX);
              bestTZ = THREE.MathUtils.clamp(this.playerPos.z + _forward.z * (d + 0.72), b.minZ + padZ, b.maxZ - padZ);
            }
          } else if (ledgeDelta >= 0.32 && ledgeDelta <= 2.85 && b.maxY > bestY) {
            bestY = b.maxY;
            bestBox = b;
            bestLowVault = false;
            const padX = Math.min(0.46, (b.maxX - b.minX) * 0.35);
            const padZ = Math.min(0.46, (b.maxZ - b.minZ) * 0.35);
            bestTX = THREE.MathUtils.clamp(this.playerPos.x + _forward.x * (d + 0.45), b.minX + padX, b.maxX - padX);
            bestTZ = THREE.MathUtils.clamp(this.playerPos.z + _forward.z * (d + 0.45), b.minZ + padZ, b.maxZ - padZ);
          }
        }
      }
    }

    return bestBox ? { box: bestBox, targetX: bestTX, targetZ: bestTZ, isLowVault: bestLowVault } : null;
  }

  private tryJumpOrMantle(): void {
    if (this.mantling || this.vaulting || this.rollTimer > 0) return;

    const wantsSprint = Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight']);
    const mantle = this.findMantleTarget();

    // 1. Sprinting + Space right in front of a low obstacle triggers an instant one-handed Speed Vault!
    if (wantsSprint && mantle && mantle.isLowVault) {
      this.beginVault(mantle.box, mantle.targetX, mantle.targetZ);
      return;
    }

    // 2. If grounded or inside 150ms coyote window, jump cleanly!
    if (this.onGround || this.coyoteTimer > 0) {
      const onRamp = this.playerPos.y > 0.16 && this.world.colliders.some(
        (b) =>
          b.ramp &&
          this.playerPos.x >= b.minX - 0.35 &&
          this.playerPos.x <= b.maxX + 0.35 &&
          this.playerPos.z >= b.minZ - 0.35 &&
          this.playerPos.z <= b.maxZ + 0.35,
      );
      this.playerVel.y = onRamp ? 10.8 : 9.5;
      if (onRamp) {
        this.playerVel.x *= 1.18;
        this.playerVel.z *= 1.18;
        this.triggerFlowBoost('RAMP LAUNCH', 0.28);
      }
      this.onGround = false;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      this.slideTimer = 0;
      this.sound.playWindRush(0.45);
      return;
    }

    // 3. If airborne and pressing Space near an upper ledge, vault or mantle up!
    if (mantle) {
      if (mantle.isLowVault && wantsSprint) {
        this.beginVault(mantle.box, mantle.targetX, mantle.targetZ);
      } else {
        this.beginMantle(mantle.box, mantle.targetX, mantle.targetZ);
      }
    }
  }

  private beginMantle(b: BoxCollider, targetX: number, targetZ: number): void {
    this.preMantleSpeed = Math.hypot(this.playerVel.x, this.playerVel.z);
    this.mantling = true;
    this.mantleTimer = 0;
    this.slideTimer = 0;
    this.wallRunSide = 0;
    this.wallRunTimer = 0;
    this.mantleStart.copy(this.playerPos);
    this.mantleEnd.set(targetX, b.maxY + 0.02, targetZ);
    this.playerVel.set(0, 0, 0);
    this.jumpBufferTimer = 0;
    this.triggerFlowBoost('LEDGE MANTLE', 0.26);
    this.sound.playLedgeGrab();
    this.sound.playWindRush(0.55);
  }

  private beginVault(b: BoxCollider, targetX: number, targetZ: number): void {
    this.preVaultSpeed = Math.hypot(this.playerVel.x, this.playerVel.z);
    this.vaulting = true;
    this.vaultTimer = 0;
    this.slideTimer = 0;
    this.wallRunSide = 0;
    this.wallRunTimer = 0;
    this.vaultStart.copy(this.playerPos);
    const landedPast =
      targetX <= b.minX - PLAYER_RADIUS ||
      targetX >= b.maxX + PLAYER_RADIUS ||
      targetZ <= b.minZ - PLAYER_RADIUS ||
      targetZ >= b.maxZ + PLAYER_RADIUS;
    this.vaultEnd.set(targetX, landedPast ? Math.min(this.playerPos.y, b.minY) : b.maxY + 0.02, targetZ);
    this.vaultPeakY = b.maxY + 0.52;
    this.jumpBufferTimer = 0;
    this.triggerFlowBoost('SPEED VAULT', 0.36);
    this.sound.playLedgeGrab();
    this.sound.playWindRush(0.88);
  }

  private updatePlayerPhysics(dt: number): void {
    this.wallRunCooldown = Math.max(0, this.wallRunCooldown - dt);
    this.rollBufferTimer = Math.max(0, this.rollBufferTimer - dt);
    this.parkourMoveTimer = Math.max(0, this.parkourMoveTimer - dt);
    if (this.flowDecayTimer > 0) {
      this.flowDecayTimer = Math.max(0, this.flowDecayTimer - dt);
    } else if (this.parkourFlow > 0) {
      this.parkourFlow = Math.max(0, this.parkourFlow - dt * 0.25);
    }

    // 0A. Zipline aerial traversal across Agra rooftops
    if (this.activeZipline) {
      const a = this.ziplineReverse ? this.activeZipline.end : this.activeZipline.start;
      const b = this.ziplineReverse ? this.activeZipline.start : this.activeZipline.end;
      const totalLen = a.distanceTo(b) || 1;
      this.ziplineT += (16.5 * dt) / totalLen;
      if (Math.random() < dt * 14) {
        _tmpVecA.copy(this.playerPos).setY(this.playerPos.y + 1.85);
        this.viewmodel.spawnSparks(_tmpVecA, 0xfde047, 1);
      }
      if (this.ziplineT >= 1) {
        this.playerPos.copy(b);
        this.activeZipline = null;
        this.onGround = true;
        this.playerVel.set(-Math.sin(this.yaw) * 8.5, 0, -Math.cos(this.yaw) * 8.5);
        this.triggerFlowBoost('ZIPLINE FINISH', 0.25);
      } else {
        this.playerPos.lerpVectors(a, b, this.ziplineT);
      }
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 88, Math.min(1, dt * 8));
      this.camera.updateProjectionMatrix();
      return;
    }

    // 0B. Watchtower Ladder Climbing
    if (!this.activeLadder && !this.mantling && !this.vaulting) {
      const climbUpInput = Boolean(this.keys['KeyW'] || this.keys['Space']);
      const climbDownInput = Boolean(this.keys['KeyS']);
      for (const lad of this.world.ladders) {
        if (
          this.playerPos.x >= lad.minX &&
          this.playerPos.x <= lad.maxX &&
          this.playerPos.z >= lad.minZ &&
          this.playerPos.z <= lad.maxZ &&
          this.playerPos.y >= lad.minY - 0.1 &&
          this.playerPos.y <= lad.maxY + 0.1
        ) {
          if ((climbUpInput && this.playerPos.y < lad.maxY - 0.12) || (climbDownInput && this.playerPos.y > 0.25)) {
            this.activeLadder = lad;
            this.slideTimer = 0;
            this.wallRunSide = 0;
            this.playerVel.set(0, 0, 0);
            break;
          }
        }
      }
    }

    if (this.activeLadder) {
      const lad = this.activeLadder;
      const cx = (lad.minX + lad.maxX) * 0.5;
      const cz = (lad.minZ + lad.maxZ) * 0.5;
      this.playerPos.x = THREE.MathUtils.lerp(this.playerPos.x, cx, Math.min(1, dt * 12));
      this.playerPos.z = THREE.MathUtils.lerp(this.playerPos.z, cz, Math.min(1, dt * 12));

      const climbDir =
        this.keys['KeyW'] || this.keys['Space'] ? 1 : this.keys['KeyS'] ? -1 : 0;
      this.playerPos.y += climbDir * (climbDir > 0 ? 3.85 : 3.4) * dt;
      this.playerVel.set(0, 0, 0);
      this.onGround = false;

      if (climbDir !== 0) {
        this.ladderStepTimer -= dt;
        if (this.ladderStepTimer <= 0) {
          this.ladderStepTimer = 0.28;
          this.sound.playWallStep(Math.floor(this.elapsed * 4) % 4);
        }
      }

      if (this.playerPos.y >= lad.maxY - 0.08 && climbDir >= 0) {
        this.playerPos.set(lad.exitX, lad.exitY, lad.exitZ);
        this.activeLadder = null;
        this.onGround = true;
        this.triggerFlowBoost('LADDER CLIMB', 0.2);
      } else if (this.playerPos.y <= lad.minY + 0.02 && climbDir < 0) {
        this.playerPos.y = lad.minY;
        this.activeLadder = null;
        this.onGround = true;
      } else if (this.keys['KeyA'] || this.keys['KeyD']) {
        this.activeLadder = null;
      }
      return;
    }

    // 1A. Handle active One-Handed Speed Vault (0.3s, 15-degree camera tilt, full momentum carried!)
    if (this.vaulting) {
      this.vaultTimer += dt;
      const t = Math.min(1, this.vaultTimer / 0.3);
      this.playerPos.x = THREE.MathUtils.lerp(this.vaultStart.x, this.vaultEnd.x, t);
      this.playerPos.z = THREE.MathUtils.lerp(this.vaultStart.z, this.vaultEnd.z, t);
      const baseY = THREE.MathUtils.lerp(this.vaultStart.y, this.vaultEnd.y, t);
      const lift = Math.max(0, this.vaultPeakY - baseY);
      this.playerPos.y = baseY + Math.sin(t * Math.PI) * lift;
      this.mantlePitchOffset = -Math.sin(t * Math.PI) * 0.14;
      this.mantleRollOffset = Math.sin(t * Math.PI) * 0.26; // 15 deg (0.26 rad) vault roll!
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 88 + this.parkourFlow * 3, Math.min(1, dt * 12));
      this.camera.updateProjectionMatrix();
      if (t >= 1) {
        this.playerPos.copy(this.vaultEnd);
        this.vaulting = false;
        this.onGround = true;
        this.coyoteTimer = 0.15;
        this.mantlePitchOffset = 0;
        this.mantleRollOffset = 0;
        const sprintSpeed = Math.max(this.preVaultSpeed, 11.4 + this.parkourFlow * 2.0);
        this.playerVel.x = -Math.sin(this.yaw) * sprintSpeed;
        this.playerVel.z = -Math.cos(this.yaw) * sprintSpeed;
      }
      return;
    }

    // 1B. Handle active Ledge Mantle / Climb-Up (0.42s with realistic initial weight dip)
    if (this.mantling) {
      this.mantleTimer += dt;
      const t = Math.min(1, this.mantleTimer / 0.42);
      const ease = 1 - Math.pow(1 - t, 3);
      this.playerPos.lerpVectors(this.mantleStart, this.mantleEnd, ease);
      const catchDip = t < 0.35 ? -Math.sin((t / 0.35) * Math.PI) * 0.2 : Math.sin(((t - 0.35) / 0.65) * Math.PI) * 0.2;
      this.playerPos.y += catchDip;
      this.mantlePitchOffset = t < 0.35 ? Math.sin((t / 0.35) * Math.PI) * 0.1 : -Math.sin(t * Math.PI) * 0.16;
      this.mantleRollOffset = Math.sin(t * Math.PI) * 0.065;
      if (t >= 1) {
        this.playerPos.copy(this.mantleEnd);
        this.mantling = false;
        this.onGround = true;
        this.coyoteTimer = 0.15;
        this.mantlePitchOffset = 0;
        this.mantleRollOffset = 0;
        const wantsSprintCarry = Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight']) || this.preMantleSpeed > 8.5;
        if (this.keys['KeyW'] || wantsSprintCarry) {
          const fwdSpeed = wantsSprintCarry ? Math.max(this.preMantleSpeed, 10.8 + this.parkourFlow * 2.0) : 6.8;
          this.playerVel.x = -Math.sin(this.yaw) * fwdSpeed;
          this.playerVel.z = -Math.cos(this.yaw) * fwdSpeed;
        }
      }
      return;
    }

    this.mantlePitchOffset = THREE.MathUtils.lerp(this.mantlePitchOffset, 0, Math.min(1, dt * 14));
    this.mantleRollOffset = THREE.MathUtils.lerp(this.mantleRollOffset, 0, Math.min(1, dt * 14));
    this.landingDipOffset = THREE.MathUtils.lerp(this.landingDipOffset, 0, Math.min(1, dt * 11));

    // Smooth camera yaw toward Arkham lunge target
    if (this.targetYawGoal !== null) {
      let diff = ((this.targetYawGoal - this.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (diff < -Math.PI) diff += Math.PI * 2;
      this.yaw += diff * Math.min(1, dt * 16);
      if (Math.abs(diff) < 0.03) this.targetYawGoal = null;
    }

    // Movement input
    const moveFwd = (this.keys['KeyW'] ? 1 : 0) - (this.keys['KeyS'] ? 1 : 0);
    const moveStrafe = (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0);

    _forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    _moveDir.set(0, 0, 0).addScaledVector(_forward, moveFwd).addScaledVector(_right, moveStrafe);
    const moving = _moveDir.lengthSq() > 0.001;
    if (moving) _moveDir.normalize();

    const wantsSprint = Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight']);
    const isSprinting = wantsSprint && moving && this.stamina > 2;

    if (isSprinting) {
      this.stamina = Math.max(0, this.stamina - 20 * dt);
      this.staminaPauseTimer = 0.65;
      this.sprintWindTimer -= dt;
      if (this.sprintWindTimer <= 0 && this.onGround) {
        this.sprintWindTimer = 0.55;
        this.sound.playWindRush(0.28 + this.parkourFlow * 0.25);
      }
    } else {
      this.staminaPauseTimer = Math.max(0, this.staminaPauseTimer - dt);
      if (this.staminaPauseTimer <= 0) {
        this.stamina = Math.min(this.maxStamina, this.stamina + 32 * dt);
      }
    }

    // Active Safety Landing Roll (360-degree forward camera tumble + momentum carry)
    if (this.rollTimer > 0) {
      this.rollTimer = Math.max(0, this.rollTimer - dt);
      const p = 1 - this.rollTimer / 0.42;
      this.rollPitchOffset = -p * Math.PI * 2;
      const rollSpeed = 11.4 * (1 - p * 0.2);
      this.playerVel.x = this.rollDir.x * rollSpeed;
      this.playerVel.z = this.rollDir.z * rollSpeed;
      if (this.rollTimer <= 0) {
        this.rollPitchOffset = 0;
      }
    } else {
      this.rollPitchOffset = 0;
    }

    // Wall Run Detection & Traversal when airborne near vertical walls
    const horizSpeed = Math.hypot(this.playerVel.x, this.playerVel.z);
    if (!this.onGround && this.rollTimer <= 0 && moveFwd > 0) {
      const probe = this.probeWallRunSurface();
      if (this.wallRunSide !== 0) {
        if (this.wallRunTimer > 0 && probe && probe.side === this.wallRunSide) {
          this.wallRunTimer -= dt;
          this.wallRunNormal.set(probe.normalX, 0, probe.normalZ);
          this.wallRunTangent.set(probe.tangentX, 0, probe.tangentZ);
          this.wallRunStepTimer -= dt;
          if (this.wallRunStepTimer <= 0) {
            this.wallRunStepTimer = 0.22;
            this.wallRunStepCount++;
            this.sound.playWallStep(this.wallRunStepCount);
          }
          const wrSpeed = 12.2 + this.parkourFlow * 1.6;
          this.playerVel.x = this.wallRunTangent.x * wrSpeed;
          this.playerVel.z = this.wallRunTangent.z * wrSpeed;
          this.playerVel.y = Math.max(-1.8, this.playerVel.y - 7.0 * dt);
        } else {
          this.wallRunSide = 0;
          this.wallRunCooldown = 0.24;
        }
      } else if (
        this.wallRunCooldown <= 0 &&
        (wantsSprint || horizSpeed > 5.4) &&
        this.playerVel.y > -8.5 &&
        probe
      ) {
        this.wallRunSide = probe.side;
        this.wallRunTimer = 1.15;
        this.wallRunNormal.set(probe.normalX, 0, probe.normalZ);
        this.wallRunTangent.set(probe.tangentX, 0, probe.tangentZ);
        this.lastWallColliderId = probe.id;
        this.wallRunStepTimer = 0.03;
        this.wallRunStepCount = 1;
        this.playerVel.y = Math.max(this.playerVel.y, 2.5);
        this.triggerFlowBoost('WALL RUN', 0.35);
        this.sound.playWallStep(1);
        this.sound.playWindRush(0.55);
      }
    } else if (this.onGround || moveFwd <= 0) {
      this.wallRunSide = 0;
    }

    const baseSpeed = isSprinting ? 10.8 + this.parkourFlow * 2.2 : 6.7;
    if (this.lungeTimer > 0) {
      this.lungeTimer -= dt;
      this.playerVel.x = this.lungeVel.x;
      this.playerVel.z = this.lungeVel.z;
    } else if (this.rollTimer > 0) {
      // Velocity already carried smoothly during safety roll
    } else if (this.wallRunSide !== 0) {
      // Velocity driven cleanly along wallRunTangent
    } else if (this.slideTimer > 0) {
      this.slideTimer -= dt;
      this.slideDustTimer -= dt;
      if (this.slideDustTimer <= 0) {
        this.slideDustTimer = 0.09;
        this.viewmodel.spawnDustPuffs(this.playerPos, 3);
      }
      const slideSpeed = 14.2 * (0.45 + 0.55 * (this.slideTimer / 0.54));
      this.playerVel.x = this.slideDir.x * slideSpeed;
      this.playerVel.z = this.slideDir.z * slideSpeed;
      // Slide knocks down/trips zombies in path
      for (const z of this.zombies.zombies) {
        if (z.state === 'dead' || z.state === 'stunned') continue;
        if (this.playerPos.distanceTo(z.pos) < 1.9 && Math.abs(this.playerPos.y - z.pos.y) < 1.5) {
          const killed = this.zombies.damageZombie(z, 14, this.slideDir, 10.2, 1.25);
          if (killed) this.killCount++;
          this.sound.playKick(true);
        }
      }
    } else {
      const accel = this.onGround ? 16 : 9.5;
      this.playerVel.x = THREE.MathUtils.lerp(this.playerVel.x, _moveDir.x * baseSpeed, Math.min(1, accel * dt));
      this.playerVel.z = THREE.MathUtils.lerp(this.playerVel.z, _moveDir.z * baseSpeed, Math.min(1, accel * dt));
    }

    const targetEyeOff =
      this.rollTimer > 0
        ? -Math.sin((1 - this.rollTimer / 0.42) * Math.PI) * 0.78
        : this.slideTimer > 0
          ? -0.82
          : 0;
    this.eyeHeightOffset = THREE.MathUtils.lerp(this.eyeHeightOffset, targetEyeOff, Math.min(1, dt * 16));

    // Update coyote & jump buffer timers
    if (this.onGround) {
      this.coyoteTimer = 0.14;
      this.lastWallColliderId = '';
      if (this.jumpBufferTimer > 0) {
        this.jumpBufferTimer = 0;
        this.playerVel.y = 9.4;
        this.onGround = false;
        this.coyoteTimer = 0;
      }
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
    }

    // Gravity (skip full gravity while wall-running)
    if (this.wallRunSide === 0) {
      this.playerVel.y -= 21 * dt;
    }

    // Auto-vault or Auto-mantle if airborne & moving forward toward an edge!
    const mantlePreview = this.findMantleTarget();
    this.canMantle = mantlePreview !== null;
    if (
      !this.onGround &&
      this.rollTimer <= 0 &&
      moveFwd > 0 &&
      (this.playerVel.y < 5.8 || this.keys['Space'] || this.wallRunSide !== 0) &&
      mantlePreview
    ) {
      if (mantlePreview.isLowVault && wantsSprint) {
        this.beginVault(mantlePreview.box, mantlePreview.targetX, mantlePreview.targetZ);
      } else {
        this.beginMantle(mantlePreview.box, mantlePreview.targetX, mantlePreview.targetZ);
      }
      return;
    }

    // Integrate X/Z then resolve horizontal collisions
    this.playerPos.x += this.playerVel.x * dt;
    this.playerPos.z += this.playerVel.z * dt;

    for (let i = 0; i < this.world.colliders.length; i++) {
      const b = this.world.colliders[i];
      const boxTop = this.getColliderTopAt(b, this.playerPos.x, this.playerPos.z);
      if (this.playerPos.y >= boxTop - 0.12 || this.playerPos.y + PLAYER_EYE_HEIGHT < b.minY) continue;

      const closestX = Math.max(b.minX, Math.min(this.playerPos.x, b.maxX));
      const closestZ = Math.max(b.minZ, Math.min(this.playerPos.z, b.maxZ));
      const dx = this.playerPos.x - closestX;
      const dz = this.playerPos.z - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < PLAYER_RADIUS * PLAYER_RADIUS) {
        if (b.ramp && this.playerPos.y >= boxTop - 0.72) {
          this.playerPos.y = boxTop;
        } else if (this.onGround && boxTop - this.playerPos.y <= 0.64) {
          this.playerPos.y = boxTop;
        } else {
          const dist = Math.sqrt(distSq) || 0.001;
          const nx = dx / dist;
          const nz = dz / dist;
          const push = PLAYER_RADIUS - dist;
          this.playerPos.x += nx * push;
          this.playerPos.z += nz * push;
          // Slide velocity cleanly along corners/edges instead of dead-stopping momentum
          const vn = this.playerVel.x * nx + this.playerVel.z * nz;
          if (vn < 0) {
            this.playerVel.x -= nx * vn;
            this.playerVel.z -= nz * vn;
          }
        }
      }
    }

    this.playerPos.x = THREE.MathUtils.clamp(this.playerPos.x, -44.2, 44.2);
    this.playerPos.z = THREE.MathUtils.clamp(this.playerPos.z, -93, 49.5);

    // Integrate Y and resolve ground / roof / thin bridge planks / sloped ramps
    const prevY = this.playerPos.y;
    const impactVel = this.playerVel.y;
    this.playerPos.y += this.playerVel.y * dt;

    let groundHeight = 0;
    let landedCushion = false;
    for (let i = 0; i < this.world.colliders.length; i++) {
      const b = this.world.colliders[i];
      if (
        this.playerPos.x + PLAYER_RADIUS * 0.72 > b.minX &&
        this.playerPos.x - PLAYER_RADIUS * 0.72 < b.maxX &&
        this.playerPos.z + PLAYER_RADIUS * 0.72 > b.minZ &&
        this.playerPos.z - PLAYER_RADIUS * 0.72 < b.maxZ
      ) {
        const topY = this.getColliderTopAt(b, this.playerPos.x, this.playerPos.z);
        const snapMargin = b.ramp ? 0.7 : 0.34;
        if (prevY >= topY - snapMargin && this.playerPos.y <= topY + (b.ramp ? 0.28 : 0.04)) {
          if (topY >= groundHeight) {
            groundHeight = topY;
            landedCushion = Boolean(b.cushion);
          }
        }
      }
    }

    if (this.playerPos.y <= groundHeight) {
      if (!this.onGround && impactVel < -7.2) {
        if (impactVel < -10.2 && (this.rollBufferTimer > 0 || landedCushion)) {
          // Dying Light Active Safety Landing Roll (negates heavy stun & converts drop into forward flow!)
          this.rollTimer = 0.42;
          this.rollBufferTimer = 0;
          this.rollDir.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
          this.sound.playSafetyRoll();
          if (landedCushion) this.sound.playTarpLand();
          this.cameraShake = 0.07;
          this.landingDipOffset = -0.22;
          this.viewmodel.spawnDustPuffs(this.playerPos, 9);
          this.triggerFlowBoost('SAFETY ROLL', 0.42);
        } else if (landedCushion) {
          this.sound.playTarpLand();
          this.landingDipOffset = -0.18;
        } else {
          const heavy = impactVel < -12.5;
          this.sound.playLandingThud(heavy);
          this.cameraShake = heavy ? 0.24 : 0.11;
          this.landingDipOffset = heavy ? -0.34 : -0.15;
          this.viewmodel.spawnDustPuffs(this.playerPos, heavy ? 10 : 5);
        }
      }
      this.playerPos.y = groundHeight;
      this.playerVel.y = 0;
      this.onGround = true;
      this.wallRunSide = 0;
    } else {
      this.onGround = false;
    }

    // Smooth dynamic FOV widening while sprinting, wall-running, sliding, or dropkicking
    const targetFov =
      this.dropkickTimer > 0 || this.slideTimer > 0 || this.rollTimer > 0
        ? 90
        : this.wallRunSide !== 0
          ? 87
          : isSprinting
            ? 84 + this.parkourFlow * 4.5
            : 76;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, Math.min(1, dt * 10));
      this.camera.updateProjectionMatrix();
    }
  }

  private syncCameraToPlayer(dt: number): void {
    const moveMag = Math.hypot(this.playerVel.x, this.playerVel.z);
    const bob =
      (this.onGround || this.wallRunSide !== 0) &&
      moveMag > 0.8 &&
      !this.mantling &&
      !this.vaulting &&
      this.slideTimer <= 0 &&
      this.rollTimer <= 0
        ? Math.sin(this.elapsed * (moveMag > 8 ? 14 : 9)) * 0.048
        : 0;
    const sprintSwayRoll =
      this.onGround && moveMag > 8 && !this.mantling && !this.vaulting && this.slideTimer <= 0 && this.rollTimer <= 0
        ? Math.cos(this.elapsed * 7.0) * 0.014
        : 0;

    const shakeX = this.cameraShake > 0 ? (Math.random() - 0.5) * this.cameraShake * 0.25 : 0;
    const shakeY = this.cameraShake > 0 ? (Math.random() - 0.5) * this.cameraShake * 0.25 : 0;

    this.camera.position.set(
      this.playerPos.x + shakeX,
      this.playerPos.y + PLAYER_EYE_HEIGHT + this.eyeHeightOffset + this.landingDipOffset + bob + shakeY,
      this.playerPos.z,
    );
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = THREE.MathUtils.clamp(this.pitch + this.mantlePitchOffset, -1.45, 1.45) + this.rollPitchOffset;

    const strafe = (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0);
    const slideRoll = this.slideTimer > 0 ? -0.095 : 0;
    const wallRunRoll = this.wallRunSide * -0.22;
    const targetRoll = -strafe * 0.02 + this.mantleRollOffset + slideRoll + wallRunRoll + sprintSwayRoll;
    this.camera.rotation.z = THREE.MathUtils.lerp(this.camera.rotation.z, targetRoll, Math.min(1, (dt || 0.016) * 12));
  }

  // =========================================================================
  // DYNAMIC DAY / NIGHT CYCLE WITH GOLDEN SUNSET SKY & MOONLIGHT
  // =========================================================================
  private isNightTime(): boolean {
    return this.timeOfDay >= 0.08 && this.timeOfDay < 0.52;
  }

  private formatClock24h(): string {
    const hoursFloat = (18.9834 + this.timeOfDay * 24) % 24;
    const h = Math.floor(hoursFloat);
    const m = Math.floor((hoursFloat - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  private getTimeLabel(): string {
    if (this.timeOfDay >= 0.08 && this.timeOfDay < 0.52) return 'Nightfall · UV Active';
    if (this.timeOfDay >= 0.52 && this.timeOfDay < 0.7) return 'Agra Dawn';
    return 'Golden Dusk';
  }

  private updateAtmosphere(dt: number): void {
    if (this.phase === 'playing') {
      this.timeOfDay = (this.timeOfDay + dt / FULL_CYCLE_SECONDS) % 1;
    }

    const t = this.timeOfDay;
    const isNight = this.isNightTime();

    if (this.phase === 'playing' && isNight && !this.wasNight) {
      if (!this.flashlightOn) {
        this.flashlightOn = true;
        this.flashlight.intensity = 6.5;
        this.sound.playFlashlightClick();
      }
      if (!this.nightSubtitleShown) {
        this.nightSubtitleShown = true;
        this.setSubtitle(
          'OVERWATCH RADIO',
          'Nightfall! UV lights are active at the Taj Mahal. Night Runners are hunting — watch your back!',
          8.5,
        );
      }
    }
    this.wasNight = isNight;

    let nightFactor = 0;
    if (t < 0.08) {
      const k = t / 0.08;
      this.skyMat.uniforms.topColor.value.lerpColors(_skyTopDay, _skyTopTwilight, k);
      this.skyMat.uniforms.horizonColor.value.lerpColors(_skyHorizDay, _skyHorizTwilight, k);
      nightFactor = k * 0.45;
    } else if (t < 0.16) {
      const k = (t - 0.08) / 0.08;
      this.skyMat.uniforms.topColor.value.lerpColors(_skyTopTwilight, _skyTopNight, k);
      this.skyMat.uniforms.horizonColor.value.lerpColors(_skyHorizTwilight, _skyHorizNight, k);
      nightFactor = 0.45 + k * 0.55;
    } else if (t < 0.46) {
      this.skyMat.uniforms.topColor.value.copy(_skyTopNight);
      this.skyMat.uniforms.horizonColor.value.copy(_skyHorizNight);
      nightFactor = 1.0;
    } else if (t < 0.58) {
      const k = (t - 0.46) / 0.12;
      this.skyMat.uniforms.topColor.value.lerpColors(_skyTopNight, _skyTopTwilight, k);
      this.skyMat.uniforms.horizonColor.value.lerpColors(_skyHorizNight, _skyHorizDay, k);
      nightFactor = 1.0 - k * 0.7;
    } else if (t < 0.72) {
      const k = (t - 0.58) / 0.14;
      this.skyMat.uniforms.topColor.value.lerpColors(_skyTopTwilight, _skyTopDay, k);
      this.skyMat.uniforms.horizonColor.value.copy(_skyHorizDay);
      nightFactor = 0.3 * (1 - k);
    } else {
      this.skyMat.uniforms.topColor.value.copy(_skyTopDay);
      this.skyMat.uniforms.horizonColor.value.copy(_skyHorizDay);
      nightFactor = 0;
    }

    _skyFogCurrent.copy(this.skyMat.uniforms.horizonColor.value);
    (this.scene.background as THREE.Color).copy(_skyFogCurrent);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(_skyFogCurrent);
      this.scene.fog.density = THREE.MathUtils.lerp(0.0068, 0.018, nightFactor);
    }

    const sunAngle = t * Math.PI * 2;
    _sunDir.set(Math.cos(sunAngle) * 0.45, 0.22 + Math.cos(sunAngle) * 0.16, -0.88).normalize();
    this.skyMat.uniforms.sunDir.value.copy(_sunDir);
    this.skyMat.uniforms.sunColor.value.lerpColors(_sunColorDay, _sunColorMoon, nightFactor);
    this.skyMat.uniforms.sunIntensity.value = THREE.MathUtils.lerp(0.85, 0.45, nightFactor);

    this.sunLight.color.lerpColors(_sunColorDay, _sunColorMoon, nightFactor);
    this.sunLight.intensity = THREE.MathUtils.lerp(1.45, 0.55, nightFactor);
    this.sunLight.position.copy(_sunDir).multiplyScalar(75);

    this.hemiLight.color.lerpColors(_hemiSkyDay, _hemiSkyNight, nightFactor);
    this.hemiLight.groundColor.lerpColors(_hemiGroundDay, _hemiGroundNight, nightFactor);
    this.hemiLight.intensity = THREE.MathUtils.lerp(0.6, 0.36, nightFactor);

    const uvPower = THREE.MathUtils.lerp(5, 13, nightFactor);
    this.world.uvLights.forEach((l, idx) => {
      l.intensity = idx === this.world.uvLights.length - 1 ? uvPower * 1.5 : uvPower;
    });
    this.world.floodLights.forEach((f) => {
      f.intensity = THREE.MathUtils.lerp(4, 9.5, nightFactor);
    });
    // String lights glow brighter at night on rooftop bridges
    const bulbEmissive = THREE.MathUtils.lerp(1.2, 2.8, nightFactor);
    this.world.stringBulbMats.forEach((m) => {
      m.emissiveIntensity = bulbEmissive;
    });

    this.skyMesh.position.copy(this.camera.position);
  }

  private startLoop(): void {
    const tick = () => {
      if (this.disposed) return;

      const now = performance.now();
      const rawDt = Math.min(0.05, Math.max(0.001, (now - this.lastNow) / 1000));
      this.lastNow = now;

      let timeScale = 1.0;
      if (this.hitstopTimer > 0) {
        this.hitstopTimer = Math.max(0, this.hitstopTimer - rawDt);
        timeScale = 0.03;
      } else if (this.slowMoTimer > 0) {
        this.slowMoTimer = Math.max(0, this.slowMoTimer - rawDt);
        timeScale = 0.28;
      }
      const dt = rawDt * timeScale;
      this.elapsed += dt;

      if (this.phase === 'playing') {
        if (!this.radioOpen) {
          this.playTimeSeconds += rawDt;
          this.attackCooldown = Math.max(0, this.attackCooldown - rawDt);
          this.kickCooldown = Math.max(0, this.kickCooldown - rawDt);
          this.dropkickTimer = Math.max(0, this.dropkickTimer - rawDt);
          this.slideCooldown = Math.max(0, this.slideCooldown - rawDt);
          this.firecrackerCooldown = Math.max(0, this.firecrackerCooldown - rawDt);
          this.cameraShake = Math.max(0, this.cameraShake - rawDt * 1.6);
          this.damageFlash = Math.max(0, this.damageFlash - rawDt * 2.2);
          this.parryFlash = Math.max(0, this.parryFlash - rawDt * 2.4);

          for (let i = this.directionalHits.length - 1; i >= 0; i--) {
            this.directionalHits[i].intensity -= rawDt * 1.35;
            if (this.directionalHits[i].intensity <= 0) {
              this.directionalHits.splice(i, 1);
            }
          }

          if (this.comboCount > 0) {
            this.comboTimer -= rawDt;
            if (this.comboTimer <= 0) {
              this.comboCount = 0;
              this.comboTimer = 0;
            }
          }

          if (this.subtitleTimer > 0) {
            this.subtitleTimer = Math.max(0, this.subtitleTimer - rawDt);
          }

          this.updatePlayerPhysics(dt);
          this.syncCameraToPlayer(dt);

          const moveSpeedRatio = Math.min(1, Math.hypot(this.playerVel.x, this.playerVel.z) / 9.5);
          const isSprinting = Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight']) && moveSpeedRatio > 0.65;
          const isLookingDown = this.onGround && this.pitch < -0.72;

          this.viewmodel.update(
            dt,
            this.elapsed,
            moveSpeedRatio,
            isSprinting,
            this.mantling,
            !this.onGround,
            this.canMantle,
            this.slideTimer > 0,
            this.activeZipline !== null,
            this.vaulting,
            isLookingDown,
            this.wallRunSide,
            this.rollTimer > 0,
            () => {
              this.sound.playFirecrackerBang();
            },
          );

          const lurePos = this.viewmodel.getActiveLurePosition();
          this.zombies.update(
            dt,
            this.playerPos,
            this.isNightTime(),
            lurePos,
            this.world.colliders,
            this.world.tajSafeZone,
            (dmg, attackerPos) => {
              this.health = Math.max(0, this.health - dmg);
              this.comboCount = 0;
              this.comboTimer = 0;
              this.damageFlash = 0.72;
              this.cameraShake = 0.28;
              this.sound.playPlayerHurt();

              // Directional damage indicator pointing toward side/rear attacker
              const dx = attackerPos.x - this.playerPos.x;
              const dz = attackerPos.z - this.playerPos.z;
              const fwdX = -Math.sin(this.yaw);
              const fwdZ = -Math.cos(this.yaw);
              const rightX = Math.cos(this.yaw);
              const rightZ = -Math.sin(this.yaw);
              const relAngleRad = Math.atan2(dx * rightX + dz * rightZ, dx * fwdX + dz * fwdZ);
              if (Math.abs(relAngleRad) > 0.35) {
                this.directionalHits.push({
                  id: this.nextHitId++,
                  angleRad: relAngleRad,
                  intensity: 1.0,
                });
                if (this.directionalHits.length > 5) this.directionalHits.shift();
              }

              if (this.health <= 0) {
                this.phase = 'gameover';
                this.sound.playGameOver();
                if (document.pointerLockElement) document.exitPointerLock();
              }
              this.emitHud();
            },
            (kind) => this.sound.playZombieGroan(kind),
          );

          this.world.crates.forEach((c) => {
            if (!c.collected) {
              c.beaconRing.position.y = 1.2 + Math.sin(this.elapsed * 3.2) * 0.14;
              c.beaconRing.rotation.z = this.elapsed * 1.4;
            }
          });

          const allCollected = this.world.crates.every((c) => c.collected);
          const sz = this.world.tajSafeZone;
          if (
            allCollected &&
            this.playerPos.z <= sz.maxZ &&
            this.playerPos.x >= sz.minX &&
            this.playerPos.x <= sz.maxX
          ) {
            this.phase = 'victory';
            this.sound.playVictory();
            if (document.pointerLockElement) document.exitPointerLock();
            this.emitHud();
          }
        }
        this.world.updateGuard(this.elapsed, this.playerPos, this.radioOpen);
      } else if (this.phase === 'start') {
        this.camera.position.set(
          5.8 + Math.sin(this.elapsed * 0.16) * 1.4,
          1.85 + Math.cos(this.elapsed * 0.22) * 0.12,
          24.5,
        );
        this.camera.lookAt(1.5, 4.5, -62);
        this.world.updateGuard(this.elapsed, this.playerPos, false);
      }

      this.updateAtmosphere(this.radioOpen ? 0 : dt);
      if (this.composer) {
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }

      this.hudThrottle += rawDt;
      if (this.hudThrottle >= 0.04) {
        this.hudThrottle = 0;
        this.emitHud();
      }

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.afterDraw(tick);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private emitHud(): void {
    const w = this.mountEl.clientWidth || window.innerWidth;
    const h = this.mountEl.clientHeight || window.innerHeight;
    const counterIndicators: CounterIndicator[] = [];

    if (this.phase === 'playing') {
      for (const z of this.zombies.zombies) {
        if (z.state !== 'windup') continue;
        const headOffset = z.kind === 'brute' ? 2.85 : z.kind === 'dog' ? 1.15 : 2.15;
        _projVec.set(z.pos.x, z.pos.y + headOffset, z.pos.z);
        _projVec.project(this.camera);
        if (_projVec.z > 0 && _projVec.z < 1) {
          const rawSx = (_projVec.x * 0.5 + 0.5) * w;
          const rawSy = (-_projVec.y * 0.5 + 0.5) * h;
          if (rawSx >= -40 && rawSx <= w + 40 && rawSy >= -40 && rawSy <= h + 40) {
            counterIndicators.push({
              id: z.id,
              x: Math.max(40, Math.min(w - 40, rawSx)),
              y: Math.max(58, Math.min(h - 48, rawSy)),
              progress: Math.max(0, z.stateTimer / z.windupDuration),
            });
          }
        }
      }
    }

    let interactionPrompt = '';
    const cratesCollected = this.world.crates.filter((c) => c.collected).length;
    const nearGuardTower = this.phase === 'playing' && this.isNearGuardTower();
    if (this.phase === 'playing' && !this.radioOpen) {
      if (this.wallRunSide !== 0) {
        interactionPrompt = '[SPACE] Tic-Tac Wall Kick';
      } else if (this.activeZipline) {
        interactionPrompt = '[SPACE] Launch Off Zipline';
      } else if (counterIndicators.length > 0) {
        interactionPrompt = '[Right-Click] Counter Incoming Strike!';
      } else {
        for (const c of this.world.crates) {
          if (!c.collected && this.playerPos.distanceTo(c.position) < 3.6) {
            interactionPrompt = `[E] Scavenge ${c.label}`;
            break;
          }
        }
        if (!interactionPrompt && nearGuardTower) {
          interactionPrompt = '[E] Radio Watchtower Guard';
        }
        if (!interactionPrompt && this.findNearbyZipline()) {
          interactionPrompt = '[E] Ride Rooftop Zipline';
        }
        if (!interactionPrompt && this.canMantle) {
          interactionPrompt = '[SPACE] Climb / Speed Vault';
        }
        if (!interactionPrompt && !this.onGround && this.playerVel.y < -9.5) {
          interactionPrompt = '[C / Ctrl] Safety Landing Roll';
        }
        if (!interactionPrompt && cratesCollected === this.world.crates.length) {
          interactionPrompt = 'All Antizin Secured — Return to the Taj Mahal UV Safe House Gate!';
        }
      }
    }

    const playerHeadingRad = -this.yaw;
    const tajBearingRad = Math.atan2(
      this.world.tajGateCenter.x - this.playerPos.x,
      -(this.world.tajGateCenter.z - this.playerPos.z),
    );
    let nearestCrateBearingRad: number | null = null;
    let nearestCrateDistance: number | null = null;
    for (const c of this.world.crates) {
      if (c.collected) continue;
      const dist = this.playerPos.distanceTo(c.position);
      if (nearestCrateDistance === null || dist < nearestCrateDistance) {
        nearestCrateDistance = Math.round(dist);
        nearestCrateBearingRad = Math.atan2(
          c.position.x - this.playerPos.x,
          -(c.position.z - this.playerPos.z),
        );
      }
    }

    this.onHudUpdate({
      phase: this.phase,
      health: Math.round(this.health),
      maxHealth: this.maxHealth,
      stamina: Math.round(this.stamina),
      maxStamina: this.maxStamina,
      comboCount: this.comboCount,
      comboTimerRatio: this.comboCount > 0 ? Math.max(0, this.comboTimer / 4.8) : 0,
      takedownReady: this.comboCount >= 5,
      timeOfDay: this.timeOfDay,
      formattedTime: this.formatClock24h(),
      isNight: this.isNightTime(),
      cratesCollected,
      totalCrates: this.world.crates.length,
      crateStatuses: this.world.crates.map((c) => ({
        id: c.id,
        label: c.label,
        locationHint: c.locationHint,
        collected: c.collected,
        distance: Math.round(this.playerPos.distanceTo(c.position)),
      })),
      tajDistance: Math.round(this.playerPos.distanceTo(this.world.tajGateCenter)),
      playerHeadingRad,
      tajBearingRad,
      nearestCrateBearingRad,
      nearestCrateDistance,
      nearGuardTower,
      radioOpen: this.radioOpen,
      flashlightOn: this.flashlightOn,
      firecrackerCooldown: Math.max(0, Number(this.firecrackerCooldown.toFixed(1))),
      kickCooldown: Math.max(0, Number(this.kickCooldown.toFixed(1))),
      canMantle: this.canMantle,
      activeWeapon: this.viewmodel.getWeapon(),
      timeLabel: this.getTimeLabel(),
      subtitleText: this.subtitleTimer > 0 ? this.subtitleText : '',
      subtitleSpeaker: this.subtitleSpeaker,
      interactionPrompt,
      pointerLocked: this.pointerLocked,
      counterIndicators,
      directionalHits: this.directionalHits.map((d) => ({ ...d })),
      damageFlash: this.damageFlash,
      parryFlash: this.parryFlash,
      slowMoActive: this.slowMoTimer > 0,
      parkourFlow: Number(this.parkourFlow.toFixed(2)),
      parkourMove: this.parkourMoveTimer > 0 ? this.parkourMoveLabel : undefined,
      killCount: this.killCount,
      maxCombo: this.maxCombo,
      elapsedSeconds: Math.round(this.playTimeSeconds),
    });
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.unbindEvents();
    this.skyMesh.geometry.dispose();
    this.skyMat.dispose();
    this.world.dispose();
    this.viewmodel.dispose();
    this.zombies.dispose();
    this.textures.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.mountEl) {
      this.mountEl.removeChild(this.renderer.domElement);
    }
  }
}
