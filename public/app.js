
// ── UTILITIES ──
function toast(msg, ms=2800) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('show'), ms);
}
function showModal(id) { document.getElementById(id).classList.add('open'); }
function hideModal(id) { document.getElementById(id).classList.remove('open'); }

function choiceModal({title='Confirm', message, confirmText='OK', cancelText='Cancel', danger=false}) {
    return new Promise(resolve => {
        document.getElementById('choice-title').textContent = title;
        document.getElementById('choice-message').textContent = message;
        const ok = document.getElementById('choice-confirm'), no = document.getElementById('choice-cancel');
        ok.textContent = confirmText; no.textContent = cancelText;
        ok.className = danger ? 'btn-delete' : 'btn-confirm';
        showModal('choice-modal');
        const yes = () => { cleanup(); resolve(true); };
        const nop = () => { cleanup(); resolve(false); };
        function cleanup() { hideModal('choice-modal'); ok.removeEventListener('click', yes); no.removeEventListener('click', nop); }
        ok.addEventListener('click', yes); no.addEventListener('click', nop);
    });
}

    
function doLogout() {
    // clear session state
    currentUser = null;
    authToken   = null;

    // destroy all calendar instances so they re-init cleanly on next login
    calendars.forEach(cal => cal.destroy());
    calendars.length = 0;
    if (overviewCal) { overviewCal.destroy(); overviewCal = null; }

    // reset UI back to login screen
    document.getElementById('app').classList.remove('visible');
    document.getElementById('app').style.display = 'none';
    const ov = document.getElementById('login-overlay');
    ov.style.display = 'flex';
    ov.classList.remove('hidden');
    document.getElementById('login-name').value = '';
    document.getElementById('login-pin').value  = '';
    document.getElementById('login-error').textContent = '';
    const btn = document.getElementById('login-btn');
    btn.disabled = false; btn.textContent = 'Sign In';

}
function deleteModal(label) {
    return new Promise(resolve => {
        document.getElementById('delete-message').textContent = `Are you sure you want to delete "${label}"?`;
        showModal('delete-modal');
        const yes = () => { cleanup(); resolve(true); };
        const no  = () => { cleanup(); resolve(false); };
        function cleanup() { hideModal('delete-modal'); document.getElementById('delete-confirm').removeEventListener('click', yes); document.getElementById('delete-cancel').removeEventListener('click', no); }
        document.getElementById('delete-confirm').addEventListener('click', yes);
        document.getElementById('delete-cancel').addEventListener('click', no);
    });
}
function durationModal(printerName, timeStr) {
    return new Promise(resolve => {
        document.getElementById('duration-info').textContent = `Booking on ${printerName} at ${timeStr}. How many minutes will your print take?`;
        document.getElementById('duration-input').value = '';
        showModal('duration-modal');
        const ok = document.getElementById('duration-confirm'), no = document.getElementById('duration-cancel');
        const go = () => {
            const v = parseInt(document.getElementById('duration-input').value, 10);
            if (!v || v <= 0) { toast('Please enter a valid number of minutes.'); return; }
            cleanup(); resolve(v);
        };
        const cancel = () => { cleanup(); resolve(null); };
        const key = e => { if (e.key === 'Enter') go(); };
        function cleanup() { hideModal('duration-modal'); ok.removeEventListener('click', go); no.removeEventListener('click', cancel); document.getElementById('duration-input').removeEventListener('keydown', key); }
        ok.addEventListener('click', go); no.addEventListener('click', cancel);
        document.getElementById('duration-input').addEventListener('keydown', key);
        setTimeout(() => document.getElementById('duration-input').focus(), 80);
    });
}

// ── STATE ──
let currentUser = null;
let authToken = null;
let printerStatuses = [{status:'online'},{status:'online'},{status:'online'},{status:'online'}];
const PRINTER_NAMES  = ['Leonardo','Donatello','Raphael','Michelangelo'];
const PRINTER_COLORS = ['#1a4a9c','#7b3fa0','#c0392b','#e07b00'];
const PRINTER_COLORS_ALPHA = ['rgba(26,74,156,0.5)','rgba(123,63,160,0.5)','rgba(192,57,43,0.5)','rgba(224,123,0,0.5)'];
const calendars = [];
let overviewCal = null;
const overviewToggles = [true,true,true,true];

// ── API HELPERS ──
function authHeaders() { return {'Content-Type':'application/json','Authorization':'Bearer '+authToken}; }
async function apiGet(url) { const r = await fetch(url,{headers:authHeaders()}); if (!r.ok) throw new Error(await r.text()); return r.json(); }
async function apiPost(url,body) { const r = await fetch(url,{method:'POST',headers:authHeaders(),body:JSON.stringify(body)}); if (!r.ok) throw new Error(await r.text()); return r.json(); }
async function apiPut(url,body) { const r = await fetch(url,{method:'PUT',headers:authHeaders(),body:JSON.stringify(body)}); if (!r.ok) throw new Error(await r.text()); return r.json(); }
async function apiDelete(url) { const r = await fetch(url,{method:'DELETE',headers:authHeaders()}); if (!r.ok) throw new Error(await r.text()); return r.json(); }

// ── CHANGE PIN SYSTEM ──
let _changePinForced = false;

