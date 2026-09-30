// Monthly budgets and actual transactions share category/type/month matching.
function planText(en, id) {
  return language === 'en' ? en : id;
}
function financeMonthLabel(month) {
  const [year, number] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : 'id-ID', {
    month: 'long',
    year: '2-digit',
  }).format(new Date(year, number - 1, 1));
}
function planKey(category) {
  return String(category).trim().toLocaleLowerCase();
}
function monthPlans(month) {
  return (state.plans || []).filter((p) => p.month === month);
}
function planActual(plan) {
  return state.transactions
    .filter(
      (t) =>
        t.date?.slice(0, 7) === plan.month &&
        t.type === plan.type &&
        planKey(t.category) === planKey(plan.category),
    )
    .reduce((sum, t) => sum + Number(t.amount), 0);
}
function syncUnplannedExpenses(month) {
  state.plans ??= [];
  let changed = false;
  const expenses = state.transactions.filter(
    (t) => t.type === 'expense' && t.date?.slice(0, 7) === month,
  );
  const retained = state.plans.filter(
    (p) =>
      !(
        p.month === month &&
        p.unplanned &&
        !expenses.some((t) => planKey(t.category) === planKey(p.category))
      ),
  );
  if (retained.length !== state.plans.length) {
    state.plans = retained;
    changed = true;
  }
  expenses.forEach((t) => {
    if (
      !monthPlans(month).some(
        (p) =>
          p.type === 'expense' && planKey(p.category) === planKey(t.category),
      )
    ) {
      state.plans.push({
        id: uid(),
        month,
        category: t.category.trim(),
        title: t.category.trim(),
        type: 'expense',
        group: 'monthly',
        amount: 0,
        unplanned: true,
      });
      changed = true;
    }
  });
  if (changed) save();
}
function plannerRender() {
  let root = $('#financial-plan');
  if (!root) {
    root = document.createElement('section');
    root.id = 'financial-plan';
    $('#workspace').insertBefore(root, $('.right-pane'));
  }
  state.financeTabs ??= [];
  state.financeActiveTab ??= 'analysis';
  const tabs = () =>
    `<div class="tabs finance-tabs"><button class="tab ${state.financeActiveTab === 'analysis' ? 'active' : ''}" data-finance-tab="analysis">${icon('chart')}${planText('Analysis', 'Analisis')}</button>${state.financeTabs.map((m) => `<div class="tab ${state.financeActiveTab === m ? 'active' : ''}"><button data-finance-tab="${m}">${icon('calendar')}${esc(financeMonthLabel(m))}</button><button data-close-finance="${m}" aria-label="Close month">×</button></div>`).join('')}</div>`;
  if (state.financeActiveTab === 'analysis') {
    root.innerHTML = tabs() + financeAnalysis();
    bindFinanceTabs(root);
    $('#create-finance-month').onclick = copyFinanceMonth;
    root
      .querySelectorAll('[data-open-month]')
      .forEach(
        (b) => (b.onclick = () => openFinanceMonth(b.dataset.openMonth)),
      );
    return;
  }
  $('#month').value = state.financeActiveTab;
  const month = $('#month').value;
  if (!month) return;
  expandFinanceExamples();
  syncUnplannedExpenses(month);
  const plans = monthPlans(month),
    opening = Number(state.openingBalances?.[month] || 0),
    sum = (type) =>
      plans
        .filter((p) => p.enabled !== false && p.type === type)
        .reduce((n, p) => n + p.amount, 0),
    transactions = state.transactions.filter(
      (t) => t.date?.slice(0, 7) === month,
    ),
    actual = (type) =>
      transactions
        .filter((t) => t.type === type)
        .reduce((n, t) => n + Number(t.amount), 0);
  const projected = (type) =>
    plans
      .filter((p) => p.enabled !== false && p.type === type)
      .reduce((n, p) => n + Math.max(p.amount, planActual(p)), 0) +
    transactions
      .filter(
        (t) =>
          t.type === type &&
          !plans.some(
            (p) =>
              p.type === type && planKey(p.category) === planKey(t.category),
          ),
      )
      .reduce((n, t) => n + Number(t.amount), 0);
  root.innerHTML =
    tabs() +
    `<div class="plan-heading"><div><h3>${esc(financeMonthLabel(month))}</h3></div></div><div class="plan-summary">${[
      [planText('Opening balance', 'Saldo awal'), opening],
      [
        planText('Planned ending balance', 'Sisa sesuai rencana'),
        opening + sum('income') - sum('expense'),
      ],
      [
        planText('Projected ending balance', 'Perkiraan sisa akhir'),
        opening + projected('income') - projected('expense'),
      ],
      [
        planText('Current balance', 'Saldo realisasi'),
        opening + actual('income') - actual('expense'),
      ],
    ]
      .map(
        ([label, value], i) =>
          `<div class="balance-card"><small>${label}</small><strong>${rupiah(value)}</strong>${i === 0 ? `<button class="text-button" id="edit-opening">${planText('Edit', 'Ubah')}</button>` : ''}</div>`,
      )
      .join('')}</div><div class="plan-columns">${[
      ['income', planText('Income', 'Pemasukan')],
      ['recurring', planText('Recurring expenses', 'Pengeluaran rutin')],
      ['monthly', planText('This month’s expenses', 'Pengeluaran bulan ini')],
    ]
      .map(([group, label]) => {
        const rows = plans.filter(
            (p) => (p.type === 'income' ? 'income' : p.group) === group,
          ),
          activeRows = rows.filter((p) => p.enabled !== false),
          budget = activeRows.reduce((n, p) => n + p.amount, 0),
          used = activeRows.reduce((n, p) => n + planActual(p), 0),
          left = budget - used,
          percent = budget ? Math.round((left / budget) * 100) : 0,
          realized = activeRows.filter(
            (p) => planActual(p) > 0 && planActual(p) >= p.amount,
          ).length;
        return `<section class="plan-group"><h3>${label}</h3><p class="plan-realized">${planText(`${realized} of ${activeRows.length} items realized`, `${realized} dari ${activeRows.length} item terealisasi`)}</p><div class="budget-meter ${left < 0 ? 'deficit' : percent < 20 ? 'low' : ''}"><div><strong>${rupiah(group === 'income' ? used : left)}</strong><span>${group === 'income' ? planText('received', 'diterima') : left < 0 ? planText('Deficit', 'Defisit') : planText(`${percent}% remaining`, `${percent}% tersisa`)}</span></div><div class="battery" role="meter" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.max(0, Math.min(100, group === 'income' ? 100 - percent : percent))}"><i style="width:${Math.max(0, Math.min(100, group === 'income' ? 100 - percent : percent))}%"></i></div><small>${planText('Planned', 'Rencana')}: ${rupiah(budget)} · ${planText('Actual', 'Realisasi')}: ${rupiah(used)}</small></div><div class="plan-items-scroll"><table class="plan-table"><thead><tr><th>${planText('Category', 'Kategori')}</th><th>${planText('Budget / Actual', 'Anggaran / Realisasi')}</th></tr></thead><tbody data-plan-group="${group}">${
          rows
            .map((p) => {
              const a = planActual(p),
                remaining = p.amount - a;
              return `<tr data-plan-row="${p.id}" class="${p.enabled === false ? 'plan-disabled' : ''}" tabindex="0"><td><button class="plan-category-link" data-category-items="${p.id}">${esc(p.category)}</button><div class="plan-item-controls"><button type="button" class="plan-state-button" data-plan-state="${p.id}" aria-pressed="${p.enabled !== false}" aria-label="${planText(p.enabled === false ? 'Include in calculations' : 'Exclude from calculations', p.enabled === false ? 'Sertakan dalam perhitungan' : 'Keluarkan dari perhitungan')} ${esc(p.category)}" title="${planText(p.enabled === false ? 'Excluded — click to include' : 'Included — click to exclude', p.enabled === false ? 'Tidak dihitung — klik untuk menyertakan' : 'Dihitung — klik untuk mengecualikan')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>${p.enabled === false ? '<path d="m3 3 18 18"/>' : ''}</svg></button><button type="button" class="plan-note-button ${p.note?.trim() ? 'has-note' : ''}" data-edit-plan-note="${p.id}">${p.note?.trim() ? esc(p.note) : planText('Note', 'Catatan')}</button></div></td><td><strong>${rupiah(p.amount)}</strong><button class="plan-actual ${a > p.amount ? 'over-budget' : ''}" data-plan-record="${p.id}" title="${planText('Record transaction', 'Catat transaksi')}">${rupiah(a)} ${a > p.amount ? '!' : ''}</button>${p.type === 'expense' ? `<small class="${remaining < 0 ? 'over-budget' : ''}">${remaining < 0 ? planText('Deficit', 'Defisit') : planText('Left', 'Sisa')} ${rupiah(Math.abs(remaining))}</small>` : ''}</td></tr>`;
            })
            .join('') ||
          `<tr><td colspan="2" class="empty">${planText('No plans yet', 'Belum ada rencana')}</td></tr>`
        }</tbody></table></div><form class="plan-inline-form" data-plan-add="${group}"><label>${planText('Category', 'Kategori')}<input name="category" list="plan-category-options" required maxlength="60" placeholder="${planText('Search or add category', 'Cari atau tambah kategori')}" autocomplete="off"></label><label>${planText('Amount (Rp)', 'Nominal (Rp)')}<input name="amount" type="number" min="1" step="1" required placeholder="0"></label><button class="primary" type="submit">${planText('Save', 'Simpan')}</button></form></section>`;
      })
      .join(
        '',
      )}</div><datalist id="plan-category-options">${[...new Set([...state.transactions.map((t) => t.category), ...(state.plans || []).map((p) => p.category)])].map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist>`;
  bindFinanceTabs(root);
  $('#edit-opening').onclick = () => {
    openForm(
      planText('Opening balance', 'Saldo awal'),
      field(
        planText('Amount (Rp)', 'Nominal (Rp)'),
        'amount',
        'number',
        opening,
        true,
      ),
      (d) => {
        state.openingBalances ??= {};
        state.openingBalances[month] = Number(d.amount);
        save();
        plannerRender();
      },
    );
    $('[name=amount]').removeAttribute('min');
  };
  root
    .querySelectorAll('[data-edit-plan-note]')
    .forEach(
      (button) =>
        (button.onclick = () =>
          editPlanNote(
            plans.find((p) => p.id === button.dataset.editPlanNote),
          )),
    );
  root.querySelectorAll('[data-plan-state]').forEach(
    (button) =>
      (button.onclick = () => {
        const plan = plans.find((p) => p.id === button.dataset.planState);
        plan.enabled = plan.enabled === false;
        save();
        plannerRender();
      }),
  );
  root.querySelectorAll('[data-category-items]').forEach((button) => {
    let timer;
    button.onclick = (e) => {
      if (e.shiftKey) return;
      clearTimeout(timer);
      timer = setTimeout(
        () =>
          showCategoryTransactions(
            plans.find((p) => p.id === button.dataset.categoryItems),
          ),
        250,
      );
    };
    button.ondblclick = (e) => {
      e.stopPropagation();
      clearTimeout(timer);
      planForm(plans.find((p) => p.id === button.dataset.categoryItems));
    };
  });
  root.querySelectorAll('[data-plan-row]').forEach((row) => {
    row.ondblclick = (e) => {
      if (!e.target.closest('button,input,textarea,label'))
        planForm(plans.find((p) => p.id === row.dataset.planRow));
    };
    row.onkeydown = (e) => {
      if (e.target === row && e.key === 'F2') {
        e.preventDefault();
        planForm(plans.find((p) => p.id === row.dataset.planRow));
      }
    };
  });
  root.querySelectorAll('[data-plan-add]').forEach(
    (form) =>
      (form.onsubmit = (e) => {
        e.preventDefault();
        const data = new FormData(form),
          category = String(data.get('category')).trim(),
          amount = Number(data.get('amount')),
          group = form.dataset.planAdd,
          type = group === 'income' ? 'income' : 'expense';
        if (!category || !Number.isFinite(amount) || amount <= 0) return;
        if (
          plans.some(
            (p) => p.type === type && planKey(p.category) === planKey(category),
          )
        ) {
          toast(
            planText(
              'This category already has a budget. Double-click it to edit.',
              'Kategori ini sudah memiliki anggaran. Klik dua kali untuk mengubahnya.',
            ),
          );
          return;
        }
        state.plans ??= [];
        state.plans.push({
          id: uid(),
          month,
          title: category,
          category,
          amount,
          group,
          type,
        });
        save();
        plannerRender();
      }),
  );
  root.querySelectorAll('[data-plan-group]').forEach((body) =>
    bindReorder(
      body,
      '[data-plan-row]',
      '[data-plan-row]',
      'planRow',
      false,
      () => true,
      (ids) => {
        const selected = new Set(ids),
          ordered = ids.map((id) => state.plans.find((p) => p.id === id));
        let index = 0;
        state.plans = state.plans.map((p) =>
          selected.has(p.id) ? ordered[index++] : p,
        );
        save();
      },
    ),
  );
  root.querySelectorAll('[data-plan-record]').forEach(
    (b) =>
      (b.onclick = () => {
        const p = plans.find((p) => p.id === b.dataset.planRecord);
        transactionForm();
        $('[name=title]').value = p.category;
        $('[name=category]').value = p.category;
        $('[name=type]').value = p.type;
        $('[name=amount]').value =
          Math.max(0, p.amount - planActual(p)) || p.amount;
      }),
  );
}
function financeCategoryField(value = '') {
  const categories = [
    ...new Set([
      ...state.transactions.map((t) => t.category),
      ...(state.plans || []).map((p) => p.category),
    ]),
  ];
  return `<label class="field">${planText('Category', 'Kategori')}<input name="category" list="finance-categories" value="${esc(value)}" required maxlength="60" autocomplete="off"><datalist id="finance-categories">${categories.map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist></label>`;
}
function planForm(plan) {
  const month = $('#month').value;
  openForm(
    planText(
      plan ? 'Edit plan' : 'New plan',
      plan ? 'Ubah rencana' : 'Rencana baru',
    ),
    financeCategoryField(plan?.category) +
      `<label class="field">${planText('Group', 'Kelompok')}<select name="group">${[
        ['income', planText('Income', 'Pemasukan')],
        ['recurring', planText('Recurring expenses', 'Pengeluaran rutin')],
        ['monthly', planText('This month’s expenses', 'Pengeluaran bulan ini')],
      ]
        .map(
          ([v, l]) =>
            `<option value="${v}" ${(plan?.type === 'income' ? 'income' : plan?.group || 'monthly') === v ? 'selected' : ''}>${l}</option>`,
        )
        .join('')}</select></label>` +
      field(
        planText('Planned amount (Rp)', 'Nominal rencana (Rp)'),
        'amount',
        'number',
        plan?.amount || '',
        true,
      ) +
      (plan
        ? `<button type="button" class="danger" id="delete-plan">${planText('Delete plan', 'Hapus rencana')}</button>`
        : ''),
    (d) => {
      const type = d.group === 'income' ? 'income' : 'expense',
        category = d.category.trim();
      state.plans ??= [];
      if (
        state.plans.some(
          (p) =>
            p.id !== plan?.id &&
            p.month === month &&
            p.type === type &&
            planKey(p.category) === planKey(category),
        )
      ) {
        toast(
          planText(
            'This category already has a plan. Edit its budget instead.',
            'Kategori ini sudah memiliki rencana. Ubah anggarannya.',
          ),
        );
        return;
      }
      const values = {
        title: category,
        category,
        type,
        group: d.group,
        amount: Number(d.amount),
        month,
        unplanned: false,
      };
      if (plan) Object.assign(plan, values);
      else state.plans.push({ id: uid(), ...values });
      save();
      financeRender();
    },
  );
  $('[name=amount]').min = '1';
  if (plan)
    $('#delete-plan').onclick = () => {
      $('#dialog').close();
      confirmDialog(
        planText('Delete plan?', 'Hapus rencana?'),
        planText(
          'Recorded transactions will be kept.',
          'Transaksi tercatat tetap disimpan.',
        ),
        () => {
          state.plans = state.plans.filter((p) => p.id !== plan.id);
          save();
          financeRender();
        },
      );
    };
}

