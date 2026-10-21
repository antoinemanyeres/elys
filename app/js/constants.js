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
  'Crimps', 'Slopers', 'Pinches', 'Pockets', 'Jugs', 'Volumes', 'Dyno', 'Coordination', 'Balance', 'Technical',
  'Slab', 'Overhang', 'Compression', 'Heel hook', 'Toe hook', 'Mantle', 'Endurance',
];

const AREA_COLORS = { main: '#c49a7a', labyrinth: '#5ec8f2', welle: '#f27aa8', board: '#9bd46a', none: '#8b93a7' };

// Sector ids are stored in the database: never rename an existing id, only its display name.
const SECTORS = GYM_MAP.shapes.filter((s) => s.kind === 'sector').map(({ id, name, area, noSet }) => ({ id, name, area, noSet: !!noSet }));
// Boards and the labyrinth are on the map but have no boulders set by the team.
const SET_SECTORS = SECTORS.filter((s) => !s.noSet);

// Badges are computed from the user's own history; `s` is the summary built in app.js.
// `key` + `color` badges share one translated text with the color name as parameter.
const BADGES = [
  { id: 'first', mark: '1', test: (s) => s.total >= 1 },
  { id: 'ten', mark: '10', test: (s) => s.total >= 10 },
  { id: 'fifty', mark: '50', test: (s) => s.total >= 50 },
  { id: 'hundred', mark: '100', test: (s) => s.total >= 100 },
  { id: 'flash', mark: '\u26a1', test: (s) => s.flashes >= 1 },
  { id: 'flash10', mark: '\u26a110', test: (s) => s.flashes >= 10 },
  { id: 'rainbow', mark: '\u25d0', test: (s) => COLORS.every((c) => s.colors[c.id] > 0) },
  { id: 'wall', mark: '\u25a6', test: (s) => s.wallCleared },
  { id: 'beta', mark: '\u270e', test: (s) => s.comments >= 5 },
  { id: 'critic', mark: '\u2605', test: (s) => s.votes >= 20 },
  ...COLORS.map((c) => ({ id: 'send-' + c.id, key: 'color', colorId: c.id, mark: '\u2713', color: c.hex, ink: c.ink, test: (s) => s.colors[c.id] > 0 })),
  ...COLORS.map((c) => ({ id: 'flash-' + c.id, key: 'fcolor', colorId: c.id, mark: '\u26a1', color: c.hex, ink: c.ink, test: (s) => s.flashColors[c.id] > 0 })),
];

const VIDEO_URL_RE = /^https:\/\/([a-z0-9-]+\.)?(youtube\.com|youtu\.be|instagram\.com)\//i;
