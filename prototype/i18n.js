// UI-only translation. User-authored notes, names and transaction content are preserved.
let language;
try {
  language = localStorage.getItem('zivizip-language') || 'en';
} catch {
  language = 'en';
}
const translations = {
  'Ruang milikmu.': 'Your personal space.',
  Selesai: 'Done',
  'Edit Teks': 'Edit Text',
  Pilih: 'Select',
  Gambar: 'Draw',
  Catatan: 'Note',
  Pengaturan: 'Settings',
  'Buka menu': 'Open menu',
  'Sembunyikan sidebar': 'Hide sidebar',
  'Tambah catatan': 'Add note',
  'Tambah Note': 'Add Note',
  'Edit Note': 'Edit Note',
  Ikon: 'Icon',
  Catatan: 'Note',
  Ide: 'Idea',
  Tugas: 'Tasks',
  Kalender: 'Calendar',
  Rumah: 'Home',
  Keuangan: 'Finance',
  'Jenis Note': 'Note type',
  'Nama Note': 'Note name',
  Kategori: 'Category',
  'Hapus Note': 'Delete Note',
  'Hapus Note?': 'Delete Note?',
  Tutup: 'Close',
  Batal: 'Cancel',
  Tambah: 'Add',
  Simpan: 'Save',
  Hapus: 'Erase',
  'Ubah nama': 'Rename',
  'Isi catatan': 'Note content',
  'Buat note baru untuk mulai menulis.': 'Create a note to start writing.',
  'Tekan lama atau klik dua kali untuk edit note':
    'Hold or double-click to edit note',
  'Arsipkan selesai': 'Archive completed',
  'Tambah tugas': 'Add task',
  'Tugas baru': 'New task',
  'Edit tugas': 'Edit task',
  'Apa yang ingin diselesaikan?': 'What needs to be done?',
  'Tanggal jatuh tempo (opsional)': 'Due date (optional)',
  'Nominal terkait (opsional)': 'Related amount (optional)',
  'Hapus tugas': 'Delete task',
  'Hapus tugas?': 'Delete task?',
  'Tugas ini akan dihapus permanen.': 'This task will be permanently deleted.',
  'Belum ada tugas diarsipkan.': 'No archived tasks yet.',
  'Ruang untuk rencana baru.': 'Room for a new plan.',
  'Tambahkan tugas lewat tombol +.': 'Add a task with the + button.',
  '← Kembali ke tugas aktif': '← Back to active tasks',
  'Belum ada tugas selesai untuk diarsipkan': 'No completed tasks to archive',
  'Tugas dikembalikan ke daftar aktif': 'Task restored to active list',
  'Tugas diperbarui': 'Task updated',
  'Tugas ditambahkan': 'Task added',
  'Tugas dihapus': 'Task deleted',
  'Tambah transaksi': 'Add transaction',
  'Transaksi baru': 'New transaction',
  'Edit transaksi': 'Edit transaction',
  Jenis: 'Type',
  Pengeluaran: 'Expenses',
  Pemasukan: 'Income',
  Saldo: 'Balance',
  Keterangan: 'Description',
  'Nominal (Rp)': 'Amount (Rp)',
  Tanggal: 'Date',
  'Hapus transaksi': 'Delete transaction',
  'Hapus transaksi?': 'Delete transaction?',
  'Ringkasan saldo akan dihitung ulang.': 'Your balance will be recalculated.',
  'Transaksi diperbarui': 'Transaction updated',
  'Transaksi ditambahkan': 'Transaction added',
  'Transaksi dihapus': 'Transaction deleted',
  'Per kategori': 'By category',
  'Per tanggal': 'By date',
  'Bulan transaksi': 'Transaction month',
  'Belum ada transaksi bulan ini.': 'No transactions this month.',
  'Mulai mencatat lewat tombol +.': 'Add a transaction with the + button.',
  Geser: 'Pan',
  Pena: 'Pen',
  Kotak: 'Rectangle',
  Elips: 'Ellipse',
  Jajargenjang: 'Parallelogram',
  'Belah Ketupat': 'Diamond',
  Segitiga: 'Triangle',
  Panah: 'Arrow',
  Warna: 'Color',
  Tebal: 'Width',
  Penghapus: 'Eraser',
  'Ukuran penghapus': 'Eraser size',
  'Hapus Pilihan': 'Delete selection',
  'Salin Gambar': 'Copy image',
  'Kanvas gambar tak terbatas': 'Infinite drawing canvas',
  'Teks di kanvas': 'Canvas text',
  'Gambar catatan': 'Note image',
  'Gambar disalin. Paste di note Text.':
    'Image copied. Paste it into a Text note.',
  'Clipboard tidak tersedia. Gunakan PNG atau screenshot.':
    'Clipboard unavailable. Use PNG export or a screenshot.',
  'Gambar belum dapat diekspor.': 'Could not export the image.',
  'Kembali ke note tujuan lalu paste lagi.':
    'Return to the destination note and paste again.',
  'Gambar terlalu besar (maksimal 15 MB).': 'Image too large (15 MB maximum).',
  'Gambar tidak dapat dibaca.': 'Could not read the image.',
  'Double-click untuk menulis · Scroll untuk geser · Ctrl/⌘ + scroll untuk zoom · Space + drag untuk geser · Delete untuk hapus pilihan':
    'Double-click or double-tap to write · Scroll to pan · Ctrl/⌘ + scroll or pinch to zoom · Space + drag to pan',
  'Ruang pribadimu': 'Your workspace',
  'Prototipe interaktif Zivizip': 'Zivizip interactive preview',
  'Catatan, tugas, dan transaksi disimpan di browser ini. Data contoh menggunakan September 2026.':
    'Notes, tasks, and transactions are stored in this browser. Sample data uses September 2026.',
  'Install PWA, sinkronisasi, offline resmi, dan push notification akan dibuat pada tahap aplikasi sebenarnya.':
    'PWA installation, sync, offline support, and push notifications are planned for the full application.',
  'Reset semua data contoh': 'Reset sample data',
  'Reset data prototipe?': 'Reset preview data?',
  'Semua perubahan lokal akan diganti dengan data contoh awal.':
    'All local changes will be replaced with the original sample data.',
  'Data contoh dipulihkan': 'Sample data restored',
  'Note dihapus': 'Note deleted',
  'Ukuran panel dikembalikan ke default': 'Panel size reset',
  'Ukuran panel tidak dapat disimpan.': 'Could not save panel size.',
  'Perubahan hanya tersimpan selama halaman terbuka.':
    'Storage is full or unavailable. Changes will last only while this page stays open.',
  'Isi kolom dengan teks yang valid.': 'Enter valid text in each field.',
  'Ukuran panel Notes': 'Notes panel size',
  'Ukuran panel To do dan Finance': 'Tasks and Finance panel size',
  'Geser untuk mengubah ukuran · Klik dua kali untuk reset':
    'Drag to resize · Double-click to reset',
};
const originalText = new WeakMap(),
  originalAttrs = new WeakMap();
