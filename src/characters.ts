import * as THREE from 'three';

export type PowerId = 'rampage' | 'blink' | 'overclock' | 'mudBomb' | 'dragonBreath' | 'frostNova' | 'phantom' | 'hexSwap';

export interface CharacterDef {
  id: string;
  name: string;
  tagline: string;
  color: string;
  /** 1 to 5, shown as bars on the select screen. */
  stats: { speed: number; accel: number; handling: number; weight: number };
  power: { id: PowerId; name: string; description: string };
  build: () => THREE.Group;
}

const lambert = (color: number, extra: THREE.MeshLambertMaterialParameters = {}) =>
  new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/**
 * Shared kart chassis. The kart faces +Z. Wheels are tagged so the game can spin them.
 * Returns the group and the seat height where the driver sits.
 */
function chassis(body: number, trim: number): THREE.Group {
  const g = new THREE.Group();
  const bodyMat = lambert(body);
  const trimMat = lambert(trim);
  const tyre = lambert(0x1e1e1e);
  const hub = lambert(0xbfbfbf);

  g.add(mesh(new THREE.BoxGeometry(1.7, 0.45, 2.8), bodyMat, 0, 0.55, 0));
  const nose = mesh(new THREE.BoxGeometry(1.3, 0.35, 0.9), trimMat, 0, 0.5, 1.7);
  g.add(nose);
  g.add(mesh(new THREE.BoxGeometry(1.2, 0.5, 0.25), trimMat, 0, 0.95, -0.45)); // seat back
  g.add(mesh(new THREE.BoxGeometry(1.9, 0.1, 0.5), trimMat, 0, 1.25, -1.35)); // spoiler
  for (const x of [-0.6, 0.6]) {
    g.add(mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), trimMat, x, 1.0, -1.35));
    g.add(mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.5, 6).rotateX(Math.PI / 2), hub, x * 0.6, 0.6, -1.55));
  }
  // Steering wheel.
  const wheel = mesh(new THREE.TorusGeometry(0.22, 0.05, 4, 10), tyre, 0, 1.05, 0.55);
  wheel.rotation.x = -0.6;
  g.add(wheel);

  for (const [x, z, r] of [[-0.95, 1.05, 0.33], [0.95, 1.05, 0.33], [-0.95, -1.0, 0.4], [0.95, -1.0, 0.4]]) {
    const w = new THREE.Group();
    w.add(mesh(new THREE.CylinderGeometry(r, r, 0.38, 10).rotateZ(Math.PI / 2), tyre));
    w.add(mesh(new THREE.CylinderGeometry(r * 0.5, r * 0.5, 0.4, 6).rotateZ(Math.PI / 2), hub));
    w.position.set(x, r, z);
    w.userData.wheel = true;
    w.userData.front = z > 0;
    g.add(w);
  }
  return g;
}

/** Torso plus arms reaching to the steering wheel. */
function driverBody(g: THREE.Group, shirt: THREE.Material, skin: THREE.Material, broad = 1) {
  g.add(mesh(new THREE.BoxGeometry(0.8 * broad, 0.75, 0.55), shirt, 0, 1.2, -0.15));
  for (const x of [-0.42 * broad, 0.42 * broad]) {
    const arm = mesh(new THREE.BoxGeometry(0.2, 0.2, 0.75), shirt, x, 1.2, 0.2);
    arm.rotation.x = 0.3;
    g.add(arm);
    g.add(mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), skin, x * 0.7, 1.08, 0.55));
  }
}

