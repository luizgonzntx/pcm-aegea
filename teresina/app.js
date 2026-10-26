(() => {
  'use strict';
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)], P = window.PCM;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => Number(v || 0).toLocaleString('pt-BR'), pct = v => v == null ? '—' : (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%', fmt = v => P.validDate(v || '') ? v.split('-').reverse().join('/') : 'Não informada';
  const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

  let db, data = null, revision = 0, user = null, role = '', page = 'overview', pageNo = 1, pending = null, pendingRevision = 0, worker = null, toastTimer, map, markers, fitBounds, rows = [], rankEvidence = [], modalMode = '', loading = false, selectedFiles = [];
  // O recorte operacional sempre usa a data de entrada da ordem.
  const f = { from: today().slice(0, 4) + '-01-01', to: today().slice(0, 4) + '-12-31', dateField: 'created', tag: [], asset: [], type: [], priority: [] };
  const emptyHTML = '<div class="no-data">Sem registros para os filtros selecionados.</div>';

  const filterLabels = {
    tag: { options: '#systemOptions', summary: '#systemSummary', all: 'Todos os sistemas', title: 'Instalação' },
    asset: { options: '#assetOptions', summary: '#assetSummary', all: 'Todos os ativos', title: 'Ativo' },
    type: { options: '#typeOptions', summary: '#typeSummary', all: 'Todos os tipos', title: 'Tipo' },
    priority: { options: '#priorityOptions', summary: '#prioritySummary', all: 'Todas as prioridades', title: 'Prioridade' }
  };

  function selectedValues(key) {
    const value = f[key];
    return Array.isArray(value) ? value : (value ? [value] : []);
  }

  function matchesFilter(value, selected) {
    const list = Array.isArray(selected) ? selected : (selected ? [selected] : []);
    return !list.length || list.includes(value);
  }

  function filterSummary(key, values) {
    const cfg = filterLabels[key], count = values.length;
    if (!count) return cfg.all;
    if (count === document.querySelectorAll(cfg.options + ' .filter-check').length) return cfg.all;
    if (count === 1) {
      const input = [...document.querySelectorAll(cfg.options + ' input')].find(item => item.value === values[0]);
      return input?.dataset.label || values[0];
    }
    return count + ' selecionados';
  }

  function renderFilterPicker(key, list) {
    const cfg = filterLabels[key], el = $(cfg.options);
    if (!el) return;
    const selected = selectedValues(key);
    el.innerHTML = list.length
      ? '<div class="filter-options-tools">' +
        '<input type="search" class="filter-search" data-filter-search="' + key + '" placeholder="Buscar ' + cfg.title.toLocaleLowerCase('pt-BR') + '…" aria-label="Buscar ' + cfg.title.toLocaleLowerCase('pt-BR') + '">' +
        '<div><button type="button" data-filter-action="all" data-filter-key="' + key + '">Marcar todos</button>' +
        '<button type="button" data-filter-action="clear" data-filter-key="' + key + '">Limpar</button></div>' +
        '</div><div class="filter-options-list">' +
        list.map(([value, label]) => '<label class="filter-option" data-filter-label="' + esc(label.toLocaleLowerCase('pt-BR')) + '"><input type="checkbox" class="filter-check" data-filter-key="' + key + '" value="' + esc(value) + '" data-label="' + esc(label) + '"' + (selected.includes(value) ? ' checked' : '') + '><span>' + esc(label) + '</span></label>').join('') +
        '</div>'
      : '<span class="filter-empty">Nenhuma opção disponível</span>';
    $(cfg.summary).textContent = filterSummary(key, selected);
  }

  function refreshFilterSummary(key) {
    const cfg = filterLabels[key];
    if ($(cfg.summary)) $(cfg.summary).textContent = filterSummary(key, selectedValues(key));
  }

  function toggleFilterValue(key, value) {
    const selected = new Set(selectedValues(key));
    if (selected.has(value)) selected.delete(value); else selected.add(value);
    f[key] = [...selected];
    refreshFilterSummary(key);
  }

  function updateActiveFilters() {
    const year = today().slice(0, 4);
    const active = [];
    if (f.from !== year + '-01-01' || f.to !== year + '-12-31') {
      active.push({ key: 'period', label: 'Período: ' + fmt(f.from) + ' – ' + fmt(f.to) });
    }
    for (const key of ['tag', 'asset', 'type', 'priority']) {
      const cfg = filterLabels[key];
      const values = selectedValues(key);
      if (values.length && values.length === document.querySelectorAll(cfg.options + ' .filter-check').length) continue;
      for (const value of values) {
        const option = [...document.querySelectorAll(cfg.options + ' input')].find(input => input.value === value);
        const label = option?.dataset.label || (key === 'type' ? P.typeLabel(value) : value);
        active.push({ key, value, label: cfg.title + ': ' + label });
      }
    }

    $('#activeFilterCount').textContent = active.length ? active.length + (active.length === 1 ? ' filtro ativo' : ' filtros ativos') : 'Nenhum filtro adicional';
    $('#clearFilters').disabled = active.length === 0;
    $('#activeFilters').hidden = active.length === 0;
    $('#activeFilterChips').innerHTML = active.map(item =>
      '<button type="button" class="active-filter-chip" data-remove-filter="' + item.key + '"' +
      (item.value != null ? ' data-filter-value="' + esc(item.value) + '"' : '') +
      '>' + esc(item.label) + '<span aria-hidden="true">×</span></button>'
    ).join('');
  }

  function notify(message) {
    $('#toast').textContent = message;
    $('#toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('#toast').hidden = true, 6000);
  }

  function errorText(e) {
    if (e?.message === 'Invalid login credentials') return 'E-mail ou senha não conferem.';
    return e?.message || 'Não foi possível concluir. Tente novamente.';
  }

  function loginMessage(message, isError = false) {
    $('#loginMessage').textContent = message;
    $('#loginMessage').classList.toggle('error', isError);
  }

  function setPage(next) {
    page = next;
    const titles = {
      overview: 'Visão dos sistemas',
      intelligence: 'Engenharia & Decisão',
      icm: 'Itens, causas e medidas',
      deadlines: 'Planos e prazos',
      orders: 'Ordens de manutenção',
      stops: 'Paradas'
    };
    $('#pageTitle').textContent = titles[next] || 'Visão dos sistemas';
    $$('[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === next));
    $$('[data-view]').forEach(v => v.hidden = v.dataset.view !== next);
    if (next === 'overview' && map) setTimeout(() => map.invalidateSize(), 60);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function selectOptions(id, values, label, selected) {
    const el = $(id);
    if (!el) return '';
    el.innerHTML = '<option value="">' + esc(label) + '</option>' + values.map(([v, n]) => '<option value="' + esc(v) + '">' + esc(n) + '</option>').join('');
    el.value = selected || '';
    return el.value;
  }

  function options() {
    if (!data) return;
    renderFilterPicker('tag', data.systems.map(s => [s.tag, s.name]));
    renderFilterPicker('type', [...new Set(data.orders.map(o => o.type).filter(Boolean))].sort().map(t => [t, P.typeLabel(t)]));
    renderFilterPicker('priority', [...new Set(data.orders.map(o => o.priority).filter(Boolean))].sort().map(p => [p, p]));
    assets();
  }

  function assets() {
    if (!data) return;
    const list = [...new Set(data.orders.filter(o => matchesFilter(o.tag, f.tag)).map(o => o.asset).filter(Boolean))].sort();
    const available = new Set(list);
    f.asset = selectedValues('asset').filter(value => available.has(value));
    renderFilterPicker('asset', list.map(v => [v, v]));
  }

  function field(label, value) {
    return '<div><dt>' + esc(label) + '</dt><dd>' + esc(value || 'Não informado') + '</dd></div>';
  }

  function kpi(title, value, note, accent) {
    return '<article class="kpi"' + (accent ? ' style="--accent:' + accent + '"' : '') + '><span>' + esc(title) + '</span><strong>' + esc(value) + '</strong><small>' + esc(note) + '</small></article>';
  }

  function formatHours(hours) {
    if (hours == null) return '—';
    return hours >= 24
      ? (hours / 24).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' dias'
      : hours.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' h';
  }

  function renderSystemsList() {
    if (!data) return;
    const q = ($('#systemSearch')?.value || '').trim().toLocaleLowerCase('pt-BR');
    const filteredSystems = data.systems.filter(s => !q || [s.name, s.tag, s.district, s.address].join(' ').toLocaleLowerCase('pt-BR').includes(q));
    $('#systemCount').textContent = num(filteredSystems.length);
    if (!filteredSystems.length) {
      $('#systemsList').innerHTML = emptyHTML;
      return;
    }
    const asOf = today();
    $('#systemsList').innerHTML = filteredSystems.map(s => {
      const sysFilter = { ...f, tag: [s.tag], asset: selectedValues('tag').length && !selectedValues('tag').includes(s.tag) ? [] : selectedValues('asset') };
      const selected = P.filter(data, sysFilter);
      const a = P.adherence(data, sysFilter);
      const n = P.stats(selected);
      const t = P.timing(P.filter(data, sysFilter, true), asOf);
      const reliability = P.reliabilityByPlant(data, sysFilter).find(item => item.tag === s.tag);
      const health = P.systemHealth(a.rate, t.overdue);
      const badgeLabel = a.rate == null ? 'Sem plano' : pct(a.rate);
      return '<button class="system-row" data-system="' + esc(s.tag) + '">' +
        '<div class="system-row-top"><b>' + esc(s.name) + '</b><span class="badge ' + health + '">' + esc(badgeLabel) + '</span></div>' +
        '<span class="system-meta"><span>' + num(n.done) + ' executadas de ' + num(n.total) + '</span><span>' + (t.overdue ? num(t.overdue) + ' vencida(s)' : esc(s.district || s.tag)) + '</span></span>' +
        '<span class="system-reliability"><span>MTBF <b>' + formatHours(reliability?.mtbfHours) + '</b></span><span>MTTR <b>' + formatHours(reliability?.mttrHours) + '</b></span><span>Disponibilidade <b>' + pct(reliability?.availability) + '</b></span></span>' +
        '<span class="mini-track"><i class="' + health + '" style="width:' + (a.rate == null ? 0 : a.rate * 100) + '%"></i></span>' +
        '</button>';
    }).join('');
  }

  function render() {
    if (!data) {
      $('#empty').hidden = false;
      $('#dashboard').hidden = true;
      $('#scope').textContent = '';
      return;
    }
    $('#empty').hidden = true;
    $('#dashboard').hidden = false;
    rows = P.filter(data, f);
    rankEvidence = [];
    pageNo = 1;
    const s = P.stats(rows), a = P.adherence(data, f);
    $('#kpis').innerHTML =
      kpi('Ordens no período', num(s.total), 'Instalações e ativos selecionados') +
      kpi('Ordens executadas', num(s.done), pct(s.total ? s.done / s.total : null) + ' do total', '#0f8a68') +
      kpi('Em aberto', num(s.open), 'Aguardando execução', '#c2780c') +
      kpi('Não executadas', num(s.notdone), 'Mantidas na base do plano', '#c43650');

    $('#scope').textContent = (f.tag.length ? num(f.tag.length) + ' instalação(ões)' : num(data.systems.length) + ' instalações') + ' · Entrada: ' + fmt(f.from) + ' a ' + fmt(f.to);
    updateActiveFilters();
    renderSystemsList();
    $('#planSummary').innerHTML =
      '<strong class="plan-number">' + pct(a.rate) + '</strong>' +
      '<div class="sub">' + num(a.done) + ' executadas de ' + num(a.total) + ' ordens do plano</div>' +
      '<div class="sub" style="margin-top:10px">' + pct(a.withinRate) + ' com início real dentro do período</div>';

    renderMonthly();
    renderTypeDistribution();
    renderIntelligence();
    renderICM();
    renderStops();
    renderTopAssets();
    renderDeadlines();
    renderOrders();
    renderMap();
  }

  function renderMonthly() {
    const buckets = new Map();
    for (const o of rows) {
      const key = (o.created || '').slice(0, 7);
      if (!key) continue;
      if (!buckets.has(key)) buckets.set(key, { total: 0, done: 0 });
      const b = buckets.get(key);
      b.total++;
      if (P.status(o) === 'done') b.done++;
    }
    const list = [...buckets].sort((a, b) => a[0].localeCompare(b[0]));
    const max = Math.max(1, ...list.map(v => v[1].total));
    $('#monthly').innerHTML = list.length
      ? '<div class="monthly">' + list.map(([m, v]) => {
          const execPct = Math.round((v.done / v.total) * 100);
          return '<div class="month" title="' + esc(m) + ': ' + v.done + ' executadas / ' + v.total + ' ordens (' + execPct + '%)">' +
            '<strong>' + num(v.total) + '</strong>' +
            '<span class="pct-tag">' + execPct + '%</span>' +
            '<div class="column" style="height:' + Math.max(4, v.total / max * 110) + 'px"><i style="height:' + (v.done / v.total * 100) + '%"></i></div>' +
            '<small>' + m.slice(5) + '/' + m.slice(2, 4) + '</small>' +
            '</div>';
        }).join('') + '</div>'
      : emptyHTML;
  }

  function renderTypeDistribution() {
    const el = $('#typeDistribution');
    if (!el) return;
    const types = P.byType(rows);
    if (!types.length) {
      el.innerHTML = emptyHTML;
      return;
    }
    const max = types[0].total;
    el.innerHTML = '<div class="type-list">' + types.slice(0, 8).map(t => {
      const isSelected = selectedValues('type').includes(t.type);
      return '<button type="button" class="type-row' + (isSelected ? ' active-filter' : '') + '" data-type-filter="' + esc(t.type) + '">' +
        '<div class="row-head"><b>' + esc(t.label) + '</b><span>' + num(t.total) + ' ordens (' + pct(t.rate) + ' exec.)</span></div>' +
        '<div class="row-sub"><span>' + num(t.done) + ' executadas · ' + num(t.open) + ' em aberto · ' + num(t.notdone) + ' não exec.</span><span>' + num(t.planned) + ' com plano</span></div>' +
        '<span class="mini-track"><i style="width:' + (t.total / max * 100) + '%"></i></span>' +
        '</button>';
    }).join('') + '</div>';
  }

  function renderTopAssets() {
    const list = P.topAssets(rows).slice(0, 8);
    const sysNameByTag = new Map((data?.systems || []).map(s => [s.tag, s.name]));
    const html = list.length
      ? '<div class="asset-list">' + list.map(a => {
          const key = rankEvidence.push({ name: 'Ativo ' + a.asset + ' · ' + a.equipment, count: a.total, ids: a.ids }) - 1;
          const sysName = sysNameByTag.get(a.tag) || a.tag;
          const max = list[0].total || 1;
          return '<button type="button" class="asset-row" data-rank="' + key + '">' +
            '<div class="row-head"><b>' + esc(a.asset) + '</b><span>' + num(a.done) + ' exec. / ' + num(a.total) + ' OS (' + num(a.corrective) + ' corr.)</span></div>' +
            '<div class="row-sub"><span>' + esc(a.equipment) + ' · ' + esc(sysName) + '</span><span>' + num(a.open) + ' aberta(s)</span></div>' +
            '<span class="mini-track"><i style="width:' + (a.total / max * 100) + '%"></i></span>' +
            '</button>';
        }).join('') + '</div>'
      : emptyHTML;
    if ($('#topAssetsOverview')) $('#topAssetsOverview').innerHTML = html;
    if ($('#topAssetsIcm')) $('#topAssetsIcm').innerHTML = html;
  }

  function renderIntelligence() {
    const kpiEl = $('#engKpis');
    if (!kpiEl) return;
    const asOf = today();
    const m = P.engineeringMetrics(data, rows, asOf);
    const insights = P.decisionInsights(data, rows, f);
    const actors = P.badActors(rows).slice(0, 20);
    const sysNameByTag = new Map((data?.systems || []).map(s => [s.tag, s.name]));

    kpiEl.innerHTML =
      kpi('Ordens preventivas, preditivas e de engenharia', pct(m.proactiveRate), num(m.proactive) + ' ordens; referência SMRP ≥ 80%', m.proactiveRate >= 0.75 ? '#0f8a68' : m.proactiveRate >= 0.60 ? '#c2780c' : '#c43650') +
      kpi('Ordens com prioridade emergencial', pct(m.emergencyRate), num(m.prioEmerg) + ' ordens marcadas como emergência', m.emergencyRate <= 0.10 ? '#0f8a68' : m.emergencyRate <= 0.20 ? '#c2780c' : '#c43650') +
      kpi('Ordens com reset ou rearme', pct(m.palliativeRate), num(m.palliativeCount) + ' ordens com reset, rearme ou ajuste', m.palliativeRate <= 0.12 ? '#0f8a68' : '#c43650') +
      kpi('Cobertura ICM nas Corretivas', pct(m.icmCoverageRate), num(m.corrWithIcm) + ' de ' + num(m.correctiveDoneTotal) + ' corretivas com catálogo completo', '#0027bd');

    const mixEl = $('#maintenanceMixBar');
    if (mixEl) {
      if (!m.total) {
        mixEl.innerHTML = emptyHTML;
      } else {
        const segs = [
          ['prev', 'Preventiva', m.preventive, '#0027bd'],
          ['pred', 'Preditiva', m.predictive, '#00b6df'],
          ['eng', 'Engenharia de manutenção', m.engineering, '#0f8a68'],
          ['cplan', 'Corretiva programada', m.correctivePlan, '#c2780c'],
          ['serv', 'Serviços', m.service, '#8592ad'],
          ['cemerg', 'Corretiva emergencial', m.correctiveEmerg, '#c43650'],
          ['reactive', 'Reativa', m.reactive, '#7e4aa8']
        ];
        mixEl.innerHTML =
          '<div class="mix-bar-track">' +
          segs.filter(s => s[2] > 0).map(s => '<div class="mix-seg ' + s[0] + '" style="width:' + (s[2] / m.total * 100) + '%" title="' + esc(s[1]) + ': ' + num(s[2]) + '"></div>').join('') +
          '</div>' +
          '<div class="mix-legend">' +
          segs.map(s =>
            '<div class="mix-item">' +
            '<div class="mix-item-head"><span><i class="dot" style="background:' + s[3] + '"></i>' + esc(s[1]) + '</span><b>' + pct(s[2] / m.total) + '</b></div>' +
            '<small>' + num(s[2]) + ' ordens no período</small>' +
            '</div>'
          ).join('') +
          '</div>';
      }
    }

    const decEl = $('#decisionCards');
    if (decEl) {
      decEl.innerHTML = insights.length
        ? insights.map(ins => {
            let btn = '';
            if (ins.ids && ins.ids.length) {
              const key = rankEvidence.push({ name: ins.title, count: ins.ids.length, ids: ins.ids }) - 1;
              btn = '<button type="button" data-rank="' + key + '">Ver ' + num(ins.ids.length) + ' OS ↗</button>';
            }
            return '<article class="decision-card ' + ins.severity + '">' +
              '<div><span class="eyebrow blue">' + esc(ins.category) + '</span><h3>' + esc(ins.title) + '</h3><p>' + esc(ins.body) + '</p></div>' +
              (btn ? '<div class="decision-action">' + btn + '</div>' : '') +
              '</article>';
          }).join('')
        : emptyHTML;
    }

    const actorsEl = $('#badActorsTable');
    if (actorsEl) {
      actorsEl.innerHTML = actors.length
        ? '<table><thead><tr><th>TAG Ativo</th><th>Equipamento / Objeto Técnico</th><th>Instalação</th><th>Total OS</th><th>Corretivas</th><th>Emergenciais</th><th>Retrabalho (&lt; 30d)</th><th>MTBF Estimado</th></tr></thead><tbody>' +
          actors.map(a => {
            const key = rankEvidence.push({ name: 'Bad Actor: ' + a.asset + ' (' + a.equipment + ')', count: a.total, ids: a.ids }) - 1;
            const sysName = sysNameByTag.get(a.tag) || a.tag;
            const mtbfText = a.mtbfDays == null ? '—' : Math.round(a.mtbfDays) + ' dias';
            const reworkBadge = a.rework30d > 0 ? '<span class="badge critical">' + num(a.rework30d) + ' reincidência(s)</span>' : '<span class="badge good">0</span>';
            return '<tr>' +
              '<td><button class="link" data-rank="' + key + '">' + esc(a.asset) + ' ↗</button></td>' +
              '<td><b>' + esc(a.equipment) + '</b></td>' +
              '<td><button class="link" data-system="' + esc(a.tag) + '">' + esc(sysName) + '</button></td>' +
              '<td>' + num(a.total) + '</td>' +
              '<td><b>' + num(a.corrective) + '</b></td>' +
              '<td>' + num(a.emergency) + '</td>' +
              '<td>' + reworkBadge + '</td>' +
              '<td><strong>' + esc(mtbfText) + '</strong></td>' +
              '</tr>';
          }).join('') + '</tbody></table>'
        : emptyHTML;
    }
  }

  function ranks(kind, source = rows) {
    return kind === 'action' ? P.rank(data.actions, source, 'action') : P.rank(data.items, source, kind);
  }

  function rankHTML(list) {
    if (!list.length) return emptyHTML;
    const max = list[0].count;
    return '<div class="rank-list">' + list.slice(0, 8).map(r => {
      const key = rankEvidence.push(r) - 1;
      return '<button class="rank" data-rank="' + key + '"><span class="rank-label"><span>' + esc(r.name) + '</span><b>' + num(r.count) + ' OS</b></span><span class="rank-bar"><i style="width:' + (r.count / max * 100) + '%"></i></span></button>';
    }).join('') + '</div>';
  }

  function renderICM() {
    $('#icmCards').innerHTML = [
      ['component', 'ITENS', 'Itens que mais falharam'],
      ['cause', 'CAUSAS', 'Causas registradas'],
      ['action', 'MEDIDAS', 'Intervenções realizadas']
    ].map(([k, e, h]) =>
      '<article class="card"><div class="card-top"><div><span class="eyebrow">' + e + '</span><h2>' + h + '</h2></div></div>' + rankHTML(ranks(k)) + '</article>'
    ).join('');

    const matrix = P.icmMatrix(data, rows).slice(0, 15);
    const matrixEl = $('#icmMatrixTable');
    if (matrixEl) {
      matrixEl.innerHTML = matrix.length
        ? '<table><thead><tr><th>Item (Componente)</th><th>Problema</th><th>Causa registrada</th><th>Medida realizada</th><th>OS Exec.</th></tr></thead><tbody>' +
          matrix.map(m => {
            const key = rankEvidence.push({ name: m.component + ' → ' + m.cause + ' → ' + m.action, count: m.count, ids: m.ids }) - 1;
            return '<tr>' +
              '<td><b>' + esc(m.component) + '</b></td>' +
              '<td>' + esc(m.problem) + '</td>' +
              '<td>' + esc(m.cause) + '</td>' +
              '<td>' + esc(m.action) + '</td>' +
              '<td><button class="link" data-rank="' + key + '">' + num(m.count) + ' OS ↗</button></td>' +
              '</tr>';
          }).join('') + '</tbody></table>'
        : emptyHTML;
    }
  }

  function renderStops() {
    const records = P.stopRecords(data, rows);
    const flaggedByPlant = P.flaggedStopOrders(data, f);
    const flaggedTotal = flaggedByPlant.reduce((sum, item) => sum + item.count, 0);
    const reliability = P.reliabilityByPlant(data, f);
    const assetReliability = P.reliabilityByAsset(data, f);
    const reasons = new Map(), years = new Map(), assets = new Map(), groups = new Map(), plants = new Set();
    for (const r of records) {
      const add = (map, key) => {
        if (!map.has(key)) map.set(key, { total: 0, confirmed: 0 });
        const item = map.get(key);
        item.total++;
        if (r.status === 'Confirmada') item.confirmed++;
      };
      add(reasons, r.reason);
      add(years, r.year);
      add(assets, r.asset);
      plants.add(r.tag);
      const key = [r.year, r.tag, r.asset, r.reason].join('\\u0000');
      if (!groups.has(key)) groups.set(key, { year: r.year, tag: r.tag, plant: r.plant, asset: r.asset, reason: r.reason, ids: new Set(), total: 0, confirmed: 0, durations: [] });
      const group = groups.get(key);
      group.ids.add(r.id);
      group.total++;
      if (r.status === 'Confirmada') group.confirmed++;
      if (r.durationDays != null) group.durations.push(r.durationDays);
    }
    const reasonList = [...reasons].sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0], 'pt-BR'));
    const yearList = [...years].sort((a, b) => b[0].localeCompare(a[0]));
    const assetList = [...assets].sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0], 'pt-BR')).slice(0, 10);
    const groupList = [...groups.values()].map(g => ({ ...g, ids: [...g.ids], avgDuration: g.durations.length ? g.durations.reduce((sum, value) => sum + value, 0) / g.durations.length : null }))
      .sort((a, b) => b.total - a.total || b.year.localeCompare(a.year) || a.plant.localeCompare(b.plant, 'pt-BR') || a.asset.localeCompare(b.asset, 'pt-BR'));

    const confirmedCount = records.filter(r => r.status === 'Confirmada').length;
    $('#stopKpis').innerHTML =
      kpi('Paradas identificadas', num(records.length), 'Ordens distintas no período', '#c43650') +
      kpi('Paradas confirmadas', num(confirmedCount), records.length ? pct(confirmedCount / records.length) + ' do total' : 'Sem registros', '#0f8a68') +
      kpi('Plantas atingidas', num(plants.size), 'Instalações com ocorrência', '#c2780c') +
      kpi('Ativos envolvidos', num(assets.size), 'Ativos com ocorrência', '#0027bd');

    $('#flaggedStopSummary').innerHTML =
      kpi('Ordens com Parada = X', num(flaggedTotal), 'Ordens distintas no período da nota', '#c43650') +
      kpi('Plantas com ocorrências', num(flaggedByPlant.length), 'TAG Planta distinta', '#c2780c');
    $('#flaggedStops').innerHTML = flaggedByPlant.length
      ? '<table><thead><tr><th>Planta</th><th>TAG Planta</th><th>Total</th><th>Concluídas</th><th>Em aberto</th><th>Canceladas</th><th>Outras situações</th></tr></thead><tbody>' +
        flaggedByPlant.map(item => {
          const key = rankEvidence.push({ name: item.plant + ' · Ordens com flag de parada', count: item.count, ids: item.ids }) - 1;
          return '<tr><td><b>' + esc(item.plant) + '</b></td><td>' + esc(item.tag) + '</td>' +
            '<td><button class="link" data-rank="' + key + '">' + num(item.count) + ' OS ↗</button></td>' +
            '<td>' + num(item.done) + '</td><td>' + num(item.open) + '</td>' +
            '<td>' + num(item.cancelled) + '</td><td>' + num(item.other) + '</td></tr>';
        }).join('') + '</tbody></table>'
      : emptyHTML;

    const reliabilityEvents = reliability.reduce((sum, item) => sum + item.events, 0);
    const reliabilityOpen = reliability.reduce((sum, item) => sum + item.open, 0);
    const duration = hours => {
      if (hours == null) return '—';
      return hours >= 24
        ? (hours / 24).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' dias (' + hours.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' h)'
        : hours.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' h';
    };
    $('#reliabilitySummary').innerHTML =
      kpi('Avarias no período', num(reliabilityEvents), 'Ordens ZNTP/ZNTE com início e Parada = X', '#c43650') +
      kpi('Avarias abertas', num(reliabilityOpen), 'Ordens com situação em aberto', '#c2780c');
    $('#reliabilityTable').innerHTML = reliability.length
      ? '<table><thead><tr><th>Planta</th><th>MTBF médio</th><th>Intervalos</th><th>MTTR médio</th><th>Disponibilidade estimada</th><th>Fechadas</th><th>Abertas</th></tr></thead><tbody>' +
        reliability.map(item => {
          return '<tr><td><b>' + esc(item.plant) + '</b><br><span class="small-note">' + esc(item.tag) + '</span></td>' +
            '<td>' + duration(item.mtbfHours) + '</td><td>' + num(item.intervals) + '</td>' +
            '<td>' + duration(item.mttrHours) + '</td><td><b>' + pct(item.availability) + '</b></td><td>' + num(item.closed) + '</td>' +
            '<td>' + num(item.open) + '</td></tr>';
        }).join('') + '</tbody></table>'
      : emptyHTML;

    const assetReliabilityEvents = assetReliability.reduce((sum, item) => sum + item.events, 0);
    const assetReliabilityOpen = assetReliability.reduce((sum, item) => sum + item.open, 0);
    $('#assetReliabilitySummary').innerHTML =
      kpi('Ativos com avaria registrada', num(assetReliability.length), 'Ordens ZNTP/ZNTE agrupadas pela TAG do ativo', '#0027bd') +
      kpi('Avarias abertas', num(assetReliabilityOpen), 'Ordens com situação em aberto', '#c2780c') +
      kpi('Avarias analisadas', num(assetReliabilityEvents), 'Ordens ZNTP/ZNTE distintas com início válido', '#c43650');
    $('#assetReliabilityTable').innerHTML = assetReliability.length
      ? '<table><thead><tr><th>Ativo</th><th>Equipamento</th><th>Planta</th><th>MTBF médio</th><th>Intervalos</th><th>MTTR médio</th><th>Disponibilidade</th><th>Fechadas</th><th>Abertas</th></tr></thead><tbody>' +
        assetReliability.map(item =>
          '<tr><td><b>' + esc(item.asset) + '</b></td><td>' + esc(item.equipment || 'Não informado') + '</td>' +
          '<td>' + esc(item.plant) + '<br><span class="small-note">' + esc(item.tag) + '</span></td>' +
          '<td>' + duration(item.mtbfHours) + '</td><td>' + num(item.intervals) + '</td>' +
          '<td>' + duration(item.mttrHours) + '</td><td><b>' + pct(item.availability) + '</b></td><td>' + num(item.closed) + '</td>' +
          '<td>' + num(item.open) + '</td></tr>'
        ).join('') + '</tbody></table>'
      : emptyHTML;

    const maxReason = reasonList[0]?.[1].total || 1;
    $('#stopReasons').innerHTML = reasonList.length
      ? '<div class="type-list">' + reasonList.map(([reason, item]) =>
          '<div class="type-row">' +
          '<div class="row-head"><b>' + esc(reason) + '</b><span>' + num(item.total) + ' OS</span></div>' +
          '<div class="row-sub"><span>' + num(item.confirmed) + ' confirmadas · ' + num(item.total - item.confirmed) + ' identificadas</span></div>' +
          '<span class="mini-track"><i style="width:' + (item.total / maxReason * 100) + '%;background:var(--red)"></i></span>' +
          '</div>'
        ).join('') + '</div>'
      : emptyHTML;

    $('#stopYears').innerHTML = yearList.length
      ? '<table><thead><tr><th>Ano</th><th>Paradas</th><th>Confirmadas</th></tr></thead><tbody>' +
        yearList.map(([year, item]) => '<tr><td><b>' + esc(year) + '</b></td><td>' + num(item.total) + '</td><td>' + num(item.confirmed) + '</td></tr>').join('') +
        '</tbody></table>'
      : emptyHTML;

    $('#stopAssets').innerHTML = assetList.length
      ? '<div class="type-list">' + assetList.map(([asset, item]) =>
          '<div class="type-row"><div class="row-head"><b>' + esc(asset) + '</b><span>' + num(item.total) + ' OS</span></div><div class="row-sub"><span>' + num(item.confirmed) + ' confirmadas</span></div><span class="mini-track"><i style="width:' + (item.total / (assetList[0][1].total || 1) * 100) + '%;background:var(--amber)"></i></span></div>'
        ).join('') + '</div>'
      : emptyHTML;

    $('#stopGroups').innerHTML = groupList.length
      ? '<table><thead><tr><th>Ano</th><th>Planta</th><th>Ativo</th><th>Motivo</th><th>Paradas</th><th>Confirmadas</th><th>Duração média</th></tr></thead><tbody>' +
        groupList.map(g => {
          const key = rankEvidence.push({ name: g.year + ' · ' + g.plant + ' · ' + g.asset + ' · ' + g.reason, count: g.total, ids: g.ids }) - 1;
          return '<tr>' +
            '<td><b>' + esc(g.year) + '</b></td>' +
            '<td>' + esc(g.plant) + '</td>' +
            '<td>' + esc(g.asset) + '</td>' +
            '<td>' + esc(g.reason) + '</td>' +
            '<td><button class="link" data-rank="' + key + '">' + num(g.total) + ' OS ↗</button></td>' +
            '<td>' + num(g.confirmed) + '</td>' +
            '<td>' + (g.avgDuration == null ? '—' : g.avgDuration.toFixed(1) + ' dias') + '</td>' +
            '</tr>';
        }).join('') + '</tbody></table>'
      : emptyHTML;
  }

  function renderDeadlines() {
    const cohort = P.filter(data, f, true), a = P.adherence(data, f), asOf = today(), t = P.timing(cohort, asOf);
    $('#deadlineCards').innerHTML =
      kpi('Aderência ao plano', pct(a.rate), num(a.done) + ' de ' + num(a.total) + ' ordens') +
      kpi('Executadas no prazo', num(t.onTime), 'Conclusão até o prazo programado', '#0f8a68') +
      kpi('Executadas fora do prazo', num(t.late), 'Conclusão após o prazo programado', '#c43650') +
      kpi('Prazo não avaliável', num(t.unassessed), 'Datas ou situação insuficientes', '#c2780c');

    const systemStats = data.systems
      .filter(s => matchesFilter(s.tag, f.tag))
      .map(s => {
        const sysFilter = { ...f, tag: s.tag };
        const adh = P.adherence(data, sysFilter);
        const tim = P.timing(P.filter(data, sysFilter, true), asOf);
        return { s, adh, tim, health: P.systemHealth(adh.rate, tim.overdue) };
      })
      .sort((x, y) => (y.adh.total - x.adh.total) || x.s.name.localeCompare(y.s.name, 'pt-BR'));

    $('#planTable').innerHTML = '<table><thead><tr><th>Instalação</th><th>Ordens do plano</th><th>Executadas</th><th>Aderência</th><th>Início no período</th><th>Abertas vencidas</th></tr></thead><tbody>' +
      systemStats.map(({ s, adh, tim, health }) =>
        '<tr>' +
        '<td><button class="link" data-system="' + esc(s.tag) + '">' + esc(s.name) + '</button></td>' +
        '<td>' + num(adh.total) + '</td>' +
        '<td>' + num(adh.done) + '</td>' +
        '<td><div class="adherence-cell"><strong>' + pct(adh.rate) + '</strong><span class="adherence-bar"><i class="' + health + '" style="width:' + (adh.rate == null ? 0 : adh.rate * 100) + '%"></i></span></div></td>' +
        '<td>' + num(adh.within) + '</td>' +
        '<td>' + (tim.overdue > 0 ? '<span class="badge critical">' + num(tim.overdue) + ' vencida(s)</span>' : '<span class="badge good">0</span>') + '</td>' +
        '</tr>'
      ).join('') + '</tbody></table>';

    $('#comparison').innerHTML = [
      ['Início anterior à referência', t.before],
      ['Início na referência', t.same],
      ['Início após a referência', t.after],
      ['Sem datas para comparação', t.withoutComparison],
      ['Ordens abertas com prazo vencido', t.overdue],
      ['Ordens abertas dentro do prazo', t.upcoming],
      ['Ordens não executadas', t.notdone]
    ].map(([n, v]) => '<div class="comparison-row"><span>' + n + '</span><b>' + num(v) + '</b></div>').join('');
  }

  function orderRows() {
    const q = $('#search').value.toLocaleLowerCase('pt-BR');
    const s = $('#statusFilter').value;
    const pf = $('#planFilter')?.value || '';
    return rows.filter(o =>
      (!s || P.status(o) === s) &&
      (!pf || (pf === 'planned' ? Boolean(P.text(o.plan)) : !P.text(o.plan))) &&
      (!q || [o.id, o.text, o.asset, o.equipment, o.tag, o.type].join(' ').toLocaleLowerCase('pt-BR').includes(q))
    ).sort((a, b) => (b.created || '').localeCompare(a.created || '') || b.id.localeCompare(a.id));
  }

  function table(list) {
    if (!list.length) return emptyHTML;
    return '<table><thead><tr><th>Ordem</th><th>Descrição</th><th>Classe</th><th>Instalação / ativo</th><th>Referência</th><th>Início real</th><th>Situação</th></tr></thead><tbody>' +
      list.map(o =>
        '<tr>' +
        '<td><button class="link" data-order="' + esc(o.id) + '">' + esc(o.id) + '</button></td>' +
        '<td class="description">' + esc(o.text) + '</td>' +
        '<td>' + esc(P.typeLabel(o.type)) + '</td>' +
        '<td>' + esc(o.asset || o.tag) + '</td>' +
        '<td>' + fmt(o.date) + '</td>' +
        '<td>' + fmt(o.start) + '</td>' +
        '<td><span class="badge ' + P.status(o) + '">' + P.labels[P.status(o)] + '</span></td>' +
        '</tr>'
      ).join('') + '</tbody></table>';
  }

  function renderOrders() {
    const all = orderRows(), pages = Math.max(1, Math.ceil(all.length / 30));
    pageNo = Math.max(1, Math.min(pageNo, pages));
    $('#ordersTable').innerHTML = table(all.slice((pageNo - 1) * 30, pageNo * 30));
    $('#pageInfo').textContent = 'Página ' + pageNo + ' de ' + pages + ' · ' + num(all.length) + ' ordens';
    $('#prevPage').disabled = pageNo === 1;
    $('#nextPage').disabled = pageNo === pages;
  }

  function openDetail(html, eyebrow) {
    $('#modalEyebrow').textContent = eyebrow;
    $('#detailBody').innerHTML = html;
    if (!$('#detail').open) $('#detail').showModal();
  }

  function showSystem(tag) {
    const s = data.systems.find(s => s.tag === tag);
    if (!s) return;
    modalMode = 'system';
    const filter = { ...f, tag }, source = P.filter(data, filter), n = P.stats(source), a = P.adherence(data, filter);
    const blocks = [
      ['component', 'Itens que mais falharam'],
      ['cause', 'Causas registradas'],
      ['action', 'Medidas realizadas']
    ].map(([k, title]) => '<div class="detail-block"><h3>' + title + '</h3>' + rankHTML(ranks(k, source)) + '</div>').join('');
    const photo = /^https:\/\//i.test(s.photo) ? '<p><a href="' + esc(s.photo) + '" target="_blank" rel="noopener noreferrer">Abrir imagem cadastrada ↗</a></p>' : '';
    openDetail(
      '<div class="detail-heading"><h2>' + esc(s.name) + '</h2><p>' + esc(s.tag) + ' · ' + esc(s.address || s.district || 'Endereço não informado') + '</p></div>' +
      '<div class="detail-kpis"><div><small>Ordens executadas</small><b>' + num(n.done) + '</b></div><div><small>Aderência ao plano</small><b>' + pct(a.rate) + '</b></div><div><small>Ordens no período</small><b>' + num(n.total) + '</b></div></div>' +
      '<dl class="order-info">' +
      field('Situação operacional', s.status) +
      field('Criticidade', s.critical) +
      field('Tipo de manutenção', P.typeLabel(s.type)) +
      field('Latitude', s.lat) +
      field('Longitude', s.lng) +
      field('Bairro', s.district) +
      '</dl>' + photo +
      '<h3 class="detail-section">Itens, Causas e Medidas</h3><div class="detail-grid">' + blocks + '</div>' +
      '<h3 class="detail-section">Ordens mais recentes no período</h3><div class="table-wrap">' + table([...source].sort((a, b) => (b.created || '').localeCompare(a.created || '')).slice(0, 50)) + '</div>',
      'INSTALAÇÃO · ÁGUAS DE TERESINA'
    );
  }

  function showOrder(id) {
    const o = data.orders.find(o => o.id === id);
    if (!o) return;
    modalMode = 'order';
    const items = data.items.filter(i => i.order === id), actions = data.actions.filter(i => i.order === id), s = data.systems.find(s => s.tag === o.tag);
    openDetail(
      '<div class="detail-heading"><h2>Ordem ' + esc(o.id) + '</h2><p>' + esc(o.text) + '</p></div>' +
      '<span class="badge ' + P.status(o) + '">' + P.labels[P.status(o)] + '</span>' +
      '<dl class="order-info">' +
      field('Instalação', s?.name || o.tag) +
      field('Ativo', o.asset) +
      field('Equipamento', o.equipment) +
      field('Data de entrada', fmt(o.created)) +
      field('Data de referência', fmt(o.date)) +
      field('Início real', fmt(o.start)) +
      field('Prazo programado', fmt(o.due)) +
      field('Conclusão real', fmt(o.finished)) +
      field('Plano de manutenção', o.plan) +
      field('Tipo de manutenção', P.typeLabel(o.type)) +
      field('Prioridade', o.priority) +
      field('Nota', o.note) +
      '</dl>' +
      '<h3 class="detail-section">Itens e causas registrados</h3>' +
      (items.length
        ? '<div class="detail-grid">' + items.map(i => '<div class="detail-block"><h3>' + esc(i.component || 'Item não informado') + '</h3><p><b>Problema:</b> ' + esc(i.problem || 'Não informado') + '</p><p><b>Causa registrada:</b> ' + esc(i.cause || 'Não informada') + '</p></div>').join('') + '</div>'
        : emptyHTML) +
      '<h3 class="detail-section">Medidas realizadas</h3>' +
      (actions.length
        ? actions.map(i => '<div class="detail-block" style="margin:8px 0">' + esc(i.action || 'Não informada') + '</div>').join('')
        : emptyHTML),
      'EVIDÊNCIAS DA MANUTENÇÃO'
    );
  }

  function showEvidence(index) {
    const r = rankEvidence[index];
    if (!r) return;
    const ids = new Set(r.ids), list = data.orders.filter(o => ids.has(o.id));
    const stopNotes = r.name.endsWith('Ordens com flag de parada')
      ? (data.stoppageNotes || []).filter(note => ids.has(note.order))
      : [];
    modalMode = 'evidence';
    openDetail(
      '<div class="detail-heading"><h2>' + esc(r.name) + '</h2><p>' + num(r.count) + ' ordens distintas nos filtros selecionados.</p></div>' +
      (stopNotes.length
        ? '<div class="table-wrap"><table><thead><tr><th>Ordem</th><th>Data da nota</th><th>Nota</th><th>Descrição</th></tr></thead><tbody>' +
          stopNotes.map(note => '<tr><td>' + esc(note.order) + '</td><td>' + esc(fmt(note.date)) + '</td><td>' + esc(note.note) + '</td><td>' + esc(note.description) + '</td></tr>').join('') +
          '</tbody></table></div>'
        : '<div class="table-wrap">' + table(list) + '</div>'),
      'ICM & ENGENHARIA · ORDENS RELACIONADAS'
    );
  }

  function renderMap() {
    if (!window.L) {
      $('#map').innerHTML = '<div class="no-data">Não foi possível carregar o mapa. Consulte as instalações na lista ao lado.</div>';
      return;
    }
    if (!map) {
      map = L.map('map', { scrollWheelZoom: false }).setView([-5.09, -42.8], 12);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).on('tileerror', () => $('#mapWarning').hidden = false).addTo(map);
      markers = L.layerGroup().addTo(map);
    }
    markers.clearLayers();
    const systems = data.systems.filter(s => matchesFilter(s.tag, f.tag)), coords = [], asOf = today();
    systems.forEach((s, i) => {
      if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) return;
      coords.push([s.lat, s.lng]);
      const sysFilter = { ...f, tag: s.tag };
      const source = P.filter(data, sysFilter), n = P.stats(source), a = P.adherence(data, sysFilter), tim = P.timing(P.filter(data, sysFilter, true), asOf);
      const health = P.systemHealth(a.rate, tim.overdue);
      const top = ranks('component', source)[0], cause = ranks('cause', source)[0], act = ranks('action', source)[0];
      const marker = L.marker([s.lat, s.lng], {
        icon: L.divIcon({ className: '', html: '<div class="map-pin ' + health + '"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }),
        title: s.name
      }).addTo(markers);
      marker.bindTooltip(esc(s.name), { permanent: true, direction: i % 2 ? 'right' : 'left', offset: [i % 2 ? 11 : -11, (i % 3 - 1) * 12], className: 'point-label' });
      const html =
        '<div class="hover-title"><b>' + esc(s.name) + '</b></div>' +
        '<small>' + esc(s.status || 'Situação não informada') + (s.critical ? ' · Criticidade: ' + esc(s.critical) : '') + '</small>' +
        '<div class="hover-grid"><div><small>Ordens executadas</small><b>' + num(n.done) + '</b></div><div><small>Aderência ao plano</small><b>' + pct(a.rate) + '</b></div></div>' +
        '<div class="hover-footer"><b>Item:</b> ' + esc(top?.name || 'Sem registro') + '<br><b>Causa:</b> ' + esc(cause?.name || 'Sem registro') + '<br><b>Medida:</b> ' + esc(act?.name || 'Sem registro') + '</div>' +
        '<div class="hover-footer">Clique no ponto para abrir a instalação.</div>';
      marker.bindPopup(html, { closeButton: false, autoPan: false });
      marker.on('mouseover', () => marker.openPopup());
      marker.on('mouseout', () => marker.closePopup());
      marker.on('click', () => showSystem(s.tag));
    });
    fitBounds = coords.length ? L.latLngBounds(coords) : null;
    setTimeout(() => {
      map.invalidateSize();
      if (fitBounds) map.fitBounds(fitBounds, { padding: [70, 60], maxZoom: 14 });
    }, 50);
  }

  async function loadData() {
    if (loading) return;
    loading = true;
    $('#refreshBtn').disabled = true;
    try {
      const { data: row, error } = await db.from('pcm_teresina_dataset').select('payload,revision,updated_at').eq('id', 'principal').maybeSingle();
      if (error) throw error;
      if (!row) throw Error('Sua conta não tem acesso a este painel.');
      revision = row.revision;
      data = row.payload;
      options();
      render();
      $('#loadStatus').textContent = data ? 'Base atualizada em ' + new Date(row.updated_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Nenhum conjunto importado';
      $('#footerDate').textContent = data ? 'Revisão ' + revision + ' · ' + num(data.orders.length) + ' ordens na base' : 'Aguardando primeira importação';
    } finally {
      loading = false;
      $('#refreshBtn').disabled = false;
    }
  }

  async function enter(session) {
    if (!session) return;
    user = session.user;
    const { data: member, error } = await db.from('pcm_teresina_members').select('role').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    if (!member) throw Error('Esta conta ainda não está autorizada no painel de Teresina.');
    role = member.role;
    $('#access').hidden = true;
    $('#shell').hidden = false;
    // A publicação da base acontece na área administrativa separada.
    // Mantemos os controles antigos ocultos para não expor importação no painel operacional.
    $('#importBtn').hidden = true;
    $('#emptyImport').hidden = true;
    if ($('#userChip')) {
      $('#userChip').hidden = false;
      $('#userRoleBadge').textContent = role === 'admin' ? 'ADMIN' : 'CONSULTA';
      $('#userEmailLabel').textContent = user.email || '';
    }
    await loadData();
  }

  function lock() {
    user = null;
    data = null;
    pending = null;
    role = '';
    rows = [];
    $('#access').hidden = false;
    $('#shell').hidden = true;
    if ($('#userChip')) $('#userChip').hidden = true;
    $('#detail').close();
    $('#importDialog').close();
    $('#detailBody').innerHTML = '';
    if (markers) markers.clearLayers();
    loginMessage('');
  }

  function renderFileChecklist(files) {
    const el = $('#fileChecklist');
    if (!el) return;
    if (!files || !files.length) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = files.map(file => {
      const sizeMb = (file.size / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
      const valid = /\.xlsx$/i.test(file.name) && file.size <= 25 * 1024 * 1024;
      return '<div class="file-check-item ' + (valid ? 'ready' : '') + '">' +
        '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(file.name) + '</span>' +
        '<b>' + sizeMb + ' MB</b>' +
        '</div>';
    }).join('');
  }

  function openImport() {
    if (role !== 'admin') return notify('Seu acesso permite apenas consulta.');
    pending = null;
    selectedFiles = [];
    $('#files').value = '';
    renderFileChecklist([]);
    $('#importReview').innerHTML = '';
    $('#importMessage').textContent = '';
    $('#saveImport').hidden = true;
    $('#validateImport').hidden = false;
    $('#importDialog').showModal();
  }

  function importMessage(msg, error = false) {
    $('#importMessage').textContent = msg;
    $('#importMessage').classList.toggle('error', error);
  }

  async function validateImport() {
    pending = null;
    $('#saveImport').hidden = true;
    const files = selectedFiles.length ? selectedFiles : [...$('#files').files];
    if (files.length !== 5) return importMessage('Selecione exatamente cinco arquivos: sistemas, ordens, itens, medidas e notas de parada.', true);
    if (files.some(f => !/\.xlsx$/i.test(f.name) || f.size > 25 * 1024 * 1024)) return importMessage('Use arquivos .xlsx de até 25 MB cada.', true);
    $('#validateImport').disabled = true;
    $('#files').disabled = true;
    $('#closeImport').disabled = true;
    pendingRevision = revision;
    try {
      importMessage('Preparando leitura das planilhas…');
      const buffers = await Promise.all(files.map(async file => ({ name: file.name, buffer: await file.arrayBuffer() })));
      const result = await new Promise((resolve, reject) => {
        worker = new Worker('import-worker.js');
        const timeout = setTimeout(() => {
          worker.terminate();
          reject(Error('A leitura excedeu três minutos. Reduza o tamanho do conjunto.'));
        }, 180000);
        worker.onmessage = ({ data: r }) => {
          if (r.progress) return importMessage(r.progress);
          clearTimeout(timeout);
          worker.terminate();
          worker = null;
          if (r.error) reject(Error(r.error));
          else resolve(r.result);
        };
        worker.onerror = () => {
          clearTimeout(timeout);
          worker.terminate();
          worker = null;
          reject(Error('Falha ao ler as planilhas. Verifique sua conexão e o formato dos arquivos.'));
        };
        worker.postMessage(buffers, buffers.map(f => f.buffer));
      });
      if (new Blob([JSON.stringify(result)]).size > 19 * 1024 * 1024) throw Error('O conjunto processado excede o limite de 19 MB. Reduza o intervalo da exportação.');
      pending = result;
      $('#importReview').innerHTML =
        '<div class="detail-kpis"><div><small>Instalações</small><b>' + num(result.systems.length) + '</b></div><div><small>Ordens válidas</small><b>' + num(result.orders.length) + '</b></div><div><small>Itens / medidas</small><b>' + num(result.items.length) + ' / ' + num(result.actions.length) + '</b></div><div><small>Ordens com Parada = X</small><b>' + num(result.meta.stoppageOrders) + '</b></div></div>' +
        '<p class="small-note">' + num(result.meta.excluded) + ' ordens fora do escopo; ' + num(result.meta.missingReference) + ' sem data de referência; ' + num(result.meta.excludedStoppageNotes) + ' notas sem Ordem válida ou fora das instalações; ' + num(result.meta.missingStoppageNoteDate) + ' sem Data da nota. A base atual será substituída integralmente após salvar.</p>';
      importMessage('Validação concluída. Confira os totais e salve a atualização.');
      $('#saveImport').hidden = false;
    } catch (e) {
      importMessage(errorText(e), true);
    } finally {
      $('#validateImport').disabled = false;
      $('#files').disabled = false;
      $('#closeImport').disabled = false;
    }
  }

  async function saveImport() {
    if (!pending || role !== 'admin') return;
    $('#saveImport').disabled = true;
    $('#closeImport').disabled = true;
    $('#validateImport').disabled = true;
    $('#files').disabled = true;
    try {
      importMessage('Salvando a base compartilhada…');
      const { data: saved, error } = await db.from('pcm_teresina_dataset').update({ payload: pending }).eq('id', 'principal').eq('revision', pendingRevision).select('revision,updated_at').maybeSingle();
      if (error) throw error;
      if (!saved) throw Error('A base foi atualizada por outra sessão. Feche esta janela, atualize o painel e valide novamente.');
      pending = null;
      $('#saveImport').hidden = true;
      await loadData();
      $('#importDialog').close();
      notify('Base salva. Mapa e indicadores atualizados.');
    } catch (e) {
      importMessage(errorText(e), true);
    } finally {
      $('#saveImport').disabled = false;
      $('#closeImport').disabled = false;
      $('#validateImport').disabled = false;
      $('#files').disabled = false;
    }
  }

  function downloadCsvFile(filename, lines) {
    const url = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const safeCsvCell = v => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };

  function exportCSV() {
    const list = orderRows();
    const fields = [['Ordem', 'id'], ['Descrição', 'text'], ['Tipo de manutenção', 'typeLabel'], ['Prioridade', 'priority'], ['Instalação', 'tag'], ['Ativo', 'asset'], ['Entrada', 'created'], ['Referência', 'date'], ['Início real', 'start'], ['Plano', 'plan'], ['Prazo programado', 'due'], ['Conclusão real', 'finished']];
    const lines = [
      fields.map(v => v[0]).concat('Situação').map(safeCsvCell).join(';'),
      ...list.map(o => fields.map(v => v[1] === 'typeLabel' ? P.typeLabel(o.type) : o[v[1]]).concat(P.labels[P.status(o)]).map(safeCsvCell).join(';'))
    ];
    downloadCsvFile('Ordens_Aguas_de_Teresina_' + today() + '.csv', lines);
  }

  function exportIcmCSV() {
    if (!data) return;
    const matrix = P.icmMatrix(data, rows);
    const lines = [
      ['Item (Componente)', 'Problema', 'Causa Registrada', 'Medida Realizada', 'Ordens Executadas Distintas'].map(safeCsvCell).join(';'),
      ...matrix.map(m => [m.component, m.problem, m.cause, m.action, m.count].map(safeCsvCell).join(';'))
    ];
    downloadCsvFile('ICM_Matriz_Aguas_de_Teresina_' + today() + '.csv', lines);
  }

  function printOverviewReport() {
    if (!data) return;
    const scopeRows = rows;
    const stats = P.stats(scopeRows);
    const adherence = P.adherence(data, f);
    const asOf = today();
    const systems = data.systems.filter(s => matchesFilter(s.tag, f.tag)).map(system => {
      const source = scopeRows.filter(order => order.tag === system.tag);
      const plan = P.adherence(data, { ...f, tag: system.tag });
      const timing = P.timing(P.filter(data, { ...f, tag: system.tag }, true), asOf);
      return { system, stats: P.stats(source), plan, timing };
    }).sort((a, b) => b.stats.total - a.stats.total || a.system.name.localeCompare(b.system.name, 'pt-BR'));
    const monthly = new Map();
    for (const order of scopeRows) {
      const month = (order.created || '').slice(0, 7);
      if (!month) continue;
      if (!monthly.has(month)) monthly.set(month, { total: 0, done: 0 });
      const item = monthly.get(month);
      item.total++;
      if (P.status(order) === 'done') item.done++;
    }
    const typeList = P.byType(scopeRows);
    const assetList = P.topAssets(scopeRows).slice(0, 10);
    const generated = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
    const period = fmt(f.from) + ' a ' + fmt(f.to);
    const systemRows = systems.map(({ system, stats: item, plan, timing }) =>
      '<tr><td><b>' + esc(system.name) + '</b><br><span class="muted">' + esc(system.tag) + '</span></td><td>' + num(item.total) + '</td><td>' + num(item.done) + '</td><td>' + num(item.open) + '</td><td>' + pct(plan.rate) + '</td><td>' + (timing.overdue ? num(timing.overdue) : '0') + '</td></tr>'
    ).join('');
    const monthRows = [...monthly].sort((a, b) => a[0].localeCompare(b[0])).map(([month, item]) =>
      '<tr><td>' + esc(month.slice(5) + '/' + month.slice(0, 4)) + '</td><td>' + num(item.total) + '</td><td>' + num(item.done) + '</td><td>' + pct(item.total ? item.done / item.total : null) + '</td></tr>'
    ).join('');
    const typeRows = typeList.map(item =>
      '<tr><td>' + esc(item.label) + '</td><td>' + num(item.total) + '</td><td>' + num(item.done) + '</td><td>' + pct(item.rate) + '</td></tr>'
    ).join('');
    const assetRows = assetList.map(item =>
      '<tr><td>' + esc(item.asset) + '</td><td>' + esc(item.equipment) + '</td><td>' + esc(item.tag) + '</td><td>' + num(item.total) + '</td><td>' + num(item.corrective) + '</td></tr>'
    ).join('');
    const report = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Visão dos Sistemas · Águas de Teresina</title><style>' +
      '@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#10234f;font-size:9px;line-height:1.35;margin:0}header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0027bd;padding-bottom:9px;margin-bottom:12px}h1{font-size:21px;margin:0 0 3px;color:#0027bd}h2{font-size:13px;margin:14px 0 6px;color:#0027bd}.eyebrow{font-size:8px;letter-spacing:1.1px;text-transform:uppercase;color:#087f99;font-weight:700}.muted{color:#657594;font-size:8px}.logo{max-height:25px;max-width:155px}.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;margin:10px 0 13px}.kpi{border:1px solid #d7e1f2;border-radius:6px;padding:7px;background:#f7f9fd}.kpi span{display:block;color:#536585;font-size:8px;text-transform:uppercase}.kpi strong{display:block;font-size:17px;color:#0027bd;margin-top:3px}.columns{display:grid;grid-template-columns:1.25fr 1fr;gap:12px}.box{border:1px solid #d7e1f2;border-radius:6px;padding:9px}.box h2{margin-top:0}table{width:100%;border-collapse:collapse;margin-top:5px;font-size:8px}th{background:#eef3ff;color:#536585;text-align:left;text-transform:uppercase;font-size:7px;padding:5px}td{border-bottom:1px solid #e5eaf2;padding:5px;vertical-align:top}footer{border-top:1px solid #d7e1f2;margin-top:14px;padding-top:7px;color:#536585;font-size:8px}@media print{thead{display:table-header-group}tr{break-inside:avoid}.box{break-inside:avoid}}' +
      '</style></head><body><header><div><div class="eyebrow">PCM · VISÃO EXECUTIVA</div><h1>Visão dos sistemas</h1><div class="muted">Águas de Teresina · Entrada: ' + esc(period) + '</div><div class="muted">Gerado em ' + esc(generated) + '</div></div><img class="logo" src="../aegea-assets/aguas-de-teresina-azul.png" alt="Águas de Teresina"></header>' +
      '<div class="kpis"><div class="kpi"><span>Ordens no período</span><strong>' + num(stats.total) + '</strong></div><div class="kpi"><span>Executadas</span><strong>' + num(stats.done) + '</strong></div><div class="kpi"><span>Em aberto</span><strong>' + num(stats.open) + '</strong></div><div class="kpi"><span>Não executadas</span><strong>' + num(stats.notdone) + '</strong></div><div class="kpi"><span>Aderência ao plano</span><strong>' + pct(adherence.rate) + '</strong></div></div>' +
      '<section class="box"><h2>Desempenho por instalação</h2><table><thead><tr><th>Instalação</th><th>Ordens</th><th>Executadas</th><th>Em aberto</th><th>Aderência</th><th>Vencidas</th></tr></thead><tbody>' + (systemRows || '<tr><td colspan="6">Sem instalações no recorte.</td></tr>') + '</tbody></table></section>' +
      '<div class="columns"><section class="box"><h2>Evolução mensal</h2><table><thead><tr><th>Mês</th><th>Ordens</th><th>Executadas</th><th>Execução</th></tr></thead><tbody>' + (monthRows || '<tr><td colspan="4">Sem registros.</td></tr>') + '</tbody></table></section><section class="box"><h2>Distribuição por tipo de manutenção</h2><table><thead><tr><th>Tipo</th><th>Ordens</th><th>Executadas</th><th>Execução</th></tr></thead><tbody>' + (typeRows || '<tr><td colspan="4">Sem registros.</td></tr>') + '</tbody></table></section></div>' +
      '<h2>Ativos com maior volume de intervenções</h2><table><thead><tr><th>Ativo</th><th>Equipamento</th><th>Instalação</th><th>Total</th><th>Corretivas</th></tr></thead><tbody>' + (assetRows || '<tr><td colspan="5">Sem registros.</td></tr>') + '</tbody></table>' +
      '<footer>Relatório gerado a partir dos filtros ativos do painel. A aderência considera ordens do plano no período; a execução mensal usa a data de entrada.</footer></body></html>';
    const popup = window.open('', '_blank');
    if (!popup) {
      notify('O navegador bloqueou a janela do relatório. Permita pop-ups para gerar o PDF.');
      return;
    }
    popup.document.write(report);
    popup.document.close();
    popup.focus();
    setTimeout(() => {
      popup.print();
      popup.onafterprint = () => popup.close();
    }, 300);
  }

  function printStopsReport() {
    if (!data) return;
    const records = P.stopRecords(data, rows);
    const reasons = new Map(), assets = new Map(), groups = new Map();
    for (const record of records) {
      reasons.set(record.reason, (reasons.get(record.reason) || 0) + 1);
      assets.set(record.asset, (assets.get(record.asset) || 0) + 1);
      const key = [record.year, record.tag, record.asset, record.reason].join('\\u0000');
      if (!groups.has(key)) groups.set(key, { year: record.year, plant: record.plant, asset: record.asset, reason: record.reason, total: 0, confirmed: 0 });
      const group = groups.get(key);
      group.total++;
      if (record.status === 'Confirmada') group.confirmed++;
    }
    const reasonList = [...reasons].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'));
    const assetList = [...assets].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')).slice(0, 10);
    const groupList = [...groups.values()].sort((a, b) => b.total - a.total || a.plant.localeCompare(b.plant, 'pt-BR'));
    const confirmed = records.filter(record => record.status === 'Confirmada').length;
    const generated = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date());
    const period = fmt(f.from) + ' a ' + fmt(f.to);
    const rowsHtml = groupList.map(group => '<tr><td>' + esc(group.year) + '</td><td>' + esc(group.plant) + '</td><td>' + esc(group.asset) + '</td><td>' + esc(group.reason) + '</td><td>' + num(group.total) + '</td><td>' + num(group.confirmed) + '</td></tr>').join('');
    const reasonHtml = reasonList.map(([reason, count]) => '<li><span>' + esc(reason) + '</span><b>' + num(count) + '</b></li>').join('');
    const assetHtml = assetList.map(([asset, count]) => '<li><span>' + esc(asset) + '</span><b>' + num(count) + '</b></li>').join('');
    const report = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de Paradas · Águas de Teresina</title><style>' +
      '@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#10234f;font-size:10px;line-height:1.35;margin:0}header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0027bd;padding-bottom:10px;margin-bottom:14px}h1{font-size:22px;margin:0 0 3px;color:#0027bd}h2{font-size:14px;margin:18px 0 8px;color:#0027bd}.eyebrow{font-size:9px;letter-spacing:1.2px;text-transform:uppercase;color:#087f99;font-weight:700}.meta{color:#536585;font-size:9px}.logo{max-height:26px;max-width:160px}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:12px 0 16px}.kpi{border:1px solid #d7e1f2;border-radius:6px;padding:8px;background:#f7f9fd}.kpi span{display:block;color:#536585;font-size:8px;text-transform:uppercase}.kpi strong{display:block;font-size:18px;color:#0027bd;margin-top:3px}.columns{display:grid;grid-template-columns:1fr 1fr;gap:14px}.box{border:1px solid #d7e1f2;border-radius:6px;padding:10px}.box h2{margin-top:0}.list{padding:0;margin:0;list-style:none}.list li{display:flex;justify-content:space-between;border-bottom:1px solid #edf1f7;padding:5px 0}.list li:last-child{border-bottom:0}table{width:100%;border-collapse:collapse;margin-top:6px;font-size:9px}th{background:#eef3ff;color:#536585;text-align:left;text-transform:uppercase;font-size:8px;padding:6px}td{border-bottom:1px solid #e5eaf2;padding:6px;vertical-align:top}footer{border-top:1px solid #d7e1f2;margin-top:18px;padding-top:8px;color:#536585;font-size:8px}@media print{thead{display:table-header-group}tr{break-inside:avoid}.box{break-inside:avoid}}' +
      '</style></head><body><header><div><div class="eyebrow">PCM · CONFIABILIDADE OPERACIONAL</div><h1>Relatório de Paradas</h1><div class="meta">Águas de Teresina · Período de entrada: ' + esc(period) + '</div><div class="meta">Gerado em ' + esc(generated) + '</div></div><img class="logo" src="../aegea-assets/aguas-de-teresina-azul.png" alt="Águas de Teresina"></header>' +
      '<div class="kpis"><div class="kpi"><span>Paradas identificadas</span><strong>' + num(records.length) + '</strong></div><div class="kpi"><span>Paradas confirmadas</span><strong>' + num(confirmed) + '</strong></div><div class="kpi"><span>Plantas atingidas</span><strong>' + num(new Set(records.map(record => record.tag)).size) + '</strong></div><div class="kpi"><span>Ativos envolvidos</span><strong>' + num(new Set(records.map(record => record.asset)).size) + '</strong></div></div>' +
      '<div class="columns"><section class="box"><h2>Pareto de motivos</h2><ul class="list">' + (reasonHtml || '<li>Sem registros</li>') + '</ul></section><section class="box"><h2>Pareto de ativos</h2><ul class="list">' + (assetHtml || '<li>Sem registros</li>') + '</ul></section></div>' +
      '<h2>Detalhamento por ano, planta, ativo e motivo</h2><table><thead><tr><th>Ano</th><th>Planta</th><th>Ativo</th><th>Motivo</th><th>Paradas</th><th>Confirmadas</th></tr></thead><tbody>' + (rowsHtml || '<tr><td colspan="6">Sem registros para os filtros selecionados.</td></tr>') + '</tbody></table>' +
      '<footer>Critério: ocorrência identificada por texto, problema ou causa. Confirmação e duração dependem dos campos opcionais da planilha. Este relatório considera ordens distintas e os filtros ativos do painel.</footer></body></html>';
    const popup = window.open('', '_blank');
    if (!popup) {
      notify('O navegador bloqueou a janela do relatório. Permita pop-ups para gerar o PDF.');
      return;
    }
    popup.document.write(report);
    popup.document.close();
    popup.focus();
    setTimeout(() => {
      popup.print();
      popup.onafterprint = () => popup.close();
    }, 300);
  }

  function exportStopsCSV() {
    if (!data) return;
    const records = P.stopRecords(data, rows);
    const lines = [
      ['Ano', 'Data de entrada', 'Planta', 'Ativo', 'Motivo', 'Status', 'Duração (dias)', 'Impacto', 'Ordem', 'Descrição'].map(safeCsvCell).join(';'),
      ...records.map(r => [r.year, r.created, r.plant, r.asset, r.reason, r.status, r.durationDays == null ? '' : r.durationDays, r.impact, r.id, r.text].map(safeCsvCell).join(';'))
    ];
    downloadCsvFile('Paradas_Aguas_de_Teresina_' + today() + '.csv', lines);
  }

  function exportFlaggedStopsCSV() {
    if (!data) return;
    const grouped = P.flaggedStopOrders(data, f);
    const lines = [
      ['TAG Planta', 'Planta', 'Ordens distintas com Parada = X'].map(safeCsvCell).join(';'),
      ...grouped.map(item => [item.tag, item.plant, item.count].map(safeCsvCell).join(';'))
    ];
    downloadCsvFile('Ordens_com_Flag_de_Parada_Aguas_de_Teresina_' + today() + '.csv', lines);
  }

  function exportDeadlinesCSV() {
    if (!data) return;
    const asOf = today();
    const lines = [
      ['TAG Instalação', 'Nome da Instalação', 'Ordens do Plano', 'Executadas', 'Aderência (%)', 'Início no Período', 'Abertas Vencidas'].map(safeCsvCell).join(';'),
      ...data.systems.filter(s => matchesFilter(s.tag, f.tag)).map(s => {
        const sysFilter = { ...f, tag: s.tag };
        const adh = P.adherence(data, sysFilter);
        const tim = P.timing(P.filter(data, sysFilter, true), asOf);
        return [s.tag, s.name, adh.total, adh.done, adh.rate == null ? '' : (adh.rate * 100).toFixed(1), adh.within, tim.overdue].map(safeCsvCell).join(';');
      })
    ];
    downloadCsvFile('Aderencia_Instalacoes_Aguas_de_Teresina_' + today() + '.csv', lines);
  }

  function exportBadActorsCSV() {
    if (!data) return;
    const actors = P.badActors(rows);
    const sysNameByTag = new Map((data.systems || []).map(s => [s.tag, s.name]));
    const lines = [
      ['TAG Ativo', 'Equipamento', 'TAG Instalação', 'Instalação', 'Total OS', 'Ordens Executadas', 'Corretivas', 'Emergenciais', 'Retrabalho (<30 dias)', 'MTBF Estimado (dias)'].map(safeCsvCell).join(';'),
      ...actors.map(a => [a.asset, a.equipment, a.tag, sysNameByTag.get(a.tag) || a.tag, a.total, a.done, a.corrective, a.emergency, a.rework30d, a.mtbfDays == null ? '' : Math.round(a.mtbfDays)].map(safeCsvCell).join(';'))
    ];
    downloadCsvFile('Bad_Actors_MTBF_Aguas_de_Teresina_' + today() + '.csv', lines);
  }

  function applyPeriodPreset(preset) {
    const now = today();
    const year = now.slice(0, 4);
    const month = now.slice(0, 7);
    if (preset === 'month') {
      f.from = month + '-01';
      f.to = now;
    } else if (preset === '90d') {
      const d = new Date(now + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - 90);
      f.from = d.toISOString().slice(0, 10);
      f.to = now;
    } else if (preset === 'year') {
      f.from = year + '-01-01';
      f.to = year + '-12-31';
    } else if (preset === 'all') {
      const dates = (data?.orders || []).map(o => o.created).filter(P.validDate).sort();
      f.from = dates[0] || '2020-01-01';
      f.to = dates[dates.length - 1] || year + '-12-31';
    }
    $('#from').value = f.from;
    $('#to').value = f.to;
    $$('.preset-btn').forEach(b => b.classList.toggle('active', b.dataset.preset === preset));
    if (data) render();
  }

  function rules() {
    openDetail(
      '<div class="detail-heading"><h2>Critérios dos indicadores e Engenharia de Manutenção</h2><p>Regras aplicadas a todos os sistemas, filtros e diagnósticos executivos (NBR 5462 / SMRP).</p></div>' +
      '<div class="explanation">' +
      '<h3>Ordens executadas</h3><p>Consideramos executadas as ordens com encerramento técnico confirmado. Registros de não execução têm prioridade quando as situações coexistem; encerramento administrativo isolado não comprova a execução.</p>' +
      '<h3>Aderência ao plano</h3><p>Ordens executadas do plano divididas pelas ordens existentes com plano preenchido e referência no período. Ordens abertas e não executadas permanecem no denominador.</p>' +
      '<h3>Mix Proativo × Reativo (Benchmark SMRP)</h3><p>Proativa soma manutenção preventiva, preditiva e engenharia. Reativa agrupa corretivas emergenciais, corretivas programadas, controle operacional e serviços. A referência internacional SMRP é ≥ 80% de manutenção proativa.</p>' +
      '<h3>Índice de Paliativos ("Efeito Reset")</h3><p>Proporção de ordens com medida apontada cujo encerramento foi apenas Rearme, Reset ou Ajuste de Parâmetros. Valores elevados indicam necessidade de investigação de qualidade de energia, proteção elétrica ou automação.</p>' +
      '<h3>Bad Actors, Retrabalho (&lt; 30 dias) e MTBF</h3><p>Equipamentos são ranqueados pelo volume de intervenções corretivas. Falhas corretivas sucessivas no mesmo ativo em intervalo ≤ 30 dias são contabilizadas como retrabalho/reincidência prematura. O MTBF estimado calcula a média de dias entre intervenções corretivas consecutivas do ativo.</p>' +
      '<h3>Itens, Causas e Medidas (ICM)</h3><p>Ordens executadas distintas por item, causa ou medida. Registros de falha inexistente e de não executar são excluídos dos rankings. As causas refletem o apontamento da ordem; a confirmação de causa raiz requer RCA.</p>' +
      '</div>',
      'METODOLOGIA · PCM AEGEA'
    );
  }

  function bind() {
    $('#from').value = f.from;
    $('#to').value = f.to;
    $$('[data-page]').forEach(b => b.onclick = () => setPage(b.dataset.page));
    $$('[data-go]').forEach(b => b.onclick = () => setPage(b.dataset.go));
    $$('.preset-btn').forEach(b => b.onclick = () => applyPeriodPreset(b.dataset.preset));

    for (const [id, key] of [['from', 'from'], ['to', 'to']]) {
      const el = $('#' + id);
      if (!el) continue;
      el.onchange = () => {
        if ((id === 'from' || id === 'to') && (!P.validDate($('#from').value) || !P.validDate($('#to').value) || $('#from').value > $('#to').value)) {
          $('#from').value = f.from;
          $('#to').value = f.to;
          notify('Informe um intervalo de datas válido.');
          return;
        }
        if (id === 'from' || id === 'to') $$('.preset-btn').forEach(b => b.classList.remove('active'));
        f[key] = el.value;
        if (data) render();
      };
    }

    document.addEventListener('change', event => {
      const input = event.target.closest('.filter-check');
      if (!input) return;
      const key = input.dataset.filterKey;
      const selected = selectedValues(key).filter(value => value !== input.value);
      if (input.checked) selected.push(input.value);
      f[key] = [...new Set(selected)];
      if (key === 'tag') {
        f.asset = [];
        assets();
      }
      refreshFilterSummary(key);
      if (data) render();
    });

    document.addEventListener('input', event => {
      const search = event.target.closest('[data-filter-search]');
      if (!search) return;
      const query = search.value.trim().toLocaleLowerCase('pt-BR');
      const options = $(filterLabels[search.dataset.filterSearch].options);
      options.querySelectorAll('.filter-option').forEach(option => {
        option.hidden = !option.dataset.filterLabel.includes(query);
      });
    });

    document.addEventListener('click', event => {
      const action = event.target.closest('[data-filter-action]');
      if (!action) return;
      const { key } = action.dataset;
      const options = $(filterLabels[key].options);
      f[key] = action.dataset.filterAction === 'all'
        ? [...options.querySelectorAll('.filter-check')].map(input => input.value)
        : [];
      options.querySelectorAll('.filter-check').forEach(input => {
        input.checked = f[key].includes(input.value);
      });
      if (key === 'tag') {
        f.asset = [];
        assets();
      }
      refreshFilterSummary(key);
      if (data) render();
    });

    $('#activeFilterChips').addEventListener('click', event => {
      const chip = event.target.closest('[data-remove-filter]');
      if (!chip) return;
      const key = chip.dataset.removeFilter;
      if (key === 'period') {
        f.from = today().slice(0, 4) + '-01-01';
        f.to = today().slice(0, 4) + '-12-31';
        $('#from').value = f.from;
        $('#to').value = f.to;
        $$('.preset-btn').forEach(button => button.classList.toggle('active', button.dataset.preset === 'year'));
      } else if (filterLabels[key]) {
        f[key] = selectedValues(key).filter(value => value !== chip.dataset.filterValue);
        const input = [...document.querySelectorAll(filterLabels[key].options + ' input')].find(item => item.value === chip.dataset.filterValue);
        if (input) input.checked = false;
        if (key === 'tag') {
          f.asset = [];
          assets();
        }
        refreshFilterSummary(key);
      }
      if (data) render();
    });

    $('#clearFilters').onclick = () => {
      Object.assign(f, { from: today().slice(0, 4) + '-01-01', to: today().slice(0, 4) + '-12-31', dateField: 'created', tag: [], asset: [], type: [], priority: [] });
      $('#from').value = f.from;
      $('#to').value = f.to;
      $('#search').value = '';
      $('#statusFilter').value = '';
      if ($('#planFilter')) $('#planFilter').value = '';
      if ($('#systemSearch')) $('#systemSearch').value = '';
      $$('.preset-btn').forEach(b => b.classList.toggle('active', b.dataset.preset === 'year'));
      options();
      render();
    };

    if ($('#systemSearch')) {
      $('#systemSearch').oninput = () => renderSystemsList();
    }

    document.addEventListener('click', event => {
      const s = event.target.closest('[data-system]');
      const o = event.target.closest('[data-order]');
      const r = event.target.closest('[data-rank]');
      const tf = event.target.closest('[data-type-filter]');
      if (s && data) showSystem(s.dataset.system);
      else if (o && data) showOrder(o.dataset.order);
      else if (r && data) showEvidence(Number(r.dataset.rank));
      else if (tf && data) {
        const clickedType = tf.dataset.typeFilter;
        toggleFilterValue('type', clickedType);
        const input = [...document.querySelectorAll('#typeOptions input')].find(item => item.value === clickedType);
        if (input) input.checked = selectedValues('type').includes(clickedType);
        render();
      }
    });

    $('#search').oninput = () => { pageNo = 1; if (data) renderOrders(); };
    $('#statusFilter').onchange = () => { pageNo = 1; if (data) renderOrders(); };
    if ($('#planFilter')) $('#planFilter').onchange = () => { pageNo = 1; if (data) renderOrders(); };
    $('#prevPage').onclick = () => { pageNo--; renderOrders(); };
    $('#nextPage').onclick = () => { pageNo++; renderOrders(); };
    $('#closeDetail').onclick = () => $('#detail').close();
    $('#rulesBtn').onclick = rules;
    $('#fitMap').onclick = () => { if (map && fitBounds) map.fitBounds(fitBounds, { padding: [70, 60], maxZoom: 14 }); };

    if ($('#fullscreenMap')) {
      $('#fullscreenMap').onclick = () => {
        const card = $('#mapCard');
        const expanded = card.classList.toggle('is-fullscreen');
        $('#fullscreenMap').textContent = expanded ? 'Reduzir ⤡' : 'Expandir ⤢';
        if (map) setTimeout(() => { map.invalidateSize(); if (fitBounds) map.fitBounds(fitBounds, { padding: [70, 60], maxZoom: 14 }); }, 80);
      };
    }

    $('#refreshBtn').onclick = async () => {
      try {
        await loadData();
        notify('Informações atualizadas.');
      } catch (e) {
        notify(errorText(e));
      }
    };

    $('#importBtn').onclick = openImport;
    $('#emptyImport').onclick = openImport;
    $('#closeImport').onclick = () => $('#importDialog').close();
    $('#validateImport').onclick = validateImport;
    $('#saveImport').onclick = saveImport;
    $('#exportBtn').onclick = exportCSV;
    if ($('#exportIcmBtn')) $('#exportIcmBtn').onclick = exportIcmCSV;
    if ($('#exportDeadlinesBtn')) $('#exportDeadlinesBtn').onclick = exportDeadlinesCSV;
    if ($('#exportBadActorsBtn')) $('#exportBadActorsBtn').onclick = exportBadActorsCSV;
    if ($('#exportStopsBtn')) $('#exportStopsBtn').onclick = exportStopsCSV;
    if ($('#exportFlaggedStopsBtn')) $('#exportFlaggedStopsBtn').onclick = exportFlaggedStopsCSV;
    if ($('#printStopsBtn')) $('#printStopsBtn').onclick = printStopsReport;
    if ($('#printOverviewBtn')) $('#printOverviewBtn').onclick = printOverviewReport;

    $('#files').onchange = () => {
      selectedFiles = [...$('#files').files];
      pending = null;
      $('#saveImport').hidden = true;
      $('#importReview').innerHTML = '';
      renderFileChecklist(selectedFiles);
      importMessage('');
    };

    const dropZone = $('#dropZone');
    if (dropZone) {
      ['dragenter', 'dragover'].forEach(evt => dropZone.addEventListener(evt, e => {
        e.preventDefault();
        dropZone.classList.add('dragover');
      }));
      ['dragleave', 'drop'].forEach(evt => dropZone.addEventListener(evt, e => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
      }));
      dropZone.addEventListener('drop', e => {
        const dropped = [...(e.dataTransfer?.files || [])];
        if (!dropped.length) return;
        selectedFiles = dropped;
        pending = null;
        $('#saveImport').hidden = true;
        $('#importReview').innerHTML = '';
        renderFileChecklist(selectedFiles);
        importMessage('');
      });
    }

    $('#importDialog').addEventListener('cancel', e => { if ($('#closeImport').disabled) e.preventDefault(); });
    $('#logoutTop').onclick = $('#logoutBtn').onclick = async () => {
      const { error } = await db.auth.signOut({ scope: 'local' });
      if (error) notify(errorText(error));
      else lock();
    };
    $('#loginForm').onsubmit = async event => {
      event.preventDefault();
      $('#loginBtn').disabled = true;
      loginMessage('Entrando…');
      try {
        const { data: auth, error } = await db.auth.signInWithPassword({ email: $('#email').value.trim(), password: $('#password').value });
        if (error) throw error;
        $('#password').value = '';
        await enter(auth.session);
        loginMessage('');
      } catch (e) {
        $('#access').hidden = false;
        $('#shell').hidden = true;
        loginMessage(errorText(e), true);
      } finally {
        $('#loginBtn').disabled = false;
      }
    };
  }

  async function boot() {
    bind();
    if (!window.supabase || !P) {
      loginMessage('Não foi possível carregar os recursos. Verifique sua conexão e recarregue a página.', true);
      return;
    }
    db = window.supabase.createClient(window.PCM_CONFIG.url, window.PCM_CONFIG.key, {
      auth: { storageKey: 'pcm-teresina-session', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
    db.auth.onAuthStateChange(event => { if (event === 'SIGNED_OUT') lock(); });
    try {
      const { data: auth, error } = await db.auth.getSession();
      if (error) throw error;
      if (auth.session) await enter(auth.session);
    } catch (e) {
      loginMessage(errorText(e), true);
      $('#access').hidden = false;
      $('#shell').hidden = true;
    }
  }

  boot();
})();
