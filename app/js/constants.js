// Shared constants: grades, points, gym layout and badges.

const COLORS = [
  { id: 'green', hex: '#3ccf6e', ink: '#08130c' },
  { id: 'blue', hex: '#3d8bff', ink: '#fff' },
  { id: 'yellow', hex: '#ffd93d', ink: '#1a1500' },
  { id: 'red', hex: '#ff4d4d', ink: '#fff' },
  { id: 'white', hex: '#f4f4f4', ink: '#111' },
  { id: 'black', hex: '#1b1b1b', ink: '#fff' },
  { id: 'pink', hex: '#ff4fb4', ink: '#fff' },
];

// Keep in sync with public.points_for() in supabase/schema.sql.
const COLOR_POINTS = { green: 25, blue: 50, yellow: 100, red: 200, white: 350, black: 600, pink: 1000 };
const TOP_COLOR_GROWTH = 1.7;
const FLASH_BONUS = 0.1;

function pointsFor(color, subGrade) {
  const i = COLORS.findIndex((c) => c.id === color);
  const base = COLOR_POINTS[color];
  const next = i < COLORS.length - 1 ? COLOR_POINTS[COLORS[i + 1].id] : base * TOP_COLOR_GROWTH;
  return Math.round((base * Math.pow(next / base, (subGrade - 1) / 5)) / 5) * 5;
}

function sendPointsFor(color, subGrade, flash) {
  const pts = pointsFor(color, subGrade);
  return flash ? Math.round((pts * (1 + FLASH_BONUS)) / 5) * 5 : pts;
}

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

// Badges are computed from the user's own history; `s` is the summary built in app.js.
const BADGES = [
  { id: 'first', mark: '1', test: (s) => s.total >= 1 },
  { id: 'ten', mark: '10', test: (s) => s.total >= 10 },
  { id: 'fifty', mark: '50', test: (s) => s.total >= 50 },
  { id: 'hundred', mark: '100', test: (s) => s.total >= 100 },
  { id: 'flash', mark: '\u26a1', test: (s) => s.flashes >= 1 },
  { id: 'flash10', mark: '\u26a110', test: (s) => s.flashes >= 10 },
  { id: 'black', mark: '\u25cf', color: '#1b1b1b', test: (s) => s.colors.black > 0 },
  { id: 'pink', mark: '\u25cf', color: '#ff4fb4', test: (s) => s.colors.pink > 0 },
  { id: 'rainbow', mark: '\u25d0', test: (s) => COLORS.every((c) => s.colors[c.id] > 0) },
  { id: 'wall', mark: '\u25a6', test: (s) => s.wallCleared },
  { id: 'beta', mark: '\u270e', test: (s) => s.comments >= 5 },
  { id: 'critic', mark: '\u2605', test: (s) => s.votes >= 20 },
];

const VIDEO_URL_RE = /^https:\/\/([a-z0-9-]+\.)?(youtube\.com|youtu\.be|instagram\.com)\//i;
