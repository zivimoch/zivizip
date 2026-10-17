<script lang="ts">
  import { worldScene, sample, type WorldTheme } from './world-dna';
  export let seed = '';
  export let theme: WorldTheme = 'island';
  export let count = 0;
  export let completed = false;
  export let detail: 'card' | 'detail' = 'card';
  export let region: number | undefined = undefined;
  export let language: 'en' | 'id' = 'en';
  let width = 320;
  $: world = worldScene(seed, theme, count, region, detail, width);
  $: genes = world.genes;
  $: ground =
    genes.climate === 'snow'
      ? `hsl(${195 + genes.lean} 35% 86%)`
      : genes.climate === 'desert'
        ? `hsl(${35 + genes.lean} 55% 68%)`
        : genes.climate === 'spring'
          ? `hsl(${100 + genes.lean * 2} 38% 65%)`
          : `hsl(${140 + genes.lean * 2} 30% 56%)`;
  $: flower =
    genes.plant === 'sunflower'
      ? '#f4ce56'
      : genes.plant === 'rafflesia'
        ? '#c6535c'
        : genes.accent;
  $: dnaLabel =
    language === 'en'
      ? theme === 'garden'
        ? genes.plant
        : theme === 'island'
          ? genes.climate
          : 'Cosmos'
      : theme === 'garden'
        ? {
            durian: 'Durian',
            sunflower: 'Bunga matahari',
            rafflesia: 'Rafflesia',
            strawberry: 'Stroberi',
            orange: 'Jeruk',
            watermelon: 'Semangka',
          }[genes.plant]
        : theme === 'island'
          ? {
              tropical: 'Tropis',
              snow: 'Salju',
              spring: 'Musim semi',
              desert: 'Gurun',
            }[genes.climate]
          : 'Kosmos';
  $: tree = genes.plant === 'durian' || genes.plant === 'orange';
  $: vines = genes.plant === 'strawberry' || genes.plant === 'watermelon';
</script>

<div
  class="scene"
  bind:clientWidth={width}
  data-theme={theme}
  data-climate={genes.climate}
  data-detail={detail}
  style={`--accent:${genes.accent}`}
