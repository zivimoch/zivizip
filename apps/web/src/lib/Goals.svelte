<script lang="ts">
  import { onMount } from 'svelte';
  import { capitalFirst } from './capitalization';
  import Icon from './Icon.svelte';
  import {
    GoalsRepository,
    emptyGoals,
    covers,
    goalTotals,
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
    selected = '';
  let dialog: HTMLDialogElement, nameField: HTMLInputElement;
  let editing = '',
    title = '',
    description = '',
    cover = '';
  let editSnapshot = '';
  const t = (en: string, id: string) => (language === 'id' ? id : en);
  $: assignedTasks = new Set(state.items.flatMap((g) => g.tasks));
  $: assignedExpenses = new Set(state.items.flatMap((g) => g.expenses));
  $: pool = [
    ...tasks
      .filter((task) => task.done && !assignedTasks.has(task.id))
      .map((task) => ({
        key: 'task:' + task.id,
        id: task.id,
        type: 'task',
        title: task.title,
        detail: t('Completed task', 'Tugas selesai'),
      })),
    ...transactions
      .filter((tx) => tx.type === 'expense' && !assignedExpenses.has(tx.id))
      .map((tx) => ({
        key: 'expense:' + tx.id,
        id: tx.id,
        type: 'expense',
        title: tx.title || tx.category,
        detail: formatMoney(tx.amount, $displayCurrency),
      })),
  ];
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
    window.addEventListener('online', change);
    return () => window.removeEventListener('online', change);
  });
  $: if (ready && refreshToken >= 0) void refresh();
  async function commit(items: Goal[]) {
    if (!writable || busy) return false;
    busy = true;
    onbusy(true);
    error = '';
    try {
      state = await repository.write(state, items);
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
      tasks: [],
      expenses: [],
    };
    const items = editing
      ? state.items.map((g) =>
          g.id === editing
            ? { ...g, title: goal.title, description: goal.description, cover }
            : g,
        )
      : [...state.items, goal];
    if (await commit(items)) dialog.close();
  }
  async function remove() {
    if (
      !confirm(
        t(
          'Delete this goal? Its items will return to Unassigned.',
          'Hapus target ini? Item akan kembali ke Belum ditetapkan.',
        ),
      )
    )
      return;
    if (await commit(state.items.filter((g) => g.id !== editing)))
      dialog.close();
  }
  async function assign(key: string, goalId: string) {
    const item = pool.find((p) => p.key === key);
    if (!item) return;
    if (
      await commit(
        state.items.map((g) =>
          g.id === goalId
            ? {
                ...g,
                [item.type === 'task' ? 'tasks' : 'expenses']: [
                  ...(item.type === 'task' ? g.tasks : g.expenses),
                  item.id,
                ],
              }
            : g,
        ),
      )
    )
      selected = '';
  }
  function drop(e: DragEvent, id: string) {
    e.preventDefault();
    hover = '';
    void assign(
      e.dataTransfer?.getData('application/x-zivizip-goal') || '',
      id,
    );
    dragging = '';
  }
</script>

