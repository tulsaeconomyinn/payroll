/* Economy Suites Payroll — Supabase-backed time tracking + payroll */
const SUPABASE_URL = 'https://vjaibkfckxauoxdsojfn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_yqOFCrP8mBYm32x2cUYFYg_eHMDWB18';
const APP_URL = 'https://tulsaeconomyinn.github.io/payroll/';
const TZ = 'America/Chicago';
const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PROPERTIES = [
  'Tudor (Extended Stay Tulsa)',
  'Economy Suites \u2013 Fairgrounds',
  'Motel 6 (Economy Suites Tulsa Airport)',
  'Economy Inn & Suites',
  'Airport Inn & Suites',
  'Rest Inn',
  'Office'
];

let me = null;        // pr_profiles row for the signed-in user
let myComp = null;     // pr_comp row for the signed-in user
let myOpenEntry = null;
let currentTab = 'home';
let periodsCache = {}; // start_date -> pr_pay_periods row

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => '$' + Number(n || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const hrs = n => (Math.round(Number(n || 0) * 100) / 100).toFixed(2);

/* ---------- TIMEZONE HELPERS (America/Chicago) ---------- */
function chiParts(d) {
  const p = new Intl.DateTimeFormat('en-CA', {timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'}).format(d);
  const [y, m, dd] = p.split('-').map(Number);
  return {y, m, d: dd};
}
function chiDateStr(d) { // 'YYYY-MM-DD' in Chicago
  const p = chiParts(d);
  return `${p.y}-${String(p.m).padStart(2,'0')}-${String(p.d).padStart(2,'0')}`;
}
function chiWeekday(dateStr) { // 0=Sun..6=Sat for a YYYY-MM-DD in Chicago
  const [y, m, d] = dateStr.split('-').map(Number);
  // noon UTC avoids DST edge weirdness when converting back
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}
function fridayOf(dateStr) { // Friday starting the Fri–Thu pay week containing dateStr
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const wd = dt.getUTCDay(); // 0 Sun .. 6 Sat; Friday = 5
  const shift = (wd + 2) % 7; // days since Friday
  dt.setUTCDate(dt.getUTCDate() - shift);
  return dt.toISOString().slice(0, 10);
}
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
function fmtTime(ts) {
  try { return new Date(ts).toLocaleTimeString('en-US', {timeZone: TZ, hour: 'numeric', minute: '2-digit'}); }
  catch(e){ return ''; }
}
function fmtDateTime(ts) {
  try { return new Date(ts).toLocaleString('en-US', {timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'}); }
  catch(e){ return ''; }
}
function fmtDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', {timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric'});
}
function fmtDateShort(dateStr) { // 'Oct 2' — no year
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', {timeZone: 'UTC', month: 'short', day: 'numeric'});
}
function weekLabel(friStr) { // 'Oct 2 – Oct 8 → Payday Oct 9'
  return fmtDateShort(friStr) + ' – ' + fmtDateShort(addDays(friStr, 6)) + ' → Payday ' + fmtDateShort(addDays(friStr, 7));
}
function paydayOf(friStr) { return addDays(friStr, 7); }
function toLocalInput(ts) {
  // UTC timestamp -> 'YYYY-MM-DDTHH:MM' wall time in Chicago (for datetime-local)
  if (!ts) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: TZ, year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false}).formatToParts(new Date(ts));
  const g = t => (parts.find(p => p.type === t) || {}).value;
  let h = g('hour'); if (h === '24') h = '00';
  return `${g('year')}-${g('month')}-${g('day')}T${h}:${g('minute')}`;
}
function tzOffsetMinutes(tz, date) {
  // minutes Chicago wall clock is ahead of UTC at `date`
  const dtf = new Intl.DateTimeFormat('en-US', {timeZone: tz, hour12: false, year: 'numeric',
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'});
  const o = Object.fromEntries(dtf.formatToParts(date).map(p => [p.type, p.value]));
  const asUTC = Date.UTC(o.year, o.month - 1, o.day, o.hour === '24' ? 0 : o.hour, o.minute, o.second);
  return (asUTC - date.getTime()) / 60000;
}
function chicagoWallToISO(localStr) {
  // 'YYYY-MM-DDTHH:MM' interpreted as Chicago wall time -> UTC ISO string
  const [d, t] = localStr.split('T');
  const [y, m, dd] = d.split('-').map(Number);
  const [hh, mm] = (t || '00:00').split(':').map(Number);
  let utc = Date.UTC(y, m - 1, dd, hh, mm);
  for (let i = 0; i < 2; i++) utc = Date.UTC(y, m - 1, dd, hh, mm) - tzOffsetMinutes(TZ, new Date(utc)) * 60000;
  return new Date(utc).toISOString();
}
function entryHours(e) {
  if (!e.clock_out) return null;
  return (new Date(e.clock_out) - new Date(e.clock_in)) / 3600000;
}
function entryWeek(e) { // pay week (Friday) the entry belongs to, by clock-in day in Chicago
  return fridayOf(chiDateStr(new Date(e.clock_in)));
}

/* ---------- GEOLOCATION (never blocks clock in/out) ---------- */
function getPosition() { // resolves {lat, lng} or null
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return; }
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    const timer = setTimeout(() => finish(null), 8000);
    navigator.geolocation.getCurrentPosition(
      pos => { clearTimeout(timer); finish({lat: pos.coords.latitude, lng: pos.coords.longitude}); },
      () => { clearTimeout(timer); finish(null); },
      {enableHighAccuracy: false, timeout: 7000, maximumAge: 60000}
    );
  });
}
function locHtml(e, which) { // 'in' | 'out' — location marker; managers get a map link
  const lat = which === 'in' ? e.clock_in_lat : e.clock_out_lat;
  const lng = which === 'in' ? e.clock_in_lng : e.clock_out_lng;
  if (lat == null || lng == null) return '';
  const tag = (which === 'in' ? 'in' : 'out') + ' 📍';
  if (isManager()) return ` · ${tag} <a href="https://maps.google.com/?q=${lat},${lng}" target="_blank" rel="noopener">map</a>`;
  return ` · ${tag}`;
}

/* ---------- AUTH ---------- */
let inRecovery = false, authMode = 'signin';
function showRecovery() {
  inRecovery = true;
  history.replaceState(null, '', APP_URL);
  ['login-view','app-view','unlinked-view'].forEach(v => $(v).classList.add('hidden'));
  $('recovery-view').classList.remove('hidden');
}
function setAuthMode(mode) {
  authMode = mode;
  $('tab-signin').classList.toggle('active', mode === 'signin');
  $('tab-signup').classList.toggle('active', mode === 'signup');
  $('name-label').classList.toggle('hidden', mode === 'signin');
  $('login-btn').textContent = mode === 'signin' ? 'Sign in' : 'Create account';
  $('forgot-btn').classList.toggle('hidden', mode === 'signup');
  $('login-error').classList.add('hidden'); $('login-info').classList.add('hidden');
}

async function init() {
  client.auth.onAuthStateChange(event => { if (event === 'PASSWORD_RECOVERY') showRecovery(); });
  const hasRecoveryCode = new URLSearchParams(location.search).get('code') || location.hash.includes('type=recovery');
  const { data } = await client.auth.getSession();
  if (hasRecoveryCode) { /* wait for PASSWORD_RECOVERY */ }
  else if (data.session) { await enterApp(data.session.user); }
  else { $('login-view').classList.remove('hidden'); }

  $('tab-signin').onclick = () => setAuthMode('signin');
  $('tab-signup').onclick = () => setAuthMode('signup');
  $('login-btn').onclick = doAuth;
  $('forgot-btn').onclick = doForgotPassword;
  $('recovery-btn').onclick = doRecoverySave;
  initHomescreenHint();
  applySafeAreaFallback();
  $('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') doAuth(); });
  $('unlinked-signout').onclick = async () => { await client.auth.signOut(); location.reload(); };
  $('signout-btn').onclick = async () => { await client.auth.signOut(); location.reload(); };
  $('refresh-btn').onclick = () => renderTab();
  $('user-chip').onclick = e => { if (e.target.closest('#user-menu')) return; $('user-menu').classList.toggle('hidden'); };
  $('change-pw-btn').onclick = changePassword;
  $('modal-overlay').onclick = e => { if (e.target.id === 'modal-overlay') closeModal(); };
}

