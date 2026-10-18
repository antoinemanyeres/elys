// Static configuration and demo seed data for the Elys mockup.

const COLORS = [
  { id: 'green', label: 'Green', hex: '#3ccf6e', ink: '#08130c' },
  { id: 'blue', label: 'Blue', hex: '#3d8bff', ink: '#fff' },
  { id: 'yellow', label: 'Yellow', hex: '#ffd93d', ink: '#1a1500' },
  { id: 'red', label: 'Red', hex: '#ff4d4d', ink: '#fff' },
  { id: 'white', label: 'White', hex: '#f4f4f4', ink: '#111' },
  { id: 'black', label: 'Black', hex: '#1b1b1b', ink: '#fff' },
  { id: 'pink', label: 'Pink', hex: '#ff4fb4', ink: '#fff' },
];

// Points for sub-grade 1 of each color; sub-grades interpolate exponentially toward the next color.
const COLOR_POINTS = { green: 25, blue: 50, yellow: 100, red: 200, white: 350, black: 600, pink: 1000 };
const TOP_COLOR_GROWTH = 1.7;

function pointsFor(color, subGrade) {
  const i = COLORS.findIndex((c) => c.id === color);
  const base = COLOR_POINTS[color];
  const next = i < COLORS.length - 1 ? COLOR_POINTS[COLORS[i + 1].id] : base * TOP_COLOR_GROWTH;
  return Math.round((base * Math.pow(next / base, (subGrade - 1) / 5)) / 5) * 5;
}

const FLASH_BONUS = 0.1;

function sendPointsFor(color, subGrade, flash) {
  const pts = pointsFor(color, subGrade);
  return flash ? Math.round((pts * (1 + FLASH_BONUS)) / 5) * 5 : pts;
}

const HOLD_TYPES = ['start', 'hold', 'top'];

const STYLE_TAGS = [
  'Crimps', 'Slopers', 'Pinches', 'Pockets', 'Volumes', 'Dyno', 'Coordination', 'Balance',
  'Slab', 'Overhang', 'Compression', 'Heel hook', 'Toe hook', 'Mantle', 'Endurance',
];

const AREA_COLORS = { main: '#c49a7a', labyrinth: '#5ec8f2', welle: '#f27aa8', board: '#9bd46a' };

// Simplified gym map (SVG viewBox 0 0 700 770). rect = [x, y, width, height].
const SECTORS = [
  { id: 'highball', name: 'Highball', area: 'main', rect: [20, 10, 100, 120] },
  { id: 'couloir', name: 'Couloir', area: 'main', rect: [20, 130, 100, 100] },
  { id: 'wettkampfwand', name: 'Wettkampfwand', area: 'main', rect: [20, 230, 100, 120] },
  { id: 'dawnwall', name: 'Dawn Wall', area: 'main', rect: [20, 350, 100, 100] },
  { id: 'vorgarten', name: 'Vorgarten', area: 'main', rect: [20, 450, 100, 70] },
  { id: 'basilisk', name: 'Basilisk', area: 'main', rect: [120, 10, 100, 140] },
  { id: 'nordwand', name: 'Nordwand', area: 'main', rect: [120, 150, 100, 170] },
  { id: 'hafen', name: 'Hafen', area: 'main', rect: [120, 320, 100, 200] },
  { id: 'japanboard', name: 'Japan Board', area: 'board', rect: [220, 10, 100, 100] },
  { id: 'suedwand', name: 'Südwand', area: 'main', rect: [220, 110, 100, 140] },
  { id: 'psychoblock', name: 'Psychoblock', area: 'main', rect: [220, 250, 100, 120] },
  { id: 'promenade', name: 'Promenade', area: 'main', rect: [220, 370, 100, 150] },
  { id: 'labyrinth', name: 'Labyrinth', area: 'labyrinth', rect: [20, 600, 320, 160] },
  { id: 'bucht', name: 'Bucht', area: 'welle', rect: [340, 600, 60, 160] },
  { id: 'traverse', name: 'Traverse', area: 'welle', rect: [400, 600, 180, 80] },
  { id: 'bug', name: 'Bug', area: 'welle', rect: [400, 680, 90, 80] },
  { id: 'welle', name: 'Welle', area: 'welle', rect: [490, 680, 90, 80] },
  { id: 'grotte', name: 'Grotte', area: 'welle', rect: [580, 600, 100, 80] },
  { id: 'kilterboard', name: 'Kilterboard', area: 'board', rect: [580, 680, 100, 80] },
];

