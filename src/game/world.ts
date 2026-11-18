import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import type { ProceduralTextureSet } from './textures';
import type { AntizinCrateState, ClimbableZone, RampObstacle, WorldBoxObstacle } from './types';
import { buildVikramNpc } from './entities';

export interface CrateVisualHandle {
  state: AntizinCrateState;
  group: THREE.Group;
  beaconMat: THREE.MeshBasicMaterial;
  beaconRing: THREE.Mesh;
}

export interface WorldHandles {
  obstacles: WorldBoxObstacle[];
  ramps: RampObstacle[];
  climbables: ClimbableZone[];
  crates: CrateVisualHandle[];
  safeHouseCenter: THREE.Vector3;
  safeHouseRadius: number;
  watchtowerPos: THREE.Vector3;
  tajPosition: THREE.Vector3;
  waterMaterial: THREE.MeshPhysicalMaterial;
  fountainJets: THREE.Mesh[];
  rippleRings: THREE.Mesh[];
  headlightMats: THREE.MeshBasicMaterial[];
  uvBarrierMesh: THREE.Mesh;
  beaconLight: THREE.PointLight;
  vikramNpc: THREE.Group;
  vikramMuzzleFlash: THREE.Mesh;
  dispose: () => void;
}

/**
 * Creates a pointed Mughal ogee archway frame (ExtrudeGeometry) using Shape + arch cutout hole.
 */
function createMughalArchFrameGeo(
  frameW: number,
  frameH: number,
  archW: number,
  archH: number,
  depth: number,
): THREE.ExtrudeGeometry {
  const hw = frameW * 0.5;
  const ahw = archW * 0.5;
  const shoulderY = archH * 0.56;

  const shape = new THREE.Shape();
  shape.moveTo(-hw, 0);
  shape.lineTo(hw, 0);
  shape.lineTo(hw, frameH);
  shape.lineTo(-hw, frameH);
  shape.closePath();

  const hole = new THREE.Path();
  hole.moveTo(-ahw, 0);
  hole.lineTo(ahw, 0);
  hole.lineTo(ahw, shoulderY);
  hole.quadraticCurveTo(ahw * 0.82, archH * 0.88, 0, archH);
  hole.quadraticCurveTo(-ahw * 0.82, archH * 0.88, -ahw, shoulderY);
  hole.closePath();
  shape.holes.push(hole);

  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 14,
  });
}

/**
 * Creates a solid pointed arch silhouette for shadowed recessed arch alcoves.
 */
function createArchVoidGeo(archW: number, archH: number, depth: number): THREE.ExtrudeGeometry {
  const ahw = archW * 0.5;
  const shoulderY = archH * 0.56;

  const shape = new THREE.Shape();
  shape.moveTo(-ahw, 0);
  shape.lineTo(ahw, 0);
  shape.lineTo(ahw, shoulderY);
  shape.quadraticCurveTo(ahw * 0.82, archH * 0.88, 0, archH);
  shape.quadraticCurveTo(-ahw * 0.82, archH * 0.88, -ahw, shoulderY);
  shape.closePath();

  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 14,
  });
}

/**
 * Creates the chamfered-corner octagonal base shape for the Taj Mahal mausoleum.
 */
function createChamferedOctagonGeo(
  halfSpan: number,
  chamfer: number,
  height: number,
): THREE.ExtrudeGeometry {
  const s = halfSpan;
  const c = s - chamfer;
  const shape = new THREE.Shape();
  shape.moveTo(-c, -s);
  shape.lineTo(c, -s);
  shape.lineTo(s, -c);
  shape.lineTo(s, c);
  shape.lineTo(c, s);
  shape.lineTo(-c, s);
  shape.lineTo(-s, c);
  shape.lineTo(-s, -c);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
  });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

