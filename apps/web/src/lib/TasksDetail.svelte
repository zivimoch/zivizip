<script lang="ts">
  import { onMount } from 'svelte';
  import TasksPanel from './TasksPanel.svelte';
  import { type Task, type TasksRepository } from './tasks';
  import { taskAnalysis } from './task-analysis';
  export let repository: TasksRepository;
  export let writable: boolean;
  export let language: 'en' | 'id';
  export let refreshToken = 0;
  export let onbusy: (value: boolean) => void = () => {};
  let items: Task[] = [];
  let pendingBusy = false,
    completedBusy = false;
  let now = new Date();
  $: onbusy(pendingBusy || completedBusy);
  $: t =
    language === 'en'
      ? (en: string, _id: string) => en
      : (_en: string, id: string) => id;
  $: analysis = taskAnalysis(items, now);
  $: buckets = [
    {
      key: 'overdue',
      label: t('Overdue', 'Terlambat'),
      count: analysis.deadlines.overdue,
    },
    {
      key: 'today',
      label: t('Today', 'Hari ini'),
      count: analysis.deadlines.today,
    },
    {
      key: 'week',
      label: t('Next 7 days', '7 hari ke depan'),
      count: analysis.deadlines.week,
    },
    {
      key: 'later',
      label: t('Later', 'Berikutnya'),
      count: analysis.deadlines.later,
    },
    {
      key: 'undated',
      label: t('No date', 'Tanpa tanggal'),
      count: analysis.deadlines.undated,
    },
  ];
  $: maximum = Math.max(1, ...buckets.map((bucket) => bucket.count));
  onMount(() => {
    const timer = setInterval(() => (now = new Date()), 60000);
    return () => clearInterval(timer);
  });
</script>

<section
  class="tasks-detail"
  aria-label={t('To do overview', 'Ringkasan To do')}
