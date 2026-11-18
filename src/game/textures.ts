import * as THREE from 'three';

function makeCanvas(size = 256): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

export interface ProceduralTextureSet {
  marble: THREE.CanvasTexture;
  pietraDura: THREE.CanvasTexture;
  sandstone: THREE.CanvasTexture;
  courtyardGround: THREE.CanvasTexture;
  woodPlank: THREE.CanvasTexture;
  corrugatedMetal: THREE.CanvasTexture;
  hazardStripe: THREE.CanvasTexture;
  waterNormal: THREE.CanvasTexture;
  necroticSkin: THREE.CanvasTexture;
  tacticalCloth: THREE.CanvasTexture;
  weatheredHandSkin: THREE.CanvasTexture;
  tacticalGlove: THREE.CanvasTexture;
  tanGloveFabric: THREE.CanvasTexture;
  brushedBladeSteel: THREE.CanvasTexture;
  brushedSilverSlide: THREE.CanvasTexture;
  polymerGrip: THREE.CanvasTexture;
  watchFace: THREE.CanvasTexture;
  sunHalo: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  dispose: () => void;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  // 1. White Taj Marble with delicate veining & joint lines
  const [mCan, mCtx] = makeCanvas(256);
  mCtx.fillStyle = '#ece9e1';
  mCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 460; i++) {
    mCtx.strokeStyle = i % 3 === 0 ? 'rgba(130, 138, 148, 0.16)' : 'rgba(255, 255, 255, 0.35)';
    mCtx.lineWidth = 1 + (i % 2);
    mCtx.beginPath();
    const x = (i * 53) % 256;
    const y = (i * 97) % 256;
    mCtx.moveTo(x, y);
    mCtx.lineTo(x + ((i % 7) - 3) * 14, y + ((i % 5) - 2) * 12);
    mCtx.stroke();
  }
  mCtx.strokeStyle = 'rgba(70, 74, 82, 0.24)';
  mCtx.lineWidth = 2;
  for (let p = 0; p <= 256; p += 64) {
    mCtx.beginPath();
    mCtx.moveTo(p, 0);
    mCtx.lineTo(p, 256);
    mCtx.stroke();
    mCtx.beginPath();
    mCtx.moveTo(0, p);
    mCtx.lineTo(256, p);
    mCtx.stroke();
  }
  const marble = new THREE.CanvasTexture(mCan);
  marble.wrapS = marble.wrapT = THREE.RepeatWrapping;
  marble.colorSpace = THREE.SRGBColorSpace;
  marble.anisotropy = maxAnisotropy;

  // 1b. Mughal Pietra Dura Floral Inlay & Calligraphic Marble Trim
  const [pdCan, pdCtx] = makeCanvas(256);
  pdCtx.fillStyle = '#eeeae0';
  pdCtx.fillRect(0, 0, 256, 256);
  // Subtle inlaid frame border
  pdCtx.strokeStyle = '#374151';
  pdCtx.lineWidth = 5;
  pdCtx.strokeRect(10, 10, 236, 236);
  pdCtx.strokeStyle = '#b45309';
  pdCtx.lineWidth = 2;
  pdCtx.strokeRect(18, 18, 220, 220);
  // Delicate arabesque floral vine scrolls (carnelian, lapis, malachite)
  for (let row = 42; row <= 214; row += 56) {
    for (let col = 42; col <= 214; col += 56) {
      pdCtx.strokeStyle = 'rgba(30, 64, 72, 0.65)';
      pdCtx.lineWidth = 1.6;
      pdCtx.beginPath();
      pdCtx.moveTo(col - 20, row);
      pdCtx.quadraticCurveTo(col, row - 18, col + 20, row);
      pdCtx.quadraticCurveTo(col, row + 18, col - 20, row);
      pdCtx.stroke();
      // Carnelian flower bud
      pdCtx.fillStyle = '#9b2c2c';
      pdCtx.beginPath();
      pdCtx.arc(col, row, 4.2, 0, Math.PI * 2);
      pdCtx.fill();
      // Malachite leaves
      pdCtx.fillStyle = '#1f5f4a';
      pdCtx.beginPath();
      pdCtx.arc(col - 9, row - 4, 2.5, 0, Math.PI * 2);
      pdCtx.arc(col + 9, row + 4, 2.5, 0, Math.PI * 2);
      pdCtx.fill();
    }
  }
  const pietraDura = new THREE.CanvasTexture(pdCan);
  pietraDura.wrapS = pietraDura.wrapT = THREE.RepeatWrapping;
  pietraDura.colorSpace = THREE.SRGBColorSpace;
  pietraDura.anisotropy = maxAnisotropy;

  // 2. Red Agra Sandstone Walkways & Bazaar Masonry
  const [sCan, sCtx] = makeCanvas(256);
  sCtx.fillStyle = '#8b4335';
  sCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) {
    const offset = (y / 32) % 2 === 0 ? 0 : 32;
    for (let x = -32; x < 256; x += 64) {
      const shade = ((x * 13 + y * 7) % 24) - 12;
      sCtx.fillStyle = `rgb(${139 + shade}, ${67 + Math.floor(shade * 0.5)}, ${53 + Math.floor(shade * 0.4)})`;
      sCtx.fillRect(x + offset + 1, y + 1, 62, 30);
    }
  }
  for (let i = 0; i < 650; i++) {
    sCtx.fillStyle = i % 2 === 0 ? 'rgba(30, 15, 12, 0.16)' : 'rgba(220, 150, 120, 0.09)';
    sCtx.fillRect((i * 73) % 256, (i * 41) % 256, 3, 2);
  }
  const sandstone = new THREE.CanvasTexture(sCan);
  sandstone.wrapS = sandstone.wrapT = THREE.RepeatWrapping;
  sandstone.colorSpace = THREE.SRGBColorSpace;
  sandstone.anisotropy = maxAnisotropy;

  // 3. Overgrown Charbagh Courtyard Lawn & Dirt
  const [gCan, gCtx] = makeCanvas(256);
  gCtx.fillStyle = '#243023';
  gCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 950; i++) {
    const green = i % 3 !== 0;
    gCtx.fillStyle = green ? 'rgba(48, 78, 44, 0.36)' : 'rgba(54, 45, 36, 0.32)';
    gCtx.fillRect((i * 67) % 256, (i * 89) % 256, 4 + (i % 4), 4 + (i % 3));
  }
  const courtyardGround = new THREE.CanvasTexture(gCan);
  courtyardGround.wrapS = courtyardGround.wrapT = THREE.RepeatWrapping;
  courtyardGround.repeat.set(24, 24);
  courtyardGround.colorSpace = THREE.SRGBColorSpace;
  courtyardGround.anisotropy = maxAnisotropy;

  // 4. Weathered Wooden Parkour Ramp Planks
  const [pCan, pCtx] = makeCanvas(256);
  pCtx.fillStyle = '#6c4b2e';
  pCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) {
    const tone = ((y * 7) % 20) - 10;
    pCtx.fillStyle = `rgb(${108 + tone}, ${75 + tone}, ${46 + Math.floor(tone * 0.6)})`;
    pCtx.fillRect(0, y + 1, 256, 30);
    pCtx.strokeStyle = 'rgba(34, 22, 12, 0.35)';
    pCtx.lineWidth = 2;
    pCtx.beginPath();
    pCtx.moveTo(0, y);
    pCtx.lineTo(256, y);
    pCtx.stroke();
  }
  const woodPlank = new THREE.CanvasTexture(pCan);
  woodPlank.wrapS = woodPlank.wrapT = THREE.RepeatWrapping;
  woodPlank.colorSpace = THREE.SRGBColorSpace;
  woodPlank.anisotropy = maxAnisotropy;

  // 4b. Corrugated Tin Awning Sheet
  const [cmCan, cmCtx] = makeCanvas(128);
  cmCtx.fillStyle = '#55606b';
  cmCtx.fillRect(0, 0, 128, 128);
  for (let x = 0; x < 128; x += 8) {
    cmCtx.fillStyle = x % 16 === 0 ? 'rgba(255,255,255,0.16)' : 'rgba(15,20,25,0.28)';
    cmCtx.fillRect(x, 0, 4, 128);
  }
  for (let i = 0; i < 70; i++) {
    cmCtx.fillStyle = 'rgba(120, 62, 32, 0.24)';
    cmCtx.fillRect((i * 37) % 128, (i * 53) % 128, 6, 4);
  }
  const corrugatedMetal = new THREE.CanvasTexture(cmCan);
  corrugatedMetal.wrapS = corrugatedMetal.wrapT = THREE.RepeatWrapping;
  corrugatedMetal.colorSpace = THREE.SRGBColorSpace;
  corrugatedMetal.anisotropy = maxAnisotropy;

  // 4c. Quarantine Hazard Stripes
  const [hzCan, hzCtx] = makeCanvas(128);
  hzCtx.fillStyle = '#d99a1e';
  hzCtx.fillRect(0, 0, 128, 128);
  hzCtx.fillStyle = '#18181b';
  for (let i = -128; i < 256; i += 32) {
    hzCtx.beginPath();
    hzCtx.moveTo(i, 0);
    hzCtx.lineTo(i + 16, 0);
    hzCtx.lineTo(i - 48, 128);
    hzCtx.lineTo(i - 64, 128);
    hzCtx.closePath();
    hzCtx.fill();
  }
  const hazardStripe = new THREE.CanvasTexture(hzCan);
  hazardStripe.wrapS = hazardStripe.wrapT = THREE.RepeatWrapping;
  hazardStripe.colorSpace = THREE.SRGBColorSpace;
  hazardStripe.anisotropy = maxAnisotropy;

  // 5. Water Ripple Normal Map (linear)
  const [wCan, wCtx] = makeCanvas(256);
  wCtx.fillStyle = 'rgb(128, 128, 255)';
  wCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 180; i++) {
    const cx = (i * 47) % 256;
    const cy = (i * 83) % 256;
    const r = 8 + (i % 14);
    const grad = wCtx.createRadialGradient(cx, cy, 1, cx, cy, r);
    grad.addColorStop(0, 'rgba(148, 118, 255, 0.35)');
    grad.addColorStop(0.5, 'rgba(110, 146, 255, 0.25)');
    grad.addColorStop(1, 'rgba(128, 128, 255, 0)');
    wCtx.fillStyle = grad;
    wCtx.beginPath();
    wCtx.arc(cx, cy, r, 0, Math.PI * 2);
    wCtx.fill();
  }
  const waterNormal = new THREE.CanvasTexture(wCan);
  waterNormal.wrapS = waterNormal.wrapT = THREE.RepeatWrapping;
  waterNormal.repeat.set(3, 14);

  // 6. Mottled Necrotic Infected Skin (veins, bruising, decay patches)
  const [nCan, nCtx] = makeCanvas(256);
  nCtx.fillStyle = '#9aa08b';
  nCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 380; i++) {
    const cx = (i * 43) % 256;
    const cy = (i * 79) % 256;
    const r = 4 + (i % 12);
    nCtx.fillStyle =
      i % 4 === 0
        ? 'rgba(118, 26, 30, 0.34)'
        : i % 3 === 0
          ? 'rgba(54, 65, 52, 0.32)'
          : 'rgba(182, 186, 162, 0.22)';
    nCtx.beginPath();
    nCtx.arc(cx, cy, r, 0, Math.PI * 2);
    nCtx.fill();
  }
  // Dark necrotic veins
  nCtx.strokeStyle = 'rgba(42, 24, 34, 0.45)';
  nCtx.lineWidth = 1.4;
  for (let i = 0; i < 45; i++) {
    let vx = (i * 59) % 256;
    let vy = (i * 37) % 256;
    nCtx.beginPath();
    nCtx.moveTo(vx, vy);
    for (let s = 0; s < 4; s++) {
      vx += ((i + s) % 2 === 0 ? 1 : -1) * (8 + s * 5);
      vy += 9;
      nCtx.lineTo(vx, vy);
    }
    nCtx.stroke();
  }
  const necroticSkin = new THREE.CanvasTexture(nCan);
  necroticSkin.wrapS = necroticSkin.wrapT = THREE.RepeatWrapping;
  necroticSkin.colorSpace = THREE.SRGBColorSpace;

  // 7. Tactical Cloth
  const [tCan, tCtx] = makeCanvas(128);
  tCtx.fillStyle = '#4b524b';
  tCtx.fillRect(0, 0, 128, 128);
  tCtx.strokeStyle = 'rgba(20, 24, 22, 0.25)';
  for (let i = 0; i < 128; i += 4) {
    tCtx.beginPath();
    tCtx.moveTo(i, 0);
    tCtx.lineTo(i, 128);
    tCtx.stroke();
    tCtx.beginPath();
    tCtx.moveTo(0, i);
    tCtx.lineTo(128, i);
    tCtx.stroke();
  }
  const tacticalCloth = new THREE.CanvasTexture(tCan);
  tacticalCloth.wrapS = tacticalCloth.wrapT = THREE.RepeatWrapping;
  tacticalCloth.colorSpace = THREE.SRGBColorSpace;

  // 7b. Weathered Sun-Tanned Hand Skin (subtle dirt, knuckle scuffs, and pores)
  const [hsCan, hsCtx] = makeCanvas(256);
  hsCtx.fillStyle = '#b4744f';
  hsCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 420; i++) {
    const px = (i * 59) % 256;
    const py = (i * 97) % 256;
    const r = 3 + (i % 9);
    hsCtx.fillStyle =
      i % 5 === 0
        ? 'rgba(72, 42, 28, 0.16)'
        : i % 4 === 0
          ? 'rgba(218, 162, 122, 0.16)'
          : 'rgba(138, 82, 54, 0.14)';
    hsCtx.beginPath();
    hsCtx.arc(px, py, r, 0, Math.PI * 2);
    hsCtx.fill();
  }
  // Subtle knuckle/skin abrasion scuffs
  for (let i = 0; i < 14; i++) {
    hsCtx.strokeStyle = i % 2 === 0 ? 'rgba(116, 26, 20, 0.34)' : 'rgba(56, 34, 24, 0.28)';
    hsCtx.lineWidth = 2.2;
    hsCtx.beginPath();
    const sx = 32 + ((i * 37) % 192);
    const sy = 40 + ((i * 53) % 176);
    hsCtx.moveTo(sx, sy);
    hsCtx.lineTo(sx + 10 + (i % 8), sy + 4 - (i % 7));
    hsCtx.stroke();
  }
  const weatheredHandSkin = new THREE.CanvasTexture(hsCan);
  weatheredHandSkin.wrapS = weatheredHandSkin.wrapT = THREE.RepeatWrapping;
  weatheredHandSkin.colorSpace = THREE.SRGBColorSpace;
  weatheredHandSkin.anisotropy = maxAnisotropy;

  // 7c. Tactical Armored Glove Leather / Cordura Weave
  const [tgCan, tgCtx] = makeCanvas(128);
  tgCtx.fillStyle = '#1b1d22';
  tgCtx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 6) {
    for (let x = 0; x < 128; x += 6) {
      tgCtx.fillStyle = (x + y) % 12 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.22)';
      tgCtx.fillRect(x, y, 4, 4);
    }
  }
  tgCtx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
  tgCtx.lineWidth = 1.5;
  tgCtx.strokeRect(4, 4, 120, 120);
  const tacticalGlove = new THREE.CanvasTexture(tgCan);
  tacticalGlove.wrapS = tacticalGlove.wrapT = THREE.RepeatWrapping;
  tacticalGlove.colorSpace = THREE.SRGBColorSpace;
  tacticalGlove.anisotropy = maxAnisotropy;

  // 7d. Brushed Forged Machete / Kukri Steel
  const [bsCan, bsCtx] = makeCanvas(256);
  const bsGrad = bsCtx.createLinearGradient(0, 0, 0, 256);
  bsGrad.addColorStop(0, '#474e59');
  bsGrad.addColorStop(0.55, '#6d7785');
  bsGrad.addColorStop(0.86, '#94a3b8');
  bsGrad.addColorStop(1, '#cbd5e1');
  bsCtx.fillStyle = bsGrad;
  bsCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 240; i++) {
    bsCtx.strokeStyle = i % 2 === 0 ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.16)';
    bsCtx.lineWidth = 1;
    const y = (i * 19) % 256;
    bsCtx.beginPath();
    bsCtx.moveTo(0, y);
    bsCtx.lineTo(256, y + ((i % 5) - 2));
    bsCtx.stroke();
  }
  const brushedBladeSteel = new THREE.CanvasTexture(bsCan);
  brushedBladeSteel.wrapS = brushedBladeSteel.wrapT = THREE.RepeatWrapping;
  brushedBladeSteel.colorSpace = THREE.SRGBColorSpace;
  brushedBladeSteel.anisotropy = maxAnisotropy;

  // 7e. Chunky Tactical Digital Wristwatch Dial (glowing cyan LED digits)
  const [wfCan, wfCtx] = makeCanvas(128);
  wfCtx.fillStyle = '#090c10';
  wfCtx.fillRect(0, 0, 128, 128);
  wfCtx.strokeStyle = '#334155';
  wfCtx.lineWidth = 8;
  wfCtx.beginPath();
  wfCtx.arc(64, 64, 56, 0, Math.PI * 2);
  wfCtx.stroke();
  wfCtx.fillStyle = '#0c131d';
  wfCtx.beginPath();
  wfCtx.arc(64, 64, 46, 0, Math.PI * 2);
  wfCtx.fill();
  // Cyan digital LED digits
  wfCtx.fillStyle = '#38bdf8';
  wfCtx.shadowColor = '#0ea5e9';
  wfCtx.shadowBlur = 10;
  wfCtx.font = 'bold 26px monospace';
  wfCtx.textAlign = 'center';
  wfCtx.textBaseline = 'middle';
  wfCtx.fillText('18:59', 64, 66);
  wfCtx.shadowBlur = 0;
  wfCtx.fillStyle = '#94a3b8';
  wfCtx.font = 'bold 9px monospace';
  wfCtx.fillText('SELECT', 64, 30);
  const watchFace = new THREE.CanvasTexture(wfCan);
  watchFace.colorSpace = THREE.SRGBColorSpace;
  watchFace.anisotropy = maxAnisotropy;

  // 7f. Golden-Hour Soft Sun Halo Sprite Texture
  const [shCan, shCtx] = makeCanvas(256);
  const shGrad = shCtx.createRadialGradient(128, 128, 4, 128, 128, 126);
  shGrad.addColorStop(0, 'rgba(255, 250, 220, 0.96)');
  shGrad.addColorStop(0.18, 'rgba(255, 215, 110, 0.72)');
  shGrad.addColorStop(0.45, 'rgba(245, 165, 55, 0.34)');
  shGrad.addColorStop(0.75, 'rgba(218, 125, 32, 0.10)');
  shGrad.addColorStop(1, 'rgba(218, 125, 32, 0)');
  shCtx.fillStyle = shGrad;
  shCtx.fillRect(0, 0, 256, 256);
  const sunHalo = new THREE.CanvasTexture(shCan);
  sunHalo.colorSpace = THREE.SRGBColorSpace;

  // 7g. Dusty Tan/Cream Tactical Glove Fabric (matches image_70c3ca82.png)
  const [tgfCan, tgfCtx] = makeCanvas(128);
  tgfCtx.fillStyle = '#c8bca2';
  tgfCtx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 4) {
    for (let x = 0; x < 128; x += 4) {
      tgfCtx.fillStyle = (x + y) % 8 === 0 ? 'rgba(255,255,255,0.16)' : 'rgba(65, 52, 38, 0.16)';
      tgfCtx.fillRect(x, y, 2, 2);
    }
  }
  for (let i = 0; i < 90; i++) {
    tgfCtx.fillStyle = 'rgba(78, 56, 36, 0.14)';
    tgfCtx.beginPath();
    tgfCtx.arc((i * 43) % 128, (i * 71) % 128, 3 + (i % 6), 0, Math.PI * 2);
    tgfCtx.fill();
  }
  const tanGloveFabric = new THREE.CanvasTexture(tgfCan);
  tanGloveFabric.wrapS = tanGloveFabric.wrapT = THREE.RepeatWrapping;
  tanGloveFabric.colorSpace = THREE.SRGBColorSpace;
  tanGloveFabric.anisotropy = maxAnisotropy;

  // 7h. Brushed Satin Stainless Pistol Slide with Serrations (matches image_70c3ca82.png)
  const [ssCan, ssCtx] = makeCanvas(256);
  const ssGrad = ssCtx.createLinearGradient(0, 0, 0, 256);
  ssGrad.addColorStop(0, '#a6acb3');
  ssGrad.addColorStop(0.45, '#d1d5db');
  ssGrad.addColorStop(0.85, '#9ea5ae');
  ssGrad.addColorStop(1, '#717882');
  ssCtx.fillStyle = ssGrad;
  ssCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 160; i++) {
    ssCtx.strokeStyle = i % 2 === 0 ? 'rgba(255,255,255,0.15)' : 'rgba(30,41,59,0.12)';
    ssCtx.lineWidth = 1;
    const y = (i * 17) % 256;
    ssCtx.beginPath();
    ssCtx.moveTo(0, y);
    ssCtx.lineTo(256, y);
    ssCtx.stroke();
  }
  const brushedSilverSlide = new THREE.CanvasTexture(ssCan);
  brushedSilverSlide.wrapS = brushedSilverSlide.wrapT = THREE.RepeatWrapping;
  brushedSilverSlide.colorSpace = THREE.SRGBColorSpace;
  brushedSilverSlide.anisotropy = maxAnisotropy;

  // 7i. Stippled Matte-Black Polymer Pistol Grip
  const [pgCan, pgCtx] = makeCanvas(128);
  pgCtx.fillStyle = '#24272c';
  pgCtx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 5) {
    for (let x = 0; x < 128; x += 5) {
      pgCtx.fillStyle = (x + y) % 10 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.45)';
      pgCtx.fillRect(x, y, 2, 2);
    }
  }
  const polymerGrip = new THREE.CanvasTexture(pgCan);
  polymerGrip.wrapS = polymerGrip.wrapT = THREE.RepeatWrapping;
  polymerGrip.colorSpace = THREE.SRGBColorSpace;
  polymerGrip.anisotropy = maxAnisotropy;

  // 8. Radial Contact Shadow
  const [cCan, cCtx] = makeCanvas(128);
  const cGrad = cCtx.createRadialGradient(64, 64, 6, 64, 64, 60);
  cGrad.addColorStop(0, 'rgba(0, 0, 0, 0.58)');
  cGrad.addColorStop(0.6, 'rgba(0, 0, 0, 0.22)');
  cGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  cCtx.fillStyle = cGrad;
  cCtx.fillRect(0, 0, 128, 128);
  const contactShadow = new THREE.CanvasTexture(cCan);

  return {
    marble,
    pietraDura,
    sandstone,
    courtyardGround,
    woodPlank,
    corrugatedMetal,
    hazardStripe,
    waterNormal,
    necroticSkin,
    tacticalCloth,
    weatheredHandSkin,
    tacticalGlove,
    tanGloveFabric,
    brushedBladeSteel,
    brushedSilverSlide,
    polymerGrip,
    watchFace,
    sunHalo,
    contactShadow,
    dispose: () => {
      marble.dispose();
      pietraDura.dispose();
      sandstone.dispose();
      courtyardGround.dispose();
      woodPlank.dispose();
      corrugatedMetal.dispose();
      hazardStripe.dispose();
      waterNormal.dispose();
      necroticSkin.dispose();
      tacticalCloth.dispose();
      weatheredHandSkin.dispose();
      tacticalGlove.dispose();
      tanGloveFabric.dispose();
      brushedBladeSteel.dispose();
      brushedSilverSlide.dispose();
      polymerGrip.dispose();
      watchFace.dispose();
      sunHalo.dispose();
      contactShadow.dispose();
    },
  };
}
