/* Economy Suites Payroll — Supabase-backed time tracking + payroll */
const APP_VERSION = 8; // bump on every deploy; checked against version.json
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

/* ---------- LANGUAGE (EN/ES) ---------- */
let LANG = localStorage.getItem('esp_lang') || 'en';
function setLang(l) { LANG = (l === 'es') ? 'es' : 'en'; localStorage.setItem('esp_lang', LANG); }
const STR = {
en: {
  app_subtitle: 'Time tracking & payroll for the team', signin: 'Sign in', signup: 'Create account',
  email: 'Email', password: 'Password', fullname: 'Full name', forgot: 'Forgot password?',
  homescreen_tip: '💡 Tip: add this to your home screen for the full app experience — on iPhone tap Share, then Add to Home Screen.',
  set_new_pw: 'Set new password', choose_new_pw: 'Choose a new password for your account',
  new_pw: 'New password', confirm_pw: 'Confirm new password', save_new_pw: 'Save new password',
  almost_there: 'Almost there',
  unlinked_msg: "Your account isn't linked to an employee record yet — contact your manager to add you, then sign in again.",
  signout: 'Sign out', change_pw: 'Change password',
  deactivated_msg: 'Your account has been deactivated. Contact your manager if this is a mistake.',
  enter_email_pw: 'Enter your email and password.', enter_fullname: 'Enter your full name.',
  signing_in: 'Signing in…', creating_acct: 'Creating account…',
  acct_created: 'Account created — check your email to confirm, then sign in.',
  type_email_first: 'Type your email above first.', sending: 'Sending…',
  reset_sent: 'Reset link sent — check your email (including spam).',
  pw_min6: 'Password must be at least 6 characters.', pw_mismatch: 'Passwords do not match.',
  saving: 'Saving…', pw_updated: 'Password updated.', cancel: 'Cancel', save: 'Save',
  tab_clock: 'Clock', tab_timesheet: 'Timesheet', tab_timeoff: 'Time Off', tab_pay: 'Pay',
  tab_history: 'History', tab_team: 'Team', tab_sheets: 'Sheets', tab_payroll: 'Payroll', tab_staff: 'Staff',
  hi: 'Hi', missed_clockout: 'You have a missed clock-out from', close_it_now: 'Close it now',
  week_closed_no_clock: 'This pay week is closed — no new clock-ins. Ask your manager to reopen it if you need a correction.',
  clocked_in_since: 'Clocked in since', clock_in: 'Clock In', clock_out: 'Clock Out',
  on_clock_so_far: 'On the clock: ~{h} hrs so far', work_location: 'Work location',
  hours_today: 'Hours today', hours_this_week: 'Hours this week', my_pay_rate: 'My pay rate',
  whos_off_today: "Who's off today", full_crew: 'Nobody — full crew today.', on_pto: 'on PTO',
  close_missed: 'Close missed clock-out',
  missed_desc: 'You clocked in {t} and never clocked out. Enter the time you actually left:',
  date_time_left: 'Date & time left', save_clockout: 'Save clock-out',
  enter_time_left: 'Enter the time you left.', clockout_after_in: 'Clock-out must be after clock-in.',
  my_timesheet: 'My Timesheet', timesheet_of: "'s Timesheet", no_entries_week: 'No time entries this week.',
  total_hours_week: 'Total hours this week', closed: 'closed', open: 'open',
  prev: '← Prev', next: 'Next →', open_pill: 'open', corrected: '✏️ corrected', hrs: 'hrs',
  time_off: 'Time Off', request_time_off: 'Request time off', request_time_off_btn: '+ Request time off',
  pending_approvals: 'Pending approvals', no_pending: 'No pending requests.', my_requests: 'My requests',
  no_requests: 'No requests yet.', team_cal_note: 'Shows approved time off for the whole team (names only).',
  approve: 'Approve', deny: 'Deny', cancel_request: 'Cancel this request?',
  teammate: 'Teammate', you: '(you)', more: 'more',
  vacation: 'Vacation', sick: 'Sick', personal: 'Personal',
  pto_type: 'Type', start_date: 'Start date', end_date: 'End date',
  reason_opt: 'Reason (optional)', reason_ph: 'Anything your manager should know', submit_request: 'Submit request',
  pick_dates: 'Pick start and end dates.', end_after_start: 'End date must be on or after start date.',
  my_pay: 'My Pay', my_rate: 'my rate', no_stubs: 'No pay stubs yet — clock in to start earning one.',
  total_hours: 'Total hours', rate: 'Rate',
  pay_estimates_note: 'Estimates from clocked hours before taxes & deductions. Final pay is cut by your manager.',
  pay_stub: 'Pay stub', week: 'Week', payday: 'Payday', regular_pay: 'Regular pay',
  adjustments: 'Adjustments', total_gross: 'Total gross', paid: 'Paid', unpaid: 'Unpaid',
  balance_owed: 'Balance owed', print: 'Print', paid_on: 'Paid on', bonus: 'Bonus', deduction: 'Deduction',
  no_rate_note: 'No pay rate set — ask your manager.', salary_note: 'Salary — paid weekly.',
  pay_history: 'Pay History', everyone: 'Everyone', no_payments: 'No payments recorded yet.',
  history_note: 'Payments recorded by your manager. Gross before taxes & deductions.',
  team_dashboard: 'Team Dashboard', clocked_in_now: 'Clocked in now', pto_requests: 'PTO requests',
  team_hrs_week: 'Team hrs this wk', on_clock_now: 'On the clock now',
  nobody_clocked: 'Nobody clocked in right now.', pending_timeoff: 'Pending time-off requests',
  no_pending_party: 'No pending requests. 🎉', active_staff: 'Active staff',
  no_staff_dashboard: 'No staff yet — add your team under Staff.',
  timesheets: 'Timesheets', all_properties: 'All properties', property: 'Property', employee: 'Employee',
  week_closed_reopen: 'This week is closed. Reopen it from Payroll to make corrections.',
  no_entries_filter: 'No entries match these filters.', correct_entry: 'Correct time entry',
  clock_in_ct: 'Clock in (CT)', clock_out_ct: 'Clock out (CT) — leave blank if still working',
  note: 'Note', reason_correction: 'Reason for correction', delete: 'Delete',
  clockin_required: 'Clock-in is required.', delete_entry: 'Delete this entry permanently?',
  entry_not_found: 'Entry not found.',
  payroll: 'Payroll',
  pay_week_note: 'Pay week Fri–Thu (CT) · payday {d}. Gross = hours × rate + adjustments. "Mark paid" records the payment and zeroes that week\'s balance. Closing locks the week — no more clock edits.',
  mark_week_paid: 'Mark week paid', reopen_week: 'Reopen week', close_period: 'Close period',
  gross: 'Gross', balance: 'Balance', hours: 'Hours', totals: 'Totals', mark_paid: 'Mark paid',
  outstanding: 'Outstanding balances — {t} total', no_balances: 'No outstanding balances — everyone is paid up.',
  csv_note: 'Gross before taxes & deductions. Export the CSV to hand to whoever cuts checks.',
  confirm_mark_paid: 'Record {m} paid to {n} for week {w}?',
  confirm_pay_all: 'Mark the whole week paid? {n} employees, {t} total.',
  confirm_close: 'Close the week of {w}? Employees won\'t be able to clock in or edit entries in this week.',
  confirm_reopen: 'Reopen this week for corrections?', stopped_early: 'Stopped early: ',
  no_rate_set: 'no rate set', salary: 'salary',
  add_adjustment: 'Add adjustment', adj_amount: 'Amount (negative = deduction)',
  adj_note_ph: 'Note — e.g. holiday bonus, reimbursement', enter_amount: 'Enter an amount (negative for a deduction).',
  staff: 'Staff', add_employee: 'Add employee', no_staff: 'No staff yet.',
  no_staff_add: 'Add your first employee to get started.',
  edit: 'Edit', deactivate: 'Deactivate', reactivate: 'Reactivate',
  confirm_toggle: '{a} {n}?', no_rate: 'no rate', acct_linked: 'account linked', no_acct: 'no account yet',
  send_invite: '✉️ Send invite email', invite_sent: 'Invite sent ✓', resend: 'Resend',
  could_not_load: 'Could not load employee.',
  alerts_title: '⏰ Forgotten clock-out alerts',
  alerts_desc: 'Alert Rafi when someone is clocked in 20+ hours without clocking out.',
  yes: 'Yes', no: 'No',
  stale_banner: 'clocked in 20+ hours without clocking out:',
  edit_employee: 'Edit employee', role: 'Role', manager: 'Manager',
  pay_type: 'Pay type', hourly: 'Hourly', annual_salary: 'Annual salary ($)', hourly_rate: 'Hourly rate ($)',
  hire_date: 'Hire date',
  after_add_tap: 'After adding them, tap the ✉️ button on their Staff row to email them sign-up instructions.',
  name_email_required: 'Name and email are required.', valid_rate: 'Enter a valid pay rate.',
  added_rate_fail: 'Employee added but pay rate failed: ', saved_rate_fail: 'Saved, but pay rate failed: ',
  went_wrong: 'Something went wrong: ', try_again: 'Try again', loading: 'Loading…',
  getting_location: 'Getting location…', clocking_in: 'Clocking in…', clocking_out: 'Clocking out…',
  could_not_clockin: 'Could not clock in: ', could_not_clockout: 'Could not clock out: ',
  language: 'Language'
},
es: {
  app_subtitle: 'Control de horas y nómina del equipo', signin: 'Iniciar sesión', signup: 'Crear cuenta',
  email: 'Correo', password: 'Contraseña', fullname: 'Nombre completo', forgot: '¿Olvidaste tu contraseña?',
  homescreen_tip: '💡 Consejo: agrega esto a tu pantalla de inicio para la mejor experiencia — en iPhone toca Compartir, luego Agregar a pantalla de inicio.',
  set_new_pw: 'Establecer nueva contraseña', choose_new_pw: 'Elige una nueva contraseña para tu cuenta',
  new_pw: 'Nueva contraseña', confirm_pw: 'Confirmar nueva contraseña', save_new_pw: 'Guardar nueva contraseña',
  almost_there: 'Ya casi',
  unlinked_msg: 'Tu cuenta aún no está vinculada a un registro de empleado — contacta a tu gerente para que te agregue, luego inicia sesión de nuevo.',
  signout: 'Cerrar sesión', change_pw: 'Cambiar contraseña',
  deactivated_msg: 'Tu cuenta ha sido desactivada. Contacta a tu gerente si esto es un error.',
  enter_email_pw: 'Ingresa tu correo y contraseña.', enter_fullname: 'Ingresa tu nombre completo.',
  signing_in: 'Iniciando sesión…', creating_acct: 'Creando cuenta…',
  acct_created: 'Cuenta creada — revisa tu correo para confirmar, luego inicia sesión.',
  type_email_first: 'Escribe tu correo arriba primero.', sending: 'Enviando…',
  reset_sent: 'Enlace enviado — revisa tu correo (incluido spam).',
  pw_min6: 'La contraseña debe tener al menos 6 caracteres.', pw_mismatch: 'Las contraseñas no coinciden.',
  saving: 'Guardando…', pw_updated: 'Contraseña actualizada.', cancel: 'Cancelar', save: 'Guardar',
  tab_clock: 'Reloj', tab_timesheet: 'Hoja de horas', tab_timeoff: 'Tiempo libre', tab_pay: 'Pago',
  tab_history: 'Historial', tab_team: 'Equipo', tab_sheets: 'Hojas', tab_payroll: 'Nómina', tab_staff: 'Personal',
  hi: 'Hola', missed_clockout: 'Tienes una salida sin marcar desde', close_it_now: 'Cerrarla ahora',
  week_closed_no_clock: 'Esta semana de pago está cerrada — no se puede marcar entrada. Pide a tu gerente que la reabra si necesitas una corrección.',
  clocked_in_since: 'En turno desde', clock_in: 'Marcar entrada', clock_out: 'Marcar salida',
  on_clock_so_far: 'En turno: ~{h} hrs hasta ahora', work_location: 'Lugar de trabajo',
  hours_today: 'Horas hoy', hours_this_week: 'Horas esta semana', my_pay_rate: 'Mi tarifa',
  whos_off_today: 'Quién está libre hoy', full_crew: 'Nadie — equipo completo hoy.', on_pto: 'libre',
  close_missed: 'Cerrar salida olvidada',
  missed_desc: 'Marcaste entrada el {t} y nunca marcaste salida. Ingresa la hora a la que realmente saliste:',
  date_time_left: 'Fecha y hora de salida', save_clockout: 'Guardar salida',
  enter_time_left: 'Ingresa la hora a la que saliste.', clockout_after_in: 'La salida debe ser después de la entrada.',
  my_timesheet: 'Mi hoja de horas', timesheet_of: ' — hoja de horas', no_entries_week: 'Sin registros esta semana.',
  total_hours_week: 'Horas totales esta semana', closed: 'cerrada', open: 'abierta',
  prev: '← Ant.', next: 'Sig. →', open_pill: 'abierto', corrected: '✏️ corregido', hrs: 'hrs',
  time_off: 'Tiempo libre', request_time_off: 'Solicitar tiempo libre', request_time_off_btn: '+ Solicitar tiempo libre',
  pending_approvals: 'Aprobaciones pendientes', no_pending: 'Sin solicitudes pendientes.', my_requests: 'Mis solicitudes',
  no_requests: 'Aún no hay solicitudes.', team_cal_note: 'Muestra el tiempo libre aprobado de todo el equipo (solo nombres).',
  approve: 'Aprobar', deny: 'Rechazar', cancel_request: '¿Cancelar esta solicitud?',
  teammate: 'Compañero', you: '(tú)', more: 'más',
  vacation: 'Vacaciones', sick: 'Enfermedad', personal: 'Personal',
  pto_type: 'Tipo', start_date: 'Fecha de inicio', end_date: 'Fecha de fin',
  reason_opt: 'Motivo (opcional)', reason_ph: 'Algo que tu gerente deba saber', submit_request: 'Enviar solicitud',
  pick_dates: 'Elige las fechas de inicio y fin.', end_after_start: 'La fecha de fin debe ser igual o posterior a la de inicio.',
  my_pay: 'Mi pago', my_rate: 'mi tarifa', no_stubs: 'Aún no hay recibos de pago — marca tu entrada para empezar a generar uno.',
  total_hours: 'Horas totales', rate: 'Tarifa',
  pay_estimates_note: 'Estimados de horas marcadas antes de impuestos y deducciones. El pago final lo hace tu gerente.',
  pay_stub: 'Recibo de pago', week: 'Semana', payday: 'Día de pago', regular_pay: 'Pago regular',
  adjustments: 'Ajustes', total_gross: 'Bruto total', paid: 'Pagado', unpaid: 'Sin pagar',
  balance_owed: 'Saldo pendiente', print: 'Imprimir', paid_on: 'Pagado el', bonus: 'Bono', deduction: 'Deducción',
  no_rate_note: 'Sin tarifa asignada — pregunta a tu gerente.', salary_note: 'Salario — pago semanal.',
  pay_history: 'Historial de pagos', everyone: 'Todos', no_payments: 'Aún no hay pagos registrados.',
  history_note: 'Pagos registrados por tu gerente. Bruto antes de impuestos y deducciones.',
  team_dashboard: 'Panel del equipo', clocked_in_now: 'En turno ahora', pto_requests: 'Solicitudes de tiempo libre',
  team_hrs_week: 'Horas del equipo esta sem.', on_clock_now: 'En turno ahora',
  nobody_clocked: 'Nadie en turno ahora mismo.', pending_timeoff: 'Solicitudes de tiempo libre pendientes',
  no_pending_party: 'Sin solicitudes pendientes. 🎉', active_staff: 'Personal activo',
  no_staff_dashboard: 'Aún no hay personal — agrega tu equipo en Personal.',
  timesheets: 'Hojas de horas', all_properties: 'Todas las propiedades', property: 'Propiedad', employee: 'Empleado',
  week_closed_reopen: 'Esta semana está cerrada. Reábrela desde Nómina para hacer correcciones.',
  no_entries_filter: 'Ningún registro coincide con estos filtros.', correct_entry: 'Corregir registro',
  clock_in_ct: 'Entrada (CT)', clock_out_ct: 'Salida (CT) — dejar vacío si sigue trabajando',
  note: 'Nota', reason_correction: 'Motivo de la corrección', delete: 'Eliminar',
  clockin_required: 'La entrada es obligatoria.', delete_entry: '¿Eliminar este registro permanentemente?',
  entry_not_found: 'Registro no encontrado.',
  payroll: 'Nómina',
  pay_week_note: 'Semana de pago vie–jue (CT) · día de pago {d}. Bruto = horas × tarifa + ajustes. "Marcar pagado" registra el pago y pone en cero el saldo de la semana. Cerrar bloquea la semana — sin más ediciones.',
  mark_week_paid: 'Marcar semana pagada', reopen_week: 'Reabrir semana', close_period: 'Cerrar período',
  gross: 'Bruto', balance: 'Saldo', hours: 'Horas', totals: 'Totales', mark_paid: 'Marcar pagado',
  outstanding: 'Saldos pendientes — {t} total', no_balances: 'Sin saldos pendientes — todos están al corriente.',
  csv_note: 'Bruto antes de impuestos y deducciones. Exporta el CSV para quien haga los cheques.',
  confirm_mark_paid: '¿Registrar {m} pagado a {n} por la semana {w}?',
  confirm_pay_all: '¿Marcar toda la semana como pagada? {n} empleados, {t} total.',
  confirm_close: '¿Cerrar la semana de {w}? Los empleados no podrán marcar ni editar registros esta semana.',
  confirm_reopen: '¿Reabrir esta semana para correcciones?', stopped_early: 'Se detuvo antes: ',
  no_rate_set: 'sin tarifa', salary: 'salario',
  add_adjustment: 'Agregar ajuste', adj_amount: 'Monto (negativo = deducción)',
  adj_note_ph: 'Nota — ej. bono navideño, reembolso', enter_amount: 'Ingresa un monto (negativo para deducción).',
  staff: 'Personal', add_employee: 'Agregar empleado', no_staff: 'Aún no hay personal.',
  no_staff_add: 'Agrega tu primer empleado para empezar.',
  edit: 'Editar', deactivate: 'Desactivar', reactivate: 'Reactivar',
  confirm_toggle: '¿{a} a {n}?', no_rate: 'sin tarifa', acct_linked: 'cuenta vinculada', no_acct: 'sin cuenta aún',
  send_invite: '✉️ Enviar invitación', invite_sent: 'Invitación enviada ✓', resend: 'Reenviar',
  could_not_load: 'No se pudo cargar el empleado.',
  alerts_title: '⏰ Alertas de salida olvidada',
  alerts_desc: 'Avisar a Rafi cuando alguien lleve 20+ horas en turno sin marcar salida.',
  yes: 'Sí', no: 'No',
  stale_banner: 'en turno 20+ horas sin marcar salida:',
  edit_employee: 'Editar empleado', role: 'Rol', manager: 'Gerente',
  pay_type: 'Tipo de pago', hourly: 'Por hora', annual_salary: 'Salario anual ($)', hourly_rate: 'Tarifa por hora ($)',
  hire_date: 'Fecha de contratación',
  after_add_tap: 'Después de agregarlo, toca el botón ✉️ en su fila para enviarle las instrucciones por correo.',
  name_email_required: 'Nombre y correo son obligatorios.', valid_rate: 'Ingresa una tarifa válida.',
  added_rate_fail: 'Empleado agregado pero falló la tarifa: ', saved_rate_fail: 'Guardado, pero falló la tarifa: ',
  went_wrong: 'Algo salió mal: ', try_again: 'Intentar de nuevo', loading: 'Cargando…',
  getting_location: 'Obteniendo ubicación…', clocking_in: 'Marcando entrada…', clocking_out: 'Marcando salida…',
  could_not_clockin: 'No se pudo marcar entrada: ', could_not_clockout: 'No se pudo marcar salida: ',
  language: 'Idioma'
}};
function t(k, vars) {
  let s = (STR[LANG] && STR[LANG][k]) || STR.en[k] || k;
  if (vars) Object.keys(vars).forEach(key => { s = s.replace('{' + key + '}', vars[key]); });
  return s;
}
function ptoStatusLabel(s) {
  return {pending: LANG === 'es' ? 'pendiente' : 'pending',
          approved: LANG === 'es' ? 'aprobado' : 'approved',
          denied: LANG === 'es' ? 'rechazado' : 'denied'}[s] || s;
}

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
  $('login-btn').textContent = mode === 'signin' ? t('signin') : t('signup');
  $('forgot-btn').classList.toggle('hidden', mode === 'signup');
  $('login-error').classList.add('hidden'); $('login-info').classList.add('hidden');
}