function buildOrc(): THREE.Group {
  const g = chassis(0x2b2633, 0x8f1d1d);
  const skin = lambert(0x587a3e);
  const armour = lambert(0x3a3640);
  const spike = lambert(0xb9b2a8);
  driverBody(g, armour, skin, 1.25);
  const head = new THREE.Group();
  head.add(mesh(new THREE.BoxGeometry(0.75, 0.65, 0.7), skin));
  head.add(mesh(new THREE.BoxGeometry(0.8, 0.25, 0.4), skin, 0, -0.3, 0.2)); // heavy jaw
  for (const x of [-0.25, 0.25]) {
    head.add(mesh(new THREE.ConeGeometry(0.07, 0.3, 4), lambert(0xf2ead8), x, -0.1, 0.42)); // tusks
    head.add(mesh(new THREE.BoxGeometry(0.14, 0.08, 0.05), new THREE.MeshBasicMaterial({ color: 0xff3b2f }), x * 0.7, 0.08, 0.36));
  }
  // Spiked helmet.
  head.add(mesh(new THREE.CylinderGeometry(0.42, 0.45, 0.3, 6), armour, 0, 0.38, 0));
  for (let k = 0; k < 3; k++) head.add(mesh(new THREE.ConeGeometry(0.1, 0.4, 4), spike, (k - 1) * 0.25, 0.7, 0));
  head.position.set(0, 1.95, -0.15);
  g.add(head);
  for (const x of [-0.6, 0.6]) {
    g.add(mesh(new THREE.SphereGeometry(0.28, 6, 4), armour, x, 1.55, -0.15)); // pauldrons
    g.add(mesh(new THREE.ConeGeometry(0.08, 0.35, 4), spike, x, 1.85, -0.15));
  }
  // Spikes on the kart nose.
  for (const x of [-0.45, 0, 0.45]) {
    const c = mesh(new THREE.ConeGeometry(0.1, 0.45, 4).rotateX(Math.PI / 2), spike, x, 0.55, 2.3);
    g.add(c);
  }
  return g;
}

function buildElf(): THREE.Group {
  const g = chassis(0xf3efe2, 0xd4a72c);
  const skin = lambert(0xf5dcc4);
  const robe = lambert(0x3f8f6a);
  const hair = lambert(0xf2d570);
  driverBody(g, robe, skin, 0.85);
  const head = new THREE.Group();
  head.add(mesh(new THREE.BoxGeometry(0.55, 0.6, 0.55), skin));
  head.add(mesh(new THREE.BoxGeometry(0.62, 0.25, 0.6), hair, 0, 0.32, -0.02));
  head.add(mesh(new THREE.BoxGeometry(0.6, 0.9, 0.2), hair, 0, -0.1, -0.33)); // long hair
  for (const x of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(0.08, 0.55, 4), skin, x * 0.38, 0.1, -0.05);
    ear.rotation.z = -x * 1.15;
    head.add(ear);
    head.add(mesh(new THREE.BoxGeometry(0.1, 0.06, 0.05), lambert(0x2a6fb0), x * 0.13, 0.05, 0.28));
  }
  head.add(mesh(new THREE.TorusGeometry(0.31, 0.03, 4, 12).rotateX(Math.PI / 2), lambert(0xe8c547), 0, 0.22, 0));
  head.add(mesh(new THREE.OctahedronGeometry(0.08), new THREE.MeshBasicMaterial({ color: 0xbff4ff }), 0, 0.24, 0.31));
  head.position.set(0, 1.9, -0.15);
  g.add(head);
  // Leaf-shaped wings on the spoiler.
  for (const x of [-1, 1]) {
    const leaf = mesh(new THREE.ConeGeometry(0.25, 1.2, 4).rotateZ(x * Math.PI / 2), lambert(0x6fcf8f), x * 1.3, 1.25, -1.35);
    g.add(leaf);
  }
  return g;
}

function buildRobot(): THREE.Group {
  const g = chassis(0x4f6b8c, 0xc9d2dc);
  const metal = lambert(0xa7b1bc);
  const dark = lambert(0x3a4350);
  const glow = new THREE.MeshBasicMaterial({ color: 0x41f0ff });
  driverBody(g, metal, dark, 1);
  g.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.3, 8), dark, 0, 1.65, -0.15)); // neck
  const head = new THREE.Group();
  head.add(mesh(new THREE.BoxGeometry(0.7, 0.55, 0.6), metal));
  head.add(mesh(new THREE.BoxGeometry(0.58, 0.14, 0.05), glow, 0, 0.05, 0.31)); // visor
  for (const x of [-0.38, 0.38]) head.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 8).rotateZ(Math.PI / 2), dark, x, 0, 0));
  head.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 4), dark, 0.15, 0.5, 0));
  const bulb = mesh(new THREE.SphereGeometry(0.08, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff3030 }), 0.15, 0.75, 0);
  bulb.userData.blink = true;
  head.add(bulb);
  head.position.set(0, 2.0, -0.15);
  g.add(head);
  // Glowing strips along the chassis.
  for (const x of [-0.86, 0.86]) g.add(mesh(new THREE.BoxGeometry(0.04, 0.1, 2.4), glow, x, 0.6, 0));
  return g;
}