function translate(s) {
  if (language === 'id') {
    const reverse = {
      Done: 'Selesai',
      'Edit Text': 'Edit Teks',
      Select: 'Pilih',
      Draw: 'Gambar',
      'Zoom in': 'Perbesar',
      'Zoom out': 'Perkecil',
      'Delete selected objects': 'Hapus objek terpilih',
      'Delete selected objects?': 'Hapus objek terpilih?',
      Delete: 'Hapus',
      'Rotate image': 'Putar gambar',
      'Rotate selection': 'Putar pilihan',
      'Drag to rotate': 'Tarik untuk memutar',
      'Delete image': 'Hapus gambar',
      Resize: 'Ubah ukuran',
      'Resize image': 'Ubah ukuran gambar',
      'Drag to resize': 'Tarik untuk mengubah ukuran',
      Fit: 'Sesuaikan',
      'Add image': 'Tambah gambar',
    };
    if (
      /^(\d+) object\(s\) will be deleted\. You can undo this action\.$/.test(
        s.trim(),
      )
    )
      return s.replace(
        /^(\d+) object\(s\) will be deleted\. You can undo this action\.$/,
        '$1 objek akan dihapus. Tindakan ini bisa diurungkan.',
      );
    return reverse[s.trim()] ? s.replace(s.trim(), reverse[s.trim()]) : s;
  }
  const t = s.trim();
  if (translations[t]) return s.replace(t, translations[t]);
  return s
    .replace(/^(\d+) dari (\d+) selesai$/, '$1 of $2 completed')
    .replace(/^Lihat arsip \((\d+)\)$/, 'View archive ($1)')
    .replace(/^(\d+) tugas dipindahkan ke arsip$/, '$1 tasks archived')
    .replace(/^Tutup tab /, 'Close tab ')
    .replace(/^Selesaikan /, 'Complete ')
    .replace(/^Batalkan selesai /, 'Mark incomplete: ')
    .replace(/^Pulihkan /, 'Restore ')
    .replace(/^Edit transaksi /, 'Edit transaction: ')
    .replace(
      /beserta isinya akan dihapus\. Menutup tab saja tidak menghapus note\./,
      'and its contents will be deleted. Closing the tab does not delete the note.',
    );
}
function localize() {
  document.documentElement.lang = language;
  document.title =
    language === 'en'
      ? 'Zivizip — Personal workspace'
      : 'Zivizip — Ruang pribadi';
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walk.nextNode())) {
    if (
      n.parentElement.closest(
        'script,style,[contenteditable],.tab,.task-title,.transaction-name,.category,.plan-table td:first-child,.plan-note-category,.goal-source-item strong,.goal-description,.goal-card h3,.category-transaction span,textarea,#note-breadcrumb,#drawing,.canvas-text-editor',
      )
    )
      continue;
    const last = originalText.get(n);
    let raw = last && n.nodeValue === last.rendered ? last.raw : n.nodeValue;
    const rendered = translate(raw);
    originalText.set(n, { raw, rendered });
    if (n.nodeValue !== rendered) n.nodeValue = rendered;
  }
  document.querySelectorAll('[aria-label],[title]').forEach((el) => {
    let records = originalAttrs.get(el) || {};
    for (const attr of ['aria-label', 'title']) {
      if (!el.hasAttribute(attr)) continue;
      const current = el.getAttribute(attr),
        last = records[attr],
        raw = last && current === last.rendered ? last.raw : current,
        rendered = translate(raw);
      records[attr] = { raw, rendered };
      if (current !== rendered) el.setAttribute(attr, rendered);
    }
    originalAttrs.set(el, records);
  });
}
window.addEventListener('DOMContentLoaded', () => {
  localize();
  const observer = new MutationObserver((records) => {
    if (
      records.every((r) =>
        (r.target.nodeType === 1 ? r.target : r.target.parentElement)?.closest(
          '#drawing,[contenteditable]',
        ),
      )
    )
      return;
    observer.disconnect();
    localize();
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
  });
});
function languageSettings() {
  const label = document.createElement('label');
  label.className = 'language-picker';
  label.innerHTML =
    'Language / Bahasa <select id="language"><option value="en">English</option><option value="id">Bahasa Indonesia</option></select>';
  $('#dialog-fields').prepend(label);
  $('#language').value = language;
  $('#language').onchange = (e) => {
    language = e.target.value;
    try {
      localStorage.setItem('zivizip-language', language);
    } catch {}
    plannerRender();
    localize();
  };
}
