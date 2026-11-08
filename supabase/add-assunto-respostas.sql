-- Enriquecimento do lead: guardar o assunto e TODAS as respostas da régua.
-- `assunto`   = qual das 6 réguas (divorcio/guarda/pensao/inventario/imovel/outros).
-- `respostas` = array de {label, valor} com as perguntas→respostas daquela régua,
--               na ordem em que foram feitas. O bot (n8n) preenche passo a passo.
-- Rodar no SQL Editor do projeto crm-qualificador-caio.

alter table leads add column if not exists assunto text;
alter table leads add column if not exists respostas jsonb;