/* ---------- LANGUAGE APPLY ---------- */
function applyLangStatic() {
  document.documentElement.lang = LANG;
  const set = (id, key) => { const el = $(id); if (el) el.textContent = t(key); };
  set('login-sub', 'app_subtitle'); set('tab-signin', 'signin'); set('tab-signup', 'signup');
  set('login-email-label', 'email'); set('login-password-label', 'password'); set('signup-name-label', 'fullname');
  set('forgot-btn', 'forgot'); set('homescreen-hint-text', 'homescreen_tip');
  set('recovery-title', 'set_new_pw'); set('recovery-sub', 'choose_new_pw');
  set('recovery-new-label', 'new_pw'); set('recovery-confirm-label', 'confirm_pw'); set('recovery-btn', 'save_new_pw');
  set('unlinked-title', 'almost_there');
  const um = $('unlinked-msg'); if (um && um.dataset.custom !== '1') um.textContent = t('unlinked_msg');
  set('unlinked-signout', 'signout');
  set('change-pw-btn', 'change_pw'); set('signout-btn', 'signout');
  set('login-btn', authMode === 'signin' ? 'signin' : 'signup');
  $('lang-en').classList.toggle('active', LANG === 'en');
  $('lang-es').classList.toggle('active', LANG === 'es');
}
function renderTabSafe() { if (me) renderTab(); }

