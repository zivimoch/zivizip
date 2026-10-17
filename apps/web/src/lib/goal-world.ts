/** Deterministic, bounded island scenery. One contribution is one construction step. */
export const ISLAND_CAPACITY = 32;
export const REGION_CAPACITY = ISLAND_CAPACITY * 7;
function random(seed: string) {
  let value = 2166136261;
  for (const char of seed)
    value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return () => {
    value += 0x6d2b79f5;
    let n = Math.imul(value ^ (value >>> 15), 1 | value);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
export function goalWorld(
  seed: string,
  count: number,
  requestedRegion?: number,
) {
  const points = Number.isSafeInteger(count) && count > 0 ? count : 0;
  const latestRegion = Math.floor(Math.max(0, points - 1) / REGION_CAPACITY);
  const region =
    requestedRegion !== undefined && Number.isSafeInteger(requestedRegion)
      ? Math.max(0, Math.min(latestRegion, requestedRegion))
      : latestRegion;
  const local =
    region < latestRegion
      ? REGION_CAPACITY
      : points
        ? ((points - 1) % REGION_CAPACITY) + 1
        : 0;
  const rng = random(seed);
  const palettes = [
    ['#78b995', '#417c70', '#eed4a2', '#de896b'],
    ['#a9be89', '#567b69', '#e8d8b2', '#8caad1'],
    ['#88b9ad', '#426e73', '#e1ccb0', '#d59ca8'],
    ['#a7bf75', '#647e58', '#eedca6', '#e6af68'],
  ];
  const palette = palettes[Math.floor(rng() * palettes.length)];
  const angle = rng() * Math.PI * 2;
  const islands = Array.from(
    { length: Math.ceil(local / ISLAND_CAPACITY) },
    (_, i) => {
      const roll = random(`${seed}:${region}:${i}`);
      const steps = Math.min(ISLAND_CAPACITY, local - i * ISLAND_CAPACITY);
      const theta = angle + ((i - 1) * Math.PI) / 3;
      const x = i ? 160 + Math.cos(theta) * 100 : 160;
      const y = i ? 104 + Math.sin(theta) * 35 : 104;
      const outline = Array.from({ length: 12 }, (_, j) => {
        const a = (j * Math.PI) / 6;
        const r = 30 + roll() * 12;
        return `${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r * 0.48).toFixed(2)}`;
      }).join(' ');
      const objects = Array.from({ length: steps }, (_, j) => {
        const a = roll() * Math.PI * 2,
          radius = Math.sqrt(roll()) * 24;
        return {
          x: Math.cos(a) * radius,
          y: Math.sin(a) * radius * 0.42,
          kind: j < 3 || roll() < 0.48 ? 'tree' : 'house',
          height: 5 + roll() * 6,
          accent: roll() < 0.5,
          order: j,
        };
      }).sort((a, b) => a.y - b.y);
      return { id: `${region}-${i}`, x, y, outline, objects, steps };
    },
  );
  return {
    points,
    region,
    latestRegion,
    palette,
    islands,
    active: islands.at(-1),
  };
}