function buildDwarf(): THREE.Group {
  const g = chassis(0x6b4a2c, 0x8c8c8c);
  const skin = lambert(0xd9a07a);
  const tunic = lambert(0x7a3b2a);
  const beard = lambert(0xb8612a);
  const mud = lambert(0x4a3220);
  const steel = lambert(0x9a9a9a);
  driverBody(g, tunic, skin, 1.15);
  const head = new THREE.Group();
  head.add(mesh(new THREE.BoxGeometry(0.62, 0.55, 0.58), skin));
  head.add(mesh(new THREE.SphereGeometry(0.13, 6, 4), lambert(0xc4806a), 0, -0.02, 0.32)); // big nose
  head.add(mesh(new THREE.ConeGeometry(0.42, 0.95, 6).rotateX(Math.PI), beard, 0, -0.55, 0.15));
  head.add(mesh(new THREE.BoxGeometry(0.66, 0.15, 0.2), beard, 0, -0.12, 0.25));
  head.add(mesh(new THREE.SphereGeometry(0.38, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), steel, 0, 0.22, 0)); // helmet
  for (const x of [-1, 1]) {
    const horn = mesh(new THREE.ConeGeometry(0.08, 0.5, 5), lambert(0xeee2c4), x * 0.42, 0.42, 0);
    horn.rotation.z = -x * 0.8;
    head.add(horn);
    head.add(mesh(new THREE.BoxGeometry(0.1, 0.06, 0.05), lambert(0x1a1a1a), x * 0.14, 0.08, 0.3));
  }
  head.add(mesh(new THREE.SphereGeometry(0.09, 5, 3), mud, 0.2, 0.15, 0.29)); // mud on the face
  head.position.set(0, 1.85, -0.15);
  g.add(head);
  // Mud splatters on the kart.
  for (const [x, y, z, r] of [[0.5, 0.8, 0.6, 0.25], [-0.7, 0.7, -0.8, 0.3], [0.2, 0.75, 1.5, 0.2], [-0.4, 0.8, 0.2, 0.18]]) {
    const blob = mesh(new THREE.SphereGeometry(r, 6, 4), mud, x, y, z);
    blob.scale.y = 0.35;
    g.add(blob);
  }
  // A pickaxe strapped to the back.
  const pick = new THREE.Group();
  pick.add(mesh(new THREE.BoxGeometry(0.08, 1.3, 0.08), lambert(0x6b4a2c)));
  pick.add(mesh(new THREE.BoxGeometry(0.7, 0.12, 0.12), steel, 0, 0.6, 0));
  pick.position.set(0.5, 1.4, -0.75);
  pick.rotation.z = 0.5;
  g.add(pick);
  return g;
}

function buildDrake(): THREE.Group {
  const g = chassis(0x7a1f12, 0xf0a020);
  const scales = lambert(0xc4421c);
  const belly = lambert(0xf2b45a);
  const horn = lambert(0x2a1a14);
  const ember = new THREE.MeshBasicMaterial({ color: 0xffb020 });
  driverBody(g, scales, scales, 1.05);
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.55, 0.1), belly, 0, 1.2, 0.14));
  const head = new THREE.Group();
  head.add(mesh(new THREE.BoxGeometry(0.62, 0.55, 0.62), scales));
  head.add(mesh(new THREE.BoxGeometry(0.48, 0.32, 0.5), scales, 0, -0.1, 0.5)); // snout
  head.add(mesh(new THREE.BoxGeometry(0.4, 0.1, 0.45), belly, 0, -0.27, 0.48)); // jaw
  for (const x of [-1, 1]) {
    head.add(mesh(new THREE.BoxGeometry(0.12, 0.08, 0.05), ember, x * 0.18, 0.1, 0.32));
    head.add(mesh(new THREE.SphereGeometry(0.04, 4, 3), horn, x * 0.1, -0.02, 0.76)); // nostrils
    const h = mesh(new THREE.ConeGeometry(0.09, 0.55, 5), horn, x * 0.22, 0.42, -0.2);
    h.rotation.x = -0.8;
    head.add(h);
  }
  // Ridge of spines down the back of the head.
  for (let k = 0; k < 3; k++) head.add(mesh(new THREE.ConeGeometry(0.07, 0.22, 4), belly, 0, 0.32 - k * 0.1, -0.1 - k * 0.15));
  head.position.set(0, 1.95, -0.15);
  g.add(head);
  // Bat wings folded behind the seat.
  for (const x of [-1, 1]) {
    const wing = new THREE.Group();
    wing.add(mesh(new THREE.BoxGeometry(0.08, 0.08, 1.1), horn, 0, 0.5, -0.3));
    const membrane = mesh(new THREE.ConeGeometry(0.6, 1.2, 3).rotateX(Math.PI / 2), lambert(0x9a2a18, { side: THREE.DoubleSide }), 0, 0.15, -0.3);
    membrane.scale.x = 0.15;
    wing.add(membrane);
    wing.position.set(x * 0.55, 1.2, -0.4);
    wing.rotation.z = x * 0.5;
    g.add(wing);
  }
  // Tail curling off the back of the kart.
  for (let k = 0; k < 4; k++) g.add(mesh(new THREE.BoxGeometry(0.22 - k * 0.04, 0.22 - k * 0.04, 0.4), scales, 0, 0.75 + k * 0.08, -1.6 - k * 0.32));
  g.add(mesh(new THREE.ConeGeometry(0.15, 0.3, 4).rotateX(-Math.PI / 2), horn, 0, 1.05, -2.95));
  // Glowing exhaust embers.
  for (const x of [-0.36, 0.36]) g.add(mesh(new THREE.SphereGeometry(0.1, 5, 3), ember, x, 0.6, -1.8));
  return g;
}

