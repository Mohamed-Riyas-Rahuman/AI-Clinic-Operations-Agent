/* ═══════════════════════════════════════════════════════
   app.js — StratAI CareFirst Dashboard
   Handles:
     1. Navigation (Overview, Patients, Doctors, AI Agent, Traces, Analytics)
     2. Appointments data loading, stats, filterable table with scroll
     3. Patient directory grid with modal inspector
     4. Doctor schedules, metrics, and inline AI queries
     5. AI Agent chat with robust Markdown/Risk parsing and live trace tree
     6. Traces Explorer with full audit log, tool call inspection & re-run
     7. Chart.js visualizations (bar, donut, analytics, load)
   ═══════════════════════════════════════════════════════ */

// ──────────────────────────────────────────────────────
// AVATAR PALETTE & HELPERS
// ──────────────────────────────────────────────────────
const AVATAR_COLORS = [
  ['#6366f1','#c7d2fe'], ['#8b5cf6','#ddd6fe'], ['#ec4899','#fbcfe8'],
  ['#10b981','#a7f3d0'], ['#f59e0b','#fde68a'], ['#06b6d4','#a5f3fc'],
  ['#ef4444','#fecaca'], ['#84cc16','#d9f99d'],
];

function avatarColor(str) {
  let h = 0;
  for (const c of String(str || '')) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function initials(name) {
  return String(name || '').replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.)\s+/i, '')
    .split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || 'CF';
}

