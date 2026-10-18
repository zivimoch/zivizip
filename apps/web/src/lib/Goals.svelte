<script lang="ts">
  import { onMount } from 'svelte';
  import { capitalFirst } from './capitalization';
  import Icon from './Icon.svelte';
  import GoalGrowth from './GoalGrowth.svelte';
  import GoalItem from './GoalItem.svelte';
  import {
    GoalsRepository,
    emptyGoals,
    goalTotals,
    goalKeys,
    type Goal,
  } from './goals';
  import type { TasksRepository, Task } from './tasks';
  import type { FinanceRepository, Transaction } from './finance';
  import { displayCurrency, formatMoney } from './currency';
  export let repository: GoalsRepository;
  export let tasksRepository: TasksRepository;
  export let financeRepository: FinanceRepository;
  export let writable = true;
  export let language: 'en' | 'id' = 'en';
  export let refreshToken = 0;
  export let onbusy = (_value: boolean) => {};
  let state = emptyGoals(),
    tasks: Task[] = [],
    transactions: Transaction[] = [];
  let ready = false,
    busy = false,
    error = '',
    hover = '',
    dragging = '',
    dragSource = '';
  let ghostX = 0,
    ghostY = 0,
    touchActive = false;
  let touch: {
    id: number;
    x: number;
    y: number;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  let scrollFrame = 0;
  let pageElement: HTMLElement;
  let dialog: HTMLDialogElement,
    tray: HTMLDialogElement,
    nameField: HTMLInputElement;
  let editing = '',
    title = '',
    description = '',
    cover = '';
  let completed = false;
  let theme: 'island' | 'garden' | 'space' = 'island';
  let generatorVersion: 1 | 2 = 2;
  let editSnapshot = '';
  const t = (en: string, id: string) => (language === 'id' ? id : en);
  $: assignedTasks = new Set(state.items.flatMap((g) => g.tasks));
  $: assignedExpenses = new Set(state.items.flatMap((g) => g.expenses));
  $: allItems = [
    ...tasks
      .filter((task) => task.done)
      .map((task) => ({
        key: 'task:' + task.id,
        id: task.id,
        type: 'task',
        title: task.title,
        detail: t('Completed task', 'Tugas selesai'),
      })),
    ...transactions
      .filter((tx) => tx.type === 'expense')
      .map((tx) => ({
        key: 'expense:' + tx.id,
        id: tx.id,
        type: 'expense',
        title: tx.title || tx.category,
        detail: formatMoney(tx.amount, $displayCurrency),
      })),
  ];
  $: archived = new Set(tasks.filter((t) => t.archived).map((t) => t.id));
  $: hidden = new Set(state.setAside || []);
  $: unlinked = allItems.filter(
    (item) =>
      (item.type !== 'task' || archived.has(item.id)) &&
      !(item.type === 'task' ? assignedTasks : assignedExpenses).has(item.id),
  );
  $: pool = unlinked.filter((item) => !hidden.has(item.key));
  $: setAsideItems = unlinked.filter((item) => hidden.has(item.key));
  $: itemsByKey = new Map(allItems.map((item) => [item.key, item]));
  const linked = (goal: Goal) =>
    goalKeys(goal).flatMap((key) => {
      const item = itemsByKey.get(key);
      return item ? [item] : [];
    });
  async function refresh() {
    if (busy) return;
    try {
      const [g, ts, tx] = await Promise.all([
        repository.list(navigator.onLine),
        tasksRepository.list(navigator.onLine),
        financeRepository.list(navigator.onLine),
      ]);
      if (!busy) {
        if (g.revision >= state.revision) state = g;
        error = '';
        tasks = ts.items;
        transactions = tx.items;
      }
    } catch (e) {
      error = (e as Error).message;
    }
  }
  onMount(() => {
    ready = true;
    const change = () => refresh();
    window.addEventListener('touchmove', moveTouch, { passive: false });
    window.addEventListener('touchend', endTouch);
    window.addEventListener('touchcancel', cancelDrag);
    window.addEventListener('online', change);
    return () => {
      window.removeEventListener('touchmove', moveTouch);
      window.removeEventListener('touchend', endTouch);
      window.removeEventListener('touchcancel', cancelDrag);
      window.removeEventListener('online', change);
      cancelDrag();
    };
  });
  $: if (ready && refreshToken >= 0) void refresh();
  async function commit(items: Goal[], setAside = state.setAside || []) {
    if (!writable || busy) return false;
    busy = true;
    onbusy(true);
    error = '';
    try {
      state = await repository.write(state, items, setAside);
      return true;
    } catch (e) {
      error = (e as Error).message;
      return false;
    } finally {
      busy = false;
      onbusy(false);
    }
  }
  function open(goal?: Goal) {
    editSnapshot = goal ? JSON.stringify(goal) : '';
    error = '';
    editing = goal?.id || '';
    title = goal?.title || '';
    description = goal?.description || '';
    cover = goal?.cover || '';
    completed = goal?.completed || false;
    theme = goal?.theme || 'island';
    generatorVersion = goal ? goal.generatorVersion || 1 : 2;
    dialog.showModal();
    nameField.focus();
  }
  async function save() {
    if (
      editing &&
      JSON.stringify(state.items.find((g) => g.id === editing)) !== editSnapshot
    ) {
      error = t(
        'This goal changed elsewhere. Copy your draft, then reopen it before saving.',
        'Target ini berubah di perangkat lain. Salin drafmu, lalu buka kembali sebelum menyimpan.',
      );
      return;
    }
    const goal = {
      id: editing || crypto.randomUUID(),
      title: title.trim(),
      description: description.trim(),
      cover,
      completed,
      theme,
      generatorVersion,
      order: [],
      seed: crypto.randomUUID(),
      tasks: [],
      expenses: [],
    };
    const items = editing
      ? state.items.map((g) =>
          g.id === editing
            ? {
                ...g,
                title: goal.title,
                description: goal.description,
                cover,
                completed,
                theme,
                generatorVersion,
              }
            : g,
        )
      : [...state.items, goal];
    if (await commit(items)) dialog.close();
  }
  async function remove() {
    if (
      !confirm(
        t(
          'Delete this goal? Tasks and financial transactions will be kept. Items not linked to another goal will return to Unassigned.',
          'Hapus target ini? Tugas dan transaksi keuangan tetap disimpan. Item yang tidak terhubung ke target lain kembali ke Belum ditetapkan.',
        ),
      )
    )
      return;
    if (await commit(state.items.filter((g) => g.id !== editing)))
      dialog.close();
  }
  async function toggleCompleted(goal: Goal) {
    await commit(
      state.items.map((g) =>
        g.id === goal.id ? { ...g, completed: !g.completed } : g,
      ),
    );
  }
  async function clearPool() {
    await commit(state.items, [
      ...new Set([...(state.setAside || []), ...pool.map((item) => item.key)]),
    ]);
  }
  async function restoreItem(key?: string) {
    await commit(
      state.items,
      key ? (state.setAside || []).filter((k) => k !== key) : [],
    );
  }
  function startDrag(key: string, source: string) {
    if (!writable || busy) return;
    dragging = key;
    dragSource = source;
  }
  function cancelDrag() {
    if (touch) clearTimeout(touch.timer);
    touch = null;
    touchActive = false;
    dragging = '';
    dragSource = '';
    hover = '';
    cancelAnimationFrame(scrollFrame);
  }
  async function assign(key: string, target: string, source: string) {
    const item = allItems.find((p) => p.key === key);
    if (!item || !writable || busy) return;
    const field = item.type === 'task' ? 'tasks' : 'expenses';
    if (target === 'pool') {
      if (!source) return;
      await commit(
        state.items.map((g) =>
          g.id === source
            ? {
                ...g,
                [field]: g[field].filter((id) => id !== item.id),
                order: goalKeys(g).filter((k) => k !== key),
              }
            : g,
        ),
      );
    } else {
      const goal = state.items.find((g) => g.id === target);
      if (!goal || goal[field].includes(item.id)) return;
      await commit(
        state.items.map((g) =>
          g.id === target
            ? {
                ...g,
                [field]: [...g[field], item.id],
                order: [key, ...goalKeys(g)],
              }
            : g,
        ),
      );
    }
  }
  function finish(target: string) {
    const key = dragging,
      source = dragSource;
    cancelDrag();
    if (target) void assign(key, target, source);
  }
  function drop(e: DragEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    if (dragging) finish(id);
  }
  function over(e: DragEvent, id: string) {
    if (writable && dragging) {
      e.preventDefault();
      hover = id;
      if (e.dataTransfer)
        e.dataTransfer.dropEffect = id === 'pool' ? 'move' : 'copy';
    }
  }
  function targetAt(x: number, y: number) {
    return (
      document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-goal-drop]')
        ?.dataset.goalDrop || ''
    );
  }
  function autoScroll() {
    if (!dragging || !touchActive) return;
    const el = document.elementFromPoint(ghostX, ghostY);
    const strip = el?.closest<HTMLElement>(
      '.goal-strip,.pool-strip,.linked-items',
    );
    if (strip) {
      const r = strip.getBoundingClientRect();
      if (strip.classList.contains('linked-items'))
        strip.scrollTop +=
          ghostY < r.top + 30 ? -7 : ghostY > r.bottom - 30 ? 7 : 0;
      else
        strip.scrollLeft +=
          ghostX < r.left + 35 ? -8 : ghostX > r.right - 35 ? 8 : 0;
    }
    const r = pageElement.getBoundingClientRect();
    pageElement.scrollTop +=
      ghostY < r.top + 55 ? -10 : ghostY > r.bottom - 55 ? 10 : 0;
    hover = targetAt(ghostX, ghostY);
    scrollFrame = requestAnimationFrame(autoScroll);
  }
  function beginTouch(e: TouchEvent, key: string, source: string) {
    cancelDrag();
    if (e.touches.length !== 1 || !writable || busy) return;
    const point = e.touches[0];
    touch = {
      id: point.identifier,
      x: point.clientX,
      y: point.clientY,
      timer: setTimeout(() => {
        if (!touch) return;
        startDrag(key, source);
        touchActive = true;
        ghostX = touch.x;
        ghostY = touch.y;
        scrollFrame = requestAnimationFrame(autoScroll);
      }, 280),
    };
  }
  function moveTouch(e: TouchEvent) {
    if (!touch) return;
    if (e.touches.length !== 1) {
      cancelDrag();
      return;
    }
    const point = Array.from(e.touches).find((p) => p.identifier === touch?.id);
    if (!point) return;
    if (!touchActive) {
      if (Math.hypot(point.clientX - touch.x, point.clientY - touch.y) > 9)
        cancelDrag();
      return;
    }
    if (e.cancelable) e.preventDefault();
    ghostX = point.clientX;
    ghostY = point.clientY;
    hover = targetAt(ghostX, ghostY);
  }
  function endTouch(e: TouchEvent) {
    if (!touch) return;
    const point = Array.from(e.changedTouches).find(
      (p) => p.identifier === touch?.id,
    );
    if (!point) return;
    if (touchActive) finish(targetAt(point.clientX, point.clientY));
    else cancelDrag();
  }
  function keyboard(e: KeyboardEvent, key: string, source: string) {
    if (e.key === 'Escape') {
      cancelDrag();
      return;
    }
    if ((e.key === ' ' || e.key === 'Enter') && writable && !busy) {
      e.preventDefault();
      startDrag(key, source);
    }
  }
  function targetKey(e: KeyboardEvent, target: string) {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' && dragging) {
      e.preventDefault();
      finish(target);
    } else if (e.key === 'Escape') cancelDrag();
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape') cancelDrag();
  }}
