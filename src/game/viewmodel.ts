import * as THREE from 'three';
import type { ProceduralTextureSet } from './textures';

export type WeaponAnimState = 'idle' | 'swing_left' | 'swing_right' | 'parry' | 'takedown' | 'blocked';

interface SparkParticle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface DustParticle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

export interface ActiveFirecracker {
  mesh: THREE.Group;
  light: THREE.PointLight;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  banged: boolean;
  lureDuration: number;
  sparkTimer: number;
}

function smoothGeo<T extends THREE.BufferGeometry>(geo: T): T {
  geo.computeVertexNormals();
  return geo;
}

/**
 * First-person sculpted baseball bat / machete / pipe, rounded articulated left forearm & hand,
 * dual rounded parkour legs & boots, swing motion arcs, impact sparks, landing dust puffs, and firecrackers.
 */
export class WeaponAndEffects {
  public readonly weaponPivot = new THREE.Group();
  private readonly batGroup = new THREE.Group();
  private readonly macheteGroup = new THREE.Group();
  private readonly pipeGroup = new THREE.Group();
  private readonly leftArmPivot = new THREE.Group();
  private readonly leftLegPivot = new THREE.Group();
  private readonly rightLegPivot = new THREE.Group();

  private readonly swingArcMesh: THREE.Mesh;
  private readonly swingArcMat: THREE.MeshBasicMaterial;
  private readonly shockwaveMesh: THREE.Mesh;
  private readonly shockwaveMat: THREE.MeshBasicMaterial;

  private readonly sparkPool: SparkParticle[] = [];
  private readonly bloodPool: SparkParticle[] = [];
  private readonly dustPool: DustParticle[] = [];
  private readonly activeFirecrackers: ActiveFirecracker[] = [];
  private readonly firecrackerBodyGeo: THREE.CylinderGeometry;
  private readonly firecrackerTipGeo: THREE.SphereGeometry;
  private readonly firecrackerBodyMat: THREE.MeshStandardMaterial;
  private readonly firecrackerTipMat: THREE.MeshBasicMaterial;
  private readonly firecrackerLight: THREE.PointLight;
  private readonly disposables: Array<{ dispose: () => void }> = [];

