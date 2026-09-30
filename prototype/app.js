const paths = {
  target:
    'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0 M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
  home: 'M3 10 12 3l9 7v11h-6v-7H9v7H3z',
  layers: 'm12 3 10 5-10 5L2 8z M2 12l10 5 10-5 M2 16l10 5 10-5',
  note: 'M14 2H5v20h14V7z M14 2v6h5 M8 12h8 M8 16h8',
  check: 'M4 3h16v18H4z m3 9 3 3 7-7',
  chart: 'M3 14h4v8H3z M10 8h4v14h-4z M17 2h4v20h-4z',
  settings:
    'M9 3h6l1 4 4 1v6l-4 2-1 5H9l-1-5-4-2V8l4-1z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  menu: 'M3 5h18 M3 12h18 M3 19h18',
  plus: 'M12 4v16 M4 12h16',
  archive: 'M3 4h18v4H3z M5 8v13h14V8 M9 12h6',
  list: 'M8 5h13 M8 12h13 M8 19h13 M3 5h.1 M3 12h.1 M3 19h.1',
  bulb: 'M8 17c0-3-3-4-3-8a7 7 0 0 1 14 0c0 4-3 5-3 8z M9 21h6',
  calendar: 'M3 5h18v17H3z M7 2v6 M17 2v6 M3 10h18',
  tick: 'm5 12 4 4L19 6',
  folder: 'M2 5h8l2 3h10v13H2z',
  edit: 'm4 16 12-12 4 4L8 20H4z',
};
const icon = (n) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[n] || paths.note}"/></svg>`;
const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const key = 'zivizip-prototype-v1';
const seed = {
  activeNote: 'daily',
  notes: [
    {
      id: 'daily',
      name: 'Tentang Zivizip',
      category: 'umum',
      body: 'Zivizip menghadirkan ruang pribadi untuk menyimpan pikiran, menata aktivitas, dan memahami keuangan sehari-hari. Semua hal penting berada dalam satu tempat yang tenang dan mudah digunakan.\n\nCatat ide saat muncul. Susun prioritas dengan jelas. Lihat pemasukan dan pengeluaran untuk mengambil keputusan yang lebih terarah.\n\nDirancang untuk mengikuti ritme harian, Zivizip membantu menjaga fokus dan memberi ruang bagi hal yang benar-benar berarti.',
    },
    {
      id: 'ideas',
      name: 'Rencana harian',
      category: 'umum',
      body: 'Mulai hari dengan prioritas yang jelas.\n\n• Tentukan tiga hal yang paling penting.\n• Sisihkan waktu untuk kegiatan pribadi.\n• Tinjau kembali pencapaian di akhir hari.',
    },
    {
      id: 'personal',
      name: 'Keuangan pribadi',
      category: 'umum',
      body: 'Bangun kebiasaan finansial yang lebih terarah.\n\nCatat pengeluaran secara rutin, kelompokkan kebutuhan, dan pantau saldo untuk merencanakan langkah berikutnya.',
    },
  ],
  tasks: [
    {
      id: 't1',
      title: 'Bayar tagihan internet',
      date: '2026-09-28',
      amount: 350000,
    },
    { id: 't2', title: 'Kirim proposal proyek', date: '2026-09-30' },
    { id: 't3', title: 'Beli kebutuhan dapur', amount: 150000 },
    { id: 't4', title: 'Lanjutkan desain zivizip' },
    { id: 't5', title: 'Rapikan folder pribadi' },
    { id: 't6', title: 'Rapikan workspace', done: true },
    { id: 't7', title: 'Review catatan', done: true },
  ],
  transactions: [
    {
      id: 'f1',
      title: 'Gaji September',
      category: 'Gaji',
      date: '2026-09-01',
      amount: 8000000,
      type: 'income',
    },
    {
      id: 'f2',
      title: 'Makan siang',
      category: 'Makan',
      date: '2026-09-27',
      amount: 35000,
      type: 'expense',
    },
    {
      id: 'f3',
      title: 'Ojek online',
      category: 'Transport',
      date: '2026-09-27',
      amount: 20000,
      type: 'expense',
    },
    {
      id: 'f4',
      title: 'Kopi sore',
      category: 'Minuman',
      date: '2026-09-27',
      amount: 25000,
      type: 'expense',
    },
    {
      id: 'f5',
      title: 'Kebutuhan rumah',
      category: 'Belanja',
      date: '2026-09-26',
      amount: 180000,
      type: 'expense',
    },
    {
      id: 'f6',
      title: 'Internet bulanan',
      category: 'Tagihan',
      date: '2026-09-26',
      amount: 350000,
      type: 'expense',
    },
    {
      id: 'f7',
      title: 'Makan malam',
      category: 'Makan',
      date: '2026-09-25',
      amount: 45000,
      type: 'expense',
    },
    {
      id: 'f8',
      title: 'Sewa tempat tinggal',
      category: 'Rumah',
      date: '2026-09-02',
      amount: 1795000,
      type: 'expense',
    },
  ],
};
if (language === 'en') {
  const sampleNames = ['About Zivizip', 'Daily Plans', 'Personal Finance'];
  const sampleBodies = [
    'Zivizip is a personal space to capture thoughts, organize daily activities, and understand your finances. Keep what matters together in a calm, focused workspace.\n\nCapture ideas as they arrive. Set clear priorities. Track income and spending to make more informed decisions.\n\nDesigned around your everyday rhythm, Zivizip helps you focus on what matters most.',
    'Start your day with clear priorities.\n\n• Choose your three most important tasks.\n• Make time for yourself.\n• Reflect on your progress at the end of the day.',
    'Build more intentional financial habits.\n\nTrack spending regularly, group expenses, and review your balance to plan your next steps.',
  ];
  seed.notes.forEach((n, i) => {
    n.name = sampleNames[i];
    n.category = 'General';
    n.body = sampleBodies[i];
  });
  const taskNames = [
    'Pay internet bill',
    'Send project proposal',
    'Buy groceries',
    'Review weekly priorities',
    'Organize personal folders',
    'Tidy workspace',
    'Review notes',
  ];
  seed.tasks.forEach((t, i) => (t.title = taskNames[i]));
  const txNames = [
    'September salary',
    'Lunch',
    'Ride home',
    'Afternoon coffee',
    'Household supplies',
    'Monthly internet',
    'Dinner',
    'Rent',
  ];
  const cats = [
    'Salary',
    'Food',
    'Transport',
    'Drinks',
    'Shopping',
    'Bills',
    'Food',
    'Housing',
  ];
  seed.transactions.forEach((t, i) => {
    t.title = txNames[i];
    t.category = cats[i];
  });
}
let state;
try {
  state = JSON.parse(localStorage.getItem(key));
} catch {}
if (
  !state ||
  !Array.isArray(state.notes) ||
  !Array.isArray(state.tasks) ||
  !Array.isArray(state.transactions)
)
  state = structuredClone(seed);