function seedState() {
  const DAY = 864e5;
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const closesAt = iso(now + 60 * DAY);

  // Deterministic pseudo-random generator so the demo data is always the same.
  let seed = 42;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const users = [
    { id: 'u_you', name: 'You', role: 'climber', email: 'you@gmail.com' },
    { id: 'u_lena', name: 'Lena', role: 'setter', email: 'lena@elys.example' },
    { id: 'u_max', name: 'Max', role: 'setter', email: 'max@elys.example' },
    ...['Alex', 'Sam', 'Jonas', 'Mia', 'Paul', 'Clara', 'Noah', 'Emma', 'Lukas', 'Sofia'].map((name) => ({
      id: 'u_' + name.toLowerCase(), name, role: 'climber', email: name.toLowerCase() + '@example.com',
    })),
  ];

  // Demo photos are phone screenshots (768x1689): the wall spans pixel rows 333..1355.
  const IMG_W = 768, TOP = 333, SPAN = 1022;
  const crop = { top: TOP / 1689, bottom: (TOP + SPAN) / 1689 };
  // A sector can be split into several parts, each with its own photo (e.g. Welle 1/2, Welle 2/2).
  const wallPhotos = [
    { id: 'p1', sectorId: 'welle', part: 1, src: '../photos/elys_exemple_section.jpg', w: 768, h: 1689, crop, createdAt: now - 17 * DAY },
    { id: 'p2', sectorId: 'welle', part: 2, src: '../photos/elys_exemple_section_2.jpg', w: 768, h: 1689, crop, createdAt: now - 3 * DAY },
  ];

  // Hand-traced hold outline approximated by an ellipse, in source image pixels.
  const ell = (type, cx, cy, rx, ry, rot = 0) => {
    const a = (rot * Math.PI) / 180;
    const pts = [];
    for (let k = 0; k < 16; k++) {
      const t = (k / 16) * 2 * Math.PI;
      const ex = (rx + 4) * Math.cos(t), ey = (ry + 4) * Math.sin(t);
      const px = cx + ex * Math.cos(a) - ey * Math.sin(a);
      const py = cy + ex * Math.sin(a) + ey * Math.cos(a);
      pts.push([+(px / IMG_W).toFixed(4), +((py - TOP) / SPAN).toFixed(4)]);
    }
    return { type, pts };
  };

  const b = (id, photoId, sectorId, color, subGrade, tags, setterId, openedDaysAgo, holds) => ({
    id, photoId, sectorId, color, subGrade, tags, setterId, holds,
    openedAt: iso(now - openedDaysAgo * DAY), closesAt,
  });

  const boulders = [
    b('b1', 'p1', 'welle', 'blue', 2, ['Volumes', 'Coordination'], 'u_lena', 17, [
      ell('start', 225, 1230, 85, 48, -5), ell('hold', 95, 1050, 58, 45, -15), ell('hold', 165, 978, 10, 10),
      ell('hold', 180, 742, 35, 55, -10), ell('top', 125, 690, 38, 55, -5)]),
    b('b2', 'p1', 'welle', 'yellow', 3, ['Slopers', 'Volumes'], 'u_max', 17, [
      ell('start', 328, 1133, 24, 24), ell('hold', 233, 805, 30, 38), ell('hold', 600, 812, 26, 20),
      ell('hold', 458, 572, 33, 30), ell('top', 680, 445, 55, 28, 8)]),
    b('b3', 'p1', 'welle', 'red', 3, ['Crimps', 'Balance'], 'u_lena', 17, [
      ell('start', 520, 1243, 32, 15), ell('start', 430, 1147, 15, 10), ell('hold', 480, 968, 30, 28),
      ell('hold', 345, 795, 12, 16), ell('hold', 175, 833, 15, 12), ell('top', 205, 527, 26, 18)]),
    b('b4', 'p1', 'welle', 'black', 2, ['Volumes', 'Compression'], 'u_max', 17, [
      ell('start', 318, 950, 30, 125, 8), ell('hold', 562, 888, 26, 18), ell('hold', 482, 770, 10, 10),
      ell('top', 335, 668, 25, 100, 10)]),
    b('b5', 'p1', 'welle', 'green', 4, ['Slopers'], 'u_lena', 17, [
      ell('start', 715, 1060, 45, 55), ell('hold', 675, 720, 26, 90, 12), ell('top', 588, 468, 25, 78, 25)]),
    b('b6', 'p2', 'welle', 'green', 2, ['Volumes'], 'u_max', 3, [
      ell('start', 190, 1205, 45, 65, -15), ell('hold', 250, 845, 48, 75, 15), ell('hold', 210, 655, 45, 60, 10),
      ell('top', 150, 527, 38, 28, -15)]),
    b('b7', 'p2', 'welle', 'white', 2, ['Balance', 'Heel hook'], 'u_lena', 3, [
      ell('start', 340, 1252, 22, 10), ell('start', 285, 1073, 16, 15), ell('hold', 380, 1075, 16, 22),
      ell('hold', 545, 982, 12, 11), ell('top', 395, 945, 15, 12)]),
    b('b8', 'p2', 'welle', 'pink', 1, ['Crimps', 'Dyno'], 'u_max', 3, [
      ell('start', 612, 860, 7, 7), ell('start', 540, 857, 7, 7), ell('hold', 458, 840, 7, 7),
      ell('hold', 607, 640, 12, 20), ell('top', 452, 545, 55, 38)]),
    b('b9', 'p2', 'welle', 'red', 4, ['Compression'], 'u_lena', 3, [
      ell('start', 405, 905, 75, 30, 28), ell('hold', 470, 630, 18, 15), ell('hold', 430, 710, 18, 15),
      ell('top', 715, 575, 24, 45)]),
    b('b10', 'p2', 'welle', 'blue', 3, ['Pinches'], 'u_max', 3, [
      ell('start', 130, 1010, 65, 32, -20), ell('hold', 45, 925, 14, 16), ell('hold', 140, 742, 20, 15),
      ell('top', 25, 520, 22, 14)]),
  ];

  const colorIndex = (id) => COLORS.findIndex((c) => c.id === id);
  const sends = [];
  const votes = [];
  const likes = [];
  users.filter((u) => u.role === 'climber').forEach((u) => {
    boulders.forEach((bl) => {
      const ci = colorIndex(bl.color);
      if (rand() > 0.95 - ci * 0.13) return;
      sends.push({ userId: u.id, boulderId: bl.id, date: now - Math.floor(rand() * 3) * DAY, flash: rand() < 0.25 });
      if (rand() < 0.7) {
        // Climbers tend to find b9 harder than graded, to showcase setter feedback.
        const bias = bl.id === 'b9' ? 2 : 0;
        const subGrade = Math.max(1, Math.min(5, bl.subGrade + bias + Math.round(rand() * 2 - 1)));
        votes.push({ userId: u.id, boulderId: bl.id, subGrade });
      }
      if (rand() < 0.3) likes.push({ userId: u.id, boulderId: bl.id });
    });
  });

  const comments = [
    { id: 'c1', userId: 'u_sam', boulderId: 'b3', text: 'Heel hook on the left volume makes the crux much easier.', date: now - 5 * DAY },
    { id: 'c2', userId: 'u_mia', boulderId: 'b8', text: 'Dyno or static with a high left foot, both work.', date: now - 2 * DAY },
    { id: 'c3', userId: 'u_alex', boulderId: 'b8', text: 'Static is way harder than it looks!', date: now - DAY },
  ];

  return { version: 3, lang: 'en', currentUserId: null, users, wallPhotos, boulders, sends, votes, likes, comments };
}
