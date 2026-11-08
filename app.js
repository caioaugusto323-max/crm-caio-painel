'use strict';

/* ============================================================
   CRM Qualificador do Caio — Painel (mural de leads)
   Estático: supabase-js (CDN) + config.js + Supabase Auth.
   Sem framework. Lê a tabela `leads` e mostra um kanban por estágio.
   ============================================================ */

// ---- Estágios do CRM (spec seção 6) = colunas do mural ----
var STAGES = [
  { key: 'novo',                 label: 'Novo',                 dot: '#7a7266' },
  { key: 'qualificado',          label: 'Qualificado',          dot: '#3b5668' },
  { key: 'aguardando_decisao',   label: 'Aguardando decisão',   dot: '#a67c52' },
  { key: 'aguardando_pagamento', label: 'Aguardando pagamento', dot: '#c99a3f' },
  { key: 'consulta_paga',        label: 'Consulta paga',        dot: '#3f7d58' },
  { key: 'consulta_agendada',    label: 'Consulta agendada',    dot: '#2f6e8f' },
  { key: 'outros_repasse',       label: 'Outros · repasse',     dot: '#8a5a8f' },
  { key: 'cliente_fechado',      label: 'Cliente fechado',      dot: '#2e5d43' },
  { key: 'perdido',              label: 'Perdido / sem retorno', dot: '#b4452f' }
];
var STAGE_KEYS = STAGES.map(function (s) { return s.key; });

var ORIGEM_LABEL = { instagram: 'Instagram', indicacao: 'Indicação', google: 'Google', outro: 'Outro' };
var PROC_LABEL = {
  extrajudicial: 'Extrajudicial', judicial_consensual: 'Judicial consensual',
  judicial_litigioso: 'Judicial litigioso'
};
var CONTATO_LABEL = { whatsapp: 'WhatsApp', telefone: 'Telefone', video: 'Chamada de vídeo' };
var ASSUNTO_LABEL = {
  divorcio: 'Divórcio', guarda: 'Guarda', pensao: 'Pensão',
  inventario: 'Inventário', imovel: 'Imóvel', outros: 'Outros'
};

