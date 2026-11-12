#!/usr/bin/env node
/* ============================================================
   ATALHO DE PROVISIONAMENTO — cria um cliente novo quase sozinho.

   O que ele faz, de ponta a ponta, num comando:
     1. cria o projeto Supabase (o "arquivo de aço" do cliente)
     2. espera ficar pronto
     3. roda o setup-seguro.sql (tabelas + RLS + blindagem + bucket privado)
     4. DESLIGA o cadastro público e o login anônimo
     5. cria o login do cliente (e-mail + senha), já confirmado
     6. gera o config.<nome>.js pronto (URL + chave pública do cliente)

   PRÉ-REQUISITOS (só na 1ª vez, pra cada conta Supabase do cliente):
     - Entrar na conta Supabase DAQUELE cliente
     - Gerar um Access Token em:  Account → Access Tokens → Generate new token
     - Guardar esse token (ele aparece uma vez só)

   COMO USAR:
     1. Copie  cliente.exemplo.json  para  cliente.json  e preencha.
     2. Informe o token (escolha um):
          Windows PowerShell:  $env:SUPABASE_ACCESS_TOKEN="sbp_xxx"
          Git Bash / Mac:      export SUPABASE_ACCESS_TOKEN=sbp_xxx
     3. Rode:
          node supabase/provisionar-cliente.mjs supabase/cliente.json

   Nada é cobrado: 1 projeto por conta cabe no plano grátis do Supabase.
   ============================================================ */

import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';

const MGMT = 'https://api.supabase.com/v1';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

function die(msg) { console.error('\n❌ ' + msg + '\n'); process.exit(1); }
function ok(msg) { console.log('✅ ' + msg); }
function step(msg) { console.log('\n→ ' + msg); }