async function init() {
  // Self-update backstop: if a newer deploy exists than this running copy, reload once.
  try {
    const vr = await fetch('version.json', {cache: 'no-store'});
    const { v } = await vr.json();
    if (v && v !== APP_VERSION && !sessionStorage.getItem('app_upgraded')) {
      sessionStorage.setItem('app_upgraded', '1');
      location.reload();
      return;
    }
  } catch (e) { /* offline or first run — carry on */ }
  client.auth.onAuthStateChange(event => { if (event === 'PASSWORD_RECOVERY') showRecovery(); });
  const hasRecoveryCode = new URLSearchParams(location.search).get('code') || location.hash.includes('type=recovery');
  const { data } = await client.auth.getSession();
  if (hasRecoveryCode) { /* wait for PASSWORD_RECOVERY */ }
  else if (data.session) { await enterApp(data.session.user); }
  else { $('login-view').classList.remove('hidden'); }

  $('tab-signin').onclick = () => setAuthMode('signin');
  $('tab-signup').onclick = () => setAuthMode('signup');
  $('lang-en').onclick = () => { setLang('en'); applyLangStatic(); renderTabSafe(); };
  $('lang-es').onclick = () => { setLang('es'); applyLangStatic(); renderTabSafe(); };
  $('lang-menu-btn').onclick = () => {
    setLang(LANG === 'en' ? 'es' : 'en');
    $('user-menu').classList.add('hidden');
    applyLangStatic(); buildNav(); renderTabSafe();
  };
  applyLangStatic();
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
  if (!email || !password) { errBox.textContent = t('enter_email_pw'); errBox.classList.remove('hidden'); return; }
  $('login-btn').textContent = authMode === 'signin' ? t('signing_in') : t('creating_acct');
  let data, error;
  if (authMode === 'signin') {
    ({ data, error } = await client.auth.signInWithPassword({ email, password }));
  } else {
    const name = $('signup-name').value.trim();
    if (!name) { errBox.textContent = t('enter_fullname'); errBox.classList.remove('hidden'); $('login-btn').textContent = t('signup'); return; }
    ({ data, error } = await client.auth.signUp({ email, password, options: { data: { full_name: name } } }));
    if (!error && data.user && !data.session) {
      infoBox.textContent = t('acct_created');
      infoBox.classList.remove('hidden');
      $('login-btn').textContent = t('signup');
      return;
    }
  }
  $('login-btn').textContent = authMode === 'signin' ? t('signin') : t('signup');
  if (error) { errBox.textContent = error.message; errBox.classList.remove('hidden'); return; }
  await enterApp(data.user);
}

async function doForgotPassword() {
  const email = $('login-email').value.trim();
  const errBox = $('login-error'), infoBox = $('login-info');
  errBox.classList.add('hidden'); infoBox.classList.add('hidden');
  if (!email) { errBox.textContent = t('type_email_first'); errBox.classList.remove('hidden'); return; }
  $('forgot-btn').textContent = t('sending');
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: APP_URL });
  $('forgot-btn').textContent = t('forgot');
  if (error) { errBox.textContent = error.message; errBox.classList.remove('hidden'); return; }
  infoBox.textContent = t('reset_sent');
  infoBox.classList.remove('hidden');
}

async function doRecoverySave() {
  const pw = $('recovery-password').value, confirm = $('recovery-confirm').value;
  const errBox = $('recovery-error');
  errBox.classList.add('hidden');
  if (pw.length < 6) { errBox.textContent = t('pw_min6'); errBox.classList.remove('hidden'); return; }
  if (pw !== confirm) { errBox.textContent = t('pw_mismatch'); errBox.classList.remove('hidden'); return; }
  $('recovery-btn').textContent = t('saving');
  const { error } = await client.auth.updateUser({ password: pw });
  $('recovery-btn').textContent = t('save_new_pw');
  if (error) { errBox.textContent = error.message; errBox.classList.remove('hidden'); return; }
  await client.auth.signOut();
  location.reload();
}

function changePassword() {
  $('user-menu').classList.add('hidden');
  openModal(`
    <h3>${t('change_pw')}</h3>
    <label>${t('new_pw')}<input type="password" id="npw" placeholder="••••••••"></label>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn-primary" id="npw-save">${t('save')}</button>
    </div>`);
  $('npw-save').onclick = async () => {
    const pw = $('npw').value;
    if (pw.length < 6) { alert(t('pw_min6')); return; }
    const { error } = await client.auth.updateUser({ password: pw });
    if (error) alert(error.message); else { alert(t('pw_updated')); closeModal(); }
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
    const um = $('unlinked-msg'); um.dataset.custom = ''; um.textContent = t('unlinked_msg');
    return;
  }
  me = linked;
  startActiveWatch();
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

/* ---------- INSTANT KICK-OUT ON DEACTIVATION ---------- */
let activeWatchTimer = null;
function startActiveWatch() {
  stopActiveWatch();
  activeWatchTimer = setInterval(checkStillActive, 30000); // every 30s
}
function stopActiveWatch() {
  if (activeWatchTimer) { clearInterval(activeWatchTimer); activeWatchTimer = null; }
}
async function checkStillActive() {
  if (!me) return true;
  try {
    const { data } = await client.from('pr_profiles').select('active').eq('id', me.id).maybeSingle();
    if (data && data.active === false) { await showDeactivated(); return false; }
  } catch (e) { /* network hiccup — don't boot the user */ }
  return true;
}
async function showDeactivated() {
  stopActiveWatch();
  me = null;
  try { await client.auth.signOut(); } catch (e) {}
  closeModal();
  $('app-view').classList.add('hidden');
  $('login-view').classList.add('hidden');
  $('recovery-view').classList.add('hidden');
  const um = $('unlinked-msg'); um.dataset.custom = '1'; um.textContent = t('deactivated_msg');
  $('unlinked-view').classList.remove('hidden');
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
    ['home', '⏱️', t('tab_clock')],
    ['dashboard', '📊', t('tab_team')],
    ['timesheets', '📝', t('tab_sheets')],
    ['payroll', '💵', t('tab_payroll')],
    ['payhistory', '🧾', t('tab_history')],
    ['timeoff', '🏖️', t('tab_timeoff')],
    ['team', '👥', t('tab_staff')],
  ];
  return [
    ['home', '⏱️', t('tab_clock')],
    ['timesheet', '📝', t('tab_timesheet')],
    ['timeoff', '🏖️', t('tab_timeoff')],
    ['pay', '💵', t('tab_pay')],
    ['payhistory', '🧾', t('tab_history')],
  ];
}
function buildNav() {
  const bar = $('tab-bar');
  bar.innerHTML = tabsForRole().map(([id, icon, label]) =>
    `<button data-tab="${id}" class="tab${id === currentTab ? ' active' : ''}">${icon}<span>${label}</span></button>`).join('');
  bar.querySelectorAll('.tab').forEach(t => t.onclick = () => { currentTab = t.dataset.tab; buildNav(); renderTab(); });
  updatePtoBadge(); // fire-and-forget; adds a count badge for managers
}

/* Pending-PTO badge on the manager's Time Off tab — quiet in-app nudge */
async function updatePtoBadge() {
  if (!isManager()) return;
  try {
    const { count } = await client.from('pr_pto_requests')
      .select('id', {count: 'exact', head: true}).eq('status', 'pending');
    if (!count) return;
    const btn = document.querySelector('.tab[data-tab="timeoff"]');
    if (btn && !btn.querySelector('.tab-badge')) {
      btn.insertAdjacentHTML('beforeend', `<span class="tab-badge">${count}</span>`);
    }
  } catch (e) { /* never break nav over a badge */ }
}
async function renderTab() {
  if (!await checkStillActive()) return; // booted mid-session by deactivation
  const content = $('tab-content');
  content.innerHTML = `<div class="loading">${t('loading')}</div>`;
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
    await maybeStaleBanner(content);
  } catch (e) {
    content.innerHTML = `<div class="card"><div class="error-box">${t('went_wrong')}${esc(e.message)}</div>
      <button class="btn-secondary" onclick="renderTab()">${t('try_again')}</button></div>`;
  }
}