function buildTroll(): THREE.Group {
  const g = chassis(0x9fc4dc, 0x3c5a78);
  const skin = lambert(0x7fa6b8);
  const fur = lambert(0xe9eef2);
  const ice = new THREE.MeshLambertMaterial({ color: 0xbfeaff, flatShading: true, transparent: true, opacity: 0.85 });
  driverBody(g, fur, skin, 1.35);
  const head = new THREE.Group();
  head.add(mesh(new THREE.BoxGeometry(0.85, 0.7, 0.7), skin));
  head.add(mesh(new THREE.BoxGeometry(0.9, 0.2, 0.3), skin, 0, 0.25, 0.25)); // heavy brow
  head.add(mesh(new THREE.SphereGeometry(0.17, 5, 4), lambert(0x6a93a6), 0, -0.02, 0.4)); // nose
  head.add(mesh(new THREE.BoxGeometry(0.95, 0.35, 0.5), fur, 0, -0.35, 0.05)); // frosty beard
  for (const x of [-1, 1]) {
    head.add(mesh(new THREE.BoxGeometry(0.12, 0.07, 0.05), new THREE.MeshBasicMaterial({ color: 0x9ff4ff }), x * 0.2, 0.1, 0.36));
    head.add(mesh(new THREE.ConeGeometry(0.06, 0.25, 4), lambert(0xf2f2e8), x * 0.22, -0.22, 0.36)); // tusks
    head.add(mesh(new THREE.BoxGeometry(0.15, 0.3, 0.12), skin, x * 0.48, 0.05, 0)); // ears
  }
  // Icicle crown.
  for (let k = 0; k < 5; k++) head.add(mesh(new THREE.ConeGeometry(0.07, 0.3 + (k % 2) * 0.2, 4), ice, (k - 2) * 0.17, 0.48 + (k % 2) * 0.1, 0));
  head.position.set(0, 2.0, -0.15);
  g.add(head);
  for (const x of [-0.7, 0.7]) g.add(mesh(new THREE.SphereGeometry(0.32, 6, 4), fur, x, 1.55, -0.15)); // fur shoulders
  // Ice crystals frozen to the kart.
  for (const [x, y, z, r] of [[0.7, 0.9, 1.4, 0.25], [-0.75, 0.95, 0.9, 0.2], [0.8, 0.9, -1.1, 0.3], [-0.6, 0.9, -1.4, 0.22]]) {
    const c = mesh(new THREE.OctahedronGeometry(r), ice, x, y, z);
    c.scale.y = 1.8;
    g.add(c);
  }
  // A club made of a frozen log.
  const club = mesh(new THREE.CylinderGeometry(0.18, 0.1, 1.3, 6), lambert(0x6b5a48), 0.55, 1.45, -0.8);
  club.rotation.z = -0.5;
  g.add(club);
  return g;
}

