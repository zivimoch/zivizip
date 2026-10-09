<script lang="ts">
  import { displayCurrency, formatMoney } from './currency';
  import MoneyField from './MoneyField.svelte';
  import SuggestionField from './SuggestionField.svelte';
  import { onMount, tick } from 'svelte';
  import Icon from './Icon.svelte';
  import { localMonth, dateInMonth, totals, type Transaction } from './finance';
  import {
    PlanningRepository,
    emptyPlanning,
    monthBudgets,
    monthSummary,
    groupSummary,
    matchingTransactions,
    actualAmount,
    planType,
    copyMonth,
    moveBudgets,
    validMonth,
    type Budget,
    type PlanningData,
    type PlanGroup,
  } from './planning';
  export let repository: PlanningRepository;
  export let transactions: Transaction[] = [];
  export let writable: boolean;
  export let language: 'en' | 'id';
  export let refreshToken = 0;
  export let onbusy: (value: boolean) => void = () => {};
  export let onmonth: (month: string) => void = () => {};
  export let oncategories: (values: string[]) => void = () => {};
  export let ontransaction: (
    item?: Transaction,
    defaults?: Partial<Transaction>,
  ) => void = () => {};
  let state = emptyPlanning(),
    initialized = false,
    busy = false,
    reading = false,
    alive = true;
  let active = 'analysis',
    tabs: string[] = [],
    message = '',
    seenRefresh = refreshToken,
    readEpoch = 0;
  let root: HTMLElement, modal: HTMLDialogElement, focusInput: HTMLInputElement;
  let mode: 'create' | 'budget' | 'delete' | 'note' | 'opening' | 'category' =
      'create',
    formOpen = false;
  let editing: Budget | null = null,
    category = '',
    amount = '',
    note = '',
    group: PlanGroup = 'monthly',
    source = '',
    destination = localMonth();
  let inline: Record<PlanGroup, { category: string; amount: string }> = {
    income: { category: '', amount: '' },
    recurring: { category: '', amount: '' },
    monthly: { category: '', amount: '' },
  };
  let selected = new Set<string>(),
    draft: Budget[] | null = null;
  let drag: {
    id: string;
    pointer: number;
    x: number;
    y: number;
    moving: boolean;
    category: boolean;
    list: HTMLElement;
  } | null = null;
  let lastTap = { id: '', time: 0 },
    clickTimer: ReturnType<typeof setTimeout> | undefined;
  let broadcast = () => {};
  $: t =
    language === 'en'
      ? (en: string, _id: string) => en
      : (_en: string, id: string) => id;
  $: rows = draft || monthBudgets(state, transactions, active);
  $: summary = monthSummary(state, transactions, active);
  $: groups = (['income', 'recurring', 'monthly'] as PlanGroup[]).map(
    (key) => ({
      key,
      rows: rows.filter((plan) => plan.group === key),
      stats: groupSummary(
        rows.filter((plan) => plan.group === key),
        transactions,
      ),
    }),
  );
  $: months = [
    ...new Set([
      ...state.months.map((entry) => entry.month),
      ...transactions.map((item) => item.date.slice(0, 7)),
    ]),
  ].sort();
  $: chart = months.map((month) => ({
    month,
    ...totals(transactions.filter((item) => item.date.startsWith(month + '-'))),
  }));
  $: chartMax = Math.max(
    1,
    ...chart.flatMap((entry) => [entry.income, entry.expense]),
  );
  $: categories = [
    ...new Set([
      ...state.items.map((plan) => plan.category),
      ...transactions.map((item) => item.category),
    ]),
  ].sort((a, b) => a.localeCompare(b));
  $: oncategories(categories);
  $: categoryItems = editing
    ? matchingTransactions(editing, transactions).sort((a, b) =>
        b.date.localeCompare(a.date),
      )
    : [];
  $: if (initialized && refreshToken !== seenRefresh) {
    seenRefresh = refreshToken;
    void refresh();
  }
  $: money = (value: number) => formatMoney(value, $displayCurrency);
  const monthLabel = (month: string) =>
    new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'id-ID', {
      month: 'long',
      year: '2-digit',
    }).format(new Date(month + '-01T12:00:00'));
  const groupLabel = (value: PlanGroup) =>
    value === 'income'
      ? t('Income', 'Pemasukan')
      : value === 'recurring'
        ? t('Recurring expenses', 'Pengeluaran rutin')
        : t('This month’s expenses', 'Pengeluaran bulan ini');
  const percent = (value: number) => Math.min(100, Math.max(0, value));
  function setBusy(value: boolean) {
    busy = value;
    onbusy(value);
  }
  async function refresh(force = false) {
    if (!alive || busy || reading || drag || (formOpen && !force)) return;
    const initial = !initialized,
      epoch = ++readEpoch,
      revision = state.revision,
      target = repository;
    reading = true;
    if (initial) setBusy(true);
    try {
      const next = await target.list(writable);
      if (
        alive &&
        epoch === readEpoch &&
        target === repository &&
        revision === state.revision &&
        (!formOpen || force) &&
        !drag
      ) {
        if (initial || next.revision !== state.revision) state = next;
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
  async function commit(data: PlanningData) {
    if (!writable || busy || !initialized) return false;
    readEpoch++;
    setBusy(true);
    message = '';
    try {
      const saved = await repository.write(state, data);
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
  function remember() {
    void repository.db.meta
      .put({ key: 'planning-view', value: { active, tabs } })
      .catch((error) => (message = error.message));
  }
  function openMonth(month: string) {
    clearTimeout(clickTimer);
    selected = new Set();
    lastTap = { id: '', time: 0 };
    if (!tabs.includes(month)) tabs = [...tabs, month];
    active = month;
    onmonth(month);
    remember();
  }
  function closeMonth(month: string) {
    tabs = tabs.filter((value) => value !== month);
    if (active === month) active = 'analysis';
    selected = new Set();
    remember();
  }
  async function show(next: typeof mode, plan: Budget | null = null) {
    if (busy || formOpen || (!writable && next !== 'category')) return;
    readEpoch++;
    clearTimeout(clickTimer);
    lastTap = { id: '', time: 0 };
    mode = next;
    editing = plan;
    message = '';
    formOpen = true;
    category = plan?.category || '';
    amount =
      next === 'opening' ? String(summary.opening) : String(plan?.amount || 0);
    note = plan?.note || '';
    group = plan?.group || 'monthly';
    source = '';
    destination = localMonth();
    modal.showModal();
    await tick();
    (
      modal.querySelector('input:not([disabled])') as HTMLInputElement | null
    )?.focus();
  }
  function close() {
    modal.close();
    formOpen = false;
    lastTap = { id: '', time: 0 };
    void refresh();
  }
  function withMonth(items: Budget[]): PlanningData {
    return {
      months: state.months.some((entry) => entry.month === active)
        ? state.months
        : [...state.months, { month: active, opening: 0 }],
      items,
    };
  }
  function upsert(plan: Budget): PlanningData {
    const exists = state.items.some((item) => item.id === plan.id);
    return withMonth(
      exists
        ? state.items.map((item) => (item.id === plan.id ? plan : item))
        : [...state.items, { ...plan, id: crypto.randomUUID() }],
    );
  }
  async function add(key: PlanGroup) {
    const fields = inline[key];
    if (!fields.category.trim()) return;
    const plan: Budget = {
      id: crypto.randomUUID(),
      month: active,
      category: fields.category.trim(),
      group: key,
      amount: Number(fields.amount),
      note: '',
      enabled: true,
      automatic: false,
    };
    if (await commit(withMonth([...state.items, plan])))
      inline = { ...inline, [key]: { category: '', amount: '' } };
  }
  async function submit() {
    try {
      let data: PlanningData;
      if (mode === 'create') {
        data = copyMonth(state, source, destination);
      } else if (mode === 'opening') {
        data = {
          ...withMonth(state.items),
          months: [
            ...state.months.filter((entry) => entry.month !== active),
            { month: active, opening: Number(amount) },
          ],
        };
      } else {
        if (!editing || !rows.some((plan) => plan.id === editing!.id)) {
          message = t(
            'This category changed elsewhere. Close this form and reopen it.',
            'Kategori berubah di tempat lain. Tutup formulir lalu buka kembali.',
          );
          return;
        }
        // Reloading after a conflict retains only the fields this form is editing.
        const current = rows.find((plan) => plan.id === editing!.id)!;
        if (mode === 'delete')
          data = withMonth(
            state.items.filter((plan) => plan.id !== editing!.id),
          );
        else if (mode === 'note')
          data = upsert({ ...current, note: note.trim() });
        else
          data = upsert({
            ...current,
            category: category.trim(),
            amount: Number(amount),
            group,
            automatic:
              current.automatic && Number(amount) === 0 && group === 'monthly',
          });
      }
      if (await commit(data)) {
        if (mode === 'create') openMonth(destination);
        close();
      }
    } catch (error) {
      message = (error as Error).message;
    }
  }
  async function toggle(plan: Budget) {
    await commit(upsert({ ...plan, enabled: !plan.enabled }));
  }
  async function reorder(order: Budget[]) {
    const materialized = order.map((plan) =>
      plan.id.startsWith('automatic:')
        ? { ...plan, id: crypto.randomUUID() }
        : plan,
    );
    if (
      await commit(
        withMonth([
          ...state.items.filter((plan) => plan.month !== active),
          ...materialized,
        ]),
      )
    )
      selected = new Set(
        [...selected].filter((id) =>
          materialized.some((plan) => plan.id === id),
        ),
      );
  }
  function pointerDown(event: PointerEvent, plan: Budget) {
    if (
      event.button !== 0 ||
      busy ||
      (event.target as Element).closest('[data-row-action]')
    )
      return;
    clearTimeout(clickTimer);
    if (event.shiftKey) {
      event.preventDefault();
      selected = new Set(selected);
      if (selected.has(plan.id)) selected.delete(plan.id);
      else selected.add(plan.id);
      return;
    }
    const already = selected.has(plan.id);
    if (!already) selected = new Set([plan.id]);
    if (event.pointerType !== 'touch' || already) event.preventDefault();
    const row = event.currentTarget as HTMLElement,
      list = row.closest<HTMLElement>('.plan-items-scroll')!;
    drag = {
      id: plan.id,
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moving: false,
      category: !!(event.target as Element).closest('.plan-category'),
      list,
    };
    row.setPointerCapture(event.pointerId);
    row.focus({ preventScroll: true });
  }
  function pointerMove(event: PointerEvent) {
    if (!drag || drag.pointer !== event.pointerId || !writable) return;
    if (
      !drag.moving &&
      Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 7
    )
      return;
    drag.moving = true;
    lastTap = { id: '', time: 0 };
    clearTimeout(clickTimer);
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-plan-row]');
    if (target && drag.list.contains(target)) {
      const box = target.getBoundingClientRect();
      draft = moveBudgets(
        rows,
        selected,
        target.dataset.planRow!,
        event.clientY > box.top + box.height / 2,
      );
    }
    const box = drag.list.getBoundingClientRect();
    if (event.clientY > box.bottom - 35) drag.list.scrollTop += 14;
    if (event.clientY < box.top + 35) drag.list.scrollTop -= 14;
  }
  async function pointerUp(event: PointerEvent) {
    if (!drag || drag.pointer !== event.pointerId) return;
    const current = drag,
      order = draft;
    drag = null;
    draft = null;
    if ((event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId))
      (event.currentTarget as HTMLElement).releasePointerCapture(
        event.pointerId,
      );
    if (current.moving) {
      if (order) await reorder(order);
      return;
    }
    const plan = rows.find((item) => item.id === current.id);
    if (!plan) return;
    const now = performance.now();
    if (lastTap.id === plan.id && now - lastTap.time < 400) {
      clearTimeout(clickTimer);
      void show('budget', plan);
      lastTap = { id: '', time: 0 };
    } else {
      lastTap = { id: plan.id, time: now };
      if (current.category)
        clickTimer = setTimeout(() => void show('category', plan), 400);
    }
  }
  function rowKey(event: KeyboardEvent, plan: Budget) {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'F2' || event.key === 'Enter') {
      event.preventDefault();
      void show('budget', plan);
    }
    if (event.key === ' ') {
      event.preventDefault();
      selected = event.shiftKey ? new Set(selected) : new Set();
      if (selected.has(plan.id)) selected.delete(plan.id);
      else selected.add(plan.id);
    }
    if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const groupRows = rows.filter((item) => item.group === plan.group),
        next =
          groupRows[
            groupRows.indexOf(plan) + (event.key === 'ArrowUp' ? -1 : 1)
          ];
      if (next)
        void reorder(
          moveBudgets(
            rows,
            selected.has(plan.id) ? selected : new Set([plan.id]),
            next.id,
            event.key === 'ArrowDown',
          ),
        );
    }
  }
  onMount(() => {
    void (async () => {
      const view = (await repository.db.meta.get('planning-view'))?.value as
        | { active?: string; tabs?: string[] }
        | undefined;
      if (!alive) return;
      tabs = Array.isArray(view?.tabs)
        ? [...new Set(view.tabs.filter(validMonth))]
        : [];
      active =
        view?.active && tabs.includes(view.active) ? view.active : 'analysis';
      if (active !== 'analysis') onmonth(active);
      await refresh();
    })().catch((error) => (message = error.message));
    const changes = new BroadcastChannel(`planning-${repository.db.name}`);
    changes.onmessage = () => void refresh();
    broadcast = () => changes.postMessage('changed');
    return () => {
      alive = false;
      clearTimeout(clickTimer);
      changes.close();
      onbusy(false);
    };
  });
</script>

<svelte:document
  onpointerdown={(event) => {
    if (
      !(event.target instanceof Element) ||
      !event.target.closest('[data-plan-row]') ||
      !root.contains(event.target)
    )
      selected = new Set();
  }}
/>
<section
  class="financial-plan"
  bind:this={root}
  aria-label={t('Financial planning', 'Perencanaan keuangan')}
>
  <nav class="planning-tabs" aria-label={t('Finance tabs', 'Tab keuangan')}>
    <button
      class="analysis-tab"
      class:active={active === 'analysis'}
      aria-current={active === 'analysis' ? 'page' : undefined}
      onclick={() => {
        active = 'analysis';
        selected = new Set();
        remember();
      }}><Icon name="finance" />{t('Analysis', 'Analisis')}</button
    >
    {#each tabs as month (month)}<div
        class="month-tab"
        class:active={active === month}
      >
        <button
          aria-current={active === month ? 'page' : undefined}
          onclick={() => openMonth(month)}
          ><Icon name="calendar" />{monthLabel(month)}</button
        ><button
          class="close-month"
          aria-label={t(
            `Close ${monthLabel(month)}`,
            `Tutup ${monthLabel(month)}`,
          )}
          onclick={() => closeMonth(month)}>×</button
        >
      </div>{/each}
  </nav>
  <div class="planning-content">
    {#if message && !formOpen}<div role="alert" class="plan-error">
        {message}<button disabled={busy} onclick={() => refresh()}
          >{t('Reload plans', 'Muat ulang rencana')}</button
        >
      </div>{/if}
    {#if active === 'analysis'}
      <div class="plan-heading">
        <div>
          <h1>{t('Financial overview', 'Analisis keuangan')}</h1>
          <p>
            {t(
              'Compare actual income and expenses across months.',
              'Bandingkan pemasukan dan pengeluaran aktual antarbulan.',
            )}
          </p>
        </div>
        <button
          class="primary"
          disabled={!writable || busy || !initialized}
          onclick={() => show('create')}
          >{t('Create month from a plan', 'Buat bulan dari rencana')}</button
        >
      </div>
      <p class="chart-legend">
        {t('Income', 'Pemasukan')} <span>●</span> · {t(
          'Expenses',
          'Pengeluaran',
        )} <span>●</span>
      </p>
      <div class="month-chart">
        {#each chart as entry (entry.month)}<button
            class="month-chart-column"
            aria-label={t(
              `Open ${monthLabel(entry.month)}`,
              `Buka ${monthLabel(entry.month)}`,
            )}
            onclick={() => openMonth(entry.month)}
            ><div class="month-bars">
              <i style:height={`${(entry.income / chartMax) * 100}%`}></i><i
                style:height={`${(entry.expense / chartMax) * 100}%`}
              ></i>
            </div>
            <strong>{monthLabel(entry.month)}</strong><small
              >+{money(entry.income)}</small
            ><small>−{money(entry.expense)}</small></button
          >{:else}<p class="muted">
            {t('No monthly data yet.', 'Belum ada data bulanan.')}
          </p>{/each}
      </div>
      <h3>{t('Open a month', 'Buka bulan')}</h3>
      <div class="month-links">
        {#each months as month}<button onclick={() => openMonth(month)}
            >{monthLabel(month)}</button
          >{/each}
      </div>
    {:else}
      <h1 class="month-title">{monthLabel(active)}</h1>
      <div class="plan-summary">
        {#each [['opening', t('Opening balance', 'Saldo awal')], ['planned', t('Planned ending balance', 'Sisa sesuai rencana')], ['projected', t('Projected ending balance', 'Perkiraan sisa akhir')], ['current', t('Current balance', 'Saldo realisasi')]] as [key, label]}
          <div class="summary-card">
            <small>{label}</small><strong
              data-plan-summary={key}
              class:deficit={summary[key as keyof typeof summary] < 0}
              >{money(summary[key as keyof typeof summary])}</strong
            >{#if key === 'opening'}<button
                disabled={!writable || busy}
                onclick={() => show('opening')}>{t('Edit', 'Ubah')}</button
              >{/if}
          </div>
        {/each}
      </div>
      <div class="plan-columns">
        {#each groups as card (card.key)}<section
            class="plan-group"
            aria-label={groupLabel(card.key)}
            data-plan-group={card.key}
          >
            <h2>{groupLabel(card.key)}</h2>
            <p class="plan-realized">
              {t(
                `${card.stats.realized} of ${card.stats.count} items realized`,
                `${card.stats.realized} dari ${card.stats.count} item terealisasi`,
              )}
            </p>
            <div
              class="budget-meter"
              class:deficit={card.key !== 'income' && card.stats.left < 0}
              class:low={card.stats.percent < 20 && card.stats.left >= 0}
            >
              <div>
                <strong
                  >{money(
                    card.key === 'income' ? card.stats.used : card.stats.left,
                  )}</strong
                ><span
                  >{card.key === 'income'
                    ? t('received', 'diterima')
                    : card.stats.left < 0
                      ? t('Deficit', 'Defisit')
                      : t(
                          `${card.stats.percent}% remaining`,
                          `${card.stats.percent}% tersisa`,
                        )}</span
                >
              </div>
              <div
                class="battery"
                role="meter"
                aria-label={groupLabel(card.key)}
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={percent(
                  card.key === 'income'
                    ? card.stats.budget
                      ? (card.stats.used / card.stats.budget) * 100
                      : 0
                    : card.stats.percent,
                )}
              >
                <i
                  style:width={`${percent(card.key === 'income' ? (card.stats.budget ? (card.stats.used / card.stats.budget) * 100 : 0) : card.stats.percent)}%`}
                ></i>
              </div>
              <small
                >{t('Planned', 'Rencana')}: {money(card.stats.budget)} · {t(
                  'Actual',
                  'Realisasi',
                )}: {money(card.stats.used)}</small
              >
            </div>
            <div class="plan-items-scroll">
              <table>
                <thead
                  ><tr
                    ><th>{t('Category', 'Kategori')}</th><th
                      >{t('Budget / Actual', 'Anggaran / Realisasi')}</th
                    ></tr
                  ></thead
                ><tbody>
                  {#each card.rows as plan (plan.id)}<tr
                      data-plan-row={plan.id}
                      class:selected={selected.has(plan.id)}
                      class:excluded={!plan.enabled}
                      tabindex="0"
                      onpointerdown={(event) => pointerDown(event, plan)}
                      onpointermove={pointerMove}
                      onpointerup={pointerUp}
                      onpointercancel={() => {
                        drag = null;
                        draft = null;
                      }}
                      onkeydown={(event) => rowKey(event, plan)}
                    >
                      <td
                        ><button
                          class="plan-category"
                          onclick={(event) => {
                            if (event.detail === 0) void show('category', plan);
                          }}>{plan.category}</button
                        >
                        <div class="plan-item-controls">
                          <button
                            data-row-action
                            class="plan-state"
                            aria-pressed={plan.enabled}
                            aria-label={t(
                              `${plan.enabled ? 'Exclude' : 'Include'} ${plan.category}`,
                              `${plan.enabled ? 'Kecualikan' : 'Sertakan'} ${plan.category}`,
                            )}
                            title={plan.enabled
                              ? t(
                                  'Included — click to exclude',
                                  'Dihitung — klik untuk mengecualikan',
                                )
                              : t(
                                  'Excluded — click to include',
                                  'Tidak dihitung — klik untuk menyertakan',
                                )}
                            disabled={!writable || busy}
                            onclick={() => toggle(plan)}
                            ><Icon
                              name={plan.enabled ? 'eye' : 'eye-off'}
                            /></button
                          ><button
                            data-row-action
                            class="plan-note"
                            disabled={!writable || busy}
                            onclick={() => show('note', plan)}
                            >{plan.note || t('Note', 'Catatan')}</button
                          >
                        </div></td
                      >
                      <td
                        ><strong>{money(plan.amount)}</strong><button
                          data-row-action
                          class="plan-actual"
                          class:deficit={planType(plan) === 'expense' &&
                            actualAmount(plan, transactions) > plan.amount}
                          disabled={!writable || busy}
                          aria-label={t(
                            `Record transaction for ${plan.category}`,
                            `Catat transaksi ${plan.category}`,
                          )}
                          onclick={() =>
                            ontransaction(undefined, {
                              type: planType(plan),
                              title: plan.category,
                              category: plan.category,
                              amount: Math.max(
                                1,
                                plan.amount - actualAmount(plan, transactions),
                              ),
                              date: dateInMonth(active),
                            })}
                          >{money(
                            actualAmount(plan, transactions),
                          )}{actualAmount(plan, transactions) > plan.amount
                            ? ' !'
                            : ''}</button
                        ></td
                      >
                    </tr>{:else}<tr
                      ><td colspan="2" class="empty-plan"
                        >{t('No plans yet', 'Belum ada rencana')}</td
                      ></tr
                    >{/each}
                </tbody>
              </table>
            </div>
            <form
              class="plan-inline-form"
              onsubmit={(event) => {
                event.preventDefault();
                void add(card.key);
              }}
            >
              <label
                >{t('Category', 'Kategori')}<SuggestionField
                  id={`plan-category-${card.key}`}
                  label={t('Category', 'Kategori')}
                  options={categories}
                  bind:value={inline[card.key].category}
                  placeholder={t(
                    'Search or add category',
                    'Cari atau tambah kategori',
                  )}
                  required
                  maxlength={60}
                  disabled={!writable || busy}
                /></label
              ><label
                >{t(
                  `Amount (${$displayCurrency})`,
                  `Nominal (${$displayCurrency})`,
                )}<MoneyField
                  bind:value={inline[card.key].amount}
                  min={0}
                  required
                  disabled={!writable || busy}
                /></label
              ><button class="primary" disabled={!writable || busy}
                >{t('Save', 'Simpan')}</button
              >
            </form>
          </section>{/each}
      </div>
    {/if}
  </div>
</section>

<dialog
  class="finance-dialog"
  bind:this={modal}
  oncancel={(event) => {
    event.preventDefault();
    if (!busy) close();
  }}
>
  <form
    onsubmit={(event) => {
      event.preventDefault();
      if (mode !== 'category') void submit();
    }}
  >
    <div class="dialog-heading">
      <h2>
        {mode === 'create'
          ? t('Create monthly plan', 'Buat rencana bulanan')
          : mode === 'opening'
            ? t('Opening balance', 'Saldo awal')
            : mode === 'note'
              ? t('Category note', 'Catatan kategori')
              : mode === 'category'
                ? editing?.category
                : mode === 'delete'
                  ? t('Delete budget?', 'Hapus anggaran?')
                  : t('Edit budget', 'Ubah anggaran')}
      </h2>
      <button
        type="button"
        disabled={busy}
        aria-label={t('Close planning dialog', 'Tutup dialog perencanaan')}
        onclick={close}>×</button
      >
    </div>
    {#if mode === 'create'}<label
        >{t('Copy plan from', 'Salin rencana dari')}<select
          bind:value={source}
          disabled={busy}
          ><option value="">{t('Start empty', 'Mulai kosong')}</option
          >{#each state.months as entry}<option value={entry.month}
              >{monthLabel(entry.month)}</option
            >{/each}</select
        ></label
      ><label
        >{t('New month', 'Bulan baru')}<input
          bind:this={focusInput}
          type="month"
          bind:value={destination}
          required
          disabled={busy}
        /></label
      >
      <p class="muted">
        {t(
          'Income and recurring budgets are copied. Monthly expense budgets start at zero. Actual transactions and opening balances are never copied.',
          'Anggaran pemasukan dan rutin disalin. Anggaran pengeluaran bulan ini dimulai dari nol. Transaksi realisasi dan saldo awal tidak disalin.',
        )}
      </p>
    {:else if mode === 'category'}<p class="muted">
        {editing ? monthLabel(editing.month) : ''} · {money(
          categoryItems.reduce((sum, item) => sum + item.amount, 0),
        )}
      </p>
      <div class="category-transactions">
        {#each categoryItems as item}<button
            type="button"
            onclick={() => {
              close();
              ontransaction(item);
            }}
            ><span
              >{item.title}<small
                >{new Intl.DateTimeFormat(
                  language === 'en' ? 'en-GB' : 'id-ID',
                  { day: 'numeric', month: 'long', year: 'numeric' },
                ).format(new Date(item.date + 'T12:00:00'))}</small
              ></span
            ><strong>{money(item.amount)}</strong></button
          >{:else}<p>
            {t(
              'No transactions in this category this month.',
              'Belum ada transaksi kategori ini pada bulan tersebut.',
            )}
          </p>{/each}
      </div>
    {:else if mode === 'note'}<p>{editing?.category}</p>
      <label
        >{t('Note', 'Catatan')}<input
          bind:this={focusInput}
          bind:value={note}
          maxlength="2000"
          disabled={busy}
        /></label
      >{#if editing?.note}<button
          type="button"
          class="danger"
          disabled={busy}
          onclick={() => {
            note = '';
            void submit();
          }}>{t('Delete note', 'Hapus catatan')}</button
        >{/if}
    {:else if mode === 'delete'}<p>
        {t(
          'Remove this budget? Recorded transactions will remain in Finance.',
          'Hapus anggaran ini? Transaksi yang dicatat tetap ada di Finance.',
        )}
      </p>
    {:else}
      {#if mode === 'budget'}<label
          >{t('Category', 'Kategori')}<SuggestionField
            id="edit-plan-category"
            label={t('Category', 'Kategori')}
            options={categories}
            bind:input={focusInput}
            bind:value={category}
            required
            maxlength={60}
            disabled={busy}
          /></label
        ><label
          >{t('Group', 'Kelompok')}<select bind:value={group} disabled={busy}
            >{#each ['income', 'recurring', 'monthly'] as key}<option
                value={key}>{groupLabel(key as PlanGroup)}</option
              >{/each}</select
          ></label
        >{/if}
      <label
        >{t(
          `Amount (${$displayCurrency})`,
          `Nominal (${$displayCurrency})`,
        )}<MoneyField
          bind:value={amount}
          min={mode === 'opening' ? -1000000000000 : 0}
          required
          disabled={busy}
        /></label
      >
      {#if mode === 'budget'}<button
          type="button"
          class="danger"
          disabled={busy}
          onclick={() => (mode = 'delete')}
          >{t('Delete budget', 'Hapus anggaran')}</button
        >{/if}
    {/if}
    {#if message}<p role="alert" class="plan-error">{message}</p>
      <button type="button" disabled={busy} onclick={() => refresh(true)}
        >{t('Reload plans', 'Muat ulang rencana')}</button
      >{/if}
    <footer>
      <button
        type="button"
        disabled={busy}
        onclick={() => (mode === 'delete' ? (mode = 'budget') : close())}
        >{mode === 'category'
          ? t('Close', 'Tutup')
          : t('Cancel', 'Batal')}</button
      >{#if mode !== 'category'}<button
          type="submit"
          class:primary={mode !== 'delete'}
          class:danger={mode === 'delete'}
          disabled={!writable || busy}
          >{mode === 'delete'
            ? t('Delete', 'Hapus')
            : t('Save', 'Simpan')}</button
        >{/if}
    </footer>
  </form>
</dialog>

<style>
  .financial-plan {
    min-width: 0;
    height: 100%;
    overflow: auto;
  }
  .planning-tabs {
    display: flex;
    height: 46px;
    border-bottom: 1px solid var(--line);
    overflow-x: auto;
    flex-shrink: 0;
  }
  .planning-tabs button {
    background: transparent;
    border: 0;
    border-radius: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    font-size: 12px;
    white-space: nowrap;
  }
  .planning-tabs :global(svg) {
    width: 17px;
    height: 17px;
  }
  .month-tab {
    display: flex;
    flex: 0 0 auto;
    border-right: 1px solid var(--line);
    padding-right: 6px;
  }
  .month-tab .close-month {
    width: 24px;
    padding: 0;
    justify-content: center;
  }
  .planning-tabs .analysis-tab {
    min-width: 132px;
    padding: 0 28px 0 14px;
    background: #142b32;
    color: #8de7ec;
  }
  .planning-tabs .analysis-tab.active {
    background: #193940;
    color: #c1f8fa;
  }
  .planning-tabs .active {
    box-shadow: inset 0 -3px var(--accent);
  }
  .planning-content {
    padding: 12px;
  }
  h1 {
    margin: 8px 0 24px;
    font-size: 28px;
    letter-spacing: -0.7px;
  }
  .plan-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }
  .plan-heading h1 {
    margin-bottom: 10px;
  }
  .plan-heading p {
    color: #eef5f7;
    line-height: 1.5;
  }
  .chart-legend span {
    color: #17c5d5;
  }
  .chart-legend span + span {
    color: #ff987a;
  }
  .month-chart {
    display: flex;
    gap: 22px;
    overflow-x: auto;
    padding: 24px 0;
  }
  .month-chart-column {
    min-width: 145px;
    border: 0;
    background: transparent;
  }
  .month-chart-column small {
    display: block;
    margin-top: 6px;
  }
  .month-bars {
    height: 220px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: 8px;
    margin-bottom: 16px;
    border-bottom: 1px solid #34434b;
  }
  .month-bars i {
    width: 32px;
    min-height: 2px;
    background: #17c5d5;
    border-radius: 5px 5px 0 0;
  }
  .month-bars i + i {
    background: #ff987a;
  }
  .month-links {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .plan-summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(140px, 1fr));
    gap: 12px;
    overflow-x: auto;
    margin: 14px 0 12px;
  }
  .summary-card {
    padding: 10px;
    background: linear-gradient(140deg, #12222a, #0a151a);
    border: 1px solid #233039;
    border-radius: 7px;
  }
  .summary-card small {
    font-size: 11px;
  }
  .summary-card strong {
    display: block;
    color: var(--accent);
    font-size: 18px;
    margin-top: 8px;
    white-space: nowrap;
  }
  .summary-card button {
    display: block;
    background: none;
    border: 0;
    padding: 12px 0 0;
    font-size: 11px;
    color: #eef5f7;
  }
  .plan-columns {
    display: grid;
    grid-template-columns: repeat(3, minmax(275px, 1fr));
    gap: 10px;
    overflow-x: auto;
    padding-bottom: 16px;
    align-items: stretch;
  }
  .plan-group {
    height: 640px;
    background: #111b20;
    border: 1px solid #233039;
    border-radius: 10px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .plan-group h2 {
    padding: 12px;
    margin: 0;
    font-size: 18px;
    letter-spacing: -0.5px;
  }
  .plan-realized {
    margin: 0 12px 8px;
    color: #eef5f7;
    font-size: 14px;
  }
  .budget-meter {
    padding: 0 12px 10px;
    color: var(--accent);
  }
  .budget-meter > div:first-child {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    font-size: 15px;
  }
  .budget-meter small {
    font-size: 13px;
    line-height: 1.6;
  }
  .battery {
    height: 10px;
    border: 1px solid currentColor;
    border-radius: 3px;
    margin: 7px 0;
    padding: 2px;
  }
  .battery i {
    display: block;
    height: 100%;
    background: currentColor;
    border-radius: 1px;
  }
  .low {
    color: #ffc76b;
  }
  .deficit {
    color: #ff777f !important;
  }
  .plan-items-scroll {
    flex: 1;
    min-height: 0;

    overflow-y: auto;
    overscroll-behavior-y: contain;
    scrollbar-gutter: stable;
  }
  table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
  }
  th {
    position: sticky;
    top: 0;
    z-index: 2;
    background: #111b20;
    font-size: 14px;
    font-weight: 400;
    color: #eef5f7;
  }
  td,
  th {
    padding: 7px 10px;
    border-bottom: 1px solid var(--line);
    text-align: left;
    vertical-align: top;
  }
  td {
    font-size: 16px;
    line-height: 1.5;
  }
  td + td,
  th + th {
    text-align: right;
  }
  td strong {
    font-size: 15px;
    overflow-wrap: anywhere;
  }

  [data-plan-row] {
    cursor: grab;
    user-select: none;
    touch-action: pan-x pan-y;
  }
  [data-plan-row].selected {
    background: #00d8ec18;
    box-shadow: inset 3px 0 var(--accent);
    touch-action: none;
  }
  [data-plan-row].excluded {
    color: #89979f;
  }
  [data-plan-row].excluded :is(button, strong, small) {
    color: #89979f !important;
  }
  .plan-category,
  .plan-note,
  .plan-actual,
  .plan-state {
    border: 0;
    background: transparent;
    padding: 0;
    font: inherit;
  }
  .plan-category {
    text-align: left;
    overflow-wrap: anywhere;
  }
  .plan-category:hover {
    color: var(--accent);
  }
  .plan-item-controls {
    display: flex;
    align-items: flex-start;
    gap: 3px;
    margin-top: 3px;
  }
  .plan-state {
    flex: 0 0 24px;
    width: 24px;
    height: 28px;
    color: #eef5f7;
    display: grid;
    place-items: center;
  }
  .plan-state :global(svg) {
    width: 17px;
    height: 17px;
  }
  .plan-note {
    color: #eef5f7;
    font-size: 13px;
    min-width: 0;
    text-align: left;
    overflow-wrap: anywhere;
    line-height: 1.5;
    padding-top: 4px;
  }
  .plan-actual {
    display: block;
    color: var(--accent);
    font-size: 15px;
    margin: 5px 0 0 auto;
  }
  .plan-inline-form {
    margin-top: auto;
    padding: 12px;
    display: grid;
    gap: 7px;
    border-top: 1px solid #233039;
  }
  .plan-inline-form label {
    display: grid;
    margin: 0;
    gap: 4px;
    font-size: 13px;
    color: #eef5f7;
  }
  .plan-inline-form :global(input) {
    width: 100%;
    min-width: 0;
    padding: 10px;
  }
  .empty-plan {
    text-align: center;
    color: #eef5f7;
    padding: 30px 10px;
    font-size: 13px;
  }
  .plan-error {
    color: #ff9a9e;
    margin-bottom: 16px;
  }
  .plan-error button {
    display: block;
    margin-top: 8px;
  }
  .category-transactions {
    max-height: 55vh;
    overflow: auto;
  }
  .category-transactions button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    width: 100%;
    text-align: left;
    padding: 14px 0;
    border: 0;
    border-bottom: 1px solid var(--line);
    background: transparent;
  }
  .category-transactions small {
    display: block;
    margin-top: 6px;
  }
  @media (max-width: 900px) {
    .financial-plan {
      height: auto;
      overflow: visible;
    }
    .planning-content {
      padding: 18px;
    }
    .plan-columns {
      grid-template-columns: repeat(3, 275px);
    }
    .plan-summary {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .summary-card strong {
      font-size: 17px;
    }
    .plan-items-scroll {
      flex: 1;
      min-height: 0;
      max-height: 360px;
    }
    .plan-note,
    .plan-state {
      min-height: 36px;
    }
  }
</style>
