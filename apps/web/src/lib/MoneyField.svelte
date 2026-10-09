<script lang="ts">
  import { displayCurrency, formatMoney } from './currency';
  export let value = '';
  export let min = 0;
  export let max = 1_000_000_000_000;
  export let required = false;
  export let disabled = false;
  export let label = '';
  let input: HTMLInputElement;
  const format = (raw: string, currency = $displayCurrency) =>
    raw === '' || raw === '-' ? raw : formatMoney(Number(raw), currency);
  $: display = format(value, $displayCurrency);
  $: if (input)
    input.setCustomValidity(
      value &&
        (!Number.isSafeInteger(Number(value)) ||
          Number(value) < min ||
          Number(value) > max)
        ? `Allowed: ${min} – ${max}`
        : '',
    );
  function edit(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    const digitsBefore = target.value
      .slice(0, target.selectionStart ?? 0)
      .replace(/\D/g, '').length;
    const negative = min < 0 && target.value.includes('-');
    const digits = target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    value = digits ? (negative ? '-' : '') + digits : negative ? '-' : '';
    target.value = format(value);
    let count = 0,
      position = target.value.length;
    for (let i = 0; i < target.value.length; i++)
      if (/\d/.test(target.value[i]) && ++count === digitsBefore) {
        position = i + 1;
        break;
      }
    target.setSelectionRange(position, position);
  }
</script>

<input
  bind:this={input}
  type="text"
  inputmode="numeric"
  value={display}
  oninput={edit}
  {required}
  {disabled}
  aria-label={label || undefined}
  placeholder={formatMoney(0, $displayCurrency)}
  autocomplete="off"
/>

<style>
  input {
    width: 100%;
    min-width: 0;
  }
</style>