function initChangePinModal() {
    document.getElementById('btn-open-change-pin').addEventListener('click', () => openChangePinModal(false));
    document.getElementById('cp-new').addEventListener('input', function() {
        const val = this.value;
        const bar = document.getElementById('cp-strength-bar');
        const label = document.getElementById('cp-strength-label');
        if (!val) { bar.style.width='0%'; bar.style.background='transparent'; label.textContent=''; return; }
        if (!/^\d+$/.test(val)) { bar.style.width='15%'; bar.style.background='#ef4444'; label.style.color='#ef4444'; label.textContent='Digits only'; return; }
        if (val.length < 4) { bar.style.width='25%'; bar.style.background='#ef4444'; label.style.color='#ef4444'; label.textContent='Too short'; }
        else if (val.length < 6) { bar.style.width='55%'; bar.style.background='var(--uvm-gold)'; label.style.color='#92400e'; label.textContent='OK'; }
        else { bar.style.width='100%'; bar.style.background='var(--avail-green)'; label.style.color='var(--avail-green)'; label.textContent='Strong'; }
    });
    ['cp-current','cp-new','cp-confirm'].forEach(id => {
        document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') doChangePin(); });
    });
    document.getElementById('cp-save').addEventListener('click', doChangePin);
    document.getElementById('cp-cancel').addEventListener('click', () => { if (!_changePinForced) hideModal('change-pin-modal'); });
}

function openChangePinModal(forced) {
    _changePinForced = forced;
    ['cp-current','cp-new','cp-confirm'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('change-pin-error').textContent = '';
    document.getElementById('cp-strength-bar').style.cssText = 'width:0%;background:transparent';
    document.getElementById('cp-strength-label').textContent = '';
    const banner = document.getElementById('cp-forced-banner');
    const cancelBtn = document.getElementById('cp-cancel');
    const desc = document.getElementById('cp-desc');
    if (forced) {
        banner.style.display = 'flex';
        cancelBtn.style.display = 'none';
        desc.textContent = 'A temporary PIN was set for your account. Please choose a personal PIN to continue.';
        document.getElementById('change-pin-modal').onclick = null;
    } else {
        banner.style.display = 'none';
        cancelBtn.style.display = '';
        desc.textContent = 'Choose a new PIN between 4 and 8 digits.';
        document.getElementById('change-pin-modal').onclick = function(e) { if (e.target === this) hideModal('change-pin-modal'); };
    }
    showModal('change-pin-modal');
    setTimeout(() => document.getElementById('cp-current').focus(), 80);
}

// ── FIX 1: doChangePin — removed duplicate try/catch that caused fatal parse error ──
async function doChangePin() {
    const current = document.getElementById('cp-current').value.trim();
    const newPin  = document.getElementById('cp-new').value.trim();
    const confirm = document.getElementById('cp-confirm').value.trim();
    const errEl   = document.getElementById('change-pin-error');
    errEl.textContent = '';

    if (!current)              { errEl.textContent = 'Please enter your current PIN.'; return; }
    if (!newPin)               { errEl.textContent = 'Please enter a new PIN.'; return; }
    if (!/^\d+$/.test(newPin)) { errEl.textContent = 'PIN must contain digits only.'; return; }
    if (newPin.length < 4)     { errEl.textContent = 'New PIN must be at least 4 digits.'; return; }
    if (newPin === current)    { errEl.textContent = 'New PIN must be different from your current PIN.'; return; }
    if (newPin !== confirm)    { errEl.textContent = 'PINs do not match — please re-enter.'; return; }

    const btn = document.getElementById('cp-save');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
        await apiPut('/api/users/change-pin', { current_pin: current, new_pin: newPin });
        hideModal('change-pin-modal');
        _changePinForced = false;
        toast('✓ PIN updated successfully!');
    } catch (e) {
        errEl.textContent = 'Incorrect current PIN, or server error. Please try again.';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Update PIN';
    }
}

// ── FIX 2: flagUserPinReset — corrected endpoint /force-pin-reset → /force-pin-change and added required body param ──
async function flagUserPinReset(userId, userName) {
    const ok = await choiceModal({
        title: 'Force PIN Reset',
        message: `${userName} will be required to set a new PIN the next time they log in.`,
        confirmText: 'Flag for Reset'
    });
    if (!ok) return;
    try {
        await apiPut('/api/users/' + userId + '/force-pin-change', { force: true });
        toast(`✓ ${userName} will be prompted to change PIN on next login.`);
        renderAdminUsers();
    } catch (e) {
        toast('⚠ Could not flag user for PIN reset.');
    }
}

// ── PRINTER STATUS ──
async function loadPrinterStatuses() {
    try {
        const data = await apiGet('/api/printers');
        printerStatuses = data;
        updatePrinterStatusBanners();
        updateAllStats();
    } catch (e) { console.warn('Could not load printer statuses', e); }
}
function isPrinterOnline(idx) { return !printerStatuses[idx] || printerStatuses[idx].status === 'online'; }
function updatePrinterStatusBanners() {
    PRINTER_NAMES.forEach((_,i) => {
        const banner = document.getElementById(`printer-offline-banner-${i}`);
        if (!banner) return;
        const ps = printerStatuses[i];
        if (!ps || ps.status === 'online') { banner.innerHTML = ''; return; }
        const icon  = ps.status === 'maintenance' ? '🔧' : '🚫';
        const label = ps.status === 'maintenance' ? 'Under Maintenance' : 'Offline';
        const note  = ps.note ? ` — ${ps.note}` : '';
        banner.innerHTML = `<div class="printer-offline-banner"><span class="pob-icon">${icon}</span><div class="pob-text"><span class="pob-status">${PRINTER_NAMES[i]} is ${label}</span>${note}<br>Bookings are not available while this printer is unavailable.</div></div>`;
    });
}

