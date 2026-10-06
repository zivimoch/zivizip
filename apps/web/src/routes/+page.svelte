<script lang="ts">
  import { onMount, tick } from 'svelte';
  import TextEditor from '$lib/TextEditor.svelte';
  import TasksPanel from '$lib/TasksPanel.svelte';
  import { TasksRepository, readTaskState } from '$lib/tasks';
  import FinancePanel from '$lib/FinancePanel.svelte';
  import { FinanceRepository, readFinanceState } from '$lib/finance';
  import { PlanningRepository, readPlanningState } from '$lib/planning';
  import { assetsIn, type TextDocument } from '$lib/text/document';
  import { getMedia, putMedia, decodeMedia } from '$lib/text/media';
  import DrawEditor from '$lib/DrawEditor.svelte';
  import type { Viewport } from '$lib/draw/scene';
  import Icon from '$lib/Icon.svelte';
  import AccountDialog from '$lib/AccountDialog.svelte';
  import { AccountNotes, ApiError, api, type Account } from '$lib/account';
  import {
    WorkspaceDB,
    LocalNotes,
    defaults,
    exportWorkspace,
    importWorkspace,
    validateBackup,
    type Note,
    type Preferences,
    type Backup,
    type NotesRepository,
  } from '$lib/storage';
  import '../app.css';
  let db: WorkspaceDB;
  let repo: NotesRepository;
  let notes: Note[] = [];
  let prefs: Preferences = { ...defaults, open: [] };
  let ready = false;
  let error = '';
  let notice = '';
  let view = 'main';
  let details = false;
  let mobileMenu = false;
  let dialog: HTMLDialogElement;
  let settings: HTMLDialogElement;
  let nameInput: HTMLInputElement;
  let editing: string | null = null;
  let formName = '';
  let formCategory = '';
  let formIcon = 'note';
  let formKind: 'text' | 'draw' = 'text';
  let drawBusy = false;
  let drawViews: Record<string, Viewport> = {};
  function rememberDrawView(id: string, value: Viewport) {
    drawViews[id] = value;
    if (db) void db.meta.put({ key: 'draw-view-' + id, value }).catch(problem);
  }
  async function loadDrawViews(target: WorkspaceDB) {
    const rows = await target.meta.toArray();
    return Object.fromEntries(
      rows
        .filter((r) => r.key.startsWith('draw-view-'))
        .map((r) => [r.key.slice(10), r.value as Viewport]),
    );
  }
  let backup: Backup | null = null;
  let online = true;
  let queue = Promise.resolve();
  let textTools: HTMLDivElement;
  let pending = 0;
  let dragId: string | null = null;
  let workspace: HTMLDivElement;
  let right: HTMLDivElement;
  let measure = '';
  let accountDialog: AccountDialog;
  let accountMenu = false;
  let guestDb: WorkspaceDB;
  let account: Account | null = null;
  let verified = false;
  let switching = false;
  let refreshing = false;
  let eventSource: EventSource | null = null;
  let channel: BroadcastChannel | null = null;
  let welcome: HTMLDialogElement;
  let migration: HTMLDialogElement;
  let guestCount = 0;
  let dirty = new Set<string>();
  let tasksRepo: TasksRepository;
  let taskBusy = false;
  let taskRefresh = 0;
  let financeRepo: FinanceRepository;
  let financeBusy = false;
  let planningRepo: PlanningRepository;
  let planningBusy = false;
  $: workspaceBusy = taskBusy || financeBusy || planningBusy;
  let alive = true;
  let workspaceEpoch = 0;
  const redirectedNotes = new Map<string, string>();
  $: writable = !switching && (!account || (online && verified));
  $: current = notes.find((n) => n.id === prefs.active);
  $: openNotes = prefs.open
    .map((id) => notes.find((n) => n.id === id))
    .filter((n): n is Note => !!n);
  $: categories = [...new Set(notes.map((n) => n.category))];
  $: t =
    prefs.language === 'en'
      ? (en: string, _id: string) => en
      : (_en: string, id: string) => id;
  function setLanguage(language: string) {
    prefs = { ...prefs, language: language === 'id' ? 'id' : 'en' };
    document.documentElement.lang = prefs.language;
    remember();
  }
  const titleCase = (s: string) =>
    s.replace(/(^|[\s-])\p{L}/gu, (c) => c.toLocaleUpperCase());
  function problem(e: unknown) {
    error =
      t(
        'Could not save. Keep this page open and retry. ',
        'Tidak dapat menyimpan. Biarkan halaman terbuka dan coba lagi. ',
      ) + (e instanceof Error ? e.message : '');
  }
  function remember() {
    if (db)
      void db.preferences.put(JSON.parse(JSON.stringify(prefs))).catch(problem);
  }
  async function load() {
    notes = await repo.list();
    prefs = (await db.preferences.get('workspace')) || {
      ...defaults,
      open: [],
    };
    prefs.open = prefs.open.filter((id) => notes.some((n) => n.id === id));
    if (!prefs.open.includes(prefs.active || ''))
      prefs.active = prefs.open[0] || null;
    const epoch = workspaceEpoch;
    tasksRepo = new TasksRepository(
      db,
      !!account,
      () => epoch === workspaceEpoch,
    );
    financeRepo = new FinanceRepository(
      db,
      !!account,
      () => epoch === workspaceEpoch,
    );
    planningRepo = new PlanningRepository(
      db,
      !!account,
      () => epoch === workspaceEpoch,
    );
    taskRefresh++;
  }
  async function activate(user: Account | null, fetchServer = true) {
    switching = true;
    workspaceEpoch++;
    const nextDb = user
      ? new WorkspaceDB(`zivizip-account-${user.id}-v1`)
      : guestDb;
    const nextRepo = user ? new AccountNotes(nextDb) : new LocalNotes(nextDb);
    try {
      const nextNotes =
        user && !fetchServer
          ? await nextDb.notes.toArray()
          : await nextRepo.list();
      const nextPrefs = (await nextDb.preferences.get('workspace')) || {
        ...defaults,
        language: prefs.language,
        open: [],
      };
      nextPrefs.open = nextPrefs.open.filter((id) =>
        nextNotes.some((n) => n.id === id),
      );
      if (!nextPrefs.open.includes(nextPrefs.active || ''))
        nextPrefs.active = nextPrefs.open[0] || null;
      const nextViews = await loadDrawViews(nextDb);
      const epoch = workspaceEpoch;
      const nextTasks = new TasksRepository(
        nextDb,
        !!user,
        () => epoch === workspaceEpoch,
      );
      await nextTasks.list(fetchServer);
      const nextFinance = new FinanceRepository(
        nextDb,
        !!user,
        () => epoch === workspaceEpoch,
      );
      await nextFinance.list(fetchServer);
      const nextPlanning = new PlanningRepository(
        nextDb,
        !!user,
        () => epoch === workspaceEpoch,
      );
      await nextPlanning.list(fetchServer);
      if (user) await guestDb.meta.put({ key: 'active-account', value: user });
      else await guestDb.meta.delete('active-account');
      eventSource?.close();
      eventSource = null;
      if (repo instanceof AccountNotes) repo.deactivate();
      if (db !== guestDb && db !== nextDb) db.close();
      redirectedNotes.clear();
      account = user;
      verified = !!user && fetchServer;
      db = nextDb;
      repo = nextRepo;
      drawViews = nextViews;
      notes = nextNotes;
      prefs = nextPrefs;
      tasksRepo = nextTasks;
      financeRepo = nextFinance;
      planningRepo = nextPlanning;
      taskRefresh++;
      if (user && fetchServer) listen();
    } catch (e) {
      if (nextDb !== guestDb) nextDb.close();
      const epoch = workspaceEpoch;
      tasksRepo = new TasksRepository(
        db,
        !!account,
        () => epoch === workspaceEpoch,
      );
      financeRepo = new FinanceRepository(
        db,
        !!account,
        () => epoch === workspaceEpoch,
      );
      planningRepo = new PlanningRepository(
        db,
        !!account,
        () => epoch === workspaceEpoch,
      );
      taskRefresh++;
      throw e;
    } finally {
      switching = false;
    }
  }
  async function refreshAccount() {
    if (
      !account ||
      pending ||
      workspaceBusy ||
      drawBusy ||
      dirty.size ||
      switching ||
      refreshing ||
      !online
    )
      return;
    refreshing = true;
    const epoch = workspaceEpoch;
    const target = repo;
    try {
      await api<Account>('/session');
      if (epoch !== workspaceEpoch) return;
      const fresh = await target.list();
      if (
        epoch !== workspaceEpoch ||
        pending ||
        workspaceBusy ||
        drawBusy ||
        dirty.size ||
        switching
      )
        return;
      notes = fresh;
      taskRefresh++;
      verified = true;
      prefs.open = prefs.open.filter((id) => fresh.some((n) => n.id === id));
      if (!prefs.open.includes(prefs.active || ''))
        prefs.active = prefs.open[0] || null;
      remember();
    } catch (e) {
      if (epoch !== workspaceEpoch) return;
      verified = false;
      if (
        e instanceof ApiError &&
        e.status === 401 &&
        !pending &&
        !workspaceBusy &&
        !dirty.size
      ) {
        if (repo instanceof AccountNotes) repo.deactivate();
        eventSource?.close();
        await db.delete();
        await activate(null);
        notice = t(
          'Your session ended. Guest workspace restored.',
          'Sesi berakhir. Workspace tamu dipulihkan.',
        );
      }
    } finally {
      refreshing = false;
    }
  }

  function listen() {
    eventSource?.close();
    eventSource = new EventSource('/api/events');
    eventSource.addEventListener('notes', () => void refreshAccount());
    eventSource.addEventListener('session-ended', () => void refreshAccount());
    eventSource.onerror = () => {
      verified = false;
    };
  }
  async function signedIn(user: Account) {
    if (workspaceBusy) throw Error('Please wait for changes to finish saving');
    await queue;
    if (dirty.size) throw new Error('Save or download pending changes first');
    await activate(user);
    channel?.postMessage('session');
    guestCount =
      (await guestDb.notes.count()) +
      readTaskState((await guestDb.meta.get('tasks'))?.value).items.length +
      readFinanceState((await guestDb.meta.get('finance'))?.value).items
        .length +
      readPlanningState((await guestDb.meta.get('planning'))?.value).months
        .length;
    if (guestCount) {
      await tick();
      migration.showModal();
    }
  }
  async function signedOut() {
    if (workspaceBusy) return;
    await queue;
    if (dirty.size) {
      notice = t(
        'Retry saving or download your pending changes before logging out.',
        'Coba simpan lagi atau unduh perubahan tertunda sebelum keluar.',
      );
      return;
    }
    switching = true;
    workspaceEpoch++;
    try {
      await api('/session', 'DELETE');
      eventSource?.close();
      if (repo instanceof AccountNotes) repo.deactivate();
      await db.delete();
      await activate(null);
      channel?.postMessage('session');
      notice = t(
        'Logged out. Your guest workspace is unchanged.',
        'Berhasil keluar. Workspace tamu tetap tersimpan.',
      );
    } catch (e) {
      problem(e);
    } finally {
      switching = false;
    }
  }
  async function copyGuest() {
    if (!(repo instanceof AccountNotes) || !writable || workspaceBusy) return;
    switching = true;
    try {
      const guest = await guestDb.notes.toArray();
      for (const n of guest) {
        const key = `guest-import:${n.id}:${n.revision}`;
        if (await db.meta.get(key)) continue;
        for (const id of assetsIn(n.rich))
          await putMedia(db, await getMedia(guestDb, id, false), true);
        const copy = await repo.copy({
          ...n,
          id: crypto.randomUUID(),
          revision: 1,
        });
        await db.meta.put({ key, value: copy.id });
      }
      const guestTasks = readTaskState(
        (await guestDb.meta.get('tasks'))?.value,
      ).items;
      if (guestTasks.length) {
        const currentTasks = await tasksRepo.list();
        // Stable copy IDs make retries safe even if the response was interrupted.
        const copies = await Promise.all(
          guestTasks.map(async (task) => {
            const digest = await crypto.subtle.digest(
              'SHA-256',
              new TextEncoder().encode(`guest-task:${task.id}`),
            );
            return {
              ...task,
              id: [...new Uint8Array(digest)]
                .map((byte) => byte.toString(16).padStart(2, '0'))
                .join(''),
            };
          }),
        );
        await tasksRepo.write(currentTasks, [
          ...currentTasks.items,
          ...copies.filter(
            (task) => !currentTasks.items.some((old) => old.id === task.id),
          ),
        ]);
      }
      const guestTransactions = readFinanceState(
        (await guestDb.meta.get('finance'))?.value,
      ).items;
      if (guestTransactions.length) {
        const currentFinance = await financeRepo.list();
        const copies = await Promise.all(
          guestTransactions.map(async (item) => {
            const digest = await crypto.subtle.digest(
              'SHA-256',
              new TextEncoder().encode(`guest-transaction:${item.id}`),
            );
            return {
              ...item,
              id: [...new Uint8Array(digest)]
                .map((byte) => byte.toString(16).padStart(2, '0'))
                .join(''),
            };
          }),
        );
        await financeRepo.write(currentFinance, [
          ...currentFinance.items,
          ...copies.filter(
            (item) => !currentFinance.items.some((old) => old.id === item.id),
          ),
        ]);
      }
      const guestPlans = readPlanningState(
        (await guestDb.meta.get('planning'))?.value,
      );
      if (guestPlans.months.length) await planningRepo.merge(guestPlans);
      notes = await repo.list();
      taskRefresh++;
      migration.close();
      notice = t(
        'Guest workspace copied to your account. Local originals remain available.',
        'Workspace tamu disalin ke akun. Data asli tetap tersedia secara lokal.',
      );
    } catch (e) {
      problem(e);
    } finally {
      switching = false;
    }
  }
  async function start() {
    const start = performance.now();
    guestDb = new WorkspaceDB();
    db = guestDb;
    repo = new LocalNotes(db);
    await load();
    drawViews = await loadDrawViews(db);
    const marker = (await guestDb.meta.get('active-account'))?.value as
      | Account
      | undefined;
    try {
      const user = await api<Account>('/session');
      await activate(user);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        if (marker) {
          await new WorkspaceDB(`zivizip-account-${marker.id}-v1`).delete();
          await guestDb.meta.delete('active-account');
        }
        await activate(null);
      } else if (marker) {
        await activate(marker, false);
      } else await activate(null);
    }
    if (!alive) return;
    ready = true;
    document.documentElement.lang = prefs.language;
    measure = `${Math.round(performance.now() - start)} ms`;
    performance.mark('zivizip-workspace-ready');
    if (!account && !(await guestDb.meta.get('guest-notice'))) {
      await tick();
      welcome.showModal();
    }
  }
  onMount(() => {
    online = navigator.onLine;
    alive = true;
    void start().catch(problem);
    const connectivity = () => {
      online = navigator.onLine;
      if (!online) verified = false;
      else if (account) {
        listen();
        void refreshAccount();
      }
    };
    window.addEventListener('online', connectivity);
    window.addEventListener('offline', connectivity);
    const leave = (e: BeforeUnloadEvent) => {
      if (workspaceBusy || drawBusy || error || pending || dirty.size) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', leave);
    channel = new BroadcastChannel('zivizip-session');
    channel.onmessage = async () => {
      if (workspaceBusy || pending || dirty.size) {
        verified = false;
        notice = t(
          'Account changed in another tab. Download pending edits before reloading.',
          'Akun berubah di tab lain. Unduh perubahan tertunda sebelum memuat ulang.',
        );
        return;
      }
      try {
        await activate(await api<Account>('/session'));
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          if (account) {
            if (repo instanceof AccountNotes) repo.deactivate();
            eventSource?.close();
            await db.delete();
          }
          await activate(null);
        }
      }
    };
    return () => {
      alive = false;
      eventSource?.close();
      channel?.close();
      window.removeEventListener('online', connectivity);
      window.removeEventListener('offline', connectivity);
      window.removeEventListener('beforeunload', leave);
    };
  });
  async function retrySave() {
    if (!online && account) return;
    try {
      if (account) {
        await api('/session');
        verified = true;
      }
      for (const id of [...dirty]) {
        const n = notes.find((n) => n.id === id);
        if (!n) continue;
        const saved = await repo.write(n);
        notes = notes.map((n) => (n.id === id ? saved : n));
        if (saved.id !== id) {
          closeNote(id);
          openNote(saved.id);
        }
        dirty.delete(id);
      }
      dirty = new Set(dirty);
      error = '';
    } catch (e) {
      problem(e);
    }
  }

  function openNote(id: string) {
    if (!prefs.open.includes(id)) prefs.open = [...prefs.open, id];
    prefs.active = id;
    remember();
  }
  function closeNote(id: string) {
    const index = prefs.open.indexOf(id);
    prefs.open = prefs.open.filter((n) => n !== id);
    if (prefs.active === id)
      prefs.active = prefs.open[Math.min(index, prefs.open.length - 1)] || null;
    remember();
  }
  function editBody(body: string, original = current?.id, rich?: TextDocument) {
    if (!original || !writable) return;
    dirty.add(original);
    notes = notes.map((n) => (n.id === original ? { ...n, body, rich } : n));
    pending++;
    queue = queue.then(async () => {
      const id = redirectedNotes.get(original) || original;
      const latest = notes.find((n) => n.id === id);
      if (!latest) {
        pending--;
        return;
      }
      try {
        const saved = await repo.write({ ...latest, body, rich });
        const live = notes.find((n) => n.id === id);
        if (saved.id !== id) {
          redirectedNotes.set(original, saved.id);
          notes = [
            ...notes,
            { ...saved, body: live?.body ?? body, rich: live?.rich },
          ];
          openNote(saved.id);
          notice = t(
            'A separate copy preserves conflicting changes.',
            'Salinan terpisah menyimpan perubahan yang bertentangan.',
          );
        } else
          notes = notes.map((n) =>
            n.id === id
              ? { ...saved, body: live?.body ?? body, rich: live?.rich }
              : n,
          );
        if (
          live?.body === body &&
          JSON.stringify(live?.rich) === JSON.stringify(rich)
        ) {
          dirty.delete(original);
          dirty.delete(id);
          dirty = new Set(dirty);
        }
        if (!dirty.size) error = '';
      } catch (e) {
        problem(e);
        if (e instanceof ApiError && e.status === 401) verified = false;
      } finally {
        pending--;
        if (pending === 0 && account && !dirty.size) void refreshAccount();
      }
    });
  }

  async function showNote(n?: Note) {
    if (!writable) return;
    await queue;
    editing = n?.id || null;
    let number = prefs.counter + 1;
    while (notes.some((n) => n.name === `Note${number}`)) number++;
    formName = n?.name || `Note${number}`;
    formCategory = n?.category || t('General', 'Umum');
    formIcon = n?.icon || 'note';
    formKind = n?.kind || 'text';
    dialog.showModal();
    await tick();
    nameInput.focus();
    if (!n) nameInput.select();
  }
  async function submitNote(e: SubmitEvent) {
    e.preventDefault();
    if (!writable) return;
    await queue;
    if (!formName.trim() || !formCategory.trim()) return;
    try {
      if (editing) {
        const n = notes.find((n) => n.id === editing)!;
        const saved = await repo.write({
          ...n,
          name: formName.trim(),
          category: formCategory.trim(),
          icon: formIcon,
        });
        notes = notes.filter((n) => n.id !== saved.id);
        notes = [...notes, saved];
        openNote(saved.id);
      } else {
        const n = await repo.create(
          formName.trim(),
          formCategory.trim(),
          formKind === 'draw' && formIcon === 'note' ? 'draw' : formIcon,
          formKind,
        );
        notes = [...notes, n];
        prefs.counter++;
        openNote(n.id);
      }
      dialog.close();
    } catch (e) {
      problem(e);
    }
  }
  async function removeNote() {
    if (
      !writable ||
      !editing ||
      !confirm(
        t('Delete this note permanently?', 'Hapus catatan ini permanen?'),
      )
    )
      return;
    await queue;
    try {
      await repo.remove(editing);
      notes = notes.filter((n) => n.id !== editing);
      closeNote(editing);
      dialog.close();
    } catch (e) {
      problem(e);
    }
  }
  function capitalise(event: Event, kind: 'name' | 'category') {
    const input = event.target as HTMLInputElement;
    if ((event as InputEvent).isComposing) return;
    const start = input.selectionStart,
      end = input.selectionEnd;
    input.value = titleCase(input.value);
    if (kind === 'name') formName = input.value;
    else formCategory = input.value;
    if (start !== null) input.setSelectionRange(start, end);
  }
  async function download() {
    if (workspaceBusy) return;
    await queue;
    try {
      if (account && online) {
        await Promise.all([
          tasksRepo.list(),
          financeRepo.list(),
          planningRepo.list(),
        ]);
      }
      for (const id of new Set(notes.flatMap((n) => assetsIn(n.rich))))
        await getMedia(db, id, !!account);
      const data = await exportWorkspace(db, notes);
      data.notes = notes.map((n) => ({ ...n }));
      data.preferences = JSON.parse(JSON.stringify(prefs));
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `zivizip-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      problem(e);
    }
  }
  async function inspectFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 50_000_000) throw new Error('Maximum backup size: 50 MB');
      backup = validateBackup(JSON.parse(await file.text()));
      error = '';
    } catch (e) {
      backup = null;
      error =
        t('Invalid backup: ', 'Backup tidak valid: ') + (e as Error).message;
    }
    input.value = '';
  }
  async function restore() {
    if (!backup || !writable || workspaceBusy) return;
    await queue;
    try {
      let count = 0;
      const taskCount = backup.tasks?.length || 0;
      const transactionCount = backup.transactions?.length || 0;
      if (repo instanceof AccountNotes) {
        const media = await Promise.all((backup.media || []).map(decodeMedia));
        for (const m of media) await putMedia(db, m.blob, true);
        for (const n of backup.notes) {
          await repo.copy({ ...n, id: crypto.randomUUID(), revision: 1 });
          count++;
        }
        notes = await repo.list();
        if (backup.tasks?.length) await tasksRepo.merge(backup.tasks);
        if (backup.transactions?.length)
          await financeRepo.merge(backup.transactions);
        if (backup.planning) await planningRepo.merge(backup.planning);
        taskRefresh++;
      } else {
        count = await importWorkspace(db, backup);
        await load();
        drawViews = await loadDrawViews(db);
      }
      backup = null;
      notice = t(
        `${count} notes, ${taskCount} tasks and ${transactionCount} transactions imported as new copies. Financial plans merged.`,
        `${count} catatan, ${taskCount} tugas dan ${transactionCount} transaksi diimpor sebagai salinan baru. Rencana keuangan digabungkan.`,
      );
    } catch (e) {
      problem(e);
    }
  }
  function navigate(next: string) {
    view = next;
    mobileMenu = false;
  }
  function startResize(e: PointerEvent, axis: 'width' | 'height') {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const box = (
        axis === 'width' ? workspace : right
      ).getBoundingClientRect();
      prefs[axis] = Math.max(
        20,
        Math.min(
          axis === 'width' ? 85 : 80,
          (axis === 'width'
            ? (ev.clientX - box.left) / box.width
            : (ev.clientY - box.top) / box.height) * 100,
        ),
      );
    };
    const stop = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', stop);
      target.removeEventListener('pointercancel', stop);
      remember();
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', stop);
    target.addEventListener('pointercancel', stop);
  }
  function moveTab(e: PointerEvent, id: string) {
    if (e.button !== 0) return;
    const target = e.currentTarget as HTMLElement;
    const x = e.clientX;
    let moved = false;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - x) < 8 && !moved) return;
      moved = true;
      dragId = id;
      const tab = document
        .elementFromPoint(ev.clientX, ev.clientY)
        ?.closest<HTMLElement>('[data-note-id]');
      if (tab && tab.dataset.noteId !== id) {
        const next = prefs.open.filter((n) => n !== id);
        next.splice(prefs.open.indexOf(tab.dataset.noteId!), 0, id);
        prefs.open = next;
      }
    };
    const stop = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', stop);
      target.removeEventListener('pointercancel', stop);
      if (moved) remember();
      setTimeout(() => (dragId = null), 0);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', stop);
    target.addEventListener('pointercancel', stop);
  }
</script>

<svelte:head
  ><title>Zivizip — Personal workspace</title><meta
    name="description"
    content="Capture thoughts and organize your day in a private workspace."
  /><meta name="robots" content="noindex,nofollow" /></svelte:head
>
<header class="mobile-header">
  <button aria-label="Open menu" onclick={() => (mobileMenu = true)}
    ><Icon name="menu" /></button
  ><b>zivizip<span>.</span></b>
</header>
<aside class:expanded={mobileMenu} class="sidebar">
  <div class="sidebar-heading">
    <a
      class="brand"
      href="/"
      aria-label="Zivizip Main"
      onclick={(event) => {
        event.preventDefault();
        navigate('main');
      }}
    >
      <span class="brand-mark">z</span><b>zivizip</b>
    </a>
    <button
      class="hide-menu"
      aria-label="Close menu"
      onclick={() => (mobileMenu = false)}>←</button
    >
  </div>
  <div class="workspace-label">
    {t('PERSONAL WORKSPACE', 'WORKSPACE PRIBADI')}
  </div>
  <nav>
    <button
      class:active={view === 'main'}
      title="Main"
      onclick={() => navigate('main')}
      ><Icon name="home" /><span>Main</span></button
    ><button
      class:active={view === 'goals'}
      title="Goals"
      onclick={() => navigate('goals')}
      ><Icon name="goals" /><span>{t('Goals', 'Target')}</span></button
    ><button
      title="Detail"
      aria-label="Detail"
      aria-expanded={details}
      onclick={() => (details = !details)}
      ><Icon name="layers" /><span>Detail</span><span class="chevron"
        >{details ? '⌃' : '⌄'}</span
      ></button
    >{#if details}<div class="detail">
        {#each ['notes', 'tasks', 'finance'] as item}<button
            class:active={view === item}
            title={item === 'notes'
              ? 'Notes'
              : item === 'tasks'
                ? 'To do'
                : 'Finance'}
            aria-label={item === 'notes'
              ? 'Notes'
              : item === 'tasks'
                ? 'To do'
                : 'Finance'}
            onclick={() => navigate(item)}
            ><Icon name={item === 'notes' ? 'note' : item} /><span
              >{item === 'notes'
                ? 'Notes'
                : item === 'tasks'
                  ? 'To do'
                  : 'Finance'}</span
            ></button
          >{/each}
      </div>{/if}
  </nav>
  <div class="sidebar-footer">
    <div class="sidebar-profile">
      <div class="account-control">
        {#if account}<div class="account-status">
            {account.username} · {writable
              ? t(
                  'Account workspace · synced to server',
                  'Workspace akun · tersimpan di server',
                )
              : t(
                  'Account cache · read only until connected',
                  'Cache akun · hanya baca sampai terhubung',
                )}
          </div>{/if}

        <button
          class="account-button"
          aria-label={t('Account', 'Akun')}
          aria-expanded={accountMenu}
          onclick={() => (accountMenu = !accountMenu)}
          ><span class="avatar" aria-hidden="true"
            >{account ? account.username[0].toUpperCase() : 'Z'}</span
          ><span class="profile-name"
            >{account ? account.username : t('Guest', 'Tamu')}<small
              >{t('Your space.', 'Ruang milikmu.')}</small
            ></span
          ></button
        >{#if accountMenu}<div class="account-menu">
            <p>
              {account
                ? account.username
                : t('Guest workspace', 'Workspace tamu')}
            </p>
            {#if account}<button
                disabled={workspaceBusy ||
                  switching ||
                  pending > 0 ||
                  dirty.size > 0 ||
                  !online}
                onclick={async () => {
                  accountMenu = false;
                  await signedOut();
                }}>{t('Log out', 'Keluar')}</button
              >{#if !online}<small
                  >{t(
                    'Reconnect to log out securely.',
                    'Hubungkan internet untuk keluar dengan aman.',
                  )}</small
                >{/if}{:else}<button
                disabled={workspaceBusy ||
                  switching ||
                  pending > 0 ||
                  dirty.size > 0}
                onclick={() => {
                  accountMenu = false;
                  mobileMenu = false;
                  accountDialog.open();
                }}>{t('Log in', 'Masuk')}</button
              >{/if}<button onclick={() => (accountMenu = false)}
              >{t('Close', 'Tutup')}</button
            >
          </div>{/if}
      </div>
      <button
        class="settings-button"
        title={t('Settings', 'Pengaturan')}
        aria-label={t('Settings', 'Pengaturan')}
        onclick={() => settings.showModal()}><Icon name="settings" /></button
      >
    </div>
  </div>
</aside>
<div
  class="workspace"
  class:main={view === 'main'}
  bind:this={workspace}
  style={`--notes:${prefs.width}%;--tasks:${prefs.height}%`}
>
  {#if error}<div class="error" role="alert">
      {error}<button onclick={retrySave}
        >{t('Retry save', 'Coba simpan')}</button
      ><button onclick={download}
        >{t('Download backup', 'Unduh cadangan')}</button
      ><button
        onclick={() => (error = '')}
        aria-label={t('Dismiss message', 'Tutup pesan')}>×</button
      >
    </div>{/if}{#if notice}<button class="notice" onclick={() => (notice = '')}
      >{notice} ×</button
    >{/if}
  {#if !ready}<div class="empty">
      {error
        ? t('Storage unavailable.', 'Penyimpanan tidak tersedia.')
        : t('Opening workspace…', 'Membuka workspace…')}
    </div>
  {:else if view === 'main' || view === 'notes'}
    <section class="notes-pane">
      <div class="tabs">
        {#each openNotes as note (note.id)}<div
            class="tab"
            class:active={prefs.active === note.id}
            data-note-id={note.id}
          >
            <button
              class="tab-select"
              onpointerdown={(e) => moveTab(e, note.id)}
              onclick={() => {
                if (!dragId) openNote(note.id);
              }}
              ondblclick={() => showNote(note)}
              onkeydown={(e) => {
                if (e.key === 'F2') showNote(note);
              }}
              title={`${note.name} · ${t('Double-click to edit', 'Klik dua kali untuk edit')}`}
              ><Icon name={note.icon} /><span>{note.name}</span></button
            ><button
              class="close-tab"
              aria-label={`${t('Close', 'Tutup')} ${note.name}`}
              onclick={() => closeNote(note.id)}>×</button
            >
          </div>{/each}<button
          class="add-tab"
          disabled={!writable}
          aria-label={t('New note', 'Catatan baru')}
          onclick={() => showNote()}><Icon name="plus" /></button
        >
      </div>
      {#if view === 'notes'}<div class="note-library">
          <h2>{t('Your notes', 'Catatanmu')}</h2>
          {#each notes as n}<button onclick={() => openNote(n.id)}
              ><Icon name={n.icon} />{n.name}<small>{n.category}</small></button
            >{/each}
        </div>{/if}
      {#if current}<div class="breadcrumb">
          <span class="breadcrumb-path"
            >{current.category}<span>/</span>{current.name}</span
          >
          {#if current.kind !== 'draw'}<div
              class="breadcrumb-tools"
              bind:this={textTools}
            ></div>{/if}
        </div>
        {#if current.kind === 'draw'}
          {#key `${workspaceEpoch}:${current.id}:${prefs.language}`}
            {@const drawId = current.id}
            <DrawEditor
              body={current.body}
              name={current.name}
              {writable}
              language={prefs.language}
              view={drawViews[drawId]}
              onchange={(body) => editBody(body, drawId)}
              onviewport={(value) => rememberDrawView(drawId, value)}
              onbusy={(value) => (drawBusy = value)}
              onerror={problem}
            />
          {/key}
        {:else}
          {#key `${workspaceEpoch}:${current.id}:${prefs.language}`}
            {@const textId = current.id}
            {@const editorDb = db}
            {@const epoch = workspaceEpoch}
            {@const server = !!account}
            <TextEditor
              toolbar={textTools}
              body={current.body}
              rich={current.rich}
              {writable}
              language={prefs.language}
              onchange={(body, rich) => editBody(body, textId, rich)}
              onget={(id) =>
                getMedia(editorDb, id, server, () => epoch === workspaceEpoch)}
              onput={(blob) =>
                putMedia(
                  editorDb,
                  blob,
                  server,
                  () => epoch === workspaceEpoch && writable,
                )}
              onbusy={(value) => (drawBusy = value)}
              onerror={problem}
            />
          {/key}{/if}{:else}<div class="empty">
          <Icon name="note" />
          <p>
            {t('A little space for your thoughts.', 'Ruang untuk pikiranmu.')}
          </p>
          <button
            class="primary"
            disabled={!writable}
            onclick={() => showNote()}
            >{t('Create a note', 'Buat catatan')}</button
          >
        </div>{/if}
    </section>
    {#if view === 'main'}<button
        class="divider vertical"
        aria-label="Resize notes"
        onpointerdown={(e) => startResize(e, 'width')}
        ondblclick={() => {
          prefs.width = 75;
          remember();
        }}
        onkeydown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            prefs.width = Math.max(
              20,
              Math.min(85, prefs.width + (e.key === 'ArrowRight' ? 2 : -2)),
            );
            remember();
          }
        }}
      ></button>
      <div class="right-pane" bind:this={right}>
        <div class="tasks-slot">
          {#key tasksRepo.db.name}<TasksPanel
              repository={tasksRepo}
              {writable}
              language={prefs.language}
              refreshToken={taskRefresh}
              onbusy={(value) => (taskBusy = value)}
            />{/key}
        </div>
        <button
          class="divider horizontal"
          aria-label="Resize tasks"
          onpointerdown={(e) => startResize(e, 'height')}
          ondblclick={() => {
            prefs.height = 49;
            remember();
          }}
        ></button>
        {#key financeRepo.db.name}<FinancePanel
            repository={financeRepo}
            planningRepository={planningRepo}
            {writable}
            language={prefs.language}
            refreshToken={taskRefresh}
            onbusy={(value) => (financeBusy = value)}
          />{/key}
      </div>{/if}
  {:else if view === 'tasks'}<div class="tasks-page">
      {#key tasksRepo.db.name}<TasksPanel
          repository={tasksRepo}
          {writable}
          language={prefs.language}
          refreshToken={taskRefresh}
          onbusy={(value) => (taskBusy = value)}
        />{/key}
    </div>
  {:else if view === 'finance'}
    {#await import('$lib/FinanceDetail.svelte') then module}
      {#key financeRepo.db.name}<svelte:component
          this={module.default}
          repository={financeRepo}
          planning={planningRepo}
          {writable}
          language={prefs.language}
          refreshToken={taskRefresh}
          onfinancebusy={(value) => (financeBusy = value)}
          onplanbusy={(value) => (planningBusy = value)}
        />{/key}
    {:catch issue}<p role="alert">{issue.message}</p>{/await}
  {:else}<section class="placeholder">
      <Icon name={view} />
      <h1>
        {view === 'goals'
          ? t('Goals', 'Target')
          : view === 'tasks'
            ? 'To do'
            : 'Finance'}
      </h1>
      <p>
        {t(
          'This section is being prepared. Your notes are ready to use.',
          'Bagian ini sedang disiapkan. Catatanmu sudah bisa digunakan.',
        )}
      </p>
      <button onclick={() => navigate('main')}
        >{t('Back to workspace', 'Kembali ke workspace')}</button
      >
    </section>{/if}
</div>
<nav class="bottom-nav">
  {#each ['notes', 'tasks', 'finance'] as item}<button
      class:active={view === item}
      onclick={() => navigate(item)}
      ><Icon name={item === 'notes' ? 'note' : item} />{item === 'notes'
        ? 'Notes'
        : item === 'tasks'
          ? 'To do'
          : 'Finance'}</button
    >{/each}
</nav>
<dialog bind:this={dialog}>
  <form onsubmit={submitNote}>
    <div class="dialog-heading">
      <h2>
        {editing
          ? t('Edit note', 'Edit catatan')
          : t('New note', 'Catatan baru')}
      </h2>
      <button
        type="button"
        aria-label="Close dialog"
        onclick={() => dialog.close()}>×</button
      >
    </div>
    {#if !editing}<fieldset class="note-type-picker">
        <legend>{t('Note type', 'Jenis catatan')}</legend>
        <label
          ><input type="radio" bind:group={formKind} value="text" />Text</label
        >
        <label
          ><input type="radio" bind:group={formKind} value="draw" />Draw</label
        >
      </fieldset>{/if}
    <div class="icon-picker">
      {#each ['note', 'draw', 'bulb', 'folder', 'tasks', 'home', 'finance'] as icon}<button
          type="button"
          class:active={formIcon === icon}
          aria-label={icon}
          aria-pressed={formIcon === icon}
          onclick={() => (formIcon = icon)}><Icon name={icon} /></button
        >{/each}
    </div>
    <label
      >{t('Name', 'Nama')}<input
        bind:this={nameInput}
        value={formName}
        oninput={(e) => capitalise(e, 'name')}
        oncompositionend={(e) => capitalise(e, 'name')}
        required
        maxlength="150"
      /></label
    ><label
      >{t('Category', 'Kategori')}<input
        value={formCategory}
        oninput={(e) => capitalise(e, 'category')}
        oncompositionend={(e) => capitalise(e, 'category')}
        list="categories"
        required
        maxlength="60"
      /></label
    ><datalist id="categories"
      >{#each categories as c}<option value={c}></option>{/each}</datalist
    >
    <p class="muted">Text</p>
    <footer>
      {#if editing}<button type="button" class="danger" onclick={removeNote}
          >{t('Delete', 'Hapus')}</button
        >{/if}<button type="button" onclick={() => dialog.close()}
        >{t('Cancel', 'Batal')}</button
      ><button class="primary" type="submit"
        >{editing ? t('Update', 'Perbarui') : t('Create', 'Buat')}</button
      >
    </footer>
  </form>
</dialog>
<dialog bind:this={settings}>
  <div class="dialog-heading">
    <h2>{t('Your workspace', 'Workspace kamu')}</h2>
    <button aria-label="Close settings" onclick={() => settings.close()}
      >×</button
    >
  </div>
  <p>
    {account
      ? t(
          'Account data is saved to the server. This browser keeps a separate read-only offline cache, cleared on logout.',
          'Data akun disimpan di server. Browser menyimpan cache offline terpisah yang hanya dapat dibaca dan dihapus saat keluar.',
        )
      : t(
          'Guest data stays in this browser. Clearing site data or using a different browser can make it unavailable. Export a backup regularly.',
          'Data tamu tersimpan di browser ini. Penghapusan data situs atau browser berbeda dapat membuatnya tidak tersedia. Unduh cadangan secara berkala.',
        )}
  </p>
  <label
    >Language / Bahasa<select
      value={prefs.language}
      onchange={(e) => setLanguage(e.currentTarget.value)}
      ><option value="en">English</option><option value="id"
        >Bahasa Indonesia</option
      ></select
    ></label
  >
  <div class="settings-actions">
    <button onclick={download}>{t('Download backup', 'Unduh cadangan')}</button
    ><label class="file-button"
      >{t('Import backup', 'Impor cadangan')}<input
        type="file"
        accept=".json,application/json"
        onchange={inspectFile}
      /></label
    ><button
      onclick={async () => {
        const granted = await navigator.storage?.persist?.();
        notice = granted
          ? t(
              'Persistent storage granted. Backups are still recommended.',
              'Penyimpanan persisten diberikan. Cadangan tetap disarankan.',
            )
          : t(
              'Persistent storage not granted. Keep a backup.',
              'Penyimpanan persisten tidak diberikan. Simpan cadangan.',
            );
      }}>{t('Protect local storage', 'Lindungi penyimpanan lokal')}</button
    >
  </div>
  {#if backup}<div class="import-review">
      <p>
        {t(
          `Import ${backup.notes.length} notes, ${backup.tasks?.length || 0} tasks and ${backup.transactions?.length || 0} transactions as new copies, plus ${backup.planning?.items.length || 0} budgets? Existing budgets and opening balances are preserved.`,
          `Impor ${backup.notes.length} catatan, ${backup.tasks?.length || 0} tugas dan ${backup.transactions?.length || 0} transaksi sebagai salinan baru, serta ${backup.planning?.items.length || 0} anggaran? Anggaran dan saldo awal yang sudah ada tetap dipertahankan.`,
        )}
      </p>
      <button class="primary" disabled={!writable} onclick={restore}
        >{t('Import copies', 'Impor salinan')}</button
      ><button onclick={() => (backup = null)}>{t('Cancel', 'Batal')}</button>
    </div>{/if}
  <p class="muted">
    {online
      ? t('Online', 'Online')
      : account
        ? t(
            'Offline — account notes are read only',
            'Offline — catatan akun hanya dapat dibaca',
          )
        : t(
            'Offline — local notes remain editable',
            'Offline — catatan lokal tetap dapat diedit',
          )}
  </p>
  <p class="muted">
    {t('Workspace load', 'Waktu buka workspace')}: {measure} · {notes.length} notes
  </p>
</dialog>

<dialog bind:this={welcome} oncancel={(e) => e.preventDefault()}>
  <div class="dialog-heading">
    <h2>{t('Your space, in this browser', 'Ruangmu, di browser ini')}</h2>
  </div>
  <label
    >Language / Bahasa<select
      value={prefs.language}
      onchange={(e) => setLanguage(e.currentTarget.value)}
      ><option value="en">English</option><option value="id"
        >Bahasa Indonesia</option
      ></select
    ></label
  >
  <p>
    {t(
      'You are using Zivizip as a guest. Your notes and workspace stay in this browser on this device and are not uploaded to our server.',
      'Kamu menggunakan Zivizip sebagai tamu. Catatan dan workspace tersimpan di browser pada perangkat ini, dan tidak diunggah ke server kami.',
    )}
  </p>
  <p>
    {t(
      'They will not appear automatically on another browser or device. Clearing site data or using private browsing can remove them. Download a backup regularly.',
      'Data tidak otomatis tersedia di browser atau perangkat lain. Menghapus data situs atau memakai mode privat dapat menghilangkannya. Unduh cadangan secara berkala.',
    )}
  </p>
  <p class="muted">
    {t(
      'If you send the account-interest form, only the email and message you submit are sent to Zivizip.',
      'Jika mengirim formulir minat akun, hanya email dan pesan yang kamu isi yang dikirim ke Zivizip.',
    )}
  </p>
  <button
    class="primary"
    onclick={async () => {
      await guestDb.meta.put({ key: 'guest-notice', value: true });
      welcome.close();
    }}>{t('Continue as guest', 'Lanjut sebagai tamu')}</button
  >
</dialog>
<dialog
  bind:this={migration}
  oncancel={(e) => {
    if (switching) e.preventDefault();
  }}
>
  <h2>{t('Choose your workspace', 'Pilih workspace kamu')}</h2>
  <p>
    {t(
      `You have ${guestCount} local notes, tasks, transactions and plan months. Open your account workspace, or copy this data to your account. Nothing is uploaded without your choice.`,
      `Ada ${guestCount} catatan, tugas, transaksi dan bulan rencana lokal. Buka workspace akun, atau salin data ini ke akunmu. Tidak ada data yang diunggah tanpa pilihanmu.`,
    )}
  </p>
  <button disabled={switching} onclick={() => migration.close()}
    >{t('Open account workspace', 'Buka workspace akun')}</button
  ><button class="primary" disabled={switching} onclick={copyGuest}
    >{switching
      ? t('Copying…', 'Menyalin…')
      : t(
          'Copy local workspace to account',
          'Salin workspace lokal ke akun',
        )}</button
  >
</dialog>

<AccountDialog
  bind:this={accountDialog}
  language={prefs.language}
  {online}
  onlogin={signedIn}
/>
