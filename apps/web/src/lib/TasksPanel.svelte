<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Icon from './Icon.svelte';
  import {
    TasksRepository,
    emptyTasks,
    visibleTasks,
    moveTasks,
    type Task,
  } from './tasks';
  export let repository: TasksRepository;
  export let writable: boolean;
  export let language: 'en' | 'id';
  export let refreshToken = 0;
  export let onbusy: (value: boolean) => void = () => {};
  let state = emptyTasks(),
    initialized = false,
    busy = false,
    archived = false,
    message = '';
  let selected = new Set<string>();
  let deleteIds: string[] = [];
  let panel: HTMLElement,
    list: HTMLDivElement,
    modal: HTMLDialogElement,
    titleInput: HTMLInputElement;
  let editing: string | null = null,
    title = '',
    date = '',
    amount = '',
    deleting = false,
    formOpen = false;
  let draftOrder: Task[] | null = null;
  let drag: {
    id: string;
    pointer: number;
    x: number;
    y: number;
    moving: boolean;
  } | null = null;
  let lastTap = { id: '', time: 0 },
    suppressDouble = false;
  let alive = true;
  let reading = false,
    readEpoch = 0;
  let listDropReady = false,
    listDropOver = false;
  let seenRefresh = refreshToken;
  $: t =
    language === 'en'
      ? (en: string, _id: string) => en
      : (_en: string, id: string) => id;
  $: active = state.items.filter((task) => !task.archived);
  $: done = active.filter((task) => task.done).length;
  $: percent = active.length ? Math.round((done / active.length) * 100) : 0;
  $: rows = visibleTasks(draftOrder || state.items, archived);
  $: if (initialized && refreshToken !== seenRefresh) {
    seenRefresh = refreshToken;
    void refresh();
  }
  function setBusy(value: boolean) {
    busy = value;
    onbusy(value);
  }
  async function refresh(force = false) {
    if (busy || reading || drag || (formOpen && !force) || !alive) return;
    const initial = !initialized,
      revision = state.revision,
      target = repository,
      epoch = ++readEpoch;
    reading = true;
    if (initial) setBusy(true);
    try {
      const next = await target.list(writable);
      if (
        alive &&
        epoch === readEpoch &&
        target === repository &&
        !drag &&
        (!formOpen || force) &&
        revision === state.revision
      ) {
        if (initial || next.revision !== state.revision) {
          state = next;
          selected = new Set(
            [...selected].filter((id) => next.items.some((t) => t.id === id)),
          );
        }
        message = '';
      }
    } catch (error) {
      if (alive && epoch === readEpoch && target === repository)
        message = (error as Error).message;
    } finally {
      reading = false;
      if (alive) {
        initialized = true;
        if (initial) setBusy(false);
      }
    }
  }
  async function commit(items: Task[]) {
    if (!writable || busy || !initialized) return false;
    readEpoch++;
    setBusy(true);
    message = '';
    try {
      const saved = await repository.write(state, items);
      if (alive) {
        state = saved;
        broadcast();
      }
      return true;
    } catch (error) {
      if (alive) message = (error as Error).message;
      return false;
    } finally {
      if (alive) setBusy(false);
    }
  }
  async function open(task?: Task) {
    if (!writable || busy) return;
    lastTap = { id: '', time: 0 };
    readEpoch++;
    editing = task?.id || null;
    title = task?.title || '';
    date = task?.date || '';
    amount = task?.amount ? String(task.amount) : '';
    deleting = false;
    formOpen = true;
    message = '';
    modal.showModal();
    await tick();
    titleInput.focus();
  }
  function close() {
    lastTap = { id: '', time: 0 };
    modal.close();
    formOpen = false;
    deleting = false;
    deleteIds = [];
    void refresh();
  }
  async function submit() {
    if (!title.trim()) return;
    if (editing && !state.items.some((task) => task.id === editing)) {
      message = t(
        'This task was removed elsewhere. Copy your changes into a new task.',
        'Tugas ini telah dihapus di tempat lain. Salin perubahan ke tugas baru.',
      );
      return;
    }
    const task: Task = {
      id: editing || crypto.randomUUID(),
      title: title.trim(),
      date,
      amount: Number(amount || 0),
      done: false,
      archived: false,
      createdAt: Date.now(),
    };
    const items = editing
      ? state.items.map((old) =>
          old.id === editing
            ? { ...old, title: task.title, date, amount: task.amount }
            : old,
        )
      : [...state.items, task];
    if (await commit(items)) close();
  }
  async function requestDelete(ids: string[], fromEditor = false) {
    if (!writable || busy) return;
    lastTap = { id: '', time: 0 };
    deleteIds = ids.filter((id) => state.items.some((task) => task.id === id));
    if (!deleteIds.length) return;
    readEpoch++;
    if (!fromEditor) editing = null;
    deleting = true;
    formOpen = true;
    message = '';
    if (!modal.open) modal.showModal();
    await tick();
    modal.querySelector<HTMLButtonElement>('footer button')?.focus();
  }
  function deleteKey(event: KeyboardEvent) {
    if (
      event.key !== 'Delete' ||
      event.repeat ||
      !selected.size ||
      formOpen ||
      !panel.contains(event.target as Node)
    )
      return;
    if (
      (event.target as HTMLElement).closest(
        'input,textarea,select,[contenteditable="true"]',
      )
    )
      return;
    event.preventDefault();
    void requestDelete([...selected]);
  }
  async function toggle(task: Task) {
    if (
      await commit(
        state.items.map((old) =>
          old.id === task.id
            ? {
                ...old,
                done: task.archived ? false : !task.done,
                archived: false,
              }
            : old,
        ),
      )
    )
      selected = new Set();
  }
  async function archiveDone() {
    if (
      await commit(
        state.items.map((task) =>
          task.done ? { ...task, archived: true } : task,
        ),
      )
    )
      selected = new Set();
  }
  function pointerDown(event: PointerEvent, task: Task) {
    if (
      event.button !== 0 ||
      (event.target as Element).closest('button') ||
      busy
    )
      return;
    if (event.shiftKey) {
      event.preventDefault();
      selected = new Set(selected);
      if (selected.has(task.id)) selected.delete(task.id);
      else selected.add(task.id);
      return;
    }
    const already = selected.has(task.id);
    if (!already) selected = new Set([task.id]);
    if (!writable) return;
    if (event.pointerType !== 'touch' || already) event.preventDefault();
    drag = {
      id: task.id,
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moving: false,
    };
    list.setPointerCapture(event.pointerId);
    (event.currentTarget as HTMLElement).focus({ preventScroll: true });
  }
  function pointerMove(event: PointerEvent) {
    if (!drag || drag.pointer !== event.pointerId) return;
    if (
      !drag.moving &&
      Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 7
    )
      return;
    drag.moving = true;
    lastTap = { id: '', time: 0 };
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-task]');
    if (target && list.contains(target)) {
      const item = state.items.find((t) => t.id === target.dataset.task),
        source = state.items.find((t) => t.id === drag!.id);
      if (item && source && item.date === source.date) {
        const box = target.getBoundingClientRect();
        draftOrder = moveTasks(
          draftOrder || state.items,
          selected,
          item.id,
          event.clientY > box.top + box.height / 2,
        );
      }
    }
    const bounds = list.getBoundingClientRect();
    if (event.clientY > bounds.bottom - 35) list.scrollTop += 14;
    if (event.clientY < bounds.top + 35) list.scrollTop -= 14;
  }
  async function pointerUp(event: PointerEvent) {
    if (!drag || drag.pointer !== event.pointerId) return;
    const current = drag,
      order = draftOrder;
    drag = null;
    draftOrder = null;
    if (list.hasPointerCapture(event.pointerId))
      list.releasePointerCapture(event.pointerId);
    if (current.moving) {
      suppressDouble = true;
      if (order) await commit(order);
      setTimeout(() => (suppressDouble = false), 300);
      return;
    }
    const now = performance.now();
    if (lastTap.id === current.id && now - lastTap.time < 400) {
      lastTap = { id: '', time: 0 };
      void open(state.items.find((t) => t.id === current.id));
    } else lastTap = { id: current.id, time: now };
  }
  function cancelDrag() {
    drag = null;
    draftOrder = null;
  }
  function rowKey(event: KeyboardEvent, task: Task) {
    if (event.target !== event.currentTarget) return;
    if (!event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const elements = [...list.querySelectorAll<HTMLElement>('[data-task]')];
      elements[
        elements.indexOf(event.currentTarget as HTMLElement) +
          (event.key === 'ArrowUp' ? -1 : 1)
      ]?.focus();
    }
    if (event.key === 'F2' || event.key === 'Enter') {
      event.preventDefault();
      void open(task);
    }
    if (event.key === ' ') {
      event.preventDefault();
      selected = event.shiftKey ? new Set(selected) : new Set();
      if (selected.has(task.id)) selected.delete(task.id);
      else selected.add(task.id);
    }
    if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const group = rows.filter((t) => t.date === task.date),
        next = group[group.indexOf(task) + (event.key === 'ArrowUp' ? -1 : 1)];
      if (next)
        void commit(
          moveTasks(
            state.items,
            selected.has(task.id) ? selected : new Set([task.id]),
            next.id,
            event.key === 'ArrowDown',
          ),
        );
    }
  }
  async function dropNote(event: DragEvent) {
    clearDropFeedback();
    const raw = event.dataTransfer?.getData('application/x-zivizip-list');
    if (!raw || !writable || busy) return;
    event.preventDefault();
    try {
      const titles = JSON.parse(raw);
      if (
        !Array.isArray(titles) ||
        titles.length > 1000 ||
        titles.some((t) => typeof t !== 'string' || !t.trim() || t.length > 150)
      )
        throw Error('Invalid list items');
      const now = Date.now();
      await commit([
        ...state.items,
        ...titles.map((title) => ({
          id: crypto.randomUUID(),
          title: title.trim(),
          date: '',
          amount: 0,
          done: false,
          archived: false,
          createdAt: now,
        })),
      ]);
    } catch (error) {
      message = (error as Error).message;
    }
  }
  function clearDropFeedback() {
    listDropReady = false;
    listDropOver = false;
  }
  const money = (n: number) =>
    new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(n);
  const dateLabel = (value: string) =>
    new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value + 'T12:00:00'));
  onMount(() => {
    void refresh();
    const changes = new BroadcastChannel(`tasks-${repository.db.name}`);
    changes.onmessage = () => void refresh();
    broadcast = () => changes.postMessage('changed');
    return () => {
      alive = false;
      changes.close();
      onbusy(false);
    };
  });
  let broadcast = () => {};