function nowTime() {
  return new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function setEl(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function setHtml(id, val) { const el = document.getElementById(id); if (el) el.innerHTML = val; }
function showEl(id) { const el = document.getElementById(id); if (el) el.hidden = false; }
function hideEl(id) { const el = document.getElementById(id); if (el) el.hidden = true; }

// ──────────────────────────────────────────────────────
// CLOCK
// ──────────────────────────────────────────────────────
const timeEl = document.getElementById('topbarTime');
function tickClock() { if (timeEl) timeEl.textContent = nowTime(); }
tickClock();
setInterval(tickClock, 1000);

// ──────────────────────────────────────────────────────
// NAVIGATION
// ──────────────────────────────────────────────────────
const PAGE_META = {
  dashboard: { title: 'Clinic Overview',      subtitle: 'Real-time no-show risk intelligence & appointments' },
  members:   { title: 'Patient Directory',    subtitle: 'Attendance history and risk profiles per patient' },
  doctors:   { title: 'Doctor Directory',     subtitle: 'Schedule context, daily loads, and AI querying' },
  ai:        { title: 'AI Operations Agent',  subtitle: 'Reasoning loop with Groq tool calling & risk assessment' },
  traces:    { title: 'Execution Traces',     subtitle: 'Audit log of agent tool calling and reasoning traces' },
  analytics: { title: 'Analytics & Model',    subtitle: 'Data insights and risk model performance metrics' },
};

const navBtns      = document.querySelectorAll('.nav-item');
const pages        = document.querySelectorAll('.page-content');
const pageTitleEl  = document.getElementById('pageTitle');
const pageSubEl    = document.getElementById('pageSubtitle');
const sidebar      = document.getElementById('sidebar');
const menuBtn      = document.getElementById('menuBtn');

let currentPage = 'dashboard';

function navigateTo(page) {
  currentPage = page;
  navBtns.forEach(b => b.classList.toggle('active', b.dataset.page === page));
  pages.forEach(p => p.classList.toggle('active', p.id === `page-${page}`));
  const m = PAGE_META[page] || {};
  if (pageTitleEl) pageTitleEl.textContent = m.title    || 'StratAI';
  if (pageSubEl)   pageSubEl.textContent   = m.subtitle || '';
  if (sidebar)     sidebar.classList.remove('open');

  if (page === 'traces') {
    loadTraces();
  }
}

navBtns.forEach(btn => btn.addEventListener('click', () => navigateTo(btn.dataset.page)));
if (menuBtn) menuBtn.addEventListener('click', () => sidebar && sidebar.classList.toggle('open'));

// ──────────────────────────────────────────────────────
// RISK CLASSIFIER & BADGES
// ──────────────────────────────────────────────────────
function classifyRisk(row) {
  const ns = parseInt(row.no_show_count)    || 0;
  const rs = parseInt(row.reschedule_count) || 0;
  const st = (row.status || '').toLowerCase();
  if (ns >= 5 || (ns >= 4 && st !== 'confirmed')) return 'high';
  if (ns >= 3 || (ns >= 2 && st !== 'confirmed') || rs >= 3) return 'moderate';
  if (ns === 0 && st === 'confirmed') return 'low';
  if (ns >= 1 || rs >= 1) return 'moderate';
  return 'low';
}

function statusPillHtml(s) {
  const cls = { 'Confirmed': 'confirmed', 'Unconfirmed': 'unconfirmed', 'Pending': 'pending' }[s] || 'pending';
  return `<span class="status-pill ${cls}">${s || 'Unknown'}</span>`;
}

function riskChipHtml(row) {
  const r = classifyRisk(row);
  const label = { high: 'HIGH', moderate: 'MODERATE', low: 'LOW', unknown: '—' }[r] || '—';
  return `<span class="risk-chip ${r}">${label}</span>`;
}

function noShowColor(n) {
  const v = parseInt(n) || 0;
  if (v >= 4) return '#f87171';
  if (v >= 2) return '#fbbf24';
  return '#34d399';
}

// ──────────────────────────────────────────────────────
// GLOBAL DATA
// ──────────────────────────────────────────────────────
let allRows = [];

// ──────────────────────────────────────────────────────
// STATS CARDS
// ──────────────────────────────────────────────────────
function updateStats(rows) {
  setEl('svTotal',       rows.length);
  setEl('svConfirmed',   rows.filter(r => r.status === 'Confirmed').length);
  setEl('svUnconfirmed', rows.filter(r => r.status !== 'Confirmed').length);
  setEl('svHighRisk',    rows.filter(r => (parseInt(r.no_show_count) || 0) >= 4).length);
  const badge = document.getElementById('overviewTableBadge');
  if (badge) badge.textContent = `${rows.length} records`;
}

// ──────────────────────────────────────────────────────
// APPOINTMENTS TABLE (OVERVIEW)
// ──────────────────────────────────────────────────────
function buildTable(rows) {
  const tbody = document.getElementById('apptTableBody');
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="13" class="table-loading">No appointments match your filter criteria.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td style="font-family:var(--mono);font-weight:700;color:#a5b4fc">${r.appointment_id}</td>
      <td style="color:var(--text-primary);font-weight:600">${r.patient_name}</td>
      <td style="font-family:var(--mono);color:var(--text-muted);font-size:0.75rem">${r.patient_id}</td>
      <td style="color:var(--text-secondary)">${r.doctor}</td>
      <td style="color:var(--text-secondary)">${r.appointment_date}</td>
      <td style="color:var(--text-secondary)">${r.time_slot}</td>
      <td style="color:var(--text-secondary)">${r.appointment_type}</td>
      <td style="color:var(--text-secondary);text-align:center">${r.consultation_duration_mins}m</td>
      <td>${statusPillHtml(r.status)}</td>
      <td style="text-align:center;font-weight:700;color:${noShowColor(r.no_show_count)}">${r.no_show_count}</td>
      <td style="text-align:center;color:${(parseInt(r.reschedule_count)||0)>=3?'#fbbf24':'var(--text-secondary)'};font-weight:600">${r.reschedule_count}</td>
      <td>${riskChipHtml(r)}</td>
      <td><button class="row-analyze-btn" data-id="${r.appointment_id}">Analyze</button></td>
    </tr>`).join('');

  tbody.querySelectorAll('.row-analyze-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      navigateTo('ai');
      setTimeout(() => sendChatQuery(`Analyze ${btn.dataset.id}`), 250);
    });
  });
}

function filterRows() {
  const doctor = (document.getElementById('filterDoctor') || {}).value || '';
  const status = (document.getElementById('filterStatus') || {}).value || '';
  const search = ((document.getElementById('searchInput') || {}).value || '').toLowerCase().trim();
  return allRows.filter(r =>
    (!doctor || r.doctor === doctor) &&
    (!status || r.status === status) &&
    (!search ||
      (r.patient_name || '').toLowerCase().includes(search) ||
      (r.appointment_id || '').toLowerCase().includes(search) ||
      (r.patient_id || '').toLowerCase().includes(search) ||
      (r.doctor || '').toLowerCase().includes(search))
  );
}

function populateDoctorFilter(rows) {
  const sel = document.getElementById('filterDoctor');
  if (!sel) return;
  const existing = [...sel.options].map(o => o.value).filter(Boolean);
  const docs = [...new Set(rows.map(r => r.doctor))].sort();
  docs.forEach(d => {
    if (!existing.includes(d)) {
      const opt = document.createElement('option');
      opt.value = d; opt.textContent = d;
      sel.appendChild(opt);
    }
  });
}

['filterDoctor', 'filterStatus', 'searchInput'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', () => buildTable(filterRows()));
});

// ──────────────────────────────────────────────────────
// PATIENTS GRID & MODAL
// ──────────────────────────────────────────────────────
let currentModalRow = null;

function buildMembersGrid(rows) {
  const grid = document.getElementById('membersGrid');
  if (!grid) return;

  const byPatient = {};
  rows.forEach(r => { byPatient[r.patient_id] = r; });
  const patients = Object.values(byPatient);

  if (!patients.length) {
    grid.innerHTML = '<div class="table-loading" style="grid-column:1/-1">No patients found.</div>';
    return;
  }

  const riskColors = { high: '#f87171', moderate: '#fbbf24', low: '#34d399', unknown: '#94a3b8' };

  grid.innerHTML = patients.map(r => {
    const [bg, fg] = avatarColor(r.patient_id);
    const risk = classifyRisk(r);
    return `
      <div class="member-card" data-apid="${r.appointment_id}" tabindex="0" role="button" aria-label="View ${r.patient_name}">
        <div class="member-top">
          <div class="member-avatar" style="background:${bg}22;color:${fg};border:2px solid ${bg}44">${initials(r.patient_name)}</div>
          <div class="member-info">
            <div class="member-name">${r.patient_name}</div>
            <div class="member-id">${r.patient_id} · ${r.appointment_id}</div>
          </div>
        </div>
        <div class="member-stats">
          <div class="member-stat-pill">
            <span class="msp-val" style="color:${noShowColor(r.no_show_count)}">${r.no_show_count}</span>
            <span class="msp-label">No-Shows</span>
          </div>
          <div class="member-stat-pill">
            <span class="msp-val">${r.reschedule_count}</span>
            <span class="msp-label">Reschedules</span>
          </div>
          <div class="member-stat-pill">
            <span class="msp-val" style="color:${riskColors[risk]};font-size:0.72rem;letter-spacing:.02em">${risk.toUpperCase()}</span>
            <span class="msp-label">Risk</span>
          </div>
        </div>
        <div class="member-footer">
          <span class="member-doctor" style="font-size:0.72rem;color:var(--text-secondary)">${r.doctor}</span>
          ${statusPillHtml(r.status)}
        </div>
      </div>`;
  }).join('');

  grid.querySelectorAll('.member-card').forEach(card => {
    const open = () => {
      const row = rows.find(r => r.appointment_id === card.dataset.apid);
      if (row) openModal(row);
    };
    card.addEventListener('click', open);
    card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') open(); });
  });
}

const modalOverlay = document.getElementById('modalOverlay');
const modalClose   = document.getElementById('modalClose');
const modalAnalyze = document.getElementById('modalAnalyzeBtn');

function openModal(row) {
  currentModalRow = row;
  const [bg, fg] = avatarColor(row.patient_id);
  const av = document.getElementById('modalAvatar');
  if (av) {
    av.textContent = initials(row.patient_name);
    Object.assign(av.style, { background: bg + '22', color: fg, border: `2px solid ${bg}44` });
  }
  setEl('modalPatientName', row.patient_name);
  setEl('modalPatientId',   `${row.patient_id} · ${row.appointment_id}`);

  const nsEl = document.getElementById('mNoShow');
  if (nsEl) { nsEl.textContent = row.no_show_count; nsEl.style.color = noShowColor(row.no_show_count); }
  setEl('mReschedule', row.reschedule_count);
  setEl('mDuration',   row.consultation_duration_mins + ' min');
  setEl('mDoctor',     row.doctor);
  setEl('mDate',       row.appointment_date);
  setEl('mTime',       row.time_slot);
  setEl('mType',       row.appointment_type);
  setHtml('mStatus',   statusPillHtml(row.status));
  setEl('mConfirmed',  row.last_confirmed_date || 'Not confirmed');
  setEl('mNotes',      row.notes || 'No notes available.');

  if (modalOverlay) modalOverlay.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  if (modalOverlay) modalOverlay.hidden = true;
  document.body.style.overflow = '';
  currentModalRow = null;
}

if (modalClose)   modalClose.addEventListener('click', closeModal);
if (modalOverlay) modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
if (modalAnalyze) modalAnalyze.addEventListener('click', () => {
  if (!currentModalRow) return;
  const apptId = currentModalRow.appointment_id;
  closeModal();
  navigateTo('ai');
  setTimeout(() => sendChatQuery(`Analyze ${apptId}`), 300);
});

// ──────────────────────────────────────────────────────
// DOCTORS PAGE
// ──────────────────────────────────────────────────────
const DOC_COLORS = [
  { bg: '#6366f1', light: '#c7d2fe', faded: 'rgba(99,102,241,0.12)' },
  { bg: '#06b6d4', light: '#a5f3fc', faded: 'rgba(6,182,212,0.12)'  },
  { bg: '#10b981', light: '#a7f3d0', faded: 'rgba(16,185,129,0.12)' },
  { bg: '#f59e0b', light: '#fde68a', faded: 'rgba(245,158,11,0.12)' },
];

let activeDoctorName = null;
let activeDoctorRows = [];
let doctorColorMap   = {};

function buildDoctorSummaries(rows) {
  const map = {};
  rows.forEach(r => {
    if (!map[r.doctor]) {
      map[r.doctor] = { name: r.doctor, appointments: [], dates: new Set() };
    }
    map[r.doctor].appointments.push(r);
    map[r.doctor].dates.add(r.appointment_date);
  });
  return Object.values(map);
}

function doctorStats(appts) {
  const total      = appts.length;
  const confirmed  = appts.filter(a => a.status === 'Confirmed').length;
  const unconf     = appts.filter(a => a.status === 'Unconfirmed').length;
  const pending    = appts.filter(a => a.status === 'Pending').length;
  const highRisk   = appts.filter(a => (parseInt(a.no_show_count)||0) >= 4).length;
  const totalNS    = appts.reduce((s,a) => s + (parseInt(a.no_show_count)||0), 0);
  const avgNS      = total ? (totalNS / total).toFixed(1) : '0';
  const totalMins  = appts.reduce((s,a) => s + (parseInt(a.consultation_duration_mins)||0), 0);
  return { total, confirmed, unconf, pending, highRisk, avgNS, totalMins };
}

function buildDoctorHeroRow(rows) {
  const container = document.getElementById('doctorHeroRow');
  if (!container) return;

  const summaries = buildDoctorSummaries(rows);
  summaries.forEach((doc, i) => {
    doctorColorMap[doc.name] = DOC_COLORS[i % DOC_COLORS.length];
  });

  container.innerHTML = summaries.map(doc => {
    const clr   = doctorColorMap[doc.name];
    const stats = doctorStats(doc.appointments);
    const dates = [...doc.dates].sort();
    const inits = doc.name.replace('Dr.', '').trim().split(' ').map(w => w[0]).join('').toUpperCase();

    return `
      <div class="doctor-hero-card" data-doc="${doc.name}" style="--doc-clr:${clr.bg}">
        <div class="dhc-top">
          <div class="dhc-avatar" style="background:${clr.faded};color:${clr.bg};border-color:${clr.bg}44">${inits}</div>
          <div class="dhc-info">
            <div class="dhc-name">${doc.name}</div>
            <div class="dhc-specialty">
              <span class="spec-dot" style="background:${clr.bg}"></span>
              General Medicine · CareFirst Clinic
            </div>
          </div>
        </div>

        <div class="dhc-grid">
          <div class="dhc-stat">
            <span class="dhc-stat-val" style="color:${clr.bg}">${stats.total}</span>
            <span class="dhc-stat-label">Total Appts</span>
          </div>
          <div class="dhc-stat">
            <span class="dhc-stat-val" style="color:#10b981">${stats.confirmed}</span>
            <span class="dhc-stat-label">Confirmed</span>
          </div>
          <div class="dhc-stat">
            <span class="dhc-stat-val" style="color:#f87171">${stats.highRisk}</span>
            <span class="dhc-stat-label">High Risk</span>
          </div>
          <div class="dhc-stat">
            <span class="dhc-stat-val" style="color:#fbbf24">${stats.unconf}</span>
            <span class="dhc-stat-label">Unconfirmed</span>
          </div>
          <div class="dhc-stat">
            <span class="dhc-stat-val">${stats.avgNS}</span>
            <span class="dhc-stat-label">Avg No-Shows</span>
          </div>
          <div class="dhc-stat">
            <span class="dhc-stat-val">${stats.totalMins}m</span>
            <span class="dhc-stat-label">Total Time</span>
          </div>
        </div>

        <div class="dhc-footer">
          <span class="dhc-badge" style="background:${clr.faded};color:${clr.bg};border-color:${clr.bg}44">
            ${dates.length} scheduled day${dates.length !== 1 ? 's' : ''}
          </span>
          <span class="dhc-badge" style="background:rgba(16,185,129,0.1);color:#34d399;border-color:rgba(16,185,129,0.25)">
            ${stats.confirmed} confirmed
          </span>
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('.doctor-hero-card').forEach(card => {
    card.addEventListener('click', () => selectDoctor(card.dataset.doc));
  });

  if (summaries.length > 0) selectDoctor(summaries[0].name);
}

function selectDoctor(name) {
  activeDoctorName = name;
  activeDoctorRows = allRows.filter(r => r.doctor === name);

  document.querySelectorAll('.doctor-hero-card').forEach(c => {
    c.classList.toggle('active-doc', c.dataset.doc === name);
  });

  const clr = doctorColorMap[name] || DOC_COLORS[0];
  const stats = doctorStats(activeDoctorRows);

  const bigAv = document.getElementById('ddrAvatar');
  if (bigAv) {
    const inits = name.replace('Dr.', '').trim().split(' ').map(w => w[0]).join('').toUpperCase();
    bigAv.textContent = inits;
    Object.assign(bigAv.style, { background: clr.faded, color: clr.bg, border: `2px solid ${clr.bg}55` });
  }

  setEl('ddrName', name);
  setEl('ddrSub',  `General Medicine · ${activeDoctorRows.length} total appointments recorded`);

  const ddrStats = document.getElementById('ddrStats');
  if (ddrStats) {
    const items = [
      { val: stats.total,    label: 'Total',      color: clr.bg },
      { val: stats.confirmed,label: 'Confirmed',  color: '#10b981' },
      { val: stats.unconf,   label: 'Unconfirmed',color: '#f59e0b' },
      { val: stats.pending,  label: 'Pending',    color: '#94a3b8' },
      { val: stats.highRisk, label: 'High Risk',  color: '#ef4444' },
      { val: stats.totalMins + 'm', label: 'Duration', color: '#a5b4fc' },
    ];
    ddrStats.innerHTML = items.map(it => `
      <div class="ddr-stat-item">
        <span class="ddrsi-val" style="color:${it.color}">${it.val}</span>
        <span class="ddrsi-label">${it.label}</span>
      </div>`).join('');
  }

  const datePicker = document.getElementById('ddrDatePicker');
  const ddrSearch  = document.getElementById('ddrSearch');
  if (datePicker) datePicker.value = '';
  if (ddrSearch)  ddrSearch.value  = '';

  renderDoctorTable(activeDoctorRows, name);
  showEl('doctorDetailPanel');
  hideEl('doctorAiResult');
  setEl('ddrTableTitle', `${name}'s Appointments`);
}

function renderDoctorTable(rows, docName) {
  const tbody  = document.getElementById('ddrTableBody');
  const badge  = document.getElementById('ddrTableBadge');
  if (badge) badge.textContent = `${rows.length} records`;
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="14" class="table-loading">No appointments match this filter.</td></tr>';
    return;
  }

  const clr = doctorColorMap[docName] || DOC_COLORS[0];

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td style="font-family:var(--mono);font-weight:700;color:${clr.bg}">${r.appointment_id}</td>
      <td style="color:var(--text-primary);font-weight:600">${r.patient_name}</td>
      <td style="font-family:var(--mono);color:var(--text-muted);font-size:0.75rem">${r.patient_id}</td>
      <td style="color:var(--text-secondary)">${r.appointment_date}</td>
      <td style="color:var(--text-secondary)">${r.time_slot}</td>
      <td style="color:var(--text-secondary)">${r.appointment_type}</td>
      <td style="color:var(--text-secondary);text-align:center">${r.consultation_duration_mins}m</td>
      <td>${statusPillHtml(r.status)}</td>
      <td style="text-align:center;font-weight:700;color:${noShowColor(r.no_show_count)}">${r.no_show_count}</td>
      <td style="text-align:center;color:${(parseInt(r.reschedule_count)||0)>=3?'#fbbf24':'var(--text-secondary)'};font-weight:600">${r.reschedule_count}</td>
      <td style="color:var(--text-secondary)">${r.last_confirmed_date || '—'}</td>
      <td>${riskChipHtml(r)}</td>
      <td class="note-cell" title="${r.notes || ''}">${r.notes || '—'}</td>
      <td><button class="row-analyze-btn" data-id="${r.appointment_id}">Analyze</button></td>
    </tr>`).join('');

  tbody.querySelectorAll('.row-analyze-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      navigateTo('ai');
      setTimeout(() => sendChatQuery(`Analyze ${btn.dataset.id}`), 250);
    });
  });
}

function filterDoctorTable() {
  const dateVal  = (document.getElementById('ddrDatePicker')  || {}).value || '';
  const srchVal  = ((document.getElementById('ddrSearch') || {}).value || '').toLowerCase().trim();
  
  let formattedDate = dateVal;
  if (dateVal && dateVal.includes('-')) {
    const parts = dateVal.split('-');
    if (parts[0].length === 4) formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
  }

  const filtered = activeDoctorRows.filter(r => {
    const dateMatch = !dateVal || r.appointment_date === formattedDate || r.appointment_date === dateVal;
    const srchMatch = !srchVal ||
      (r.patient_name   || '').toLowerCase().includes(srchVal) ||
      (r.appointment_id || '').toLowerCase().includes(srchVal) ||
      (r.patient_id     || '').toLowerCase().includes(srchVal) ||
      (r.appointment_date|| '').includes(srchVal) ||
      (r.appointment_type|| '').toLowerCase().includes(srchVal);
    return dateMatch && srchMatch;
  });
  renderDoctorTable(filtered, activeDoctorName);
}

const ddrDatePicker = document.getElementById('ddrDatePicker');
const ddrSearch     = document.getElementById('ddrSearch');
if (ddrDatePicker) ddrDatePicker.addEventListener('input', filterDoctorTable);
if (ddrSearch)     ddrSearch.addEventListener('input', filterDoctorTable);

const ddrAskBtn = document.getElementById('ddrAskBtn');
if (ddrAskBtn) {
  ddrAskBtn.addEventListener('click', async () => {
    if (!activeDoctorName) return;
    const dateEl   = document.getElementById('ddrDatePicker');
    const dateVal  = dateEl ? dateEl.value : '';

    let query;
    if (dateVal) {
      const parts = dateVal.split('-');
      const fmtDate = parts.length === 3 && parts[0].length === 4
        ? `${parts[2]}-${parts[1]}-${parts[0]}`
        : dateVal;
      query = `What appointments does ${activeDoctorName} have on ${fmtDate}?`;
    } else {
      const dates = [...new Set(activeDoctorRows.map(r => r.appointment_date))].sort();
      query = dates.length
        ? `What appointments does ${activeDoctorName} have on ${dates[0]}?`
        : `Show me the schedule for ${activeDoctorName}`;
    }

    showEl('doctorAiResult');
    showEl('daiLoading');
    setHtml('daiText', '');
    hideEl('daiTraceWrap');
    ddrAskBtn.disabled = true;

    try {
      const res  = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: query }),
      });
      const data = await res.json();
      hideEl('daiLoading');

      const text = data.success ? (data.final_answer || '') : (data.error || 'An error occurred.');
      setHtml('daiText', formatMarkdown(text));

      if (data.trace && data.trace.length) {
        showEl('daiTraceWrap');
        const daiTraceList = document.getElementById('daiTraceList');
        if (daiTraceList) {
          daiTraceList.innerHTML = data.trace.map((step, i) => `
            <li class="trace-step">
              <div class="trace-step-name">${i+1}. ${step.tool}</div>
              <div class="trace-step-args">Arguments: ${JSON.stringify(step.arguments)}</div>
              <pre class="trace-step-result">${JSON.stringify(step.result, null, 2)}</pre>
            </li>`).join('') +
            `<li class="trace-step"><div class="trace-step-name">Final Decision</div><div class="trace-step-args">LLM reasoning over tool results.</div></li>`;
        }
      }
    } catch (err) {
      hideEl('daiLoading');
      setHtml('daiText', '<span style="color:#f87171">Could not reach the AI service. Please ensure the server is running.</span>');
      console.error('doctor AI error:', err);
    } finally {
      ddrAskBtn.disabled = false;
    }
  });
}

const daiTraceToggle = document.getElementById('daiTraceToggle');
const daiTraceBody   = document.getElementById('daiTraceBody');
if (daiTraceToggle && daiTraceBody) {
  daiTraceToggle.addEventListener('click', () => {
    const open = daiTraceToggle.getAttribute('aria-expanded') === 'true';
    daiTraceToggle.setAttribute('aria-expanded', String(!open));
    daiTraceBody.hidden = open;
  });
}

const doctorAiClose = document.getElementById('doctorAiClose');
if (doctorAiClose) {
  doctorAiClose.addEventListener('click', () => hideEl('doctorAiResult'));
}

// ──────────────────────────────────────────────────────
// MARKDOWN FORMATTER HELPER
// ──────────────────────────────────────────────────────
function formatMarkdown(text) {
  if (!text) return '';
  let s = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.08);padding:0.15rem 0.35rem;border-radius:4px;font-family:var(--mono);color:#a5b4fc">$1</code>')
    .replace(/^### (.*$)/gim, '<h4 style="margin:0.75rem 0 0.35rem;color:#e8eaf2;font-size:0.95rem">$1</h4>')
    .replace(/^## (.*$)/gim, '<h3 style="margin:0.85rem 0 0.4rem;color:#e8eaf2;font-size:1.05rem">$1</h3>')
    .replace(/^# (.*$)/gim, '<h2 style="margin:1rem 0 0.5rem;color:#e8eaf2;font-size:1.15rem">$1</h2>')
    .replace(/^\s*[-*•]\s+(.*$)/gim, '<li style="margin-left:1.2rem;margin-bottom:0.3rem">$1</li>')
    .replace(/\n/g, '<br>');
  return s;
}

// ──────────────────────────────────────────────────────
// PARSE FINAL ANSWER FROM AI
// ──────────────────────────────────────────────────────
function parseFinalAnswer(rawText) {
  const text = String(rawText || '');

  const getField = (labels) => {
    for (const label of labels) {
      const re = new RegExp(`(?:^|\\n)[#*\\s]*${label}[:\\s*]*([^\n]+)`, 'i');
      const m = text.match(re);
      if (m && m[1]) {
        return m[1].replace(/[*_]/g, '').trim();
      }
    }
    return '';
  };

  const getSection = (startLabels, endLabels) => {
    let startIdx = -1;
    let matchLen = 0;
    for (const label of startLabels) {
      const re = new RegExp(`(?:^|\\n)[#*\\s]*${label}[:\\s*]*`, 'i');
      const m = text.match(re);
      if (m && m.index !== undefined) {
        startIdx = m.index + m[0].length;
        matchLen = m[0].length;
        break;
      }
    }
    if (startIdx === -1) return '';

    let endIdx = text.length;
    for (const label of endLabels) {
      const re = new RegExp(`(?:^|\\n)[#*\\s]*${label}[:\\s*]*`, 'i');
      const rest = text.slice(startIdx);
      const m = rest.match(re);
      if (m && m.index !== undefined) {
        endIdx = Math.min(endIdx, startIdx + m.index);
      }
    }
    return text.slice(startIdx, endIdx).trim();
  };

  let risk = getField(['Risk Level', 'Risk']).toUpperCase();
  if (risk.includes('HIGH')) risk = 'HIGH';
  else if (risk.includes('MODERATE')) risk = 'MODERATE';
  else if (risk.includes('LOW')) risk = 'LOW';
  else if (risk.includes('INSUFFICIENT')) risk = 'INSUFFICIENT';

  let confidence = getField(['Confidence']).toUpperCase();
  if (confidence.includes('HIGH')) confidence = 'HIGH';
  else if (confidence.includes('MEDIUM')) confidence = 'MEDIUM';
  else if (confidence.includes('LOW')) confidence = 'LOW';

  let escalation = getField(['Escalation']).toUpperCase();
  if (escalation.includes('YES')) escalation = 'YES';
  else if (escalation.includes('NO')) escalation = 'NO';

  const rawEvidence = getSection(['Key Evidence', 'Evidence'], ['Decision', 'Reasoning', 'Recommended Action', 'Action', 'Escalation']);
  const evidence = rawEvidence.split('\n')
    .map(l => l.replace(/^[-*•\d.]+\s*/, '').replace(/[*_]/g, '').trim())
    .filter(Boolean);

  const decision = getSection(['Decision', 'Reasoning'], ['Recommended Action', 'Action', 'Escalation', 'Key Evidence']);
  const action   = getSection(['Recommended Action', 'Action'], ['Escalation', 'Decision']);

  let escalationNote = '';
  const escMatch = text.match(/Escalation[:\s*]*(YES|NO)[^\n]*\n*([\s\S]*?)(?:$|###)/i);
  if (escMatch && escMatch[2]) {
    escalationNote = escMatch[2].trim();
  }

  return {
    appointment: getField(['Appointment', 'Appointment ID']),
    patient:     getField(['Patient', 'Patient Name']),
    doctor:      getField(['Doctor', 'Doctor Name']),
    dateTime:    getField(['Date & Time', 'Date and Time', 'Date']),
    risk:        risk || 'MODERATE',
    confidence:  confidence || 'MEDIUM',
    escalation:  escalation || 'NO',
    escalationNote,
    evidence,
    decision: decision.replace(/[*_]/g, ''),
    action:   action.replace(/[*_]/g, ''),
  };
}

// ──────────────────────────────────────────────────────
// RENDER AI RESULTS
// ──────────────────────────────────────────────────────
function renderRiskResult(parsed) {
  const pill = document.getElementById('riskPill');
  if (pill) pill.className = 'risk-pill ' + (parsed.risk || 'MODERATE');
  setEl('riskLevelText', parsed.risk || '—');
  setEl('confVal', parsed.confidence || '—');
  setEl('escVal',  parsed.escalation || '—');

  const escBadge = document.getElementById('escBadge');
  const escValEl = document.getElementById('escVal');
  if (escBadge && escValEl) {
    if (parsed.escalation === 'YES') {
      escBadge.style.borderColor = 'rgba(239,68,68,0.4)';
      escValEl.style.color = '#f87171';
    } else {
      escBadge.style.borderColor = '';
      escValEl.style.color = '';
    }
  }

  setEl('riAppt',    parsed.appointment || '—');
  setEl('riPatient', parsed.patient     || '—');
  setEl('riDoctor',  parsed.doctor      || '—');
  setEl('riDateTime',parsed.dateTime    || '—');

  const evList = document.getElementById('riEvidence');
  if (evList) {
    evList.innerHTML = (parsed.evidence.length ? parsed.evidence : ['Risk signals derived from attendance dataset.'])
      .map(e => `<li>${e}</li>`).join('');
  }

  setEl('riDecision', parsed.decision || 'Evidence and attendance signals assessed for no-show risk.');
  setEl('riAction',   parsed.action   || 'Monitor confirmation status prior to appointment.');

  const escNote = document.getElementById('riEscNote');
  if (escNote) {
    escNote.textContent = parsed.escalationNote;
    escNote.hidden = !(parsed.escalation === 'YES' && parsed.escalationNote);
  }

  showEl('riskResult');
  hideEl('generalResult');
  hideEl('resultPlaceholder');
}

function renderGeneralResult(text) {
  setHtml('generalText', formatMarkdown(text));
  showEl('generalResult');
  hideEl('riskResult');
  hideEl('resultPlaceholder');
}

function renderTrace(trace) {
  const card  = document.getElementById('traceCard');
  const list  = document.getElementById('traceList');
  const count = document.getElementById('traceStepCount');
  if (!card || !list) return;

  if (!trace || !trace.length) {
    hideEl('traceCard');
    return;
  }

  if (count) count.textContent = trace.length;
  showEl('traceCard');

  list.innerHTML = trace.map((step, i) => `
    <li class="trace-step">
      <div class="trace-step-name">${i+1}. ${step.tool}</div>
      <div class="trace-step-args">Arguments: ${JSON.stringify(step.arguments)}</div>
      <pre class="trace-step-result">${JSON.stringify(step.result, null, 2)}</pre>
    </li>`).join('') +
    `<li class="trace-step">
      <div class="trace-step-name" style="color:#10b981">Final Decision</div>
      <div class="trace-step-args">Produced by LLM reasoning over the tool results above.</div>
    </li>`;
}

// ──────────────────────────────────────────────────────
// AI AGENT CHAT
// ──────────────────────────────────────────────────────
const chatMessages = document.getElementById('chatMessages');
const chatInput    = document.getElementById('chatInput');
const chatSendBtn  = document.getElementById('chatSendBtn');
const chatForm     = document.getElementById('chatForm');

let typingEl = null;

function addMsg(text, role) {
  if (!chatMessages) return;
  const msg = document.createElement('div');
  msg.className = `msg ${role}`;
  msg.innerHTML = `
    <div class="msg-bubble">${formatMarkdown(text)}</div>
    <div class="msg-time">${nowTime()}</div>`;
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTyping() {
  if (!chatMessages) return;
  typingEl = document.createElement('div');
  typingEl.className = 'msg agent';
  typingEl.innerHTML = `<div class="typing-bubble"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div>`;
  chatMessages.appendChild(typingEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTyping() { if (typingEl) { typingEl.remove(); typingEl = null; } }

async function sendChatQuery(query) {
  const welcome = chatMessages && chatMessages.querySelector('.chat-welcome');
  if (welcome) welcome.remove();

  addMsg(query, 'user');
  if (chatSendBtn) chatSendBtn.disabled = true;
  showTyping();

  hideEl('riskResult');
  hideEl('generalResult');
  hideEl('traceCard');
  showEl('resultPlaceholder');

  try {
    const res  = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: query }),
    });
    const data = await res.json();
    removeTyping();

    if (!data.success) {
      addMsg(data.error || 'Something went wrong. Please try again.', 'agent');
      renderTrace(data.trace || []);
    } else {
      const text = data.final_answer || '';
      addMsg(text, 'agent');

      if (/Risk Level:/i.test(text) || /Risk:/i.test(text)) {
        renderRiskResult(parseFinalAnswer(text));
      } else {
        renderGeneralResult(text);
      }
      renderTrace(data.trace || []);
    }
  } catch (err) {
    removeTyping();
    addMsg('Could not reach the StratAI service. Please verify the backend server is running.', 'agent');
    console.error('chat error:', err);
  } finally {
    if (chatSendBtn) chatSendBtn.disabled = false;
    if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

if (chatForm) {
  chatForm.addEventListener('submit', e => {
    e.preventDefault();
    const q = (chatInput ? chatInput.value.trim() : '');
    if (!q) return;
    if (chatInput) chatInput.value = '';
    sendChatQuery(q);
  });
}

document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const q = chip.dataset.q;
    if (q) sendChatQuery(q);
  });
});