function buildSkeleton(): THREE.Group {
  const g = chassis(0x2a2238, 0x6b4f9c);
  const bone = lambert(0xe8e0c8);
  const cloth = lambert(0x3b2f52);
  const iron = lambert(0x5a5a66);
  const soulfire = new THREE.MeshBasicMaterial({ color: 0x7dffb0 });
  // Rib cage instead of a torso.
  g.add(mesh(new THREE.BoxGeometry(0.12, 0.75, 0.12), bone, 0, 1.2, -0.15)); // spine
  for (let k = 0; k < 4; k++) g.add(mesh(new THREE.BoxGeometry(0.65 - k * 0.06, 0.07, 0.4), bone, 0, 1.45 - k * 0.15, -0.1));
  for (const x of [-0.38, 0.38]) {
    const arm = mesh(new THREE.BoxGeometry(0.1, 0.1, 0.75), bone, x, 1.25, 0.2);
    arm.rotation.x = 0.3;
    g.add(arm);
    g.add(mesh(new THREE.BoxGeometry(0.16, 0.12, 0.16), bone, x * 0.7, 1.08, 0.55));
  }
  // Tattered cape.
  g.add(mesh(new THREE.BoxGeometry(0.8, 0.9, 0.08), cloth, 0, 1.2, -0.5));
  const head = new THREE.Group();
  head.add(mesh(new THREE.BoxGeometry(0.55, 0.5, 0.55), bone));
  head.add(mesh(new THREE.BoxGeometry(0.42, 0.18, 0.4), bone, 0, -0.3, 0.06)); // jaw
  for (const x of [-1, 1]) {
    head.add(mesh(new THREE.BoxGeometry(0.15, 0.13, 0.05), lambert(0x111111), x * 0.13, 0.02, 0.27));
    head.add(mesh(new THREE.SphereGeometry(0.05, 4, 3), soulfire, x * 0.13, 0.02, 0.3)); // glowing eyes
  }
  for (let k = 0; k < 4; k++) head.add(mesh(new THREE.BoxGeometry(0.06, 0.06, 0.03), bone, (k - 1.5) * 0.08, -0.2, 0.27)); // teeth
  // Battered knight's helm with a plume.
  head.add(mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.25, 8), iron, 0, 0.32, 0));
  head.add(mesh(new THREE.BoxGeometry(0.1, 0.25, 0.55), lambert(0x8a2a4a), 0, 0.55, -0.05));
  head.position.set(0, 1.9, -0.15);
  g.add(head);
  // Ghostly lanterns on the spoiler.
  for (const x of [-0.9, 0.9]) {
    g.add(mesh(new THREE.BoxGeometry(0.2, 0.25, 0.2), iron, x, 1.45, -1.35));
    g.add(mesh(new THREE.SphereGeometry(0.08, 5, 3), soulfire, x, 1.45, -1.35));
  }
  // Bone spikes along the sides.
  for (const z of [-0.6, 0.2, 1.0]) {
    for (const x of [-1, 1]) {
      const sp = mesh(new THREE.ConeGeometry(0.06, 0.4, 4), bone, x * 0.95, 0.75, z);
      sp.rotation.z = -x * 1.2;
      g.add(sp);
    }
  }
  return g;
}