</script>

<svelte:document
  onkeydown={deleteKey}
  ondragstart={(event) => {
    listDropReady =
      writable &&
      !!event.dataTransfer?.types.includes('application/x-zivizip-list');
  }}
  ondragend={clearDropFeedback}
  ondrop={clearDropFeedback}
  onpointerdown={(event) => {
    if (
      !(event.target instanceof Element) ||
      !event.target.closest('[data-task],.task-delete-selected') ||
      !panel.contains(event.target)
    )
      selected = new Set();
  }}
/>
<section
  class="tasks-panel"
  class:list-drop-ready={listDropReady && writable}
  class:list-drop-over={listDropOver && writable}
  bind:this={panel}
  aria-label="To do"
  ondragover={(e) => {
    if (
      writable &&
      e.dataTransfer?.types.includes('application/x-zivizip-list')
    ) {
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'copy';
      listDropReady = true;
      listDropOver = true;
    }
  }}
  ondragleave={(event) => {
    if (
      !(event.relatedTarget instanceof Node) ||
      !panel.contains(event.relatedTarget)
    )
      listDropOver = false;
  }}
  ondrop={dropNote}
>
  <div class="section-heading">
    <h2>To do<span>.</span></h2>
    <div class="task-actions">
      {#if selected.size}<button
          class="task-delete-selected danger"
          disabled={!writable || busy}
          onclick={() => requestDelete([...selected])}
          aria-label={t(
            `Delete selected tasks (${selected.size})`,
            `Hapus tugas terpilih (${selected.size})`,
          )}
          ><Icon name="trash" /><span
            >{t('Delete', 'Hapus')} ({selected.size})</span
          ></button
        >
      {:else}
        <button
          class="archive-button"
          disabled={!writable || busy || !done}
          onclick={archiveDone}
          ><Icon name="archive" /><span
            >{t('Archive completed', 'Arsipkan selesai')}</span
          ></button
        >{/if}
      <button
        class="task-add"
        aria-label={t('Add task', 'Tambah tugas')}
        disabled={!writable || busy || !initialized}
        onclick={() => open()}><Icon name="plus" /></button
      >
    </div>
  </div>
  <div class="task-progress">
    <span
      >{done}
      {t('of', 'dari')}
      {active.length}
      {t('completed', 'selesai')}</span
    ><span>{percent}%</span>
  </div>
  <div class="progress"><i style:width={`${percent}%`}></i></div>
  {#if message && !formOpen}<div class="task-error" role="alert">
      {message}<button onclick={() => refresh(true)}
        >{t('Reload list', 'Muat ulang daftar')}</button
      >
    </div>{/if}
  <div
    class="task-list"
    bind:this={list}
    role="grid"
    tabindex="-1"
    aria-multiselectable="true"
    aria-label={t('Tasks', 'Tugas')}
    onpointermove={pointerMove}
    onpointerup={pointerUp}
    onpointercancel={cancelDrag}
  >
    {#each rows as task (task.id)}
      <div
        class="task-row"
        class:selected={selected.has(task.id)}
        class:moving={drag?.moving && selected.has(task.id)}
        data-task={task.id}
        role="row"
        aria-selected={selected.has(task.id)}
        tabindex="0"
        onpointerdown={(e) => pointerDown(e, task)}
        ondblclick={(e) => {
          if (
            !suppressDouble &&
            !formOpen &&
            !(e.target as Element).closest('button')
          )
            void open(task);
        }}
        onkeydown={(e) => rowKey(e, task)}
        oncontextmenu={(e) => {
          e.preventDefault();
          selected = new Set(selected);
          if (selected.has(task.id)) selected.delete(task.id);
          else selected.add(task.id);
        }}
      >
        <div role="gridcell">
          <button
            class="task-check"
            class:done={task.done}
            aria-label={`${task.archived ? t('Restore', 'Pulihkan') : task.done ? t('Mark incomplete', 'Tandai belum selesai') : t('Complete', 'Selesaikan')} ${task.title}`}
            aria-pressed={task.done}
            disabled={!writable || busy}
            onclick={() => toggle(task)}
            >{#if task.done}<Icon name="tick" />{/if}</button
          >
        </div>
        <div class="task-copy" role="gridcell">
          <span class="task-title">{task.title}</span>{#if task.date}<div
              class="task-date"
            >
              <Icon name="calendar" /><time datetime={task.date}
                >{dateLabel(task.date)}</time
              >
            </div>{/if}
        </div>
        {#if task.amount}<span class="task-amount" role="gridcell"
            >{money(task.amount)}</span
          >{/if}
      </div>
    {:else}<p class="task-empty">
        {!initialized
          ? t('Loading tasks…', 'Memuat tugas…')
          : archived
            ? t('No archived tasks yet.', 'Belum ada tugas diarsipkan.')
            : t(
                'Space for a new plan. Add a task with +.',
                'Ruang untuk rencana baru. Tambahkan tugas lewat +.',
              )}
      </p>{/each}
  </div>
  <button
    class="task-archive-link"
    onclick={() => {
      archived = !archived;
      selected = new Set();
    }}
    >{archived
      ? t('← Back to active tasks', '← Kembali ke tugas aktif')
      : t(
          `View archive (${state.items.filter((t) => t.archived).length})`,
          `Lihat arsip (${state.items.filter((t) => t.archived).length})`,
        )}</button
  >
</section>
<dialog
  bind:this={modal}
  oncancel={(e) => {
    if (busy) e.preventDefault();
    else formOpen = false;
  }}
>
  <form
    onsubmit={(e) => {
      e.preventDefault();
      if (!deleting) void submit();
    }}
  >
    <div class="dialog-heading">
      <h2>
        {deleting
          ? deleteIds.length > 1
            ? t(
                `Delete ${deleteIds.length} tasks?`,
                `Hapus ${deleteIds.length} tugas?`,
              )
            : t('Delete task?', 'Hapus tugas?')
          : editing
            ? t('Edit task', 'Edit tugas')
            : t('New task', 'Tugas baru')}
      </h2>
      <button
        type="button"
        aria-label={t('Close task dialog', 'Tutup dialog tugas')}
        disabled={busy}
        onclick={close}>×</button
      >
    </div>
    {#if deleting}<p>
        {t(
          deleteIds.length > 1
            ? `These ${deleteIds.length} tasks will be permanently deleted.`
            : 'This task will be permanently deleted.',
          deleteIds.length > 1
            ? `${deleteIds.length} tugas ini akan dihapus permanen.`
            : 'Tugas ini akan dihapus permanen.',
        )}
      </p>
    {:else}<label
        >{t(
          'What would you like to finish?',
          'Apa yang ingin diselesaikan?',
        )}<input
          bind:this={titleInput}
          bind:value={title}
          required
          maxlength="150"
          disabled={busy}
        /></label
      >
      <label
        >{t('Due date (optional)', 'Tanggal jatuh tempo (opsional)')}<input
          type="date"
          bind:value={date}
          disabled={busy}
        /></label
      >
      <label
        >{t(
          'Related amount (IDR, optional)',
          'Nominal terkait (Rp, opsional)',
        )}<input
          type="number"
          min="0"
          max="1000000000000"
          step="1"
          value={amount}
          oninput={(e) => (amount = e.currentTarget.value)}
          disabled={busy}
        /></label
      >
      {#if editing}<button
          class="danger"
          type="button"
          disabled={busy}
          onclick={() => requestDelete([editing!], true)}
          >{t('Delete task', 'Hapus tugas')}</button
        >{/if}
    {/if}
    {#if message}<p role="alert" class="task-error">{message}</p>
      <button type="button" disabled={busy} onclick={() => refresh(true)}
        >{t('Reload list', 'Muat ulang daftar')}</button
      >{/if}
    <footer>
      <button
        type="button"
        disabled={busy}
        onclick={() => (deleting && editing ? (deleting = false) : close())}
        >{t('Cancel', 'Batal')}</button
      >
      {#if deleting}<button
          type="button"
          class="danger"
          disabled={busy}
          onclick={async () => {
            if (
              await commit(state.items.filter((t) => !deleteIds.includes(t.id)))
            ) {
              selected = new Set();
              close();
            }
          }}>{t('Delete', 'Hapus')}</button
        >
      {:else}<button class="primary" type="submit" disabled={busy || !writable}
          >{t('Save', 'Simpan')}</button
        >{/if}
    </footer>
  </form>
</dialog>

<style>
  .tasks-panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
    padding: 25px;
  }
  .list-drop-ready {
    outline: 1px dashed #35636d;
    outline-offset: -3px;
  }
  .list-drop-over {
    background: #00394055;
    outline: 2px dashed var(--accent);
    outline-offset: -3px;
  }
  .task-actions {
    display: flex;
    align-items: center;
    gap: 9px;
  }
  .task-actions button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 8px 10px;
    font-size: 11px;
    white-space: nowrap;
    background: #0c181e;
  }
  .task-actions .task-add {
    width: 32px;
    height: 32px;
    padding: 4px;
  }
  .task-progress {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: #aebcc2;
    margin: 1px 0 9px;
  }
  .archive-button :global(svg) {
    width: 16px;
    height: 16px;
  }
  .section-heading {
    gap: 10px;
    flex-wrap: wrap;
  }
  .progress {
    flex-shrink: 0;
  }
  .task-list {
    flex: 1;
    min-height: 0;
    max-height: none;
    overflow: auto;
    margin-left: -12px;
    padding-left: 12px;
    padding-right: 5px;
  }
  .task-row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 43px;
    padding: 8px 1px;
    border-bottom: 1px solid var(--line);
    cursor: grab;
    touch-action: pan-y;
    user-select: none;
    outline-offset: -2px;
  }
  .task-row::before {
    content: '';
    position: absolute;
    inset: 0 0 0 -12px;
    pointer-events: none;
    border-left: 3px solid transparent;
    z-index: 0;
  }
  .task-row.selected {
    touch-action: none;
  }
  .task-row.selected::before {
    background: #00d8ec12;
    border-color: var(--accent);
  }
  .task-row > :global(*) {
    position: relative;
  }
  .task-row.moving {
    opacity: 0.55;
  }
  .task-copy {
    flex: 1;
    min-width: 0;
  }
  .task-title {
    display: block;
    font-size: 12px;
    line-height: 1.45;
    color: inherit;
    text-decoration: none;
    overflow-wrap: anywhere;
  }
  .task-check {
    width: 22px;
    height: 22px;
    flex-shrink: 0;
    border: 1.5px solid #cad6dc;
    border-radius: 50%;
    padding: 0;
    background: transparent;
    display: grid;
    place-items: center;
  }
  .task-check.done {
    background: #d5c5ff;
    border-color: #d5c5ff;
    color: #17132d;
  }
  .task-check :global(svg) {
    width: 16px;
    height: 16px;
  }
  .task-date {
    display: flex;
    gap: 6px;
    align-items: center;
    color: var(--accent);
    font-size: 12px;
    margin-top: 4px;
  }
  .task-date :global(svg) {
    width: 14px;
    height: 14px;
  }
  .task-amount {
    font-size: 11px;
    white-space: nowrap;
  }
  .task-archive-link {
    align-self: flex-start;
    font-size: 11px;
    color: var(--muted);
    border: 0;
    background: none;
    padding: 14px 0 0;
  }
  .task-empty {
    color: var(--muted);
    font-size: 13px;
    line-height: 1.7;
  }
  .task-error {
    color: #ff9a9e;
    font-size: 12px;
  }
  @media (min-width: 1500px) {
    .task-row {
      min-height: 49px;
    }
    .task-title {
      font-size: 14px;
    }
    .task-amount {
      font-size: 13px;
    }
  }
  @media (max-width: 760px) {
    .task-row {
      min-height: 66px;
    }
    .task-title {
      font-size: 14px;
    }
    .task-check {
      width: 25px;
      height: 25px;
    }
    .task-progress {
      font-size: 13px;
      margin: 10px 0;
    }
    .progress {
      height: 8px;
    }
  }
  @media (max-width: 450px) {
    .tasks-panel {
      padding: 20px;
    }
    .task-actions button {
      font-size: 10px;
      gap: 4px;
      padding-inline: 6px;
    }
  }
</style>
