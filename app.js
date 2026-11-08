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
async function fetchGastos() {
  var r = await sb().from('gastos_mensais').select('*');
  if (r.error) throw r.error;
  return r.data || [];
}
async function upsertGasto(mes, google, meta) {
  var r = await sb().from('gastos_mensais')
    .upsert({ mes: mes, google: google, meta: meta, atualizado_em: new Date().toISOString() }, { onConflict: 'mes' });
  if (r.error) throw r.error;
}

// ---------- Estado ----------
var LEADS = [];
var LEADS_BY_ID = {};
var GASTOS = {};            // { 'AAAA-MM': {google, meta} }
var DASH_MES = monthKey(new Date());   // mês selecionado no dashboard
var CURRENT_VIEW = 'board';

// ---------- Datas / dinheiro ----------
function monthKey(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function leadMonth(lead) { return (lead.criado_em || '').slice(0, 7); }  // 'AAAA-MM'
function prevMonthKey(mk) {
  var p = mk.split('-'); var y = +p[0]; var m = +p[1] - 1;
  if (m < 1) { m = 12; y -= 1; }
  return y + '-' + String(m).padStart(2, '0');
}
function monthLabel(mk) {
  var nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var p = mk.split('-'); return nomes[(+p[1]) - 1] + '/' + p[0];
}
function brl(n) {
  return (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

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

// ---------- Abas ----------
function switchView(view) {
  CURRENT_VIEW = view;
  ['board', 'dash', 'clients'].forEach(function (v) {
    el(v + '-view').hidden = (v !== view);
  });
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
    t.classList.toggle('is-active', t.getAttribute('data-view') === view);
  });
  if (view === 'dash') renderDash();
  if (view === 'clients') renderClients();
}

// ---------- Dashboard (Resultados) ----------
function leadsOfMonth(mk) { return LEADS.filter(function (l) { return leadMonth(l) === mk; }); }
function gastoOfMonth(mk) {
  var g = GASTOS[mk] || { google: 0, meta: 0 };
  return { google: Number(g.google) || 0, meta: Number(g.meta) || 0, total: (Number(g.google) || 0) + (Number(g.meta) || 0) };
}
function byOrigem(leads) {
  var out = {};
  leads.forEach(function (l) {
    var k = l.origem || 'sem_origem';
    out[k] = (out[k] || 0) + 1;
  });
  return out;
}

// Meses com dados (leads ou gasto), ordenados, últimos N — pro gráfico de evolução.
function monthsWithData(n) {
  var set = {};
  LEADS.forEach(function (l) { var m = leadMonth(l); if (m) set[m] = true; });
  Object.keys(GASTOS).forEach(function (m) { set[m] = true; });
  var keys = Object.keys(set).sort();
  if (keys.length > n) keys = keys.slice(keys.length - n);
  return keys.map(function (mk) {
    return { mk: mk, leads: leadsOfMonth(mk).length, gasto: gastoOfMonth(mk).total };
  });
}

function buildEvoHTML() {
  var meses = monthsWithData(6);
  if (!meses.length) {
    return '<section class="panel"><h3>Gasto × leads por mês</h3>' +
      '<p class="muted">Ainda não há meses com dados. Conforme os leads entram e você registra o gasto, a evolução aparece aqui.</p></section>';
  }
  var maxGasto = meses.reduce(function (m, x) { return Math.max(m, x.gasto); }, 0) || 1;
  var maxLeads = meses.reduce(function (m, x) { return Math.max(m, x.leads); }, 0) || 1;
  var H = 120;
  var cols = meses.map(function (x) {
    var hg = x.gasto > 0 ? Math.max(4, Math.round(x.gasto / maxGasto * H)) : 0;
    var hl = x.leads > 0 ? Math.max(4, Math.round(x.leads / maxLeads * H)) : 0;
    return '<div class="evo-col">' +
      '<div class="evo-bars" style="height:' + H + 'px">' +
        '<div class="evo-bar evo-bar--gasto" style="height:' + hg + 'px" title="Gasto: ' + esc(brl(x.gasto)) + '">' +
          (x.gasto > 0 ? '<span class="evo-v">' + esc(brl(x.gasto)) + '</span>' : '') + '</div>' +
        '<div class="evo-bar evo-bar--leads" style="height:' + hl + 'px" title="' + x.leads + ' leads">' +
          (x.leads > 0 ? '<span class="evo-v">' + x.leads + '</span>' : '') + '</div>' +
      '</div>' +
      '<span class="evo-mes">' + esc(monthLabel(x.mk)) + '</span>' +
    '</div>';
  }).join('');
  return '<section class="panel panel--evo">' +
    '<div class="evo-head"><h3>Gasto × leads por mês</h3>' +
      '<div class="evo-legend">' +
        '<span><i class="evo-dot evo-dot--gasto"></i>Gasto (R$)</span>' +
        '<span><i class="evo-dot evo-dot--leads"></i>Leads</span>' +
      '</div>' +
    '</div>' +
    '<div class="evo-chart">' + cols + '</div>' +
  '</section>';
}

function statTile(valor, rotulo, hint) {
  return '<div class="stat">' +
    '<span class="stat-num">' + valor + '</span>' +
    '<span class="stat-label">' + esc(rotulo) + '</span>' +
    (hint ? '<span class="stat-hint">' + esc(hint) + '</span>' : '') +
    '</div>';
}

function buildAnalysis(mk) {
  var leads = leadsOfMonth(mk);
  var prev = leadsOfMonth(prevMonthKey(mk));
  var g = gastoOfMonth(mk);
  var gPrev = gastoOfMonth(prevMonthKey(mk));
  var cpl = leads.length ? g.total / leads.length : 0;
  var cplPrev = prev.length ? gPrev.total / prev.length : 0;
  var notas = [];

  // Volume de contatos
  if (!leads.length) {
    notas.push({ t: 'neutro', txt: 'Nenhum contato registrado em ' + monthLabel(mk) + ' ainda. Quando o bot (ou você, à mão) cadastrar leads, os números aparecem aqui.' });
  } else if (prev.length) {
    var dif = leads.length - prev.length;
    if (dif > 0) notas.push({ t: 'bom', txt: 'Entraram ' + leads.length + ' contatos — ' + dif + ' a mais que em ' + monthLabel(prevMonthKey(mk)) + '.' });
    else if (dif < 0) notas.push({ t: 'ruim', txt: 'Entraram ' + leads.length + ' contatos — ' + (-dif) + ' a menos que em ' + monthLabel(prevMonthKey(mk)) + '.' });
    else notas.push({ t: 'neutro', txt: 'Mesmo volume de contatos do mês passado (' + leads.length + ').' });
  } else {
    notas.push({ t: 'neutro', txt: 'Entraram ' + leads.length + ' contatos em ' + monthLabel(mk) + '.' });
  }

  // Custo por lead
  if (g.total === 0 && leads.length) {
    notas.push({ t: 'neutro', txt: 'Você ainda não registrou o gasto de ' + monthLabel(mk) + '. Digite o valor do Google e do Meta acima pra ver o custo por lead.' });
  } else if (leads.length && g.total > 0) {
    if (cplPrev > 0) {
      if (cpl > cplPrev * 1.15) notas.push({ t: 'ruim', txt: 'O custo por lead subiu: ' + brl(cpl) + ' (era ' + brl(cplPrev) + '). O anúncio está trazendo gente mais cara — vale revisar a segmentação.' });
      else if (cpl < cplPrev * 0.85) notas.push({ t: 'bom', txt: 'O custo por lead caiu: ' + brl(cpl) + ' (era ' + brl(cplPrev) + '). O anúncio está rendendo mais.' });
      else notas.push({ t: 'neutro', txt: 'Custo por lead estável em ' + brl(cpl) + '.' });
    } else {
      notas.push({ t: 'neutro', txt: 'Cada contato custou ' + brl(cpl) + ' esse mês.' });
    }
  }

  // Melhor origem
  if (leads.length) {
    var ori = byOrigem(leads);
    var best = null, bestN = 0;
    Object.keys(ori).forEach(function (k) { if (k !== 'sem_origem' && ori[k] > bestN) { bestN = ori[k]; best = k; } });
    if (best) notas.push({ t: 'bom', txt: 'O canal que mais trouxe gente foi ' + (ORIGEM_LABEL[best] || best) + ' (' + bestN + ' contatos).' });
    var semOri = ori.sem_origem || 0;
    if (semOri) notas.push({ t: 'ruim', txt: semOri + ' contato(s) sem origem registrada — assim fica difícil saber qual canal está funcionando. Vale sempre marcar de onde veio.' });
  }

  // Conversão em cliente fechado
  var fechados = leads.filter(function (l) { return l.estagio === 'cliente_fechado'; }).length;
  var pagas = leads.filter(function (l) { return l.estagio === 'consulta_paga' || l.estagio === 'cliente_fechado'; }).length;
  if (leads.length && (fechados || pagas)) {
    notas.push({ t: 'bom', txt: fechados + ' viraram cliente e ' + pagas + ' pagaram consulta, dos ' + leads.length + ' contatos do mês.' });
  }

  return notas;
}

function renderDash() {
  var mk = DASH_MES;
  var leads = leadsOfMonth(mk);
  var g = gastoOfMonth(mk);
  var cpl = leads.length ? g.total / leads.length : 0;
  var pagas = leads.filter(function (l) { return l.estagio === 'consulta_paga' || l.estagio === 'cliente_fechado'; }).length;

  // Origem (ordenada desc)
  var ori = byOrigem(leads);
  var oriKeys = Object.keys(ori).sort(function (a, b) { return ori[b] - ori[a]; });
  var oriMax = oriKeys.reduce(function (m, k) { return Math.max(m, ori[k]); }, 0) || 1;
  var oriHTML = oriKeys.length ? oriKeys.map(function (k) {
    var nome = k === 'sem_origem' ? 'Sem origem' : (ORIGEM_LABEL[k] || k);
    var n = ori[k];
    var pct = Math.round((n / oriMax) * 100);
    return '<div class="bar-row">' +
      '<span class="bar-label">' + esc(nome) + '</span>' +
      '<span class="bar-track"><span class="bar-fill" style="width:' + pct + '%"></span></span>' +
      '<span class="bar-val">' + n + '</span>' +
    '</div>';
  }).join('') : '<p class="muted">Nenhum contato nesse mês.</p>';

  var notas = buildAnalysis(mk);
  var notasHTML = notas.map(function (n) {
    return '<li class="nota nota--' + n.t + '">' + esc(n.txt) + '</li>';
  }).join('');

  el('dash-view').innerHTML = '' +
    '<div class="dash-head">' +
      '<h2>Resultados de <input type="month" id="dash-mes" value="' + mk + '" /></h2>' +
    '</div>' +

    '<div class="stats">' +
      statTile(String(leads.length), 'contatos no mês') +
      statTile(leads.length ? brl(cpl) : '—', 'custo por lead', g.total ? '' : 'informe o gasto') +
      statTile(brl(g.total), 'gasto no mês', 'Google + Meta') +
      statTile(String(pagas), 'consultas pagas / fechadas') +
    '</div>' +

    buildEvoHTML() +

    '<div class="dash-grid">' +
      '<section class="panel">' +
        '<h3>Quanto você gastou em ' + monthLabel(mk) + '</h3>' +
        '<div class="gasto-form">' +
          '<label>Google Ads <div class="money-in"><span>R$</span><input type="number" step="0.01" min="0" id="gasto-google" value="' + g.google + '" /></div></label>' +
          '<label>Meta Ads <div class="money-in"><span>R$</span><input type="number" step="0.01" min="0" id="gasto-meta" value="' + g.meta + '" /></div></label>' +
          '<button id="gasto-save" class="btn btn-primary">Salvar gasto</button>' +
        '</div>' +
        '<p class="muted small">Pegue o total no Gerenciador do Meta e no Google Ads uma vez por mês e digite aqui. O painel calcula o custo por lead sozinho.</p>' +
      '</section>' +

      '<section class="panel">' +
        '<h3>De onde vieram</h3>' +
        '<div class="bars">' + oriHTML + '</div>' +
      '</section>' +
    '</div>' +

    '<section class="panel panel--analise">' +
      '<h3>Análise — o que está bom e o que ajustar</h3>' +
      '<ul class="notas">' + notasHTML + '</ul>' +
    '</section>';

  // wire
  el('dash-mes').addEventListener('change', function () { DASH_MES = this.value || monthKey(new Date()); renderDash(); });
  el('gasto-save').addEventListener('click', saveGastoFromForm);
}

async function saveGastoFromForm() {
  var mk = DASH_MES;
  var google = parseFloat(el('gasto-google').value) || 0;
  var meta = parseFloat(el('gasto-meta').value) || 0;
  var btn = el('gasto-save'); btn.disabled = true; btn.textContent = 'Salvando…';
  try {
    await upsertGasto(mk, google, meta);
    GASTOS[mk] = { google: google, meta: meta };
    toast('Gasto de ' + monthLabel(mk) + ' salvo.');
    renderDash();
  } catch (err) {
    toast('Não consegui salvar: ' + (err.message || err));
    console.error(err);
    btn.disabled = false; btn.textContent = 'Salvar gasto';
  }
}

// ---------- Clientes (lista) ----------
function renderClients() {
  el('clients-view').innerHTML = '' +
    '<div class="dash-head">' +
      '<h2>Todos os contatos</h2>' +
      '<div class="filters">' +
        '<input type="search" id="cli-busca" placeholder="Buscar por nome ou telefone…" />' +
        '<select id="cli-estagio"><option value="">Todos os estágios</option>' +
          STAGES.map(function (s) { return '<option value="' + s.key + '">' + esc(s.label) + '</option>'; }).join('') +
        '</select>' +
        '<select id="cli-origem"><option value="">Todas as origens</option>' +
          Object.keys(ORIGEM_LABEL).map(function (k) { return '<option value="' + k + '">' + esc(ORIGEM_LABEL[k]) + '</option>'; }).join('') +
        '</select>' +
      '</div>' +
    '</div>' +
    '<div id="cli-table"></div>';

  el('cli-busca').addEventListener('input', renderClientsTable);
  el('cli-estagio').addEventListener('change', renderClientsTable);
  el('cli-origem').addEventListener('change', renderClientsTable);
  renderClientsTable();
}

function renderClientsTable() {
  var q = (el('cli-busca').value || '').toLowerCase().trim();
  var fe = el('cli-estagio').value;
  var fo = el('cli-origem').value;
  var rows = LEADS.filter(function (l) {
    if (fe && l.estagio !== fe) return false;
    if (fo && l.origem !== fo) return false;
    if (q) {
      var hay = ((l.nome || '') + ' ' + (l.telefone || '')).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });

  var head = '<table class="cli-tbl"><thead><tr>' +
    '<th>Nome</th><th>Telefone</th><th>Assunto</th><th>Origem</th><th>Estágio</th><th>Entrou</th>' +
    '</tr></thead><tbody>';
  var body = rows.length ? rows.map(function (l) {
    return '<tr data-id="' + esc(l.id) + '">' +
      '<td>' + esc(l.nome || 'Sem nome') + '</td>' +
      '<td>' + esc(l.telefone || '—') + '</td>' +
      '<td>' + esc(label(ASSUNTO_LABEL, l.assunto) || '—') + '</td>' +
      '<td>' + esc(label(ORIGEM_LABEL, l.origem) || '—') + '</td>' +
      '<td>' + esc(stageLabel(l.estagio)) + '</td>' +
      '<td>' + fmtDate(l.criado_em) + '</td>' +
    '</tr>';
  }).join('') : '<tr><td colspan="6" class="muted">Nenhum contato com esses filtros.</td></tr>';

  el('cli-table').innerHTML = head + body + '</tbody></table>';
  Array.prototype.forEach.call(document.querySelectorAll('#cli-table tr[data-id]'), function (tr) {
    tr.addEventListener('click', function () { openModal(tr.getAttribute('data-id')); });
  });
}

// ---------- Carregamento ----------
async function loadAndRender() {
  toast('Carregando…');
  try {
    LEADS = await fetchLeads();
    LEADS_BY_ID = {};
    LEADS.forEach(function (l) { LEADS_BY_ID[l.id] = l; });

    // Gastos é opcional: se a tabela ainda não existe, segue com gastos zerados.
    GASTOS = {};
    try {
      var gs = await fetchGastos();
      gs.forEach(function (g) { GASTOS[g.mes] = { google: g.google, meta: g.meta }; });
    } catch (gErr) {
      console.warn('Tabela de gastos ainda não disponível (rode add-gastos-mensais.sql):', gErr.message || gErr);
    }

    renderBoard();
    if (CURRENT_VIEW === 'dash') renderDash();
    if (CURRENT_VIEW === 'clients') renderClients();
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

  // Abas
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
    t.addEventListener('click', function () { switchView(t.getAttribute('data-view')); });
  });

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
