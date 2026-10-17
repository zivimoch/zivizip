/** Version 2: addressable scenery. No generated object is stored in a workspace. */
export type WorldTheme = 'island' | 'garden' | 'space';
export const WORLD_CHUNK = 256;
export function sample(seed: string, address: string) {
  let h = 2166136261;
  for (const c of `${seed}:${address}`)
    h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const climates = ['tropical', 'snow', 'spring', 'desert'] as const;
const plants = [
  'durian',
  'sunflower',
  'rafflesia',
  'strawberry',
  'orange',
  'watermelon',
] as const;
export function dna(seed: string) {
  const hue = Math.floor(sample(seed, 'hue') * 360);
  return {
    climate: climates[Math.floor(sample(seed, 'climate') * 4)],
    plant: plants[Math.floor(sample(seed, 'plant') * plants.length)],
    hue,
    phase: sample(seed, 'branch-phase') * Math.PI * 2,
    spread: 0.75 + sample(seed, 'spread') * 0.5,
    lean: (sample(seed, 'lean') - 0.5) * 12,
    accent: `hsl(${hue} 65% 68%)`,
    landmark: Math.floor(sample(seed, 'landmark') * 3),
  };
}
const cache = new Map<string, ReturnType<typeof generate>>();
function generate(
  seed: string,
  theme: WorldTheme,
  count: number,
  chunk: number,
  budget: number,
) {
  const genes = dna(seed);
  const latest = Math.floor(Math.max(0, count - 1) / WORLD_CHUNK);
  const steps =
    chunk < latest ? WORLD_CHUNK : count ? ((count - 1) % WORLD_CHUNK) + 1 : 0;
  const stride =
    2 ** Math.max(0, Math.ceil(Math.log2(Math.max(1, steps) / (budget - 1))));
  const indices = [
    ...new Set([
      ...Array.from(
        { length: Math.floor(steps / stride) },
        (_, i) => i * stride,
      ),
      ...(steps ? [steps - 1] : []),
    ]),
  ];
  // Stable spatial representatives, plus the latest construction step.
  const objects = indices
    .map((index) => {
      const address = `${theme}:${chunk}:${index}`;
      return {
        id: index,
        x: 40 + sample(seed, address + 'x') * 240,
        y: 65 + sample(seed, address + 'y') * 67,
        size: 3 + sample(seed, address + 'size') * 6,
        tone: sample(seed, address + 'tone'),
        kind: Math.floor(sample(seed, address + 'kind') * 4),
      };
    })
    .sort((a, b) => a.y - b.y);
  const islands = Array.from(
    { length: Math.max(1, Math.ceil(steps / 64)) },
    (_, i) => {
      const key = `terrain:${chunk}:${i}`;
      const outline = Array.from({ length: 24 }, (_, j) => {
        const a = (j * Math.PI) / 12,
          r = 24 + sample(seed, key + ':' + j) * 11;
        return `${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r * 0.45).toFixed(2)}`;
      }).join(' ');
      return {
        outline,
        x: i === 0 ? 160 : 60 + (i - 1) * 100,
        y: i === 0 ? 108 : 124,
      };
    },
  );
  return { genes, steps, latest, chunk, objects, islands, count, theme };
}
export function worldScene(
  seed: string,
  theme: WorldTheme,
  count: number,
  requested: number | undefined,
  detail: 'card' | 'detail',
  width = 320,
) {
  const total = Number.isSafeInteger(count) && count > 0 ? count : 0;
  const latest = Math.floor(Math.max(0, total - 1) / WORLD_CHUNK);
  const chunk =
    requested !== undefined && Number.isSafeInteger(requested)
      ? Math.max(0, Math.min(latest, requested))
      : latest;
  const budget =
    detail === 'card' ? (width < 400 ? 24 : 40) : width < 600 ? 72 : 128;
  const key = JSON.stringify([seed, theme, total, chunk, budget]);
  let result = cache.get(key);
  if (!result) {
    result = generate(seed, theme, total, chunk, budget);
    cache.set(key, result);
  } else {
    cache.delete(key);
    cache.set(key, result);
  }
  if (cache.size > 32) cache.delete(cache.keys().next().value!);
  return result;
}
