<script lang="ts">
  import { onMount, tick } from 'svelte';
  export let id: string;
  export let label: string;
  export let value = '';
  export let options: string[] = [];
  export let disabled = false;
  export let required = false;
  export let maxlength = 150;
  export let placeholder = '';
  export let input: HTMLInputElement = undefined!;
  let menu: HTMLDivElement;
  let open = false;
  let active = -1;
  $: filtered = [...new Set(options)]
    .filter((option) =>
      option.toLocaleLowerCase().includes(value.trim().toLocaleLowerCase()),
    )
    .slice(0, 60);
  function position() {
    const rect = input.getBoundingClientRect();
    const below = innerHeight - rect.bottom - 8;
    const above = rect.top - 8;
    const upwards = below < 160 && above > below;
    menu.style.width = `${rect.width}px`;
    menu.style.left = `${rect.left}px`;
    menu.style.maxHeight = `${Math.max(0, Math.min(240, upwards ? above : below))}px`;
    menu.style.top = upwards ? 'auto' : `${rect.bottom + 4}px`;
    menu.style.bottom = upwards ? `${innerHeight - rect.top + 4}px` : 'auto';
  }
  function close() {
    menu?.hidePopover();
    open = false;
    active = -1;
  }
  async function show() {
    if (disabled) return;
    await tick();
    if (!filtered.length) {
      close();
      return;
    }
    active = -1;
    position();
    menu.showPopover();
    open = true;
  }
  function choose(option: string) {
    value = option;
    close();
    input.focus();
  }
  function key(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        void show();
        return;
      }
      active =
        (active + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) %
        filtered.length;
      menu.children[active]?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && open && active >= 0) {
      event.preventDefault();
      choose(filtered[active]);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'Tab') close();
  }
  onMount(() => {
    const reposition = () => {
      if (open) position();
    };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  });
</script>

<input
  bind:this={input}
  bind:value
  {id}
  {disabled}
  {required}
  {maxlength}
  {placeholder}
  aria-label={label}
  role="combobox"
  aria-autocomplete="list"
  aria-expanded={open}
  aria-controls={`${id}-options`}
  aria-activedescendant={open && active >= 0
    ? `${id}-option-${active}`
    : undefined}
  autocomplete="off"
  onclick={show}
  oninput={show}
  onkeydown={key}
  onblur={close}
/>
<div
  bind:this={menu}
  id={`${id}-options`}
  popover="manual"
  role="listbox"
  aria-label={`${label} options`}
  class="suggestion-menu"
>
  {#each filtered as option, index}<button
      type="button"
      role="option"
      id={`${id}-option-${index}`}
      aria-selected={active === index}
      tabindex="-1"
      onpointerdown={(event) => event.preventDefault()}
      onclick={() => choose(option)}>{option}</button
    >{/each}
</div>

<style>
  input {
    width: 100%;
    min-width: 0;
  }
  .suggestion-menu {
    position: fixed;
    inset: auto;
    margin: 0;
    padding: 4px;
    box-sizing: border-box;
    overflow-y: auto;
    border: 1px solid var(--accent);
    border-radius: 6px;
    background: #142025;
    color: #eef5f7;
    box-shadow: 0 8px 24px #0006;
  }
  button {
    display: block;
    width: 100%;
    text-align: left;
    padding: 9px 10px;
    border: 0;
    background: transparent;
    color: inherit;
    overflow-wrap: anywhere;
    border-radius: 3px;
  }
  button:hover,
  button[aria-selected='true'] {
    background: #20424b;
  }
</style>