const clearBtn = document.getElementById('clearChatBtn');
if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    if (chatMessages) {
      chatMessages.innerHTML = `
        <div class="chat-welcome">
          <div class="welcome-icon">
            <svg viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="22" fill="#6366f1" opacity=".12"/>
            <path d="M24 14v20M14 24h20" stroke="#6366f1" stroke-width="2.5" stroke-linecap="round"/></svg>
          </div>
          <h3>Chat session cleared</h3>
          <p>Ready for your next clinic query.</p>
        </div>`;
    }
    hideEl('riskResult');
    hideEl('generalResult');
    hideEl('traceCard');
    showEl('resultPlaceholder');
  });
}

const traceToggle = document.getElementById('traceToggle');
const traceBody   = document.getElementById('traceBody');
if (traceToggle && traceBody) {
  traceToggle.addEventListener('click', () => {
    const open = traceToggle.getAttribute('aria-expanded') === 'true';
    traceToggle.setAttribute('aria-expanded', String(!open));
    traceBody.hidden = open;
  });
}

// ──────────────────────────────────────────────────────
// TRACES EXPLORER PAGE
// ──────────────────────────────────────────────────────
let allTracesList = [];
let activeTraceData = null;
let activeTraceFilter = 'all';

let allTracesMap = {};

