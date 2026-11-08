-- ============================================================
-- Réguas do bot: as perguntas de triagem de cada assunto.
-- A aba "Réguas" do painel edita aqui; o bot (Bloco B / n8n) vai LER daqui.
-- Rode uma vez no SQL Editor do Supabase (projeto crm-qualificador-caio).
-- ============================================================

create table if not exists public.reguas (
  id            uuid primary key default gen_random_uuid(),
  assunto       text not null,        -- divorcio | guarda | pensao | inventario | imovel | outros
  ordem         int  not null default 0,
  pergunta      text not null,
  opcoes        text,                 -- opções de resposta (uma por linha); nulo = pergunta aberta
  ativo         boolean not null default true,
  atualizado_em timestamptz not null default now()
);

create index if not exists reguas_assunto_ordem on public.reguas (assunto, ordem);

-- Mesma blindagem das outras tabelas: só autenticado lê/grava.
alter table public.reguas enable row level security;

drop policy if exists reguas_authenticated_all on public.reguas;
create policy reguas_authenticated_all
  on public.reguas
  for all
  to authenticated
  using (true)
  with check (true);
