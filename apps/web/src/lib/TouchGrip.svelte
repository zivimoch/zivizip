<script lang="ts">
  import Icon from './Icon.svelte';
  export let label: string;
  export let disabled = false;
  export let onpointerdown: (event: PointerEvent) => void = () => {};
  export let ontouchstart: (event: TouchEvent) => void = () => {};
</script>

<button
  type="button"
  class="touch-grip"
  data-touch-grip
  aria-label={label}
  {disabled}
  {onpointerdown}
  {ontouchstart}
  onclick={(event) => event.stopPropagation()}><Icon name="grip" /></button
>

<style>
  .touch-grip {
    display: none;
  }
  @media (pointer: coarse), (max-width: 800px) {
    .touch-grip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 44px;
      width: 44px;
      height: 44px;
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--muted);
      touch-action: none;
      cursor: grab;
    }
  }
</style>