async function doAuth() {
  const email = $('login-email').value.trim(), password = $('login-password').value;
  const errBox = $('login-error'), infoBox = $('login-info');
  errBox.classList.add('hidden'); infoBox.classList.add('hidden');
  if (!email || !password) { errBox.textContent = 'Enter your email and password.'; errBox.classList.remove('hidden'); return; }
  $('login-btn').textContent = authMode === 'signin' ? 'Signing in…' : 'Creating account…';
  let data, error;
  if (authMode === 'signin') {
    ({ data, error } = await client.auth.signInWithPassword({ email, password }));
  } else {
    const name = $('signup-name').value.trim();
    if (!name) { errBox.textContent = 'Enter your full name.'; errBox.classList.remove('hidden'); $('login-btn').textContent = 'Create account'; return; }
    ({ data, error } = await client.auth.signUp({ email, password, options: { data: { full_name: name } } }));
    if (!error && data.user && !data.session) {
      infoBox.textContent = 'Account created — check your email to confirm, then sign in.';
      infoBox.classList.remove('hidden');
      $('login-btn').textContent = 'Create account';
      return;
    }
  }
  $('login-btn').textContent = authMode === 'signin' ? 'Sign in' : 'Create account';
  if (error) { errBox.textContent = error.message; errBox.classList.remove('hidden'); return; }
  await enterApp(data.user);
}

async function doForgotPassword() {
  const email = $('login-email').value.trim();
  const errBox = $('login-error'), infoBox = $('login-info');
  errBox.classList.add('hidden'); infoBox.classList.add('hidden');
  if (!email) { errBox.textContent = 'Type your email above first.'; errBox.classList.remove('hidden'); return; }
  $('forgot-btn').textContent = 'Sending…';
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: APP_URL });
  $('forgot-btn').textContent = 'Forgot password?';
  if (error) { errBox.textContent = error.message; errBox.classList.remove('hidden'); return; }
  infoBox.textContent = 'Reset link sent — check your email (including spam).';
  infoBox.classList.remove('hidden');
}

async function doRecoverySave() {
  const pw = $('recovery-password').value, confirm = $('recovery-confirm').value;
  const errBox = $('recovery-error');
  errBox.classList.add('hidden');
  if (pw.length < 6) { errBox.textContent = 'Password must be at least 6 characters.'; errBox.classList.remove('hidden'); return; }
  if (pw !== confirm) { errBox.textContent = 'Passwords do not match.'; errBox.classList.remove('hidden'); return; }
  $('recovery-btn').textContent = 'Saving…';
  const { error } = await client.auth.updateUser({ password: pw });
  $('recovery-btn').textContent = 'Save new password';
  if (error) { errBox.textContent = error.message; errBox.classList.remove('hidden'); return; }
  await client.auth.signOut();
  location.reload();
}

function changePassword() {
  $('user-menu').classList.add('hidden');
  openModal(`
    <h3>Change password</h3>
    <label>New password<input type="password" id="npw" placeholder="••••••••"></label>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" id="npw-save">Save</button>
    </div>`);
  $('npw-save').onclick = async () => {
    const pw = $('npw').value;
    if (pw.length < 6) { alert('Password must be at least 6 characters.'); return; }
    const { error } = await client.auth.updateUser({ password: pw });
    if (error) alert(error.message); else { alert('Password updated.'); closeModal(); }
  };
}

/* ---------- PROFILE CLAIM ---------- */
async function enterApp(authUser) {
  const email = (authUser.email || '').toLowerCase();
  // 1. already linked?
  let { data: linked } = await client.from('pr_profiles')
    .select('*').eq('auth_user_id', authUser.id).eq('active', true).maybeSingle();
  if (!linked) {
    // 2. claim the unclaimed row matching this email
    const { data: candidate } = await client.from('pr_profiles')
      .select('id').eq('active', true).is('auth_user_id', null)
      .ilike('email', email).maybeSingle();
    if (candidate) {
      const { data: claimed, error } = await client.from('pr_profiles')
        .update({ auth_user_id: authUser.id }).eq('id', candidate.id).select().single();
      if (!error) linked = claimed;
    }
  }
  if (!linked) {
    $('login-view').classList.add('hidden');
    $('unlinked-view').classList.remove('hidden');
    $('unlinked-msg').textContent =
      `Signed in as ${authUser.email}, but no employee record matches. Ask your manager to add you, then sign in again.`;
    return;
  }
  me = linked;
  const { data: comp } = await client.from('pr_comp').select('*').eq('user_id', me.id).maybeSingle();
  myComp = comp || null;
  $('login-view').classList.add('hidden');
  $('unlinked-view').classList.add('hidden');
  $('recovery-view').classList.add('hidden');
  $('app-view').classList.remove('hidden');
  $('user-name').textContent = me.full_name || me.email;
  buildNav();
  await refreshOpenEntry();
  await renderTab();
}

async function refreshOpenEntry() {
  const { data } = await client.from('pr_time_entries')
    .select('*').eq('user_id', me.id).is('clock_out', null)
    .order('clock_in', {ascending: false}).limit(1).maybeSingle();
  myOpenEntry = data || null;
}

function isManager() { return me && me.role === 'manager'; }

/* ---------- NAV ---------- */
function tabsForRole() {
  if (isManager()) return [
    ['home', '⏱️', 'Clock'],
    ['dashboard', '📊', 'Team'],
    ['timesheets', '📝', 'Sheets'],
    ['payroll', '💵', 'Payroll'],
    ['payhistory', '🧾', 'History'],
    ['timeoff', '🏖️', 'Time Off'],
    ['team', '👥', 'Staff'],
  ];
  return [
    ['home', '⏱️', 'Clock'],
    ['timesheet', '📝', 'Timesheet'],
    ['timeoff', '🏖️', 'Time Off'],
    ['pay', '💵', 'Pay'],
    ['payhistory', '🧾', 'History'],
  ];
}
function buildNav() {
  const bar = $('tab-bar');
  bar.innerHTML = tabsForRole().map(([id, icon, label]) =>
    `<button data-tab="${id}" class="tab${id === currentTab ? ' active' : ''}">${icon}<span>${label}</span></button>`).join('');
  bar.querySelectorAll('.tab').forEach(t => t.onclick = () => { currentTab = t.dataset.tab; buildNav(); renderTab(); });
}
async function renderTab() {
  const content = $('tab-content');
  content.innerHTML = '<div class="loading">Loading…</div>';
  await refreshOpenEntry();
  try {
    if (currentTab === 'home') await viewHome(content);
    else if (currentTab === 'timesheet') await viewTimesheet(content);
    else if (currentTab === 'timeoff') await viewTimeOff(content);
    else if (currentTab === 'pay') await viewPay(content);
    else if (currentTab === 'dashboard') await viewDashboard(content);
    else if (currentTab === 'timesheets') await viewTimesheets(content);
    else if (currentTab === 'payroll') await viewPayroll(content);
    else if (currentTab === 'payhistory') await viewPayHistory(content);
    else if (currentTab === 'team') await viewTeam(content);
  } catch (e) {
    content.innerHTML = `<div class="card"><div class="error-box">Something went wrong: ${esc(e.message)}</div>
      <button class="btn-secondary" onclick="renderTab()">Try again</button></div>`;
  }
}

/* ---------- MODAL ---------- */
function openModal(html) { $('modal-box').innerHTML = html; $('modal-overlay').classList.remove('hidden'); }
function closeModal() { $('modal-overlay').classList.add('hidden'); $('modal-box').innerHTML = ''; }
window.closeModal = closeModal; window.renderTab = renderTab;

/* ---------- PAY PERIODS ---------- */
async function getPeriod(friStr) {
  if (periodsCache[friStr]) return periodsCache[friStr];
  const { data } = await client.from('pr_pay_periods').select('*').eq('start_date', friStr).maybeSingle();
  const row = data || null;
  periodsCache[friStr] = row;
  return row;
}
async function ensurePeriod(friStr) {
  let p = await getPeriod(friStr);
  if (p) return p;
  const { data, error } = await client.from('pr_pay_periods')
    .insert({start_date: friStr, end_date: addDays(friStr, 6)}).select().single();
  if (error) { // race: someone else created it
    const retry = await client.from('pr_pay_periods').select('*').eq('start_date', friStr).maybeSingle();
    periodsCache[friStr] = retry.data || null;
    return periodsCache[friStr];
  }
  periodsCache[friStr] = data;
  return data;
}

document.addEventListener('DOMContentLoaded', init);

/* ---------- PWA: service worker (guarded, failures are silent) ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

/* ---------- Home-screen hint (dismissible, remembered) ---------- */
/* iOS standalone fallback: some home-screen installs (e.g. added from a
   non-Safari browser) don't resolve env() safe-area insets. Detect that and
   compensate with fixed padding so the header never hides under the status bar. */