async function loadTraces() {
  const container = document.getElementById('tracesListContainer');
  if (container) container.innerHTML = '<div class="table-loading">Loading saved traces…</div>';

  try {
    let traces = [];
    // 1. Try dynamic API route
    try {
      const res = await fetch('/api/traces');
      if (res.ok) {
        const json = await res.json();
        traces = json.traces || [];
      }
    } catch (e) {
      console.warn('API /api/traces unreachable, trying static fallback...', e);
    }

    // 2. Fallback to embedded traces json if API failed or returned empty
    if (!traces.length) {
      try {
        const resStatic = await fetch('/static/embedded_traces.json');
        if (resStatic.ok) {
          const rawMap = await resStatic.json();
          allTracesMap = rawMap;
          traces = Object.entries(rawMap).map(([filename, data]) => {
            const id = filename.replace(/\.json$/, '');
            return {
              filename,
              id,
              size_bytes: JSON.stringify(data).length,
              success: data.success !== false,
              appointment_id: data.appointment_id || (id.match(/^A\d{3}/) ? id.slice(0, 4) : null),
              tool_count: Array.isArray(data.trace) ? data.trace.length : 0,
              has_risk: !!(data.final_answer && (data.final_answer.includes('Risk Level:') || data.final_answer.includes('Risk:'))),
              final_answer_preview: (data.final_answer || data.error || '').slice(0, 120).replace(/\n/g, ' '),
            };
          });
        }
      } catch (staticErr) {
        console.warn('Static fallback also failed:', staticErr);
      }
    }

    if (!traces.length) {
      throw new Error('No trace logs found on server.');
    }

    allTracesList = traces;

    // Update stats
    setEl('stTracesTotal',   allTracesList.length);
    setEl('stTracesSuccess', allTracesList.filter(t => t.success).length);
    const totalTools = allTracesList.reduce((acc, t) => acc + (t.tool_count || 0), 0);
    setEl('stTracesTools',   totalTools);

    renderTracesList(filterTraces());

    // Auto-select first trace
    if (allTracesList.length > 0) {
      selectTrace(allTracesList[0].id);
    }
  } catch (err) {
    console.error('Failed to load traces:', err);
    if (container) {
      container.innerHTML = `<div style="padding:1.5rem;text-align:center;color:#f87171;font-size:0.8rem">
        Failed to load trace files: ${err.message}
      </div>`;
    }
  }
}