function buildPixie(): THREE.Group {
  const g = chassis(0xd77fd0, 0x7be0c4);
  const skin = lambert(0xc8f0d0);
  const petal = lambert(0xff9ad6);
  const hair = lambert(0x8a5cf0);
  const sparkle = new THREE.MeshBasicMaterial({ color: 0xfff6a8 });
  const wingMat = new THREE.MeshBasicMaterial({ color: 0xbff8ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  driverBody(g, petal, skin, 0.7);
  const head = new THREE.Group();
  head.add(mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skin));
  head.add(mesh(new THREE.BoxGeometry(0.56, 0.22, 0.56), hair, 0, 0.27, -0.02));
  head.add(mesh(new THREE.ConeGeometry(0.2, 0.6, 5), hair, 0, 0.6, -0.1)); // spiky tuft
  for (const x of [-1, 1]) {
    head.add(mesh(new THREE.BoxGeometry(0.12, 0.12, 0.05), lambert(0x2a1a4a), x * 0.12, 0.03, 0.26)); // big eyes
    const ear = mesh(new THREE.ConeGeometry(0.06, 0.35, 4), skin, x * 0.32, 0.12, -0.02);
    ear.rotation.z = -x * 1.0;
    head.add(ear);
    // Antennae with glowing tips.
    const ant = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 3), hair, x * 0.12, 0.55, 0.1);
    ant.rotation.z = -x * 0.4;
    head.add(ant);
    head.add(mesh(new THREE.SphereGeometry(0.05, 5, 3), sparkle, x * 0.21, 0.74, 0.1));
  }
  head.position.set(0, 1.8, -0.15);
  g.add(head);
  // Two pairs of dragonfly wings.
  for (const x of [-1, 1]) {
    for (const [y, tilt, len] of [[1.6, 0.35, 1.2], [1.25, -0.25, 0.9]]) {
      const w = mesh(new THREE.CircleGeometry(0.5, 8), wingMat, x * (0.35 + len * 0.45), y, -0.55);
      w.scale.set(len, 0.35, 1);
      w.rotation.set(0, x * 0.4, x * tilt);
      g.add(w);
    }
  }
  // A mushroom cap on the spoiler and flower petals on the nose.
  g.add(mesh(new THREE.SphereGeometry(0.45, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), lambert(0xe03c3c), 0, 1.3, -1.35));
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    g.add(mesh(new THREE.SphereGeometry(0.16, 5, 3), petal, Math.cos(a) * 0.25, 0.75, 1.75 + Math.sin(a) * 0.25));
  }
  g.add(mesh(new THREE.SphereGeometry(0.12, 5, 3), sparkle, 0, 0.8, 1.75));
  return g;
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'orc',
    name: 'Dark Orc',
    tagline: 'Heavy, fast, and not very good at corners.',
    color: '#c0392b',
    stats: { speed: 5, accel: 2, handling: 2, weight: 5 },
    power: { id: 'rampage', name: 'Rampage', description: 'Goes red with rage: faster, immune to hazards, and spins out anyone it rams.' },
    build: buildOrc,
  },
  {
    id: 'elf',
    name: 'Light Elf',
    tagline: 'Light as a feather, carves every corner.',
    color: '#e8c547',
    stats: { speed: 3, accel: 4, handling: 5, weight: 1 },
    power: { id: 'blink', name: 'Blink', description: 'Vanishes in a flash of light and reappears 35 metres up the road.' },
    build: buildElf,
  },
  {
    id: 'robot',
    name: 'Robot',
    tagline: 'Balanced in every way, by design.',
    color: '#41b8ff',
    stats: { speed: 4, accel: 3, handling: 3, weight: 3 },
    power: { id: 'overclock', name: 'Overclock', description: 'Pushes its engine past the limit for a long boost that ignores rough ground.' },
    build: buildRobot,
  },
  {
    id: 'dwarf',
    name: 'Dirty Dwarf',
    tagline: 'Off the line like a rockslide.',
    color: '#a0632d',
    stats: { speed: 3, accel: 5, handling: 3, weight: 4 },
    power: { id: 'mudBomb', name: 'Mud Bomb', description: 'Hurls a bomb of mud ahead that leaves a sticky puddle for everyone else.' },
    build: buildDwarf,
  },
  {
    id: 'drake',
    name: 'Ember Drake',
    tagline: 'Hot-headed, hard-hitting, slow to turn.',
    color: '#ff6a1a',
    stats: { speed: 4, accel: 3, handling: 2, weight: 4 },
    power: { id: 'dragonBreath', name: 'Dragon Breath', description: 'Roars a cone of fire down the road that spins out every racer in front.' },
    build: buildDrake,
  },
  {
    id: 'troll',
    name: 'Frost Troll',
    tagline: 'A glacier on wheels. Hard to stop once moving.',
    color: '#7fd8ff',
    stats: { speed: 5, accel: 1, handling: 3, weight: 5 },
    power: { id: 'frostNova', name: 'Frost Nova', description: 'Blasts out a ring of ice that freezes nearby racers to a crawl.' },
    build: buildTroll,
  },
  {
    id: 'skeleton',
    name: 'Bone Knight',
    tagline: 'Rattles along on pure stubbornness.',
    color: '#7dffb0',
    stats: { speed: 4, accel: 4, handling: 3, weight: 2 },
    power: { id: 'phantom', name: 'Phantom Ride', description: 'Turns ghostly: passes through racers, hazards, and attacks, and speeds up a little.' },
    build: buildSkeleton,
  },
  {
    id: 'pixie',
    name: 'Pixie',
    tagline: 'Tiny, twitchy, and full of tricks.',
    color: '#ff9ad6',
    stats: { speed: 2, accel: 5, handling: 5, weight: 1 },
    power: { id: 'hexSwap', name: 'Hex Swap', description: 'Swaps places with the racer just ahead, if they are within 90 metres.' },
    build: buildPixie,
  },
];