export function buildTajCourtyardWorld(
  scene: THREE.Scene,
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean,
): WorldHandles {
  const obstacles: WorldBoxObstacle[] = [];
  const ramps: RampObstacle[] = [];
  const climbables: ClimbableZone[] = [];
  const crates: CrateVisualHandle[] = [];
  const fountainJets: THREE.Mesh[] = [];
  const rippleRings: THREE.Mesh[] = [];
  const headlightMats: THREE.MeshBasicMaterial[] = [];
  const disposableGeos: THREE.BufferGeometry[] = [];
  const disposableMats: THREE.Material[] = [];
  let reflectorRef: Reflector | null = null;

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposableGeos.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposableMats.push(m);
    return m;
  };

  // Shared Materials
  const groundMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.courtyardGround,
      roughness: 0.92,
      metalness: 0.04,
    }),
  );
  const marbleMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.marble,
      color: 0xf6f2ea,
      roughness: 0.32,
      metalness: 0.08,
    }),
  );
  const pietraDuraMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.pietraDura,
      color: 0xf7f2e8,
      roughness: 0.36,
      metalness: 0.06,
    }),
  );
  const sandstoneMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.sandstone,
      color: 0xa45142,
      roughness: 0.84,
      metalness: 0.05,
    }),
  );
  const archVoidMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x12151f,
      roughness: 0.94,
    }),
  );
  const jaliMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x4b443b,
      roughness: 0.72,
      metalness: 0.15,
    }),
  );
  const finialMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe6b84c,
      metalness: 0.9,
      roughness: 0.2,
    }),
  );
  const woodMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.woodPlank,
      color: 0x8b6543,
      roughness: 0.86,
      metalness: 0.04,
    }),
  );
  const steelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3b424c,
      roughness: 0.42,
      metalness: 0.78,
    }),
  );
  const corrugatedMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.corrugatedMetal,
      roughness: 0.56,
      metalness: 0.62,
    }),
  );
  const concreteMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x6b7075,
      roughness: 0.92,
      metalness: 0.04,
    }),
  );
  const hazardMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.hazardStripe,
      roughness: 0.7,
    }),
  );
  const sandbagMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x8f8062,
      map: textures.tacticalCloth,
      roughness: 0.92,
    }),
  );
  const tarpYellowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xca8a04,
      roughness: 0.72,
    }),
  );
  const bannerRedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x991b1b,
      roughness: 0.85,
      side: THREE.DoubleSide,
    }),
  );
  const humveeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3f4a36,
      roughness: 0.72,
      metalness: 0.32,
    }),
  );
  const rickshawGreenMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1e5c3a,
      roughness: 0.65,
      metalness: 0.25,
    }),
  );
  const rickshawYellowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd9a11e,
      roughness: 0.62,
      metalness: 0.18,
    }),
  );
  const tireMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x17171a,
      roughness: 0.92,
    }),
  );

  // 1. Extended Ground Plane (280x280)
  const ground = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(280, 280)), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Symmetrical Red-Sandstone Charbagh Walkways
  const northSouthWalkway = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(18, 0.16, 82)),
    sandstoneMat,
  );
  northSouthWalkway.position.set(0, 0.08, -2);
  northSouthWalkway.receiveShadow = true;
  scene.add(northSouthWalkway);

  const eastWestWalkway = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(82, 0.16, 12)),
    sandstoneMat,
  );
  eastWestWalkway.position.set(0, 0.09, 4);
  eastWestWalkway.receiveShadow = true;
  scene.add(eastWestWalkway);

  [-20, 20].forEach((px) => {
    const sidePath = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5, 0.14, 78)), sandstoneMat);
    sidePath.position.set(px, 0.07, -2);
    sidePath.receiveShadow = true;
    scene.add(sidePath);
  });

  // 2. Central Reflective Water Pool (Planar Mirror Reflector + Translucent Ripple Surface)
  const reflectorGeo = trackGeo(new THREE.PlaneGeometry(7.2, 70));
  const reflector = new Reflector(reflectorGeo, {
    color: 0x6ca9c8,
    textureWidth: isSoftwareGl ? 256 : 768,
    textureHeight: isSoftwareGl ? 512 : 1024,
    clipBias: 0.003,
    multisample: 0,
  });
  reflector.rotation.x = -Math.PI / 2;
  reflector.position.set(0, 0.175, -2);
  scene.add(reflector);
  reflectorRef = reflector;

  const waterMaterial = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x164e6e,
      roughness: 0.08,
      metalness: 0.18,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      normalMap: textures.waterNormal,
      normalScale: new THREE.Vector2(0.22, 0.22),
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
    }),
  );
  const poolSurface = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(7.2, 70)), waterMaterial);
  poolSurface.rotation.x = -Math.PI / 2;
  poolSurface.position.set(0, 0.19, -2);
  scene.add(poolSurface);

  // Marble pool borders & angled poolside floodlight housings (as in reference photo)
  const curbGeo = trackGeo(new THREE.BoxGeometry(0.65, 0.38, 70));
  const curbL = new THREE.Mesh(curbGeo, marbleMat);
  curbL.position.set(-3.9, 0.19, -2);
  const curbR = new THREE.Mesh(curbGeo, marbleMat);
  curbR.position.set(3.9, 0.19, -2);
  scene.add(curbL, curbR);

  const lampHousingGeo = trackGeo(new THREE.BoxGeometry(0.32, 0.24, 0.4));
  const lampLensGeo = trackGeo(new THREE.PlaneGeometry(0.24, 0.16));
  const lampLensMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xfef3c7 }));
  [-24, -10, 16, 28].forEach((lz) => {
    [-4.35, 4.35].forEach((lx) => {
      const fixture = new THREE.Mesh(lampHousingGeo, steelMat);
      fixture.position.set(lx, 0.22, lz);
      fixture.rotation.x = -0.45;
      const lens = new THREE.Mesh(lampLensGeo, lampLensMat);
      lens.position.set(lx, 0.3, lz - 0.16);
      lens.rotation.x = -0.9;
      scene.add(fixture, lens);
    });
  });

  // Raised White Marble Lotus Tank Viewing Platform (Al-Kawthar) at z = 4
  const alKawtharGroup = new THREE.Group();
  alKawtharGroup.position.set(0, 0, 4);

  const tankBase = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(11.4, 0.62, 11.4)),
    marbleMat,
  );
  tankBase.position.y = 0.31;
  tankBase.receiveShadow = true;
  tankBase.castShadow = !isSoftwareGl;
  alKawtharGroup.add(tankBase);

  // Inset turquoise lotus pool on top of the marble platform
  const lotusWater = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(5.8, 5.8)),
    waterMaterial,
  );
  lotusWater.rotation.x = -Math.PI / 2;
  lotusWater.position.y = 0.64;
  alKawtharGroup.add(lotusWater);

  // Decorative stone benches around the Al-Kawthar viewing platform
  const benchTopGeo = trackGeo(new THREE.BoxGeometry(2.8, 0.14, 0.68));
  const benchLegGeo = trackGeo(new THREE.BoxGeometry(0.24, 0.36, 0.56));
  const benchCoords: Array<[number, number, number]> = [
    [0, -4.4, 0],
    [0, 4.4, 0],
    [-4.4, 0, Math.PI / 2],
    [4.4, 0, Math.PI / 2],
  ];
  for (const [bx, bz, rot] of benchCoords) {
    const bench = new THREE.Group();
    bench.position.set(bx, 0.62, bz);
    bench.rotation.y = rot;
    const seat = new THREE.Mesh(benchTopGeo, marbleMat);
    seat.position.y = 0.38;
    const legL = new THREE.Mesh(benchLegGeo, marbleMat);
    legL.position.set(-1.05, 0.18, 0);
    const legR = new THREE.Mesh(benchLegGeo, marbleMat);
    legR.position.set(1.05, 0.18, 0);
    bench.add(seat, legL, legR);
    alKawtharGroup.add(bench);
  }

  // Corner railing bollards on Al-Kawthar
  const bollardGeo = trackGeo(new THREE.CylinderGeometry(0.16, 0.2, 0.72, 10));
  [
    [-5.3, -5.3],
    [5.3, -5.3],
    [-5.3, 5.3],
    [5.3, 5.3],
  ].forEach(([cx, cz]) => {
    const bol = new THREE.Mesh(bollardGeo, marbleMat);
    bol.position.set(cx, 0.96, cz);
    alKawtharGroup.add(bol);
  });

  // Expanding water ripple rings in Al-Kawthar tank
  const rippleGeo = trackGeo(new THREE.RingGeometry(0.65, 0.78, 28));
  for (let r = 0; r < 2; r++) {
    const rMat = trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xa5f3fc,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    const ripple = new THREE.Mesh(rippleGeo, rMat);
    ripple.rotation.x = -Math.PI / 2;
    ripple.position.y = 0.66;
    ripple.userData = { phase: r * 0.5 };
    alKawtharGroup.add(ripple);
    rippleRings.push(ripple);
  }
  scene.add(alKawtharGroup);
  obstacles.push({
    x: 0,
    z: 4,
    halfW: 5.7,
    halfD: 5.7,
    height: 0.62,
    vaultable: true,
    mantleable: false,
  });

  // Fountain nozzles down the reflecting pool (sleek low bowls so Taj reflection stays crystal clear)
  const jetMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xbfe7ff,
      transparent: true,
      opacity: 0.55,
    }),
  );
  const fountainBowlGeo = trackGeo(new THREE.CylinderGeometry(0.55, 0.32, 0.36, 14));
  const fountainJetGeo = trackGeo(new THREE.CylinderGeometry(0.08, 0.16, 1.4, 10));

  [-26, -16, 4, 18, 28].forEach((fz) => {
    const isCenter = fz === 4;
    const bowl = new THREE.Mesh(fountainBowlGeo, marbleMat);
    bowl.position.set(0, isCenter ? 0.78 : 0.28, fz);
    const jet = new THREE.Mesh(fountainJetGeo, jetMat);
    jet.position.set(0, isCenter ? 1.58 : 0.96, fz);
    scene.add(bowl, jet);
    fountainJets.push(jet);
  });

  // 3. Sculpted Taj Mahal at the North End (z = -58)
  const tajGroup = new THREE.Group();
  tajGroup.position.set(0, 0, -58);

  // Extended red-sandstone terrace behind the marble plinth (hosts Masjid & Jawab)
  const rearTerrace = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(98, 2.2, 34)),
    sandstoneMat,
  );
  rearTerrace.position.set(0, 1.1, -2);
  rearTerrace.receiveShadow = true;
  tajGroup.add(rearTerrace);

  // Raised White Marble Plinth with parapet trim & walkable front stairway
  const plinth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(48, 3.4, 36)), marbleMat);
  plinth.position.y = 1.7;
  plinth.receiveShadow = true;
  plinth.castShadow = !isSoftwareGl;
  tajGroup.add(plinth);
  obstacles.push({
    x: 0,
    z: -58,
    halfW: 24,
    halfD: 18,
    height: 3.4,
    vaultable: false,
    mantleable: true,
  });

  // Solid walkable Main Mausoleum Roof Terrace (y = 18.9) & Dome Drum (y = 22.1)
  obstacles.push({
    x: 0,
    z: -58,
    halfW: 12.6,
    halfD: 12.6,
    height: 18.9,
    vaultable: false,
    mantleable: true,
  });
  obstacles.push({
    x: 0,
    z: -58,
    halfW: 6.7,
    halfD: 6.7,
    height: 22.1,
    vaultable: false,
    mantleable: true,
  });

  // Walkable Front Marble Stairway Ramp up onto Taj Plinth (z = -35.8 -> -40.2)
  ramps.push({
    x: 0,
    z: -38.0,
    halfW: 4.8,
    halfD: 2.3,
    yLow: 0,
    yHigh: 3.4,
    axis: 'z-',
  });

  // Subtle architectural floodlights illuminating Taj Mahal front facade for rich dusk/night reflection
  const tajWashL = new THREE.PointLight(0xffcf87, 38, 38, 1.4);
  tajWashL.position.set(-10, 8, -40);
  const tajWashR = new THREE.PointLight(0xffcf87, 38, 38, 1.4);
  tajWashR.position.set(10, 8, -40);
  scene.add(tajWashL, tajWashR);

  // Plinth decorative parapet trim & dado inlay strip
  const plinthParapet = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(48.4, 0.36, 36.4)),
    pietraDuraMat,
  );
  plinthParapet.position.y = 3.28;
  tajGroup.add(plinthParapet);

  // Front central white marble staircase leading up onto plinth
  for (let s = 0; s < 5; s++) {
    const step = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(9.2, 0.68, 3.6 - s * 0.55)),
      marbleMat,
    );
    step.position.set(0, 0.34 + s * 0.68, 19.2 - s * 0.45);
    tajGroup.add(step);
  }

  // Chamfered-Corner Octagonal Main Mausoleum Body
  const octGeo = trackGeo(createChamferedOctagonGeo(13.2, 4.1, 15.5));
  const mainOctagon = new THREE.Mesh(octGeo, marbleMat);
  mainOctagon.position.y = 3.4;
  mainOctagon.castShadow = !isSoftwareGl;
  mainOctagon.receiveShadow = true;
  tajGroup.add(mainOctagon);

  // Shared Geometries for Towering Pishtaqs & Flanking Double-Tier Recessed Arched Niches
  const pishtaqFrameGeo = trackGeo(createMughalArchFrameGeo(9.6, 17.4, 6.4, 13.4, 1.1));
  const pishtaqVoidGeo = trackGeo(createArchVoidGeo(6.4, 13.4, 0.35));
  const nicheFrameGeo = trackGeo(createMughalArchFrameGeo(3.6, 6.0, 2.3, 4.5, 0.45));
  const nicheVoidGeo = trackGeo(createArchVoidGeo(2.3, 4.5, 0.2));
  const jaliScreenGeo = trackGeo(new THREE.BoxGeometry(2.4, 4.4, 0.16));
  const guldastaGeo = trackGeo(new THREE.CylinderGeometry(0.16, 0.2, 3.4, 8));
  const guldastaTipGeo = trackGeo(new THREE.SphereGeometry(0.24, 10, 8));

  // Build 4 Cardinal Faces (central pishtaq + 2 flanking tiers of recessed niches)
  [0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach((rotY) => {
    const face = new THREE.Group();
    face.rotation.y = rotY;

    const pFrame = new THREE.Mesh(pishtaqFrameGeo, pietraDuraMat);
    pFrame.position.set(0, 3.4, 12.65);
    const pVoid = new THREE.Mesh(pishtaqVoidGeo, archVoidMat);
    pVoid.position.set(0, 3.4, 12.4);
    const jali = new THREE.Mesh(jaliScreenGeo, jaliMat);
    jali.position.set(0, 5.6, 12.8);
    face.add(pFrame, pVoid, jali);

    // Guldasta rooftop pinnacles flanking the pishtaq frame
    [-4.65, 4.65].forEach((gx) => {
      const spire = new THREE.Mesh(guldastaGeo, marbleMat);
      spire.position.set(gx, 21.8, 13.15);
      const tip = new THREE.Mesh(guldastaTipGeo, finialMat);
      tip.position.set(gx, 23.6, 13.15);
      face.add(spire, tip);
    });

    // Two tiers of recessed pointed arched alcoves flanking the central pishtaq
    [-6.9, 6.9].forEach((nx) => {
      [4.2, 10.7].forEach((ny) => {
        const nFrame = new THREE.Mesh(nicheFrameGeo, pietraDuraMat);
        nFrame.position.set(nx, ny, 13.02);
        const nVoid = new THREE.Mesh(nicheVoidGeo, archVoidMat);
        nVoid.position.set(nx, ny, 12.88);
        face.add(nFrame, nVoid);
      });
    });

    tajGroup.add(face);
  });

  // 4 Chamfered Corner Faces (double-tier recessed pointed alcoves)
  [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4].forEach((rotY) => {
    const cFace = new THREE.Group();
    cFace.rotation.y = rotY;
    [4.2, 10.7].forEach((ny) => {
      const nFrame = new THREE.Mesh(nicheFrameGeo, pietraDuraMat);
      nFrame.position.set(0, ny, 15.62);
      const nVoid = new THREE.Mesh(nicheVoidGeo, archVoidMat);
      nVoid.position.set(0, ny, 15.48);
      cFace.add(nFrame, nVoid);
    });
    tajGroup.add(cFace);
  });

  // High Cylindrical Drum beneath Central Dome
  const domeDrum = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(6.9, 7.1, 3.2, 32)),
    pietraDuraMat,
  );
  domeDrum.position.set(0, 20.5, 0);
  tajGroup.add(domeDrum);

  // Bulbous White Marble Onion Dome + Inverted Lotus Petal Cap + Golden Brass Finial Spire
  const domePoints = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(6.5, 0.0),
    new THREE.Vector2(7.0, 2.2),
    new THREE.Vector2(7.7, 5.4),
    new THREE.Vector2(7.0, 8.4),
    new THREE.Vector2(4.6, 11.2),
    new THREE.Vector2(1.9, 13.0),
    new THREE.Vector2(0.45, 14.3),
    new THREE.Vector2(0.0, 15.0),
  ];
  const mainDome = new THREE.Mesh(trackGeo(new THREE.LatheGeometry(domePoints, 32)), marbleMat);
  mainDome.position.set(0, 22.0, 0);
  mainDome.castShadow = !isSoftwareGl;
  tajGroup.add(mainDome);

  // Inverted Lotus Cap crowning the onion dome
  const lotusPoints = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(1.55, 0.0),
    new THREE.Vector2(1.3, 0.45),
    new THREE.Vector2(0.85, 0.9),
    new THREE.Vector2(0.32, 1.3),
    new THREE.Vector2(0.0, 1.4),
  ];
  const lotusCap = new THREE.Mesh(trackGeo(new THREE.LatheGeometry(lotusPoints, 18)), marbleMat);
  lotusCap.position.set(0, 35.8, 0);
  tajGroup.add(lotusCap);

  // Gleaming Golden Brass Finial Spire (kalash spheres + spire + crescent)
  const finialSpire = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.08, 0.24, 4.4, 12)),
    finialMat,
  );
  finialSpire.position.set(0, 38.8, 0);
  const kalash1 = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.44, 14, 10)), finialMat);
  kalash1.position.set(0, 37.6, 0);
  const kalash2 = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.32, 14, 10)), finialMat);
  kalash2.position.set(0, 38.5, 0);
  const crescent = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(0.38, 0.08, 8, 16, Math.PI * 1.2)),
    finialMat,
  );
  crescent.rotation.z = -Math.PI * 0.6;
  crescent.position.set(0, 40.9, 0);
  tajGroup.add(finialSpire, kalash1, kalash2, crescent);

  // Four Open Domed Chhatri Pavilions around the Roof
  const chhatriDomeGeo = trackGeo(new THREE.SphereGeometry(2.1, 18, 12));
  const chhatriEaveGeo = trackGeo(new THREE.CylinderGeometry(2.55, 2.75, 0.26, 8));
  const chhatriColGeo = trackGeo(new THREE.CylinderGeometry(0.18, 0.22, 3.2, 8));
  const chhatriFinialGeo = trackGeo(new THREE.ConeGeometry(0.16, 0.95, 10));
  [
    [-7.8, -7.8],
    [7.8, -7.8],
    [-7.8, 7.8],
    [7.8, 7.8],
  ].forEach(([cx, cz]) => {
    const chhatri = new THREE.Group();
    chhatri.position.set(cx, 18.9, cz);
    [
      [-1.3, -1.3],
      [1.3, -1.3],
      [-1.3, 1.3],
      [1.3, 1.3],
    ].forEach(([px, pz]) => {
      const col = new THREE.Mesh(chhatriColGeo, marbleMat);
      col.position.set(px, 1.6, pz);
      chhatri.add(col);
    });
    const eave = new THREE.Mesh(chhatriEaveGeo, marbleMat);
    eave.position.y = 3.25;
    const dome = new THREE.Mesh(chhatriDomeGeo, marbleMat);
    dome.position.y = 4.2;
    dome.scale.set(1, 0.95, 1);
    const fin = new THREE.Mesh(chhatriFinialGeo, finialMat);
    fin.position.y = 6.55;
    chhatri.add(eave, dome, fin);
    tajGroup.add(chhatri);
  });

  // Four Detailed Corner Minarets (3 balcony rings, dark vertical window slits, open top chhatri cupola + golden finial)
  const minaretGeo = trackGeo(new THREE.CylinderGeometry(1.02, 1.56, 25.0, 20));
  const minaretBaseGeo = trackGeo(new THREE.CylinderGeometry(1.9, 2.1, 1.4, 8));
  const balconyBracketGeo = trackGeo(new THREE.CylinderGeometry(1.95, 1.3, 0.55, 20));
  const balconyRimGeo = trackGeo(new THREE.CylinderGeometry(2.05, 1.95, 0.42, 20));
  const slitGeo = trackGeo(new THREE.BoxGeometry(0.24, 1.25, 0.25));
  const minPillarGeo = trackGeo(new THREE.CylinderGeometry(0.11, 0.12, 2.5, 8));
  const minCupolaGeo = trackGeo(new THREE.SphereGeometry(1.3, 16, 12));
  const minFinialGeo = trackGeo(new THREE.ConeGeometry(0.14, 1.15, 8));

  [
    [-21, -15],
    [21, -15],
    [-21, 15],
    [21, 15],
  ].forEach(([mx, mz]) => {
    const minaret = new THREE.Group();
    minaret.position.set(mx, 3.4, mz);

    const base = new THREE.Mesh(minaretBaseGeo, marbleMat);
    base.position.y = 0.7;
    const shaft = new THREE.Mesh(minaretGeo, marbleMat);
    shaft.position.y = 13.2;
    shaft.castShadow = !isSoftwareGl;
    minaret.add(base, shaft);

    // 3 Balcony Tiers
    [8.6, 16.4, 24.4].forEach((by, bIdx) => {
      const s = 1 - bIdx * 0.08;
      const bracket = new THREE.Mesh(balconyBracketGeo, pietraDuraMat);
      bracket.position.y = by;
      bracket.scale.set(s, 1, s);
      const rim = new THREE.Mesh(balconyRimGeo, marbleMat);
      rim.position.y = by + 0.45;
      rim.scale.set(s, 1, s);
      minaret.add(bracket, rim);
    });

    // Dark vertical window slits staggered up the shaft
    [5.0, 12.6, 20.4].forEach((sy) => {
      const slitF = new THREE.Mesh(slitGeo, archVoidMat);
      slitF.position.set(0, sy, 1.32);
      const slitS = new THREE.Mesh(slitGeo, archVoidMat);
      slitS.rotation.y = Math.PI / 2;
      slitS.position.set(mx < 0 ? 1.32 : -1.32, sy, 0);
      minaret.add(slitF, slitS);
    });

    // Open top Chhatri Cupola with 6 slender pillars & golden finial
    for (let p = 0; p < 6; p++) {
      const ang = (p / 6) * Math.PI * 2;
      const pil = new THREE.Mesh(minPillarGeo, marbleMat);
      pil.position.set(Math.cos(ang) * 0.85, 26.2, Math.sin(ang) * 0.85);
      minaret.add(pil);
    }
    const cupola = new THREE.Mesh(minCupolaGeo, marbleMat);
    cupola.position.y = 27.9;
    const mFin = new THREE.Mesh(minFinialGeo, finialMat);
    mFin.position.y = 29.6;
    minaret.add(cupola, mFin);

    tajGroup.add(minaret);

    // Register walkable balcony rings & top chhatri deck on the two front minarets (mz === 15)
    if (mz > 0) {
      const worldMx = mx;
      const worldMz = -58 + mz;
      [12.0, 19.8, 27.8].forEach((balY) => {
        obstacles.push({
          x: worldMx,
          z: worldMz,
          halfW: 2.05,
          halfD: 2.05,
          height: balY,
          vaultable: false,
          mantleable: true,
        });
      });
    }
  });

  // Interactable Taj Mahal Climbing Scaffolding, Rope Ladders & Minaret Access Ladders
  const ladderRailGeo = trackGeo(new THREE.CylinderGeometry(0.04, 0.04, 1, 8));
  const ladderRungGeo = trackGeo(new THREE.CylinderGeometry(0.03, 0.03, 0.72, 8));
  const rungYellowMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.6, metalness: 0.25 }),
  );
  const buildClimbingLadder = (
    id: string,
    label: string,
    wx: number,
    wz: number,
    yMin: number,
    yMax: number,
    rotY: number,
    exitX: number,
    exitZ: number,
  ) => {
    const h = yMax - yMin;
    const lGroup = new THREE.Group();
    lGroup.position.set(wx, yMin, wz);
    lGroup.rotation.y = rotY;

    [-0.36, 0.36].forEach((rx) => {
      const rail = new THREE.Mesh(ladderRailGeo, steelMat);
      rail.scale.y = h;
      rail.position.set(rx, h * 0.5, 0);
      lGroup.add(rail);
    });
    for (let ry = 0.45; ry < h; ry += 0.55) {
      const isMarker = Math.round(ry / 0.55) % 4 === 0;
      const rung = new THREE.Mesh(ladderRungGeo, isMarker ? rungYellowMat : steelMat);
      rung.rotation.z = Math.PI / 2;
      rung.position.set(0, ry, 0);
      lGroup.add(rung);
    }
    scene.add(lGroup);
    climbables.push({
      id,
      label,
      x: wx,
      z: wz,
      radius: 1.65,
      yMin,
      yMax,
      exitX,
      exitZ,
    });
  };

  // 1. Central Front Pishtaq Restoration Ladder (Plinth y=3.4 -> Roof y=18.9)
  buildClimbingLadder(
    'taj-pishtaq-ladder',
    'Taj Pishtaq Scaffolding',
    -5.6,
    -44.5,
    3.4,
    18.9,
    0,
    -5.6,
    -46.8,
  );
  // 2. East Mausoleum Flank Scaffolding + Mid-Level Inspection Catwalk (y=11.0)
  buildClimbingLadder(
    'taj-east-scaffold',
    'Taj East Niche Scaffolding',
    13.6,
    -58,
    3.4,
    18.9,
    Math.PI / 2,
    11.4,
    -58,
  );
  const midCatwalk = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.4, 0.24, 5.4)), woodMat);
  midCatwalk.position.set(14.3, 11.0, -58);
  scene.add(midCatwalk);
  obstacles.push({
    x: 14.3,
    z: -58,
    halfW: 1.2,
    halfD: 2.7,
    height: 11.12,
    vaultable: false,
    mantleable: true,
  });
  // 3. Roof-to-Onion-Dome Drum Ladder (y=18.9 -> y=22.1)
  buildClimbingLadder(
    'taj-dome-drum-ladder',
    'Taj Onion Dome Drum',
    0,
    -50.9,
    18.9,
    22.1,
    0,
    0,
    -52.8,
  );
  // 4 & 5. South-West & South-East Minaret Balcony Ladders (y=3.4 -> y=27.8)
  buildClimbingLadder(
    'minaret-sw-ladder',
    'SW Minaret Balcony Ladder',
    -21,
    -40.9,
    3.4,
    27.8,
    0,
    -21,
    -42.3,
  );
  buildClimbingLadder(
    'minaret-se-ladder',
    'SE Minaret Balcony Ladder',
    21,
    -40.9,
    3.4,
    27.8,
    0,
    21,
    -42.3,
  );

  // 4. Red Sandstone Side Mosques (Masjid West & Jawab East) on the Taj Terrace
  const mosqueBodyGeo = trackGeo(new THREE.BoxGeometry(24, 10.5, 10.5));
  const mosqueTrimGeo = trackGeo(new THREE.BoxGeometry(24.3, 0.55, 10.8));
  const mosqueArchGeo = trackGeo(createMughalArchFrameGeo(6.4, 9.4, 4.2, 7.6, 0.55));
  const mosqueArchVoidGeo = trackGeo(createArchVoidGeo(4.2, 7.6, 0.3));
  const mosqueSideArchGeo = trackGeo(createMughalArchFrameGeo(4.0, 7.6, 2.5, 5.8, 0.45));
  const mosqueSideVoidGeo = trackGeo(createArchVoidGeo(2.5, 5.8, 0.25));
  const mosqueDomeMainGeo = trackGeo(new THREE.SphereGeometry(3.2, 20, 14));
  const mosqueDomeSideGeo = trackGeo(new THREE.SphereGeometry(2.1, 16, 12));

  [
    { x: -38, rotY: Math.PI / 2 }, // Masjid (West) facing East toward Taj
    { x: 38, rotY: -Math.PI / 2 }, // Jawab (East) facing West toward Taj
  ].forEach(({ x, rotY }) => {
    const mosque = new THREE.Group();
    mosque.position.set(x, 2.2, -2);
    mosque.rotation.y = rotY;

    const body = new THREE.Mesh(mosqueBodyGeo, sandstoneMat);
    body.position.y = 5.25;
    body.castShadow = !isSoftwareGl;
    body.receiveShadow = true;
    const trim = new THREE.Mesh(mosqueTrimGeo, marbleMat);
    trim.position.y = 10.5;
    mosque.add(body, trim);

    const cFrame = new THREE.Mesh(mosqueArchGeo, marbleMat);
    cFrame.position.set(0, 0, 5.15);
    const cVoid = new THREE.Mesh(mosqueArchVoidGeo, archVoidMat);
    cVoid.position.set(0, 0, 5.05);
    mosque.add(cFrame, cVoid);

    [-6.6, 6.6].forEach((sx) => {
      const sFrame = new THREE.Mesh(mosqueSideArchGeo, marbleMat);
      sFrame.position.set(sx, 0, 5.15);
      const sVoid = new THREE.Mesh(mosqueSideVoidGeo, archVoidMat);
      sVoid.position.set(sx, 0, 5.05);
      mosque.add(sFrame, sVoid);
    });

    // 3 White Marble Domes + Golden Finials
    const dMain = new THREE.Mesh(mosqueDomeMainGeo, marbleMat);
    dMain.position.set(0, 12.6, 0);
    const fMain = new THREE.Mesh(chhatriFinialGeo, finialMat);
    fMain.position.set(0, 16.2, 0);
    mosque.add(dMain, fMain);

    [-6.5, 6.5].forEach((dx) => {
      const dSide = new THREE.Mesh(mosqueDomeSideGeo, marbleMat);
      dSide.position.set(dx, 12.0, 0);
      const fSide = new THREE.Mesh(chhatriFinialGeo, finialMat);
      fSide.position.set(dx, 14.4, 0);
      mosque.add(dSide, fSide);
    });

    tajGroup.add(mosque);
  });

  scene.add(tajGroup);

  // 4b. Yamuna River Horizon behind the Taj Mahal (z = -104)
  const riverMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x1e4060,
      roughness: 0.14,
      metalness: 0.32,
      normalMap: textures.waterNormal,
      normalScale: new THREE.Vector2(0.25, 0.25),
    }),
  );
  const yamunaRiver = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(320, 52)), riverMat);
  yamunaRiver.rotation.x = -Math.PI / 2;
  yamunaRiver.position.set(0, 0.1, -104);
  scene.add(yamunaRiver);

  // Distant misty ridge silhouettes across the Yamuna River (catches golden-hour horizon haze)
  const ridgeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3b3528,
      roughness: 0.96,
      metalness: 0.0,
    }),
  );
  const ridgeGeo = trackGeo(new THREE.ConeGeometry(44, 24, 9));
  [
    { x: -118, z: -158, sx: 1.55, sy: 1.25 },
    { x: -42, z: -168, sx: 1.85, sy: 1.45 },
    { x: 46, z: -172, sx: 1.75, sy: 1.32 },
    { x: 128, z: -160, sx: 1.65, sy: 1.18 },
  ].forEach((hill) => {
    const mound = new THREE.Mesh(ridgeGeo, ridgeMat);
    mound.position.set(hill.x, 9.5 * hill.sy - 2, hill.z);
    mound.scale.set(hill.sx, hill.sy, 1.15);
    scene.add(mound);
  });

  // 5. Detailed Mughal Perimeter Arcade Boundaries, Corner Burj Pavilions & Darwaza-i-Rauza Great Gate
  const wallLongGeo = trackGeo(new THREE.BoxGeometry(114, 7.2, 2.2));
  const wallSideGeo = trackGeo(new THREE.BoxGeometry(2.2, 7.2, 108));
  const southWall = new THREE.Mesh(wallLongGeo, sandstoneMat);
  southWall.position.set(0, 3.6, 58);
  const westWall = new THREE.Mesh(wallSideGeo, sandstoneMat);
  westWall.position.set(-55, 3.6, 4);
  const eastWall = new THREE.Mesh(wallSideGeo, sandstoneMat);
  eastWall.position.set(55, 3.6, 4);
  scene.add(southWall, westWall, eastWall);

  // Repeating pointed arcade niches along West, East & South boundary walls (InstancedMesh)
  const arcadeVoidGeo = trackGeo(createArchVoidGeo(3.6, 4.8, 0.35));
  const arcadeTrimGeo = trackGeo(new THREE.BoxGeometry(4.4, 0.32, 0.45));
  const arcadeSlots: Array<{ x: number; z: number; rotY: number }> = [];
  for (let az = -40; az <= 48; az += 8) {
    arcadeSlots.push({ x: -53.8, z: az, rotY: Math.PI / 2 });
    arcadeSlots.push({ x: 53.8, z: az, rotY: -Math.PI / 2 });
  }
  for (let ax = -44; ax <= 44; ax += 8) {
    if (Math.abs(ax) < 12) continue;
    arcadeSlots.push({ x: ax, z: 56.8, rotY: Math.PI });
  }
  const arcadeInst = new THREE.InstancedMesh(arcadeVoidGeo, archVoidMat, arcadeSlots.length);
  const arcadeTrimInst = new THREE.InstancedMesh(arcadeTrimGeo, marbleMat, arcadeSlots.length);
  const arcDummy = new THREE.Object3D();
  arcadeSlots.forEach((slot, idx) => {
    arcDummy.position.set(slot.x, 0.4, slot.z);
    arcDummy.rotation.set(0, slot.rotY, 0);
    arcDummy.updateMatrix();
    arcadeInst.setMatrixAt(idx, arcDummy.matrix);
    arcDummy.position.set(slot.x, 6.9, slot.z);
    arcDummy.updateMatrix();
    arcadeTrimInst.setMatrixAt(idx, arcDummy.matrix);
  });
  arcadeInst.computeBoundingSphere();
  arcadeTrimInst.computeBoundingSphere();
  scene.add(arcadeInst, arcadeTrimInst);

  // Corner Octagonal Burj Pavilions with white marble domes
  const burjShaftGeo = trackGeo(new THREE.CylinderGeometry(3.2, 3.4, 10.5, 8));
  const burjDomeGeo = trackGeo(new THREE.SphereGeometry(2.6, 16, 12));
  [
    [-54.5, 57.5],
    [54.5, 57.5],
    [-54.5, -42],
    [54.5, -42],
  ].forEach(([bx, bz]) => {
    const burj = new THREE.Mesh(burjShaftGeo, sandstoneMat);
    burj.position.set(bx, 5.25, bz);
    const dome = new THREE.Mesh(burjDomeGeo, marbleMat);
    dome.position.set(bx, 11.4, bz);
    const fin = new THREE.Mesh(chhatriFinialGeo, finialMat);
    fin.position.set(bx, 14.3, bz);
    scene.add(burj, dome, fin);
  });

  // Southern Great Gate (Darwaza-i-Rauza) at z = 57.5
  const gateGroup = new THREE.Group();
  gateGroup.position.set(0, 0, 56.5);
  const gateBody = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(22, 13.5, 6.2)), sandstoneMat);
  gateBody.position.y = 6.75;
  gateGroup.add(gateBody);
  const gatePishtaq = new THREE.Mesh(
    trackGeo(createMughalArchFrameGeo(11.6, 14.2, 7.6, 11.2, 0.8)),
    marbleMat,
  );
  gatePishtaq.rotation.y = Math.PI;
  gatePishtaq.position.set(0, 0, -2.8);
  const gateVoid = new THREE.Mesh(trackGeo(createArchVoidGeo(7.6, 11.2, 0.4)), archVoidMat);
  gateVoid.rotation.y = Math.PI;
  gateVoid.position.set(0, 0, -2.95);
  gateGroup.add(gatePishtaq, gateVoid);
  for (let gx = -8; gx <= 8; gx += 4) {
    const miniDome = new THREE.Mesh(chhatriDomeGeo, marbleMat);
    miniDome.scale.setScalar(0.58);
    miniDome.position.set(gx, 14.6, 0);
    gateGroup.add(miniDome);
  }
  scene.add(gateGroup);

  // 6. Bazaar Rooftops + Wooden Parkour Ramps + Rooftop Parkour Clutter
  const rooftopConfigs = [
    { x: 26, z: -8, hw: 5.5, hd: 6.5, h: 2.8, rampZ: 2.0, dir: 'z-' as const },
    { x: -26, z: 12, hw: 5.5, hd: 6.5, h: 2.8, rampZ: 22.0, dir: 'z-' as const },
  ];

  // Shared rooftop clutter geometries
  const tankGeo = trackGeo(new THREE.CylinderGeometry(0.68, 0.68, 1.35, 14));
  const tankMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x172554, roughness: 0.45, metalness: 0.15 }),
  );
  const dishGeo = trackGeo(
    new THREE.SphereGeometry(0.65, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.42),
  );
  const dishMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd1d5db,
      roughness: 0.35,
      metalness: 0.45,
      side: THREE.DoubleSide,
    }),
  );
  const poleGeo = trackGeo(new THREE.CylinderGeometry(0.04, 0.04, 1.75, 8));
  const sheetGeo = trackGeo(new THREE.PlaneGeometry(0.85, 0.95));
  const palletGeo = trackGeo(new THREE.BoxGeometry(1.3, 0.16, 1.0));
  const ropeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-2.6, 1.55, 0),
    new THREE.Vector3(0, 1.25, 0),
    new THREE.Vector3(2.6, 1.55, 0),
  ]);
  const ropeGeo = trackGeo(new THREE.TubeGeometry(ropeCurve, 12, 0.018, 6, false));

  rooftopConfigs.forEach((roof, rIdx) => {
    const building = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(roof.hw * 2, roof.h, roof.hd * 2)),
      sandstoneMat,
    );
    building.position.set(roof.x, roof.h * 0.5, roof.z);
    building.castShadow = !isSoftwareGl;
    building.receiveShadow = true;
    scene.add(building);

    const trim = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(roof.hw * 2 + 0.3, 0.25, roof.hd * 2 + 0.3)),
      marbleMat,
    );
    trim.position.set(roof.x, roof.h - 0.1, roof.z);
    scene.add(trim);

    // Overhanging Corrugated Tin Awning along the bazaar building side
    const awning = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(2.1, 0.08, roof.hd * 1.7)),
      corrugatedMat,
    );
    awning.position.set(roof.x + (rIdx === 0 ? -roof.hw - 0.9 : roof.hw + 0.9), 2.15, roof.z);
    awning.rotation.z = rIdx === 0 ? 0.24 : -0.24;
    scene.add(awning);

    // Rooftop Water Tank (kept clear of crate at center)
    const waterTank = new THREE.Mesh(tankGeo, tankMat);
    waterTank.position.set(roof.x - 3.6, roof.h + 0.68, roof.z - 4.4);
    scene.add(waterTank);

    // Satellite Dish on opposite corner
    const dishGroup = new THREE.Group();
    dishGroup.position.set(roof.x + 3.8, roof.h + 0.45, roof.z - 4.6);
    const dishStem = new THREE.Mesh(poleGeo, steelMat);
    dishStem.scale.y = 0.5;
    const dishBowl = new THREE.Mesh(dishGeo, dishMat);
    dishBowl.position.y = 0.45;
    dishBowl.rotation.x = 0.78;
    dishBowl.rotation.z = rIdx === 0 ? 0.45 : -0.45;
    dishGroup.add(dishStem, dishBowl);
    scene.add(dishGroup);

    // Clothesline strung across back edge of rooftop
    const lineGroup = new THREE.Group();
    lineGroup.position.set(roof.x, roof.h, roof.z - 5.2);
    const poleL = new THREE.Mesh(poleGeo, steelMat);
    poleL.position.set(-2.6, 0.87, 0);
    const poleR = new THREE.Mesh(poleGeo, steelMat);
    poleR.position.set(2.6, 0.87, 0);
    const rope = new THREE.Mesh(ropeGeo, steelMat);
    const cloth1 = new THREE.Mesh(sheetGeo, tarpYellowMat);
    cloth1.position.set(-1.1, 0.88, 0);
    const cloth2 = new THREE.Mesh(sheetGeo, bannerRedMat);
    cloth2.position.set(0.95, 0.86, 0);
    lineGroup.add(poleL, poleR, rope, cloth1, cloth2);
    scene.add(lineGroup);

    // Wooden Pallets stacked at front-side corner
    const pal1 = new THREE.Mesh(palletGeo, woodMat);
    pal1.position.set(roof.x + 3.6, roof.h + 0.08, roof.z + 4.3);
    const pal2 = new THREE.Mesh(palletGeo, woodMat);
    pal2.position.set(roof.x + 3.6, roof.h + 0.25, roof.z + 4.3);
    pal2.rotation.y = 0.22;
    scene.add(pal1, pal2);

    obstacles.push({
      x: roof.x,
      z: roof.z,
      halfW: roof.hw,
      halfD: roof.hd,
      height: roof.h,
      vaultable: false,
      mantleable: true,
    });

    // Sloped Wooden Parkour Ramp connecting ground up to rooftop
    const rampLen = 7.0;
    const rampWidth = 2.6;
    const angle = Math.atan2(roof.h, rampLen);
    const hyp = Math.hypot(rampLen, roof.h);
    const rampMesh = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(rampWidth, 0.22, hyp)),
      woodMat,
    );
    rampMesh.position.set(roof.x, roof.h * 0.5 - 0.08, roof.rampZ);
    rampMesh.rotation.x = angle;
    rampMesh.castShadow = !isSoftwareGl;
    rampMesh.receiveShadow = true;
    scene.add(rampMesh);

    ramps.push({
      x: roof.x,
      z: roof.rampZ,
      halfW: rampWidth * 0.5 + 0.2,
      halfD: rampLen * 0.5,
      yLow: 0,
      yHigh: roof.h,
      axis: roof.dir,
    });
  });

  // Flanking Outer Bazaar Stalls with Tin Awnings & Water Tanks (frames the Agra bazaar perimeter)
  [
    { x: -46, z: -12, facing: 1 },
    { x: 46, z: 10, facing: -1 },
  ].forEach(({ x, z, facing }) => {
    const stall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(9, 3.2, 14)), sandstoneMat);
    stall.position.set(x, 1.6, z);
    stall.castShadow = !isSoftwareGl;
    const awning = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.4, 0.1, 13)), corrugatedMat);
    awning.position.set(x + facing * 5.2, 2.35, z);
    awning.rotation.z = -facing * 0.26;
    const sTank = new THREE.Mesh(tankGeo, tankMat);
    sTank.position.set(x, 3.88, z - 4.5);
    scene.add(stall, awning, sTank);
    obstacles.push({
      x,
      z,
      halfW: 4.5,
      halfD: 7.0,
      height: 3.2,
      vaultable: false,
      mantleable: true,
    });
  });

  // Additional courtyard wooden parkour launch ramp
  const midRamp = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.8, 0.22, 5.2)), woodMat);
  midRamp.position.set(8.5, 0.65, 14);
  midRamp.rotation.x = -0.26;
  scene.add(midRamp);
  ramps.push({
    x: 8.5,
    z: 14,
    halfW: 1.5,
    halfD: 2.5,
    yLow: 0,
    yHigh: 1.35,
    axis: 'z+',
  });

  // 7. Wrecked Auto-Rickshaws
  const wheelGeo = trackGeo(new THREE.CylinderGeometry(0.32, 0.32, 0.18, 14));
  const rickshawPositions: Array<[number, number, number]> = [
    [11, 22, 0.45],
    [-12, 24, -0.8],
    [15, -24, 1.1],
    [-22, -6, -0.35],
  ];

  rickshawPositions.forEach(([rx, rz, rot]) => {
    const rGroup = new THREE.Group();
    rGroup.position.set(rx, 0, rz);
    rGroup.rotation.y = rot;

    const baseHull = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.55, 0.72, 2.45)), rickshawGreenMat);
    baseHull.position.set(0, 0.62, 0);
    baseHull.castShadow = !isSoftwareGl;
    const canopy = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.78, 0.82, 2.1, 14, 1, false, 0, Math.PI)),
      rickshawYellowMat,
    );
    canopy.rotation.z = Math.PI / 2;
    canopy.rotation.y = Math.PI / 2;
    canopy.position.set(0, 1.18, -0.15);

    const cowl = new THREE.Mesh(trackGeo(new THREE.CapsuleGeometry(0.42, 0.55, 8, 14)), rickshawYellowMat);
    cowl.position.set(0, 0.78, 1.05);

    const wFront = new THREE.Mesh(wheelGeo, tireMat);
    wFront.rotation.z = Math.PI / 2;
    wFront.position.set(0, 0.32, 1.15);
    const wRearL = new THREE.Mesh(wheelGeo, tireMat);
    wRearL.rotation.z = Math.PI / 2;
    wRearL.position.set(-0.74, 0.32, -0.78);
    const wRearR = new THREE.Mesh(wheelGeo, tireMat);
    wRearR.rotation.z = Math.PI / 2;
    wRearR.position.set(0.74, 0.32, -0.78);

    rGroup.add(baseHull, canopy, cowl, wFront, wRearL, wRearR);
    rGroup.rotation.z = 0.08;
    scene.add(rGroup);

    obstacles.push({
      x: rx,
      z: rz,
      halfW: 1.0,
      halfD: 1.35,
      height: 1.25,
      vaultable: true,
      mantleable: false,
    });
  });

  // 8. Post-Apocalyptic Quarantine Storytelling Props:
  // Overturned Military Humvees with flickering headlights
  const humveeSpecs: Array<{ x: number; z: number; rotY: number; tiltZ: number }> = [
    { x: -13.5, z: 16.5, rotY: -0.55, tiltZ: 0.42 },
    { x: 14.5, z: -14.0, rotY: 0.72, tiltZ: -0.36 },
  ];
  const hHullGeo = trackGeo(new THREE.BoxGeometry(2.15, 0.95, 4.2));
  const hCabGeo = trackGeo(new THREE.BoxGeometry(1.95, 0.75, 2.2));
  const hWheelGeo = trackGeo(new THREE.CylinderGeometry(0.46, 0.46, 0.34, 14));
  const hLampGeo = trackGeo(new THREE.SphereGeometry(0.14, 10, 8));

  humveeSpecs.forEach((hs) => {
    const hGroup = new THREE.Group();
    hGroup.position.set(hs.x, 0.52, hs.z);
    hGroup.rotation.y = hs.rotY;
    hGroup.rotation.z = hs.tiltZ;

    const hull = new THREE.Mesh(hHullGeo, humveeMat);
    hull.position.y = 0.45;
    hull.castShadow = !isSoftwareGl;
    const cab = new THREE.Mesh(hCabGeo, humveeMat);
    cab.position.set(0, 1.15, -0.2);

    [
      [-1.05, 1.35],
      [1.05, 1.35],
      [-1.05, -1.35],
      [1.05, -1.35],
    ].forEach(([wx, wz]) => {
      const w = new THREE.Mesh(hWheelGeo, tireMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.05, wz);
      hGroup.add(w);
    });

    const lampMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xfef3c7 }));
    headlightMats.push(lampMat);
    [-0.68, 0.68].forEach((lx) => {
      const bulb = new THREE.Mesh(hLampGeo, lampMat);
      bulb.position.set(lx, 0.55, 2.12);
      hGroup.add(bulb);
    });

    hGroup.add(hull, cab);
    scene.add(hGroup);
    obstacles.push({
      x: hs.x,
      z: hs.z,
      halfW: 1.5,
      halfD: 2.15,
      height: 1.55,
      vaultable: true,
      mantleable: false,
    });
  });

  // Concrete Jersey Barriers (shared tapered profile)
  const jerseyShape = new THREE.Shape();
  jerseyShape.moveTo(-0.34, 0);
  jerseyShape.lineTo(0.34, 0);
  jerseyShape.lineTo(0.24, 0.35);
  jerseyShape.lineTo(0.14, 0.95);
  jerseyShape.lineTo(-0.14, 0.95);
  jerseyShape.lineTo(-0.24, 0.35);
  jerseyShape.closePath();
  const jerseyGeo = trackGeo(
    new THREE.ExtrudeGeometry(jerseyShape, { depth: 2.6, bevelEnabled: false }),
  );
  jerseyGeo.translate(0, 0, -1.3);
  const jerseyStripeGeo = trackGeo(new THREE.BoxGeometry(0.32, 0.16, 2.55));

  const jerseySpots: Array<[number, number, number]> = [
    [-7.2, 28, Math.PI / 2],
    [7.2, 28, Math.PI / 2],
    [-7.2, -12, Math.PI / 2],
    [7.2, -12, Math.PI / 2],
    [-19.5, -18, 0.25],
    [19.5, 18, -0.25],
  ];
  jerseySpots.forEach(([jx, jz, rot]) => {
    const jGroup = new THREE.Group();
    jGroup.position.set(jx, 0, jz);
    jGroup.rotation.y = rot;
    const jMesh = new THREE.Mesh(jerseyGeo, concreteMat);
    jMesh.castShadow = !isSoftwareGl;
    const jStripe = new THREE.Mesh(jerseyStripeGeo, hazardMat);
    jStripe.position.y = 0.82;
    jGroup.add(jMesh, jStripe);
    scene.add(jGroup);
    obstacles.push({
      x: jx,
      z: jz,
      halfW: rot > 1 ? 1.35 : 0.45,
      halfD: rot > 1 ? 0.45 : 1.35,
      height: 0.98,
      vaultable: true,
      mantleable: false,
    });
  });

  // Sandbag Bunkers & Yellow Biohazard Tarps
  const sandbagGeo = trackGeo(new THREE.CapsuleGeometry(0.18, 0.48, 6, 10));
  const bunkerSpots: Array<[number, number, number]> = [
    [-6.2, 18, 0],
    [6.2, -22, Math.PI],
  ];
  bunkerSpots.forEach(([bx, bz, rot]) => {
    const bGroup = new THREE.Group();
    bGroup.position.set(bx, 0, bz);
    bGroup.rotation.y = rot;
    for (let row = 0; row < 3; row++) {
      for (let col = -2; col <= 2; col++) {
        const bag = new THREE.Mesh(sandbagGeo, sandbagMat);
        bag.rotation.z = Math.PI / 2;
        bag.position.set(col * 0.56 + (row % 2) * 0.2, 0.18 + row * 0.3, Math.abs(col) * 0.14);
        bGroup.add(bag);
      }
    }
    scene.add(bGroup);
    obstacles.push({
      x: bx,
      z: bz,
      halfW: 1.5,
      halfD: 0.55,
      height: 0.95,
      vaultable: true,
      mantleable: false,
    });
  });

  // Yellow Biohazard Tarps draped over quarantine supply crates
  const tarpBaseGeo = trackGeo(new THREE.BoxGeometry(2.1, 0.9, 1.5));
  const tarpDrapedGeo = trackGeo(new THREE.BoxGeometry(2.2, 0.35, 1.6));
  [
    [-16.5, 4.5, 0.3],
    [18.5, -21, -0.4],
  ].forEach(([tx, tz, rot]) => {
    const tGroup = new THREE.Group();
    tGroup.position.set(tx, 0, tz);
    tGroup.rotation.y = rot;
    const base = new THREE.Mesh(tarpBaseGeo, woodMat);
    base.position.y = 0.45;
    const tarp = new THREE.Mesh(tarpDrapedGeo, tarpYellowMat);
    tarp.position.y = 0.78;
    tGroup.add(base, tarp);
    scene.add(tGroup);
  });

  // Tattered Quarantine Warning Banners on metal posts
  const bannerGeo = trackGeo(new THREE.PlaneGeometry(3.8, 0.78));
  [
    [-7.5, 33, 0.2],
    [7.5, 33, -0.2],
  ].forEach(([wx, wz, rot]) => {
    const bGroup = new THREE.Group();
    bGroup.position.set(wx, 0, wz);
    bGroup.rotation.y = rot;
    const pL = new THREE.Mesh(poleGeo, steelMat);
    pL.position.set(-1.95, 0.9, 0);
    const pR = new THREE.Mesh(poleGeo, steelMat);
    pR.position.set(1.95, 0.9, 0);
    const cloth = new THREE.Mesh(bannerGeo, bannerRedMat);
    cloth.position.set(0, 1.38, 0);
    const strip = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(3.8, 0.22)), hazardMat);
    strip.position.set(0, 1.38, 0.02);
    bGroup.add(pL, pR, cloth, strip);
    scene.add(bGroup);
  });

  // Glowing Green & Purple Chemical Flares along quarantine chokepoints
  const flareBodyGeo = trackGeo(new THREE.CylinderGeometry(0.05, 0.05, 0.32, 8));
  const flareTipGeo = trackGeo(new THREE.SphereGeometry(0.11, 10, 8));
  const flareGlowGreen = trackMat(new THREE.MeshBasicMaterial({ color: 0x4ade80 }));
  const flareGlowPurple = trackMat(new THREE.MeshBasicMaterial({ color: 0xc084fc }));
  const flareSpots: Array<[number, number, boolean]> = [
    [-6.6, 26.8, true],
    [6.8, 26.8, false],
    [-6.4, -10.8, false],
    [6.6, -10.8, true],
    [-11.8, 15.2, true],
    [13.0, -12.5, false],
  ];
  flareSpots.forEach(([fx, fz, isGreen]) => {
    const flare = new THREE.Mesh(flareBodyGeo, steelMat);
    flare.rotation.z = Math.PI / 2.2;
    flare.position.set(fx, 0.07, fz);
    const tip = new THREE.Mesh(flareTipGeo, isGreen ? flareGlowGreen : flareGlowPurple);
    tip.position.set(fx + 0.16, 0.12, fz);
    scene.add(flare, tip);
  });

  // 9. Watchtower beside the Taj Mahal UV Safe House Gate (x = -14, z = -32)
  const safeHouseCenter = new THREE.Vector3(-14, 0, -28);
  const safeHouseRadius = 7.5;
  const watchtowerPos = new THREE.Vector3(-14, 0, -32);

  const towerGroup = new THREE.Group();
  towerGroup.position.copy(watchtowerPos);

  const postGeo = trackGeo(new THREE.CylinderGeometry(0.18, 0.22, 5.8, 12));
  [
    [-2.2, -2.2],
    [2.2, -2.2],
    [-2.2, 2.2],
    [2.2, 2.2],
  ].forEach(([px, pz]) => {
    const post = new THREE.Mesh(postGeo, steelMat);
    post.position.set(px, 2.9, pz);
    post.castShadow = !isSoftwareGl;
    towerGroup.add(post);
  });

  const towerDeck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.2, 0.35, 5.2)), woodMat);
  towerDeck.position.set(0, 3.0, 0);
  towerDeck.receiveShadow = true;
  towerGroup.add(towerDeck);

  const towerRoof = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(4.2, 1.8, 4)), sandstoneMat);
  towerRoof.rotation.y = Math.PI / 4;
  towerRoof.position.set(0, 6.6, 0);
  towerGroup.add(towerRoof);

  obstacles.push({
    x: watchtowerPos.x,
    z: watchtowerPos.z,
    halfW: 2.5,
    halfD: 2.5,
    height: 3.18,
    vaultable: false,
    mantleable: true,
  });

  const { group: vikramNpc, muzzleFlash: vikramMuzzleFlash } = buildVikramNpc(textures);
  vikramNpc.position.set(0, 3.18, 1.2);
  towerGroup.add(vikramNpc);

  const lanternBulb = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.24, 12, 10)),
    trackMat(new THREE.MeshBasicMaterial({ color: 0xffb347 })),
  );
  lanternBulb.position.set(-1.7, 4.7, 1.7);
  towerGroup.add(lanternBulb);

  const beaconLight = new THREE.PointLight(0xffa94d, 16, 22, 1.6);
  beaconLight.position.set(watchtowerPos.x - 1.7, 4.7, watchtowerPos.z + 1.7);
  scene.add(beaconLight);
  scene.add(towerGroup);

  // Localized Purple UV Safe House Barrier ONLY around the Taj Mahal UV Gate & Watchtower
  const uvBarrierMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x9333ea,
      emissive: 0x7e22ce,
      emissiveIntensity: 1.5,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  const uvBarrierMesh = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(safeHouseRadius, safeHouseRadius, 3.8, 36, 1, true)),
    uvBarrierMat,
  );
  uvBarrierMesh.position.set(safeHouseCenter.x, 1.9, safeHouseCenter.z);
  scene.add(uvBarrierMesh);

  const uvRing = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(safeHouseRadius, 0.085, 8, 48)),
    trackMat(new THREE.MeshBasicMaterial({ color: 0xc084fc })),
  );
  uvRing.rotation.x = Math.PI / 2;
  uvRing.position.set(safeHouseCenter.x, 0.14, safeHouseCenter.z);
  scene.add(uvRing);

  const uvLight = new THREE.PointLight(0xa855f7, 18, 15, 1.8);
  uvLight.position.set(safeHouseCenter.x, 3.0, safeHouseCenter.z);
  scene.add(uvLight);

  // 10. Low Vaultable Quarantine Barricades
  const barricadeDefs: Array<[number, number, number, number]> = [
    [-9, 10, 1.8, 0.45],
    [9, 10, 1.8, 0.45],
    [0, 16, 2.2, 0.45],
    [0, -18, 2.2, 0.45],
    [-16, -2, 1.8, 0.45],
    [16, -2, 1.8, 0.45],
  ];
  for (const [bx, bz, hw, hd] of barricadeDefs) {
    const mesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(hw * 2, 1.05, hd * 2)), woodMat);
    mesh.position.set(bx, 0.525, bz);
    mesh.castShadow = !isSoftwareGl;
    mesh.receiveShadow = true;
    scene.add(mesh);

    const stripe = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(hw * 1.9, 0.14, hd * 2.04)),
      hazardMat,
    );
    stripe.position.set(bx, 0.92, bz);
    scene.add(stripe);

    obstacles.push({
      x: bx,
      z: bz,
      halfW: hw,
      halfD: hd,
      height: 1.05,
      vaultable: true,
      mantleable: false,
    });
  }

  // 11. Charbagh Garden Cypress Avenues, Trimmed Hedges & Lush Broad-Canopy Neem Trees
  const cypressMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x163822,
      roughness: 0.9,
      metalness: 0.02,
    }),
  );
  const cypressGeo = trackGeo(new THREE.ConeGeometry(1.05, 7.0, 12));
  const treePositions: Array<[number, number]> = [];
  for (let z = -34; z <= 36; z += 7.8) {
    if (Math.abs(z - 4) < 5.5) continue; // Keep east-west cross avenue clear
    treePositions.push([-7.2, z], [7.2, z]);
  }
  for (let x = -44; x <= 44; x += 11) {
    treePositions.push([x, 48]);
    if (Math.abs(x) > 10) {
      treePositions.push([x, -38]);
    }
  }
  const cypressInst = new THREE.InstancedMesh(cypressGeo, cypressMat, treePositions.length);
  const dummy = new THREE.Object3D();
  treePositions.forEach(([tx, tz], idx) => {
    const scale = 0.88 + ((idx * 17) % 24) / 100;
    dummy.position.set(tx, 3.5 * scale, tz);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    cypressInst.setMatrixAt(idx, dummy.matrix);
  });
  cypressInst.computeBoundingSphere();
  scene.add(cypressInst);

  // Low manicured Charbagh garden hedge borders flanking the central promenade
  const hedgeGeo = trackGeo(new THREE.BoxGeometry(1.1, 0.52, 26));
  [
    [-11.2, -18],
    [11.2, -18],
    [-11.2, 24],
    [11.2, 24],
  ].forEach(([hx, hz]) => {
    const hedge = new THREE.Mesh(hedgeGeo, cypressMat);
    hedge.position.set(hx, 0.26, hz);
    scene.add(hedge);
  });

  // Lush Broad-Canopy Neem / Banyan Shade Trees along outer gardens & flanking Taj corners
  const canopyMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x264b2a,
      roughness: 0.88,
      metalness: 0.02,
    }),
  );
  const trunkMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x4b3626, roughness: 0.92 }));
  const canopyGeo = trackGeo(new THREE.DodecahedronGeometry(3.4, 1));
  const trunkGeo = trackGeo(new THREE.CylinderGeometry(0.38, 0.55, 5.0, 8));
  const broadTreeCoords: Array<[number, number]> = [
    [-38, -28],
    [-44, -18],
    [-38, 28],
    [-46, 36],
    [38, -28],
    [44, -18],
    [38, 28],
    [46, 36],
    [-34, -44],
    [-46, -42],
    [34, -44],
    [46, -42],
    [-44, -84],
    [-18, -88],
    [18, -88],
    [44, -84],
  ];
  const canopyInst = new THREE.InstancedMesh(canopyGeo, canopyMat, broadTreeCoords.length);
  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, broadTreeCoords.length);
  broadTreeCoords.forEach(([bx, bz], idx) => {
    const sc = 0.85 + ((idx * 13) % 30) / 100;
    dummy.position.set(bx, 2.5 * sc, bz);
    dummy.scale.set(sc, sc, sc);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(idx, dummy.matrix);

    dummy.position.set(bx, 6.2 * sc, bz);
    dummy.scale.set(sc * 1.15, sc * 0.9, sc * 1.15);
    dummy.updateMatrix();
    canopyInst.setMatrixAt(idx, dummy.matrix);
  });
  canopyInst.computeBoundingSphere();
  trunkInst.computeBoundingSphere();
  scene.add(trunkInst, canopyInst);

  // 12. 3 Glowing GRE Antizin Crates across Bazaar Rooftops & Courtyard
  const crateSpecs: AntizinCrateState[] = [
    { id: 'crate-east', label: 'East Bazaar Rooftop', x: 26, y: 2.8, z: -8, collected: false },
    { id: 'crate-west', label: 'West Bazaar Rooftop', x: -26, y: 2.8, z: 12, collected: false },
    { id: 'crate-south', label: 'South Rickshaw Wreckage', x: 12, y: 0, z: 28, collected: false },
  ];

  const crateBodyMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x263138,
      roughness: 0.55,
      metalness: 0.65,
    }),
  );

  crateSpecs.forEach((spec) => {
    const cGroup = new THREE.Group();
    cGroup.position.set(spec.x, spec.y, spec.z);

    const box = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.3, 0.72, 0.86)), crateBodyMat);
    box.position.y = 0.36;
    box.castShadow = !isSoftwareGl;

    const beaconMat = trackMat(new THREE.MeshBasicMaterial({ color: 0x22d3ee }));
    const strip = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.34, 0.1, 0.9)), beaconMat);
    strip.position.y = 0.66;

    const beaconRing = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(0.95, 0.045, 8, 28)),
      beaconMat,
    );
    beaconRing.rotation.x = Math.PI / 2;
    beaconRing.position.y = 0.08;

    cGroup.add(box, strip, beaconRing);
    scene.add(cGroup);
    crates.push({ state: spec, group: cGroup, beaconMat, beaconRing });
  });

  return {
    obstacles,
    ramps,
    climbables,
    crates,
    safeHouseCenter,
    safeHouseRadius,
    watchtowerPos,
    tajPosition: new THREE.Vector3(0, 0, -58),
    waterMaterial,
    fountainJets,
    rippleRings,
    headlightMats,
    uvBarrierMesh,
    beaconLight,
    vikramNpc,
    vikramMuzzleFlash,
    dispose: () => {
      reflectorRef?.dispose();
      disposableGeos.forEach((g) => g.dispose());
      disposableMats.forEach((m) => m.dispose());
    },
  };
}
