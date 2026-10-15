export const capitalFirst = (value: string) =>
  /^\s*(https?:\/\/|www\.)/i.test(value)
    ? value
    : value.replace(
        /^(\s*)(\p{L})/u,
        (_, space, letter) => space + letter.toLocaleUpperCase(),
      );

export function capitalizeField(
  node: HTMLInputElement | HTMLTextAreaElement,
  enabled = true,
) {
  const apply = (event: Event) => {
    if (!enabled || (event as InputEvent).isComposing) return;
    const before = node.value,
      next = capitalFirst(before);
    if (before === next) return;
    const start = node.selectionStart,
      end = node.selectionEnd;
    node.value = next;
    if (start !== null && end !== null)
      node.setSelectionRange(
        start + next.length - before.length,
        end + next.length - before.length,
      );
  };
  const composed = (event: Event) => {
    apply(event);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  };
  node.addEventListener('input', apply, true);
  node.addEventListener('compositionend', composed);
  return {
    update(value: boolean) {
      enabled = value;
    },
    destroy() {
      node.removeEventListener('input', apply, true);
      node.removeEventListener('compositionend', composed);
    },
  };
}