function applySafeAreaFallback() {
  try {
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
    if (!isIOS || !isStandalone) return;
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;top:0;left:0;visibility:hidden;padding-top:env(safe-area-inset-top);';
    document.body.appendChild(probe);
    const px = parseFloat(getComputedStyle(probe).paddingTop) || 0;
    probe.remove();
    if (px < 1) document.documentElement.classList.add('ios-standalone-nofit');
  } catch (e) { /* never break the app over a layout probe */ }
}

function initHomescreenHint() {
  const hint = $('homescreen-hint');
  if (!hint) return;
  try {
    if (localStorage.getItem('esp_hint_dismissed') === '1') return;
  } catch (e) { /* storage unavailable — show the hint */ }
  hint.classList.remove('hidden');
  $('homescreen-hint-close').onclick = () => {
    hint.classList.add('hidden');
    try { localStorage.setItem('esp_hint_dismissed', '1'); } catch (e) {}
  };
}

/* ================= EMPLOYEE VIEWS ================= */

/* ---------- HOME: clock in / out ---------- */
async function viewHome(content) {
  const todayStr = chiDateStr(new Date());
  const weekFri = fridayOf(todayStr);
  // today's entries + this week's entries
  const { data: entries } = await client.from('pr_time_entries')
    .select('*').eq('user_id', me.id)
    .gte('clock_in', weekFri + 'T00:00:00Z').order('clock_in', {ascending: false});
  const all = entries || [];
  const todayEntries = all.filter(e => chiDateStr(new Date(e.clock_in)) === todayStr);
  const todayHrs = todayEntries.reduce((s, e) => s + (entryHours(e) || 0), 0);
  const weekHrs = all.reduce((s, e) => s + (entryHours(e) || 0), 0);
  // open entry from a previous day = missed clock-out
  const staleOpen = myOpenEntry && chiDateStr(new Date(myOpenEntry.clock_in)) !== todayStr ? myOpenEntry : null;
  // who's off today (approved PTO covering today)
  const { data: ptoToday } = await client.from('pr_pto_requests')
    .select('*, pr_profiles!pr_pto_requests_user_id_fkey(full_name)')
    .eq('status', 'approved').lte('start_date', todayStr).gte('end_date', todayStr);
  const offNames = (ptoToday || []).filter(r => r.user_id !== me.id)
    .map(r => (r.pr_profiles && r.pr_profiles.full_name) || 'A teammate');

  const period = await getPeriod(weekFri);
  const locked = period && period.status === 'closed';

  let html = `<div class="section-head"><h2>Hi, ${esc(me.full_name || 'there')} 👋</h2></div>`;

  if (staleOpen) {
    html += `<div class="warn-box">⚠️ You have a missed clock-out from ${fmtDateTime(staleOpen.clock_in)}.
      <br><button class="btn-secondary btn-small" style="margin-top:8px" id="fix-stale">Close it now</button></div>`;
  }
  if (locked && !myOpenEntry) {
    html += `<div class="warn-box">🔒 This pay week is closed — no new clock-ins. Ask your manager to reopen it if you need a correction.</div>`;
  }

  html += `<div class="card">`;
  if (myOpenEntry) {
    const since = new Date(myOpenEntry.clock_in);
    const liveHrs = (Date.now() - since.getTime()) / 3600000;
    html += `<div class="muted" style="text-align:center;margin-bottom:6px">Clocked in since <b>${fmtTime(myOpenEntry.clock_in)}</b> · ${esc(myOpenEntry.property || '')}</div>
      <button class="clock-btn out" id="clock-btn">Clock Out</button>
      <div class="clock-sub">On the clock: ~${hrs(liveHrs)} hrs so far</div>`;
  } else {
    html += `<div class="inline-form" style="margin-bottom:10px">
        <label>Work location
          <select id="clock-property">${PROPERTIES.map(p => `<option ${p === me.property ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
        </label></div>
      <button class="clock-btn" id="clock-btn" ${locked ? 'disabled' : ''}>Clock In</button>
      <div class="clock-sub">${todayStr} · ${new Date().toLocaleTimeString('en-US', {timeZone: TZ, hour: 'numeric', minute: '2-digit'})} CT</div>`;
  }
  html += `</div>`;

  html += `<div class="kpi-row">
    <div class="kpi"><div class="v">${hrs(todayHrs)}</div><div class="l">Hours today</div></div>
    <div class="kpi"><div class="v">${hrs(weekHrs)}</div><div class="l">Hours this week</div></div>
    <div class="kpi"><div class="v">${myComp ? (me.pay_type === 'salary' ? 'Salary' : money(myComp.pay_rate) + '/hr') : '—'}</div><div class="l">My pay rate</div></div>
  </div>`;

  html += `<div class="card"><div class="t" style="font-weight:800;margin-bottom:8px">🏖️ Who's off today</div>`;
  html += offNames.length
    ? offNames.map(n => `<div class="rowline"><div class="t">${esc(n)}</div><div><span class="pill approved">on PTO</span></div></div>`).join('')
    : `<div class="muted">Nobody — full crew today.</div>`;
  html += `</div>`;

  content.innerHTML = html;

  if (staleOpen) $('fix-stale').onclick = () => fixStaleEntry(staleOpen);
  const btn = $('clock-btn');
  if (btn && !btn.disabled) btn.onclick = myOpenEntry ? doClockOut : doClockIn;
}

async function doClockIn() {
  const property = $('clock-property') ? $('clock-property').value : me.property;
  const btn = $('clock-btn');
  btn.disabled = true; btn.textContent = 'Getting location…';
  const loc = await getPosition(); // null if denied/unavailable — never blocks
  btn.textContent = 'Clocking in…';
  const { error } = await client.from('pr_time_entries').insert({
    user_id: me.id, clock_in: new Date().toISOString(), property,
    clock_in_lat: loc ? loc.lat : null, clock_in_lng: loc ? loc.lng : null
  });
  if (error) { alert('Could not clock in: ' + error.message); }
  periodsCache = {};
  await renderTab();
}

async function doClockOut() {
  if (!myOpenEntry) return;
  const btn = $('clock-btn');
  btn.disabled = true; btn.textContent = 'Getting location…';
  const loc = await getPosition(); // null if denied/unavailable — never blocks
  btn.textContent = 'Clocking out…';
  const { error } = await client.from('pr_time_entries')
    .update({ clock_out: new Date().toISOString(),
      clock_out_lat: loc ? loc.lat : null, clock_out_lng: loc ? loc.lng : null })
    .eq('id', myOpenEntry.id);
  if (error) { alert('Could not clock out: ' + error.message); }
  periodsCache = {};
  await renderTab();
}

function fixStaleEntry(entry) {
  openModal(`
    <h3>Close missed clock-out</h3>
    <p class="muted">You clocked in ${fmtDateTime(entry.clock_in)} and never clocked out. Enter the time you actually left:</p>
    <label>Date &amp; time left
      <input type="datetime-local" id="stale-out" value="">
    </label>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" id="stale-save">Save clock-out</button>
    </div>`);
  $('stale-save').onclick = async () => {
    const v = $('stale-out').value;
    if (!v) { alert('Enter the time you left.'); return; }
    const outISO = chicagoWallToISO(v);
    if (new Date(outISO) <= new Date(entry.clock_in)) { alert('Clock-out must be after clock-in.'); return; }
    const { error } = await client.from('pr_time_entries')
      .update({ clock_out: outISO, note: 'Employee closed missed clock-out' }).eq('id', entry.id);
    if (error) alert(error.message); else { closeModal(); await renderTab(); }
  };
}

/* ---------- TIMESHEET ---------- */
let tsWeek = null;
async function viewTimesheet(content, managerMode, targetUserId, targetName) {
  const uid = targetUserId || me.id;
  if (!tsWeek) tsWeek = fridayOf(chiDateStr(new Date()));
  const { data: entries } = await client.from('pr_time_entries')
    .select('*').eq('user_id', uid)
    .gte('clock_in', tsWeek + 'T00:00:00Z').lt('clock_in', addDays(tsWeek, 7) + 'T00:00:00Z')
    .order('clock_in', {ascending: true});
  const all = entries || [];
  const period = await getPeriod(tsWeek);
  const locked = period && period.status === 'closed';

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(tsWeek, i);
    const des = all.filter(e => chiDateStr(new Date(e.clock_in)) === d);
    const h = des.reduce((s, e) => s + (entryHours(e) || 0), 0);
    days.push({d, entries: des, hours: h});
  }
  const weekHrs = days.reduce((s, x) => s + x.hours, 0);

  let html = `<div class="section-head"><h2>${managerMode ? esc(targetName) + "'s Timesheet" : 'My Timesheet'}</h2></div>
  <div class="card"><div class="cal-nav">
    <button class="btn-secondary btn-small" id="ts-prev">← Prev</button>
    <div style="flex:1;text-align:center;font-weight:800">${weekLabel(tsWeek)}
      ${locked ? ' <span class="pill closed">closed</span>' : ' <span class="pill open">open</span>'}</div>
    <button class="btn-secondary btn-small" id="ts-next">Next →</button>
  </div></div>`;

  if (!all.length) {
    html += `<div class="card"><div class="empty"><div class="big">📝</div>No time entries this week.</div></div>`;
  } else {
    html += days.map(({d, entries: des, hours: h}) => {
      if (!des.length) return '';
      const wd = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][chiWeekday(d)];
      return `<div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <b>${wd}, ${fmtDate(d)}</b><b>${hrs(h)} hrs</b>
        </div>` +
        des.map(e => {
          const h2 = entryHours(e);
          return `<div class="rowline">
            <div><div class="t">${fmtTime(e.clock_in)} → ${e.clock_out ? fmtTime(e.clock_out) : '<span class="pill pending">open</span>'}</div>
            <div class="s">${esc(e.property || '')}${e.note ? ' · ' + esc(e.note) : ''}${e.edited_by ? ' · ✏️ corrected' : ''}${locHtml(e, 'in')}${locHtml(e, 'out')}</div></div>
            <div class="num"><b>${h2 == null ? '—' : hrs(h2)}</b></div>
          </div>`;
        }).join('') + `</div>`;
    }).join('');
  }

  html += `<div class="kpi-row" style="grid-template-columns:1fr">
    <div class="kpi"><div class="v">${hrs(weekHrs)}</div><div class="l">Total hours this week</div></div>
  </div>`;

  content.innerHTML = html;
  $('ts-prev').onclick = () => { tsWeek = addDays(tsWeek, -7); renderTab(); };
  $('ts-next').onclick = () => { tsWeek = addDays(tsWeek, 7); renderTab(); };
}