function ensureFinanceExample() {
  if (state.financeExampleVersion) return;
  state.financeExampleVersion = 1;
  state.plans ??= [];
  let month = '2026-10';
  // Put examples in an unused month, preserving every existing plan and transaction.
  while (
    state.plans.some((p) => p.month === month) ||
    state.transactions.some((t) => t.date?.startsWith(month))
  ) {
    const [y, m] = month.split('-').map(Number),
      d = new Date(y, m, 1);
    month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  const examples = [
    ['Salary', 'Salary', 'income', 12900000, 12900000],
    ['Freelance work', 'Freelance', 'income', 1500000, 500000],
    ['Meals & groceries', 'Food', 'recurring', 3000000, 2200000],
    ['Housing', 'Housing', 'recurring', 1800000, 1800000],
    ['Internet & phone', 'Connectivity', 'recurring', 450000, 350000],
    ['Transport', 'Transport', 'recurring', 600000, 220000],
    ['Home maintenance', 'Maintenance', 'monthly', 400000, 550000],
    ['New monitor', 'Equipment', 'monthly', 2100000, 2100000],
    ['Weekend trip', 'Travel', 'monthly', 800000, 750000],
    ['Books', 'Books', 'monthly', 300000, 90000],
  ];
  examples.forEach(([title, category, group, amount, actual], i) => {
    const type = group === 'income' ? 'income' : 'expense';
    state.plans.push({
      id: uid(),
      month,
      title,
      category,
      group,
      type,
      amount,
    });
    state.transactions.push({
      id: uid(),
      title,
      category,
      type,
      amount: actual,
      date: month + '-' + String(i + 1).padStart(2, '0'),
    });
  });
  state.openingBalances ??= {};
  state.openingBalances[month] = 750000;
  state.financeExampleMonth = month;
  save();
  $('#month').value = month;
}

function expandFinanceExamples() {
  const month = state.financeExampleMonth;
  if (!month || state.financeExampleExpanded) return;
  state.financeExampleExpanded = true;
  const samples = [
    ['Bonus', 'income', 1000000, 1000000],
    ['Interest', 'income', 150000, 75000],
    ['Rent income', 'income', 1200000, 0],
    ['Dividends', 'income', 350000, 200000],
    ['Electricity', 'recurring', 450000, 380000],
    ['Water', 'recurring', 150000, 120000],
    ['Health insurance', 'recurring', 400000, 400000],
    ['Subscriptions', 'recurring', 250000, 290000],
    ['Family support', 'recurring', 1000000, 600000],
    ['Fitness', 'recurring', 300000, 300000],
    ['Gifts', 'monthly', 500000, 200000],
    ['Clothing', 'monthly', 600000, 450000],
    ['Dental care', 'monthly', 800000, 950000],
    ['Garden', 'monthly', 250000, 50000],
    ['Entertainment', 'monthly', 400000, 180000],
    ['Kitchen supplies', 'monthly', 350000, 0],
  ];
  samples.forEach(([category, group, amount, actual], i) => {
    const type = group === 'income' ? 'income' : 'expense';
    if (
      monthPlans(month).some(
        (p) => p.type === type && planKey(p.category) === planKey(category),
      )
    )
      return;
    state.plans.push({
      id: uid(),
      month,
      title: category,
      category,
      group,
      type,
      amount,
    });
    if (actual)
      state.transactions.push({
        id: uid(),
        title: category,
        category,
        type,
        amount: actual,
        date: month + '-' + String((i % 20) + 1).padStart(2, '0'),
      });
  });
  save();
}

function openFinanceMonth(month) {
  state.financeTabs ??= [];
  if (!state.financeTabs.includes(month)) state.financeTabs.push(month);
  state.financeActiveTab = month;
  $('#month').value = month;
  save();
  financeRender();
}
function bindFinanceTabs(root) {
  root.querySelectorAll('[data-finance-tab]').forEach(
    (b) =>
      (b.onclick = () => {
        state.financeActiveTab = b.dataset.financeTab;
        save();
        financeRender();
      }),
  );
  root.querySelectorAll('[data-close-finance]').forEach(
    (b) =>
      (b.onclick = () => {
        state.financeTabs = state.financeTabs.filter(
          (m) => m !== b.dataset.closeFinance,
        );
        if (state.financeActiveTab === b.dataset.closeFinance)
          state.financeActiveTab = 'analysis';
        save();
        financeRender();
      }),
  );
}
function financeAnalysis() {
  const months = [
    ...new Set([
      ...(state.plans || []).map((p) => p.month),
      ...state.transactions.map((t) => t.date?.slice(0, 7)),
    ]),
  ]
    .filter(Boolean)
    .sort();
  const data = months.map((month) => {
      const tx = state.transactions.filter(
          (t) => t.date?.slice(0, 7) === month,
        ),
        total = (type) =>
          tx
            .filter((t) => t.type === type)
            .reduce((n, t) => n + Number(t.amount), 0);
      return { month, income: total('income'), expense: total('expense') };
    }),
    max = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]));
  return `<div class="finance-analysis"><div class="plan-heading"><div><h3>${planText('Financial overview', 'Analisis keuangan')}</h3><p>${planText('Compare actual income and expenses across months.', 'Bandingkan pemasukan dan pengeluaran aktual antarbulan.')}</p></div><button class="primary" id="create-finance-month">${planText('Create month from a plan', 'Buat bulan dari rencana')}</button></div><p>${planText('Income', 'Pemasukan')} <span style="color:#17c5d5">●</span> · ${planText('Expenses', 'Pengeluaran')} <span style="color:#ff987a">●</span></p><div class="month-chart">${data.map((d) => `<button class="month-chart-column" data-open-month="${d.month}" title="${esc(financeMonthLabel(d.month))}"><div class="month-bars"><i style="height:${(d.income / max) * 100}%" title="${rupiah(d.income)}"></i><i style="height:${(d.expense / max) * 100}%" title="${rupiah(d.expense)}"></i></div><strong>${esc(financeMonthLabel(d.month))}</strong><small>+${rupiah(d.income)}</small><small>−${rupiah(d.expense)}</small></button>`).join('') || `<p>${planText('No monthly data yet.', 'Belum ada data bulanan.')}</p>`}</div><h3>${planText('Open a month', 'Buka bulan')}</h3><div class="month-links">${months.map((m) => `<button class="subtle" data-open-month="${m}">${esc(financeMonthLabel(m))}</button>`).join('')}</div></div>`;
}
function copyFinanceMonth() {
  const months = [
      ...new Set(
        (state.plans || []).filter((p) => !p.unplanned).map((p) => p.month),
      ),
    ]
      .sort()
      .reverse(),
    now = new Date(),
    current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  openForm(
    planText('Create monthly plan', 'Buat rencana bulanan'),
    `<label class="field">${planText('Copy plan from', 'Salin rencana dari')}<select name="source"><option value="">${planText('Start empty', 'Mulai kosong')}</option>${months.map((m) => `<option value="${m}">${esc(financeMonthLabel(m))}</option>`).join('')}</select></label>` +
      field(
        planText('New month', 'Bulan baru'),
        'month',
        'month',
        current,
        true,
      ) +
      `<p class="dialog-copy">${planText('Income and recurring budgets are copied. Monthly expense budgets start at zero. Actual transactions are never copied.', 'Anggaran pemasukan dan rutin disalin. Anggaran pengeluaran bulan ini dimulai dari nol. Transaksi realisasi tidak disalin.')}</p>`,
    (d) => {
      if (monthPlans(d.month).length) {
        toast(
          planText(
            'This month already has plans. Open it to edit.',
            'Bulan ini sudah memiliki rencana. Buka untuk mengubahnya.',
          ),
        );
        openFinanceMonth(d.month);
        return;
      }
      state.plans ??= [];
      const source = monthPlans(d.source).filter((p) => !p.unplanned);
      state.plans.push(
        ...source.map((p) => ({
          ...p,
          id: uid(),
          month: d.month,
          amount: p.type === 'income' || p.group === 'recurring' ? p.amount : 0,
        })),
      );
      // Existing transactions belong to their actual month and are never deleted or duplicated.
      save();
      openFinanceMonth(d.month);
    },
  );
}