>
  <header>
    <div>
      <p class="eyebrow">{t('YOUR MOMENTUM', 'PROGRESMU')}</p>
      <h1>To do<span>.</span></h1>
    </div>
    <p>
      {t(
        'A clear view of what is done and what comes next.',
        'Lihat yang sudah selesai dan yang perlu dikerjakan berikutnya.',
      )}
    </p>
  </header>
  <div class="analysis">
    <section
      class="progress-card"
      aria-label={t('Overall progress', 'Progres keseluruhan')}
    >
      <div
        class="ring"
        style={`--progress:${analysis.percent}%`}
        role="img"
        aria-label={`${analysis.percent}% ${t('completed', 'selesai')}`}
      >
        <div>
          <strong>{analysis.percent}<small>%</small></strong><span
            >{t('Completed', 'Selesai')}</span
          >
        </div>
      </div>
      <div class="progress-copy">
        <h2>{t('Every task counts', 'Setiap tugas berarti')}</h2>
        <p>
          {t(
            'All tasks, including archived completions.',
            'Semua tugas, termasuk yang selesai dan diarsipkan.',
          )}
        </p>
        <dl>
          <div>
            <dt>{t('Total', 'Total')}</dt>
            <dd data-stat="total">{analysis.total}</dd>
          </div>
          <div>
            <dt>{t('Not completed', 'Belum selesai')}</dt>
            <dd data-stat="pending">{analysis.pending}</dd>
          </div>
          <div>
            <dt>{t('Completed', 'Selesai')}</dt>
            <dd data-stat="completed">{analysis.completed}</dd>
          </div>
        </dl>
      </div>
    </section>
    <section
      class="deadline-card"
      aria-label={t('Upcoming workload', 'Beban tugas mendatang')}
    >
      <h2>{t('What needs your attention', 'Yang perlu perhatianmu')}</h2>
      <p>
        {t(
          'Unfinished tasks by due date',
          'Tugas belum selesai berdasarkan tenggat',
        )}
      </p>
      <div class="bars">
        {#each buckets as bucket}<div class="bar-row" data-bucket={bucket.key}>
            <span>{bucket.label}</span>
            <div class="track">
              <i
                class:overdue={bucket.key === 'overdue'}
                style:width={`${(bucket.count / maximum) * 100}%`}
              ></i>
            </div>
            <strong>{bucket.count}</strong>
          </div>{/each}
      </div>
    </section>
  </div>
  <div class="task-cards">
    <div class="task-card" data-task-card="pending">
      <TasksPanel
        {repository}
        {writable}
        {language}
        {refreshToken}
        mode="pending"
        ondata={(value) => (items = value)}
        onbusy={(value) => (pendingBusy = value)}
      />
    </div>
    <div class="task-card" data-task-card="completed">
      <TasksPanel
        {repository}
        {writable}
        {language}
        {refreshToken}
        mode="completed"
        onbusy={(value) => (completedBusy = value)}
      />
    </div>
  </div>
</section>

<style>
  .tasks-detail {
    height: 100%;
    overflow: auto;
    padding: 28px;
    min-width: 0;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 20px;
    margin-bottom: 24px;
  }
  h1 {
    font-size: 30px;
    margin: 0;
  }
  h1 span {
    color: var(--accent);
  }
  .eyebrow {
    font-size: 10px;
    letter-spacing: 0.16em;
    margin: 0 0 8px;
    color: var(--accent);
  }
  header > p {
    font-size: 13px;
    margin: 0 0 5px;
    max-width: 340px;
    line-height: 1.5;
  }
  .analysis,
  .task-cards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }
  .analysis {
    margin-bottom: 20px;
  }
  .progress-card,
  .deadline-card,
  .task-card {
    border: 1px solid var(--line);
    border-radius: 12px;
    background: #111c21;
    min-width: 0;
  }
  .progress-card {
    display: flex;
    align-items: center;
    gap: 26px;
    padding: 26px;
  }
  .ring {
    width: 142px;
    height: 142px;
    flex-shrink: 0;
    border-radius: 50%;
    background: conic-gradient(var(--accent) var(--progress), #27363d 0);
    padding: 9px;
  }
  .ring > div {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: #111c21;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 5px;
  }
  .ring strong {
    font-size: 34px;
    line-height: 1;
  }
  .ring small {
    font-size: 16px;
  }
  .ring span {
    font-size: 11px;
  }
  h2 {
    font-size: 17px;
    margin: 0 0 8px;
  }
  .progress-copy {
    flex: 1;
    min-width: 0;
  }
  .progress-copy p,
  .deadline-card > p {
    font-size: 12px;
    line-height: 1.5;
    margin: 0 0 20px;
  }
  dl {
    display: flex;
    gap: 24px;
    margin: 0;
    flex-wrap: wrap;
  }
  dt {
    font-size: 11px;
  }
  dd {
    font-size: 24px;
    margin: 7px 0 0;
    font-weight: 600;
  }
  .deadline-card {
    padding: 24px;
  }
  .deadline-card > p {
    margin-bottom: 14px;
  }
  .bars {
    display: grid;
    gap: 10px;
  }
  .bar-row {
    display: grid;
    grid-template-columns: 100px 1fr 30px;
    gap: 14px;
    align-items: center;
    font-size: 12px;
  }
  .bar-row strong {
    text-align: right;
  }
  .track {
    background: #27363d;
    height: 7px;
    border-radius: 5px;
    overflow: hidden;
  }
  .track i {
    display: block;
    background: var(--accent);
    height: 100%;
    border-radius: inherit;
  }
  .track i.overdue {
    background: #ff9479;
  }
  .task-card {
    height: clamp(360px, 52vh, 620px);
    overflow: hidden;
  }
  @media (max-width: 1100px) {
    .progress-card {
      gap: 16px;
      padding: 20px;
    }
    .ring {
      width: 110px;
      height: 110px;
    }
    dl {
      gap: 14px;
    }
  }
  @media (max-width: 800px) {
    .tasks-detail {
      padding: 18px 12px;
    }
    header {
      display: block;
    }
    header > p {
      margin-top: 10px;
    }
    .analysis,
    .task-cards {
      grid-template-columns: 1fr;
      gap: 14px;
    }
    .progress-card {
      padding: 20px;
    }
    .task-card {
      height: 440px;
    }
  }
</style>
