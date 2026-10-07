<script lang="ts">
  export let name = 'note';
  const paths: Record<string, string> = {
    download: 'M12 3v12m-5-5 5 5 5-5 M4 16v5h16v-5',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12 M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    'eye-off':
      'm3 3 18 18 M10 5a12 12 0 0 1 12 7s-1 2-3 4 M6 6a20 20 0 0 0-4 6s4 7 10 7c2 0 4-1 5-2 M10 10a3 3 0 0 0 4 4',
    list: 'M8 5h13M8 12h13M8 19h13M3 5h1M3 12h1M3 19h1',
    trash: 'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
    archive: 'M3 3h18v4H3z M5 7v14h14V7 M9 11h6',
    calendar: 'M5 4h14v17H5z M5 9h14 M8 2v4 M16 2v4',
    tick: 'm5 12 4 4 10-10',
    account: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 22v-3a8 8 0 0 1 16 0v3',
    home: 'M3 10 12 3l9 7v11h-6v-7H9v7H3z',
    layers: 'm12 3 10 5-10 5L2 8z M2 12l10 5 10-5 M2 16l10 5 10-5',
    draw: 'M4 20l2-6L17 3l4 4L10 18z',
    note: 'M14 2H5v20h14V7z M14 2v6h5 M8 12h8 M8 16h8',
    tasks: 'M4 3h16v18H4z m3 9 3 3 7-7',
    finance: 'M3 14h4v8H3z M10 8h4v14h-4z M17 2h4v20h-4z',
    goals:
      'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0 M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
    settings:
      'M9 3h6l1 4 4 1v6l-4 2-1 5H9l-1-5-4-2V8l4-1z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
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
