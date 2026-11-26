/* Mobile (home service) Car Wash Booking — vanilla JS, data persisted in localStorage. */
(() => {
  'use strict';

  // ---------- Storage ----------
  const KEY = 'mobile-car-wash:v1';
  const DEFAULTS = () => ({
    settings: {
      businessName: 'Wash',
      open: '08:00',          // earliest arrival
      close: '18:00',         // job must finish by
      interval: 30,
      teams: 2,               // vans / crews working in parallel
      travelBuffer: 30,       // minutes kept free after each job to drive to the next
      arrivalWindow: 30,      // customer sees "arrive between X and X+window"
      openDays: [1, 2, 3, 4, 5, 6], // 0 = Sunday
      currency: '$',
      bookAheadDays: 60,
    },
    zones: [
      { id: uid(), name: 'City Centre', fee: 0 },
      { id: uid(), name: 'Inner Suburbs', fee: 5 },
      { id: uid(), name: 'North Suburbs', fee: 10 },
      { id: uid(), name: 'South Suburbs', fee: 10 },
      { id: uid(), name: 'Outer Areas', fee: 20 },
    ],
    services: [
      { id: uid(), kind: 'package', name: 'Exterior Wash', duration: 30, price: 25, description: 'Hand wash, wheels, windows and towel dry — on your driveway.' },
      { id: uid(), kind: 'package', name: 'Inside & Out', duration: 60, price: 45, description: 'Exterior wash plus vacuum, windows inside and dash wipe-down.' },
      { id: uid(), kind: 'package', name: 'Premium Wash & Wax', duration: 90, price: 75, description: 'Inside & Out plus hand wax, tyre shine and door jambs.' },
      { id: uid(), kind: 'package', name: 'Full Detail', duration: 180, price: 180, description: 'Seat and carpet shampoo, clay bar, polish and wax.' },
      { id: uid(), kind: 'addon', name: 'Tyre shine', duration: 5, price: 5, description: '' },
      { id: uid(), kind: 'addon', name: 'Rain-repellent glass', duration: 10, price: 9, description: '' },
      { id: uid(), kind: 'addon', name: 'Pet hair removal', duration: 15, price: 15, description: '' },
      { id: uid(), kind: 'addon', name: 'Leather clean & condition', duration: 20, price: 25, description: '' },
      { id: uid(), kind: 'addon', name: 'Air freshener', duration: 0, price: 3, description: '' },
    ],
    vehicles: [
      { id: 'small', label: 'Small car / Hatchback', price: 0, duration: 0 },
      { id: 'sedan', label: 'Sedan / Estate', price: 5, duration: 5 },
      { id: 'suv', label: 'SUV / Crossover', price: 10, duration: 10 },
      { id: 'large', label: 'Van / Pickup / 7-seater', price: 20, duration: 20 },
    ],
    bookings: [],
  });

  let db = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const d = DEFAULTS();
        const merged = { ...d, ...parsed, settings: { ...d.settings, ...parsed.settings } };
        // Replace the old sample name if it was never customised.
        if (merged.settings.businessName === 'Sparkle Mobile Car Wash') merged.settings.businessName = d.settings.businessName;
        return merged;
      }
    } catch (_) { /* fall through to defaults */ }
    return DEFAULTS();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (_) { /* storage unavailable */ }
  }

  // ---------- Helpers ----------
  function uid() { return Math.random().toString(36).slice(2, 7).toUpperCase() + Date.now().toString(36).slice(-3).toUpperCase(); }
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const fmtTime = (min) => {
    const h = Math.floor(min / 60), m = min % 60;
    return `${((h + 11) % 12) + 1}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`;
  };
  const fmtWindow = (start) => {
    const w = Number(db.settings.arrivalWindow);
    return w > 0 ? `${fmtTime(start)} – ${fmtTime(start + w)}` : fmtTime(start);
  };
  const fmtDur = (min) => min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`;
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const fmtDate = (s, opts = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) =>
    parseISO(s).toLocaleDateString(undefined, opts);
  const amount = (n) => `${db.settings.currency}${Number(n).toFixed(2).replace(/\.00$/, '')}`;
  const money = (n) => Number(n) === 0 ? 'Free' : amount(n);
  const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const nowMinutes = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const serviceById = (id) => db.services.find((s) => s.id === id);
  const packages = () => db.services.filter((s) => s.kind !== 'addon');
  const addons = () => db.services.filter((s) => s.kind === 'addon');
  const vehicleById = (id) => db.vehicles.find((v) => v.id === id);
  const zoneById = (id) => db.zones.find((z) => z.id === id);
  const bookingStart = (b) => { const d = parseISO(b.date); d.setMinutes(b.start); return d; };
  const normPlate = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const fullAddress = (b) => [b.address, b.town, b.postcode].filter(Boolean).join(', ');
  const mapUrl = (b) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress(b))}`;

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ---------- Availability (teams + travel buffer) ----------
  const isOpenDay = (date) => db.settings.openDays.includes(date.getDay());

  // Each team does one job at a time; after a job it needs `travelBuffer` minutes
  // to pack up and drive before it can start the next one.
  function freeTeams(dateStr, start, duration) {
    const { teams, travelBuffer } = db.settings;
    const buf = Number(travelBuffer);
    const jobs = db.bookings.filter((b) => b.date === dateStr && b.status !== 'cancelled');
    const free = [];
    for (let team = 1; team <= teams; team++) {
      const clash = jobs.some((b) => b.team === team &&
        start < b.start + b.duration + buf && b.start < start + duration + buf);
      if (!clash) free.push(team);
    }
    return free;
  }

  function availableSlots(dateStr, duration) {
    const { open, close, interval } = db.settings;
    const openM = toMin(open), closeM = toMin(close);
    const minStart = dateStr === isoDate(new Date()) ? nowMinutes() + 60 : -1; // 1h notice to drive out
    const slots = [];
    for (let t = openM; t + duration <= closeM; t += Number(interval)) {
      if (t < minStart) continue;
      const teams = freeTeams(dateStr, t, duration);
      if (teams.length) slots.push({ start: t, teams });
    }
    return slots;
  }

  // ---------- Navigation ----------
  function showView(name) {
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
    if (name === 'admin') renderAdmin();
    if (name === 'mine') renderMine();
    if (name === 'book' && state.step === 1) renderZones();
  }
  $$('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));

  // ---------- Booking flow ----------
  const state = { step: 1, zoneId: null, serviceId: null, vehicleId: null, addonIds: [], date: null, start: null, month: null, lastBooking: null };

  function quote() {
    const svc = serviceById(state.serviceId);
    const veh = vehicleById(state.vehicleId) || db.vehicles[0] || { price: 0, duration: 0, label: '' };
    const zone = zoneById(state.zoneId) || { name: '', fee: 0 };
    const extras = state.addonIds.map(serviceById).filter(Boolean);
    const extrasPrice = extras.reduce((s, a) => s + Number(a.price), 0);
    return {
      svc, veh, zone, extras,
      price: Number(svc.price) + Number(veh.price) + extrasPrice + Number(zone.fee),
      duration: Number(svc.duration) + Number(veh.duration) + extras.reduce((s, a) => s + Number(a.duration), 0),
    };
  }

  function goStep(n) {
    state.step = n;
    $$('.step-panel').forEach((p) => p.classList.toggle('hidden', Number(p.dataset.panel) !== n));
    $$('#steps li').forEach((li) => {
      const s = Number(li.dataset.step);
      li.classList.toggle('current', s === n);
      li.classList.toggle('done', s < n);
    });
    if (n === 1) renderZones();
    if (n === 2) renderServices();
    if (n === 3) renderExtras();
    if (n === 4) renderCalendar();
    if (n === 5) renderSummary();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  $$('[data-back]').forEach((b) => b.addEventListener('click', () => goStep(Number(b.dataset.back))));

  function renderZones() {
    const box = $('#zoneOptions');
    if (!db.zones.length) {
      box.innerHTML = '<p class="muted">No service areas set up yet. Add some in Admin → Pricing.</p>';
      return;
    }
    box.innerHTML = db.zones.map((z) => `
      <button class="option zone ${z.id === state.zoneId ? 'chosen' : ''}" data-id="${esc(z.id)}">
        <span class="opt-name">📍 ${esc(z.name)}</span>
        <span class="opt-meta">${Number(z.fee) ? `Travel fee ${amount(z.fee)}` : 'No travel fee'}</span>
      </button>`).join('');
    $$('.zone', box).forEach((b) => b.addEventListener('click', () => {
      state.zoneId = b.dataset.id;
      goStep(2);
    }));
  }

  function renderServices() {
    if (!zoneById(state.zoneId)) return goStep(1);
    const grid = $('#serviceGrid');
    const list = packages();
    if (!list.length) {
      grid.innerHTML = '<p class="muted">No wash packages yet. Add some in Admin → Pricing.</p>';
      return;
    }
    grid.innerHTML = list.map((s) => `
      <button class="card service" data-id="${esc(s.id)}">
        <span class="title"><strong>${esc(s.name)}</strong></span>
        <span class="muted">${esc(s.description || '')}</span>
        <span class="meta"><span>from ${fmtDur(Number(s.duration))}</span><span class="price">from ${money(s.price)}</span></span>
      </button>`).join('');
    $$('.service', grid).forEach((b) => b.addEventListener('click', () => {
      state.serviceId = b.dataset.id;
      state.date = null; state.start = null;
      if (!vehicleById(state.vehicleId)) state.vehicleId = db.vehicles[0]?.id || null;
      state.addonIds = state.addonIds.filter((id) => serviceById(id));
      goStep(3);
    }));
  }

  function renderExtras() {
    const svc = serviceById(state.serviceId);
    if (!svc) return goStep(2);
    $('#packageLabel').textContent = `${svc.name} — ${svc.description || ''}`;
    $('#vehicleOptions').innerHTML = db.vehicles.map((v) => `
      <label class="option">
        <input type="radio" name="vehicle" value="${esc(v.id)}" ${v.id === state.vehicleId ? 'checked' : ''} />
        <span class="opt-name">${esc(v.label)}</span>
        <span class="opt-meta">${Number(v.price) ? '+' + amount(v.price) : 'Base price'}${Number(v.duration) ? ` · +${v.duration} min` : ''}</span>
      </label>`).join('');
    const ad = addons();
    $('#addonOptions').innerHTML = ad.length ? ad.map((a) => `
      <label class="option">
        <input type="checkbox" value="${esc(a.id)}" ${state.addonIds.includes(a.id) ? 'checked' : ''} />
        <span class="opt-name">${esc(a.name)}</span>
        <span class="opt-meta">+${amount(a.price)}${Number(a.duration) ? ` · +${a.duration} min` : ''}</span>
      </label>`).join('') : '<p class="muted">No add-ons available.</p>';
    $$('#vehicleOptions input').forEach((i) => i.addEventListener('change', () => { state.vehicleId = i.value; updateTotal(); }));
    $$('#addonOptions input').forEach((i) => i.addEventListener('change', () => {
      state.addonIds = $$('#addonOptions input:checked').map((c) => c.value);
      updateTotal();
    }));
    updateTotal();
  }
  function updateTotal() {
    const q = quote();
    $('#runningTotal').textContent = `${money(q.price)} · about ${fmtDur(q.duration)}`;
    $('#totalBreakdown').textContent = Number(q.zone.fee)
      ? `Includes ${amount(q.zone.fee)} travel fee to ${q.zone.name}` : `No travel fee to ${q.zone.name}`;
  }
  $('#toTime').addEventListener('click', () => {
    const t = startOfToday();
    state.month = new Date(t.getFullYear(), t.getMonth(), 1);
    goStep(4);
  });

  function renderCalendar() {
    if (!serviceById(state.serviceId)) return goStep(2);
    const q = quote();
    $('#selectedServiceLabel').textContent =
      `${q.svc.name} · ${q.veh.label}${q.extras.length ? ' · ' + q.extras.map((a) => a.name).join(', ') : ''} · ${q.zone.name} · about ${fmtDur(q.duration)} · ${money(q.price)}`;
    const m = state.month;
    $('#monthLabel').textContent = m.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const today = startOfToday();
    const last = new Date(today); last.setDate(last.getDate() + db.settings.bookAheadDays);
    $('#prevMonth').disabled = m <= new Date(today.getFullYear(), today.getMonth(), 1);
    $('#nextMonth').disabled = new Date(m.getFullYear(), m.getMonth() + 1, 1) > last;

    const firstDow = (m.getDay() + 6) % 7; // Monday-first
    const daysIn = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    let html = '<span></span>'.repeat(firstDow);
    for (let d = 1; d <= daysIn; d++) {
      const date = new Date(m.getFullYear(), m.getMonth(), d);
      const iso = isoDate(date);
      const disabled = date < today || date > last || !isOpenDay(date) || availableSlots(iso, q.duration).length === 0;
      const cls = ['day', iso === isoDate(today) ? 'today' : '', iso === state.date ? 'selected' : ''].join(' ');
      html += `<button class="${cls}" data-date="${iso}" ${disabled ? 'disabled' : ''}>${d}</button>`;
    }
    $('#calDays').innerHTML = html;
    $$('#calDays .day:not(:disabled)').forEach((b) => b.addEventListener('click', () => {
      state.date = b.dataset.date;
      renderCalendar();
    }));
    renderSlots(q.duration);
  }

  function renderSlots(duration) {
    const list = $('#slotList');
    const w = Number(db.settings.arrivalWindow);
    $('#windowNote').textContent = w > 0 ? `Pick an arrival window — our team will arrive within ${w} minutes of the start time.` : '';
    if (!state.date) {
      $('#slotsTitle').textContent = 'Select a date';
      list.innerHTML = '<p class="muted">Available arrival times will appear here.</p>';
      return;
    }
    const slots = availableSlots(state.date, duration);
    $('#slotsTitle').textContent = fmtDate(state.date, { weekday: 'long', month: 'long', day: 'numeric' });
    list.innerHTML = slots.length
      ? slots.map((s) => `<button class="slot wide" data-start="${s.start}">${fmtWindow(s.start)}${s.teams.length === 1 && db.settings.teams > 1 ? '<small>Last team available</small>' : ''}</button>`).join('')
      : '<p class="muted">No times left on this day.</p>';
    $$('.slot', list).forEach((b) => b.addEventListener('click', () => {
      state.start = Number(b.dataset.start);
      goStep(5);
    }));
  }

  $('#prevMonth').addEventListener('click', () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); renderCalendar(); });
  $('#nextMonth').addEventListener('click', () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); renderCalendar(); });

  function renderSummary() {
    const q = quote();
    $('#bookingSummary').innerHTML = `
      <div><span>Package</span>${esc(q.svc.name)}</div>
      <div><span>Vehicle</span>${esc(q.veh.label)}</div>
      ${q.extras.length ? `<div><span>Add-ons</span>${q.extras.map((a) => esc(a.name)).join(', ')}</div>` : ''}
      <div><span>Area</span>${esc(q.zone.name)}</div>
      <div><span>Date</span>${fmtDate(state.date)}</div>
      <div><span>Arrival</span>${fmtWindow(state.start)}</div>
      <div><span>Total</span><strong>${money(q.price)}</strong></div>`;
    $('#formError').textContent = '';
  }

  $('#detailsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const fd = new FormData(f);
    const data = Object.fromEntries([...fd].map(([k, v]) => [k, String(v).trim()]));
    const err = $('#formError');
    if (!data.address) return (err.textContent = 'Please enter the address where the car will be.');
    if (!data.make) return (err.textContent = 'Please enter your vehicle make and model.');
    if (!data.name) return (err.textContent = 'Please enter your name.');
    if (!data.phone) return (err.textContent = 'Please enter a mobile number so the team can call when they arrive.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return (err.textContent = 'Please enter a valid email.');

    const q = quote();
    // Re-check a team is still free (another tab may have taken it).
    const teams = freeTeams(state.date, state.start, q.duration);
    if (!teams.length || !availableSlots(state.date, q.duration).some((s) => s.start === state.start)) {
      err.textContent = 'Sorry, that time was just taken. Please pick another.';
      return setTimeout(() => goStep(4), 1200);
    }
    const booking = {
      id: uid(),
      team: teams[0],
      serviceId: q.svc.id,
      serviceName: q.svc.name,
      vehicleType: q.veh.label,
      addons: q.extras.map((a) => a.name),
      zone: q.zone.name,
      travelFee: Number(q.zone.fee),
      price: q.price,
      duration: q.duration,
      date: state.date,
      start: state.start,
      address: data.address,
      town: data.town,
      postcode: data.postcode.toUpperCase(),
      access: data.access,
      water: fd.has('water'),
      power: fd.has('power'),
      notHome: fd.has('notHome'),
      name: data.name,
      email: data.email.toLowerCase(),
      phone: data.phone,
      make: data.make,
      color: data.color,
      plate: data.plate.toUpperCase(),
      notes: data.notes,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    };
    db.bookings.push(booking);
    save();
    state.lastBooking = booking;
    try { localStorage.setItem(KEY + ':lastLookup', booking.email); } catch (_) {}
    f.reset();
    $('#confirmation').innerHTML = `
      <p><strong>${esc(booking.serviceName)}</strong>${booking.addons.length ? ' + ' + booking.addons.map(esc).join(', ') : ''}<br>
      ${esc([booking.color, booking.make].filter(Boolean).join(' '))}${booking.plate ? ` (${esc(booking.plate)})` : ''}<br>
      📍 ${esc(fullAddress(booking))}</p>
      <p><strong>${fmtDate(booking.date, { weekday: 'long', month: 'long', day: 'numeric' })}</strong><br>
      Team arrives between <strong>${fmtWindow(booking.start)}</strong> · takes about ${fmtDur(booking.duration)}</p>
      <p>${money(booking.price)} payable when the job is done · Reference <span class="ref">${esc(booking.id)}</span></p>
      <p class="muted">We'll call ${esc(booking.phone)} when we're on the way. Please make sure the car is reachable and remove valuables.</p>`;
    goStep(6);
  });

  $('#bookAnother').addEventListener('click', () => { state.addonIds = []; goStep(2); });
  $('#viewMine').addEventListener('click', () => {
    $('#lookupForm').query.value = state.lastBooking?.email || '';
    showView('mine');
  });

  // ---------- My bookings ----------
  $('#lookupForm').addEventListener('submit', (e) => { e.preventDefault(); renderMine(); });

  function renderMine() {
    const input = $('#lookupForm').query;
    if (!input.value) { try { input.value = localStorage.getItem(KEY + ':lastLookup') || ''; } catch (_) {} }
    const q = input.value.trim().toLowerCase();
    const box = $('#myBookings');
    if (!q) { box.innerHTML = '<p class="muted">Enter your email or licence plate to see your bookings.</p>'; return; }
    const plate = normPlate(q);
    const mine = db.bookings
      .filter((b) => b.email === q || (plate && normPlate(b.plate) === plate))
      .sort((a, b) => bookingStart(b) - bookingStart(a));
    if (!mine.length) { box.innerHTML = '<p class="muted">No bookings found.</p>'; return; }
    const now = new Date();
    box.innerHTML = mine.map((b) => {
      const future = bookingStart(b) > now && b.status === 'confirmed';
      return `<div class="card item">
        <div>
          <div class="title">${esc(b.serviceName)} <span class="badge ${b.status}">${b.status}</span></div>
          <div class="muted">${fmtDate(b.date)} · arrival ${fmtWindow(b.start)} · ${money(b.price)}</div>
          <div class="muted small">📍 ${esc(fullAddress(b))}</div>
          <div class="muted small">${esc(b.make)}${b.plate ? ' · ' + esc(b.plate) : ''}${b.addons?.length ? ' · ' + b.addons.map(esc).join(', ') : ''} · Ref ${esc(b.id)}</div>
        </div>
        ${future ? `<button class="btn small danger" data-cancel="${esc(b.id)}">Cancel</button>` : ''}
      </div>`;
    }).join('');
    $$('[data-cancel]', box).forEach((btn) => btn.addEventListener('click', () => {
      if (!confirm('Cancel this booking?')) return;
      setStatus(btn.dataset.cancel, 'cancelled');
      renderMine();
      toast('Booking cancelled');
    }));
  }

  function setStatus(id, status) {
    const b = db.bookings.find((x) => x.id === id);
    if (b) { b.status = status; save(); }
  }

  // ---------- Admin ----------
  $$('.seg-btn').forEach((b) => b.addEventListener('click', () => {
    $$('.seg-btn').forEach((x) => x.classList.toggle('active', x === b));
    $$('[data-admin-panel]').forEach((p) => p.classList.toggle('hidden', p.dataset.adminPanel !== b.dataset.admin));
    renderAdmin();
  }));

  function renderAdmin() {
    renderTeamFilter();
    renderStats();
    renderBookingTable();
    renderServiceAdmin();
    fillSettings();
  }

  function renderTeamFilter() {
    const sel = $('#teamFilter');
    const cur = sel.value || 'all';
    sel.innerHTML = '<option value="all">All teams</option>' +
      Array.from({ length: db.settings.teams }, (_, i) => `<option value="${i + 1}">Team ${i + 1}</option>`).join('');
    sel.value = [...sel.options].some((o) => o.value === cur) ? cur : 'all';
  }

  function renderStats() {
    const now = new Date();
    const todayISO = isoDate(now);
    const today = db.bookings.filter((b) => b.date === todayISO && b.status !== 'cancelled');
    const upcoming = db.bookings.filter((b) => b.status === 'confirmed' && bookingStart(b) > now);
    const todayValue = today.reduce((s, b) => s + b.price, 0);
    const revenue = db.bookings.filter((b) => b.status === 'completed').reduce((s, b) => s + b.price, 0);
    const stats = [
      ['Jobs today', today.length],
      ["Today's jobs value", amount(todayValue)],
      ['Upcoming jobs', upcoming.length],
      ['Completed revenue', amount(revenue)],
    ];
    $('#stats').innerHTML = stats.map(([l, v]) => `<div class="card stat"><b>${v}</b><span>${l}</span></div>`).join('');
  }

  $('#statusFilter').addEventListener('change', renderBookingTable);
  $('#teamFilter').addEventListener('change', renderBookingTable);
  $('#searchBox').addEventListener('input', renderBookingTable);

  function renderBookingTable() {
    const filter = $('#statusFilter').value;
    const team = $('#teamFilter').value;
    const q = $('#searchBox').value.trim().toLowerCase();
    const now = new Date();
    let rows = db.bookings.slice();
    if (filter === 'upcoming') rows = rows.filter((b) => b.status === 'confirmed' && bookingStart(b) > now);
    else if (filter === 'today') rows = rows.filter((b) => b.date === isoDate(now));
    else if (filter !== 'all') rows = rows.filter((b) => b.status === filter);
    if (team !== 'all') rows = rows.filter((b) => String(b.team) === team);
    if (q) rows = rows.filter((b) => [b.name, b.email, b.phone, b.serviceName, b.make, b.color, b.plate, b.vehicleType,
      b.address, b.town, b.postcode, b.zone, b.id].join(' ').toLowerCase().includes(q));
    const asc = filter === 'upcoming' || filter === 'today';
    rows.sort((a, b) => (asc ? 1 : -1) * (bookingStart(a) - bookingStart(b)) || a.team - b.team);

    $('#noRows').classList.toggle('hidden', rows.length > 0);
    $('#bookingRows').innerHTML = rows.map((b) => {
      const site = [b.water ? '💧 tap' : '🚫 no tap', b.power ? '🔌 power' : '🚫 no power'].join(' · ');
      return `
      <tr>
        <td>${fmtDate(b.date)}<small>Arrive ${fmtWindow(b.start)}</small><small>~${fmtDur(b.duration)}</small></td>
        <td><span class="team-chip">T${b.team}</span></td>
        <td><a href="${esc(mapUrl(b))}" target="_blank" rel="noopener">${esc(b.address)}</a>
          <small>${esc([b.town, b.postcode].filter(Boolean).join(' '))} · ${esc(b.zone)}</small>
          ${b.access ? `<small>🔑 ${esc(b.access)}</small>` : ''}
          <small>${site}${b.notHome ? ' · customer away' : ''}</small></td>
        <td>${esc(b.serviceName)}<small>${money(b.price)}${b.travelFee ? ` (incl. ${amount(b.travelFee)} travel)` : ''}</small>${b.addons?.length ? `<small>+ ${b.addons.map(esc).join(', ')}</small>` : ''}</td>
        <td>${esc([b.color, b.make].filter(Boolean).join(' '))}<small>${esc(b.plate || '—')} · ${esc(b.vehicleType)}</small></td>
        <td>${esc(b.name)}<small><a href="tel:${esc(b.phone)}">${esc(b.phone)}</a></small><small>${esc(b.email)}</small>${b.notes ? `<small>“${esc(b.notes)}”</small>` : ''}</td>
        <td><span class="badge ${b.status}">${b.status}</span></td>
        <td class="act">
          ${b.status === 'confirmed' ? `<button class="btn small" data-act="completed" data-id="${esc(b.id)}">Done</button>
          <button class="btn small danger" data-act="cancelled" data-id="${esc(b.id)}">Cancel</button>` : ''}
          ${b.status !== 'confirmed' ? `<button class="btn small" data-act="delete" data-id="${esc(b.id)}">Delete</button>` : ''}
        </td>
      </tr>`;
    }).join('');
    $$('#bookingRows [data-act]').forEach((btn) => btn.addEventListener('click', () => {
      const { act, id } = btn.dataset;
      if (act === 'delete') {
        if (!confirm('Delete this job permanently?')) return;
        db.bookings = db.bookings.filter((b) => b.id !== id);
        save();
      } else {
        setStatus(id, act);
      }
      renderStats();
      renderBookingTable();
    }));
  }

  // Pricing: packages, add-ons, service areas, vehicle surcharges
  const sForm = $('#serviceForm');
  function itemRow(s) {
    return `<div class="card item">
      <div>
        <div class="title">${esc(s.name)}</div>
        <div class="muted">${fmtDur(Number(s.duration))} · ${money(s.price)}${s.description ? ' · ' + esc(s.description) : ''}</div>
      </div>
      <div>
        <button class="btn small" data-edit="${esc(s.id)}">Edit</button>
        <button class="btn small danger" data-del="${esc(s.id)}">Delete</button>
      </div>
    </div>`;
  }
  function renderServiceAdmin() {
    $('#packageAdminList').innerHTML = packages().map(itemRow).join('') || '<p class="muted">No packages yet.</p>';
    $('#addonAdminList').innerHTML = addons().map(itemRow).join('') || '<p class="muted">No add-ons yet.</p>';
    $$('[data-edit]').forEach((b) => b.addEventListener('click', () => {
      const s = serviceById(b.dataset.edit);
      sForm.id.value = s.id; sForm.kind.value = s.kind || 'package'; sForm.name.value = s.name;
      sForm.duration.value = s.duration; sForm.price.value = s.price; sForm.description.value = s.description || '';
      $('#serviceFormTitle').textContent = 'Edit';
      $('#cancelEdit').classList.remove('hidden');
      sForm.scrollIntoView({ behavior: 'smooth' });
      sForm.name.focus();
    }));
    $$('[data-del]').forEach((b) => b.addEventListener('click', () => {
      if (!confirm('Delete this item? Existing bookings are kept.')) return;
      db.services = db.services.filter((s) => s.id !== b.dataset.del);
      save(); renderServiceAdmin(); toast('Deleted');
    }));
    renderZoneAdmin();
    renderVehicleAdmin();
  }

  // Service areas (editable list with add/remove)
  let zoneDraft = null;
  function readZoneInputs() {
    $$('#zoneAdminList [data-z]').forEach((inp) => {
      const z = zoneDraft[Number(inp.dataset.z)];
      if (inp.dataset.f === 'name') z.name = inp.value;
      else z.fee = Math.max(0, Number(inp.value) || 0);
    });
  }
  function renderZoneAdmin(keepDraft) {
    if (!keepDraft) zoneDraft = db.zones.map((z) => ({ ...z }));
    $('#zoneAdminList').innerHTML = zoneDraft.map((z, i) => `
      <div class="row vehicle-row">
        <label>Area <input data-z="${i}" data-f="name" value="${esc(z.name)}" /></label>
        <label>Travel fee <input data-z="${i}" data-f="fee" type="number" min="0" step="0.01" value="${z.fee}" /></label>
        <button type="button" class="btn small danger align-end" data-zdel="${i}">Remove</button>
      </div>`).join('') + `<div class="actions">
        <button class="btn ghost" id="addZone" type="button">+ Add area</button>
        <button class="btn primary" id="saveZones" type="button">Save areas</button></div>`;
    $$('[data-zdel]').forEach((b) => b.addEventListener('click', () => {
      readZoneInputs(); zoneDraft.splice(Number(b.dataset.zdel), 1); renderZoneAdmin(true);
    }));
    $('#addZone').addEventListener('click', () => {
      readZoneInputs(); zoneDraft.push({ id: uid(), name: '', fee: 0 }); renderZoneAdmin(true);
      $$('#zoneAdminList [data-f=name]').pop().focus();
    });
    $('#saveZones').addEventListener('click', () => {
      readZoneInputs();
      db.zones = zoneDraft.filter((z) => z.name.trim()).map((z) => ({ ...z, name: z.name.trim() }));
      if (!zoneById(state.zoneId)) state.zoneId = null;
      save(); renderZoneAdmin(); toast('Service areas saved');
    });
  }

  function renderVehicleAdmin() {
    $('#vehicleAdminList').innerHTML = db.vehicles.map((v, i) => `
      <div class="row vehicle-row">
        <label>Vehicle size <input data-v="${i}" data-f="label" value="${esc(v.label)}" /></label>
        <label>Extra price <input data-v="${i}" data-f="price" type="number" min="0" step="0.01" value="${v.price}" /></label>
        <label>Extra minutes <input data-v="${i}" data-f="duration" type="number" min="0" step="5" value="${v.duration}" /></label>
      </div>`).join('') + '<div class="actions"><button class="btn primary" id="saveVehicles" type="button">Save surcharges</button></div>';
    $('#saveVehicles').addEventListener('click', () => {
      $$('#vehicleAdminList [data-v]').forEach((inp) => {
        const v = db.vehicles[Number(inp.dataset.v)];
        const f = inp.dataset.f;
        v[f] = f === 'label' ? (inp.value.trim() || v.label) : Math.max(0, Number(inp.value) || 0);
      });
      save(); toast('Surcharges saved');
    });
  }

  function resetServiceForm() {
    sForm.reset(); sForm.id.value = '';
    $('#serviceFormTitle').textContent = 'Add a package or add-on';
    $('#cancelEdit').classList.add('hidden');
  }
  $('#cancelEdit').addEventListener('click', resetServiceForm);
  sForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(sForm));
    const kind = d.kind === 'addon' ? 'addon' : 'package';
    const svc = {
      id: d.id || uid(),
      kind,
      name: d.name.trim(),
      duration: Math.max(kind === 'addon' ? 0 : 5, parseInt(d.duration, 10) || 0),
      price: Math.max(0, parseFloat(d.price) || 0),
      description: d.description.trim(),
    };
    if (!svc.name) return;
    const i = db.services.findIndex((s) => s.id === svc.id);
    if (i >= 0) db.services[i] = svc; else db.services.push(svc);
    save(); resetServiceForm(); renderServiceAdmin();
    toast(i >= 0 ? 'Updated' : 'Added');
  });

  // Settings
  const setForm = $('#settingsForm');
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  $('#dayChecks').innerHTML = [1, 2, 3, 4, 5, 6, 0].map((d) =>
    `<label><input type="checkbox" value="${d}" /> ${DAY_NAMES[d]}</label>`).join('');
  function fillSettings() {
    const s = db.settings;
    for (const k of ['businessName', 'open', 'close', 'interval', 'teams', 'travelBuffer', 'arrivalWindow', 'currency']) setForm[k].value = s[k];
    $$('#dayChecks input').forEach((c) => { c.checked = s.openDays.includes(Number(c.value)); });
    $('#settingsSaved').textContent = '';
  }
  setForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (toMin(setForm.close.value) <= toMin(setForm.open.value)) {
      $('#settingsSaved').textContent = '"Finish by" must be after "First arrival".';
      return;
    }
    const int = (v, d, lo, hi = Infinity) => Math.min(hi, Math.max(lo, Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d));
    Object.assign(db.settings, {
      businessName: setForm.businessName.value.trim() || 'Wash',
      open: setForm.open.value,
      close: setForm.close.value,
      interval: int(setForm.interval.value, 30, 5),
      teams: int(setForm.teams.value, 1, 1, 50),
      travelBuffer: int(setForm.travelBuffer.value, 30, 0),
      arrivalWindow: int(setForm.arrivalWindow.value, 30, 0),
      currency: setForm.currency.value || '$',
      openDays: $$('#dayChecks input:checked').map((c) => Number(c.value)),
    });
    save(); applyBranding(); renderTeamFilter();
    $('#settingsSaved').textContent = 'Saved.';
    toast('Settings saved');
  });
  $('#resetData').addEventListener('click', () => {
    if (!confirm('This deletes all pricing, bookings and settings. Continue?')) return;
    db = DEFAULTS(); save(); applyBranding(); renderAdmin(); state.zoneId = null; goStep(1);
    toast('Data reset');
  });

  function applyBranding() {
    $('#businessName').textContent = db.settings.businessName;
    document.title = `${db.settings.businessName} — Mobile Car Wash`;
  }

  // ---------- Init ----------
  applyBranding();
  save();
  goStep(1);
})();
