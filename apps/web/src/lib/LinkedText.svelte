<script lang="ts">
  import { linkParts } from './links';
  export let text: string;
</script>

{#each linkParts(text) as part}{#if part.href}<a
      class="content-link"
      href={part.href}
      target="_blank"
      rel="noopener noreferrer"
      onclick={(event) => event.stopPropagation()}
      ondblclick={(event) => event.stopPropagation()}
      onpointerdown={(event) => event.stopPropagation()}>{part.text}</a
    >{:else}{part.text}{/if}{/each}