/* ---------- TIME OFF ---------- */
let calMonth = null; // 'YYYY-MM'
async function viewTimeOff(content) {
  const { data: mine } = await client.from('pr_pto_requests')
    .select('*').eq('user_id', me.id).order('start_date', {ascending: false}).limit(20);
  let pendingHtml = '';
  if (isManager()) {
    const { data: pending } = await client.from('pr_pto_requests')
      .select('*, pr_profiles!pr_pto_requests_user_id_fkey(full_name)')
      .eq('status', 'pending').order('start_date');
    pendingHtml = `<div class="card"><div class="t" style="font-weight:800;margin-bottom:8px">⏳ Pending approvals (${(pending || []).length})</div>` +
      ((pending || []).length ? pending.map(r => {
        const nm = (r.pr_profiles && r.pr_profiles.full_name) || '—';
        return `<div class="rowline"><div><div class="t">${esc(nm)}</div>
          <div class="s">${fmtDate(r.start_date)} → ${fmtDate(r.end_date)} · ${esc(r.pto_type)}${r.reason ? ' · ' + esc(r.reason) : ''}</div></div>
          <div style="display:flex;gap:6px">
            <button class="btn-secondary btn-small btn-ok" data-approve="${r.id}">Approve</button>
            <button class="btn-secondary btn-small btn-danger" data-deny="${r.id}">Deny</button>
          </div></div>`;
      }).join('') : `<div class="muted">No pending requests.</div>`) + `</div>`;
  }
  const todayStr = chiDateStr(new Date());
  if (!calMonth) calMonth = todayStr.slice(0, 7);
  const [cy, cm] = calMonth.split('-').map(Number);
  const firstDow = chiWeekday(`${calMonth}-01`);
  const daysInMonth = new Date(Date.UTC(cy, cm, 0)).getUTCDate();
  const monthStart = `${calMonth}-01`, monthEnd = `${calMonth}-${String(daysInMonth).padStart(2,'0')}`;
  // approved PTO overlapping this month (all staff — names only)
  const { data: approved } = await client.from('pr_pto_requests')
    .select('start_date, end_date, user_id, pr_profiles!pr_pto_requests_user_id_fkey(full_name)')
    .eq('status', 'approved').lte('start_date', monthEnd).gte('end_date', monthStart);
  const byDay = {};
  (approved || []).forEach(r => {
    const name = (r.pr_profiles && r.pr_profiles.full_name) || 'Teammate';
    for (let d = r.start_date; d <= r.end_date; d = addDays(d, 1)) {
      (byDay[d] = byDay[d] || []).push(name + (r.user_id === me.id ? ' (you)' : ''));
    }
  });

  const monthName = new Date(Date.UTC(cy, cm - 1, 1)).toLocaleDateString('en-US', {month: 'long', year: 'numeric', timeZone: 'UTC'});
  let cal = `<div class="cal-grid">` +
    ['S','M','T','W','T','F','S'].map(d => `<div class="cal-dow">${d}</div>`).join('');
  for (let i = 0; i < firstDow; i++) cal += `<div class="cal-day dim"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${calMonth}-${String(d).padStart(2,'0')}`;
    const names = byDay[ds] || [];
    cal += `<div class="cal-day${names.length ? ' off' : ''}${ds === todayStr ? ' today' : ''}">
      <div class="d">${d}</div>${names.slice(0,3).map(n => `<div class="cal-name">🏖️ ${esc(n)}</div>`).join('')}
      ${names.length > 3 ? `<div class="cal-name">+${names.length - 3} more</div>` : ''}</div>`;
  }
  cal += `</div>`;

  let html = `<div class="section-head"><h2>Time Off</h2>
    <button class="btn-primary btn-small" id="pto-new">+ Request time off</button></div>` + pendingHtml;

  html += `<div class="card"><div class="t" style="font-weight:800;margin-bottom:8px">My requests</div>`;
  html += (mine && mine.length)
    ? mine.map(r => `<div class="rowline">
        <div><div class="t">${fmtDate(r.start_date)} → ${fmtDate(r.end_date)}</div>
        <div class="s">${esc(r.pto_type)}${r.reason ? ' · ' + esc(r.reason) : ''}</div></div>
        <div style="display:flex;gap:6px;align-items:center"><span class="pill ${r.status}">${r.status}</span>
        ${r.status === 'pending' ? `<button class="btn-secondary btn-small" data-cancel="${r.id}">Cancel</button>` : ''}</div>
      </div>`).join('')
    : `<div class="muted">No requests yet.</div>`;
  html += `</div>`;

  html += `<div class="card"><div class="cal-nav" style="margin-bottom:10px">
      <button class="btn-secondary btn-small" id="cal-prev">←</button>
      <div style="flex:1;text-align:center;font-weight:800">${monthName}</div>
      <button class="btn-secondary btn-small" id="cal-next">→</button>
    </div>${cal}
    <div class="muted" style="margin-top:8px">Shows approved time off for the whole team (names only).</div></div>`;

  content.innerHTML = html;
  $('pto-new').onclick = ptoRequestModal;
  $('cal-prev').onclick = () => { const d = new Date(Date.UTC(cy, cm - 2, 1)); calMonth = d.toISOString().slice(0,7); renderTab(); };
  $('cal-next').onclick = () => { const d = new Date(Date.UTC(cy, cm, 1)); calMonth = d.toISOString().slice(0,7); renderTab(); };
  content.querySelectorAll('[data-cancel]').forEach(b => b.onclick = async () => {
    if (!confirm('Cancel this request?')) return;
    const { error } = await client.from('pr_pto_requests').delete().eq('id', b.dataset.cancel);
    if (error) alert(error.message); else renderTab();
  });
  content.querySelectorAll('[data-approve]').forEach(b => b.onclick = () => decidePto(b.dataset.approve, 'approved'));
  content.querySelectorAll('[data-deny]').forEach(b => b.onclick = () => decidePto(b.dataset.deny, 'denied'));
}

function ptoRequestModal() {
  const today = chiDateStr(new Date());
  openModal(`
    <h3>Request time off</h3>
    <label>Type
      <select id="pto-type"><option value="vacation">Vacation</option><option value="sick">Sick</option><option value="personal">Personal</option></select>
    </label>
    <label>Start date<input type="date" id="pto-start" value="${today}" min="${today}"></label>
    <label>End date<input type="date" id="pto-end" value="${today}" min="${today}"></label>
    <label>Reason (optional)<textarea id="pto-reason" rows="2" placeholder="Anything your manager should know"></textarea></label>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" id="pto-save">Submit request</button>
    </div>`);
  $('pto-save').onclick = async () => {
    const start_date = $('pto-start').value, end_date = $('pto-end').value;
    if (!start_date || !end_date) { alert('Pick start and end dates.'); return; }
    if (end_date < start_date) { alert('End date must be on or after start date.'); return; }
    const { error } = await client.from('pr_pto_requests').insert({
      user_id: me.id, start_date, end_date,
      pto_type: $('pto-type').value, reason: $('pto-reason').value.trim() || null
    });
    if (error) alert(error.message); else { closeModal(); await renderTab(); }
  };
}