// ---------- Utilitários ----------
var ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(s) { return (s == null ? '' : String(s)).replace(/[&<>"']/g, function (c) { return ESC_MAP[c]; }); }
function el(id) { return document.getElementById(id); }

function fmtDate(iso) {
  if (!iso) return '—';
  // Datas puras (YYYY-MM-DD) viram meia-noite UTC no new Date() e "voltam um dia"
  // no fuso do Brasil. Formata direto da string pra não deslocar.
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (m) return m[3] + '/' + m[2] + '/' + m[1];
  var d = new Date(iso);
  if (isNaN(d)) return esc(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  var d = new Date(iso);
  if (isNaN(d)) return esc(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function label(map, v) { return v ? (map[v] || v) : null; }

// ---------- Supabase ----------
var _sb = null;
function sb() {
  if (!_sb) {
    var cfg = window.CRM_CONFIG;
    if (!cfg || !cfg.url || !cfg.anonKey) throw new Error('config.js não configurado.');
    _sb = window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }
  return _sb;
}

async function getSession() { return (await sb().auth.getSession()).data.session; }
async function signIn(email, password) {
  var r = await sb().auth.signInWithPassword({ email: email, password: password });
  if (r.error) throw r.error;
  return r.data;
}
async function signOut() { await sb().auth.signOut(); }

async function fetchLeads() {
  var r = await sb().from('leads').select('*').order('criado_em', { ascending: false });
  if (r.error) throw r.error;
  return r.data || [];
}
async function updateEstagio(id, estagio) {
  var r = await sb().from('leads').update({ estagio: estagio }).eq('id', id);
  if (r.error) throw r.error;
}

// ---------- Estado ----------
var LEADS = [];
var LEADS_BY_ID = {};

// ---------- Render ----------
function cardHTML(lead) {
  var tags = [];
  var assunto = label(ASSUNTO_LABEL, lead.assunto);
  if (assunto) tags.push('<span class="tag tag--assunto">' + esc(assunto) + '</span>');
  var origem = label(ORIGEM_LABEL, lead.origem);
  if (origem) tags.push('<span class="tag tag--origem">' + esc(origem) + '</span>');
  var proc = label(PROC_LABEL, lead.tipo_procedimento);
  if (proc) tags.push('<span class="tag tag--proc">' + esc(proc) + '</span>');
  if (lead.estagio === 'aguardando_decisao' && lead.data_retorno) {
    tags.push('<span class="tag tag--alert">retorno ' + fmtDate(lead.data_retorno) + '</span>');
  }
  if (lead.estagio === 'consulta_agendada' && lead.data_consulta) {
    tags.push('<span class="tag tag--proc">consulta ' + fmtDate(lead.data_consulta) + '</span>');
  }

  var phrase = lead.frase ? '<p class="card-phrase">' + esc(lead.frase) + '</p>' : '';
  return '' +
    '<article class="card" draggable="true" data-id="' + esc(lead.id) + '">' +
      '<p class="card-name">' + esc(lead.nome || 'Sem nome') + '</p>' +
      '<p class="card-meta">' + esc(lead.telefone || '') + ' · ' + fmtDate(lead.criado_em) + '</p>' +
      phrase +
      (tags.length ? '<div class="card-tags">' + tags.join('') + '</div>' : '') +
    '</article>';
}

function renderBoard() {
  var board = el('board');
  var buckets = {};
  STAGE_KEYS.forEach(function (k) { buckets[k] = []; });
  var orphans = 0;
  LEADS.forEach(function (lead) {
    var k = buckets[lead.estagio] ? lead.estagio : 'novo';
    if (!buckets[lead.estagio]) orphans++;
    buckets[k].push(lead);
  });
  if (orphans) console.warn(orphans + ' lead(s) com estágio fora da lista caíram em "Novo".');

  board.innerHTML = STAGES.map(function (s) {
    var items = buckets[s.key];
    var body = items.length
      ? items.map(cardHTML).join('')
      : '<div class="col-empty">—</div>';
    return '' +
      '<section class="col" data-stage="' + s.key + '">' +
        '<div class="col-head">' +
          '<span class="col-title"><span class="col-dot" style="background:' + s.dot + '"></span>' + esc(s.label) + '</span>' +
          '<span class="col-tally">' + items.length + '</span>' +
        '</div>' +
        '<div class="col-body" data-stage="' + s.key + '">' + body + '</div>' +
      '</section>';
  }).join('');

  el('lead-count').textContent = LEADS.length + (LEADS.length === 1 ? ' lead' : ' leads');
  wireCards();
  wireDropzones();
}

// ---------- Drag & drop ----------
var draggingId = null;
function wireCards() {
  Array.prototype.forEach.call(document.querySelectorAll('.card'), function (card) {
    card.addEventListener('dragstart', function (e) {
      draggingId = card.getAttribute('data-id');
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', function () { card.classList.remove('dragging'); draggingId = null; });
    card.addEventListener('click', function () { openModal(card.getAttribute('data-id')); });
  });
}
function wireDropzones() {
  Array.prototype.forEach.call(document.querySelectorAll('.col-body'), function (zone) {
    zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', function () { zone.classList.remove('drag-over'); });
    zone.addEventListener('drop', function (e) {
      e.preventDefault();
      zone.classList.remove('drag-over');
      var id = draggingId;
      var newStage = zone.getAttribute('data-stage');
      if (!id) return;
      moveLead(id, newStage);
    });
  });
}

async function moveLead(id, newStage) {
  var lead = LEADS_BY_ID[id];
  if (!lead || lead.estagio === newStage) return;
  var prev = lead.estagio;
  lead.estagio = newStage;      // otimista
  renderBoard();
  try {
    await updateEstagio(id, newStage);
    toast('Movido para "' + stageLabel(newStage) + '"');
  } catch (err) {
    lead.estagio = prev;        // reverte
    renderBoard();
    toast('Não consegui mover: ' + (err.message || err));
  }
}
function stageLabel(k) { var s = STAGES.find(function (x) { return x.key === k; }); return s ? s.label : k; }

// ---------- Modal detalhe ----------
function row(dt, dd) { return dd ? '<div class="detail-row"><dt>' + esc(dt) + '</dt><dd>' + dd + '</dd></div>' : ''; }
function respostasHTML(arr) {
  if (!arr || !arr.length) return '';
  var items = arr.map(function (r) {
    return '<li><span class="rsp-label">' + esc(r.label) + ':</span> ' + esc(r.valor) + '</li>';
  }).join('');
  return '<div class="detail-section"><h3>Respostas da triagem</h3><ul class="rsp-list">' + items + '</ul></div>';
}
function openModal(id) {
  var l = LEADS_BY_ID[id];
  if (!l) return;
  el('modal-title').textContent = l.nome || 'Lead sem nome';
  var comp = l.comprovante_url
    ? '<a href="' + esc(l.comprovante_url) + '" target="_blank" rel="noopener">ver comprovante</a>' : null;
  var body = '' +
    row('Estágio', esc(stageLabel(l.estagio))) +
    row('Assunto', esc(label(ASSUNTO_LABEL, l.assunto) || '')) +
    row('Telefone', esc(l.telefone)) +
    row('Origem', esc(label(ORIGEM_LABEL, l.origem) || '')) +
    row('Entrou em', fmtDateTime(l.criado_em)) +
    row('Procedimento', esc(label(PROC_LABEL, l.tipo_procedimento) || '')) +
    row('Acordo', esc(l.acordo || '')) +
    row('Filhos menores', l.filhos_menores == null ? '' : (l.filhos_menores ? 'Sim' : 'Não')) +
    row('Gravidez', l.gravidez == null ? '' : (l.gravidez ? 'Sim' : 'Não')) +
    row('Frase', esc(l.frase || '')) +
    row('Retorno em', l.data_retorno ? fmtDate(l.data_retorno) : '') +
    row('Comprovante', comp) +
    row('Nome completo', esc(l.nome_completo || '')) +
    row('CPF', esc(l.cpf || '')) +
    row('E-mail', esc(l.email || '')) +
    row('Contato preferido', esc(label(CONTATO_LABEL, l.preferencia_contato) || '')) +
    row('Consulta', l.data_consulta ? fmtDateTime(l.data_consulta) : '') +
    respostasHTML(l.respostas);
  el('modal-body').innerHTML = body || '<p>Sem dados.</p>';
  el('modal').hidden = false;
}
function closeModal() { el('modal').hidden = true; }

// ---------- Toast ----------
var toastTimer = null;
function toast(msg) {
  var t = el('board-status');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
}

// ---------- Carregamento ----------
async function loadAndRender() {
  toast('Carregando leads…');
  try {
    LEADS = await fetchLeads();
    LEADS_BY_ID = {};
    LEADS.forEach(function (l) { LEADS_BY_ID[l.id] = l; });
    renderBoard();
    toast(LEADS.length ? 'Pronto.' : 'Nenhum lead ainda.');
  } catch (err) {
    toast('Erro ao carregar: ' + (err.message || err));
    console.error(err);
  }
}

// ---------- Fluxo de telas ----------
function showLogin() { el('login-view').hidden = false; el('app-view').hidden = true; }
function showApp() { el('login-view').hidden = true; el('app-view').hidden = false; }

async function boot() {
  // Login
  el('login-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var btn = el('login-btn'); var errP = el('login-error');
    errP.textContent = ''; btn.disabled = true; btn.textContent = 'Entrando…';
    try {
      await signIn(el('login-email').value.trim(), el('login-password').value);
      el('login-password').value = '';
      showApp(); await loadAndRender();
    } catch (err) {
      errP.textContent = 'E-mail ou senha incorretos.';
      console.error(err);
    } finally {
      btn.disabled = false; btn.textContent = 'Entrar';
    }
  });

  el('logout-btn').addEventListener('click', async function () { await signOut(); showLogin(); });
  el('refresh-btn').addEventListener('click', loadAndRender);

  // Modal
  Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (x) {
    x.addEventListener('click', closeModal);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

  // Sessão existente?
  try {
    var session = await getSession();
    if (session) { showApp(); await loadAndRender(); }
    else showLogin();
  } catch (err) {
    console.error(err); showLogin();
  }
}

document.addEventListener('DOMContentLoaded', boot);