// ── BOOKINGS ──
async function loadBookings() {
    try {
        const data = await apiGet('/api/bookings');
        data.forEach(ev => {
            const i = ev.printer;
            if (!calendars[i]) return;
            calendars[i].addEvent({ id: ev.id, title: ev.owner, start: ev.start, end: ev.end, extendedProps: { type:'reservation', owner: ev.owner, id: ev.id } });
        });
    } catch (e) { console.warn('Could not load bookings', e); toast('⚠ Could not load bookings from server.'); }
}

// ── HISTORY ──
function getHistory() { try { return JSON.parse(localStorage.getItem('fablab_history') || '[]'); } catch(e) { return []; } }
function addToHistory(entry) { const h = getHistory(); h.unshift(entry); localStorage.setItem('fablab_history', JSON.stringify(h)); }

// ── CSV EXPORT ──
function exportWeekCSV() {
    const {monday, friday} = getWeekBounds();
    const rows = [['Reservation ID','Printer','User','Start','End','Duration (min)']];
    calendars.forEach((cal, i) => {
        cal.getEvents().filter(e => e.extendedProps.type === 'reservation').filter(e => {
            const s = e.start, end = e.end || new Date(e.start.getTime() + 30*60000);
            return end >= monday && s <= friday;
        }).sort((a,b) => a.start - b.start).forEach(e => {
            const end = e.end || new Date(e.start.getTime() + 30*60000);
            rows.push([e.id||'—', PRINTER_NAMES[i], e.extendedProps.owner, e.start.toLocaleString(), end.toLocaleString(), Math.round((end - e.start)/60000)]);
        });
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const weekStr = monday.toLocaleDateString('en-US',{month:'short',day:'numeric'});
    a.href = url; a.download = `fablab-week-${weekStr.replace(/\s/g,'-')}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast('Week exported as CSV!');
}

// ── LOGIN ──
document.getElementById('login-btn').addEventListener('click', doLogin);
document.getElementById('login-pin').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

async function doLogin() {
    const name  = document.getElementById('login-name').value.trim();
    const pin   = document.getElementById('login-pin').value.trim();
    const errEl = document.getElementById('login-error');
    const btn   = document.getElementById('login-btn');
    errEl.textContent = '';
    if (!name || !pin) { errEl.textContent = 'Please enter your name and PIN.'; return; }
    btn.disabled = true; btn.textContent = 'Signing in…';
    try {
        const res  = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name, pin}) });
        const data = await res.json();
        if (!res.ok) { errEl.textContent = data.error || 'Invalid netID or PIN.'; btn.disabled = false; btn.textContent = 'Sign In'; return; }
        authToken   = data.token;
        // ── FIX 3: was data.must_change_pin — backend sends data.force_pin_change ──
        currentUser = { name: data.name, role: data.role, mustChangePIN: !!data.force_pin_change };
        launchApp();
        if (currentUser.mustChangePIN) { setTimeout(() => openChangePinModal(true), 450); }
    } catch (e) {
        errEl.textContent = 'Could not reach server. Try again.';
        btn.disabled = false; btn.textContent = 'Sign In';
    }
}

function launchApp() {
    const ov = document.getElementById('login-overlay');
    ov.classList.add('hidden');
    setTimeout(() => ov.style.display = 'none', 400);
    document.getElementById('app').classList.add('visible');
    document.getElementById('user-name-display').textContent = currentUser.name;
    const chip = document.getElementById('user-role-display');
    chip.textContent = currentUser.role; chip.className = 'role-chip ' + currentUser.role;
    if (currentUser.role === 'admin') { document.getElementById('nav-history').style.display='flex'; document.getElementById('nav-admin').style.display='flex'; }
    buildDashCards(); buildSidebarPrinterCards(); buildPrinterSpecCards();
    initCalendars(); initOverviewCalendar(); initNav(); initAdminPanel(); initChangePinModal();
    loadPrinterStatuses();
    document.getElementById('btn-export-csv').addEventListener('click', exportWeekCSV);
    document.getElementById('btn-clear-history').addEventListener('click', async () => {
        const ok = await choiceModal({ title:'Clear History', message:'Permanently delete all booking history?', confirmText:'Clear', danger:true });
        if (ok) { localStorage.removeItem('fablab_history'); renderHistory(); toast('History cleared.'); }
    });
    document.getElementById('btn-logout').addEventListener('click', doLogout);
    document.getElementById('history-filter-printer').addEventListener('change', renderHistory);
    document.getElementById('history-filter-status').addEventListener('change', renderHistory);
}

// ── NAVIGATION ──
function initNav() { document.querySelectorAll('[data-page]').forEach(el => el.addEventListener('click', () => navigateTo(el.dataset.page))); }
function navigateTo(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + pageId).classList.add('active');
    document.querySelectorAll('.nav-item,.nav-sub-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.sidebar-printer-card').forEach(el => el.classList.remove('active'));
    const activeEl = document.querySelector(`[data-page="${pageId}"]`);
    if (activeEl) activeEl.classList.add('active');
    if (pageId.startsWith('schedule-')) { const idx = parseInt(pageId.split('-')[1]); if (calendars[idx]) setTimeout(() => calendars[idx].updateSize(), 60); }
    if (pageId === 'overview') setTimeout(() => { if (overviewCal) overviewCal.updateSize(); refreshOverview(); }, 80);
    if (pageId === 'my-bookings') renderMyBookings();
    if (pageId === 'history') renderHistory();
    if (pageId === 'admin') { renderAdminUsers(); renderAdminPrinterStatus(); }
    updateAllStats();
}

// ── FULLNESS ──
const AVAIL_MINS = 10 * 60 * 5;
function getWeekBounds() {
    const now = new Date(), day = now.getDay();
    const monday = new Date(now); monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1)); monday.setHours(0,0,0,0);
    const friday = new Date(monday); friday.setDate(monday.getDate() + 4); friday.setHours(23,59,59,999);
    return {monday, friday};
}
function calcFullness(calIdx) {
    if (!calendars[calIdx]) return 0;
    const {monday, friday} = getWeekBounds();
    let bookedMins = 0;
    calendars[calIdx].getEvents().filter(e => e.extendedProps.type === 'reservation').forEach(ev => {
        const s = ev.start, e = ev.end || new Date(ev.start.getTime() + 30*60000);
        if (e < monday || s > friday) return;
        bookedMins += (Math.min(e, friday) - Math.max(s, monday)) / 60000;
    });
    return Math.min(100, Math.round((bookedMins / AVAIL_MINS) * 100));
}
function fillClass(pct) { return pct < 50 ? 'fill-low' : pct < 80 ? 'fill-medium' : 'fill-high'; }
function updateAllStats() {
    const now = new Date();
    PRINTER_NAMES.forEach((_,i) => {
        const ps = printerStatuses[i];
        const isOnline = !ps || ps.status === 'online';
        const pct = calcFullness(i), fc = fillClass(pct);
        const df = document.getElementById(`dash-fill-${i}`), dp = document.getElementById(`dash-pct-${i}`);
        if (df) { df.style.width = pct+'%'; df.className = 'fullness-fill ' + fc; }
        if (dp) dp.textContent = pct+'%';
        const events = calendars[i] ? calendars[i].getEvents().filter(e => e.extendedProps.type === 'reservation') : [];
        const busyNow = events.find(e => e.start <= now && (e.end || new Date(e.start.getTime()+30*60000)) > now);
        const badge = document.getElementById(`dash-badge-${i}`), nextEl = document.getElementById(`dash-next-${i}`);
        if (badge) {
            if (!isOnline) { badge.textContent = ps.status === 'maintenance' ? 'Maintenance' : 'Offline'; badge.className = 'status-badge ' + (ps.status === 'maintenance' ? 'maintenance' : 'offline'); }
            else { badge.textContent = busyNow ? 'In Use' : 'Available'; badge.className = 'status-badge ' + (busyNow ? 'busy' : 'free'); }
        }
        if (nextEl) {
            if (!isOnline) { nextEl.textContent = ps.note || ''; }
            else if (busyNow) { const freeAt = busyNow.end || new Date(busyNow.start.getTime()+30*60000); nextEl.textContent = `Free at ${freeAt.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`; }
            else { const upcoming = events.filter(e => e.start > now).sort((a,b) => a.start - b.start)[0]; nextEl.textContent = upcoming ? `Next: ${upcoming.start.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}` : 'No bookings today'; }
        }
        const mf = document.getElementById(`mini-fill-${i}`), mp = document.getElementById(`mini-pct-${i}`);
        if (mf) { mf.style.width = pct+'%'; mf.className = 'mini-fill ' + fc; }
        if (mp) mp.textContent = pct+'% full this week';
        const spcStatus = document.getElementById(`spc-status-${i}`), spcBar = document.getElementById(`spc-bar-${i}`);
        if (spcStatus) {
            if (!isOnline) { spcStatus.textContent = ps.status === 'maintenance' ? 'Maint.' : 'Offline'; spcStatus.className = 'spc-status ' + (ps.status === 'maintenance' ? 'maintenance' : 'offline'); }
            else { spcStatus.textContent = busyNow ? 'In Use' : 'Free'; spcStatus.className = 'spc-status ' + (busyNow ? 'busy' : 'free'); }
        }
        if (spcBar) { spcBar.style.width = pct+'%'; spcBar.style.background = PRINTER_COLORS[i]; }
        const dashCard = document.querySelector(`#dash-grid .printer-card:nth-child(${i+1})`);
        if (dashCard) dashCard.classList.toggle('printer-down', !isOnline);
    });
}

// ── DASHBOARD ──
function buildDashCards() {
    const grid = document.getElementById('dash-grid');
    PRINTER_NAMES.forEach((name,i) => {
        const card = document.createElement('div'); card.className = 'printer-card'; card.style.borderTopColor = PRINTER_COLORS[i];
        card.innerHTML = `<div class="card-top"><div class="card-name">${name}</div><div class="status-badge free" id="dash-badge-${i}">Available</div></div><div class="fullness-label"><span class="fl-text">Weekly capacity</span><span class="fl-pct" id="dash-pct-${i}">0%</span></div><div class="fullness-track"><div class="fullness-fill fill-low" id="dash-fill-${i}" style="width:0%"></div></div><div class="card-next" id="dash-next-${i}">—</div><div class="card-cta">View schedule →</div>`;
        card.addEventListener('click', () => navigateTo('schedule-' + i));
        grid.appendChild(card);
    });
}

// ── SIDEBAR ──
function buildSidebarPrinterCards() {
    const container = document.getElementById('sidebar-printer-cards');
    PRINTER_NAMES.forEach((name,i) => {
        const item = document.createElement('div'); item.className = 'nav-sub-item'; item.dataset.page = `schedule-${i}`;
        item.innerHTML = `<span class="printer-dot" style="background:${PRINTER_COLORS[i]}"></span>${name}`;
        item.addEventListener('click', () => navigateTo(`schedule-${i}`));
        container.appendChild(item);
    });
    const infoDiv = document.createElement('div'); infoDiv.className = 'sidebar-printer-info';
    PRINTER_NAMES.forEach((name,i) => {
        const card = document.createElement('div'); card.className = 'sidebar-printer-card'; card.dataset.page = `schedule-${i}`;
        card.innerHTML = `<div class="spc-top"><div class="spc-name">${name}</div><div class="spc-status free" id="spc-status-${i}">Free</div></div><div class="spc-bar-track"><div class="spc-bar-fill" id="spc-bar-${i}" style="width:0%;background:${PRINTER_COLORS[i]}"></div></div>`;
        card.addEventListener('click', () => navigateTo(`schedule-${i}`));
        infoDiv.appendChild(card);
    });
    container.appendChild(infoDiv);
}

// ── SPEC CARDS ──
function buildPrinterSpecCards() {
    const grid = document.getElementById('printer-spec-cards');
    PRINTER_NAMES.forEach((name,i) => {
        const card = document.createElement('div'); card.className = 'printer-spec-card'; card.style.borderTopColor = PRINTER_COLORS[i];
        card.innerHTML = `<div class="psc-header"><div class="psc-dot" style="background:${PRINTER_COLORS[i]}"></div><div class="psc-name">${name}</div></div><div class="spec-row"><div class="spec-label">Model</div><div class="spec-value">Bambu Lab X1 Carbon</div></div><div class="spec-row"><div class="spec-label">Build Volume</div><div class="spec-value">10.07″ × 10.07″ × 10.07″ (256 × 256 × 256 mm)</div></div><div class="spec-row"><div class="spec-label">Materials</div><div class="spec-value">PLA, Support for PLA, PLA-CF</div></div><div class="spec-row"><div class="spec-label">Nozzle</div><div class="spec-value">0.4 mm hardened steel</div></div><div class="spec-row"><div class="spec-label">Plate Type</div><div class="spec-value">Bambu Cool Plate (installed)</div></div><div class="spec-row"><div class="spec-label">Max Speed</div><div class="spec-value">500 mm/s</div></div>`;
        grid.appendChild(card);
    });
}

// ── MY BOOKINGS ──
function renderMyBookings() {
    const now = new Date(); let upcoming = [], past = [];
    calendars.forEach((cal,i) => {
        cal.getEvents().filter(e => e.extendedProps.type === 'reservation' && e.extendedProps.owner === currentUser.name).forEach(e => {
            if (e.start >= now) upcoming.push({event:e, printerIdx:i}); else past.push({event:e, printerIdx:i});
        });
    });
    upcoming.sort((a,b) => a.event.start - b.event.start);
    past.sort((a,b) => b.event.start - a.event.start);
    renderBookingList('bookings-upcoming-list', upcoming, false);
    renderBookingList('bookings-past-list', past, true);
}
function renderBookingList(containerId, bookings, isPast) {
    const container = document.getElementById(containerId);
    if (!bookings.length) { container.innerHTML = '<div class="bookings-empty"><div class="big-icon">📋</div><p>' + (isPast ? 'No past bookings.' : 'No upcoming bookings.') + '</p></div>'; return; }
    const list = document.createElement('div'); list.className = 'booking-list';
    bookings.forEach(({event:ev, printerIdx:pi}) => {
        const row = document.createElement('div'); row.className = 'booking-row' + (isPast ? ' past' : '');
        const start = ev.start.toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
        const end  = ev.end ? ev.end.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '—';
        const mins = ev.end ? Math.round((ev.end - ev.start) / 60000) : '?';
        row.innerHTML = `<div class="br-dot" style="background:${PRINTER_COLORS[pi]}"></div><div class="br-info"><div class="br-printer">${PRINTER_NAMES[pi]}</div><div class="br-time">${start} – ${end} (${mins} min)</div><div class="br-id">${ev.id||''}</div></div>${isPast ? '' : '<button class="br-delete">Delete</button>'}`;
        if (!isPast) {
            row.querySelector('.br-delete').addEventListener('click', async () => {
                const confirmed = await deleteModal(`your reservation on ${PRINTER_NAMES[pi]}`);
                if (confirmed) {
                    try {
                        await apiDelete('/api/bookings/' + ev.extendedProps.id);
                        addToHistory({ printer:PRINTER_NAMES[pi], owner:ev.extendedProps.owner, start:ev.start.toISOString(), end:ev.end?ev.end.toISOString():null, status:'deleted', deletedAt:new Date().toISOString() });
                        ev.remove(); updateAllStats(); renderMyBookings(); toast('Reservation deleted.');
                    } catch(e) { toast('⚠ Could not delete booking.'); }
                }
            });
        }
        list.appendChild(row);
    });
    container.innerHTML = ''; container.appendChild(list);
}

// ── HISTORY ──
function renderHistory() {
    const container = document.getElementById('history-container');
    const filterPrinter = document.getElementById('history-filter-printer').value;
    const filterStatus  = document.getElementById('history-filter-status').value;
    let rows = [];
    calendars.forEach((cal,i) => { cal.getEvents().filter(e => e.extendedProps.type === 'reservation').forEach(ev => { rows.push({ id:ev.id, printer:PRINTER_NAMES[i], printerIdx:i, owner:ev.extendedProps.owner, start:ev.start.toISOString(), end:ev.end?ev.end.toISOString():null, status:'active' }); }); });
    getHistory().forEach(h => rows.push({...h, status: h.status||'deleted'}));
    if (filterPrinter !== 'all') rows = rows.filter(r => r.printer === PRINTER_NAMES[parseInt(filterPrinter)]);
    if (filterStatus  !== 'all') rows = rows.filter(r => r.status === filterStatus);
    rows.sort((a,b) => new Date(b.start) - new Date(a.start));
    if (!rows.length) { container.innerHTML = '<div class="history-empty">No records found.</div>'; return; }
    const table = document.createElement('table'); table.className = 'history-table';
    table.innerHTML = `<thead><tr><th>ID</th><th>Printer</th><th>User</th><th>Date &amp; Start</th><th>End</th><th>Duration</th><th>Status</th></tr></thead>`;
    const tbody = document.createElement('tbody');
    rows.forEach(h => {
        const start = new Date(h.start), end = h.end ? new Date(h.end) : null;
        const mins = end ? Math.round((end - start) / 60000) : '?';
        const tr = document.createElement('tr');
        tr.innerHTML = `<td style="font-family:monospace;font-size:.78rem">${h.id||'—'}</td><td><span style="display:inline-flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:50%;background:${PRINTER_COLORS[PRINTER_NAMES.indexOf(h.printer)]};flex-shrink:0"></span>${h.printer}</span></td><td>${h.owner}</td><td>${start.toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</td><td>${end ? end.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '—'}</td><td>${mins} min</td><td><span class="history-tag ${h.status}">${h.status}</span></td>`;
        tbody.appendChild(tr);
    });
    table.appendChild(tbody); container.innerHTML = ''; container.appendChild(table);
}

// ── ADMIN ──
function initAdminPanel() {
    document.getElementById('btn-clear-bookings').addEventListener('click', async () => {
        const ok = await choiceModal({ title:'Clear All Bookings', message:'This will permanently delete ALL bookings from all printers. This cannot be undone.', confirmText:'Clear Everything', danger:true });
        if (ok) {
            try {
                const data = await apiGet('/api/bookings');
                for (const ev of data) { await apiDelete('/api/bookings/' + ev.id); }
                calendars.forEach(cal => cal.getEvents().filter(e => e.extendedProps.type === 'reservation').forEach(e => e.remove()));
                updateAllStats(); refreshOverview(); toast('All bookings cleared.');
            } catch(e) { toast('⚠ Error clearing bookings.'); }
        }
    });
    document.getElementById('btn-add-user').addEventListener('click', async () => {
        const name       = document.getElementById('new-user-name').value.trim();
        const email      = document.getElementById('new-user-email').value.trim();
        const pin        = document.getElementById('new-user-pin').value.trim();
        const role       = document.getElementById('new-user-role').value;
        const forceReset = document.getElementById('new-user-force-reset').checked;
        if (!name || !pin) { toast('Name and PIN required.'); return; }
        try {
            await apiPost('/api/users', { name, email, pin, role, must_change_pin: forceReset });
            document.getElementById('new-user-name').value = ''; document.getElementById('new-user-email').value = ''; document.getElementById('new-user-pin').value = '';
            toast('✓ User added!' + (forceReset ? ' They will set their own PIN on first login.' : ''));
            renderAdminUsers();
        } catch(e) { toast('⚠ Could not add user. May already exist.'); }
    });
}

async function renderAdminUsers() {
    const el = document.getElementById('admin-current-users');
    el.innerHTML = '<tr><td colspan="5" style="padding:10px;color:var(--muted)">Loading…</td></tr>';
    try {
        const users = await apiGet('/api/users');
        el.innerHTML = users.map(u => `
          <tr>
            <td style="padding:8px 12px">${u.name}</td>
            <td style="padding:8px 12px;color:var(--muted);font-size:.84rem">${u.email||'—'}</td>
            <td style="padding:8px 12px"><span class="role-chip ${u.role}">${u.role}</span></td>
            <td style="padding:8px 12px">${u.must_change_pin ? '<span class="reset-badge">⚠ PIN reset pending</span>' : '<span style="color:var(--muted);font-size:.82rem">—</span>'}</td>
            <td style="padding:8px 12px"><div style="display:flex;gap:6px"><button class="btn-warning" onclick="flagUserPinReset(${u.id},'${u.name.replace(/'/g,"\\'")}')">Reset PIN</button><button class="br-delete" onclick="deleteUser(${u.id},'${u.name.replace(/'/g,"\\'")}')">Remove</button></div></td>
          </tr>`).join('');
    } catch(e) { el.innerHTML = '<tr><td colspan="5" style="padding:10px;color:var(--red)">Could not load users.</td></tr>'; }
}

async function deleteUser(id, name) {
    const ok = await choiceModal({ title:'Remove User', message:`Remove ${name}? They will no longer be able to log in.`, confirmText:'Remove', danger:true });
    if (ok) {
        try { await apiDelete('/api/users/' + id); toast('User removed.'); renderAdminUsers(); }
        catch(e) { toast('⚠ Could not remove user.'); }
    }
}

async function renderAdminPrinterStatus() {
    const grid = document.getElementById('admin-printer-status-grid');
    if (!grid) return;
    try {
        const printers = await apiGet('/api/printers');
        grid.innerHTML = '';
        printers.forEach(p => {
            const i = p.id;
            const card = document.createElement('div'); card.className = 'printer-status-card';
            card.innerHTML = `<div class="pscard-top"><div class="pscard-name"><span class="pscard-dot" style="background:${PRINTER_COLORS[i]}"></span>${p.name}</div><span class="pscard-badge ${p.status}">${p.status}</span></div><div class="pscard-controls"><select id="pstatus-select-${i}"><option value="online" ${p.status==='online'?'selected':''}>Online</option><option value="maintenance" ${p.status==='maintenance'?'selected':''}>Maintenance</option><option value="offline" ${p.status==='offline'?'selected':''}>Offline</option></select><button class="btn-action" style="padding:5px 12px;font-size:.8rem" onclick="savePrinterStatus(${i})">Save</button></div><input class="pscard-note" id="pstatus-note-${i}" type="text" placeholder="Optional note (e.g. jammed extruder)" value="${p.note||''}"/>`;
            grid.appendChild(card);
        });
    } catch(e) { grid.innerHTML = '<p style="color:var(--red);font-size:.87rem">Could not load printer statuses.</p>'; }
}

async function savePrinterStatus(idx) {
    const status = document.getElementById(`pstatus-select-${idx}`).value;
    const note   = document.getElementById(`pstatus-note-${idx}`).value.trim();
    try {
        await apiPut(`/api/printers/${idx}`, { status, note });
        toast(`✓ ${PRINTER_NAMES[idx]} set to ${status}`);
        await loadPrinterStatuses(); renderAdminPrinterStatus();
    } catch(e) { toast('⚠ Could not update printer status.'); }
}

// ── OVERVIEW CALENDAR ──
function initOverviewCalendar() {
    const el = document.getElementById('cal-overview');
    overviewCal = new FullCalendar.Calendar(el, {
        initialView:'timeGridWeek', selectable:false, editable:false, height: 1600, allDaySlot:false,
        slotMinTime:'00:00:00', slotMaxTime:'24:00:00', hiddenDays:[0,6], nowIndicator:true,
        scrollTime: '09:00:00',
        headerToolbar:{ left:'prev,next today', center:'title', right:'timeGridWeek,timeGridDay' },
        events:[],
        eventClick: function(info) { const pi = info.event.extendedProps.printerIdx; toast(`${info.event.extendedProps.owner} — ${PRINTER_NAMES[pi]}`); }
    });
    overviewCal.render(); buildOverviewToggles();
}
function buildOverviewToggles() {
    const container = document.getElementById('overview-toggles');
    PRINTER_NAMES.forEach((name,i) => {
        const btn = document.createElement('button'); btn.className = 'toggle-btn'; btn.id = `toggle-${i}`;
        btn.style.background = PRINTER_COLORS_ALPHA[i]; btn.style.borderColor = PRINTER_COLORS[i]; btn.style.color = PRINTER_COLORS[i];
        btn.innerHTML = `<span class="toggle-dot" style="background:${PRINTER_COLORS[i]}"></span>${name}`;
        btn.addEventListener('click', () => { overviewToggles[i] = !overviewToggles[i]; btn.classList.toggle('off', !overviewToggles[i]); refreshOverview(); });
        container.appendChild(btn);
    });
}
function refreshOverview() {
    if (!overviewCal) return;
    overviewCal.getEvents().forEach(e => e.remove());
    calendars.forEach((cal,i) => {
        if (!overviewToggles[i]) return;
        cal.getEvents().filter(e => e.extendedProps.type === 'reservation').forEach(ev => {
            overviewCal.addEvent({ title:ev.extendedProps.owner, start:ev.start, end:ev.end, backgroundColor:PRINTER_COLORS_ALPHA[i], borderColor:PRINTER_COLORS[i], textColor:PRINTER_COLORS[i], extendedProps:{ printerIdx:i, owner:ev.extendedProps.owner } });
        });
    });
}

// ── CALENDARS ──
function makeCalendar(idx) {
    const el = document.getElementById('cal-'+idx), printerName = PRINTER_NAMES[idx];
    function hasConflict(skipEv, start, end) {
        return calendars[idx].getEvents().some(ev => {
            if (ev === skipEv || ev.extendedProps.type !== 'reservation') return false;
            if (currentUser.role === 'admin') return false;
            const eS = ev.start, eE = ev.end || new Date(ev.start.getTime() + 30*60000);
            return start < eE && end > eS;
        });
    }
    const cal = new FullCalendar.Calendar(el, {
    initialView:'timeGridWeek', selectable: currentUser.role !== 'read', editable: currentUser.role !== 'read',
    eventResizableFromStart:true, height: 1600, allDaySlot:false,
    slotMinTime:'00:00:00', slotMaxTime:'24:00:00',
    hiddenDays:[0,6], nowIndicator:true,

    scrollTime: '09:00:00',
    headerToolbar:{ left:'prev,next today', center:'title', right:'timeGridWeek,timeGridDay' },
    events:[],
        select: async function(info) {
            if (currentUser.role === 'read') { toast('Read-only access.'); return; }
            if (!isPrinterOnline(idx)) { toast(`⚠ ${printerName} is currently unavailable.`); return; }
            const timeStr = info.start.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
            const mins = await durationModal(printerName, timeStr);
            if (!mins) return;
            const end = new Date(info.start.getTime() + mins * 60000);
            if (hasConflict(null, info.start, end)) { toast('⚠ That slot conflicts with an existing booking.'); return; }
            try {
                const result = await apiPost('/api/bookings', { printer:idx, owner:currentUser.name, title:currentUser.name, start:info.start.toISOString(), end:end.toISOString() });
                const id = result.id;
                cal.addEvent({ id, title:currentUser.name, start:info.start, end, extendedProps:{ type:'reservation', owner:currentUser.name, id } });
                toast(`✓ Booked ${printerName} · ${id}`);
                updateAllStats(); refreshOverview();
            } catch(e) { toast('⚠ Could not save booking.'); }
        },
        eventDrop: async function(info) {
            const ev = info.event;
            if (currentUser.role === 'read') { info.revert(); return; }
            if (currentUser.role !== 'admin' && ev.extendedProps.owner !== currentUser.name) { toast('You can only move your own reservations.'); info.revert(); return; }
            let end = ev.end || new Date(ev.start.getTime() + 30*60000);
            if (hasConflict(ev, ev.start, end)) {
                const ok = await choiceModal({ title:'Conflict', message:'This overlaps another booking. Move anyway?', confirmText:'Move Anyway', cancelText:'Undo' });
                if (!ok) { info.revert(); return; }
            }
            try {
                await apiPut('/api/bookings/' + ev.extendedProps.id, { start:ev.start.toISOString(), end:(ev.end || new Date(ev.start.getTime()+30*60000)).toISOString() });
                toast('Reservation updated.'); updateAllStats(); refreshOverview();
            } catch(e) { info.revert(); toast('⚠ Could not save resize.'); }
        },
        eventResize: async function(info) {
            const ev = info.event;
            // Fix 3: non-admins cannot resize other people's bookings
            if (currentUser.role === 'read') { info.revert(); return; }
            if (currentUser.role !== 'admin' && ev.extendedProps.owner !== currentUser.name) {
                toast('You can only resize your own reservations.');
                info.revert(); return;
            }
            const end = ev.end || new Date(ev.start.getTime() + 30*60000);
            // Fix 2: check for conflicts after resize
            if (hasConflict(ev, ev.start, end)) {
                const ok = await choiceModal({
                    title: 'Conflict',
                    message: 'This resize overlaps another booking. Resize anyway?',
                    confirmText: 'Resize Anyway', cancelText: 'Undo'
                });
                if (!ok) { info.revert(); return; }
            }
            try {
                await apiPut('/api/bookings/' + ev.extendedProps.id, {
                    start: ev.start.toISOString(),
                    end: end.toISOString()
                });
                toast('Reservation resized.'); updateAllStats(); refreshOverview();
            } catch(e) { info.revert(); toast('⚠ Could not save resize.'); }
        },
        eventClick: async function(info) {
            const ev = info.event;
            if (currentUser.role === 'read') { toast(`Booked by ${ev.extendedProps.owner}`); return; }
            if (currentUser.role !== 'admin' && ev.extendedProps.owner !== currentUser.name) { toast('You can only delete your own reservations.'); return; }
            const confirmed = await deleteModal(`${ev.title}'s reservation`);
            if (confirmed) {
                try {
                    await apiDelete('/api/bookings/' + ev.extendedProps.id);
                    addToHistory({ id:ev.id, printer:printerName, owner:ev.extendedProps.owner, start:ev.start.toISOString(), end:ev.end?ev.end.toISOString():null, status:'deleted', deletedAt:new Date().toISOString() });
                    ev.remove(); toast('Deleted.'); updateAllStats(); refreshOverview();
                } catch(e) { toast('⚠ Could not delete booking.'); }
            }
        }
    });
    cal.render(); return cal;
}
function initCalendars() {
    for (let i = 0; i < 4; i++) calendars.push(makeCalendar(i));
    loadBookings(); updateAllStats();
    setInterval(updateAllStats, 60000);
}
