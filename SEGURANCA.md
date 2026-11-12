# Segurança do CRM — registro oficial (white label)

Este arquivo é a **fonte da verdade** sobre o que mantém os dados dos clientes
seguros. Tudo que é preciso configurar está aqui, dividido entre o que já **roda
sozinho** (um SQL) e os poucos passos que ainda são de painel — e como automatizar
até esses.

> Referência: o projeto do Caio (`crm-qualificador-caio`) foi auditado ao vivo em
> 2026-11-12 e serve de molde do que "seguro" significa aqui.

---

## 1. O que protege os dados (em uma frase cada)

| Camada | O que faz | Onde se configura |
|--------|-----------|-------------------|
| **RLS (Row Level Security)** | Cada tabela só responde pra quem está logado. Sem login, não vê nada. | `setup-seguro.sql` (automático) |
| **Cadastro público desligado** | Ninguém cria login sozinho — só quem você cadastra à mão. | Painel Supabase (ou Management API) |
| **Login anônimo desligado** | Não existe "entrar sem conta". | Painel Supabase |
| **Confirmação de e-mail** | O login só vale depois de confirmar o e-mail. | Painel Supabase |
| **Bucket de comprovantes privado** | Comprovante de pagamento não abre sem link assinado temporário. | `setup-seguro.sql` + painel novo |
| **Auto-RLS** | Qualquer tabela nova já nasce trancada. | `setup-seguro.sql` (automático) |
| **Blindagem no código** | Escape de HTML, bloqueio de `javascript:`, link assinado do comprovante. | `app.js` (já no repositório) |
| **Biblioteca local** | O painel não puxa código de servidor de terceiros. | `vendor/` (já no repositório) |

---

## 2. Estado do projeto do Caio (molde)

Confirmado ao vivo em 2026-11-12:

- ✅ RLS ligado em `leads`, `reguas`, `gastos_mensais` (só `authenticated`)
- ✅ Cadastro público **desligado**
- ✅ Login anônimo **desligado**
- ✅ Confirmação de e-mail **ligada**
- ⚠️ **Bucket `comprovantes` está PÚBLICO** → pendência a corrigir (ver seção 5)
- ⚪ "Prevent use of leaked passwords" desligado (opcional; depende de plano pago)
- ⚪ Captcha no login desligado (opcional; baixa prioridade com cadastro fechado)

---

## 3. Checklist por cliente novo

### 3a. Roda sozinho (1 SQL)
Colar `supabase/setup-seguro.sql` inteiro no SQL Editor e dar Run. Isso entrega:
- [x] Todas as tabelas
- [x] RLS + políticas (só logado)
- [x] Blindagem do papel anônimo
- [x] Auto-RLS pra tabelas futuras
- [x] Bucket de comprovantes **privado** + política de leitura

### 3b. Fora do SQL (3 passos de painel — por enquanto)
São configurações de conta, não de banco; o SQL não alcança:
- [ ] **Desligar cadastro público**: Authentication → Sign In / Providers → "Allow new users to sign up" = OFF
- [ ] **Criar o login do cliente**: Authentication → Users → Add user
- [ ] **Apontar o `config.js`** do painel pro URL + anon key daquele cliente

> Esses três podem ser **automatizados** — ver seção 6.

---

## 4. Regras operacionais (inegociáveis)

- **A `service_role` / secret key NUNCA** entra no painel, no `config.js` ou no repositório.
  Ela só vive no n8n (o bot), nos bastidores. É a chave-mestra: quem tem ela ignora toda a segurança.
- No painel vai **só** a `anon` / publishable key — ela é pública por natureza e, sozinha (sem login), não acessa nada.
- **Um projeto Supabase por cliente.** Nunca misturar clientes no mesmo projeto (evita vazamento cruzado).
- Comprovantes (e qualquer arquivo sensível) **sempre em bucket privado**.

---

## 5. Pendência específica do Caio (ordem importa, pra não quebrar)

O bucket dele está público. A correção quebra o painel antigo se feita fora de ordem:

1. **Publicar o painel novo** (esta versão do repositório — já gera link assinado).
2. **Conferir** que "ver comprovante" abre normalmente no painel publicado.
3. **Rodar a Seção 5** do `setup-seguro.sql` no projeto do Caio (torna o bucket privado).
4. Conferir de novo que "ver comprovante" ainda abre (agora via link assinado).

Enquanto o passo 1 não acontecer, **não** torne o bucket privado.

---

## 6. Automação total — o atalho (JÁ MONTADO)

Os passos todos (criar projeto → rodar `setup-seguro.sql` → desligar cadastro e
anônimo → criar o login → gerar o `config.<nome>.js`) viraram **um comando**:
`supabase/provisionar-cliente.mjs`.

**Estratégia de conta:** uma **conta Supabase separada por cliente**. Como cada
conta tem seu próprio plano grátis (até 2 projetos), 1 projeto por conta = **R$ 0
de hospedagem por cliente**. O custo é só gerenciar um login Supabase por cliente.

**Como rodar (por cliente):**
1. Entrar na conta Supabase **daquele cliente**.
2. Gerar um token: Account → Access Tokens → *Generate new token* (aparece uma vez — guarde).
3. Preencher os dados: copiar `supabase/cliente.exemplo.json` → `supabase/cliente.json`
   (nome do projeto, e-mail e senha de acesso do cliente). *Esse arquivo é gitignored.*
4. Informar o token e rodar:
   - Windows PowerShell:
     ```
     $env:SUPABASE_ACCESS_TOKEN="sbp_xxx"
     node supabase/provisionar-cliente.mjs supabase/cliente.json
     ```
5. No fim, o atalho mostra a URL, o login criado, a **senha do banco** e a
   **service_role** (guarde essas duas num lugar seguro) e grava `config.<nome>.js`.
6. No deploy do painel daquele cliente, renomeie `config.<nome>.js` para `config.js`.

> Segredos: `supabase/cliente.json`, `config.<nome>.js` e `.env` são **gitignored**
> (nunca vão pro repositório). A **service_role** só entra no n8n daquele cliente,
> nunca no painel.
>
> Status: **montado, falta o 1º teste real** — validamos juntas quando você criar
> o primeiro cliente de verdade (cria um projeto Supabase real, mas no plano grátis,
> sem custo).

---

## 7. Histórico de revisões de segurança

- **2026-11-12** — Auditoria inicial + correções: schema versionado, bug do seed
  (`tipo`), bloqueio de `javascript:` no comprovante, biblioteca Supabase local,
  link assinado do comprovante. Auditoria ao vivo do projeto do Caio (RLS,
  cadastro, bucket). Criado este registro + `setup-seguro.sql`.