// Chamada à Management API do Supabase, com erro legível.
async function mgmt(method, pathname, body) {
  const res = await fetch(MGMT + pathname, {
    method,
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await res.text();
  let data; try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  if (!res.ok) {
    throw new Error(`${method} ${pathname} → ${res.status}: ` +
      (data && data.message ? data.message : txt || res.statusText));
  }
  return data;
}

function senhaForte(n = 24) {
  // base64url sem caracteres problemáticos pra URL/shell
  return randomBytes(n).toString('base64').replace(/[+/=]/g, '').slice(0, n);
}

async function main() {
  if (!TOKEN) die('Falta o token. Defina SUPABASE_ACCESS_TOKEN (ver topo deste arquivo).');

  const cfgPath = process.argv[2] || path.join('supabase', 'cliente.json');
  let cfg;
  try { cfg = JSON.parse(await readFile(cfgPath, 'utf8')); }
  catch { die(`Não consegui ler ${cfgPath}. Copie cliente.exemplo.json para cliente.json e preencha.`); }

  const nome       = (cfg.nome || '').trim();
  const regiao     = (cfg.regiao || 'sa-east-1').trim();   // São Paulo por padrão
  const loginEmail = (cfg.loginEmail || '').trim();
  const loginSenha = (cfg.loginSenha || '').trim();
  if (!nome)       die('No cliente.json: falta "nome" (ex: "crm-escritorio-silva").');
  if (!loginEmail) die('No cliente.json: falta "loginEmail" (o e-mail de acesso do cliente).');
  if (!loginSenha) die('No cliente.json: falta "loginSenha" (a senha de acesso do cliente).');

  // --- organização ---
  step('Descobrindo a organização da conta…');
  const orgs = await mgmt('GET', '/organizations');
  if (!orgs || !orgs.length) die('Nenhuma organização nessa conta Supabase.');
  const orgId = cfg.orgId || orgs[0].id;
  ok(`Organização: ${orgs.find(o => o.id === orgId)?.name || orgId}`);

  // --- criar projeto ---
  step(`Criando o projeto "${nome}" (região ${regiao})…`);
  const dbPass = senhaForte();
  const created = await mgmt('POST', '/projects', {
    name: nome, organization_id: orgId, region: regiao, db_pass: dbPass,
  });
  const ref = created.id || created.ref;
  if (!ref) die('A criação não devolveu o identificador do projeto.');
  ok(`Projeto criado. Identificador: ${ref}`);

  // --- esperar ficar pronto ---
  step('Esperando o projeto ficar pronto (pode levar 1 a 3 min)…');
  for (let i = 0; i < 60; i++) {
    const p = await mgmt('GET', '/projects/' + ref);
    if (p.status === 'ACTIVE_HEALTHY') { ok('Projeto no ar.'); break; }
    process.stdout.write('   …status: ' + p.status + '        \r');
    await sleep(5000);
    if (i === 59) die('Demorou demais pra ficar pronto. Confira no painel do Supabase.');
  }
  // Uma folga pro banco aceitar conexões.
  await sleep(8000);

  // --- rodar o setup-seguro.sql ---
  step('Montando tabelas + segurança (setup-seguro.sql)…');
  const sql = await readFile(path.join('supabase', 'setup-seguro.sql'), 'utf8');
  await mgmt('POST', `/projects/${ref}/database/query`, { query: sql });
  ok('Banco montado com RLS, blindagem, auto-RLS e bucket privado.');

  // --- desligar cadastro público e login anônimo ---
  step('Trancando a autenticação (sem cadastro público, sem anônimo)…');
  await mgmt('PATCH', `/projects/${ref}/config/auth`, {
    disable_signup: true,
    external_anonymous_users_enabled: false,
    mailer_autoconfirm: false, // mantém confirmação de e-mail ligada
  });
  ok('Cadastro público e login anônimo DESLIGADOS.');

  // --- pegar as chaves ---
  step('Pegando as chaves do projeto…');
  const keys = await mgmt('GET', `/projects/${ref}/api-keys`);
  const anon = (keys.find(k => k.name === 'anon') || {}).api_key;
  const service = (keys.find(k => k.name === 'service_role') || {}).api_key;
  if (!anon || !service) die('Não achei as chaves anon/service_role.');
  const url = `https://${ref}.supabase.co`;

  // --- criar o login do cliente ---
  step(`Criando o login de acesso (${loginEmail})…`);
  const resU = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: service, Authorization: 'Bearer ' + service, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: loginEmail, password: loginSenha, email_confirm: true }),
  });
  if (!resU.ok) die('Falha ao criar o login: ' + (await resU.text()));
  ok('Login criado e confirmado.');

  // --- gerar o config do painel ---
  const outName = `config.${nome}.js`;
  const configJs =
    `// Config do painel — cliente "${nome}". NÃO versionar (gitignored).\n` +
    `// Gerado pelo atalho de provisionamento em ${new Date().toISOString()}.\n` +
    `window.CRM_CONFIG = {\n  url: ${JSON.stringify(url)},\n  anonKey: ${JSON.stringify(anon)}\n};\n`;
  await writeFile(outName, configJs, 'utf8');
  ok(`Config do painel gerado: ${outName}`);

  // --- resumo ---
  console.log('\n============================================================');
  console.log('🎉 CLIENTE "' + nome + '" PRONTO E SEGURO.');
  console.log('============================================================');
  console.log('Painel (URL do Supabase): ' + url);
  console.log('Login do cliente:         ' + loginEmail);
  console.log('Config do painel:         ' + outName + '  (renomeie para config.js no deploy desse cliente)');
  console.log('\n🔐 GUARDE em lugar seguro (aparecem só aqui):');
  console.log('   Senha do banco (db password): ' + dbPass);
  console.log('   service_role (secret, SÓ pro n8n, nunca no painel): ' + service.slice(0, 12) + '…(oculto)');
  console.log('\nFalta só, se usar o bot: colar a service_role no n8n daquele cliente.');
  console.log('============================================================\n');
}

main().catch(err => die(err.message || String(err)));