/* ---------- PAY (employee stubs): total hours × rate = gross ---------- */
function grossForWeek(totalHrs, comp, payType) {
  if (!comp) return {hours: 0, gross: 0, rate: 0, note: 'No pay rate set — ask your manager.'};
  if (payType === 'salary') {
    const weekly = Number(comp.pay_rate) / 52;
    return {hours: totalHrs, gross: weekly, rate: weekly, note: 'Salary — paid weekly.'};
  }
  const rate = Number(comp.pay_rate);
  return {hours: totalHrs, gross: totalHrs * rate, rate, note: null};
}

async function viewPay(content) {
  const { data: entries } = await client.from('pr_time_entries')
    .select('clock_in, clock_out').eq('user_id', me.id)
    .not('clock_out', 'is', null).order('clock_in', {ascending: false}).limit(500);
  const weeks = {};
  (entries || []).forEach(e => {
    const w = entryWeek(e);
    weeks[w] = (weeks[w] || 0) + entryHours(e);
  });
  const wkList = Object.keys(weeks).sort().reverse().slice(0, 12);

  let html = `<div class="section-head"><h2>My Pay</h2></div>
  <div class="card"><div class="rowline"><div><div class="t">${esc(me.full_name || '')}</div>
    <div class="s">${esc(me.property || '')} · ${esc(me.pay_type)}</div></div>
    <div class="num"><b>${myComp ? (me.pay_type === 'salary' ? money(myComp.pay_rate) + '/yr' : money(myComp.pay_rate) + '/hr') : '—'}</b><div class="s">my rate</div></div></div></div>`;

  if (!wkList.length) {
    html += `<div class="card"><div class="empty"><div class="big">💵</div>No pay stubs yet — clock in to start earning one.</div></div>`;
  } else {
    html += wkList.map(w => {
      const g = grossForWeek(weeks[w], myComp, me.pay_type);
      return `<div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <b>${weekLabel(w)}</b><b style="font-size:18px">${money(g.gross)}</b>
        </div>
        <div class="rowline"><div class="s">Total hours</div><div class="num">${hrs(g.hours)}</div></div>
        <div class="rowline"><div class="s">Rate</div><div class="num">${me.pay_type === 'salary' ? money(g.rate) + '/wk' : money(g.rate) + '/hr'}</div></div>
        ${g.note ? `<div class="muted" style="margin-top:6px">${esc(g.note)}</div>` : ''}
      </div>`;
    }).join('');
  }
  html += `<div class="muted">Estimates from clocked hours before taxes &amp; deductions. Final pay is cut by your manager.</div>`;
  content.innerHTML = html;
}

/* ================= MANAGER VIEWS ================= */

/* ---------- DASHBOARD: who's in, pending PTO, week totals ---------- */
async function viewDashboard(content) {
  const weekFri = fridayOf(chiDateStr(new Date()));
  const [profilesRes, openRes, pendingRes, weekRes] = await Promise.all([
    client.from('pr_profiles').select('id, full_name, property, active').eq('active', true).order('full_name'),
    client.from('pr_time_entries').select('*, pr_profiles!pr_time_entries_user_id_fkey(full_name, property)').is('clock_out', null).order('clock_in'),
    client.from('pr_pto_requests').select('*, pr_profiles!pr_pto_requests_user_id_fkey(full_name)').eq('status', 'pending').order('start_date'),
    client.from('pr_time_entries').select('user_id, clock_in, clock_out')
      .gte('clock_in', weekFri + 'T00:00:00Z').not('clock_out', 'is', null)
  ]);
  const profiles = profilesRes.data || [];
  const openList = openRes.data || [];
  const pending = pendingRes.data || [];
  const weekHrs = (weekRes.data || []).reduce((s, e) => s + entryHours(e), 0);

  let html = `<div class="section-head"><h2>Team Dashboard</h2></div>
  <div class="kpi-row">
    <div class="kpi"><div class="v">${openList.length}</div><div class="l">Clocked in now</div></div>
    <div class="kpi"><div class="v">${pending.length}</div><div class="l">PTO requests</div></div>
    <div class="kpi"><div class="v">${hrs(weekHrs)}</div><div class="l">Team hrs this wk</div></div>
  </div>`;

  html += `<div class="card"><div class="t" style="font-weight:800;margin-bottom:8px">🟢 On the clock now</div>`;
  html += openList.length ? openList.map(e => {
    const p = e.pr_profiles || {};
    const liveH = (Date.now() - new Date(e.clock_in).getTime()) / 3600000;
    return `<div class="rowline"><div><div class="t">${esc(p.full_name || '—')}</div>
      <div class="s">${esc(e.property || p.property || '')} · since ${fmtTime(e.clock_in)}</div></div>
      <div class="num"><b>${hrs(liveH)}h</b></div></div>`;
  }).join('') : `<div class="muted">Nobody clocked in right now.</div>`;
  html += `</div>`;

  html += `<div class="card"><div class="t" style="font-weight:800;margin-bottom:8px">🏖️ Pending time-off requests</div>`;
  html += pending.length ? pending.map(r => {
    const p = r.pr_profiles || {};
    return `<div class="rowline"><div><div class="t">${esc(p.full_name || '—')}</div>
      <div class="s">${fmtDate(r.start_date)} → ${fmtDate(r.end_date)} · ${esc(r.pto_type)}${r.reason ? ' · ' + esc(r.reason) : ''}</div></div>
      <div style="display:flex;gap:6px">
        <button class="btn-secondary btn-small btn-ok" data-approve="${r.id}">Approve</button>
        <button class="btn-secondary btn-small btn-danger" data-deny="${r.id}">Deny</button>
      </div></div>`;
  }).join('') : `<div class="muted">No pending requests. 🎉</div>`;
  html += `</div>`;

  html += `<div class="card"><div class="t" style="font-weight:800;margin-bottom:8px">👥 Active staff (${profiles.length})</div>`;
  html += profiles.map(p => `<div class="rowline"><div><div class="t">${esc(p.full_name || p.email || '—')}</div>
    <div class="s">${esc(p.property || '')}</div></div></div>`).join('') || `<div class="muted">No staff yet — add your team under Staff.</div>`;
  html += `</div>`;

  content.innerHTML = html;
  content.querySelectorAll('[data-approve]').forEach(b => b.onclick = () => decidePto(b.dataset.approve, 'approved'));
  content.querySelectorAll('[data-deny]').forEach(b => b.onclick = () => decidePto(b.dataset.deny, 'denied'));
}

async function decidePto(id, status) {
  const { error } = await client.from('pr_pto_requests')
    .update({ status, decided_by: me.id, decided_at: new Date().toISOString() }).eq('id', id);
  if (error) alert(error.message); else renderTab();
}

