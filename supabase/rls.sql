-- Segurança da tabela `leads` (LGPD — dados de leads jurídicos).
-- Rodar no SQL Editor do projeto crm-qualificador-caio.
--
-- Com RLS ligado e esta política, SÓ usuários autenticados (o Caio, logado no
-- painel) conseguem ler/gravar. A publishable key sozinha (sem login) cai no
-- papel `anon`, que não tem nenhuma política → acesso negado.

alter table leads enable row level security;

drop policy if exists "leads_authenticated_all" on leads;
create policy "leads_authenticated_all"
  on leads
  for all
  to authenticated
  using (true)
  with check (true);

-- Observação: o n8n grava os leads usando a SECRET key (service_role), que
-- ignora RLS por natureza — então o bot continua inserindo normalmente.