const originalBodies = {
  daily:
    'Fokus hari ini\nMulai dari hal kecil yang membuat hari ini lebih baik.\n\n• Selesaikan konsep awal zivizip\n• Rapikan catatan dan ide pribadi\n• Luangkan waktu untuk belajar\n\nSedikit progres setiap hari.\n\nIde & catatan\nSatu workspace untuk semua hal yang penting.',
  ideas:
    'Yang ingin dicoba\n\n• Workspace yang terasa seperti rumah\n• Catatan yang bisa dibaca saat offline\n• Pengingat kecil untuk hal-hal penting\n\nLangkah berikutnya\nCoba prototipe, lalu catat bagian yang terasa nyaman dan yang perlu diperbaiki.',
  personal:
    'Minggu ini\n\n• Belajar hal baru tanpa terburu-buru\n• Menyisihkan waktu untuk membaca\n• Merapikan rencana minggu depan',
};
if (!state.notesRevision) {
  state.notes = state.notes.map((n) =>
    n.body === originalBodies[n.id] && !n.bodyHtml
      ? structuredClone(seed.notes.find((x) => x.id === n.id))
      : { ...n, category: n.category || 'umum' },
  );
  state.notesRevision = 2;
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {}
}
let view = 'main',
  archived = false,
  grouped = false,
  onSubmit = null;
const uid = () =>
  crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
const rupiah = (n) => 'Rp' + Number(n).toLocaleString('id-ID');
const shortMoney = (n) =>
  Math.abs(n) >= 1000000
    ? 'Rp' +
      (n / 1000000).toLocaleString('id-ID', { maximumFractionDigits: 2 }) +
      ' jt'
    : rupiah(n);
const dateLabel = (s, short = false) =>
  new Date(s + 'T12:00:00').toLocaleDateString(
    language === 'en' ? 'en-GB' : 'id-ID',
    {
      day: 'numeric',
      month: short ? 'short' : 'long',
      ...(short ? { year: 'numeric' } : {}),
    },
  );
function save() {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    toast('Perubahan hanya tersimpan selama halaman terbuka.');
  }
}
function toast(t) {
  $('#toast').textContent = t;
  $('#toast').classList.add('show');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(
    () => $('#toast').classList.remove('show'),
    3000,
  );
}
function icons() {
  document
    .querySelectorAll('[data-icon]')
    .forEach((e) => (e.innerHTML = icon(e.dataset.icon)));
}
icons();
function setView(v) {
  if (v === 'goals') goalsRender();
  if (v === 'finance') {
    ensureFinanceExample();
    financeRender();
  }
  view = v;
  $('#workspace').dataset.view = v;
  document.querySelectorAll('[data-view]').forEach((e) => {
    if (e.tagName === 'BUTTON')
      e.classList.toggle(
        'active',
        e.dataset.view === v ||
          (v === 'main' &&
            e.closest('.bottom-nav') &&
            e.dataset.view === 'notes'),
      );
  });
  closeMenu();
  history.replaceState(null, '', '#' + v);
}
document
  .querySelectorAll('button[data-view]')
  .forEach((b) => (b.onclick = () => setView(b.dataset.view)));