<section class="goals-page" aria-label={t('Goals', 'Target')}>
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
      <article
        class:drop-hover={hover === goal.id}
        class:accepting={!!dragging}
        class="goal-card"
        aria-label={goal.title}
        role="region"
        ondragover={(e) => {
          if (writable && dragging) {
            e.preventDefault();
            hover = goal.id;
          }
        }}
        ondragleave={() => (hover = '')}
        ondrop={(e) => drop(e, goal.id)}
      >
        <div class="cover" class:plain={!goal.cover}>
          {#if goal.cover}<img
              src={'/goals/' + goal.cover + '.webp'}
              alt=""
            />{:else}<Icon name="goals" />{/if}<button
            class="edit"
            aria-label={t('Edit goal', 'Edit target') + ': ' + goal.title}
            disabled={!writable || busy}
            onclick={() => open(goal)}><Icon name="draw" /></button
          >
        </div>
        <div class="goal-body">
          <h2>{goal.title}</h2>
          <p class="description">{goal.description}</p>
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
        <div class="drop-label">
          {t(
            'Drop completed tasks or expenses here',
            'Taruh tugas selesai atau pengeluaran di sini',
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
  <section class="unassigned" aria-label={t('Unassigned', 'Belum ditetapkan')}>
    <header>
      <div>
        <h2>
          {t('Unassigned', 'Belum ditetapkan')} <small>{pool.length}</small>
        </h2>
        <p>
          {t(
            'Completed tasks and expenses, ready for a goal.',
            'Tugas selesai dan pengeluaran yang siap masuk ke target.',
          )}
        </p>
      </div>
    </header>
    <div class="pool-strip">
      {#each pool as item (item.key)}<div
          class="source-card"
          class:dragging={dragging === item.key}
          draggable={writable && !busy}
          role="group"
          aria-label={item.title}
          ondragstart={(e) => {
            dragging = item.key;
            e.dataTransfer?.setData('application/x-zivizip-goal', item.key);
            if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
          }}
          ondragend={() => {
            dragging = '';
            hover = '';
          }}
        >
          <small
            >{item.type === 'task'
              ? t('To do', 'To do')
              : t('Finance', 'Keuangan')}</small
          ><strong>{item.title}</strong><span>{item.detail}</span><button
            disabled={!writable || busy || !state.items.length}
            onclick={() => (selected = selected === item.key ? '' : item.key)}
            >{t('Move to goal', 'Pindahkan ke target')}
            <Icon name="chevron-down" /></button
          >{#if selected === item.key}<select
              aria-label={t('Choose goal', 'Pilih target')}
              onchange={(e) => assign(item.key, e.currentTarget.value)}
              ><option value="">{t('Choose goal', 'Pilih target')}</option
              >{#each state.items as g}<option value={g.id}>{g.title}</option
                >{/each}</select
            >{/if}
        </div>{:else}<p class="empty-pool">
          {t(
            'All caught up. Completed tasks and new expenses will appear here.',
            'Semua sudah ditetapkan. Tugas selesai dan pengeluaran baru akan muncul di sini.',
          )}
        </p>{/each}
    </div>
  </section>
</section>
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
    {#if error}<p role="alert">{error}</p>{/if}
    <fieldset>
      <legend>{t('Cover image', 'Gambar sampul')}</legend>
      <div class="covers">
        {#each ['', ...covers] as image}<button
            type="button"
            class:chosen={cover === image}
            aria-pressed={cover === image}
            aria-label={image || t('No image', 'Tanpa gambar')}
            onclick={() => (cover = image)}
            >{#if image}<img
                src={'/goals/' + image + '.webp'}
                alt={image}
              />{:else}<Icon name="goals" />{/if}</button
          >{/each}
      </div>
    </fieldset>
    <footer>
      {#if editing}<button
          type="button"
          class="danger"
          disabled={busy || !writable}
          onclick={remove}>{t('Delete', 'Hapus')}</button
        >{/if}<button type="button" onclick={() => dialog.close()}
        >{t('Cancel', 'Batal')}</button
      ><button class="primary" disabled={busy || !writable}
        >{t('Save', 'Simpan')}</button
      >
    </footer>
  </form>
</dialog>

<style>
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
    flex: 1;
    min-height: 380px;
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
    height: 150px;
    position: relative;
    flex-shrink: 0;
    background: linear-gradient(135deg, #06444e, #192531);
  }
  .cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .plain {
    display: grid;
    place-items: center;
  }
  .edit {
    position: absolute;
    right: 12px;
    top: 12px;
    background: #102026dd;
    color: white;
    width: 34px;
    height: 34px;
    padding: 6px;
  }
  .goal-body {
    padding: 20px;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .goal-body h2 {
    font-size: 22px;
    overflow-wrap: anywhere;
  }
  .description {
    white-space: pre-wrap;
    font-size: 14px;
    line-height: 1.6;
    max-height: 120px;
    overflow: auto;
    overflow-wrap: anywhere;
  }
  .totals {
    margin-top: auto;
    padding-top: 20px;
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
    margin-top: 16px;
  }
  .source-card {
    flex: 0 0 220px;
    scroll-snap-align: start;
    background: #17252b;
    border: 1px solid #30434b;
    border-radius: 10px;
    padding: 15px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    cursor: grab;
  }
  .source-card strong {
    overflow-wrap: anywhere;
  }
  .source-card small,
  .source-card span {
    font-size: 12px;
  }
  .source-card button {
    font-size: 12px;
    margin-top: auto;
  }
  .source-card select {
    max-width: 100%;
  }
  .dragging {
    opacity: 0.4;
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
    padding: 24px;
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
  fieldset {
    border: 0;
    padding: 0;
  }
  .covers {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }
  .covers button {
    width: 80px;
    height: 56px;
    padding: 0;
    overflow: hidden;
    border: 2px solid transparent;
  }
  .covers img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .covers .chosen {
    border-color: var(--accent);
  }
  footer {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
  .danger {
    color: #ff7777;
    margin-right: auto;
  }
  @media (max-width: 700px) {
    .goals-page {
      padding: 16px;
      gap: 20px;
    }
    .goal-card {
      flex-basis: calc(100vw - 52px);
    }
    header p {
      max-width: 220px;
    }
    .goal-strip {
      min-height: 360px;
    }
    .cover {
      height: 130px;
    }
    .source-card {
      flex-basis: 200px;
    }
    h1 {
      font-size: 24px;
    }
  }
</style>
