<script lang="ts">
  import FinancialPlanner from './FinancialPlanner.svelte';
  import FinancePanel from './FinancePanel.svelte';
  import type { FinanceRepository, Transaction } from './finance';
  import type { PlanningRepository } from './planning';
  export let repository: FinanceRepository;
  export let planning: PlanningRepository;
  export let writable: boolean;
  export let language: 'en' | 'id';
  export let refreshToken = 0;
  export let onfinancebusy: (value: boolean) => void = () => {};
  export let onplanbusy: (value: boolean) => void = () => {};
  let ledger: FinancePanel;
  let transactions: Transaction[] = [],
    categories: string[] = [],
    month = '';
</script>

<div class="finance-detail">
  <FinancialPlanner
    repository={planning}
    {transactions}
    {writable}
    {language}
    {refreshToken}
    onbusy={onplanbusy}
    oncategories={(values) => (categories = values)}
    onmonth={(value) => {
      month = value;
      ledger?.selectMonth(value);
    }}
    ontransaction={(item, defaults) => ledger.openTransaction(item, defaults)}
  />
  <aside
    aria-label={language === 'en'
      ? 'Recorded transactions'
      : 'Transaksi tercatat'}
  >
    <FinancePanel
      bind:this={ledger}
      {repository}
      {writable}
      {language}
      {refreshToken}
      onbusy={onfinancebusy}
      ondata={(items) => (transactions = items)}
      categoryOptions={categories}
      selectedMonth={month}
    />
  </aside>
</div>

<style>
  .finance-detail {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(300px, 1fr);
    height: 100%;
    min-width: 0;
    overflow: hidden;
  }
  aside {
    min-width: 0;
    min-height: 0;
    border-left: 1px solid var(--line);
  }
  @media (max-width: 900px) {
    .finance-detail {
      display: block;
      overflow-y: auto;
    }
    aside {
      height: 560px;
      border-left: 0;
      border-top: 1px solid var(--line);
    }
  }
</style>