$('.brand').onclick = (e) => {
  e.preventDefault();
  setView('main');
};
function closeMenu() {
  $('#sidebar').classList.remove('open');
  $('#scrim').classList.remove('open');
}
$('#menu').onclick = () => {
  $('#sidebar').classList.add('open');
  $('#scrim').classList.add('open');
};
$('#scrim').onclick = closeMenu;
$('#hide-sidebar').onclick = closeMenu;
$('#detail-toggle').onclick = () => {
  const hidden = !$('#detail-links').hidden;
  $('#detail-links').hidden = hidden;
  $('#detail-toggle').setAttribute('aria-expanded', String(!hidden));
};
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMenu();
});
function cleanBody(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const allowed = new Set([
    'H2',
    'H3',
    'P',
    'DIV',
    'SPAN',
    'UL',
    'OL',
    'LI',
    'BR',
    'B',
    'STRONG',
    'I',
    'EM',
  ]);
  function walk(node) {
    if (node.nodeType === 3) return esc(node.textContent);
    if (node.nodeType !== 1) return '';
    if (node.classList.contains('image-flow-gap')) {
      const height = Math.max(
          0,
          Math.min(5000, parseFloat(node.style.height) || 0),
        ),
        width = Math.max(0, Math.min(5000, parseFloat(node.style.width) || 0)),
        id = node.getAttribute('data-image-anchor');
      return (
        '<span class="image-flow-gap"' +
        (id ? ' data-image-anchor="' + esc(id) + '"' : '') +
        ' contenteditable="false" style="display:block;width:' +
        width +
        'px;height:' +
        height +
        'px">&#8203;</span>'
      );
    }
    if (node.tagName === 'IMG') {
      const src = node.getAttribute('src') || '';
      return /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(src)
        ? '<img src="' + src + '" alt="Gambar catatan">'
        : '';
    }
    if (['SCRIPT', 'STYLE', 'SVG'].includes(node.tagName)) return '';
    let inner = Array.from(node.childNodes).map(walk).join('');
    if (!allowed.has(node.tagName)) return inner;
    let tag = node.tagName.toLowerCase();
    return (
      '<' +
      tag +
      (node.classList.contains('callout') ? ' class="callout"' : '') +
      '>' +
      inner +
      (tag === 'br' ? '' : '</' + tag + '>')
    );
  }
  return Array.from(doc.body.childNodes).map(walk).join('');
}
const titleCase = (s) =>
  String(s || '')
    .trim()
    .replace(/(^|[\s-])\p{L}/gu, (c) => c.toLocaleUpperCase('id-ID'));