function filterTraces() {
  const search = ((document.getElementById('tracesSearchInput') || {}).value || '').toLowerCase().trim();
  return allTracesList.filter(t => {
    const matchSearch = !search ||
      (t.id || '').toLowerCase().includes(search) ||
      (t.filename || '').toLowerCase().includes(search) ||
      (t.appointment_id || '').toLowerCase().includes(search) ||
      (t.final_answer_preview || '').toLowerCase().includes(search);

    let matchCategory = true;
    if (activeTraceFilter === 'risk') matchCategory = t.has_risk || (t.appointment_id && t.appointment_id.startsWith('A'));
    else if (activeTraceFilter === 'schedule') matchCategory = (t.id || '').includes('suresh') || (t.id || '').includes('priya') || (t.id || '').includes('schedule') || (t.id || '').includes('appointment');
    else if (activeTraceFilter === 'history') matchCategory = (t.id || '').includes('history') || (t.id || '').includes('P003') || (t.id || '').includes('patient');

    return matchSearch && matchCategory;
  });
}

function renderTracesList(traces) {
  const container = document.getElementById('tracesListContainer');
  if (!container) return;

  if (!traces.length) {
    container.innerHTML = '<div style="padding:1.5rem;text-align:center;color:#64748b;font-size:0.78rem">No traces match your filter.</div>';
    return;
  }

  container.innerHTML = traces.map(t => {
    const isActive = activeTraceData && activeTraceData._id === t.id;
    const title = t.appointment_id || t.id.replace(/^query_/, '').replace(/_/g, ' ');
    const sizeKb = (t.size_bytes / 1024).toFixed(1);

    return `
      <div class="trace-item-card ${isActive ? 'active' : ''}" data-tid="${t.id}">
        <div class="tic-top">
          <span class="tic-id">${title}</span>
          <span class="tic-tools">${t.tool_count} tool${t.tool_count !== 1 ? 's' : ''}</span>
        </div>
        <div class="tic-preview">${t.final_answer_preview || 'Trace execution log'}</div>
        <div class="tic-footer">
          <span>${t.filename}</span>
          <span>${sizeKb} KB</span>
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('.trace-item-card').forEach(card => {
    card.addEventListener('click', () => selectTrace(card.dataset.tid));
  });
}

async function selectTrace(traceId) {
  document.querySelectorAll('.trace-item-card').forEach(c => {
    c.classList.toggle('active', c.dataset.tid === traceId);
  });

  const emptyView  = document.getElementById('traceInspectorEmpty');
  const detailView = document.getElementById('traceDetailView');
  if (emptyView)  emptyView.hidden = true;
  if (detailView) detailView.hidden = false;

  try {
    let data = null;
    // Check if already in memory map
    const fileKey = traceId.endsWith('.json') ? traceId : `${traceId}.json`;
    if (allTracesMap[fileKey]) {
      data = allTracesMap[fileKey];
    } else {
      // Try API route
      try {
        const res = await fetch(`/api/traces/${encodeURIComponent(traceId)}`);
        if (res.ok) data = await res.json();
      } catch (_) {}

      // Try static traces mount
      if (!data) {
        try {
          const res2 = await fetch(`/traces/${encodeURIComponent(fileKey)}`);
          if (res2.ok) data = await res2.json();
        } catch (_) {}
      }

      // Try static embedded traces bundle
      if (!data) {
        try {
          const res3 = await fetch('/static/embedded_traces.json');
          if (res3.ok) {
            allTracesMap = await res3.json();
            data = allTracesMap[fileKey] || allTracesMap[traceId];
          }
        } catch (_) {}
      }
    }

    if (!data) throw new Error(`Trace record ${traceId} could not be retrieved.`);

    data._id = traceId;
    activeTraceData = data;
    renderTraceDetail(data, traceId);
  } catch (err) {
    console.error('Failed to load trace detail:', err);
    if (detailView) {
      detailView.innerHTML = `<div style="padding:2rem;color:#f87171">Failed to load trace details: ${err.message}</div>`;
    }
  }
}

function renderTraceDetail(data, traceId) {
  const titleEl = document.getElementById('tivTitle');
  if (titleEl) {
    titleEl.textContent = data.appointment_id
      ? `Appointment Assessment: ${data.appointment_id}`
      : `Query Trace: ${traceId.replace(/^query_/, '').replace(/_/g, ' ')}`;
  }

  const badgesEl = document.getElementById('tivBadges');
  if (badgesEl) {
    const tools = data.trace || [];
    const isSuccess = data.success !== false;
    badgesEl.innerHTML = `
      <span class="status-pill ${isSuccess ? 'confirmed' : 'unconfirmed'}">${isSuccess ? 'SUCCESS' : 'FAILED'}</span>
      <span class="dhc-badge" style="background:rgba(99,102,241,0.12);color:#a5b4fc;border-color:rgba(99,102,241,0.3)">${tools.length} Tools Executed</span>
      <span class="dhc-badge" style="background:rgba(255,255,255,0.04);color:#94a3b8;border-color:var(--border)">${traceId}.json</span>
    `;
  }

  // Timeline of tool executions
  const timelineEl = document.getElementById('tivTimeline');
  const tools = data.trace || [];
  if (timelineEl) {
    if (!tools.length) {
      timelineEl.innerHTML = '<div style="color:#64748b;font-size:0.8rem;padding:0.5rem 0">No tools were executed for this query (pure LLM reasoning).</div>';
    } else {
      timelineEl.innerHTML = tools.map((step, idx) => `
        <div class="tiv-step-card">
          <div class="tiv-step-header">
            <span class="tiv-step-num">STEP ${idx + 1}</span>
            <span class="tiv-tool-name">${step.tool}</span>
          </div>
          <div class="tiv-step-body">
            <div class="tiv-args-row">
              <span style="color:#64748b;font-size:0.7rem;text-transform:uppercase">Input Arguments:</span>
              <span style="color:#e2e8f0;margin-left:0.4rem">${JSON.stringify(step.arguments)}</span>
            </div>
            <div>
              <span style="color:#64748b;font-size:0.7rem;text-transform:uppercase;display:block;margin-bottom:0.25rem">Tool Execution Output:</span>
              <pre class="tiv-json-result">${JSON.stringify(step.result, null, 2)}</pre>
            </div>
          </div>
        </div>
      `).join('');
    }
  }

  // Final Answer
  setHtml('tivFinalAnswer', formatMarkdown(data.final_answer || 'No final answer recorded in trace.'));

  // Re-run Button
  const rerunBtn = document.getElementById('btnRerunTrace');
  if (rerunBtn) {
    rerunBtn.onclick = () => {
      let query = data.appointment_id
        ? `Analyze ${data.appointment_id}`
        : traceId.replace(/^query_/, '').replace(/_/g, ' ');
      navigateTo('ai');
      setTimeout(() => sendChatQuery(query), 300);
    };
  }
}

// Search and filter listeners for traces
const tracesSearchInput = document.getElementById('tracesSearchInput');
if (tracesSearchInput) {
  tracesSearchInput.addEventListener('input', () => renderTracesList(filterTraces()));
}

document.querySelectorAll('.t-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.t-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeTraceFilter = chip.dataset.filter || 'all';
    renderTracesList(filterTraces());
  });
});

const btnRefreshTraces = document.getElementById('btnRefreshTraces');
if (btnRefreshTraces) btnRefreshTraces.addEventListener('click', loadTraces);

// ──────────────────────────────────────────────────────
// CHARTS
// ──────────────────────────────────────────────────────
const chartInstances = {};

function safeDestroyChart(key) {
  if (chartInstances[key]) {
    try { chartInstances[key].destroy(); } catch(_) {}
    chartInstances[key] = null;
  }
}

const CHART_BASE = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#4a5568', font: { family: 'Inter', size: 11 }, maxRotation: 45 } },
    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#4a5568', font: { family: 'Inter', size: 11 }, stepSize: 1 }, beginAtZero: true },
  }
};

function buildBarChart(rows) {
  try {
    const ctx = document.getElementById('barChart');
    if (!ctx || typeof Chart === 'undefined') return;
    safeDestroyChart('bar');
    const sorted = [...rows].sort((a, b) => (parseInt(b.no_show_count)||0) - (parseInt(a.no_show_count)||0));
    const labels = sorted.map(r => r.patient_name.split(' ')[0] + ' (' + r.appointment_id + ')');
    const vals   = sorted.map(r => parseInt(r.no_show_count) || 0);
    const bgs    = sorted.map(r => {
      const v = parseInt(r.no_show_count) || 0;
      return v >= 4 ? 'rgba(239,68,68,0.8)' : v >= 2 ? 'rgba(245,158,11,0.8)' : 'rgba(99,102,241,0.72)';
    });
    chartInstances['bar'] = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ data: vals, backgroundColor: bgs, borderRadius: 5, borderSkipped: false }] },
      options: { ...CHART_BASE }
    });
  } catch (e) { console.warn('barChart error:', e); }
}

function buildDonutChart(rows) {
  try {
    const ctx    = document.getElementById('donutChart');
    const legend = document.getElementById('donutLegend');
    if (!ctx || typeof Chart === 'undefined') return;
    safeDestroyChart('donut');
    const counts = { Confirmed: 0, Unconfirmed: 0, Pending: 0 };
    rows.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; else counts['Pending']++; });
    const labels = Object.keys(counts);
    const data   = labels.map(l => counts[l]);
    const colors = ['#10b981', '#f59e0b', '#64748b'];
    chartInstances['donut'] = new Chart(ctx, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#0f1422' }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { display: false } } }
    });
    if (legend) {
      legend.innerHTML = labels.map((l, i) => `
        <div class="legend-item">
          <span class="legend-dot" style="background:${colors[i]}"></span>
          <span>${l}</span>
          <span class="legend-count">${data[i]}</span>
        </div>`).join('');
    }
  } catch (e) { console.warn('donutChart error:', e); }
}

function buildAnalyticsBar(rows) {
  try {
    const ctx = document.getElementById('analyticsBarChart');
    if (!ctx || typeof Chart === 'undefined') return;
    safeDestroyChart('analyticsBar');
    const sorted = [...rows].sort((a,b) => (parseInt(b.no_show_count)||0) - (parseInt(a.no_show_count)||0));
    chartInstances['analyticsBar'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: sorted.map(r => r.patient_name),
        datasets: [
          { label: 'No-Shows',    data: sorted.map(r => parseInt(r.no_show_count)||0),    backgroundColor: 'rgba(239,68,68,0.75)',  borderRadius: 4, borderSkipped: false },
          { label: 'Reschedules', data: sorted.map(r => parseInt(r.reschedule_count)||0), backgroundColor: 'rgba(245,158,11,0.65)', borderRadius: 4, borderSkipped: false },
        ]
      },
      options: { ...CHART_BASE, plugins: { legend: { display: true, labels: { color: '#8892aa', font: { family: 'Inter', size: 11 }, boxWidth: 12 } } } }
    });
  } catch (e) { console.warn('analyticsBar error:', e); }
}

function buildAnalyticsDonut(rows) {
  try {
    const ctx    = document.getElementById('analyticsDonut');
    const legend = document.getElementById('analyticsDonutLegend');
    if (!ctx || typeof Chart === 'undefined') return;
    safeDestroyChart('analyticsDonut');
    const types = {};
    rows.forEach(r => { types[r.appointment_type] = (types[r.appointment_type]||0)+1; });
    const labels = Object.keys(types);
    const data   = labels.map(l => types[l]);
    const colors = ['#6366f1','#10b981','#f59e0b','#ec4899','#06b6d4'];
    chartInstances['analyticsDonut'] = new Chart(ctx, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors.slice(0,labels.length), borderWidth: 2, borderColor: '#0f1422' }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { display: false } } }
    });
    if (legend) {
      legend.innerHTML = labels.map((l,i) => `
        <div class="legend-item">
          <span class="legend-dot" style="background:${colors[i]}"></span>
          <span>${l}</span>
          <span class="legend-count">${data[i]}</span>
        </div>`).join('');
    }
  } catch (e) { console.warn('analyticsDonut error:', e); }
}

function buildDoctorLoadChart(rows) {
  try {
    const ctx = document.getElementById('doctorLoadChart');
    if (!ctx || typeof Chart === 'undefined') return;
    safeDestroyChart('doctorLoad');
    const byDoctorDate = {};
    rows.forEach(r => {
      byDoctorDate[r.doctor] = byDoctorDate[r.doctor] || {};
      byDoctorDate[r.doctor][r.appointment_date] = (byDoctorDate[r.doctor][r.appointment_date]||0)+1;
    });
    const doctors  = Object.keys(byDoctorDate);
    const allDates = [...new Set(rows.map(r => r.appointment_date))].sort();
    const colors   = ['rgba(99,102,241,0.78)','rgba(6,182,212,0.72)'];
    chartInstances['doctorLoad'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: allDates,
        datasets: doctors.map((doc, i) => ({
          label: doc,
          data: allDates.map(d => (byDoctorDate[doc][d]) || 0),
          backgroundColor: colors[i % colors.length],
          borderRadius: 4,
          borderSkipped: false,
        }))
      },
      options: { ...CHART_BASE, plugins: { legend: { display: true, labels: { color: '#8892aa', font: { family: 'Inter', size: 11 }, boxWidth: 12 } } } }
    });
  } catch (e) { console.warn('doctorLoadChart error:', e); }
}

// ──────────────────────────────────────────────────────
// LOAD DATA FROM API
// ──────────────────────────────────────────────────────
async function loadData() {
  try {
    const res = await fetch('/api/appointments');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    allRows = json.appointments || [];

    if (!allRows.length) {
      console.warn('No appointments returned from API');
      return;
    }

    try { updateStats(allRows); }          catch(e) { console.warn('stats error', e); }
    try { buildTable(allRows); }           catch(e) { console.warn('table error', e); }
    try { populateDoctorFilter(allRows); } catch(e) { console.warn('filter error', e); }
    try { buildMembersGrid(allRows); }     catch(e) { console.warn('members error', e); }
    try { buildDoctorHeroRow(allRows); }   catch(e) { console.warn('doctors error', e); }
    try { buildBarChart(allRows); }        catch(e) { console.warn('barChart', e); }
    try { buildDonutChart(allRows); }      catch(e) { console.warn('donut', e); }
    try { buildAnalyticsBar(allRows); }    catch(e) { console.warn('analyticsBar', e); }
    try { buildAnalyticsDonut(allRows); }  catch(e) { console.warn('analyticsDonut', e); }
    try { buildDoctorLoadChart(allRows); } catch(e) { console.warn('doctorLoad', e); }

    console.log(`✅ StratAI Dashboard loaded ${allRows.length} appointments`);
  } catch (err) {
    console.error('loadData failed:', err);
    const tbody = document.getElementById('apptTableBody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="13" style="padding:2rem;text-align:center;color:#f87171;">
        ⚠ Could not load appointments: ${err.message}. Make sure server is running.
      </td></tr>`;
    }
  }
}

// ──────────────────────────────────────────────────────
// BOOT
// ──────────────────────────────────────────────────────
async function boot() {
  await loadData();
}

document.addEventListener('DOMContentLoaded', boot);
if (document.readyState !== 'loading') boot();