>
  <svg
    viewBox="0 0 320 160"
    role="img"
    aria-label={`${theme} · ${count} ${language === 'id' ? 'kontribusi' : 'contributions'}`}
  >
    {#if theme === 'island'}
      <path
        d="M15 90q25-7 46 0m174-27q28-7 55 0M30 140q30-9 60 0"
        stroke="#4a8491"
        opacity=".4"
        fill="none"
      />
      {#each world.islands as land, i}
        <g
          transform={`translate(${land.x} ${land.y}) scale(${i === 0 ? 1.65 : 0.8})`}
        >
          <polygon
            points={land.outline}
            transform="translate(0 5)"
            fill="#426970"
          />
          <polygon points={land.outline} fill="#e4d0a7" /><polygon
            points={land.outline}
            transform="scale(.88)"
            fill={ground}
          />
          <path
            d="M-10 0 2-20 16 0Z"
            fill={genes.climate === 'snow' ? '#f4f4ee' : '#699180'}
            opacity=".8"
          />
        </g>{/each}
      {#each world.objects as obj (obj.id)}
        {@const land = world.islands[Math.floor(obj.id / 64)]}
        <!-- Terrain-local placement keeps construction on land at every detail level. -->
        <g
          class="object"
          transform={`translate(${land.x + (obj.x - 160) * (obj.id < 64 ? 0.27 : 0.13)} ${land.y + (obj.y - 100) * (obj.id < 64 ? 0.29 : 0.13)})`}
        >
          {#if obj.kind < 2}
            {#if genes.climate === 'desert'}<path
                d="M0 1v-12m0 7h-4v-4m4 6h4v-6"
                fill="none"
                stroke="#568c70"
                stroke-width="2"
              />
            {:else}<path
                d={`M-4 0 0 ${-obj.size - 5} 4 0Z`}
                fill={genes.climate === 'snow'
                  ? '#f3f7ed'
                  : obj.tone > 0.5
                    ? '#336d60'
                    : '#58866a'}
              />{/if}
          {:else}<path
              d={`M-3 0v-${obj.size}h6v${obj.size}Z`}
              fill="#f3e6ce"
            /><path d={`M-4 ${-obj.size}l4-4 4 4Z`} fill={genes.accent} />{/if}
        </g>{/each}
      {#if completed}<g class="landmark" transform="translate(160 85)"
          ><path d="M-6 24-4-8H4L6 24Z" fill="#f6e6c6" /><path
            d="M-8-8 0-17 8-8Z"
            fill={genes.accent}
          /><circle
            cy="-3"
            r="3"
            fill="#f8d56a"
          />{#if genes.landmark === 1}<path
              d="M0-17v-13l12 4-12 4"
              fill={genes.accent}
              stroke="#ead6b3"
            />{:else if genes.landmark === 2}<path
              d="M-13 24V7h26v17M-13 7 0-1 13 7"
              fill="none"
              stroke="#ecdcb7"
              stroke-width="3"
            />{/if}</g
        >{/if}
    {:else if theme === 'garden'}
      <path d="M0 125Q75 90 157 119T320 113V160H0Z" fill="#2c5550" /><ellipse
        cx="160"
        cy="130"
        rx="128"
        ry="24"
        fill={ground}
      />
      {#if world.steps > 5}<ellipse
          cx="64"
          cy="132"
          rx={10 + Math.min(18, Math.log2(world.steps) * 2)}
          ry="7"
          fill="#659dab"
        />{/if}
      {#each world.objects as obj (obj.id)}<g
          class="object"
          transform={`translate(${obj.x} ${123 + (obj.y - 100) * 0.35})`}
        >
          {#if obj.kind === 0}<ellipse
              rx={obj.size * 0.6}
              ry="2"
              fill="#92a59a"
            />
          {:else if obj.kind === 1}<path
              d="M0 0l-3-7 3 4 4-7-2 10"
              fill="#438267"
            />
          {:else}<path d="M0 0v-6" stroke="#3e7657" /><circle
              cy="-7"
              r="2"
              fill={genes.accent}
            />{/if}</g
        >{/each}
      <g
        transform={`translate(${160 + genes.lean} 126) scale(${genes.spread} 1)`}
      >
        {#if !count && !completed}<ellipse
            cy="-2"
            rx="5"
            ry="3"
            fill="#b39a70"
          />{:else if tree}
          <path
            d={`M0 0Q-6-25 0 ${-15 - Math.min(42, Math.log2(count + 1) * 6)}`}
            stroke="#9c805a"
            stroke-width="5"
            fill="none"
          />
          {#each Array.from( { length: Math.min(9, 1 + Math.floor(Math.log2(count + 1))) }, ) as _, i}
            <ellipse
              cx={Math.sin(i * 2.4 + genes.phase) * 20 * genes.spread}
              cy={-18 - i * 5}
              rx={12 + i * 0.6}
              ry="10"
              fill={i % 2 ? '#3e886b' : '#76ae77'}
            />
            {#if count > 8}<circle
                cx={Math.sin(i * 2.4 + genes.phase) * 20 * genes.spread + 5}
                cy={-15 - i * 5}
                r={genes.plant === 'durian' ? 4 : 3}
                fill={genes.plant === 'durian' ? '#adb85c' : '#efa04e'}
              />{/if}
          {/each}
        {:else if vines}
          <path
            d={`M-35 0Q-20-18 0-6T38-3`}
            stroke="#468a63"
            fill="none"
            stroke-width="3"
          />
          {#each Array.from( { length: Math.min(8, 1 + Math.floor(Math.log2(count + 1))) }, ) as _, i}
            <ellipse
              cx={-30 + i * 9}
              cy={-5 - (i % 2) * 7}
              rx="7"
              ry="4"
              fill="#4e9873"
            />
            {#if count > 3}<ellipse
                cx={-26 + i * 9}
                cy={(-i % 2) * 3}
                rx={genes.plant === 'watermelon' ? 7 : 3}
                ry={genes.plant === 'watermelon' ? 5 : 4}
                fill={genes.plant === 'watermelon' ? '#38744e' : '#dd6866'}
              />{/if}
          {/each}
        {:else}
          <g
            transform={`translate(0 ${genes.plant === 'sunflower' ? -22 - Math.min(36, Math.log2(count + 1) * 5) : -9})`}
          >
            {#if genes.plant === 'sunflower'}<path
                d="M0 0v55m0-17q-20-18-18-2m18-12q20-18 18-2"
                fill="#559b6a"
                stroke="#559b6a"
                stroke-width="3"
              />{/if}
            {#each Array.from( { length: genes.plant === 'sunflower' ? 12 : 5 }, ) as _, i}<ellipse
                cy="-11"
                rx={genes.plant === 'rafflesia' ? 10 : 5}
                ry={genes.plant === 'rafflesia' ? 15 : 11}
                transform={`rotate(${(i * 360) / (genes.plant === 'sunflower' ? 12 : 5)})`}
                fill={flower}
              />{/each}
            <circle r="9" fill="#71594a" />
          </g>
        {/if}
        {#if completed}<g class="landmark" transform="translate(42 -10)"
            ><path d="M-9 6v-15h18V6Z" fill="#f0cf76" /><path
              d="M-12-9 0-18 12-9Z"
              fill={genes.accent}
            /><path
              d="M-5-2l4 4 7-8"
              fill="none"
              stroke="#426954"
              stroke-width="2"
            /></g
          >{/if}
      </g>
    {:else}
      {#each world.objects as obj (obj.id)}<circle
          class="object"
          cx={obj.x}
          cy={obj.y - 25}
          r={obj.kind === 0 ? 1.3 : 0.7}
          fill={obj.tone > 0.5 ? '#cde6ef' : genes.accent}
        />{/each}
      <ellipse
        cx="160"
        cy="106"
        rx="113"
        ry="29"
        stroke="#7594b1"
        stroke-width=".5"
        fill="none"
        opacity=".5"
      />
      <g transform={`translate(160 99) rotate(${genes.lean * 3})`}
        ><circle
          r={20 + Math.min(15, Math.log2(count + 1) * 2)}
          fill={genes.accent}
        /><path
          d="M-24-5Q0-22 25-4M-27 7Q0-6 27 9"
          stroke="#fff"
          opacity=".18"
          stroke-width="5"
          fill="none"
        /><ellipse
          rx="48"
          ry="11"
          transform="rotate(-22)"
          stroke="#e1c6af"
          stroke-width="3"
          fill="none"
        /><path d="M6-25Q35 0 6 25Q48 0 6-25" fill="#152a47" opacity=".25" /></g
      >
      {#each Array.from( { length: Math.min(6, Math.floor(Math.log2(count + 1))) }, ) as _, i}<circle
          cx={45 + sample(seed, 'moon-x-' + i) * 230}
          cy={65 + sample(seed, 'moon-y-' + i) * 70}
          r={3 + i * 0.7}
          fill={`hsl(${(genes.hue + i * 43) % 360} 45% 72%)`}
        />{/each}
      {#if completed}<g class="landmark" transform="translate(247 67)"
          ><path
            d="M0-13 4-4 13 0 4 4 0 13-4 4-13 0-4-4Z"
            fill="#f7dfa1"
          /><circle
            r="19"
            fill="none"
            stroke={genes.accent}
            stroke-width="1"
          /></g
        >{/if}
    {/if}
  </svg>
  <span class="dna">{dnaLabel}</span>
</div>

<style>
  .scene {
    height: 100%;
    position: relative;
    background: linear-gradient(145deg, #15333d, #10252c);
    overflow: hidden;
  }
  .scene[data-theme='space'] {
    background: radial-gradient(ellipse at 65% 60%, #2c3558, #111d30 70%);
  }
  svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  .dna {
    position: absolute;
    bottom: 9px;
    left: 14px;
    font-size: 10px;
    text-transform: capitalize;
    color: #e7efea;
  }
  .landmark {
    animation: reveal 0.4s ease-out;
  }
  @keyframes reveal {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .landmark {
      animation: none;
    }
  }
</style>