function normalizeNotes() {
  state.notes.forEach((n) => {
    n.name = titleCase(n.name);
    n.category = titleCase(n.category || 'Umum');
    n.icon = paths[n.icon] ? n.icon : 'note';
  });
  if (!Array.isArray(state.openNotes))
    state.openNotes = state.notes.map((n) => n.id);
  state.openNotes = state.openNotes.filter((id) =>
    state.notes.some((n) => n.id === id),
  );
  state.categoryHistory = [
    ...new Set([
      ...(state.categoryHistory || []).map(titleCase),
      'Umum',
      ...state.notes.map((n) => n.category),
    ]),
  ];
}
function activateNote(id) {
  if (!state.openNotes.includes(id)) state.openNotes.push(id);
  state.activeNote = id;
  save();
  noteRender();
}
function closeNote(id) {
  const index = state.openNotes.indexOf(id);
  state.openNotes = state.openNotes.filter((x) => x !== id);
  if (state.activeNote === id)
    state.activeNote =
      state.openNotes[Math.min(index, state.openNotes.length - 1)] || null;
  save();
  noteRender();
}
let lastNoteClick = { id: null, time: 0 };
function noteForm(n) {
  normalizeNotes();
  let number = Number(state.noteCounter) || 0;
  do {
    number++;
  } while (state.notes.some((x) => x.name.toLowerCase() === `note${number}`));
  const choices = [
    ['note', 'Catatan'],
    ['bulb', 'Ide'],
    ['folder', 'Folder'],
    ['check', 'Tugas'],
    ['calendar', 'Kalender'],
    ['home', 'Rumah'],
    ['chart', 'Keuangan'],
  ];
  openForm(
    n ? 'Edit Note' : 'Tambah Note',
    `<fieldset class="icon-picker"><legend>Ikon</legend>${choices.map(([v, label]) => `<label title="${label}"><input type="radio" name="icon" value="${v}" aria-label="${label}" ${(n?.icon || 'note') === v ? 'checked' : ''}><span>${icon(v)}</span></label>`).join('')}</fieldset>` +
      (n
        ? `<p class="note-kind">${n.type === 'draw' ? 'Draw' : 'Text'}</p>`
        : '<fieldset class="note-type-picker"><legend>Jenis Note</legend><label><input type="radio" name="type" value="text" checked> Text</label><label><input type="radio" name="type" value="draw"> Draw</label></fieldset>') +
      field('Nama Note', 'name', 'text', n?.name || `Note${number}`, true) +
      `<label class="field">Kategori<input name="category" list="note-categories" value="${esc(n?.category || (language === 'en' ? 'General' : 'Umum'))}" maxlength="60" required autocomplete="off"><datalist id="note-categories">${state.categoryHistory.map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist></label>` +
      (n
        ? '<button type="button" class="danger" id="delete-note">Hapus Note</button>'
        : ''),
    (d) => {
      const values = {
        name: titleCase(d.name),
        category: titleCase(d.category) || 'Umum',
        icon: d.icon,
      };
      if (n) Object.assign(n, values);
      else {
        n = {
          id: uid(),
          ...values,
          type: d.type || 'text',
          body: '',
          shapes: [],
        };
        state.notes.push(n);
        state.noteCounter = number;
      }
      state.categoryHistory = [
        ...new Set([...state.categoryHistory, values.category]),
      ];
      activateNote(n.id);
    },
  );
  $('.dialog-footer .primary').textContent = n ? 'Update' : 'Tambah';
  const nameInput = $('[name="name"]');
  nameInput.focus();
  if (!n) nameInput.select();
  for (const name of ['name', 'category']) {
    const input = $(`[name="${name}"]`);
    const capitalize = () => {
      const value = input.value,
        start = input.selectionStart,
        end = input.selectionEnd;
      const transform = (t) =>
        t.replace(/(^|[\s-])\p{L}/gu, (c) => c.toLocaleUpperCase('id-ID'));
      input.value = transform(value);
      if (start !== null)
        input.setSelectionRange(
          transform(value.slice(0, start)).length,
          transform(value.slice(0, end)).length,
        );
    };
    input.addEventListener('input', (e) => {
      if (!e.isComposing) capitalize();
    });
    input.addEventListener('compositionend', capitalize);
    input.addEventListener(
      'blur',
      () => (input.value = titleCase(input.value)),
    );
  }
  if (n)
    $('#delete-note').onclick = () => {
      $('#dialog').close();
      confirmDialog(
        'Hapus Note?',
        `“${n.name}” beserta isinya akan dihapus. Menutup tab saja tidak menghapus note.`,
        () => {
          state.notes = state.notes.filter((x) => x.id !== n.id);
          closeNote(n.id);
          toast('Note dihapus');
        },
      );
    };
}
function noteRender() {
  $('#note-article').cleanupImages?.();
  $('#note-article').onpointerdown = null;
  $('#note-article').onkeydown = null;
  $('#note-article').classList.remove('text-surface');
  $('#note-article').style.minHeight = '';
  normalizeNotes();
  const n =
    state.notes.find(
      (x) => x.id === state.activeNote && state.openNotes.includes(x.id),
    ) || state.notes.find((x) => state.openNotes.includes(x.id));
  state.activeNote = n?.id || null;
  $('#note-breadcrumb').innerHTML = n
    ? `<span>${esc(n.category)}</span><span class="crumb-slash">/</span><span>${esc(n.name)}</span>`
    : '';
  $('#tabs').innerHTML =
    state.openNotes
      .map((id) => state.notes.find((x) => x.id === id))
      .map(
        (x) =>
          `<div class="tab ${x.id === n?.id ? 'active' : ''}" data-tab="${esc(x.id)}"><button data-note="${esc(x.id)}" class="note-tab-button" title="Double-click to edit note" aria-label="${esc(x.name)}">${icon(x.icon)}<span>${esc(x.name)}</span></button><button class="tab-close" data-close-note="${esc(x.id)}" aria-label="Tutup tab ${esc(x.name)}">×</button></div>`,
      )
      .join('') +
    `<button class="tab-add" id="add-note" aria-label="Tambah catatan">${icon('plus')}</button>`;
  $('#note-article').innerHTML = n
    ? `<div class="note-body" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Isi catatan" id="note-body">${n.bodyHtml ? cleanBody(n.bodyHtml) : esc(n.body).replace(/\n/g, '<br>')}</div>`
    : '<div class="empty">Buat note baru untuk mulai menulis.</div>';
  if (n?.type === 'draw') mountDrawing(n);
  if (n && n.type !== 'draw') {
    const upload = document.createElement('label');
    upload.className = 'note-image-upload';
    upload.innerHTML =
      '＋ <span>Add image</span><input type="file" accept="image/*" aria-label="Add image" hidden>';
    $('#note-breadcrumb').append(upload);
    upload.querySelector('input').onchange = (e) => {
      const file = e.target.files[0];
      if (file)
        pasteNoteImage(
          {
            preventDefault() {},
            clipboardData: {
              items: [{ type: file.type, getAsFile: () => file }],
            },
          },
          n,
          $('#note-body'),
        );
    };
    const el = $('#note-body');
    el.oninput = () => {
      n.body = el.innerText;
      n.bodyHtml = cleanBody(el.innerHTML);
      save();
    };
    el.onpaste = (e) => pasteNoteImage(e, n, el);
    mountNoteImages(n, el);
    mountNoteLists(n, el);
  }
  $('#tabs')
    .querySelectorAll('[data-note]')
    .forEach((button) => {
      const note = state.notes.find((x) => x.id === button.dataset.note);
      button.onclick = (e) => {
        const now = performance.now();
        if (lastNoteClick.id === note.id && now - lastNoteClick.time < 450) {
          lastNoteClick = { id: null, time: 0 };
          if (!$('#dialog').open) noteForm(note);
          return;
        }
        lastNoteClick = { id: note.id, time: now };
        activateNote(note.id);
      };
      button.ondblclick = (e) => {
        e.preventDefault();
        lastNoteClick = { id: null, time: 0 };
        if (!$('#dialog').open) noteForm(note);
      };
      button.oncontextmenu = (e) => e.preventDefault();
      button.onkeydown = (e) => {
        if (e.key === 'F2') {
          e.preventDefault();
          noteForm(note);
        }
      };
    });
  $('#tabs')
    .querySelectorAll('[data-close-note]')
    .forEach((b) => (b.onclick = () => closeNote(b.dataset.closeNote)));
  $('#add-note').onclick = () => noteForm();
  bindReorder(
    $('#tabs'),
    '[data-tab]',
    '.note-tab-button',
    'tab',
    true,
    () => true,
    (ids) => {
      state.openNotes = ids;
      lastNoteClick = { id: null, time: 0 };
      save();
    },
  );
}
function tasksRender() {
  let all = state.tasks.filter((t) => !t.archived),
    done = all.filter((t) => t.done).length,
    p = all.length ? Math.round((done / all.length) * 100) : 0;
  $('#progress-text').textContent = `${done} dari ${all.length} selesai`;
  $('#progress-percent').textContent = p + '%';
  $('#progress-bar').style.width = p + '%';
  let list = state.tasks
    .filter((t) => !!t.archived === archived)
    .sort((a, b) => Number(!!b.date) - Number(!!a.date));
  $('#show-archive').textContent = archived
    ? '← Kembali ke tugas aktif'
    : `Lihat arsip (${state.tasks.filter((t) => t.archived).length})`;
  $('#task-list').innerHTML =
    list
      .map(
        (t) =>
          `<div data-task="${esc(t.id)}" class="task ${t.done ? 'done' : ''}"><button class="task-check" data-check="${esc(t.id)}" aria-label="${t.archived ? 'Pulihkan' : t.done ? 'Batalkan selesai' : 'Selesaikan'} ${esc(t.title)}" aria-pressed="${!!t.done}">${t.done ? icon('tick') : ''}</button><div><span class="task-title">${esc(t.title)}</span>${t.date ? `<div class="task-date">${icon('calendar')}${dateLabel(t.date, true)}</div>` : ''}</div>${t.amount ? `<span class="task-amount">${rupiah(t.amount)}</span>` : ''}</div>`,
      )
      .join('') ||
    `<div class="empty">${archived ? 'Belum ada tugas diarsipkan.' : 'Ruang untuk rencana baru.<br>Tambahkan tugas lewat tombol +.'}</div>`;
  $('#task-list')
    .querySelectorAll('[data-check]')
    .forEach(
      (b) =>
        (b.onclick = () => {
          let t = state.tasks.find((t) => t.id === b.dataset.check);
          if (t.archived) {
            t.archived = false;
            t.done = false;
            toast('Tugas dikembalikan ke daftar aktif');
          } else t.done = !t.done;
          save();
          tasksRender();
        }),
    );
  $('#task-list')
    .querySelectorAll('[data-task]')
    .forEach((row) => {
      row.ondblclick = (e) => {
        if (e.target.closest('button')) return;
        taskForm(state.tasks.find((t) => t.id === row.dataset.task));
      };
      row.tabIndex = 0;
      row.onkeydown = (e) => {
        if (e.target === row && e.key === 'F2') {
          e.preventDefault();
          taskForm(state.tasks.find((t) => t.id === row.dataset.task));
        }
      };
    });
  bindReorder(
    $('#task-list'),
    '[data-task]',
    '[data-task]',
    'task',
    false,
    (a, b) =>
      !!state.tasks.find((t) => t.id === a).date ===
      !!state.tasks.find((t) => t.id === b).date,
    (ids) => {
      const ordered = ids.map((id) => state.tasks.find((t) => t.id === id));
      let i = 0;
      state.tasks = state.tasks.map((t) =>
        !!t.archived === archived ? ordered[i++] : t,
      );
      save();
    },
  );
}

