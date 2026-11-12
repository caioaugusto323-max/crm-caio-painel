-- ============================================================
-- SETUP SEGURO — cliente novo (white label), tudo de uma vez.
-- Cole ESTE arquivo inteiro no SQL Editor de um projeto Supabase NOVO
-- e clique Run uma única vez. Monta tabelas + segurança + blindagem.
--
-- É idempotente (dá pra rodar de novo sem quebrar). Substitui ter que rodar
-- 00-schema, add-reguas, add-gastos e rls separados.
--
-- ⚠️ ATENÇÃO num projeto que JÁ TEM painel no ar (ex: o do Caio):
--    a SEÇÃO 5 (bucket privado) quebra os links de comprovante do painel
--    ANTIGO. Só rode a Seção 5 DEPOIS de publicar a versão nova do painel
--    (a que gera link assinado). Num cliente novo, pode rodar tudo junto.
-- ============================================================


-- ============================================================
-- SEÇÃO 1 — Tabela principal: leads
-- ============================================================
create table if not exists public.leads (
  id         uuid primary key default gen_random_uuid(),
  criado_em  timestamptz not null default now(),
  estagio    text not null default 'novo'
);

alter table public.leads add column if not exists nome                text;
alter table public.leads add column if not exists nome_completo       text;
alter table public.leads add column if not exists telefone            text;
alter table public.leads add column if not exists email               text;
alter table public.leads add column if not exists cpf                 text;
alter table public.leads add column if not exists preferencia_contato text;
alter table public.leads add column if not exists origem              text;
alter table public.leads add column if not exists assunto             text;
alter table public.leads add column if not exists respostas           jsonb;
alter table public.leads add column if not exists descricao_caso      text;
alter table public.leads add column if not exists frase               text;
alter table public.leads add column if not exists tipo_procedimento   text;
alter table public.leads add column if not exists acordo              text;
alter table public.leads add column if not exists filhos_menores      boolean;
alter table public.leads add column if not exists gravidez            boolean;
alter table public.leads add column if not exists data_retorno        date;
alter table public.leads add column if not exists data_consulta       timestamptz;
alter table public.leads add column if not exists horario_sugerido    text;
alter table public.leads add column if not exists comprovante_url     text;

create index if not exists leads_estagio_idx   on public.leads (estagio);
create index if not exists leads_criado_em_idx on public.leads (criado_em desc);


-- ============================================================
-- SEÇÃO 2 — Réguas do bot e gastos mensais
-- ============================================================
create table if not exists public.reguas (
  id            uuid primary key default gen_random_uuid(),
  assunto       text not null,
  ordem         int  not null default 0,
  pergunta      text not null,
  opcoes        text,
  tipo          text not null default 'triagem',   -- 'triagem' | 'descricao'
  ativo         boolean not null default true,
  atualizado_em timestamptz not null default now()
);
alter table public.reguas add column if not exists tipo text not null default 'triagem';
create index if not exists reguas_assunto_ordem on public.reguas (assunto, ordem);

create table if not exists public.gastos_mensais (
  mes           text primary key,
  google        numeric not null default 0,
  meta          numeric not null default 0,
  atualizado_em timestamptz not null default now()
);


-- ============================================================
-- SEÇÃO 3 — Trava de segurança (RLS): só usuário logado acessa.
-- Sem política pro papel `anon` → quem não loga não vê nada.
-- ============================================================
alter table public.leads          enable row level security;
alter table public.reguas         enable row level security;
alter table public.gastos_mensais enable row level security;

drop policy if exists leads_authenticated_all on public.leads;
create policy leads_authenticated_all on public.leads
  for all to authenticated using (true) with check (true);

drop policy if exists reguas_authenticated_all on public.reguas;
create policy reguas_authenticated_all on public.reguas
  for all to authenticated using (true) with check (true);

drop policy if exists gastos_authenticated_all on public.gastos_mensais;
create policy gastos_authenticated_all on public.gastos_mensais
  for all to authenticated using (true) with check (true);

-- Blindagem extra: tira qualquer acesso do papel anônimo nessas tabelas.
revoke all on table public.leads          from anon;
revoke all on table public.reguas         from anon;
revoke all on table public.gastos_mensais from anon;


-- ============================================================
-- SEÇÃO 4 — Auto-RLS: toda tabela NOVA no schema public já nasce
-- com RLS ligado (e sem política = negado), pra nunca ficar exposta
-- por esquecimento. Secure by default.
-- ============================================================
create or replace function public.force_rls_on_new_tables()
returns event_trigger language plpgsql as $$
declare r record;
begin
  for r in
    select * from pg_event_trigger_ddl_commands()
    where command_tag = 'CREATE TABLE' and schema_name = 'public'
  loop
    execute format('alter table %s enable row level security', r.object_identity);
  end loop;
end $$;

drop event trigger if exists trg_force_rls;
create event trigger trg_force_rls
  on ddl_command_end when tag in ('CREATE TABLE')
  execute function public.force_rls_on_new_tables();


-- ============================================================
-- SEÇÃO 5 — Bucket de comprovantes PRIVADO (dados sensíveis).
-- ⚠️ Ver aviso no topo: num projeto com painel antigo no ar, rode
--    esta seção só DEPOIS de publicar o painel novo (link assinado).
-- ============================================================
insert into storage.buckets (id, name, public)
values ('comprovantes', 'comprovantes', false)
on conflict (id) do update set public = false;

-- Só usuário logado gera link assinado / lê os comprovantes.
drop policy if exists comprovantes_authenticated_read on storage.objects;
create policy comprovantes_authenticated_read on storage.objects
  for select to authenticated using (bucket_id = 'comprovantes');

-- (O bot/n8n faz upload com a service_role, que ignora RLS — segue funcionando.)


-- ============================================================
-- DEPOIS DE RODAR ESTE SQL, faltam só os passos que NÃO são SQL
-- (ver SEGURANCA.md): desligar cadastro público, criar o login do
-- cliente, e apontar o config.js. Esses três a gente pode automatizar
-- com a Management API — ver a seção "Automação total" do SEGURANCA.md.
-- ============================================================
