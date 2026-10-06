<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Icon from './Icon.svelte';
  import type { PlanningRepository } from './planning';
  import {
    FinanceRepository,
    emptyFinance,
    localMonth,
    dateInMonth,
    monthlyTransactions,
    totals,
    type Transaction,
  } from './finance';
  export let repository: FinanceRepository;
  export let writable: boolean;
  export let language: 'en' | 'id';
  export let refreshToken = 0;
  export let onbusy: (value: boolean) => void = () => {};
  export let ondata: (items: Transaction[]) => void = () => {};
  export let categoryOptions: string[] = [];
  export let selectedMonth = '';
  export let planningRepository: PlanningRepository | undefined = undefined;
  let plannedCategories: string[] = [];
  let state = emptyFinance(),
    initialized = false,
    busy = false,
    reading = false,
    alive = true;
  let message = '',
    month = localMonth(),
    grouped = false;
  let modal: HTMLDialogElement, titleInput: HTMLInputElement;
  let editing: string | null = null,
    type: Transaction['type'] = 'expense';
  let title = '',
    category = '',
    date = '',
    amount = '';
  let formOpen = false,
    deleting = false,
    readEpoch = 0,
    seenRefresh = refreshToken;
  let broadcast = () => {};
  $: t =
    language === 'en'
      ? (en: string, _id: string) => en
      : (_en: string, id: string) => id;
  $: rows = monthlyTransactions(state.items, month);
  $: summary = totals(rows);
  $: groups = Object.entries(
    rows.reduce(
      (result, item) => {
        const key = grouped ? item.category : item.date;
        (result[key] ||= []).push(item);
        return result;
      },
      Object.create(null) as Record<string, Transaction[]>,
    ),
  );
  $: ondata(state.items);
  $: if (selectedMonth) month = selectedMonth;
  $: categories = [
    ...new Set([
      ...categoryOptions,
      ...plannedCategories,
      ...state.items.map((item) => item.category),
    ]),
  ].sort((a, b) => a.localeCompare(b));
  $: if (initialized && refreshToken !== seenRefresh) {
    seenRefresh = refreshToken;
    void refresh();
  }
  const money = (n: number) =>
    new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(n);
  const shortMoney = (n: number) =>
    new Intl.NumberFormat(language === 'en' ? 'en' : 'id', {
      style: 'currency',
      currency: 'IDR',
      currencyDisplay: 'narrowSymbol',
      notation: 'compact',
      maximumFractionDigits: 2,
    }).format(n);
  const dateLabel = (value: string) =>
    new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'id-ID', {
      day: 'numeric',
      month: 'long',
    }).format(new Date(value + 'T12:00:00'));
  function setBusy(value: boolean) {
    busy = value;
    onbusy(value);
  }
  async function refresh(force = false) {
    if (!alive || busy || reading || (formOpen && !force)) return;
    const initial = !initialized,
      revision = state.revision,
      target = repository,
      epoch = ++readEpoch;
    reading = true;
    if (initial) setBusy(true);
    try {
      const next = await target.list(writable);
      const plans = await planningRepository?.list(writable);
      if (
        alive &&
        epoch === readEpoch &&
        target === repository &&
        (!formOpen || force) &&
        revision === state.revision
      ) {
        if (initial || next.revision !== state.revision) state = next;
        if (plans) plannedCategories = plans.items.map((plan) => plan.category);
        message = '';
      }
    } catch (error) {
      if (alive && epoch === readEpoch) message = (error as Error).message;
    } finally {
      reading = false;
      if (alive) {
        initialized = true;
        if (initial) setBusy(false);
      }
    }
  }
  function remember() {
    void repository.db.meta
      .put({ key: 'finance-view', value: { month, grouped } })
      .catch((error) => (message = error.message));
  }
  export function selectMonth(value: string) {
    month = value;
    remember();
  }
  export async function openTransaction(
    item?: Transaction,
    defaults?: Partial<Transaction>,
  ) {
    if (!writable || busy || !initialized) return;
    readEpoch++;
    editing = item?.id || null;
    const values = item || defaults;
    type = values?.type || 'expense';
    title = values?.title || '';
    category = values?.category || '';
    date = values?.date || dateInMonth(month);
    amount = values?.amount ? String(values.amount) : '';
    deleting = false;
    formOpen = true;
    message = '';
    modal.showModal();
    await tick();
    titleInput.focus();
  }
  function close() {
    modal.close();
    formOpen = false;
    deleting = false;
    void refresh();
  }
  async function commit(items: Transaction[]) {
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
  async function submit() {
    if (!title.trim() || !category.trim() || !date) return;
    const previous = state.items.find((item) => item.id === editing);
    if (editing && !previous) {
      message = t(
        'This transaction was removed elsewhere. Copy your changes into a new transaction.',
        'Transaksi ini telah dihapus di tempat lain. Salin perubahan ke transaksi baru.',
      );
      return;
    }
    const item: Transaction = {
      id: editing || crypto.randomUUID(),
      type,
      title: title.trim(),
      category: category.trim(),
      date,
      amount: Number(amount),
      createdAt: previous?.createdAt ?? Date.now(),
    };
    if (
      await commit(
        editing
          ? state.items.map((old) => (old.id === editing ? item : old))
          : [...state.items, item],
      )
    ) {
      month = date.slice(0, 7);
      remember();
      close();
    }
  }
  onMount(() => {
    void (async () => {
      const view = (await repository.db.meta.get('finance-view'))?.value as
        | { month?: string; grouped?: boolean }
        | undefined;
      if (!alive) return;
      if (
        !selectedMonth &&
        view?.month &&
        /^\d{4}-(0[1-9]|1[0-2])$/.test(view.month)
      )
        month = view.month;
      grouped = view?.grouped === true;
      await refresh();
    })().catch((error) => (message = error.message));
    const changes = new BroadcastChannel(`finance-${repository.db.name}`);
    changes.onmessage = () => void refresh();
    broadcast = () => changes.postMessage('changed');
    return () => {
      alive = false;
      changes.close();
      onbusy(false);
    };
  });
</script>

<section class="finance-panel" aria-label="Finance">
  <div class="finance-heading">
    <h2>Finance<span>.</span></h2>
    <button
      class="finance-add"
      aria-label={t('Add transaction', 'Tambah transaksi')}
      title={t('Add transaction', 'Tambah transaksi')}
      disabled={!writable || busy || !initialized}
      onclick={() => openTransaction()}><Icon name="plus" /></button
    >
  </div>
  <div class="finance-toolbar">
    <button
      onclick={() => {
        grouped = !grouped;
        remember();
      }}
      ><Icon name="list" />{grouped
        ? t('By date', 'Per tanggal')
        : t('By category', 'Per kategori')}</button
    >
    <input
      type="month"
      aria-label={t('Transaction month', 'Bulan transaksi')}
      value={month}
      onchange={(event) => {
        if (event.currentTarget.value) {
          month = event.currentTarget.value;
          remember();
        }
      }}
    />
  </div>
  <div class="balance-grid">
    <div class="balance-card" title={money(summary.income)}>
      <small>{t('Income', 'Pemasukan')}<span>↗</span></small><strong
        data-total="income">{shortMoney(summary.income)}</strong
      >
    </div>
    <div class="balance-card out" title={money(summary.expense)}>
      <small>{t('Expenses', 'Pengeluaran')}<span>↙</span></small><strong
        data-total="expense">{shortMoney(summary.expense)}</strong
      >
    </div>
    <div
      class="balance-card"
      class:out={summary.balance < 0}
      title={money(summary.balance)}
    >
      <small>{t('Balance', 'Saldo')}<span>▣</span></small><strong
        data-total="balance">{shortMoney(summary.balance)}</strong
      >
    </div>
  </div>
  {#if message && !formOpen}<div class="finance-error" role="alert">
      {message}<button disabled={busy} onclick={() => refresh()}
        >{t('Reload list', 'Muat ulang daftar')}</button
      >
    </div>{/if}
  <div class="transactions">
    {#each groups as [key, items] (key)}
      <div class="transaction-heading">{grouped ? key : dateLabel(key)}</div>
      {#each items as item (item.id)}
        <button
          class="finance-transaction"
          data-transaction={item.id}
          aria-label={t(
            `Edit transaction ${item.title}`,
            `Edit transaksi ${item.title}`,
          )}
          aria-disabled={!writable || busy}
          onclick={() => openTransaction(item)}
        >
          <span
            class="transaction-category"
            title={grouped ? dateLabel(item.date) : item.category}
            >{grouped ? dateLabel(item.date) : item.category}</span
          >
          <span class="transaction-name" title={item.title}>{item.title}</span>
          <span class="transaction-amount" class:income={item.type === 'income'}
            >{item.type === 'income' ? '+' : '−'}{money(item.amount)}</span
          >
        </button>
      {/each}
    {:else}<p class="finance-empty">
        {initialized
          ? t(
              'No transactions this month. Add one with +.',
              'Belum ada transaksi bulan ini. Tambahkan melalui +.',
            )
          : t('Loading transactions…', 'Memuat transaksi…')}
      </p>{/each}
  </div>
</section>

<dialog
  bind:this={modal}
  oncancel={(event) => {
    event.preventDefault();
    if (!busy) close();
  }}
>
  <form
    onsubmit={(event) => {
      event.preventDefault();
      if (!deleting) void submit();
    }}
  >
    <div class="dialog-heading">
      <h2>
        {deleting
          ? t('Delete transaction?', 'Hapus transaksi?')
          : editing
            ? t('Edit transaction', 'Edit transaksi')
            : t('New transaction', 'Transaksi baru')}
      </h2>
      <button
        type="button"
        aria-label={t('Close transaction dialog', 'Tutup dialog transaksi')}
        disabled={busy}
        onclick={close}>×</button
      >
    </div>
    {#if deleting}<p>
        {t(
          'This transaction will be permanently deleted. Your totals will be recalculated.',
          'Transaksi ini akan dihapus permanen. Ringkasan saldo akan dihitung ulang.',
        )}
      </p>
    {:else}
      <label
        >{t('Type', 'Jenis')}<select bind:value={type} disabled={busy}
          ><option value="expense">{t('Expense', 'Pengeluaran')}</option><option
            value="income">{t('Income', 'Pemasukan')}</option
          ></select
        ></label
      >
      <label
        >{t('Description', 'Keterangan')}<input
          bind:this={titleInput}
          bind:value={title}
          required
          maxlength="150"
          disabled={busy}
        /></label
      >
      <label
        >{t('Amount (IDR)', 'Nominal (Rp)')}<input
          type="number"
          min="1"
          max="1000000000000"
          step="1"
          required
          value={amount}
          oninput={(event) => (amount = event.currentTarget.value)}
          disabled={busy}
        /></label
      >
      <label
        >{t('Category', 'Kategori')}<input
          bind:value={category}
          list="transaction-categories"
          autocomplete="off"
          required
          maxlength="60"
          disabled={busy}
        /></label
      >
      <datalist id="transaction-categories"
        >{#each categories as option}<option value={option}
          ></option>{/each}</datalist
      >
      <label
        >{t('Date', 'Tanggal')}<input
          type="date"
          bind:value={date}
          required
          disabled={busy}
        /></label
      >
      {#if editing}<button
          type="button"
          class="danger"
          disabled={busy || !writable}
          onclick={async () => {
            deleting = true;
            await tick();
            modal.querySelector<HTMLButtonElement>('footer button')?.focus();
          }}>{t('Delete transaction', 'Hapus transaksi')}</button
        >{/if}
    {/if}
    {#if message}<p class="finance-error" role="alert">{message}</p>
      <button type="button" disabled={busy} onclick={() => refresh(true)}
        >{t('Reload list', 'Muat ulang daftar')}</button
      >{/if}
    <footer>
      <button
        type="button"
        disabled={busy}
        onclick={() => (deleting ? (deleting = false) : close())}
        >{t('Cancel', 'Batal')}</button
      >
      {#if deleting}<button
          type="button"
          class="danger"
          disabled={busy || !writable}
          onclick={async () => {
            if (await commit(state.items.filter((item) => item.id !== editing)))
              close();
          }}>{t('Delete', 'Hapus')}</button
        >
      {:else}<button class="primary" type="submit" disabled={busy || !writable}
          >{t('Save', 'Simpan')}</button
        >{/if}
    </footer>
  </form>
</dialog>

<style>
  .finance-panel {
    flex: 1;
    min-height: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 24px;
    overflow: hidden;
  }
  .finance-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    margin-bottom: 13px;
  }
  h2 {
    margin: 0;
    font-size: 25px;
    letter-spacing: -0.6px;
  }
  h2 span,
  .income {
    color: var(--accent);
  }
  .finance-add {
    padding: 4px;
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
  }
  .finance-toolbar {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 13px;
  }
  .finance-toolbar button {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    padding: 8px 10px;
    white-space: nowrap;
  }
  .finance-toolbar :global(svg) {
    width: 16px;
    height: 16px;
  }
  .finance-toolbar input {
    font-size: 11px;
    background: transparent;
    border: 0;
    color: #bbc7cd;
    max-width: 160px;
    min-width: 0;
    padding: 0;
    width: auto;
  }
  .balance-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 17px;
  }
  .balance-card {
    padding: 12px 10px;
    border: 1px solid #263942;
    border-radius: 7px;
    background: linear-gradient(140deg, #18252c, #101a1f);
    min-width: 0;
  }
  .balance-card small {
    font-size: 9px;
    display: flex;
    justify-content: space-between;
    gap: 4px;
  }
  .balance-card strong {
    font-size: 16px;
    display: block;
    color: var(--accent);
    margin-top: 7px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .balance-card.out strong {
    color: #ff745c;
  }
  .transactions {
    overflow: auto;
    padding-right: 4px;
    flex: 1;
    min-height: 0;
    padding-bottom: 12px;
  }
  .transaction-heading {
    font-size: 11px;
    color: #b8c6cc;
    margin: 5px 0 9px;
  }
  .transaction-heading:not(:first-child) {
    margin-top: 19px;
  }
  .finance-transaction {
    display: flex;
    align-items: center;
    gap: 10px;
    border: 0;
    border-bottom: 1px solid var(--line);
    border-radius: 0;
    background: transparent;
    padding: 8px 0;
    width: 100%;
    text-align: left;
    font-size: 12px;
  }
  .finance-transaction:hover {
    background: #00394033;
  }
  .finance-transaction[aria-disabled='true'] {
    cursor: default;
  }
  .transaction-category {
    border: 1px solid #2b3c45;
    border-radius: 20px;
    background: #19262e;
    padding: 3px 8px;
    font-size: 9px;
    min-width: 61px;
    max-width: 33%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: center;
  }
  .transaction-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .transaction-amount {
    margin-left: auto;
    white-space: nowrap;
  }
  .finance-empty {
    padding: 24px 10px;
    text-align: center;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.8;
  }
  .finance-error {
    color: #ff9a9e;
    font-size: 13px;
  }
  .finance-error button {
    display: block;
    margin: 6px 0;
  }
  @media (max-width: 700px) {
    .finance-panel {
      padding: 18px;
    }
    .finance-add {
      width: 40px;
      height: 40px;
    }
    .finance-toolbar button,
    .finance-toolbar input {
      min-height: 40px;
    }
    .finance-transaction {
      min-height: 44px;
    }
  }
</style>