const field = (label, name, type, value = '', required = false) =>
  `<label class="field">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${required ? 'required' : ''} ${type === 'number' ? 'min="0" step="1"' : ''} ${type === 'text' ? 'maxlength="150"' : ''}></label>`;
function openForm(title, fields, submit) {
  $('#dialog-title').textContent = title;
  $('#dialog-fields').innerHTML = fields;
  $('.dialog-footer').hidden = false;
  $('.dialog-footer .primary').textContent = 'Simpan';
  onSubmit = submit;
  $('#dialog').showModal();
}
function confirmDialog(title, copy, action) {
  openForm(title, `<p class="dialog-copy">${esc(copy)}</p>`, action);
  $('.dialog-footer .primary').textContent = 'Hapus';
}
function taskForm(t) {
  openForm(
    t ? 'Edit tugas' : 'Tugas baru',
    field(
      'Apa yang ingin diselesaikan?',
      'title',
      'text',
      t?.title || '',
      true,
    ) +
      field('Tanggal jatuh tempo (opsional)', 'date', 'date', t?.date || '') +
      field('Nominal terkait (opsional)', 'amount', 'number', t?.amount || '') +
      (t
        ? '<button type="button" class="danger" id="delete-item">Hapus tugas</button>'
        : ''),
    (d) => {
      const value = {
        title: d.title.trim(),
        date: d.date,
        amount: Number(d.amount),
      };
      if (t) Object.assign(t, value);
      else state.tasks.push({ id: uid(), ...value });
      save();
      tasksRender();
      toast(t ? 'Tugas diperbarui' : 'Tugas ditambahkan');
    },
  );
  if (t)
    $('#delete-item').onclick = () => {
      $('#dialog').close();
      confirmDialog('Hapus tugas?', 'Tugas ini akan dihapus permanen.', () => {
        state.tasks = state.tasks.filter((x) => x.id !== t.id);
        save();
        tasksRender();
        toast('Tugas dihapus');
      });
    };
}
$('#add-task').onclick = () => taskForm();
$('#show-archive').onclick = () => {
  archived = !archived;
  tasksRender();
};
$('#archive').onclick = () => {
  let count = 0;
  state.tasks.forEach((t) => {
    if (t.done && !t.archived) {
      t.archived = true;
      count++;
    }
  });
  save();
  tasksRender();
  toast(
    count
      ? `${count} tugas dipindahkan ke arsip`
      : 'Belum ada tugas selesai untuk diarsipkan',
  );
};
function financeRender() {
  plannerRender();
  let tx = state.transactions.filter((t) =>
    t.date.startsWith($('#month').value),
  );
  let income = tx
      .filter((t) => t.type === 'income')
      .reduce((a, t) => a + t.amount, 0),
    expense = tx
      .filter((t) => t.type === 'expense')
      .reduce((a, t) => a + t.amount, 0);
  $('#balances').innerHTML = [
    ['Pemasukan', '↗', income, ''],
    ['Pengeluaran', '↙', expense, 'out'],
    ['Saldo', '▣', income - expense, ''],
  ]
    .map(
      ([l, i, n, c]) =>
        `<div class="balance-card ${c}" title="${rupiah(n)}"><small>${l}<span>${i}</span></small><strong>${shortMoney(n)}</strong></div>`,
    )
    .join('');
  $('#group').innerHTML =
    icon('list') + `<span>${grouped ? 'Per tanggal' : 'Per kategori'}</span>`;
  let groups = {};
  tx.sort((a, b) => b.date.localeCompare(a.date)).forEach((t) => {
    let k = grouped ? t.category : t.date;
    (groups[k] ??= []).push(t);
  });
  $('#transactions').innerHTML =
    Object.entries(groups)
      .map(
        ([k, items]) =>
          `<div class="transaction-heading">${esc(grouped ? k : dateLabel(k))}</div>` +
          items
            .map(
              (t) =>
                `<button class="transaction" data-tx="${esc(t.id)}" aria-label="Edit transaksi ${esc(t.title)}"><span class="category">${esc(grouped ? dateLabel(t.date) : t.category)}</span><span class="transaction-name">${esc(t.title)}</span><span class="transaction-amount ${t.type === 'income' ? 'income' : ''}">${t.type === 'income' ? '+' : '−'}${rupiah(t.amount)}</span></button>`,
            )
            .join(''),
      )
      .join('') ||
    '<div class="empty">Belum ada transaksi bulan ini.<br>Mulai mencatat lewat tombol +.</div>';
  $('#transactions')
    .querySelectorAll('[data-tx]')
    .forEach(
      (b) =>
        (b.onclick = () =>
          transactionForm(
            state.transactions.find((t) => t.id === b.dataset.tx),
          )),
    );
}
function transactionForm(t) {
  openForm(
    t ? 'Edit transaksi' : 'Transaksi baru',
    `<label class="field">Jenis<select name="type"><option value="expense">Pengeluaran</option><option value="income" ${t?.type === 'income' ? 'selected' : ''}>Pemasukan</option></select></label>` +
      field('Keterangan', 'title', 'text', t?.title || '', true) +
      field('Nominal (Rp)', 'amount', 'number', t?.amount || '', true) +
      financeCategoryField(t?.category || '') +
      field(
        'Tanggal',
        'date',
        'date',
        t?.date ||
          $('#month').value +
            '-' +
            String(
              Math.min(
                new Date().getDate(),
                new Date(
                  Number($('#month').value.slice(0, 4)),
                  Number($('#month').value.slice(5)),
                  0,
                ).getDate(),
              ),
            ).padStart(2, '0'),
        true,
      ) +
      (t
        ? '<button type="button" class="danger" id="delete-item">Hapus transaksi</button>'
        : ''),
    (d) => {
      const value = {
        ...d,
        title: d.title.trim(),
        category: d.category.trim(),
        amount: Number(d.amount),
      };
      if (t) Object.assign(t, value);
      else state.transactions.push({ id: uid(), ...value });
      $('#month').value = d.date.slice(0, 7);
      save();
      financeRender();
      toast(t ? 'Transaksi diperbarui' : 'Transaksi ditambahkan');
    },
  );
  $('input[name=amount]').min = '1';
  if (t)
    $('#delete-item').onclick = () => {
      $('#dialog').close();
      confirmDialog(
        'Hapus transaksi?',
        'Ringkasan saldo akan dihitung ulang.',
        () => {
          state.transactions = state.transactions.filter((x) => x.id !== t.id);
          save();
          financeRender();
          toast('Transaksi dihapus');
        },
      );
    };
}
$('#add-transaction').onclick = () => transactionForm();
$('#month').onchange = financeRender;
$('#group').onclick = () => {
  grouped = !grouped;
  financeRender();
};
$('#close-dialog').onclick = $('#cancel').onclick = () => $('#dialog').close();
$('#dialog').addEventListener('click', (e) => {
  if (e.target === $('#dialog')) {
    const r = e.target.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      e.target.close();
  }
});
$('#dialog-form').onsubmit = (e) => {
  e.preventDefault();
  let data = Object.fromEntries(new FormData(e.target));
  if (Object.values(data).some((v) => v && !String(v).trim()))
    return toast('Isi kolom dengan teks yang valid.');
  $('#dialog').close();
  onSubmit?.(data);
};
$('#settings').onclick = () => {
  openForm(
    'Ruang pribadimu',
    `<p class="dialog-copy">Prototipe interaktif Zivizip<br><br>Catatan, tugas, dan transaksi disimpan di browser ini. Data contoh menggunakan September 2026.<br><br>Install PWA, sinkronisasi, offline resmi, dan push notification akan dibuat pada tahap aplikasi sebenarnya.</p><button type="button" class="danger" id="reset">Reset semua data contoh</button>`,
    () => {},
  );
  languageSettings();
  $('.dialog-footer').hidden = true;
  $('#reset').onclick = () => {
    $('#dialog').close();
    confirmDialog(
      'Reset data prototipe?',
      'Semua perubahan lokal akan diganti dengan data contoh awal.',
      () => {
        state = structuredClone(seed);
        archived = false;
        $('#month').value = '2026-09';
        save();
        render();
        toast('Data contoh dipulihkan');
      },
    );
  };
};
function render() {
  noteRender();
  tasksRender();
  financeRender();
}
render();
setView(
  ['main', 'notes', 'tasks', 'finance', 'goals'].includes(
    location.hash.slice(1),
  )
    ? location.hash.slice(1)
    : 'main',
);
window.addEventListener('hashchange', () => {
  const v = location.hash.slice(1);
  if (['main', 'notes', 'tasks', 'finance', 'goals'].includes(v)) setView(v);
});

