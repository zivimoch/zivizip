<script lang="ts">
  export let name = 'note';
  const paths: Record<string, string> = {
    account: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 22v-3a8 8 0 0 1 16 0v3',
    home: 'M3 10 12 3l9 7v11h-6v-7H9v7H3z',
    layers: 'm12 3 10 5-10 5L2 8z M2 12l10 5 10-5 M2 16l10 5 10-5',
    note: 'M14 2H5v20h14V7z M14 2v6h5 M8 12h8 M8 16h8',
    tasks: 'M4 3h16v18H4z m3 9 3 3 7-7',
    finance: 'M3 14h4v8H3z M10 8h4v14h-4z M17 2h4v20h-4z',
    goals:
      'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    settings:
      'M12 3v3m0 12v3M3 12h3m12 0h3M6 6l2 2m8 8 2 2M6 18l2-2m8-8 2-2M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    bulb: 'M8 17c0-3-3-4-3-8a7 7 0 0 1 14 0c0 4-3 5-3 8z M9 21h6',
    folder: 'M2 5h8l2 3h10v13H2z',
    plus: 'M12 4v16M4 12h16',
    menu: 'M3 5h18M3 12h18M3 19h18',
  };
</script>

<svg viewBox="0 0 24 24" aria-hidden="true"
  ><path d={paths[name] || paths.note} /></svg
>

<style>
  svg {
    width: 21px;
    height: 21px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linejoin: round;
    stroke-linecap: round;
    flex-shrink: 0;
  }
</style>