/* ---------- FORGOTTEN CLOCK-OUT BANNER (20h+, manager only) ---------- */
async function maybeStaleBanner(content) {
  if (!isManager()) return;
  try {
    const { data: s } = await client.from('pr_settings')
      .select('value').eq('key', 'stale_clockout_alerts').maybeSingle();
    if (!s || s.value !== 'yes') return;
    const cutoff = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
    const { data: rows } = await client.from('pr_time_entries')
      .select('clock_in, pr_profiles!pr_time_entries_user_id_fkey(full_name)')
      .is('clock_out', null).lt('clock_in', cutoff).order('clock_in');
    if (!rows || !rows.length) return;
    const names = rows.map(r => {
      const nm = (r.pr_profiles && r.pr_profiles.full_name) || '—';
      const h = Math.floor((Date.now() - new Date(r.clock_in).getTime()) / 3600000);
      return `${esc(nm)} (${h}h)`;
    }).join(', ');
    const div = document.createElement('div');
    div.className = 'warn-box';
    div.innerHTML = `⚠️ ${t('stale_banner')} ${names}`;
    content.prepend(div);
  } catch (e) { /* never break the tab over a banner */ }
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
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.update().catch(() => {}); // check for app updates on every launch
      // When an update takes over, reload once into the new version.
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!reloaded) { reloaded = true; location.reload(); }
      });
    }).catch(() => {});
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

  let html = `<div class="section-head"><h2>${t('hi')}, ${esc(me.full_name || 'there')} 👋</h2></div>`;

  if (staleOpen) {
    html += `<div class="warn-box">⚠️ ${t('missed_clockout')} ${fmtDateTime(staleOpen.clock_in)}.
      <br><button class="btn-secondary btn-small" style="margin-top:8px" id="fix-stale">${t('close_it_now')}</button></div>`;
  }
  if (locked && !myOpenEntry) {
    html += `<div class="warn-box">🔒 ${t('week_closed_no_clock')}</div>`;
  }

  html += `<div class="card">`;
  if (myOpenEntry) {
    const since = new Date(myOpenEntry.clock_in);
    const liveHrs = (Date.now() - since.getTime()) / 3600000;
    html += `<div class="muted" style="text-align:center;margin-bottom:6px">${t('clocked_in_since')} <b>${fmtTime(myOpenEntry.clock_in)}</b> · ${esc(myOpenEntry.property || '')}</div>
      <button class="clock-btn out" id="clock-btn">${t('clock_out')}</button>
      <div class="clock-sub">${t('on_clock_so_far', {h: hrs(liveHrs)})}</div>`;
  } else {
    html += `<div class="inline-form" style="margin-bottom:10px">
        <label>${t('work_location')}
          <select id="clock-property">${PROPERTIES.map(p => `<option ${p === me.property ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
        </label></div>
      <button class="clock-btn" id="clock-btn" ${locked ? 'disabled' : ''}>${t('clock_in')}</button>
      <div class="clock-sub">${todayStr} · ${new Date().toLocaleTimeString(LANG === 'es' ? 'es-US' : 'en-US', {timeZone: TZ, hour: 'numeric', minute: '2-digit'})} CT</div>`;
  }
  html += `</div>`;

  html += `<div class="kpi-row">
    <div class="kpi"><div class="v">${hrs(todayHrs)}</div><div class="l">${t('hours_today')}</div></div>
    <div class="kpi"><div class="v">${hrs(weekHrs)}</div><div class="l">${t('hours_this_week')}</div></div>
    <div class="kpi"><div class="v">${myComp ? (me.pay_type === 'salary' ? t('salary') : money(myComp.pay_rate) + '/hr') : '—'}</div><div class="l">${t('my_pay_rate')}</div></div>
  </div>`;

  html += `<div class="card"><div class="t" style="font-weight:800;margin-bottom:8px">🏖️ ${t('whos_off_today')}</div>`;
  html += offNames.length
    ? offNames.map(n => `<div class="rowline"><div class="t">${esc(n)}</div><div><span class="pill approved">${t('on_pto')}</span></div></div>`).join('')
    : `<div class="muted">${t('full_crew')}</div>`;
  html += `</div>`;

  content.innerHTML = html;

  if (staleOpen) $('fix-stale').onclick = () => fixStaleEntry(staleOpen);
  const btn = $('clock-btn');
  if (btn && !btn.disabled) btn.onclick = myOpenEntry ? doClockOut : doClockIn;
}

async function doClockIn() {
  const property = $('clock-property') ? $('clock-property').value : me.property;
  const btn = $('clock-btn');
  btn.disabled = true; btn.textContent = t('getting_location');
  const loc = await getPosition(); // null if denied/unavailable — never blocks
  btn.textContent = t('clocking_in');
  const { error } = await client.from('pr_time_entries').insert({
    user_id: me.id, clock_in: new Date().toISOString(), property,
    clock_in_lat: loc ? loc.lat : null, clock_in_lng: loc ? loc.lng : null
  });
  if (error) { alert(t('could_not_clockin') + error.message); }
  periodsCache = {};
  await renderTab();
}

async function doClockOut() {
  if (!myOpenEntry) return;
  const btn = $('clock-btn');
  btn.disabled = true; btn.textContent = t('getting_location');
  const loc = await getPosition(); // null if denied/unavailable — never blocks
  btn.textContent = t('clocking_out');
  const { error } = await client.from('pr_time_entries')
    .update({ clock_out: new Date().toISOString(),
      clock_out_lat: loc ? loc.lat : null, clock_out_lng: loc ? loc.lng : null })
    .eq('id', myOpenEntry.id);
  if (error) { alert(t('could_not_clockout') + error.message); }
  periodsCache = {};
  await renderTab();
}

function fixStaleEntry(entry) {
  openModal(`
    <h3>${t('close_missed')}</h3>
    <p class="muted">${t('missed_desc', {t: fmtDateTime(entry.clock_in)})}</p>
    <label>${t('date_time_left')}
      <input type="datetime-local" id="stale-out" value="">
    </label>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn-primary" id="stale-save">${t('save_clockout')}</button>
    </div>`);
  $('stale-save').onclick = async () => {
    const v = $('stale-out').value;
    if (!v) { alert(t('enter_time_left')); return; }
    const outISO = chicagoWallToISO(v);
    if (new Date(outISO) <= new Date(entry.clock_in)) { alert(t('clockout_after_in')); return; }
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

  let html = `<div class="section-head"><h2>${managerMode ? esc(targetName) + t('timesheet_of') : t('my_timesheet')}</h2></div>
  <div class="card"><div class="cal-nav">
    <button class="btn-secondary btn-small" id="ts-prev">${t('prev')}</button>
    <div style="flex:1;text-align:center;font-weight:800">${weekLabel(tsWeek)}
      ${locked ? ` <span class="pill closed">${t('closed')}</span>` : ` <span class="pill open">${t('open')}</span>`}</div>
    <button class="btn-secondary btn-small" id="ts-next">${t('next')}</button>
  </div></div>`;

  if (!all.length) {
    html += `<div class="card"><div class="empty"><div class="big">📝</div>${t('no_entries_week')}</div></div>`;
  } else {
    html += days.map(({d, entries: des, hours: h}) => {
      if (!des.length) return '';
      const wd = (LANG === 'es' ? ['dom','lun','mar','mié','jue','vie','sáb'] : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[chiWeekday(d)];
      return `<div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <b>${wd}, ${fmtDate(d)}</b><b>${hrs(h)} ${t('hrs')}</b>
        </div>` +
        des.map(e => {
          const h2 = entryHours(e);
          return `<div class="rowline">
            <div><div class="t">${fmtTime(e.clock_in)} → ${e.clock_out ? fmtTime(e.clock_out) : `<span class="pill pending">${t('open_pill')}</span>`}</div>
            <div class="s">${esc(e.property || '')}${e.note ? ' · ' + esc(e.note) : ''}${e.edited_by ? ' · ' + t('corrected') : ''}${locHtml(e, 'in')}${locHtml(e, 'out')}</div></div>
            <div class="num"><b>${h2 == null ? '—' : hrs(h2)}</b></div>
          </div>`;
        }).join('') + `</div>`;
    }).join('');
  }

  html += `<div class="kpi-row" style="grid-template-columns:1fr">
    <div class="kpi"><div class="v">${hrs(weekHrs)}</div><div class="l">${t('total_hours_week')}</div></div>
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
    pendingHtml = `<div class="card"><div class="t" style="font-weight:800;margin-bottom:8px">⏳ ${t('pending_approvals')} (${(pending || []).length})</div>` +
      ((pending || []).length ? pending.map(r => {
        const nm = (r.pr_profiles && r.pr_profiles.full_name) || '—';
        return `<div class="rowline"><div><div class="t">${esc(nm)}</div>
          <div class="s">${fmtDate(r.start_date)} → ${fmtDate(r.end_date)} · ${esc(t(r.pto_type) || r.pto_type)}${r.reason ? ' · ' + esc(r.reason) : ''}</div></div>
          <div style="display:flex;gap:6px">
            <button class="btn-secondary btn-small btn-ok" data-approve="${r.id}">${t('approve')}</button>
            <button class="btn-secondary btn-small btn-danger" data-deny="${r.id}">${t('deny')}</button>
          </div></div>`;
      }).join('') : `<div class="muted">${t('no_pending')}</div>`) + `</div>`;
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
    const name = (r.pr_profiles && r.pr_profiles.full_name) || t('teammate');
    for (let d = r.start_date; d <= r.end_date; d = addDays(d, 1)) {
      (byDay[d] = byDay[d] || []).push(name + (r.user_id === me.id ? ' ' + t('you') : ''));
    }
  });

  const monthName = new Date(Date.UTC(cy, cm - 1, 1)).toLocaleDateString(LANG === 'es' ? 'es-US' : 'en-US', {month: 'long', year: 'numeric', timeZone: 'UTC'});
  let cal = `<div class="cal-grid">` +
    (LANG === 'es' ? ['D','L','M','M','J','V','S'] : ['S','M','T','W','T','F','S']).map(d => `<div class="cal-dow">${d}</div>`).join('');
  for (let i = 0; i < firstDow; i++) cal += `<div class="cal-day dim"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${calMonth}-${String(d).padStart(2,'0')}`;
    const names = byDay[ds] || [];
    cal += `<div class="cal-day${names.length ? ' off' : ''}${ds === todayStr ? ' today' : ''}">
      <div class="d">${d}</div>${names.slice(0,3).map(n => `<div class="cal-name">🏖️ ${esc(n)}</div>`).join('')}
      ${names.length > 3 ? `<div class="cal-name">+${names.length - 3} ${t('more')}</div>` : ''}</div>`;
  }
  cal += `</div>`;

  let html = `<div class="section-head"><h2>${t('time_off')}</h2>
    <button class="btn-primary btn-small" id="pto-new">${t('request_time_off_btn')}</button></div>` + pendingHtml;

  html += `<div class="card"><div class="t" style="font-weight:800;margin-bottom:8px">${t('my_requests')}</div>`;
  html += (mine && mine.length)
    ? mine.map(r => `<div class="rowline">
        <div><div class="t">${fmtDate(r.start_date)} → ${fmtDate(r.end_date)}</div>
        <div class="s">${esc(t(r.pto_type) || r.pto_type)}${r.reason ? ' · ' + esc(r.reason) : ''}</div></div>
        <div style="display:flex;gap:6px;align-items:center"><span class="pill ${r.status}">${ptoStatusLabel(r.status)}</span>
        ${r.status === 'pending' ? `<button class="btn-secondary btn-small" data-cancel="${r.id}">${t('cancel')}</button>` : ''}</div>
      </div>`).join('')
    : `<div class="muted">${t('no_requests')}</div>`;
  html += `</div>`;

  html += `<div class="card"><div class="cal-nav" style="margin-bottom:10px">
      <button class="btn-secondary btn-small" id="cal-prev">←</button>
      <div style="flex:1;text-align:center;font-weight:800">${monthName}</div>
      <button class="btn-secondary btn-small" id="cal-next">→</button>
    </div>${cal}
    <div class="muted" style="margin-top:8px">${t('team_cal_note')}</div></div>`;

  content.innerHTML = html;
  $('pto-new').onclick = ptoRequestModal;
  $('cal-prev').onclick = () => { const d = new Date(Date.UTC(cy, cm - 2, 1)); calMonth = d.toISOString().slice(0,7); renderTab(); };
  $('cal-next').onclick = () => { const d = new Date(Date.UTC(cy, cm, 1)); calMonth = d.toISOString().slice(0,7); renderTab(); };
  content.querySelectorAll('[data-cancel]').forEach(b => b.onclick = async () => {
    if (!confirm(t('cancel_request'))) return;
    const { error } = await client.from('pr_pto_requests').delete().eq('id', b.dataset.cancel);
    if (error) alert(error.message); else renderTab();
  });
  content.querySelectorAll('[data-approve]').forEach(b => b.onclick = () => decidePto(b.dataset.approve, 'approved'));
  content.querySelectorAll('[data-deny]').forEach(b => b.onclick = () => decidePto(b.dataset.deny, 'denied'));
}

