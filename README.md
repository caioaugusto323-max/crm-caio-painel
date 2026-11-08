# CRM Caio — Painel de atendimento

Mural (kanban) dos leads que o bot do WhatsApp qualifica e grava no Supabase.
Site estático em JS puro — sem build. Faz parte do projeto **CRM Qualificador do Caio**
(Fase 1, Tarefa 10). Molde técnico do playbook do gerenciador de marca; **nada** da Kabelera.

## Arquitetura

`WhatsApp (uazapi) → n8n → Supabase (tabela leads) → este painel`

- `index.html` — login + quadro kanban + modal de detalhe
- `styles.css` — identidade sóbria do escritório (provisória; ajustar à marca real do Caio)
- `app.js` — Supabase Auth + leitura da tabela `leads` + arrastar card entre estágios
- `config.js` — URL + publishable key (gitignored; copiar de `config.example.js`)
- `supabase/rls.sql` — liga RLS e a política de acesso (só autenticado)

## Rodar local

Precisa servir por HTTP (o Supabase Auth não gosta de `file://`):

```
python -m http.server 5500
# abrir http://localhost:5500
```

## Antes de publicar (checklist de segurança)

1. Rodar `supabase/rls.sql` no SQL Editor (RLS + política).
2. Criar o usuário do Caio em Authentication → Users (e-mail + senha).
3. Publicar (Netlify para repo privado, ou GitHub Pages).

## Estágios (colunas)

novo · qualificado · aguardando_decisao · aguardando_pagamento ·
consulta_paga · consulta_agendada · outros_repasse · cliente_fechado · perdido