function showCategoryTransactions(plan) {
  const items = state.transactions
    .filter(
      (t) =>
        t.date?.slice(0, 7) === plan.month &&
        t.type === plan.type &&
        planKey(t.category) === planKey(plan.category),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  openForm(
    plan.category,
    `<p class="dialog-copy">${esc(financeMonthLabel(plan.month))} · ${rupiah(planActual(plan))}</p><div class="category-transactions">${items.map((t) => `<button type="button" class="category-transaction" data-category-tx="${esc(t.id)}"><span>${esc(t.title)}<small>${esc(dateLabel(t.date, true))}</small></span><strong>${rupiah(t.amount)}</strong></button>`).join('') || `<p>${planText('No transactions in this category this month.', 'Belum ada transaksi kategori ini pada bulan tersebut.')}</p>`}</div>`,
    () => {},
  );
  $('.dialog-footer').hidden = true;
  $('#dialog-fields')
    .querySelectorAll('[data-category-tx]')
    .forEach(
      (b) =>
        (b.onclick = () => {
          $('#dialog').close();
          transactionForm(
            state.transactions.find((t) => t.id === b.dataset.categoryTx),
          );
        }),
    );
}

function editPlanNote(plan) {
  const exists = !!plan.note?.trim();
  openForm(
    planText(
      exists ? 'Edit note' : 'Add note',
      exists ? 'Ubah catatan' : 'Tambah catatan',
    ),
    `<p class="plan-note-category">${esc(plan.category)}</p><label class="field">${planText('Note', 'Catatan')}<input type="text" name="note" class="plan-note-editor" placeholder="${planText('Write your note…', 'Tulis catatanmu…')}" value="${esc((plan.note || '').replace(/\r?\n/g, ' '))}"></label>${exists ? `<button type="button" class="danger" id="delete-plan-note">${planText('Delete note', 'Hapus catatan')}</button>` : ''}`,
    (data) => {
      plan.note = data.note;
      save();
      plannerRender();
    },
  );
  const input = $('[name="note"]');
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  if (exists)
    $('#delete-plan-note').onclick = () => {
      plan.note = '';
      save();
      $('#dialog').close();
      plannerRender();
    };
}