function ptoRequestModal() {
  const today = chiDateStr(new Date());
  openModal(`
    <h3>${t('request_time_off')}</h3>
    <label>${t('pto_type')}
      <select id="pto-type"><option value="vacation">${t('vacation')}</option><option value="sick">${t('sick')}</option><option value="personal">${t('personal')}</option></select>
    </label>
    <label>${t('start_date')}<input type="date" id="pto-start" value="${today}" min="${today}"></label>
    <label>${t('end_date')}<input type="date" id="pto-end" value="${today}" min="${today}"></label>
    <label>${t('reason_opt')}<textarea id="pto-reason" rows="2" placeholder="${t('reason_ph')}"></textarea></label>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn-primary" id="pto-save">${t('submit_request')}</button>
    </div>`);
  $('pto-save').onclick = async () => {
    const start_date = $('pto-start').value, end_date = $('pto-end').value;
    if (!start_date || !end_date) { alert(t('pick_dates')); return; }
    if (end_date < start_date) { alert(t('end_after_start')); return; }
    const { error } = await client.from('pr_pto_requests').insert({
      user_id: me.id, start_date, end_date,
      pto_type: $('pto-type').value, reason: $('pto-reason').value.trim() || null
    });
    if (error) alert(error.message); else { closeModal(); await renderTab(); }
  };
}

/* ---------- PAY STUBS ---------- */
const r2 = n => Math.round(Number(n || 0) * 100) / 100;

// Shared stub math. weekData: {hours, adj:[{amount,note}], pay:{gross,paid_at,note}|null}
function stubFor(payType, rate, weekData) {
  const hours = r2(weekData.hours || 0);
  const regular = rate == null ? 0 : (payType === 'salary' ? r2(rate / 52) : r2(hours * rate));
  const adjList = weekData.adj || [];
  const adjTotal = r2(adjList.reduce((s, a) => s + Number(a.amount), 0));
  const gross = r2(regular + adjTotal);
  const paid = weekData.pay ? r2(weekData.pay.gross) : 0;
  const balance = r2(Math.max(0, gross - paid));
  return {hours, regular, adjList, adjTotal, gross, paid, balance, pay: weekData.pay || null,
          noRate: rate == null, salary: payType === 'salary'};
}

function openStub(o) {
  // o: {name, property, payType, rate, weekFri, stub}
  const s = o.stub;
  const rateLabel = o.rate == null ? '—' : (o.payType === 'salary' ? money(o.rate) + '/yr' : money(o.rate) + '/hr');
  openModal(`
  <div id="stub-print">
    <h3>🧾 ${t('pay_stub')}</h3>
    <div class="stub-head">
      <div><b>${esc(o.name || '')}</b><br><span class="muted">${esc(o.property || '')}</span></div>
      <div style="text-align:right"><b>${t('week')}: ${weekLabel(o.weekFri)}</b><br><span class="muted">${t('payday')}: ${fmtDate(paydayOf(o.weekFri))}</span></div>
    </div>
    <div class="rowline"><div class="s">${t('total_hours')}</div><div class="num">${hrs(s.hours)}</div></div>
    <div class="rowline"><div class="s">${t('rate')}</div><div class="num">${esc(rateLabel)}</div></div>
    <div class="rowline"><div class="s">${t('regular_pay')}${o.payType === 'salary' ? '' : ` (${hrs(s.hours)} × ${money(o.rate || 0)})`}</div><div class="num">${money(s.regular)}</div></div>
    ${s.adjList.map(a => `<div class="rowline"><div class="s">${a.amount >= 0 ? '➕' : '➖'} ${esc(a.note || (a.amount >= 0 ? t('bonus') : t('deduction')))}</div><div class="num">${a.amount >= 0 ? '+' : '−'}${money(Math.abs(a.amount))}</div></div>`).join('')}
    ${s.noRate ? `<div class="muted" style="margin:6px 0">${t('no_rate_note')}</div>` : ''}
    ${s.salary ? `<div class="muted" style="margin:6px 0">${t('salary_note')}</div>` : ''}
    <div class="rowline stub-total"><div><b>${t('total_gross')}</b></div><div class="num"><b>${money(s.gross)}</b></div></div>
    <div class="rowline"><div class="s">${s.pay ? t('paid_on') + ' ' + fmtDate((s.pay.paid_at || '').slice(0, 10)) : t('paid')}</div>
      <div class="num">${s.pay ? `<span class="pill paid">${t('paid')}</span> ${money(s.paid)}` : `<span class="pill owed">${t('unpaid')}</span>`}</div></div>
    ${s.balance > 0.005 ? `<div class="rowline"><div class="s">${t('balance_owed')}</div><div class="num"><b>${money(s.balance)}</b></div></div>` : ''}
    <div class="muted" style="margin-top:8px">${t('pay_estimates_note')}</div>
  </div>
  <div class="modal-actions no-print">
    <button class="btn-secondary" onclick="closeModal()">${t('cancel')}</button>
    <button class="btn-primary" id="stub-print-btn">🖨️ ${t('print')}</button>
  </div>`);
  $('stub-print-btn').onclick = () => window.print();
}

