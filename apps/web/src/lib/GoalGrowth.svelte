<script lang="ts">
  export let count = 0;
  export let language: 'en' | 'id' = 'en';
  $: stage =
    count === 0 ? 0 : count < 3 ? 1 : count < 8 ? 2 : count < 20 ? 3 : 4;
  $: label = (
    language === 'id'
      ? ['Benih', 'Bertunas', 'Bertumbuh', 'Rimbun', 'Berbunga']
      : ['Seed', 'Sprouting', 'Growing', 'Flourishing', 'Blooming']
  )[stage];
  $: branches = Array.from(
    { length: Math.min(14, Math.ceil(Math.sqrt(count) * 2)) },
    (_, i) => ({
      x: 160 + (i % 2 ? -1 : 1) * (22 + (i % 3) * 10),
      y: 112 - i * 5.1,
      r: 10 + Math.min(9, count / 5),
    }),
  );
</script>

<div class="garden" data-growth={stage}>
  <svg
    viewBox="0 0 320 160"
    role="img"
    aria-label={`${label} · ${count} ${language === 'id' ? 'kontribusi' : 'contributions'}`}
  >
    <circle cx="263" cy="35" r="20" fill="#f7d38b" opacity=".85" />
    <path d="M0 139 Q70 113 144 137 T320 129 V160 H0Z" fill="#143f3b" />
    <path d="M0 150 Q70 134 167 146 T320 140 V160 H0Z" fill="#1e5650" />
    {#if count === 0}<ellipse cx="160" cy="137" rx="6" ry="4" fill="#c8a06d" />
    {:else}
      <path
        d={`M160 140 Q156 105 160 ${Math.max(38, 121 - Math.log2(count + 1) * 17)}`}
        stroke="#b2c493"
        stroke-width={Math.min(7, 2 + count / 8)}
        fill="none"
        stroke-linecap="round"
      />
      {#each branches as branch, i}<g
          class="leaf"
          style={`--delay:${i * 24}ms`}
        >
          <path
            d={`M160 ${branch.y + 12} Q${branch.x} ${branch.y + 8} ${branch.x} ${branch.y}`}
            stroke="#91b88c"
            stroke-width="2"
            fill="none"
          />
          <ellipse
            cx={branch.x}
            cy={branch.y}
            rx={branch.r}
            ry={branch.r * 0.6}
            transform={`rotate(${i % 2 ? 30 : -30} ${branch.x} ${branch.y})`}
            fill={i % 3 === 0 ? '#55cf9e' : i % 3 === 1 ? '#37a890' : '#86d8a2'}
          />
          {#if stage === 4 && i % 3 === 0}<circle
              cx={branch.x + 4}
              cy={branch.y - 4}
              r="4"
              fill="#f9d78e"
            />{/if}
        </g>{/each}
    {/if}
    <path
      d="M47 141l-3-11m3 11 5-8 M274 143l4-12m-4 12-5-7"
      stroke="#559a79"
      stroke-width="2"
      fill="none"
    />
  </svg>
  <span
    >{label}<small
      >{count} {language === 'id' ? 'kontribusi' : 'contributions'}</small
    ></span
  >
</div>

<style>
  .garden {
    height: 160px;
    position: relative;
    background: linear-gradient(130deg, #123139, #0e2229);
    overflow: hidden;
  }
  .garden svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  .garden > span {
    position: absolute;
    left: 16px;
    top: 13px;
    font-size: 12px;
    color: #e5f5e9;
    font-weight: 600;
  }
  .garden small {
    display: block;
    margin-top: 4px;
    font-size: 10px;
    font-weight: 400;
  }
  .leaf {
    transform-origin: center;
    animation: grow 0.35s ease-out both;
    animation-delay: var(--delay);
  }
  @keyframes grow {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .leaf {
      animation: none;
    }
  }
</style>