/>
{#if touchActive}<div
    class="drag-ghost"
    style={`left:${ghostX}px;top:${ghostY}px`}
  >
    {allItems.find((i) => i.key === dragging)?.title}
  </div>{/if}
<section
  bind:this={pageElement}
  class="goals-page"
  aria-label={t('Goals', 'Target')}
>
  <header>
    <div>
      <h1>{t('Goals', 'Target')}<span>.</span></h1>
      <p>{t('Make room for what matters.', 'Wujudkan hal yang berarti.')}</p>
    </div>
    <button class="primary" disabled={!writable || busy} onclick={() => open()}
      ><Icon name="plus" />{t('New goal', 'Target baru')}</button
    >
  </header>
  {#if error}<p role="alert">
      {error} <button onclick={refresh}>{t('Reload', 'Muat ulang')}</button>
    </p>{/if}
  <div class="goal-strip">
    {#each state.items as goal (goal.id)}
      {@const totals = goalTotals(goal, tasks, transactions)}
      <!-- Keyboard-focusable drop region supports Space/Tab/Enter drag without nested buttons. -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_no_noninteractive_element_interactions -->
      <article
        class:drop-hover={hover === goal.id}
        class:accepting={!!dragging}
        class="goal-card"
        data-goal-drop={goal.id}
        tabindex="0"
        onkeydown={(e) => targetKey(e, goal.id)}
        aria-label={goal.title}
        role="region"
        ondragover={(e) => over(e, goal.id)}
        ondragleave={() => (hover = '')}
        ondrop={(e) => drop(e, goal.id)}
      >
        <div class="cover">
          <GoalGrowth
            count={linked(goal).length}
            seed={goal.seed || goal.id}
            theme={goal.theme || 'island'}
            generatorVersion={goal.generatorVersion || 1}
            completed={goal.completed || false}
            {language}
            disabled={!writable || busy}
            oncomplete={() => toggleCompleted(goal)}
          /><button
            class="edit"
            aria-label={t('Edit goal', 'Edit target') + ': ' + goal.title}
            disabled={!writable || busy}
            onclick={() => open(goal)}><Icon name="draw" /></button
          >
        </div>
        <div class="goal-body">
          <h2 title={goal.title}>{goal.title}</h2>
          <p class="description" title={goal.description}>{goal.description}</p>
          <div class="totals">
            <div>
              <strong>{totals.tasks}</strong><span
                >{t('Tasks completed', 'Tugas selesai')}</span
              >
            </div>
            <div>
              <strong>{formatMoney(totals.amount, $displayCurrency)}</strong
              ><span>{t('Expenses', 'Pengeluaran')}</span>
            </div>
          </div>
        </div>
        <div class="linked-items" aria-label={t('Contributions', 'Kontribusi')}>
          {#each linked(goal) as item (item.key)}<GoalItem
              {item}
              source={goal.id}
              disabled={!writable || busy}
              {language}
              onstart={startDrag}
              onend={cancelDrag}
              ontouch={beginTouch}
              onkeyboard={keyboard}
            />{/each}
        </div>
        <div class="drop-label">
          {t(
            'Drag here to add progress',
            'Tarik ke sini untuk menambah progres',
          )}
        </div>
      </article>
    {:else}<div class="empty">
        <Icon name="goals" />
        <h2>
          {t('Your next goal starts here', 'Mulai target berikutnya di sini')}
        </h2>
        <p>
          {t(
            'Create a goal, then bring your progress into it.',
            'Buat target, lalu kumpulkan progresmu di dalamnya.',
          )}
        </p>
      </div>{/each}
  </div>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_no_noninteractive_element_interactions -->
  <section
    class="unassigned"
    class:drop-hover={hover === 'pool'}
    data-goal-drop="pool"
    tabindex="0"
    aria-label={t('Unassigned', 'Belum ditetapkan')}
    ondragover={(e) => over(e, 'pool')}
    ondrop={(e) => drop(e, 'pool')}
    onkeydown={(e) => targetKey(e, 'pool')}
  >
    <header>
      <div>
        <h2>
          {t('Unassigned', 'Belum ditetapkan')} <small>{pool.length}</small>
        </h2>
      </div>
      <div class="pool-actions">
        <button onclick={() => tray.showModal()}
          >{t('Set aside', 'Disisihkan')}
          <small>{setAsideItems.length}</small></button
        >
        <button disabled={!writable || busy || !pool.length} onclick={clearPool}
          >{t('Clear', 'Kosongkan')}</button
        >
      </div>
    </header>
    <div class="pool-strip">
      {#each pool as item (item.key)}<GoalItem
          {item}
          disabled={!writable || busy}
          {language}
          onstart={startDrag}
          onend={cancelDrag}
          ontouch={beginTouch}
          onkeyboard={keyboard}
        />{:else}<p class="empty-pool">
          {t(
            'Archived tasks and new expenses will appear here.',
            'Tugas yang diarsipkan dan pengeluaran baru akan muncul di sini.',
          )}
        </p>{/each}
    </div>
  </section>
</section>
<dialog
  bind:this={tray}
  class="set-aside-dialog"
  aria-label={t('Set aside', 'Disisihkan')}
>
  <header>
    <h2>{t('Set aside', 'Disisihkan')}</h2>
    <button onclick={() => tray.close()}>{t('Close', 'Tutup')}</button>
  </header>
  <p class="tray-explanation">
    {t(
      'Items kept out of Unassigned. Your tasks and transactions are unchanged.',
      'Item yang disisihkan dari Belum ditetapkan. Tugas dan transaksimu tidak berubah.',
    )}
  </p>
  <div class="aside-items">
    {#each setAsideItems as item (item.key)}
      <div class="aside-item">
        <div><strong>{item.title}</strong><small>{item.detail}</small></div>
        <button
          disabled={!writable || busy}
          onclick={() => restoreItem(item.key)}
          >{t('Restore', 'Kembalikan')}</button
        >
      </div>
    {:else}<p>
        {t('No items set aside.', 'Belum ada item yang disisihkan.')}
      </p>{/each}
  </div>
  {#if error}<p role="alert">{error}</p>{/if}
  <footer>
    <button
      disabled={!writable || busy || !setAsideItems.length}
      onclick={() => restoreItem()}
      >{t('Restore all', 'Kembalikan semua')}</button
    >
  </footer>
</dialog>
<dialog bind:this={dialog}>
  <form
    onsubmit={(e) => {
      e.preventDefault();
      void save();
    }}
  >
    <h2>
      {editing ? t('Edit goal', 'Edit target') : t('New goal', 'Target baru')}
    </h2>
    <label
      >{t('Title', 'Judul')}<input
        bind:this={nameField}
        bind:value={title}
        oninput={(e) => {
          const input = e.currentTarget,
            pos = input.selectionStart;
          title = capitalFirst(input.value);
          input.value = title;
          if (pos !== null) input.setSelectionRange(pos, pos);
        }}
        required
        maxlength="150"
      /></label
    ><label
      >{t('Description', 'Deskripsi')}<textarea
        bind:value={description}
        oninput={(e) => {
          const input = e.currentTarget,
            pos = input.selectionStart;
          description = capitalFirst(input.value);
          input.value = description;
          input.setSelectionRange(pos, pos);
        }}
        maxlength="2000"
        rows="3"
      ></textarea></label
    >
    <fieldset class="themes">
      <legend>{t('Theme', 'Tema')}</legend>
      {#each ['island', 'garden', 'space'] as option}<label
          ><input
            type="radio"
            name="theme"
            value={option}
            bind:group={theme}
            onchange={() => (generatorVersion = 2)}
          />{option === 'island'
            ? t('Island', 'Pulau')
            : option === 'garden'
              ? t('Garden', 'Taman')
              : t('Space', 'Antariksa')}</label
        >{/each}
    </fieldset>
    {#if error}<p role="alert">{error}</p>{/if}

    <footer>
      {#if editing}<button
          type="button"
          class="danger"
          disabled={busy || !writable}
          onclick={remove}>{t('Delete goal', 'Hapus target')}</button
        >{/if}<button type="button" onclick={() => dialog.close()}
        >{t('Cancel', 'Batal')}</button
      ><button class="primary" disabled={busy || !writable}
        >{t('Save', 'Simpan')}</button
      >
    </footer>
  </form>
</dialog>

<style>
  .themes {
    display: flex;
    gap: 12px;
    border: 0;
    padding: 0;
    flex-wrap: wrap;
  }
  .themes label {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .themes input {
    width: 18px;
    min-height: 18px;
  }
  .goals-page {
    height: 100%;
    min-width: 0;
    overflow: auto;
    padding: 28px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  h1,
  h2,
  p {
    margin: 0;
  }
  h1 {
    font-size: 28px;
  }
  h1 span {
    color: var(--accent);
  }
  header p {
    margin-top: 8px;
    font-size: 13px;
  }
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  button.primary {
    background: var(--accent);
    color: #06242a;
  }
  .goal-strip,
  .pool-strip {
    display: flex;
    gap: 16px;
    overflow-x: auto;
    scroll-snap-type: x proximity;
    padding: 4px 2px 12px;
    flex-shrink: 0;
  }
  .goal-strip {
    flex: 0 0 auto;
    height: clamp(460px, 62dvh, 540px);
    min-height: 0;
    align-items: stretch;
  }
  .goal-card {
    flex: 0 0 320px;
    scroll-snap-align: start;
    border: 1px solid var(--border, #293b42);
    border-radius: 16px;
    overflow: hidden;
    background: #142126;
    display: flex;
    flex-direction: column;
    transition:
      border-color 0.15s,
      transform 0.15s;
  }
  .cover {
    height: var(--goal-cover-height, 160px);
    position: relative;
    flex-shrink: 0;
    background: linear-gradient(135deg, #06444e, #192531);
  }
  .edit {
    position: absolute;
    right: 12px;
    top: 12px;
    background: #102026dd;
    color: white;
    width: 26px;
    height: 26px;
    padding: 4px;
  }
  .goal-body {
    padding: 20px;
    flex: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .goal-body h2 {
    font-size: 22px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .description {
    white-space: nowrap;
    font-size: 13px;
    line-height: 1.5;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .totals {
    margin-top: auto;
    padding-top: 8px;
    display: flex;
    justify-content: space-between;
    gap: 16px;
  }
  .totals div {
    display: flex;
    flex-direction: column;
    gap: 7px;
    min-width: 0;
  }
  .totals strong {
    font-size: 22px;
    color: var(--accent);
    overflow-wrap: anywhere;
  }
  .totals span {
    font-size: 12px;
  }
  .drop-label {
    flex-shrink: 0;
    padding: 12px;
    font-size: 11px;
    text-align: center;
    border-top: 1px dashed #345059;
  }
  .accepting {
    border-style: dashed;
  }
  .drop-hover {
    border-color: var(--accent);
    transform: translateY(-3px);
    background: #11333a;
  }
  .unassigned {
    border-top: 1px solid #293b42;
    padding-top: 18px;
  }
  .unassigned h2 {
    font-size: 19px;
  }
  .unassigned small {
    font-size: 12px;
    padding: 4px 8px;
    background: #25353c;
    border-radius: 20px;
  }
  .pool-strip {
    margin-top: 12px;
    display: grid;
    grid-template-rows: repeat(2, minmax(80px, auto));
    grid-auto-flow: column;
    grid-auto-columns: 210px;
    overflow-y: hidden;
    gap: 10px;
  }
  .pool-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .unassigned > header {
    flex-wrap: wrap;
    gap: 10px;
  }
  .pool-actions {
    margin-left: auto;
  }
  .pool-actions button {
    font-size: 12px;
    min-height: 36px;
  }
  .pool-actions small {
    padding: 2px 5px;
  }
  .aside-items {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 18px;
  }
  .aside-item {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
  }
  .aside-item > div {
    min-width: 0;
  }
  .aside-item strong {
    display: block;
    overflow-wrap: anywhere;
  }
  .aside-item small {
    display: block;
    margin-top: 4px;
    color: var(--muted);
  }
  .tray-explanation {
    margin-top: 12px;
    font-size: 13px;
  }

  .linked-items {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0 16px 12px;
    min-height: 0;
    flex: 1 1 0;
    overflow-y: auto;
  }
  .drag-ghost {
    position: fixed;
    z-index: 10000;
    transform: translate(-50%, -110%);
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 12px 16px;
    border: 1px solid var(--accent);
    background: #163b40;
    border-radius: 8px;
    pointer-events: none;
    box-shadow: 0 10px 24px #0008;
    font-size: 13px;
  }
  .unassigned.drop-hover {
    outline: 2px dashed var(--accent);
    outline-offset: 6px;
  }
  .goal-card:focus-visible,
  .unassigned:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .empty {
    align-self: center;
    text-align: center;
    width: 100%;
    padding: 30px;
  }
  .empty h2 {
    margin: 14px 0;
  }
  .empty-pool {
    padding: 20px;
    font-size: 14px;
  }
  dialog {
    max-width: 480px;
    width: calc(100% - 32px);
    border: 1px solid #34464d;
    border-radius: 16px;
    background: #142126;
    color: white;
    padding: 20px;
    max-height: calc(100dvh - 24px);
    overflow-y: auto;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  input,
  textarea {
    width: 100%;
    box-sizing: border-box;
  }
  footer {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    flex-wrap: wrap;
    position: sticky;
    bottom: -20px;
    padding: 12px 0;
    background: #142126;
  }
  .danger {
    color: #ff7777;
    margin-right: auto;
  }
  @media (max-width: 700px) {
    .goals-page {
      padding: 16px;
      gap: 14px;
    }
    .goal-card {
      flex-basis: calc(100vw - 52px);
    }
    header p {
      max-width: 220px;
    }
    .goal-strip {
      height: clamp(340px, 46dvh, 400px);
      --goal-cover-height: 112px;
    }
    .goal-body {
      padding: 10px 14px;
      gap: 4px;
    }
    .goal-body h2 {
      font-size: 18px;
    }
    .totals {
      padding-top: 4px;
    }
    .totals strong {
      font-size: 18px;
    }
    .totals div {
      gap: 3px;
    }
    .linked-items {
      margin: 0 10px 8px;
    }
    .drop-label {
      padding: 8px;
    }
    .edit {
      width: 28px;
      height: 28px;
    }
    dialog {
      padding: 16px;
    }
    form {
      gap: 12px;
    }
    footer {
      bottom: -16px;
    }
    footer button {
      min-height: 44px;
    }

    h1 {
      font-size: 24px;
    }
  }
</style>