async function viewPay(content) {
  const [entriesRes, adjRes, payRes] = await Promise.all([
    client.from('pr_time_entries').select('clock_in, clock_out').eq('user_id', me.id)
      .not('clock_out', 'is', null).order('clock_in', {ascending: false}).limit(500),
    client.from('pr_adjustments').select('*').eq('user_id', me.id).order('week_start', {ascending: false}).limit(100),
    client.from('pr_payments').select('*').eq('user_id', me.id).order('week_start', {ascending: false}).limit(100)
  ]);
  const weeks = {};
  (entriesRes.data || []).forEach(e => {
    const w = entryWeek(e);
    weeks[w] = weeks[w] || {hours: 0, adj: [], pay: null};
    weeks[w].hours += entryHours(e) || 0;
  });
  (adjRes.data || []).forEach(a => {
    const w = a.week_start;
    weeks[w] = weeks[w] || {hours: 0, adj: [], pay: null};
    weeks[w].adj.push(a);
  });
  (payRes.data || []).forEach(p => {
    const w = p.week_start;
    weeks[w] = weeks[w] || {hours: 0, adj: [], pay: null};
    weeks[w].pay = p;
  });
  const wkList = Object.keys(weeks).sort().reverse().slice(0, 12);
  const rate = myComp ? Number(myComp.pay_rate) : null;

  let html = `<div class="section-head"><h2>${t('my_pay')}</h2></div>
  <div class="card"><div class="rowline"><div><div class="t">${esc(me.full_name || '')}</div>
    <div class="s">${esc(me.property || '')} · ${esc(me.pay_type)}</div></div>
    <div class="num"><b>${rate == null ? '—' : (me.pay_type === 'salary' ? money(rate) + '/yr' : money(rate) + '/hr')}</b><div class="s">${t('my_rate')}</div></div></div></div>`;

  if (!wkList.length) {
    html += `<div class="card"><div class="empty"><div class="big">💵</div>${t('no_stubs')}</div></div>`;
  } else {
    html += wkList.map(w => {
      const s = stubFor(me.pay_type, rate, weeks[w]);
      return `<div class="card stub-card" data-stub="${w}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div><b>${weekLabel(w)}</b><br><span class="muted">${t('payday')}: ${fmtDate(paydayOf(w))}</span></div>
          <b style="font-size:18px">${money(s.gross)}</b></div>
        <div class="rowline"><div class="s">${t('total_hours')} · ${hrs(s.hours)}${s.adjTotal ? ` · ${t('adjustments')}: ${s.adjTotal >= 0 ? '+' : '−'}${money(Math.abs(s.adjTotal)).slice(1)}` : ''}</div>
        <div class="num">${s.pay ? `<span class="pill paid">${t('paid')}</span>` : `<span class="pill owed">${t('unpaid')}</span>`}${s.balance > 0.005 ? ` <span class="muted">${t('balance_owed')}: ${money(s.balance)}</span>` : ''}</div></div>
      </div>`;
    }).join('');
  }
  html += `<div class="muted">${t('pay_estimates_note')}</div>`;
  content.innerHTML = html;
  content.querySelectorAll('[data-stub]').forEach(c => c.onclick = () => {
    const w = c.dataset.stub;
    openStub({name: me.full_name, property: me.property, payType: me.pay_type, rate, weekFri: w,
              stub: stubFor(me.pay_type, rate, weeks[w])});
  });
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

  let html = `<div class="section-head"><h2>${t('team_dashboard')}</h2></div>
  <div class="kpi-row">
    <div class="kpi"><div class="v">${openList.length}</div><div class="l">${t('clocked_in_now')}</div></div>
    <div class="kpi"><div class="v">${pending.length}</div><div class="l">${t('pto_requests')}</div></div>
    <div class="kpi"><div class="v">${hrs(weekHrs)}</div><div class="l">${t('team_hrs_week')}</div></div>
  </div>`;

  html += `<div class="card"><div class="t" style="font-weight:800;margin-bottom:8px">🟢 ${t('on_clock_now')}</div>`;
  html += openList.length ? openList.map(e => {
    const p = e.pr_profiles || {};
    const liveH = (Date.now() - new Date(e.clock_in).getTime()) / 3600000;
    return `<div class="rowline"><div><div class="t">${esc(p.full_name || '—')}</div>
      <div class="s">${esc(e.property || p.property || '')} · ${t('clocked_in_since')} ${fmtTime(e.clock_in)}</div></div>
      <div class="num"><b>${hrs(liveH)}h</b></div></div>`;
  }).join('') : `<div class="muted">${t('nobody_clocked')}</div>`;
  html += `</div>`;

  html += `<div class="card"><div class="t" style="font-weight:800;margin-bottom:8px">🏖️ ${t('pending_timeoff')}</div>`;
  html += pending.length ? pending.map(r => {
    const p = r.pr_profiles || {};
    return `<div class="rowline"><div><div class="t">${esc(p.full_name || '—')}</div>
      <div class="s">${fmtDate(r.start_date)} → ${fmtDate(r.end_date)} · ${esc(t(r.pto_type) || r.pto_type)}${r.reason ? ' · ' + esc(r.reason) : ''}</div></div>
      <div style="display:flex;gap:6px">
        <button class="btn-secondary btn-small btn-ok" data-approve="${r.id}">${t('approve')}</button>
        <button class="btn-secondary btn-small btn-danger" data-deny="${r.id}">${t('deny')}</button>
      </div></div>`;
  }).join('') : `<div class="muted">${t('no_pending_party')}</div>`;
  html += `</div>`;

  html += `<div class="card"><div class="t" style="font-weight:800;margin-bottom:8px">👥 ${t('active_staff')} (${profiles.length})</div>`;
  html += profiles.map(p => `<div class="rowline"><div><div class="t">${esc(p.full_name || p.email || '—')}</div>
    <div class="s">${esc(p.property || '')}</div></div></div>`).join('') || `<div class="muted">${t('no_staff_dashboard')}</div>`;
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

  let html = `<div class="section-head"><h2>${t('timesheets')}</h2></div>
  <div class="card"><div class="inline-form">
    <div class="inline-row">
      <label>${t('week')}
        <div class="cal-nav"><button class="btn-secondary btn-small" id="mts-prev">←</button>
        <div style="flex:1;text-align:center;font-weight:700;font-size:13px">${weekLabel(mTsWeek)}</div>
        <button class="btn-secondary btn-small" id="mts-next">→</button></div>
      </label>
    </div>
    <div class="inline-row">
      <label>${t('property')}
        <select id="mts-prop"><option value="all">${t('all_properties')}</option>
        ${PROPERTIES.map(p => `<option ${p === mTsProp ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
      </label>
      <label>${t('employee')}
        <select id="mts-user"><option value="all">${t('everyone')}</option>
        ${plist.map(p => `<option value="${p.id}" ${p.id === mTsUser ? 'selected' : ''}>${esc(p.full_name || '')}</option>`).join('')}</select>
      </label>
    </div>
    ${locked ? `<div class="warn-box" style="margin:8px 0 0">🔒 ${t('week_closed_reopen')}</div>` : ''}
  </div></div>`;

  const uids = Object.keys(byUser);
  if (!uids.length) {
    html += `<div class="card"><div class="empty"><div class="big">📝</div>${t('no_entries_filter')}</div></div>`;
  } else {
    html += uids.map(uid => {
      const es = byUser[uid];
      const nm = (es[0].pr_profiles && es[0].pr_profiles.full_name) || '—';
      const th = es.reduce((s, e) => s + (entryHours(e) || 0), 0);
      return `<div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <b>${esc(nm)}</b><b>${hrs(th)} ${t('hrs')}</b></div>` +
        es.map(e => `<div class="rowline">
          <div><div class="t">${fmtDateTime(e.clock_in)} → ${e.clock_out ? fmtTime(e.clock_out) : `<span class="pill pending">${t('open_pill')}</span>`}</div>
          <div class="s">${esc(e.property || '')}${e.note ? ' · ' + esc(e.note) : ''}${e.edited_by ? ' · ' + t('corrected') : ''}${locHtml(e, 'in')}${locHtml(e, 'out')}</div></div>
          <div style="display:flex;gap:6px;align-items:center"><b>${entryHours(e) == null ? '—' : hrs(entryHours(e))}</b>
          ${!locked ? `<button class="btn-secondary btn-small" data-edit="${e.id}">${t('edit')}</button>` : ''}</div>
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
  if (!e) { alert(t('entry_not_found')); return; }
  openModal(`
    <h3>${t('correct_entry')}</h3>
    <label>${t('clock_in_ct')}<input type="datetime-local" id="ee-in" value="${toLocalInput(e.clock_in)}"></label>
    <label>${t('clock_out_ct')}<input type="datetime-local" id="ee-out" value="${toLocalInput(e.clock_out)}"></label>
    <label>${t('property')}
      <select id="ee-prop">${PROPERTIES.map(p => `<option ${p === e.property ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
    </label>
    <label>${t('note')}<input type="text" id="ee-note" value="${esc(e.note || '')}" placeholder="${t('reason_correction')}"></label>
    <div class="modal-actions">
      <button class="btn-secondary btn-danger" id="ee-del">${t('delete')}</button>
      <button class="btn-secondary" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn-primary" id="ee-save">${t('save')}</button>
    </div>`);
  $('ee-save').onclick = async () => {
    const ci = $('ee-in').value, co = $('ee-out').value;
    if (!ci) { alert(t('clockin_required')); return; }
    const clock_in = new Date(chicagoWallToISO(ci)), clock_out = co ? new Date(chicagoWallToISO(co)) : null;
    if (clock_out && clock_out <= clock_in) { alert(t('clockout_after_in')); return; }
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
    if (!confirm(t('delete_entry'))) return;
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

  // entries across recent weeks (for running balances) + all recorded payments + adjustments
  const since = addDays(prWeek, -7 * 26);
  const [{ data: profiles }, { data: compRows }, { data: entries }, { data: payments }, { data: adjustments }] = await Promise.all([
    client.from('pr_profiles').select('id, full_name, email, property, pay_type').eq('active', true).order('full_name'),
    client.from('pr_comp').select('user_id, pay_rate'),
    client.from('pr_time_entries').select('user_id, clock_in, clock_out')
      .gte('clock_in', since + 'T00:00:00Z').not('clock_out', 'is', null),
    client.from('pr_payments').select('*'),
    client.from('pr_adjustments').select('*').gte('week_start', since)
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
  const adjUW = {}; // uid -> {weekStart: [adjustments]}
  (adjustments || []).forEach(a => {
    ((adjUW[a.user_id] = adjUW[a.user_id] || {})[a.week_start] =
      (adjUW[a.user_id][a.week_start] || [])).push(a);
  });

  function adjFor(uid, w) { return (adjUW[uid] && adjUW[uid][w]) || []; }
  function adjTotalFor(uid, w) { return r2(adjFor(uid, w).reduce((s, a) => s + Number(a.amount), 0)); }
  function grossFor(uid, w) {
    const p = profMap[uid], rate = compMap[uid];
    const adj = adjTotalFor(uid, w);
    if (rate == null || !p) return adj;
    if (p.pay_type === 'salary') return r2(rate / 52 + adj);
    return r2((hrsUW[uid] && hrsUW[uid][w] || 0) * rate + adj);
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
    const adj = adjTotalFor(p.id, prWeek);
    const gross = grossFor(p.id, prWeek);
    const pay = payUW[p.id] && payUW[p.id][prWeek];
    const paid = pay ? r2(pay.gross) : 0;
    const weekBal = r2(Math.max(0, gross - paid));
    return {...p, hours: h, gross, rate, adj, adjList: adjFor(p.id, prWeek), paid, payRec: pay || null, weekBal,
      totalBal: balanceFor(p.id), unpaid: unpaidWeeks(p.id),
      note: rate == null ? t('no_rate_set') : (p.pay_type === 'salary' ? t('salary') : '')};
  });
  const totGross = r2(rows.reduce((s, r) => s + r.gross, 0));
  const totHrs = rows.reduce((s, r) => s + r.hours, 0);
  const totBal = r2(rows.reduce((s, r) => s + r.totalBal, 0));
  const unpaidThisWeek = rows.filter(r => r.weekBal > 0.005);
  const withBal = rows.filter(r => r.totalBal > 0.005);

  let html = `<div class="section-head"><h2>${t('payroll')}</h2>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn-secondary btn-small" id="pr-csv">⬇ CSV</button>
      ${unpaidThisWeek.length ? `<button class="btn-primary btn-small" id="pr-payall">${t('mark_week_paid')} (${unpaidThisWeek.length})</button>` : ''}
      ${locked
        ? `<button class="btn-secondary btn-small" id="pr-reopen">${t('reopen_week')}</button>`
        : `<button class="btn-secondary btn-small" id="pr-close">${t('close_period')}</button>`}
    </div></div>
  <div class="card"><div class="cal-nav">
    <button class="btn-secondary btn-small" id="pr-prev">${t('prev')}</button>
    <div style="flex:1;text-align:center;font-weight:800">${weekLabel(prWeek)}
      ${locked ? ` <span class="pill closed">${t('closed')}</span>` : ` <span class="pill open">${t('open')}</span>`}</div>
    <button class="btn-secondary btn-small" id="pr-next">${t('next')}</button>
  </div>
  <div class="muted" style="margin-top:8px">${t('pay_week_note', {d: fmtDate(payday)})}</div></div>`;

  html += `<div class="kpi-row">
    <div class="kpi"><div class="v">${rows.length}</div><div class="l">Employees</div></div>
    <div class="kpi"><div class="v">${hrs(totHrs)}</div><div class="l">Hours this week</div></div>
    <div class="kpi"><div class="v">${money(totGross)}</div><div class="l">Gross this week</div></div>
    <div class="kpi"><div class="v">${money(totBal)}</div><div class="l">Balance owed</div></div>
  </div>`;

  html += `<div class="card"><div class="table-scroll"><table class="data">
    <tr><th>${t('employee')}</th><th class="num">${t('hours')}</th><th class="num">${t('rate')}</th><th class="num">${t('gross')}</th><th class="num">${t('paid')}</th><th class="num">${t('balance')}</th><th></th></tr>` +
    rows.map(r => `<tr>
      <td><b>${esc(r.full_name || '')}</b><br><span class="muted">${esc(r.property || '')}${r.note ? ' · ' + esc(r.note) : ''}</span></td>
      <td class="num">${hrs(r.hours)}</td>
      <td class="num">${r.rate == null ? '—' : (r.pay_type === 'salary' ? money(r.rate) + '/yr' : money(r.rate))}</td>
      <td class="num"><b>${money(r.gross)}</b>${r.adj ? `<br><span class="muted">${t('adjustments')}: ${r.adj >= 0 ? '+' : '−'}${money(Math.abs(r.adj)).slice(1)}</span>` : ''}</td>
      <td class="num">${r.payRec ? `<span class="pill paid">${t('paid')}</span><br><span class="muted">${fmtDate((r.payRec.paid_at || '').slice(0, 10))}</span>` : '—'}</td>
      <td class="num">${r.weekBal > 0.005 ? `<span class="pill owed">${money(r.weekBal)}</span>` : '<span class="muted">$0.00</span>'}</td>
      <td class="num"><div style="display:flex;gap:4px;justify-content:flex-end;flex-wrap:wrap">
        <button class="btn-secondary btn-small" data-adj="${r.id}" data-name="${esc(r.full_name || '')}" title="${t('add_adjustment')}">＋/−</button>
        <button class="btn-secondary btn-small" data-stubmgr="${r.id}" title="${t('pay_stub')}">🧾</button>
        ${r.weekBal > 0.005 ? `<button class="btn-secondary btn-small" data-markpaid="${r.id}" data-week="${prWeek}" data-gross="${r.weekBal}" data-name="${esc(r.full_name || '')}">${t('mark_paid')}</button>` : ''}
      </div></td>
    </tr>`).join('') +
    `<tr><td><b>${t('totals')}</b></td><td class="num"><b>${hrs(totHrs)}</b></td><td></td>
     <td class="num"><b>${money(totGross)}</b></td><td></td>
     <td class="num"><b>${money(r2(rows.reduce((s, r) => s + r.weekBal, 0)))}</b></td><td></td></tr></table></div></div>`;

  if (withBal.length) {
    html += `<div class="card"><div class="t" style="font-weight:800;margin-bottom:8px">💰 ${t('outstanding', {t: money(totBal)})}</div>` +
      withBal.map(r => `<div class="rowline"><div><div class="t">${esc(r.full_name || '')}</div>
        <div class="s">${r.unpaid.map(u => `${fmtDateShort(u.w)}: ${money(u.bal)}`).join(' · ')}</div></div>
        <div class="num"><b>${money(r.totalBal)}</b></div></div>`).join('') + `</div>`;
  } else {
    html += `<div class="card"><div class="muted">✅ ${t('no_balances')}</div></div>`;
  }
  html += `<div class="muted">${t('csv_note')}</div>`;

  content.innerHTML = html;
  $('pr-prev').onclick = () => { prWeek = addDays(prWeek, -7); renderTab(); };
  $('pr-next').onclick = () => { prWeek = addDays(prWeek, 7); renderTab(); };
  $('pr-csv').onclick = () => exportPayrollCsv(rows, prWeek);
  content.querySelectorAll('[data-markpaid]').forEach(b => b.onclick = async () => {
    const uid = b.dataset.markpaid, w = b.dataset.week, g = parseFloat(b.dataset.gross);
    if (!confirm(t('confirm_mark_paid', {m: money(g), n: b.dataset.name, w: weekLabel(w)}))) return;
    const { error } = await client.from('pr_payments').upsert({
      user_id: uid, week_start: w, gross: g, paid_by: me.id,
      paid_at: new Date().toISOString(), note: 'Payday ' + fmtDateShort(paydayOf(w))
    }, {onConflict: 'user_id,week_start'});
    if (error) alert(error.message); else renderTab();
  });
  const payAll = $('pr-payall');
  if (payAll) payAll.onclick = async () => {
    const total = r2(unpaidThisWeek.reduce((s, r) => s + r.weekBal, 0));
    if (!confirm(t('confirm_pay_all', {n: unpaidThisWeek.length, t: money(total)}))) return;
    for (const r of unpaidThisWeek) {
      const { error } = await client.from('pr_payments').upsert({
        user_id: r.id, week_start: prWeek, gross: r.weekBal, paid_by: me.id,
        paid_at: new Date().toISOString(), note: 'Payday ' + fmtDateShort(paydayOf(prWeek))
      }, {onConflict: 'user_id,week_start'});
      if (error) { alert(t('stopped_early') + error.message); break; }
    }
    renderTab();
  };
  const closeBtn = $('pr-close');
  if (closeBtn) closeBtn.onclick = async () => {
    if (!confirm(t('confirm_close', {w: weekLabel(prWeek)}))) return;
    const { error } = await client.from('pr_pay_periods')
      .update({status: 'closed', closed_by: me.id, closed_at: new Date().toISOString()}).eq('id', period.id);
    if (error) alert(error.message); else { periodsCache = {}; renderTab(); }
  };
  const reopenBtn = $('pr-reopen');
  if (reopenBtn) reopenBtn.onclick = async () => {
    if (!confirm(t('confirm_reopen'))) return;
    const { error } = await client.from('pr_pay_periods')
      .update({status: 'open', closed_by: null, closed_at: null}).eq('id', period.id);
    if (error) alert(error.message); else { periodsCache = {}; renderTab(); }
  };
  content.querySelectorAll('[data-adj]').forEach(b => b.onclick = () => adjModal(b.dataset.adj, b.dataset.name, prWeek));
  content.querySelectorAll('[data-stubmgr]').forEach(b => b.onclick = () => {
    const r = rows.find(x => x.id === b.dataset.stubmgr);
    if (!r) return;
    const wd = {hours: r.hours, adj: r.adjList, pay: r.payRec};
    openStub({name: r.full_name, property: r.property, payType: r.pay_type, rate: r.rate,
              weekFri: prWeek, stub: stubFor(r.pay_type, r.rate, wd)});
  });
}

/* ---------- PAY ADJUSTMENTS (bonus / deduction) ---------- */
async function adjModal(uid, name, weekFri) {
  const { data: existing } = await client.from('pr_adjustments')
    .select('id, amount, note, created_at').eq('user_id', uid).eq('week_start', weekFri)
    .order('created_at');
  const list = (existing || []).map(a => `<div class="rowline">
      <div class="s">${a.amount >= 0 ? '➕' : '➖'} ${esc(a.note || (a.amount >= 0 ? t('bonus') : t('deduction')))}</div>
      <div class="num">${a.amount >= 0 ? '+' : '−'}${money(Math.abs(a.amount))}
        <button class="link-btn" data-del-adj="${a.id}" style="color:#b91c1c;margin-left:8px">✕</button></div>
    </div>`).join('');
  openModal(`
    <h3>${t('add_adjustment')} — ${esc(name)}</h3>
    <p class="muted">${weekLabel(weekFri)}</p>
    ${list ? `<div style="margin-bottom:10px">${list}</div>` : ''}
    <label>${t('adj_amount')}<input type="number" id="adj-amt" step="0.01" placeholder="25.00"></label>
    <label>${t('note')}<input type="text" id="adj-note" placeholder="${t('adj_note_ph')}"></label>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn-primary" id="adj-save">${t('save')}</button>
    </div>`);
  document.querySelectorAll('[data-del-adj]').forEach(b => b.onclick = async () => {
    if (!confirm(t('delete_entry'))) return;
    const { error } = await client.from('pr_adjustments').delete().eq('id', b.dataset.delAdj);
    if (error) alert(error.message); else { closeModal(); adjModal(uid, name, weekFri); }
  });
  $('adj-save').onclick = async () => {
    const amount = parseFloat($('adj-amt').value);
    if (isNaN(amount) || amount === 0) { alert(t('enter_amount')); return; }
    const { error } = await client.from('pr_adjustments').insert({
      user_id: uid, week_start: weekFri, amount,
      note: $('adj-note').value.trim() || null, created_by: me.id
    });
    if (error) alert(error.message); else { closeModal(); await renderTab(); }
  };
}

function exportPayrollCsv(rows, friStr) {
  const head = ['Name','Email','Property','Pay type','Week','Payday','Hours','Rate','Adjustments','Gross pay','Paid','Balance owed'];
  const lines = rows.map(r => [
    r.full_name || '', r.email || '', r.property || '', r.pay_type || '',
    weekLabel(friStr), fmtDateShort(paydayOf(friStr)),
    hrs(r.hours),
    r.rate == null ? '' : (r.pay_type === 'salary' ? r.rate + '/yr' : r.rate),
    r.adj ? r.adj.toFixed(2) : '',
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

  let html = `<div class="section-head"><h2>${t('pay_history')}</h2></div>`;

  if (isManager()) {
    const { data: profiles } = await client.from('pr_profiles')
      .select('id, full_name').eq('active', true).order('full_name');
    html += `<div class="card"><div class="inline-form"><label>${t('employee')}
      <select id="ph-user"><option value="all">${t('everyone')}</option>
      ${(profiles || []).map(p => `<option value="${p.id}" ${p.id === phUser ? 'selected' : ''}>${esc(p.full_name || '')}</option>`).join('')}</select>
    </label></div></div>`;
  }

  if (!pays.length) {
    html += `<div class="card"><div class="empty"><div class="big">🧾</div>${t('no_payments')}</div></div>`;
  } else if (!isManager()) {
    html += pays.map(p => `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <b>${weekLabel(p.week_start)}</b><b style="font-size:18px">${money(p.gross)}</b></div>
      <div class="rowline"><div class="s">${t('paid_on')}</div><div class="num">${fmtDate((p.paid_at || '').slice(0, 10))}</div></div>
      ${p.note ? `<div class="muted" style="margin-top:6px">${esc(p.note)}</div>` : ''}
    </div>`).join('');
  } else {
    html += `<div class="card"><div class="table-scroll"><table class="data">
      <tr><th>${t('employee')}</th><th>${t('week')}</th><th class="num">${t('gross')}</th><th>${t('paid_on')}</th></tr>` +
      pays.map(p => {
        const nm = (p.pr_profiles && p.pr_profiles.full_name) || '—';
        return `<tr><td><b>${esc(nm)}</b></td><td>${weekLabel(p.week_start)}</td>
          <td class="num"><b>${money(p.gross)}</b></td><td>${fmtDate((p.paid_at || '').slice(0, 10))}${p.note ? `<br><span class="muted">${esc(p.note)}</span>` : ''}</td></tr>`;
      }).join('') + `</table></div></div>`;
  }
  html += `<div class="muted">${t('history_note')}</div>`;
  content.innerHTML = html;
  const sel = $('ph-user');
  if (sel) sel.onchange = e => { phUser = e.target.value; renderTab(); };
}

/* ---------- TEAM MANAGEMENT ---------- */
async function viewTeam(content) {
  const [{ data: profiles }, { data: compRows }, { data: inviteRows }, { data: settingRows }] = await Promise.all([
    client.from('pr_profiles').select('*').order('active', {ascending: false}).order('full_name'),
    client.from('pr_comp').select('user_id, pay_rate'),
    client.from('pr_invites').select('profile_id'),
    client.from('pr_settings').select('key, value')
  ]);
  const compMap = {}; (compRows || []).forEach(c => compMap[c.user_id] = c.pay_rate);
  const inviteSet = new Set((inviteRows || []).map(i => i.profile_id));
  const plist = profiles || [];
  const staleAlerts = ((settingRows || []).find(s => s.key === 'stale_clockout_alerts') || {}).value === 'yes';

  // Invite-email UI for staff who haven't created their account yet (server sends the email instantly on insert)
  const inviteBlock = p => {
    if (p.auth_user_id) return '';
    if (inviteSet.has(p.id)) return `<div class="invite-row"><span class="pill sent">${t('invite_sent')}</span>
      <button class="link-btn" data-invite="${p.id}">${t('resend')}</button></div>`;
    return `<div class="invite-row"><button class="btn-secondary btn-small" data-invite="${p.id}">${t('send_invite')}</button></div>`;
  };

  let html = `<div class="section-head"><h2>${t('staff')}</h2>
    <button class="btn-primary btn-small" id="team-add">+ ${t('add_employee')}</button></div>`;

  html += `<div class="card"><div class="t" style="font-weight:800;margin-bottom:4px">${t('alerts_title')}</div>
    <div class="muted" style="margin-bottom:8px">${t('alerts_desc')}</div>
    <div class="seg-toggle">
      <button class="${staleAlerts ? 'active' : ''}" data-stale="yes">${t('yes')}</button><button class="${!staleAlerts ? 'active' : ''}" data-stale="no">${t('no')}</button>
    </div></div>`;

  if (!plist.length) {
    html += `<div class="card"><div class="empty"><div class="big">👥</div>${t('no_staff')}<br>${t('no_staff_add')}</div></div>`;
  } else {
    html += plist.map(p => `<div class="card" style="${p.active ? '' : 'opacity:.55'}">
      <div class="rowline"><div>
        <div class="t">${esc(p.full_name || '(no name)')} ${p.role === 'manager' ? '⭐' : ''}</div>
        <div class="s">${esc(p.email || '')} · ${esc(p.property || '')} · ${esc(t(p.pay_type) || p.pay_type)} ·
          ${compMap[p.id] != null ? (p.pay_type === 'salary' ? money(compMap[p.id]) + '/yr' : money(compMap[p.id]) + '/hr') : t('no_rate')} ·
          ${p.auth_user_id ? t('acct_linked') : t('no_acct')}</div></div>
        <div style="display:flex;gap:6px">
          <button class="btn-secondary btn-small" data-edit-staff="${p.id}">${t('edit')}</button>
          <button class="btn-secondary btn-small ${p.active ? 'btn-danger' : 'btn-ok'}" data-toggle-staff="${p.id}">${p.active ? t('deactivate') : t('reactivate')}</button>
        </div></div>
      ${inviteBlock(p)}</div>`).join('');
  }
  content.innerHTML = html;
  $('team-add').onclick = () => staffModal(null);
  content.querySelectorAll('[data-stale]').forEach(b => b.onclick = async () => {
    const { error } = await client.from('pr_settings').upsert(
      {key: 'stale_clockout_alerts', value: b.dataset.stale, updated_by: me.id, updated_at: new Date().toISOString()},
      {onConflict: 'key'});
    if (error) alert(error.message); else renderTab();
  });
  content.querySelectorAll('[data-invite]').forEach(b => b.onclick = () => queueInvite(b.dataset.invite));
  content.querySelectorAll('[data-edit-staff]').forEach(b => b.onclick = async () => {
    const { data } = await client.from('pr_profiles').select('*').eq('id', b.dataset.editStaff).single();
    const { data: comp } = await client.from('pr_comp').select('*').eq('user_id', b.dataset.editStaff).maybeSingle();
    staffModal(data, comp);
  });
  content.querySelectorAll('[data-toggle-staff]').forEach(b => b.onclick = async () => {
    const { data: p } = await client.from('pr_profiles').select('active, full_name').eq('id', b.dataset.toggleStaff).single();
    if (!confirm(t('confirm_toggle', {a: p.active ? t('deactivate') : t('reactivate'), n: p.full_name}))) return;
    const { error } = await client.from('pr_profiles').update({active: !p.active}).eq('id', b.dataset.toggleStaff);
    if (error) alert(error.message); else renderTab();
  });
}

// Queue (or re-queue) an invite email for an unclaimed employee.
// Deletes any existing pr_invites row then inserts a fresh one — the server
// trigger fires on INSERT, so delete+insert re-fires it on Resend.
async function queueInvite(profileId) {
  const { data: p, error: e0 } = await client.from('pr_profiles').select('id, email').eq('id', profileId).single();
  if (e0 || !p) { alert(t('could_not_load')); return; }
  const del = await client.from('pr_invites').delete().eq('profile_id', p.id);
  if (del.error) { alert(del.error.message); return; }
  const { error } = await client.from('pr_invites').insert({ profile_id: p.id, email: p.email });
  if (error) { alert(error.message); return; }
  await renderTab();
}

function staffModal(p, comp) {
  const isNew = !p;
  openModal(`
    <h3>${isNew ? t('add_employee') : t('edit_employee')}</h3>
    <label>${t('fullname')}<input type="text" id="st-name" value="${esc(p?.full_name || '')}"></label>
    <label>${t('email')}<input type="email" id="st-email" value="${esc(p?.email || '')}" ${isNew ? '' : 'disabled'}></label>
    <div class="inline-row">
      <label>${t('property')}
        <select id="st-prop">${PROPERTIES.map(x => `<option ${x === p?.property ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
      </label>
      <label>${t('role')}
        <select id="st-role"><option value="employee" ${p?.role !== 'manager' ? 'selected' : ''}>${t('employee')}</option><option value="manager" ${p?.role === 'manager' ? 'selected' : ''}>${t('manager')}</option></select>
      </label>
    </div>
    <div class="inline-row">
      <label>${t('pay_type')}
        <select id="st-paytype"><option value="hourly" ${p?.pay_type !== 'salary' ? 'selected' : ''}>${t('hourly')}</option><option value="salary" ${p?.pay_type === 'salary' ? 'selected' : ''}>${t('salary')}</option></select>
      </label>
      <label><span id="st-rate-label">${p?.pay_type === 'salary' ? t('annual_salary') : t('hourly_rate')}</span>
        <input type="number" id="st-rate" min="0" step="0.01" value="${comp?.pay_rate ?? ''}" placeholder="e.g. ${p?.pay_type === 'salary' ? '35000' : '15.00'}">
      </label>
    </div>
    <label>${t('hire_date')}<input type="date" id="st-hire" value="${p?.hire_date || ''}"></label>
    ${isNew ? `<p class="muted">${t('after_add_tap')}</p>` : ''}
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">${t('cancel')}</button>
      <button class="btn-primary" id="st-save">${isNew ? t('add_employee') : t('save')}</button>
    </div>`);
  $('st-paytype').onchange = e => {
    $('st-rate-label').textContent = e.target.value === 'salary' ? t('annual_salary') : t('hourly_rate');
  };
  $('st-save').onclick = async () => {
    const full_name = $('st-name').value.trim(), email = $('st-email').value.trim().toLowerCase();
    const property = $('st-prop').value, role = $('st-role').value, pay_type = $('st-paytype').value;
    const rate = parseFloat($('st-rate').value);
    const hire_date = $('st-hire').value || null;
    if (!full_name || !email) { alert(t('name_email_required')); return; }
    if (isNaN(rate) || rate < 0) { alert(t('valid_rate')); return; }
    if (isNew) {
      const { data: prof, error } = await client.from('pr_profiles')
        .insert({email, full_name, role, property, pay_type, hire_date}).select().single();
      if (error) { alert(error.message); return; }
      const { error: e2 } = await client.from('pr_comp').insert({user_id: prof.id, pay_rate: rate});
      if (e2) { alert(t('added_rate_fail') + e2.message); }
    } else {
      const { error } = await client.from('pr_profiles')
        .update({full_name, property, role, pay_type, hire_date}).eq('id', p.id);
      if (error) { alert(error.message); return; }
      const { error: e2 } = await client.from('pr_comp').upsert({user_id: p.id, pay_rate: rate, updated_at: new Date().toISOString()});
      if (e2) { alert(t('saved_rate_fail') + e2.message); return; }
    }
    closeModal(); await renderTab();
  };
}
