-- ============================================================
-- Gastos mensais de anúncio (Google + Meta), digitados à mão.
-- Usado na aba "Resultados" pra calcular o custo por lead.
-- Rode uma vez no SQL Editor do Supabase (projeto crm-qualificador-caio).
-- ============================================================

create table if not exists public.gastos_mensais (
  mes           text primary key,                 -- 'AAAA-MM' (ex: '2026-11')
  google        numeric not null default 0,       -- gasto no Google Ads no mês
  meta          numeric not null default 0,       -- gasto no Meta Ads no mês
  atualizado_em timestamptz not null default now()
);

-- Mesma blindagem da tabela leads: só autenticado lê/grava.
alter table public.gastos_mensais enable row level security;

drop policy if exists gastos_authenticated_all on public.gastos_mensais;
create policy gastos_authenticated_all
  on public.gastos_mensais
  for all
  to authenticated
  using (true)
  with check (true);
