<script lang="ts">
  import Icon from './Icon.svelte';
  export let item: { key: string; title: string; detail: string; type: string };
  export let source = '';
  export let disabled = false;
  export let language: 'en' | 'id' = 'en';
  export let onstart: (key: string, source: string) => void;
  export let onend: () => void;
  export let ontouch: (e: PointerEvent, key: string, source: string) => void;
  export let onkeyboard: (
    e: KeyboardEvent,
    key: string,
    source: string,
  ) => void;
</script>

<div
  class="goal-item"
  class:compact={!!source}
  draggable={!disabled}
  tabindex={disabled ? -1 : 0}
  role="button"
  aria-roledescription={language === 'id'
    ? 'Item yang dapat diseret'
    : 'Draggable item'}
  aria-disabled={disabled}
  aria-label={item.title}
  title={item.title}
  data-item-key={item.key}
  ondragstart={(e) => {
    onstart(item.key, source);
    e.dataTransfer?.setData('application/x-zivizip-goal', item.key);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copyMove';
  }}
  ondragend={onend}
  onkeydown={(e) => onkeyboard(e, item.key, source)}
  oncontextmenu={(e) => e.preventDefault()}
>
  <span
    class="drag-handle"
    aria-hidden="true"
    onpointerdown={(e) => ontouch(e, item.key, source)}
    ><Icon name="grip" /></span
  >
  <small
    >{item.type === 'task'
      ? 'To do'
      : language === 'id'
        ? 'Keuangan'
        : 'Finance'}</small
  ><strong>{item.title}</strong><span>{item.detail}</span>
</div>

<style>
  .goal-item {
    position: relative;
    background: #17292e;
    border: 1px solid #30464b;
    border-radius: 10px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 7px;
    cursor: grab;
    min-width: 0;
    user-select: none;
    -webkit-touch-callout: none;
    flex: 0 0 210px;
    scroll-snap-align: start;
    touch-action: pan-x pan-y;
  }
  .drag-handle {
    display: none;
  }
  @media (any-pointer: coarse) {
    .goal-item,
    .goal-item.compact {
      padding-right: 52px;
    }
    .goal-item .drag-handle {
      display: flex;
      align-items: center;
      justify-content: center;
      position: absolute;
      right: 0;
      top: 0;
      bottom: 0;
      width: 44px;
      min-height: 44px;
      max-width: none;
      touch-action: none;
      color: var(--accent);
      border-left: 1px solid #30464b;
      cursor: grab;
    }
  }
  .goal-item:active {
    cursor: grabbing;
  }
  .goal-item:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .goal-item strong {
    display: block;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
    max-width: 100%;
    font-size: 14px;
  }
  .goal-item small,
  .goal-item span {
    font-size: 11px;
    color: #dbe8e9;
  }
  .compact {
    padding: 9px 11px;
    flex: none;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px 8px;
  }
  .compact small {
    grid-column: 1;
  }
  .compact strong {
    grid-row: 2;
    grid-column: 1;
  }
  .compact span {
    grid-column: 2;
    grid-row: 1/3;
    align-self: center;
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10px;
  }
</style>
