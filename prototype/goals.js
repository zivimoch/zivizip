function goalLabel(en, id) {
  return language === 'en' ? en : id;
}
function goalsRender() {
  let root = document.querySelector('#goals-page');
  if (!root) {
    root = document.createElement('section');
    root.id = 'goals-page';
    document.querySelector('#workspace').append(root);
  }
  state.goals ??= [];
  state.goalAssignments ??= {};
  const items = [
    ...state.tasks
      .filter((t) => t.done)
      .map((t) => ({
        key: 'task:' + t.id,
        title: t.title,
        kind: 'task',
        source: t,
      })),
    ...state.transactions
      .filter((t) => t.type === 'expense')
      .map((t) => ({
        key: 'transaction:' + t.id,
        title: t.title,
        kind: 'transaction',
        source: t,
      })),
  ];
  // Remove stale links when a goal or source item no longer exists.
  const sourceKeys = new Set([
    ...state.tasks.map((t) => 'task:' + t.id),
    ...state.transactions.map((t) => 'transaction:' + t.id),
  ]);
  for (const [key, id] of Object.entries(state.goalAssignments))
    if (!state.goals.some((g) => g.id === id) || !sourceKeys.has(key))
      delete state.goalAssignments[key];
  const pool = items.filter((i) => !state.goalAssignments[i.key]);
  const itemMarkup = (item, assigned = false) =>
    `<div class="goal-source-item" draggable="true" data-goal-item="${esc(item.key)}"><div><strong>${esc(item.title)}</strong><small>${item.kind === 'task' ? goalLabel('Completed task', 'Tugas selesai') : `${esc(item.source.category)} · ${esc(dateLabel(item.source.date, true))}`}</small></div>${item.kind === 'transaction' ? `<span class="${item.source.type === 'income' ? 'income' : ''}">${item.source.type === 'income' ? '+' : '−'}${rupiah(item.source.amount)}</span>` : ''}<button class="text-button" data-goal-assign="${esc(item.key)}" title="${goalLabel('Assign or move', 'Alokasikan atau pindahkan')}">${assigned ? '↗' : '+'}</button></div>`;
  root.innerHTML = `<div class="section-top"><div><h2>${goalLabel('Goals', 'Target')}</h2><p class="goal-help">${goalLabel('Connect completed tasks and expenses to what you want to achieve.', 'Hubungkan tugas selesai dan pengeluaran dengan tujuan yang ingin dicapai.')}</p></div><button class="primary" id="new-goal">${goalLabel('New goal', 'Target baru')}</button></div><div class="goals-layout"><aside class="goal-pool" data-goal-drop=""><h3>${goalLabel('Unassigned', 'Belum dialokasikan')} <small>${pool.length}</small></h3><p class="goal-help">${goalLabel('Drag an item up to a goal, or use + to choose one.', 'Seret item ke target di atas, atau gunakan + untuk memilih.')}</p><div class="goal-items">${pool.map((i) => itemMarkup(i)).join('') || `<p>${goalLabel('No unassigned items.', 'Tidak ada item yang belum dialokasikan.')}</p>`}</div></aside><div class="goal-cards">${
    state.goals
      .map((g) => {
        const linked = items.filter(
            (i) => state.goalAssignments[i.key] === g.id,
          ),
          tasks = linked.filter((i) => i.kind === 'task').length,
          total = (type) =>
            linked
              .filter((i) => i.kind === 'transaction' && i.source.type === type)
              .reduce((n, i) => n + Number(i.source.amount), 0);
        return `<article class="goal-card" data-goal-drop="${g.id}"><div class="section-top"><h3>${esc(g.title)}</h3><button class="text-button" data-edit-goal="${g.id}">${goalLabel('Edit', 'Ubah')}</button></div>${g.description ? `<p class="goal-description">${esc(g.description)}</p>` : ''}<div class="goal-stats"><div><small>${goalLabel('Tasks done', 'Tugas selesai')}</small><strong>${tasks}</strong></div><div><small>${goalLabel('Spent', 'Pengeluaran')}</small><strong>${rupiah(total('expense'))}</strong></div></div><div class="goal-items"><p class="goal-empty">${goalLabel('Drop items here to add to this goal.', 'Letakkan item di sini untuk menambahkan ke target.')}</p></div></article>`;
      })
      .join('') ||
    `<p class="goal-empty">${goalLabel('Create your first goal to start connecting your progress.', 'Buat target pertama untuk mulai menghubungkan progresmu.')}</p>`
  }</div></div>`;
  const layout = root.querySelector('.goals-layout');
  layout.prepend(root.querySelector('.goal-cards'));
  $('#new-goal').onclick = () => goalForm();
  root
    .querySelectorAll('[data-edit-goal]')
    .forEach(
      (b) =>
        (b.onclick = () =>
          goalForm(state.goals.find((g) => g.id === b.dataset.editGoal))),
    );
  root.querySelectorAll('[data-goal-item]').forEach(
    (el) =>
      (el.ondragstart = (e) => {
        e.dataTransfer.setData(
          'application/x-zivizip-goal',
          el.dataset.goalItem,
        );
        e.dataTransfer.effectAllowed = 'move';
      }),
  );
  root.querySelectorAll('[data-goal-drop]').forEach((el) => {
    el.ondragover = (e) => {
      if ([...e.dataTransfer.types].includes('application/x-zivizip-goal')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        el.classList.add('goal-drop-over');
      }
    };
    el.ondragleave = (e) => {
      if (!el.contains(e.relatedTarget)) el.classList.remove('goal-drop-over');
    };
    el.ondrop = (e) => {
      e.preventDefault();
      el.classList.remove('goal-drop-over');
      const key = e.dataTransfer.getData('application/x-zivizip-goal');
      if (items.some((i) => i.key === key))
        assignGoalItem(key, el.dataset.goalDrop);
    };
  });
  root.querySelectorAll('[data-goal-assign]').forEach(
    (b) =>
      (b.onclick = () => {
        openForm(
          goalLabel('Assign to goal', 'Alokasikan ke target'),
          `<label class="field">${goalLabel('Goal', 'Target')}<select name="goal"><option value="">${goalLabel('Unassigned', 'Belum dialokasikan')}</option>${state.goals.map((g) => `<option value="${g.id}" ${state.goalAssignments[b.dataset.goalAssign] === g.id ? 'selected' : ''}>${esc(g.title)}</option>`).join('')}</select></label>`,
          (d) => assignGoalItem(b.dataset.goalAssign, d.goal),
        );
      }),
  );
}
function assignGoalItem(key, id) {
  if (id && !state.goals.some((g) => g.id === id)) return;
  if (id) state.goalAssignments[key] = id;
  else delete state.goalAssignments[key];
  save();
  goalsRender();
}
function goalForm(goal) {
  openForm(
    goalLabel(
      goal ? 'Edit goal' : 'New goal',
      goal ? 'Ubah target' : 'Target baru',
    ),
    field(
      goalLabel('Goal name', 'Nama target'),
      'title',
      'text',
      goal?.title || '',
      true,
    ) +
      field(
        goalLabel('Description (optional)', 'Deskripsi (opsional)'),
        'description',
        'text',
        goal?.description || '',
      ) +
      (goal
        ? `<button type="button" class="danger" id="delete-goal">${goalLabel('Delete goal', 'Hapus target')}</button>`
        : ''),
    (d) => {
      if (goal)
        Object.assign(goal, {
          title: d.title.trim(),
          description: d.description.trim(),
        });
      else
        state.goals.push({
          id: uid(),
          title: d.title.trim(),
          description: d.description.trim(),
        });
      save();
      goalsRender();
    },
  );
  if (goal)
    $('#delete-goal').onclick = () => {
      $('#dialog').close();
      confirmDialog(
        goalLabel('Delete goal?', 'Hapus target?'),
        goalLabel(
          'Assigned items return to Unassigned. Original tasks and transactions are kept.',
          'Item kembali ke kotak belum dialokasikan. Tugas dan transaksi asli tetap disimpan.',
        ),
        () => {
          state.goals = state.goals.filter((g) => g.id !== goal.id);
          for (const [key, id] of Object.entries(state.goalAssignments))
            if (id === goal.id) delete state.goalAssignments[key];
          save();
          goalsRender();
        },
      );
    };
}
