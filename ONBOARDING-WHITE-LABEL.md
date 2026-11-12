# Receita de onboarding — um cliente novo (white label)

Cada cliente ganha o **próprio projeto Supabase** (o "arquivo de aço" dele, separado
dos outros). Isto aqui é a sequência que se repete, igual, pra cada venda.
Dá pra fazer em ~20 min. Não precisa saber programar — é seguir na ordem.

> Legenda: 🖱️ = clicar numa tela · ⌨️ = colar um texto · ⚠️ = o passo de segurança que **não pode** ser pulado.

---

## 1. Criar o arquivo de aço do cliente

1. 🖱️ Entrar em https://supabase.com e logar.
2. 🖱️ **New project**. Dar um nome que você reconheça depois, ex: `crm-NOMEDOCLIENTE`.
3. ⌨️ Definir uma **senha do banco** forte e **guardar num lugar seguro** (ex: gerenciador de senhas).
4. 🖱️ Escolher a região **South America (São Paulo)** — fica mais rápido e é melhor pra LGPD.
5. 🖱️ **Create**. Esperar uns 2 min até o projeto ficar pronto.

---

## 2. Montar as tabelas (rodar os SQL na ordem)

No projeto novo: 🖱️ menu lateral → **SQL Editor** → **New query**. Pra cada arquivo
abaixo, ⌨️ cole o conteúdo e 🖱️ clique **Run**. **Siga esta ordem:**

1. `supabase/00-schema.sql`  ← a tabela principal de leads (rode **primeiro**)
2. `supabase/add-reguas.sql`  ← as perguntas do bot
3. `supabase/add-gastos-mensais.sql`  ← os gastos de anúncio
4. `supabase/rls.sql`  ← **a trava de segurança** (liga o cadeado das tabelas)

> Não precisa rodar o `add-assunto-respostas.sql` num projeto novo — o `00-schema.sql`
> já cria essas colunas. Ele só existe pra bases antigas.

Se algum **Run** der erro, pare e me chame com o texto do erro — não siga adiante.

---

## 3. ⚠️ Trancar a porta (desligar o cadastro público) — NÃO PULE

Por padrão o Supabase deixa **qualquer estranho criar um login sozinho** e, com ele,
ver todos os leads. Isso precisa ser desligado em todo cliente novo:

1. 🖱️ Menu lateral → **Authentication** → **Sign In / Providers** (ou **Settings**).
2. 🖱️ Achar a opção **"Allow new users to sign up"** (permitir novos cadastros) e **DESLIGAR**.
3. 🖱️ Salvar.

A partir daqui, **só quem você cadastrar à mão** consegue entrar no painel.

---

## 4. Criar o login do cliente (à mão)

1. 🖱️ Menu lateral → **Authentication** → **Users** → **Add user**.
2. ⌨️ E-mail e senha do cliente. 🖱️ Criar.
3. Entregar esse e-mail/senha pro cliente (de forma segura) — é com isso que ele entra no painel.

---

## 5. Pegar o endereço e a chave do arquivo de aço

1. 🖱️ Menu lateral → **Project Settings** → **API**.
2. Anotar dois valores:
   - **Project URL** (algo como `https://xxxx.supabase.co`)
   - **anon / publishable key** (a chave **pública** — pode ir no navegador, é feita pra isso)
3. ⚠️ A outra chave, a **service_role / secret**, é a chave-mestra: **nunca** vai no painel
   nem no navegador. Só o bot (n8n) usa, nos bastidores.

---

## 6. Apontar o painel pro cliente

No painel daquele cliente, editar o arquivo `config.js` com os dois valores do passo 5:

```js
window.CRM_CONFIG = {
  url: "https://xxxx.supabase.co",         // Project URL do cliente
  anonKey: "sb_publishable_xxxxxxxxxxxxx"   // a anon/publishable key do cliente
};
```

Cada cliente tem o **seu** `config.js` apontando pro **seu** arquivo de aço. É isso que
mantém os dados de um invisíveis pro outro.

---

## 7. Conferir que está tudo certo (teste rápido)

1. Abrir o painel e **entrar** com o login criado no passo 4. ✅ deve entrar.
2. Na aba **Réguas**, clicar **"Carregar réguas padrão"**. ✅ devem aparecer as 6 réguas.
3. Tentar abrir o painel **sem logar** (janela anônima). ✅ não pode mostrar nenhum lead.

Passou nos três? O cliente está no ar, isolado e trancado.

---

## Checklist rápida (pra colar na parede)

- [ ] Projeto Supabase novo criado (região São Paulo)
- [ ] 4 SQL rodados na ordem (00-schema → add-reguas → add-gastos → rls)
- [ ] ⚠️ Cadastro público DESLIGADO
- [ ] Login do cliente criado à mão
- [ ] `config.js` do painel apontando pro URL + anon key do cliente
- [ ] Teste: entra logado / não entra deslogado / réguas carregam