  private activeWeapon: 'bat' | 'machete' | 'pipe' = 'bat';
  private animState: WeaponAnimState = 'idle';
  private animTime = 0;
  private animDuration = 0.3;
  private swingToggle = false;
  private shockwaveTime = -1;
  private kickTime = -1;
  private kickIsDropkick = false;

  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, textures: ProceduralTextureSet) {
    this.scene = scene;
    this.camera = camera;

    const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
      this.disposables.push(g);
      return g;
    };
    const trackMat = <T extends THREE.Material>(m: T): T => {
      this.disposables.push(m);
      return m;
    };

    // Shared viewmodel skin, glove, leather & fabric materials
    const skinMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.skinDetail,
        bumpMap: textures.skinDetail,
        bumpScale: 0.015,
        color: 0xd9a17e,
        roughness: 0.66,
        metalness: 0.04,
      }),
    );
    const sleeveMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x3f4739, roughness: 0.9 }));
    const gloveMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1b1e24, roughness: 0.72, metalness: 0.12 }));
    const gloveArmorMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x2c323c, roughness: 0.46, metalness: 0.36 }));
    const wrapMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xd6cfc2, roughness: 0.92 }));
    const leatherMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x3b2618, roughness: 0.82 }));
    const watchStrapMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.6 }));
    const watchBezelMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x525864, roughness: 0.3, metalness: 0.85 }));
    const watchDialMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x0b1320,
        emissive: 0x38bdf8,
        emissiveIntensity: 0.9,
        roughness: 0.2,
      }),
    );
    const jeanMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.zombieCloth,
        color: 0x394433,
        roughness: 0.88,
      }),
    );
    const bootMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x423830, roughness: 0.62 }));
    const soleMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.92 }));

    // =========================================================================
    // 1. RIGHT BARE WEATHERED FOREARM, FINGERLESS TACTICAL GLOVE + BASEBALL BAT
    // =========================================================================
    this.weaponPivot.position.set(0.41, -0.52, -0.48);
    this.weaponPivot.rotation.set(-0.14, 0, -0.42);
    camera.add(this.weaponPivot);

    const rustPipeMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.rustedMetal,
        color: 0x6b6f75,
        roughness: 0.56,
        metalness: 0.78,
      }),
    );
    const forgedBladeMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.rustedMetal,
        color: 0x454b54,
        roughness: 0.44,
        metalness: 0.82,
      }),
    );
    const edgeSteelMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        roughness: 0.2,
        metalness: 0.95,
      }),
    );
    const darkIronMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x292d34,
        roughness: 0.38,
        metalness: 0.88,
      }),
    );
    const copperWireMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xd97706,
        roughness: 0.28,
        metalness: 0.85,
      }),
    );
    const bloodRustMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x7c2d12,
        roughness: 0.72,
        metalness: 0.25,
      }),
    );

    // --- Shared Right Bare Forearm & Dark Fingerless Tactical Glove ---
    const rightHandGroup = new THREE.Group();
    rightHandGroup.rotation.set(0.28, -0.26, 0.24);
    this.weaponPivot.add(rightHandGroup);

    // Bare scarred/blood-flecked forearm extending toward bottom-right edge (matching reference)
    const rForearm = new THREE.Mesh(smoothGeo(trackGeo(new THREE.CapsuleGeometry(0.044, 0.28, 6, 12))), skinMat);
    rForearm.scale.set(1.04, 1.0, 0.86);
    rForearm.position.set(0.045, -0.17, 0.1);
    rForearm.rotation.set(0.46, 0, -0.22);
    rightHandGroup.add(rForearm);

    // Tactical wrist cuff & Velcro strap at base of fingerless glove
    const rWristStrap = new THREE.Mesh(
      smoothGeo(trackGeo(new THREE.CylinderGeometry(0.046, 0.048, 0.055, 12))),
      gloveArmorMat,
    );
    rWristStrap.position.set(0.018, -0.042, 0.032);
    rWristStrap.rotation.set(0.28, 0, -0.16);
    rightHandGroup.add(rWristStrap);

    // Rounded tactical leather glove body + curved knuckle guard
    const glovePalm = new THREE.Mesh(smoothGeo(trackGeo(new THREE.CapsuleGeometry(0.044, 0.045, 6, 12))), gloveMat);
    glovePalm.scale.set(1.05, 1.0, 0.84);
    glovePalm.position.set(0.01, 0.01, 0.01);
    rightHandGroup.add(glovePalm);

    const knuckleArmor = new THREE.Mesh(
      smoothGeo(trackGeo(new THREE.CapsuleGeometry(0.016, 0.068, 5, 10))),
      gloveArmorMat,
    );
    knuckleArmor.rotation.z = Math.PI / 2;
    knuckleArmor.position.set(0.01, 0.042, 0.044);
    rightHandGroup.add(knuckleArmor);

    // 4 rounded fingerless leather sleeves + bare skin fingertips gripping hilt
    [-0.028, -0.009, 0.01, 0.029].forEach((fx) => {
      const gloveSeg = new THREE.Mesh(smoothGeo(trackGeo(new THREE.CapsuleGeometry(0.0095, 0.018, 4, 8))), gloveMat);
      gloveSeg.position.set(fx, 0.062, 0.028);
      gloveSeg.rotation.x = 0.7;
      rightHandGroup.add(gloveSeg);

      const tip = new THREE.Mesh(smoothGeo(trackGeo(new THREE.CapsuleGeometry(0.0082, 0.018, 4, 8))), skinMat);
      tip.position.set(fx, 0.056, 0.004);
      tip.rotation.x = 1.4;
      rightHandGroup.add(tip);
    });
    const rThumb = new THREE.Mesh(smoothGeo(trackGeo(new THREE.CapsuleGeometry(0.011, 0.034, 5, 8))), skinMat);
    rThumb.position.set(-0.042, 0.032, 0.025);
    rThumb.rotation.set(0.35, 0, 0.65);
    rightHandGroup.add(rThumb);

    // --- Weapon 0 (Default): Weathered Wooden Baseball Bat with Dark Grip Tape ---
    const batWoodMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.baseballBatWood,
        color: 0xb88b5b,
        roughness: 0.7,
        metalness: 0.04,
      }),
    );
    const gripTapeMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x16181c,
        roughness: 0.94,
        metalness: 0.04,
      }),
    );

    this.batGroup.rotation.set(0.16, -0.18, 0.14);
    this.batGroup.position.set(0.01, -0.06, 0.0);
    this.weaponPivot.add(this.batGroup);

    // Lathe profile for authentic wooden baseball bat (pommel knob -> slim handle -> tapered barrel -> rounded tip)
    const batProfile: THREE.Vector2[] = [
      new THREE.Vector2(0.001, -0.17),
      new THREE.Vector2(0.03, -0.168),
      new THREE.Vector2(0.032, -0.148),
      new THREE.Vector2(0.02, -0.135),
      new THREE.Vector2(0.02, 0.06),
      new THREE.Vector2(0.026, 0.19),
      new THREE.Vector2(0.038, 0.34),
      new THREE.Vector2(0.046, 0.52),
      new THREE.Vector2(0.045, 0.66),
      new THREE.Vector2(0.034, 0.7),
      new THREE.Vector2(0.001, 0.715),
    ];
    const batBody = new THREE.Mesh(trackGeo(new THREE.LatheGeometry(batProfile, 16)), batWoodMat);
    this.batGroup.add(batBody);

    // Spiral / ribbed dark athletic grip tape wrapped around the handle (matches reference image!)
    for (let w = 0; w < 6; w++) {
      const wrapRing = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.0235, 0.0235, 0.036, 14)),
        gripTapeMat,
      );
      wrapRing.position.y = -0.105 + w * 0.036;
      wrapRing.rotation.z = w % 2 === 0 ? 0.05 : -0.05;
      this.batGroup.add(wrapRing);
    }
    // Secondary dark tape band wrapped around upper-mid barrel
    const midTape = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.0405, 0.037, 0.075, 16)), gripTapeMat);
    midTape.position.y = 0.36;
    midTape.rotation.z = 0.025;
    this.batGroup.add(midTape);

    // --- Weapon 1: Serrated Post-Apocalyptic Scrap Machete ---
    this.macheteGroup.rotation.set(0.75, -0.45, 0.42);
    this.macheteGroup.position.set(-0.02, 0.03, -0.02);
    this.macheteGroup.visible = false;
    this.weaponPivot.add(this.macheteGroup);

    const hilt = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.028, 0.18, 0.038)), leatherMat);
    hilt.position.y = 0.01;
    this.macheteGroup.add(hilt);

    const guard = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.036, 0.024, 0.1)), darkIronMat);
    guard.position.y = 0.1;
    this.macheteGroup.add(guard);

    // Swept forged blade spine + razor cutting edge
    const bladeBody = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.012, 0.62, 0.062)), forgedBladeMat);
    bladeBody.position.set(0, 0.42, -0.01);
    bladeBody.rotation.x = 0.04;
    this.macheteGroup.add(bladeBody);

    const cuttingEdge = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.006, 0.62, 0.018)), edgeSteelMat);
    cuttingEdge.position.set(0, 0.42, -0.044);
    cuttingEdge.rotation.x = 0.04;
    this.macheteGroup.add(cuttingEdge);

    // Pointed swept tip
    const tipGeo = trackGeo(new THREE.ConeGeometry(0.034, 0.14, 4));
    const bladeTip = new THREE.Mesh(tipGeo, edgeSteelMat);
    bladeTip.position.set(0, 0.78, -0.032);
    bladeTip.rotation.y = Math.PI / 4;
    bladeTip.rotation.x = -0.18;
    this.macheteGroup.add(bladeTip);

    // Aggressive serrated sawtooth notches along the blade spine (matching Pic 2!)
    const sawToothGeo = trackGeo(new THREE.ConeGeometry(0.016, 0.035, 4));
    for (let s = 0; s < 6; s++) {
      const tooth = new THREE.Mesh(sawToothGeo, darkIronMat);
      tooth.position.set(0, 0.18 + s * 0.068, 0.026 - s * 0.002);
      tooth.rotation.x = Math.PI / 2 - 0.35;
      this.macheteGroup.add(tooth);
    }

    // --- Weapon 2: Rusted Cloth-Wrapped & Wired Lead Pipe ---
    this.pipeGroup.rotation.set(0.28, -0.22, 0.12);
    this.pipeGroup.visible = false;
    this.weaponPivot.add(this.pipeGroup);

    const shaft = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.024, 0.026, 0.68, 10)), rustPipeMat);
    shaft.position.y = 0.22;
    this.pipeGroup.add(shaft);

    const pommel = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.032, 0.032, 0.04, 8)), darkIronMat);
    pommel.position.y = -0.13;
    this.pipeGroup.add(pommel);

    [-0.04, 0.03, 0.1].forEach((ty, idx) => {
      const band = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.029, 0.029, 0.065, 10)), wrapMat);
      band.position.y = ty;
      band.rotation.z = idx % 2 === 0 ? 0.06 : -0.06;
      this.pipeGroup.add(band);
    });

    const collar = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.034, 0.034, 0.055, 6)), darkIronMat);
    collar.position.y = 0.44;
    this.pipeGroup.add(collar);

    [0.34, 0.38, 0.49].forEach((cy) => {
      const coil = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(0.028, 0.005, 6, 14)), copperWireMat);
      coil.rotation.x = Math.PI / 2 + 0.15;
      coil.position.y = cy;
      this.pipeGroup.add(coil);
    });

    const head = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.036, 0.036, 0.13, 10)), darkIronMat);
    head.rotation.z = Math.PI / 2;
    head.position.set(0.02, 0.56, 0);
    this.pipeGroup.add(head);

    const flange = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.042, 0.042, 0.03, 10)), bloodRustMat);
    flange.rotation.z = Math.PI / 2;
    flange.position.set(-0.045, 0.56, 0);
    this.pipeGroup.add(flange);

    // =========================================================================
    // 2. NATURAL LOWER-LEFT FOREARM, WRISTWATCH & CURLED GLOVED HAND
    // =========================================================================
    this.leftArmPivot.position.set(-0.46, -0.58, -0.45);
    camera.add(this.leftArmPivot);

    const armGroup = new THREE.Group();
    armGroup.rotation.set(-0.54, 0.42, -0.36);
    this.leftArmPivot.add(armGroup);

    // Rolled tactical sleeve base framing the lower-left edge
    const sleeve = new THREE.Mesh(smoothGeo(trackGeo(new THREE.CapsuleGeometry(0.052, 0.16, 6, 12))), sleeveMat);
    sleeve.position.y = -0.1;
    armGroup.add(sleeve);

    // Smooth tapered cylindrical forearm (skin tone) leading naturally to the wrist
    const forearm = new THREE.Mesh(
      smoothGeo(trackGeo(new THREE.CylinderGeometry(0.036, 0.048, 0.24, 14))),
      skinMat,
    );
    forearm.scale.set(1.06, 1.0, 0.86);
    forearm.position.y = 0.085;
    armGroup.add(forearm);

    // Dark tactical wristwatch & strap at the wrist
    const watchBand = new THREE.Mesh(
      smoothGeo(trackGeo(new THREE.CylinderGeometry(0.04, 0.042, 0.036, 14))),
      watchStrapMat,
    );
    watchBand.scale.set(1.04, 1.0, 0.86);
    watchBand.position.y = 0.192;
    armGroup.add(watchBand);

    const watchBezel = new THREE.Mesh(
      smoothGeo(trackGeo(new THREE.CylinderGeometry(0.028, 0.03, 0.016, 14))),
      watchBezelMat,
    );
    watchBezel.rotation.x = Math.PI / 2;
    watchBezel.position.set(0.006, 0.192, 0.034);
    armGroup.add(watchBezel);

    const watchDial = new THREE.Mesh(trackGeo(new THREE.CircleGeometry(0.02, 14)), watchDialMat);
    watchDial.position.set(0.006, 0.192, 0.043);
    armGroup.add(watchDial);

    // Tactical glove cuff & smoothly rounded ellipsoid/capsule palm
    const leftWristCuff = new THREE.Mesh(
      smoothGeo(trackGeo(new THREE.CylinderGeometry(0.04, 0.041, 0.034, 14))),
      gloveArmorMat,
    );
    leftWristCuff.scale.set(1.04, 1.0, 0.82);
    leftWristCuff.position.y = 0.228;
    armGroup.add(leftWristCuff);

    const palm = new THREE.Mesh(smoothGeo(trackGeo(new THREE.CapsuleGeometry(0.042, 0.046, 8, 16))), gloveMat);
    palm.scale.set(1.06, 1.0, 0.68);
    palm.position.set(0, 0.282, 0);
    armGroup.add(palm);

    // Subtle padded knuckle guard across the back of the gloved hand
    const knuckleBar = new THREE.Mesh(
      smoothGeo(trackGeo(new THREE.CapsuleGeometry(0.014, 0.062, 6, 12))),
      gloveArmorMat,
    );
    knuckleBar.scale.set(1.0, 1.0, 0.78);
    knuckleBar.rotation.z = Math.PI / 2;
    knuckleBar.position.set(0, 0.324, 0.015);
    armGroup.add(knuckleBar);

    // Anatomically proportional Left-Hand Fingers (Pinky on -X -> Index on +X)
    // Built from smooth tapered CapsuleGeometry segments with bent knuckle joints curving downward/inward (-X rot toward -Z palm)
    const leftFingerSpecs = [
      { x: -0.028, y: 0.318, proxLen: 0.024, proxR: 0.0082, distLen: 0.019, distR: 0.0066, splay: 0.04, mcpCurl: -0.64, pipCurl: -0.78 },
      { x: -0.0095, y: 0.325, proxLen: 0.031, proxR: 0.0091, distLen: 0.024, distR: 0.0074, splay: 0.015, mcpCurl: -0.58, pipCurl: -0.72 },
      { x: 0.0095, y: 0.327, proxLen: 0.034, proxR: 0.0096, distLen: 0.026, distR: 0.0078, splay: -0.01, mcpCurl: -0.52, pipCurl: -0.66 },
      { x: 0.028, y: 0.323, proxLen: 0.03, proxR: 0.0092, distLen: 0.023, distR: 0.0074, splay: -0.035, mcpCurl: -0.48, pipCurl: -0.62 },
    ];
    leftFingerSpecs.forEach((fs) => {
      const mcpPivot = new THREE.Group();
      mcpPivot.position.set(fs.x, fs.y, 0.004);
      mcpPivot.rotation.set(fs.mcpCurl, 0, fs.splay);
      armGroup.add(mcpPivot);

      const proxMesh = new THREE.Mesh(
        smoothGeo(trackGeo(new THREE.CapsuleGeometry(fs.proxR, fs.proxLen, 5, 10))),
        gloveMat,
      );
      proxMesh.position.y = fs.proxLen * 0.5;
      mcpPivot.add(proxMesh);

      const pipPivot = new THREE.Group();
      pipPivot.position.y = fs.proxLen;
      pipPivot.rotation.x = fs.pipCurl;
      mcpPivot.add(pipPivot);

      const distMesh = new THREE.Mesh(
        smoothGeo(trackGeo(new THREE.CapsuleGeometry(fs.distR, fs.distLen, 5, 10))),
        gloveMat,
      );
      distMesh.position.y = fs.distLen * 0.5;
      pipPivot.add(distMesh);
    });

    // Articulated Left Thumb on inner (+X) edge curving inward toward the index/palm
    const thumbMcp = new THREE.Group();
    thumbMcp.position.set(0.039, 0.258, -0.002);
    thumbMcp.rotation.set(-0.38, 0.28, -0.54);
    armGroup.add(thumbMcp);

    const thumbProx = new THREE.Mesh(
      smoothGeo(trackGeo(new THREE.CapsuleGeometry(0.0108, 0.024, 5, 10))),
      gloveMat,
    );
    thumbProx.position.y = 0.012;
    thumbMcp.add(thumbProx);

    const thumbIp = new THREE.Group();
    thumbIp.position.y = 0.024;
    thumbIp.rotation.set(-0.46, 0, 0.14);
    thumbMcp.add(thumbIp);

    const thumbDist = new THREE.Mesh(
      smoothGeo(trackGeo(new THREE.CapsuleGeometry(0.009, 0.02, 5, 10))),
      gloveMat,
    );
    thumbDist.position.y = 0.01;
    thumbIp.add(thumbDist);

    // =========================================================================
    // 3. DUAL ROUNDED FIRST-PERSON PARKOUR LEGS & BOOTS
    // =========================================================================
    const buildParkourLeg = (pivot: THREE.Group, isRight: boolean) => {
      const thigh = new THREE.Mesh(smoothGeo(trackGeo(new THREE.CapsuleGeometry(0.076, 0.28, 8, 14))), jeanMat);
      thigh.rotation.x = Math.PI / 2;
      thigh.position.z = -0.14;
      pivot.add(thigh);

      const shin = new THREE.Mesh(smoothGeo(trackGeo(new THREE.CapsuleGeometry(0.064, 0.36, 8, 14))), jeanMat);
      shin.rotation.x = Math.PI / 2;
      shin.position.z = -0.38;
      pivot.add(shin);

      const cuff = new THREE.Mesh(smoothGeo(trackGeo(new THREE.CylinderGeometry(0.064, 0.066, 0.07, 12))), leatherMat);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.z = -0.53;
      pivot.add(cuff);

      const shoe = new THREE.Mesh(smoothGeo(trackGeo(new THREE.CapsuleGeometry(0.064, 0.16, 8, 14))), bootMat);
      shoe.rotation.x = Math.PI / 2;
      shoe.scale.set(1.0, 1.0, 1.15);
      shoe.position.set(isRight ? 0.005 : -0.005, 0.032, -0.62);
      pivot.add(shoe);

      const shoeSole = new THREE.Mesh(smoothGeo(trackGeo(new THREE.CapsuleGeometry(0.066, 0.17, 6, 12))), soleMat);
      shoeSole.rotation.x = Math.PI / 2;
      shoeSole.scale.set(1.04, 0.45, 1.18);
      shoeSole.position.set(isRight ? 0.005 : -0.005, -0.028, -0.62);
      pivot.add(shoeSole);
    };

    this.leftLegPivot.position.set(-0.18, -0.74, -0.14);
    this.leftLegPivot.visible = false;
    buildParkourLeg(this.leftLegPivot, false);
    camera.add(this.leftLegPivot);

    this.rightLegPivot.position.set(0.18, -0.74, -0.14);
    this.rightLegPivot.visible = false;
    buildParkourLeg(this.rightLegPivot, true);
    camera.add(this.rightLegPivot);

    // =========================================================================
    // 4. SWING ARC RIBBON, TAKEDOWN SHOCKWAVE, SPARKS & DUST PUFF POOL
    // =========================================================================
    this.swingArcMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.swingArcMesh = new THREE.Mesh(
      trackGeo(new THREE.RingGeometry(0.32, 0.52, 24, 1, -Math.PI * 0.4, Math.PI * 0.8)),
      this.swingArcMat,
    );
    this.swingArcMesh.position.set(0.02, -0.06, -0.68);
    this.swingArcMesh.rotation.set(0.35, 0, -0.35);
    camera.add(this.swingArcMesh);

    this.shockwaveMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.shockwaveMesh = new THREE.Mesh(trackGeo(new THREE.RingGeometry(0.4, 1.0, 32)), this.shockwaveMat);
    this.shockwaveMesh.rotation.x = -Math.PI / 2;
    this.shockwaveMesh.visible = false;
    scene.add(this.shockwaveMesh);

    const sparkGeo = smoothGeo(trackGeo(new THREE.SphereGeometry(0.036, 6, 6)));
    for (let i = 0; i < 48; i++) {
      const mat = trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfbbf24,
          transparent: true,
          opacity: 0,
        }),
      );
      const mesh = new THREE.Mesh(sparkGeo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.sparkPool.push({
        mesh,
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.35,
      });
    }

    const bloodGeo = smoothGeo(trackGeo(new THREE.SphereGeometry(0.034, 6, 5)));
    for (let i = 0; i < 32; i++) {
      const mat = trackMat(
        new THREE.MeshBasicMaterial({
          color: i % 2 === 0 ? 0xdc2626 : 0x7f1d1d,
          transparent: true,
          opacity: 0,
        }),
      );
      const mesh = new THREE.Mesh(bloodGeo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.bloodPool.push({
        mesh,
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.42,
      });
    }

    const dustGeo = smoothGeo(trackGeo(new THREE.SphereGeometry(0.24, 10, 8)));
    for (let i = 0; i < 28; i++) {
      const mat = trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xd6c7b2,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      const mesh = new THREE.Mesh(dustGeo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.dustPool.push({
        mesh,
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.55,
      });
    }

    // Shared firecracker geometries, materials & pooled PointLight (prevents runtime shader stalls)
    this.firecrackerBodyGeo = trackGeo(new THREE.CylinderGeometry(0.05, 0.05, 0.24, 8));
    this.firecrackerTipGeo = trackGeo(new THREE.SphereGeometry(0.055, 6, 6));
    this.firecrackerBodyMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.6 }));
    this.firecrackerTipMat = trackMat(
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.8, 0.35), toneMapped: false }),
    );
    this.firecrackerLight = new THREE.PointLight(0xf97316, 0, 14, 1.5);
    this.firecrackerLight.castShadow = false;
    scene.add(this.firecrackerLight);
  }

  public setWeapon(weapon: 'bat' | 'machete' | 'pipe'): void {
    this.activeWeapon = weapon;
    this.batGroup.visible = weapon === 'bat';
    this.macheteGroup.visible = weapon === 'machete';
    this.pipeGroup.visible = weapon === 'pipe';
  }

  public getWeapon(): 'bat' | 'machete' | 'pipe' {
    return this.activeWeapon;
  }

  public triggerSwing(): void {
    this.swingToggle = !this.swingToggle;
    this.animState = this.swingToggle ? 'swing_left' : 'swing_right';
    this.animTime = 0;
    this.animDuration = 0.28;
    this.swingArcMat.color.setHex(0xe2e8f0);
    this.swingArcMesh.rotation.z = this.swingToggle ? -0.5 : 2.6;
  }

  public triggerParry(): void {
    this.animState = 'parry';
    this.animTime = 0;
    this.animDuration = 0.34;
    this.swingArcMat.color.setHex(0xfacc15);
    this.swingArcMesh.rotation.z = 0.1;
  }

  public triggerTakedown(origin: THREE.Vector3): void {
    this.animState = 'takedown';
    this.animTime = 0;
    this.animDuration = 0.55;
    this.swingArcMat.color.setHex(0xf59e0b);

    this.shockwaveTime = 0;
    this.shockwaveMesh.position.set(origin.x, origin.y + 0.08, origin.z);
    this.shockwaveMesh.scale.setScalar(0.5);
    this.shockwaveMesh.visible = true;
    this.shockwaveMat.opacity = 0.9;
  }

  public triggerBlocked(): void {
    this.animState = 'blocked';
    this.animTime = 0;
    this.animDuration = 0.25;
  }

  public triggerKick(isDropkick = false): void {
    this.kickTime = 0;
    this.kickIsDropkick = isDropkick;
    this.rightLegPivot.visible = true;
    this.leftLegPivot.visible = isDropkick;
  }

  public spawnSparks(worldPos: THREE.Vector3, colorHex = 0xfbbf24, count = 10): void {
    let spawned = 0;
    for (let i = 0; i < this.sparkPool.length && spawned < count; i++) {
      const p = this.sparkPool[i];
      if (p.life <= 0) {
        p.life = 0.25 + Math.random() * 0.2;
        p.maxLife = p.life;
        p.mesh.position.copy(worldPos);
        p.mesh.visible = true;
        (p.mesh.material as THREE.MeshBasicMaterial).color.setHex(colorHex);
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1;
        p.vel.set(
          (Math.random() - 0.5) * 6.5,
          1.5 + Math.random() * 4.5,
          (Math.random() - 0.5) * 6.5,
        );
        spawned++;
      }
    }
  }

  public spawnBloodAndSparks(worldPos: THREE.Vector3, hitDir: THREE.Vector3, count = 10): void {
    this.spawnSparks(worldPos, 0xfbbf24, Math.max(4, Math.floor(count * 0.65)));
    let bloodSpawned = 0;
    for (let i = 0; i < this.bloodPool.length && bloodSpawned < count; i++) {
      const b = this.bloodPool[i];
      if (b.life <= 0) {
        b.life = 0.32 + Math.random() * 0.22;
        b.maxLife = b.life;
        b.mesh.position.set(
          worldPos.x + (Math.random() - 0.5) * 0.16,
          worldPos.y + (Math.random() - 0.5) * 0.16,
          worldPos.z + (Math.random() - 0.5) * 0.16,
        );
        b.mesh.scale.setScalar(0.75 + Math.random() * 0.65);
        b.mesh.visible = true;
        (b.mesh.material as THREE.MeshBasicMaterial).opacity = 0.92;
        b.vel.set(
          hitDir.x * (2.6 + Math.random() * 2.5) + (Math.random() - 0.5) * 4.2,
          1.4 + Math.random() * 3.4,
          hitDir.z * (2.6 + Math.random() * 2.5) + (Math.random() - 0.5) * 4.2,
        );
        bloodSpawned++;
      }
    }
  }

  public spawnDustPuffs(worldPos: THREE.Vector3, count = 8): void {
    let spawned = 0;
    for (let i = 0; i < this.dustPool.length && spawned < count; i++) {
      const p = this.dustPool[i];
      if (p.life <= 0) {
        p.life = 0.42 + Math.random() * 0.25;
        p.maxLife = p.life;
        const angle = (spawned / Math.max(1, count)) * Math.PI * 2 + Math.random() * 0.5;
        p.mesh.position.set(
          worldPos.x + Math.cos(angle) * 0.3,
          worldPos.y + 0.14,
          worldPos.z + Math.sin(angle) * 0.3,
        );
        p.mesh.scale.setScalar(0.65);
        p.mesh.visible = true;
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.45;
        p.vel.set(Math.cos(angle) * (1.8 + Math.random() * 1.4), 0.7 + Math.random() * 0.9, Math.sin(angle) * (1.8 + Math.random() * 1.4));
        spawned++;
      }
    }
  }

  public throwFirecracker(origin: THREE.Vector3, dir: THREE.Vector3): ActiveFirecracker {
    const group = new THREE.Group();
    const body = new THREE.Mesh(this.firecrackerBodyGeo, this.firecrackerBodyMat);
    body.rotation.x = Math.PI / 2;
    group.add(body);

    const tip = new THREE.Mesh(this.firecrackerTipGeo, this.firecrackerTipMat);
    tip.position.z = 0.13;
    group.add(tip);

    group.position.copy(origin);
    this.scene.add(group);

    this.firecrackerLight.position.copy(origin);
    this.firecrackerLight.intensity = 4.5;

    const vel = dir.clone().multiplyScalar(14);
    vel.y += 4.2;

    const fc: ActiveFirecracker = {
      mesh: group,
      light: this.firecrackerLight,
      pos: origin.clone(),
      vel,
      age: 0,
      banged: false,
      lureDuration: 6.5,
      sparkTimer: 0,
    };
    this.activeFirecrackers.push(fc);
    return fc;
  }

  public getActiveLurePosition(): THREE.Vector3 | null {
    for (let i = this.activeFirecrackers.length - 1; i >= 0; i--) {
      const fc = this.activeFirecrackers[i];
      if (fc.age < fc.lureDuration) {
        return fc.pos;
      }
    }
    return null;
  }

  public update(
    dt: number,
    elapsed: number,
    moveSpeedRatio: number,
    isSprinting: boolean,
    isMantling: boolean,
    isAirborne: boolean,
    canMantle: boolean,
    isSliding: boolean,
    isZiplining: boolean,
    isVaulting: boolean,
    isLookingDown: boolean,
    wallRunSide: -1 | 0 | 1,
    isRolling: boolean,
    onFirecrackerBang: (pos: THREE.Vector3) => void,
  ): void {
    // 1. Right-Hand Weapon & Fingerless Glove pose
    const bobFreq = isSprinting ? 12.5 : 7.5;
    const bobAmp = moveSpeedRatio * (isSprinting ? 0.032 : 0.014);
    const swayX = Math.cos(elapsed * bobFreq * 0.5) * bobAmp + Math.sin(elapsed * 1.4) * 0.004;
    const swayY = Math.abs(Math.sin(elapsed * bobFreq)) * -bobAmp + Math.cos(elapsed * 1.9) * 0.004;

    let targetX = 0.41 + swayX;
    let targetY = -0.52 + swayY - (isMantling ? 0.16 : 0);
    let targetZ = -0.48;
    let rotX = -0.14;
    let rotY = 0;
    let rotZ = -0.42;

    if (isRolling) {
      targetX = 0.18;
      targetY = -0.48;
      targetZ = -0.38;
      rotX = -0.82;
      rotZ = 0.45;
    } else if (wallRunSide !== 0) {
      if (wallRunSide === 1) {
        targetX = 0.34;
        targetY = -0.42 + Math.sin(elapsed * 16) * 0.025;
        targetZ = -0.45;
        rotZ = -0.18;
      } else {
        targetX = 0.45;
        targetY = -0.47 + Math.cos(elapsed * 16) * 0.025;
        targetZ = -0.47;
        rotZ = -0.5;
      }
    } else if (isZiplining) {
      targetX = 0.41;
      targetY = -0.53;
      targetZ = -0.46;
      rotZ = -0.46;
    } else if (isVaulting) {
      targetX = 0.44;
      targetY = -0.45;
      targetZ = -0.46;
      rotZ = -0.5;
    } else if (this.kickTime >= 0 && this.kickIsDropkick) {
      targetX = 0.46;
      targetY = -0.42;
      targetZ = -0.47;
      rotZ = -0.56;
    }

    if (this.animState !== 'idle') {
      this.animTime += dt;
      const t = Math.min(1, this.animTime / this.animDuration);
      const ease = Math.sin(t * Math.PI);

      if (this.animState === 'swing_left') {
        targetX = 0.35 - ease * 0.5;
        targetY = -0.27 + ease * 0.1;
        targetZ = -0.49 - ease * 0.18;
        rotX = -ease * 0.85;
        rotY = ease * 1.35;
        rotZ = ease * 0.9;
        this.swingArcMat.opacity = Math.sin(t * Math.PI) * 0.55;
      } else if (this.animState === 'swing_right') {
        targetX = 0.35 - ease * 0.38;
        targetY = -0.29 + ease * 0.06;
        targetZ = -0.49 - ease * 0.16;
        rotX = -ease * 0.95;
        rotY = -ease * 0.8;
        rotZ = -ease * 1.1;
        this.swingArcMat.opacity = Math.sin(t * Math.PI) * 0.55;
      } else if (this.animState === 'parry') {
        targetX = 0.14 - ease * 0.18;
        targetY = -0.18 + ease * 0.12;
        targetZ = -0.44 - ease * 0.24;
        rotX = -0.55 - ease * 0.7;
        rotY = 0.75;
        rotZ = 0.95;
        this.swingArcMat.opacity = Math.sin(t * Math.PI) * 0.85;
      } else if (this.animState === 'takedown') {
        if (t < 0.35) {
          const up = t / 0.35;
          targetX = 0.15;
          targetY = -0.12 + up * 0.28;
          rotX = 0.45 * up;
        } else {
          const slam = (t - 0.35) / 0.65;
          targetX = 0.15;
          targetY = 0.16 - Math.sin(slam * Math.PI * 0.5) * 0.55;
          targetZ = -0.55 - Math.sin(slam * Math.PI) * 0.2;
          rotX = -1.65 * Math.sin(slam * Math.PI * 0.65);
        }
        this.swingArcMat.opacity = Math.sin(t * Math.PI) * 0.85;
      } else if (this.animState === 'blocked') {
        targetX = 0.42 + ease * 0.14;
        targetY = -0.36 - ease * 0.1;
        rotX = 0.45 * ease;
        rotZ = -0.5 * ease;
        this.swingArcMat.opacity = 0;
      }

      if (this.animTime >= this.animDuration) {
        this.animState = 'idle';
        this.swingArcMat.opacity = 0;
      }
    } else {
      this.swingArcMat.opacity = 0;
    }

    const damp = 1 - Math.exp(-18 * dt);
    this.weaponPivot.position.x = THREE.MathUtils.lerp(this.weaponPivot.position.x, targetX, damp);
    this.weaponPivot.position.y = THREE.MathUtils.lerp(this.weaponPivot.position.y, targetY, damp);
    this.weaponPivot.position.z = THREE.MathUtils.lerp(this.weaponPivot.position.z, targetZ, damp);
    this.weaponPivot.rotation.x = THREE.MathUtils.lerp(this.weaponPivot.rotation.x, rotX, damp);
    this.weaponPivot.rotation.y = THREE.MathUtils.lerp(this.weaponPivot.rotation.y, rotY, damp);
    this.weaponPivot.rotation.z = THREE.MathUtils.lerp(this.weaponPivot.rotation.z, rotZ, damp);

    // 2. Natural Lower-Left Gloved Hand & Watch (subtle idle breathing sway, athletic sprint pump, smooth forward reach on mantle/vault)
    let leftX = -0.46 - swayX * 0.5 + Math.sin(elapsed * 1.4) * 0.004;
    let leftY = -0.58 + swayY * 0.5 + Math.cos(elapsed * 1.8) * 0.006;
    let leftZ = -0.45;
    let leftRotX = -0.08 + Math.sin(elapsed * 1.8) * 0.015;
    let leftRotY = 0.04;
    let leftRotZ = 0.06;

    if (isRolling) {
      leftX = -0.24;
      leftY = -0.42;
      leftZ = -0.42;
      leftRotX = -0.85;
    } else if (wallRunSide === -1) {
      // Left hand glides/skims along the left wall surface!
      leftX = -0.45;
      leftY = -0.18 + Math.sin(elapsed * 16) * 0.035;
      leftZ = -0.58;
      leftRotX = -0.52;
      leftRotZ = 0.12;
    } else if (wallRunSide === 1) {
      leftX = -0.34;
      leftY = -0.28 + Math.cos(elapsed * 16) * 0.035;
      leftZ = -0.54;
      leftRotX = -0.32;
    } else if (isZiplining) {
      leftX = -0.14;
      leftY = 0.06;
      leftZ = -0.52;
      leftRotX = -0.45;
    } else if (isVaulting) {
      // One-handed palm plant pushing smoothly off obstacle!
      leftX = -0.28;
      leftY = -0.28;
      leftZ = -0.6;
      leftRotX = -0.78;
    } else if (isMantling) {
      // Smooth forward ledge-grab extension
      leftX = -0.26;
      leftY = -0.18;
      leftZ = -0.62;
      leftRotX = -0.58;
    } else if (this.kickTime >= 0 && this.kickIsDropkick) {
      leftX = -0.44;
      leftY = -0.34;
      leftZ = -0.48;
      leftRotX = -0.35;
    } else if (this.animState === 'parry') {
      leftX = -0.3;
      leftY = -0.3;
      leftZ = -0.52;
      leftRotX = -0.38;
    } else if (isSliding) {
      leftX = -0.43;
      leftY = -0.4;
      leftZ = -0.43;
      leftRotX = 0.12;
    } else if (canMantle) {
      // Subtle pre-reach cue when facing a climbable edge
      leftX = -0.35;
      leftY = -0.32;
      leftZ = -0.55;
      leftRotX = -0.34;
    } else if (isAirborne) {
      leftX = -0.43;
      leftY = -0.48 + Math.sin(elapsed * 6) * 0.018;
      leftZ = -0.47;
      leftRotX = -0.16;
    } else if (isSprinting) {
      // Natural athletic runner arm-pump in lower-left frame
      leftX = -0.41 + Math.sin(elapsed * 12.5) * 0.042;
      leftY = -0.42 + Math.cos(elapsed * 12.5) * 0.052;
      leftZ = -0.48 - Math.sin(elapsed * 12.5) * 0.075;
      leftRotX = -0.22 + Math.sin(elapsed * 12.5) * 0.14;
      leftRotY = 0.06;
    }

    this.leftArmPivot.position.x = THREE.MathUtils.lerp(this.leftArmPivot.position.x, leftX, damp);
    this.leftArmPivot.position.y = THREE.MathUtils.lerp(this.leftArmPivot.position.y, leftY, damp);
    this.leftArmPivot.position.z = THREE.MathUtils.lerp(this.leftArmPivot.position.z, leftZ, damp);
    this.leftArmPivot.rotation.x = THREE.MathUtils.lerp(this.leftArmPivot.rotation.x, leftRotX, damp);
    this.leftArmPivot.rotation.y = THREE.MathUtils.lerp(this.leftArmPivot.rotation.y, leftRotY, damp);
    this.leftArmPivot.rotation.z = THREE.MathUtils.lerp(this.leftArmPivot.rotation.z, leftRotZ, damp);

    // 3. Dual Parkour Legs & Boots (Kick / Dropkick / Roll / Wall-Run / Slide / Vault / Mantle / Look Down)
    if (this.kickTime >= 0) {
      this.kickTime += dt;
      const dur = this.kickIsDropkick ? 0.42 : 0.34;
      const kp = this.kickTime / dur;
      if (kp >= 1) {
        this.kickTime = -1;
        this.kickIsDropkick = false;
        this.leftLegPivot.visible = false;
        this.rightLegPivot.visible = false;
      } else {
        const thrust = Math.sin(kp * Math.PI);
        if (this.kickIsDropkick) {
          this.leftLegPivot.visible = true;
          this.rightLegPivot.visible = true;
          this.leftLegPivot.position.set(-0.15 + thrust * 0.03, -0.62 + thrust * 0.44, -0.14 - thrust * 0.36);
          this.leftLegPivot.rotation.set(thrust * 0.44, 0, -thrust * 0.08);
          this.rightLegPivot.position.set(0.15 - thrust * 0.03, -0.62 + thrust * 0.44, -0.14 - thrust * 0.36);
          this.rightLegPivot.rotation.set(thrust * 0.44, 0, thrust * 0.08);
        } else {
          this.leftLegPivot.visible = false;
          this.rightLegPivot.visible = true;
          this.rightLegPivot.position.set(0.12 - thrust * 0.1, -0.64 + thrust * 0.42, -0.15 - thrust * 0.34);
          this.rightLegPivot.rotation.set(thrust * 0.48, 0, thrust * 0.14);
        }
      }
    } else if (isRolling) {
      // Safety Landing Roll: curl knees & boots briefly across bottom frame
      this.leftLegPivot.visible = true;
      this.rightLegPivot.visible = true;
      this.leftLegPivot.position.set(-0.14, -0.48, -0.28);
      this.leftLegPivot.rotation.set(0.55, 0, -0.08);
      this.rightLegPivot.position.set(0.14, -0.48, -0.28);
      this.rightLegPivot.rotation.set(0.55, 0, 0.08);
    } else if (wallRunSide !== 0) {
      // High-tempo alternating boots striding against the wall
      this.leftLegPivot.visible = true;
      this.rightLegPivot.visible = true;
      const stride = Math.sin(elapsed * 16) * 0.12;
      this.leftLegPivot.position.set(-0.17, -0.62 + stride, -0.2);
      this.leftLegPivot.rotation.set(0.28 + stride * 0.8, 0, wallRunSide * -0.16);
      this.rightLegPivot.position.set(0.17, -0.62 - stride, -0.2);
      this.rightLegPivot.rotation.set(0.28 - stride * 0.8, 0, wallRunSide * -0.16);
    } else if (isSliding) {
      // Tactical Slide: swing BOTH legs forward into view across the sandstone tiles!
      this.leftLegPivot.visible = true;
      this.rightLegPivot.visible = true;
      this.leftLegPivot.position.set(-0.14, -0.49, -0.27);
      this.leftLegPivot.rotation.set(0.18, 0, -0.09);
      this.rightLegPivot.position.set(0.12, -0.42, -0.36);
      this.rightLegPivot.rotation.set(0.28, 0, 0.1);
    } else if (isVaulting) {
      this.leftLegPivot.visible = true;
      this.rightLegPivot.visible = true;
      this.leftLegPivot.position.set(-0.16, -0.52, -0.26);
      this.leftLegPivot.rotation.set(0.32, 0, -0.18);
      this.rightLegPivot.position.set(0.16, -0.56, -0.22);
      this.rightLegPivot.rotation.set(0.26, 0, 0.12);
    } else if (isMantling) {
      this.leftLegPivot.visible = false;
      this.rightLegPivot.visible = true;
      this.rightLegPivot.position.set(0.16, -0.58, -0.2);
      this.rightLegPivot.rotation.set(0.26, 0, 0.08);
    } else if (isAirborne || isZiplining) {
      this.leftLegPivot.visible = true;
      this.rightLegPivot.visible = true;
      const tuck = Math.sin(elapsed * 8) * 0.025;
      this.leftLegPivot.position.set(-0.18, -0.64 + tuck, -0.18);
      this.leftLegPivot.rotation.set(0.18, 0, -0.04);
      this.rightLegPivot.position.set(0.18, -0.62 - tuck, -0.2);
      this.rightLegPivot.rotation.set(0.24, 0, 0.04);
    } else if (isLookingDown) {
      // Looking downward reveals the runner's legs & boots below
      this.leftLegPivot.visible = true;
      this.rightLegPivot.visible = true;
      const stride = Math.sin(elapsed * 9) * moveSpeedRatio * 0.08;
      this.leftLegPivot.position.set(-0.16, -0.82, -0.1 + stride);
      this.leftLegPivot.rotation.set(-0.75, 0, -0.03);
      this.rightLegPivot.position.set(0.16, -0.82, -0.1 - stride);
      this.rightLegPivot.rotation.set(-0.75, 0, 0.03);
    } else {
      this.leftLegPivot.visible = false;
      this.rightLegPivot.visible = false;
    }

    // 4. Heavy Takedown shockwave ring
    if (this.shockwaveTime >= 0) {
      this.shockwaveTime += dt;
      const p = this.shockwaveTime / 0.45;
      if (p >= 1) {
        this.shockwaveTime = -1;
        this.shockwaveMesh.visible = false;
      } else {
        this.shockwaveMesh.scale.setScalar(0.6 + p * 7.2);
        this.shockwaveMat.opacity = (1 - p) * 0.85;
      }
    }

    // 5. Spark & Blood impact particles
    for (let i = 0; i < this.sparkPool.length; i++) {
      const p = this.sparkPool[i];
      if (p.life > 0) {
        p.life -= dt;
        p.vel.y -= 14 * dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        if (p.mesh.position.y < 0.04) {
          p.mesh.position.y = 0.04;
          p.vel.y *= -0.4;
        }
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, p.life / p.maxLife);
        if (p.life <= 0) p.mesh.visible = false;
      }
    }
    for (let i = 0; i < this.bloodPool.length; i++) {
      const b = this.bloodPool[i];
      if (b.life > 0) {
        b.life -= dt;
        b.vel.y -= 16 * dt;
        b.mesh.position.addScaledVector(b.vel, dt);
        if (b.mesh.position.y < 0.03) {
          b.mesh.position.y = 0.03;
          b.vel.set(0, 0, 0);
        }
        (b.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (b.life / b.maxLife) * 0.92);
        if (b.life <= 0) b.mesh.visible = false;
      }
    }

    // 6. Dust puff particles (rooftop landings & tactical slides)
    for (let i = 0; i < this.dustPool.length; i++) {
      const d = this.dustPool[i];
      if (d.life > 0) {
        d.life -= dt;
        d.mesh.position.addScaledVector(d.vel, dt);
        d.vel.multiplyScalar(Math.exp(-3.5 * dt));
        const prog = 1 - d.life / d.maxLife;
        d.mesh.scale.setScalar(0.65 + prog * 1.45);
        (d.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (1 - prog) * 0.42);
        if (d.life <= 0) d.mesh.visible = false;
      }
    }

    // 6. Thrown Firecrackers
    for (let i = this.activeFirecrackers.length - 1; i >= 0; i--) {
      const fc = this.activeFirecrackers[i];
      fc.age += dt;
      fc.vel.y -= 18 * dt;
      fc.pos.addScaledVector(fc.vel, dt);
      if (fc.pos.y < 0.08) {
        fc.pos.y = 0.08;
        fc.vel.y = Math.abs(fc.vel.y) * 0.32;
        fc.vel.x *= 0.68;
        fc.vel.z *= 0.68;
      }
      fc.mesh.position.copy(fc.pos);
      fc.mesh.rotation.x += dt * 7;
      fc.mesh.rotation.z += dt * 5;

      if (i === this.activeFirecrackers.length - 1) {
        fc.light.position.copy(fc.pos);
      }

      fc.sparkTimer += dt;
      if (!fc.banged && fc.sparkTimer > 0.07) {
        fc.sparkTimer = 0;
        this.spawnSparks(fc.pos, 0xfde047, 2);
      }

      if (!fc.banged && fc.age >= 0.95) {
        fc.banged = true;
        this.spawnSparks(fc.pos, 0xf97316, 16);
        fc.light.intensity = 10;
        onFirecrackerBang(fc.pos);
      }

      if (fc.banged && i === this.activeFirecrackers.length - 1) {
        fc.light.intensity = 3.5 + Math.sin(fc.age * 28) * 2.0;
        if (fc.age < 3.5 && Math.random() < 0.25) {
          this.spawnSparks(fc.pos, 0xfef08a, 1);
        }
      }

      if (fc.age >= fc.lureDuration) {
        this.scene.remove(fc.mesh);
        this.activeFirecrackers.splice(i, 1);
      }
    }
    if (this.activeFirecrackers.length === 0 && this.firecrackerLight.intensity > 0) {
      this.firecrackerLight.intensity = 0;
    }
  }

  public dispose(): void {
    this.camera.remove(this.weaponPivot);
    this.camera.remove(this.leftArmPivot);
    this.camera.remove(this.leftLegPivot);
    this.camera.remove(this.rightLegPivot);
    this.camera.remove(this.swingArcMesh);
    this.scene.remove(this.shockwaveMesh);
    this.scene.remove(this.firecrackerLight);
    this.sparkPool.forEach((p) => this.scene.remove(p.mesh));
    this.bloodPool.forEach((b) => this.scene.remove(b.mesh));
    this.dustPool.forEach((d) => this.scene.remove(d.mesh));
    this.activeFirecrackers.forEach((fc) => this.scene.remove(fc.mesh));
    this.disposables.forEach((d) => d.dispose());
  }
}
