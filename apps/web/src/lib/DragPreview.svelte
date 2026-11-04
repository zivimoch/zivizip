<script lang="ts">
  export let x: number;
  export let y: number;
  export let title: string;
  export let detail = '';
</script>

<div
  class="drag-preview"
  style:left={`${x}px`}
  style:top={`${y}px`}
  aria-hidden="true"
>
  <strong>{title}</strong>{#if detail}<small>{detail}</small>{/if}
</div>

<style>
  .drag-preview {
    position: fixed;
    z-index: 10000;
    transform: translate(-50%, -110%);
    width: 220px;
    max-width: 70vw;
    padding: 12px 16px;
    border: 1px solid var(--accent);
    background: #163b40;
    border-radius: 8px;
    pointer-events: none;
    box-shadow: 0 10px 24px #0008;
    font-size: 13px;
  }
  strong,
  small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  small {
    margin-top: 5px;
    font-size: 11px;
  }
</style>