// Store preferred panel proportions independently from note and transaction data.
const layoutKey = 'zivizip-panel-layout';
let layout = { notes: 75, tasks: 49 };
try {
  const stored = JSON.parse(localStorage.getItem(layoutKey));
  for (const k of ['notes', 'tasks'])
    if (Number.isFinite(stored?.[k]))
      layout[k] = Math.max(20, Math.min(80, stored[k]));
} catch {}
function applyLayout() {
  const w = $('#workspace');
  w.style.setProperty('--notes-ratio', layout.notes + 'fr');
  w.style.setProperty('--right-ratio', 100 - layout.notes + 'fr');
  w.style.setProperty('--tasks-height', layout.tasks + '%');
  for (const [id, k] of [
    ['notes-divider', 'notes'],
    ['finance-divider', 'tasks'],
  ]) {
    $('#' + id).setAttribute('aria-valuenow', Math.round(layout[k]));
    $('#' + id).setAttribute('aria-valuemin', '20');
    $('#' + id).setAttribute('aria-valuemax', '80');
  }
}
function storeLayout() {
  try {
    localStorage.setItem(layoutKey, JSON.stringify(layout));
  } catch {
    toast('Ukuran panel tidak dapat disimpan.');
  }
}
for (const [id, k, defaultValue] of [
  ['notes-divider', 'notes', 75],
  ['finance-divider', 'tasks', 49],
]) {
  const handle = $('#' + id);
  let dragging = false;
  handle.onpointerdown = (e) => {
    if (e.button !== 0) return;
    dragging = true;
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing');
    e.preventDefault();
  };
  handle.onpointermove = (e) => {
    if (!dragging) return;
    const r = (
      k === 'notes' ? $('#workspace') : $('.right-pane')
    ).getBoundingClientRect();
    const value =
      k === 'notes'
        ? ((e.clientX - r.left) / r.width) * 100
        : ((e.clientY - r.top) / r.height) * 100;
    layout[k] = Math.max(20, Math.min(80, value));
    applyLayout();
  };
  const finish = () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('resizing');
    storeLayout();
  };
  handle.onpointerup = finish;
  handle.onpointercancel = finish;
  handle.onlostpointercapture = finish;
  handle.ondblclick = () => {
    layout[k] = defaultValue;
    applyLayout();
    storeLayout();
    toast('Ukuran panel dikembalikan ke default');
  };
  handle.onkeydown = (e) => {
    const keys =
      k === 'notes' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
    if (!keys.includes(e.key) && e.key !== 'Home') return;
    e.preventDefault();
    layout[k] =
      e.key === 'Home'
        ? defaultValue
        : Math.max(20, Math.min(80, layout[k] + (e.key === keys[0] ? -2 : 2)));
    applyLayout();
    storeLayout();
  };
}
applyLayout();

