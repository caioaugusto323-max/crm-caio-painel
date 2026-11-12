-- ============================================================
-- SCHEMA BASE — tabela `leads` (fundação do painel).
-- Rode ESTE PRIMEIRO no SQL Editor de uma instância nova, antes dos
-- demais arquivos (add-*.sql e rls.sql).
--
-- Idempotente: `create table if not exists` + `add column if not exists`.
-- Rodar numa base que já tem a tabela NÃO altera nada do que já existe
-- (colunas existentes mantêm o tipo atual) — é seguro reexecutar.
--
-- ATENÇÃO (white label): os TIPOS abaixo foram reconstruídos a partir de
-- como o painel usa cada coluna (app.js), não dumpados da base do Caio.
-- Numa instância nova eles funcionam. Se for comparar com a base original,
-- confira os tipos no Supabase (Table editor) antes de assumir paridade.
-- ============================================================

create table if not exists public.leads (
  id         uuid primary key default gen_random_uuid(),
  criado_em  timestamptz not null default now(),
  estagio    text not null default 'novo'   -- ver STAGES em app.js
);

-- --- Identificação / contato ---
alter table public.leads add column if not exists nome                text;
alter table public.leads add column if not exists nome_completo       text;
alter table public.leads add column if not exists telefone            text;
alter table public.leads add column if not exists email               text;
alter table public.leads add column if not exists cpf                 text;
alter table public.leads add column if not exists preferencia_contato text;  -- whatsapp | telefone | video
alter table public.leads add column if not exists origem              text;  -- instagram | indicacao | google | outro

-- --- Triagem / caso ---
alter table public.leads add column if not exists assunto          text;   -- divorcio | guarda | pensao | inventario | imovel | outros
alter table public.leads add column if not exists respostas        jsonb;  -- [{label, valor}, ...] na ordem da régua
alter table public.leads add column if not exists descricao_caso   text;   -- resposta da pergunta tipo 'descricao'
alter table public.leads add column if not exists frase            text;
alter table public.leads add column if not exists tipo_procedimento text;  -- extrajudicial | judicial_consensual | judicial_litigioso
alter table public.leads add column if not exists acordo           text;
alter table public.leads add column if not exists filhos_menores   boolean;
alter table public.leads add column if not exists gravidez         boolean;

-- --- Agenda / pagamento ---
alter table public.leads add column if not exists data_retorno     date;
alter table public.leads add column if not exists data_consulta    timestamptz;
alter table public.leads add column if not exists horario_sugerido text;
alter table public.leads add column if not exists comprovante_url  text;

create index if not exists leads_estagio_idx   on public.leads (estagio);
create index if not exists leads_criado_em_idx on public.leads (criado_em desc);

-- Em seguida rode: add-reguas.sql, add-gastos-mensais.sql e rls.sql.
-- (add-assunto-respostas.sql fica redundante numa instância nova — este
--  arquivo já cria `assunto` e `respostas`.)