/* ---------- MANAGER TIMESHEETS ---------- */
let mTsWeek = null, mTsProp = 'all', mTsUser = 'all';
async function viewTimesheets(content) {
  if (!mTsWeek) mTsWeek = fridayOf(chiDateStr(new Date()));
  const { data: profiles } = await client.from('pr_profiles')
    .select('id, full_name, property').eq('active', true).order('full_name');
  const plist = profiles || [];
  const { data: entries } = await client.from('pr_time_entries')
    .select('*, pr_profiles!pr_time_entries_user_id_fkey(full_name)')
    .gte('clock_in', mTsWeek + 'T00:00:00Z').lt('clock_in', addDays(mTsWeek, 7) + 'T00:00:00Z')
    .order('clock_in', {ascending: true});
  let all = entries || [];
  if (mTsProp !== 'all') all = all.filter(e => (e.property || '') === mTsProp);
  if (mTsUser !== 'all') all = all.filter(e => e.user_id === mTsUser);
  const period = await getPeriod(mTsWeek);
  const locked = period && period.status === 'closed';

  const byUser = {};
  all.forEach(e => {
    (byUser[e.user_id] = byUser[e.user_id] || []).push(e);
  });

  let html = `<div class="section-head"><h2>Timesheets</h2></div>
  <div class="card"><div class="inline-form">
    <div class="inline-row">
      <label>Week
        <div class="cal-nav"><button class="btn-secondary btn-small" id="mts-prev">←</button>
        <div style="flex:1;text-align:center;font-weight:700;font-size:13px">${weekLabel(mTsWeek)}</div>
        <button class="btn-secondary btn-small" id="mts-next">→</button></div>
      </label>
    </div>
    <div class="inline-row">
      <label>Property
        <select id="mts-prop"><option value="all">All properties</option>
        ${PROPERTIES.map(p => `<option ${p === mTsProp ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
      </label>
      <label>Employee
        <select id="mts-user"><option value="all">Everyone</option>
        ${plist.map(p => `<option value="${p.id}" ${p.id === mTsUser ? 'selected' : ''}>${esc(p.full_name || '')}</option>`).join('')}</select>
      </label>
    </div>
    ${locked ? '<div class="warn-box" style="margin:8px 0 0">🔒 This week is closed. Reopen it from Payroll to make corrections.</div>' : ''}
  </div></div>`;

  const uids = Object.keys(byUser);
  if (!uids.length) {
    html += `<div class="card"><div class="empty"><div class="big">📝</div>No entries match these filters.</div></div>`;
  } else {
    html += uids.map(uid => {
      const es = byUser[uid];
      const nm = (es[0].pr_profiles && es[0].pr_profiles.full_name) || '—';
      const th = es.reduce((s, e) => s + (entryHours(e) || 0), 0);
      return `<div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <b>${esc(nm)}</b><b>${hrs(th)} hrs</b></div>` +
        es.map(e => `<div class="rowline">
          <div><div class="t">${fmtDateTime(e.clock_in)} → ${e.clock_out ? fmtTime(e.clock_out) : '<span class="pill pending">open</span>'}</div>
          <div class="s">${esc(e.property || '')}${e.note ? ' · ' + esc(e.note) : ''}${e.edited_by ? ' · ✏️ corrected' : ''}${locHtml(e, 'in')}${locHtml(e, 'out')}</div></div>
          <div style="display:flex;gap:6px;align-items:center"><b>${entryHours(e) == null ? '—' : hrs(entryHours(e))}</b>
          ${!locked ? `<button class="btn-secondary btn-small" data-edit="${e.id}">Edit</button>` : ''}</div>
        </div>`).join('') + `</div>`;
    }).join('');
  }

  content.innerHTML = html;
  $('mts-prev').onclick = () => { mTsWeek = addDays(mTsWeek, -7); renderTab(); };
  $('mts-next').onclick = () => { mTsWeek = addDays(mTsWeek, 7); renderTab(); };
  $('mts-prop').onchange = e => { mTsProp = e.target.value; renderTab(); };
  $('mts-user').onchange = e => { mTsUser = e.target.value; renderTab(); };
  content.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editEntryModal(b.dataset.edit));
}

async function editEntryModal(entryId) {
  const { data: e } = await client.from('pr_time_entries').select('*').eq('id', entryId).single();
  if (!e) { alert('Entry not found.'); return; }
  openModal(`
    <h3>Correct time entry</h3>
    <label>Clock in (CT)<input type="datetime-local" id="ee-in" value="${toLocalInput(e.clock_in)}"></label>
    <label>Clock out (CT) — leave blank if still working<input type="datetime-local" id="ee-out" value="${toLocalInput(e.clock_out)}"></label>
    <label>Property
      <select id="ee-prop">${PROPERTIES.map(p => `<option ${p === e.property ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
    </label>
    <label>Note<input type="text" id="ee-note" value="${esc(e.note || '')}" placeholder="Reason for correction"></label>
    <div class="modal-actions">
      <button class="btn-secondary btn-danger" id="ee-del">Delete</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" id="ee-save">Save</button>
    </div>`);
  $('ee-save').onclick = async () => {
    const ci = $('ee-in').value, co = $('ee-out').value;
    if (!ci) { alert('Clock-in is required.'); return; }
    const clock_in = new Date(chicagoWallToISO(ci)), clock_out = co ? new Date(chicagoWallToISO(co)) : null;
    if (clock_out && clock_out <= clock_in) { alert('Clock-out must be after clock-in.'); return; }
    const { error } = await client.from('pr_time_entries').update({
      clock_in: clock_in.toISOString(),
      clock_out: clock_out ? clock_out.toISOString() : null,
      property: $('ee-prop').value,
      note: $('ee-note').value.trim() || null,
      edited_by: me.id
    }).eq('id', entryId);
    if (error) alert(error.message); else { closeModal(); await renderTab(); }
  };
  $('ee-del').onclick = async () => {
    if (!confirm('Delete this entry permanently?')) return;
    const { error } = await client.from('pr_time_entries').delete().eq('id', entryId);
    if (error) alert(error.message); else { closeModal(); await renderTab(); }
  };
}

/* ---------- PAYROLL RUN ---------- */
let prWeek = null;
async function viewPayroll(content) {
  if (!prWeek) prWeek = fridayOf(chiDateStr(new Date()));
  const period = await ensurePeriod(prWeek);
  const locked = period.status === 'closed';
  const payday = paydayOf(prWeek);

  // entries across recent weeks (for running balances) + all recorded payments
  const since = addDays(prWeek, -7 * 26);
  const [{ data: profiles }, { data: compRows }, { data: entries }, { data: payments }] = await Promise.all([
    client.from('pr_profiles').select('id, full_name, email, property, pay_type').eq('active', true).order('full_name'),
    client.from('pr_comp').select('user_id, pay_rate'),
    client.from('pr_time_entries').select('user_id, clock_in, clock_out')
      .gte('clock_in', since + 'T00:00:00Z').not('clock_out', 'is', null),
    client.from('pr_payments').select('*')
  ]);
  const plist = profiles || [];
  const compMap = {}; (compRows || []).forEach(c => compMap[c.user_id] = Number(c.pay_rate));
  const profMap = {}; plist.forEach(p => profMap[p.id] = p);
  const hrsUW = {}; // uid -> {weekStart: hours}
  (entries || []).forEach(e => {
    const w = entryWeek(e);
    (hrsUW[e.user_id] = hrsUW[e.user_id] || {});
    hrsUW[e.user_id][w] = (hrsUW[e.user_id][w] || 0) + entryHours(e);
  });
  const payUW = {}; // uid -> {weekStart: payment}
  (payments || []).forEach(p => {
    (payUW[p.user_id] = payUW[p.user_id] || {})[p.week_start] = p;
  });

  const r2 = n => Math.round(Number(n || 0) * 100) / 100;
  function grossFor(uid, w) {
    const p = profMap[uid], rate = compMap[uid];
    if (rate == null || !p) return 0;
    if (p.pay_type === 'salary') return r2(rate / 52);
    return r2((hrsUW[uid] && hrsUW[uid][w] || 0) * rate);
  }
  function paidFor(uid, w) {
    return (payUW[uid] && payUW[uid][w]) ? r2(payUW[uid][w].gross) : 0;
  }
  function unpaidWeeks(uid) {
    const weeks = new Set([...Object.keys(hrsUW[uid] || {}), ...Object.keys(payUW[uid] || {})]);
    return [...weeks].sort().reverse()
      .map(w => ({w, bal: r2(Math.max(0, grossFor(uid, w) - paidFor(uid, w)))}))
      .filter(x => x.bal > 0.005);
  }
  function balanceFor(uid) { return r2(unpaidWeeks(uid).reduce((s, x) => s + x.bal, 0)); }

  const rows = plist.map(p => {
    const h = (hrsUW[p.id] && hrsUW[p.id][prWeek]) || 0;
    const rate = compMap[p.id];
    const gross = grossFor(p.id, prWeek);
    const pay = payUW[p.id] && payUW[p.id][prWeek];
    const paid = pay ? r2(pay.gross) : 0;
    const weekBal = r2(Math.max(0, gross - paid));
    return {...p, hours: h, gross, rate, paid, payRec: pay || null, weekBal,
      totalBal: balanceFor(p.id), unpaid: unpaidWeeks(p.id),
      note: rate == null ? 'no rate set' : (p.pay_type === 'salary' ? 'salary' : '')};
  });
  const totGross = r2(rows.reduce((s, r) => s + r.gross, 0));
  const totHrs = rows.reduce((s, r) => s + r.hours, 0);
  const totBal = r2(rows.reduce((s, r) => s + r.totalBal, 0));
  const unpaidThisWeek = rows.filter(r => r.weekBal > 0.005);
  const withBal = rows.filter(r => r.totalBal > 0.005);

  let html = `<div class="section-head"><h2>Payroll</h2>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn-secondary btn-small" id="pr-csv">⬇ CSV</button>
      ${unpaidThisWeek.length ? `<button class="btn-primary btn-small" id="pr-payall">Mark week paid (${unpaidThisWeek.length})</button>` : ''}
      ${locked
        ? `<button class="btn-secondary btn-small" id="pr-reopen">Reopen week</button>`
        : `<button class="btn-secondary btn-small" id="pr-close">Close period</button>`}
    </div></div>
  <div class="card"><div class="cal-nav">
    <button class="btn-secondary btn-small" id="pr-prev">← Prev</button>
    <div style="flex:1;text-align:center;font-weight:800">${weekLabel(prWeek)}
      ${locked ? ' <span class="pill closed">closed</span>' : ' <span class="pill open">open</span>'}</div>
    <button class="btn-secondary btn-small" id="pr-next">Next →</button>
  </div>
  <div class="muted" style="margin-top:8px">Pay week Fri–Thu (CT) · payday ${fmtDate(payday)}. Gross = total hours × rate. "Mark paid" records the payment and zeroes that week's balance. Closing locks the week — no more clock edits.</div></div>`;

  html += `<div class="kpi-row">
    <div class="kpi"><div class="v">${rows.length}</div><div class="l">Employees</div></div>
    <div class="kpi"><div class="v">${hrs(totHrs)}</div><div class="l">Hours this week</div></div>
    <div class="kpi"><div class="v">${money(totGross)}</div><div class="l">Gross this week</div></div>
    <div class="kpi"><div class="v">${money(totBal)}</div><div class="l">Balance owed</div></div>
  </div>`;

  html += `<div class="card"><div class="table-scroll"><table class="data">
    <tr><th>Employee</th><th class="num">Hours</th><th class="num">Rate</th><th class="num">Gross</th><th class="num">Paid</th><th class="num">Balance</th><th></th></tr>` +
    rows.map(r => `<tr>
      <td><b>${esc(r.full_name || '')}</b><br><span class="muted">${esc(r.property || '')}${r.note ? ' · ' + esc(r.note) : ''}</span></td>
      <td class="num">${hrs(r.hours)}</td>
      <td class="num">${r.rate == null ? '—' : (r.pay_type === 'salary' ? money(r.rate) + '/yr' : money(r.rate))}</td>
      <td class="num"><b>${money(r.gross)}</b></td>
      <td class="num">${r.payRec ? `<span class="pill paid">paid</span><br><span class="muted">${fmtDate((r.payRec.paid_at || '').slice(0, 10))}</span>` : '—'}</td>
      <td class="num">${r.weekBal > 0.005 ? `<span class="pill owed">${money(r.weekBal)}</span>` : '<span class="muted">$0.00</span>'}</td>
      <td class="num">${r.weekBal > 0.005 ? `<button class="btn-secondary btn-small" data-markpaid="${r.id}" data-week="${prWeek}" data-gross="${r.weekBal}" data-name="${esc(r.full_name || '')}">Mark paid</button>` : ''}</td>
    </tr>`).join('') +
    `<tr><td><b>Totals</b></td><td class="num"><b>${hrs(totHrs)}</b></td><td></td>
     <td class="num"><b>${money(totGross)}</b></td><td></td>
     <td class="num"><b>${money(r2(rows.reduce((s, r) => s + r.weekBal, 0)))}</b></td><td></td></tr></table></div></div>`;

  if (withBal.length) {
    html += `<div class="card"><div class="t" style="font-weight:800;margin-bottom:8px">💰 Outstanding balances — ${money(totBal)} total</div>` +
      withBal.map(r => `<div class="rowline"><div><div class="t">${esc(r.full_name || '')}</div>
        <div class="s">${r.unpaid.map(u => `${fmtDateShort(u.w)}: ${money(u.bal)}`).join(' · ')}</div></div>
        <div class="num"><b>${money(r.totalBal)}</b></div></div>`).join('') + `</div>`;
  } else {
    html += `<div class="card"><div class="muted">✅ No outstanding balances — everyone is paid up.</div></div>`;
  }
  html += `<div class="muted">Gross before taxes &amp; deductions. Export the CSV to hand to whoever cuts checks.</div>`;

  content.innerHTML = html;
  $('pr-prev').onclick = () => { prWeek = addDays(prWeek, -7); renderTab(); };
  $('pr-next').onclick = () => { prWeek = addDays(prWeek, 7); renderTab(); };
  $('pr-csv').onclick = () => exportPayrollCsv(rows, prWeek);
  content.querySelectorAll('[data-markpaid]').forEach(b => b.onclick = async () => {
    const uid = b.dataset.markpaid, w = b.dataset.week, g = parseFloat(b.dataset.gross);
    if (!confirm(`Record ${money(g)} paid to ${b.dataset.name} for week ${weekLabel(w)}?`)) return;
    const { error } = await client.from('pr_payments').upsert({
      user_id: uid, week_start: w, gross: g, paid_by: me.id,
      paid_at: new Date().toISOString(), note: 'Payday ' + fmtDateShort(paydayOf(w))
    }, {onConflict: 'user_id,week_start'});
    if (error) alert(error.message); else renderTab();
  });
  const payAll = $('pr-payall');
  if (payAll) payAll.onclick = async () => {
    const total = r2(unpaidThisWeek.reduce((s, r) => s + r.weekBal, 0));
    if (!confirm(`Mark the whole week paid? ${unpaidThisWeek.length} employees, ${money(total)} total.`)) return;
    for (const r of unpaidThisWeek) {
      const { error } = await client.from('pr_payments').upsert({
        user_id: r.id, week_start: prWeek, gross: r.weekBal, paid_by: me.id,
        paid_at: new Date().toISOString(), note: 'Payday ' + fmtDateShort(paydayOf(prWeek))
      }, {onConflict: 'user_id,week_start'});
      if (error) { alert('Stopped early: ' + error.message); break; }
    }
    renderTab();
  };
  const closeBtn = $('pr-close');
  if (closeBtn) closeBtn.onclick = async () => {
    if (!confirm(`Close the week of ${weekLabel(prWeek)}? Employees won't be able to clock in or edit entries in this week.`)) return;
    const { error } = await client.from('pr_pay_periods')
      .update({status: 'closed', closed_by: me.id, closed_at: new Date().toISOString()}).eq('id', period.id);
    if (error) alert(error.message); else { periodsCache = {}; renderTab(); }
  };
  const reopenBtn = $('pr-reopen');
  if (reopenBtn) reopenBtn.onclick = async () => {
    if (!confirm('Reopen this week for corrections?')) return;
    const { error } = await client.from('pr_pay_periods')
      .update({status: 'open', closed_by: null, closed_at: null}).eq('id', period.id);
    if (error) alert(error.message); else { periodsCache = {}; renderTab(); }
  };
}

function exportPayrollCsv(rows, friStr) {
  const head = ['Name','Email','Property','Pay type','Week','Payday','Hours','Rate','Gross pay','Paid','Balance owed'];
  const lines = rows.map(r => [
    r.full_name || '', r.email || '', r.property || '', r.pay_type || '',
    weekLabel(friStr), fmtDateShort(paydayOf(friStr)),
    hrs(r.hours),
    r.rate == null ? '' : (r.pay_type === 'salary' ? r.rate + '/yr' : r.rate),
    r.gross.toFixed(2),
    r.payRec ? r.paid.toFixed(2) : '',
    r.weekBal.toFixed(2)
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  const csv = head.join(',') + '\n' + lines.join('\n');
  const blob = new Blob([csv], {type: 'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `payroll_${friStr}_payday_${paydayOf(friStr)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* ---------- PAY HISTORY ---------- */
let phUser = 'all';
async function viewPayHistory(content) {
  let q = client.from('pr_payments')
    .select('*, pr_profiles!pr_payments_user_id_fkey(full_name, property)')
    .order('week_start', {ascending: false}).limit(200);
  if (!isManager()) q = q.eq('user_id', me.id);
  else if (phUser !== 'all') q = q.eq('user_id', phUser);
  const { data } = await q;
  const pays = data || [];

  let html = `<div class="section-head"><h2>Pay History</h2></div>`;

  if (isManager()) {
    const { data: profiles } = await client.from('pr_profiles')
      .select('id, full_name').eq('active', true).order('full_name');
    html += `<div class="card"><div class="inline-form"><label>Employee
      <select id="ph-user"><option value="all">Everyone</option>
      ${(profiles || []).map(p => `<option value="${p.id}" ${p.id === phUser ? 'selected' : ''}>${esc(p.full_name || '')}</option>`).join('')}</select>
    </label></div></div>`;
  }

  if (!pays.length) {
    html += `<div class="card"><div class="empty"><div class="big">🧾</div>No payments recorded yet.</div></div>`;
  } else if (!isManager()) {
    html += pays.map(p => `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <b>${weekLabel(p.week_start)}</b><b style="font-size:18px">${money(p.gross)}</b></div>
      <div class="rowline"><div class="s">Paid on</div><div class="num">${fmtDate((p.paid_at || '').slice(0, 10))}</div></div>
      ${p.note ? `<div class="muted" style="margin-top:6px">${esc(p.note)}</div>` : ''}
    </div>`).join('');
  } else {
    html += `<div class="card"><div class="table-scroll"><table class="data">
      <tr><th>Employee</th><th>Week</th><th class="num">Gross</th><th>Paid on</th></tr>` +
      pays.map(p => {
        const nm = (p.pr_profiles && p.pr_profiles.full_name) || '—';
        return `<tr><td><b>${esc(nm)}</b></td><td>${weekLabel(p.week_start)}</td>
          <td class="num"><b>${money(p.gross)}</b></td><td>${fmtDate((p.paid_at || '').slice(0, 10))}${p.note ? `<br><span class="muted">${esc(p.note)}</span>` : ''}</td></tr>`;
      }).join('') + `</table></div></div>`;
  }
  html += `<div class="muted">Payments recorded by your manager. Gross before taxes &amp; deductions.</div>`;
  content.innerHTML = html;
  const sel = $('ph-user');
  if (sel) sel.onchange = e => { phUser = e.target.value; renderTab(); };
}

/* ---------- TEAM MANAGEMENT ---------- */
async function viewTeam(content) {
  const { data: profiles } = await client.from('pr_profiles').select('*').order('active', {ascending: false}).order('full_name');
  const { data: compRows } = await client.from('pr_comp').select('user_id, pay_rate');
  const { data: inviteRows } = await client.from('pr_invites').select('profile_id');
  const compMap = {}; (compRows || []).forEach(c => compMap[c.user_id] = c.pay_rate);
  const inviteSet = new Set((inviteRows || []).map(i => i.profile_id));
  const plist = profiles || [];

  // Invite-email UI for staff who haven't created their account yet (server sends the email instantly on insert)
  const inviteBlock = p => {
    if (p.auth_user_id) return '';
    if (inviteSet.has(p.id)) return `<div class="invite-row"><span class="pill sent">Invite sent ✓</span>
      <button class="link-btn" data-invite="${p.id}">Resend</button></div>`;
    return `<div class="invite-row"><button class="btn-secondary btn-small" data-invite="${p.id}">✉️ Send invite email</button></div>`;
  };

  let html = `<div class="section-head"><h2>Staff</h2>
    <button class="btn-primary btn-small" id="team-add">+ Add employee</button></div>`;
  if (!plist.length) {
    html += `<div class="card"><div class="empty"><div class="big">👥</div>No staff yet.<br>Add your first employee to get started.</div></div>`;
  } else {
    html += plist.map(p => `<div class="card" style="${p.active ? '' : 'opacity:.55'}">
      <div class="rowline"><div>
        <div class="t">${esc(p.full_name || '(no name)')} ${p.role === 'manager' ? '⭐' : ''}</div>
        <div class="s">${esc(p.email || '')} · ${esc(p.property || '')} · ${esc(p.pay_type)} ·
          ${compMap[p.id] != null ? (p.pay_type === 'salary' ? money(compMap[p.id]) + '/yr' : money(compMap[p.id]) + '/hr') : 'no rate'} ·
          ${p.auth_user_id ? 'account linked' : 'no account yet'}</div></div>
        <div style="display:flex;gap:6px">
          <button class="btn-secondary btn-small" data-edit-staff="${p.id}">Edit</button>
          <button class="btn-secondary btn-small ${p.active ? 'btn-danger' : 'btn-ok'}" data-toggle-staff="${p.id}">${p.active ? 'Deactivate' : 'Reactivate'}</button>
        </div></div>
      ${inviteBlock(p)}</div>`).join('');
  }
  content.innerHTML = html;
  $('team-add').onclick = () => staffModal(null);
  content.querySelectorAll('[data-invite]').forEach(b => b.onclick = () => queueInvite(b.dataset.invite));
  content.querySelectorAll('[data-edit-staff]').forEach(b => b.onclick = async () => {
    const { data } = await client.from('pr_profiles').select('*').eq('id', b.dataset.editStaff).single();
    const { data: comp } = await client.from('pr_comp').select('*').eq('user_id', b.dataset.editStaff).maybeSingle();
    staffModal(data, comp);
  });
  content.querySelectorAll('[data-toggle-staff]').forEach(b => b.onclick = async () => {
    const { data: p } = await client.from('pr_profiles').select('active, full_name').eq('id', b.dataset.toggleStaff).single();
    if (!confirm(`${p.active ? 'Deactivate' : 'Reactivate'} ${p.full_name}?`)) return;
    const { error } = await client.from('pr_profiles').update({active: !p.active}).eq('id', b.dataset.toggleStaff);
    if (error) alert(error.message); else renderTab();
  });
}

// Queue (or re-queue) an invite email for an unclaimed employee.
// Deletes any existing pr_invites row then inserts a fresh one — the server
// trigger fires on INSERT, so delete+insert re-fires it on Resend.
async function queueInvite(profileId) {
  const { data: p, error: e0 } = await client.from('pr_profiles').select('id, email').eq('id', profileId).single();
  if (e0 || !p) { alert('Could not load employee.'); return; }
  const del = await client.from('pr_invites').delete().eq('profile_id', p.id);
  if (del.error) { alert(del.error.message); return; }
  const { error } = await client.from('pr_invites').insert({ profile_id: p.id, email: p.email });
  if (error) { alert(error.message); return; }
  await renderTab();
}

function staffModal(p, comp) {
  const isNew = !p;
  openModal(`
    <h3>${isNew ? 'Add employee' : 'Edit employee'}</h3>
    <label>Full name<input type="text" id="st-name" value="${esc(p?.full_name || '')}"></label>
    <label>Email<input type="email" id="st-email" value="${esc(p?.email || '')}" ${isNew ? '' : 'disabled'}></label>
    <div class="inline-row">
      <label>Property
        <select id="st-prop">${PROPERTIES.map(x => `<option ${x === p?.property ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
      </label>
      <label>Role
        <select id="st-role"><option value="employee" ${p?.role !== 'manager' ? 'selected' : ''}>Employee</option><option value="manager" ${p?.role === 'manager' ? 'selected' : ''}>Manager</option></select>
      </label>
    </div>
    <div class="inline-row">
      <label>Pay type
        <select id="st-paytype"><option value="hourly" ${p?.pay_type !== 'salary' ? 'selected' : ''}>Hourly</option><option value="salary" ${p?.pay_type === 'salary' ? 'selected' : ''}>Salary</option></select>
      </label>
      <label><span id="st-rate-label">${p?.pay_type === 'salary' ? 'Annual salary ($)' : 'Hourly rate ($)'}</span>
        <input type="number" id="st-rate" min="0" step="0.01" value="${comp?.pay_rate ?? ''}" placeholder="e.g. ${p?.pay_type === 'salary' ? '35000' : '15.00'}">
      </label>
    </div>
    <label>Hire date<input type="date" id="st-hire" value="${p?.hire_date || ''}"></label>
    ${isNew ? '<p class="muted">After adding them, tap the ✉️ button on their Staff row to email them sign-up instructions.</p>' : ''}
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" id="st-save">${isNew ? 'Add employee' : 'Save'}</button>
    </div>`);
  $('st-paytype').onchange = e => {
    $('st-rate-label').textContent = e.target.value === 'salary' ? 'Annual salary ($)' : 'Hourly rate ($)';
  };
  $('st-save').onclick = async () => {
    const full_name = $('st-name').value.trim(), email = $('st-email').value.trim().toLowerCase();
    const property = $('st-prop').value, role = $('st-role').value, pay_type = $('st-paytype').value;
    const rate = parseFloat($('st-rate').value);
    const hire_date = $('st-hire').value || null;
    if (!full_name || !email) { alert('Name and email are required.'); return; }
    if (isNaN(rate) || rate < 0) { alert('Enter a valid pay rate.'); return; }
    if (isNew) {
      const { data: prof, error } = await client.from('pr_profiles')
        .insert({email, full_name, role, property, pay_type, hire_date}).select().single();
      if (error) { alert(error.message); return; }
      const { error: e2 } = await client.from('pr_comp').insert({user_id: prof.id, pay_rate: rate});
      if (e2) { alert('Employee added but pay rate failed: ' + e2.message); }
    } else {
      const { error } = await client.from('pr_profiles')
        .update({full_name, property, role, pay_type, hire_date}).eq('id', p.id);
      if (error) { alert(error.message); return; }
      const { error: e2 } = await client.from('pr_comp').upsert({user_id: p.id, pay_rate: rate, updated_at: new Date().toISOString()});
      if (e2) { alert('Saved, but pay rate failed: ' + e2.message); return; }
    }
    closeModal(); await renderTab();
  };
}