// Pointer-based ordering works with mouse, pen and touch without opening editors.
function bindReorder(
  container,
  selector,
  handle,
  key,
  horizontal,
  allowed,
  commit,
) {
  let suppress = false;
  const selected = ['task', 'planRow'].includes(key)
    ? (container.selectedTasks ??= new Set())
    : null;
  const refreshSelection = () =>
    container
      .querySelectorAll(selector)
      .forEach((row) =>
        row.classList.toggle(
          'task-selected',
          !!selected?.has(row.dataset[key]),
        ),
      );
  refreshSelection();
  if (container.reorderClick)
    container.removeEventListener('click', container.reorderClick, true);
  container.reorderClick = (e) => {
    if (suppress) {
      e.preventDefault();
      e.stopImmediatePropagation();
      suppress = false;
    }
  };
  container.addEventListener('click', container.reorderClick, true);
  container.querySelectorAll(handle).forEach((control) => {
    control.onpointerdown = (e) => {
      if (
        e.button !== 0 ||
        e.target.closest(
          '.task-check,.plan-actual,.plan-note-button,.plan-state-button,input,textarea,label',
        )
      )
        return;
      const row = control.closest(selector),
        start = [e.clientX, e.clientY];
      let moving = false;
      if (selected) {
        if (e.shiftKey) {
          e.preventDefault();
          if (selected.has(row.dataset[key])) selected.delete(row.dataset[key]);
          else selected.add(row.dataset[key]);
          refreshSelection();
          return;
        }
        if (!selected.has(row.dataset[key])) {
          selected.clear();
          selected.add(row.dataset[key]);
        }
        refreshSelection();
      }
      const group = [...container.querySelectorAll(selector)].filter((el) =>
        selected ? selected.has(el.dataset[key]) : el === row,
      );

      if (!e.target.closest('.plan-category-link'))
        control.setPointerCapture(e.pointerId);
      control.onpointermove = (ev) => {
        if (
          !moving &&
          Math.hypot(ev.clientX - start[0], ev.clientY - start[1]) < 7
        )
          return;
        moving = true;
        suppress = true;
        control.setPointerCapture(ev.pointerId);
        group.forEach((el) => el.classList.add('reordering'));
        const target = document
          .elementFromPoint(ev.clientX, ev.clientY)
          ?.closest(selector);
        if (
          target &&
          !group.includes(target) &&
          container.contains(target) &&
          allowed(row.dataset[key], target.dataset[key])
        ) {
          const r = target.getBoundingClientRect(),
            after = horizontal
              ? ev.clientX > r.left + r.width / 2
              : ev.clientY > r.top + r.height / 2;
          const reference = after ? target.nextSibling : target;
          group.forEach((el) => container.insertBefore(el, reference));
          if (key === 'task') {
            const rows = [...container.querySelectorAll(selector)];
            rows.sort(
              (a, b) =>
                Number(
                  !!state.tasks.find((t) => t.id === b.dataset.task).date,
                ) -
                Number(!!state.tasks.find((t) => t.id === a.dataset.task).date),
            );
            rows.forEach((el) => container.append(el));
          }
          control.setPointerCapture(ev.pointerId);
        }
        if (horizontal) {
          const r = container.getBoundingClientRect();
          if (ev.clientX > r.right - 35) container.scrollLeft += 16;
          if (ev.clientX < r.left + 35) container.scrollLeft -= 16;
        }
      };
      const finish = () => {
        control.onpointermove = null;
        control.onpointerup = null;
        control.onpointercancel = null;
        group.forEach((el) => el.classList.remove('reordering'));
        if (moving) {
          commit(
            [...container.querySelectorAll(selector)].map(
              (el) => el.dataset[key],
            ),
          );
          setTimeout(() => (suppress = false), 0);
        }
      };
      control.onpointerup = finish;
      control.onpointercancel = finish;
    };
  });
}

// Clear task selection when interacting outside task rows.
document.addEventListener('pointerdown', (event) => {
  document.querySelectorAll('[data-plan-group]').forEach((body) => {
    if (
      !body.contains(event.target) ||
      !event.target.closest('[data-plan-row]')
    ) {
      body.selectedTasks?.clear();
      body
        .querySelectorAll('.task-selected')
        .forEach((row) => row.classList.remove('task-selected'));
    }
  });
  if (event.target.closest('#task-list [data-task]')) return;
  const list = document.querySelector('#task-list');
  list?.selectedTasks?.clear();
  list
    ?.querySelectorAll('.task-selected')
    .forEach((row) => row.classList.remove('task-selected'));
});
