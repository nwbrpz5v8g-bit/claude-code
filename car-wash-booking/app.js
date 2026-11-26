/* Car Wash Booking — vanilla JS, data persisted in localStorage. */
(() => {
  'use strict';

  // ---------- Storage ----------
  const KEY = 'car-wash-booking:v1';
  const DEFAULTS = () => ({
    settings: {
      businessName: 'Sparkle Car Wash',
      open: '08:00',
      close: '18:00',
      interval: 15,
      bays: 2,
      openDays: [0, 1, 2, 3, 4, 5, 6], // 0 = Sunday
      currency: '$',
      bookAheadDays: 60,
    },
    services: [
      { id: uid(), kind: 'package', name: 'Express Exterior', duration: 20, price: 15, description: 'Foam wash, rinse and spot-free dry.' },
      { id: uid(), kind: 'package', name: 'Inside & Out', duration: 45, price: 35, description: 'Exterior wash plus vacuum, windows and dash wipe-down.' },
      { id: uid(), kind: 'package', name: 'Deluxe Wash & Wax', duration: 75, price: 65, description: 'Inside & Out plus hand wax, wheel clean and tyre shine.' },
      { id: uid(), kind: 'package', name: 'Full Valet', duration: 180, price: 160, description: 'Deep clean: shampoo seats and carpets, clay bar, polish and wax.' },
      { id: uid(), kind: 'addon', name: 'Tyre shine', duration: 5, price: 5, description: '' },
      { id: uid(), kind: 'addon', name: 'Rain-repellent glass', duration: 10, price: 9, description: '' },
      { id: uid(), kind: 'addon', name: 'Pet hair removal', duration: 15, price: 15, description: '' },
      { id: uid(), kind: 'addon', name: 'Engine bay clean', duration: 20, price: 20, description: '' },
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
        return { ...d, ...parsed, settings: { ...d.settings, ...parsed.settings } };
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
  const bookingStart = (b) => { const d = parseISO(b.date); d.setMinutes(b.start); return d; };
  const normPlate = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ---------- Availability (multiple bays) ----------
  const isOpenDay = (date) => db.settings.openDays.includes(date.getDay());

  // Peak number of bookings that overlap [start, end) — checked at every booking boundary.
  function peakOverlap(bookings, start, end) {
    const overlapping = bookings.filter((b) => start < b.start + b.duration && b.start < end);
    const points = [start, ...overlapping.map((b) => b.start).filter((t) => t > start && t < end)];
    return points.reduce((max, t) =>
      Math.max(max, overlapping.filter((b) => b.start <= t && t < b.start + b.duration).length), 0);
  }

  function availableSlots(dateStr, duration) {
    const { open, close, interval, bays } = db.settings;
    const openM = toMin(open), closeM = toMin(close);
    const taken = db.bookings.filter((b) => b.date === dateStr && b.status !== 'cancelled');
    const minStart = dateStr === isoDate(new Date()) ? nowMinutes() + 15 : -1;
    const slots = [];
    for (let t = openM; t + duration <= closeM; t += Number(interval)) {
      if (t < minStart) continue;
      const used = peakOverlap(taken, t, t + Math.max(duration, 1));
      if (used < bays) slots.push({ start: t, free: bays - used });
    }
    return slots;
  }

  // ---------- Navigation ----------
  function showView(name) {
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
    if (name === 'admin') renderAdmin();
    if (name === 'mine') renderMine();
    if (name === 'book' && state.step === 1) renderServices();
  }
  $$('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));

  // ---------- Booking flow ----------
  const state = { step: 1, serviceId: null, vehicleId: null, addonIds: [], date: null, start: null, month: null, lastBooking: null };

  function quote() {
    const svc = serviceById(state.serviceId);
    const veh = vehicleById(state.vehicleId) || db.vehicles[0] || { price: 0, duration: 0, label: '' };
    const extras = state.addonIds.map(serviceById).filter(Boolean);
    return {
      svc, veh, extras,
      price: Number(svc.price) + Number(veh.price) + extras.reduce((s, a) => s + Number(a.price), 0),
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
    if (n === 1) renderServices();
    if (n === 2) renderExtras();
    if (n === 3) renderCalendar();
    if (n === 4) renderSummary();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  $$('[data-back]').forEach((b) => b.addEventListener('click', () => goStep(Number(b.dataset.back))));

  function renderServices() {
    const grid = $('#serviceGrid');
    const list = packages();
    if (!list.length) {
      grid.innerHTML = '<p class="muted">No wash packages yet. Add some in Admin → Packages.</p>';
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
      goStep(2);
    }));
  }

  function renderExtras() {
    const svc = serviceById(state.serviceId);
    if (!svc) return goStep(1);
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
    $('#runningTotal').textContent = `${money(q.price)} · ${fmtDur(q.duration)}`;
  }
  $('#toTime').addEventListener('click', () => {
    const t = startOfToday();
    state.month = new Date(t.getFullYear(), t.getMonth(), 1);
    goStep(3);
  });

  function renderCalendar() {
    if (!serviceById(state.serviceId)) return goStep(1);
    const q = quote();
    $('#selectedServiceLabel').textContent =
      `${q.svc.name} · ${q.veh.label}${q.extras.length ? ' · ' + q.extras.map((a) => a.name).join(', ') : ''} · ${fmtDur(q.duration)} · ${money(q.price)}`;
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
    if (!state.date) {
      $('#slotsTitle').textContent = 'Select a date';
      list.innerHTML = '<p class="muted">Available times will appear here.</p>';
      return;
    }
    const slots = availableSlots(state.date, duration);
    $('#slotsTitle').textContent = fmtDate(state.date, { weekday: 'long', month: 'long', day: 'numeric' });
    list.innerHTML = slots.length
      ? slots.map((s) => `<button class="slot" data-start="${s.start}">${fmtTime(s.start)}${s.free === 1 && db.settings.bays > 1 ? '<small>1 bay left</small>' : ''}</button>`).join('')
      : '<p class="muted">No times left on this day.</p>';
    $$('.slot', list).forEach((b) => b.addEventListener('click', () => {
      state.start = Number(b.dataset.start);
      goStep(4);
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
      <div><span>Date</span>${fmtDate(state.date)}</div>
      <div><span>Time</span>${fmtTime(state.start)} – ${fmtTime(state.start + q.duration)}</div>
      <div><span>Total</span><strong>${money(q.price)}</strong></div>`;
    $('#formError').textContent = '';
  }

  $('#detailsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const data = Object.fromEntries([...new FormData(f)].map(([k, v]) => [k, String(v).trim()]));
    const err = $('#formError');
    if (!data.name) return (err.textContent = 'Please enter your name.');
    if (!data.phone) return (err.textContent = 'Please enter a phone number so we can reach you.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return (err.textContent = 'Please enter a valid email.');
    if (!data.make) return (err.textContent = 'Please enter your vehicle make and model.');

    const q = quote();
    // Re-check capacity (another tab may have taken the last bay).
    if (!availableSlots(state.date, q.duration).some((s) => s.start === state.start)) {
      err.textContent = 'Sorry, that time was just taken. Please pick another.';
      return setTimeout(() => goStep(3), 1200);
    }
    const booking = {
      id: uid(),
      serviceId: q.svc.id,
      serviceName: q.svc.name,
      vehicleType: q.veh.label,
      addons: q.extras.map((a) => a.name),
      price: q.price,
      duration: q.duration,
      date: state.date,
      start: state.start,
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
      ${fmtDate(booking.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}<br>
      ${fmtTime(booking.start)} – ${fmtTime(booking.start + booking.duration)} · ${money(booking.price)} payable on arrival</p>
      <p>Reference <span class="ref">${esc(booking.id)}</span></p>
      <p class="muted">Please arrive 5 minutes early and remove valuables from the car.</p>`;
    goStep(5);
  });

  $('#bookAnother').addEventListener('click', () => { state.addonIds = []; goStep(1); });
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
          <div class="muted">${fmtDate(b.date)} · ${fmtTime(b.start)} – ${fmtTime(b.start + b.duration)} · ${money(b.price)}</div>
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
    renderStats();
    renderBookingTable();
    renderServiceAdmin();
    fillSettings();
  }

  function renderStats() {
    const now = new Date();
    const todayISO = isoDate(now);
    const today = db.bookings.filter((b) => b.date === todayISO && b.status !== 'cancelled');
    const upcoming = db.bookings.filter((b) => b.status === 'confirmed' && bookingStart(b) > now);
    const todayRevenue = today.reduce((s, b) => s + b.price, 0);
    const revenue = db.bookings.filter((b) => b.status === 'completed').reduce((s, b) => s + b.price, 0);
    const stats = [
      ['Cars today', today.length],
      ["Today's bookings value", amount(todayRevenue)],
      ['Upcoming', upcoming.length],
      ['Completed revenue', amount(revenue)],
    ];
    $('#stats').innerHTML = stats.map(([l, v]) => `<div class="card stat"><b>${v}</b><span>${l}</span></div>`).join('');
  }

  $('#statusFilter').addEventListener('change', renderBookingTable);
  $('#searchBox').addEventListener('input', renderBookingTable);

  function renderBookingTable() {
    const filter = $('#statusFilter').value;
    const q = $('#searchBox').value.trim().toLowerCase();
    const now = new Date();
    let rows = db.bookings.slice();
    if (filter === 'upcoming') rows = rows.filter((b) => b.status === 'confirmed' && bookingStart(b) > now);
    else if (filter === 'today') rows = rows.filter((b) => b.date === isoDate(now));
    else if (filter !== 'all') rows = rows.filter((b) => b.status === filter);
    if (q) rows = rows.filter((b) => [b.name, b.email, b.phone, b.serviceName, b.make, b.color, b.plate, b.vehicleType, b.id].join(' ').toLowerCase().includes(q));
    const asc = filter === 'upcoming' || filter === 'today';
    rows.sort((a, b) => asc ? bookingStart(a) - bookingStart(b) : bookingStart(b) - bookingStart(a));

    $('#noRows').classList.toggle('hidden', rows.length > 0);
    $('#bookingRows').innerHTML = rows.map((b) => `
      <tr>
        <td>${fmtDate(b.date)}<small>${fmtTime(b.start)} – ${fmtTime(b.start + b.duration)}</small></td>
        <td>${esc(b.serviceName)}<small>${money(b.price)}</small>${b.addons?.length ? `<small>+ ${b.addons.map(esc).join(', ')}</small>` : ''}</td>
        <td>${esc([b.color, b.make].filter(Boolean).join(' '))}<small>${esc(b.plate || '—')} · ${esc(b.vehicleType)}</small></td>
        <td>${esc(b.name)}<small>${esc(b.phone)}</small><small>${esc(b.email)}</small>${b.notes ? `<small>“${esc(b.notes)}”</small>` : ''}</td>
        <td><span class="badge ${b.status}">${b.status}</span></td>
        <td class="act">
          ${b.status === 'confirmed' ? `<button class="btn small" data-act="completed" data-id="${esc(b.id)}">Done</button>
          <button class="btn small danger" data-act="cancelled" data-id="${esc(b.id)}">Cancel</button>` : ''}
          ${b.status !== 'confirmed' ? `<button class="btn small" data-act="delete" data-id="${esc(b.id)}">Delete</button>` : ''}
        </td>
      </tr>`).join('');
    $$('#bookingRows [data-act]').forEach((btn) => btn.addEventListener('click', () => {
      const { act, id } = btn.dataset;
      if (act === 'delete') {
        if (!confirm('Delete this booking permanently?')) return;
        db.bookings = db.bookings.filter((b) => b.id !== id);
        save();
      } else {
        setStatus(id, act);
      }
      renderStats();
      renderBookingTable();
    }));
  }

  // Packages, add-ons and vehicle surcharges
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
    setForm.businessName.value = s.businessName; setForm.open.value = s.open; setForm.close.value = s.close;
    setForm.interval.value = s.interval; setForm.bays.value = s.bays; setForm.currency.value = s.currency;
    $$('#dayChecks input').forEach((c) => { c.checked = s.openDays.includes(Number(c.value)); });
    $('#settingsSaved').textContent = '';
  }
  setForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (toMin(setForm.close.value) <= toMin(setForm.open.value)) {
      $('#settingsSaved').textContent = 'Closing time must be after opening time.';
      return;
    }
    Object.assign(db.settings, {
      businessName: setForm.businessName.value.trim() || 'Car Wash',
      open: setForm.open.value,
      close: setForm.close.value,
      interval: Math.max(5, parseInt(setForm.interval.value, 10) || 15),
      bays: Math.min(50, Math.max(1, parseInt(setForm.bays.value, 10) || 1)),
      currency: setForm.currency.value || '$',
      openDays: $$('#dayChecks input:checked').map((c) => Number(c.value)),
    });
    save(); applyBranding();
    $('#settingsSaved').textContent = 'Saved.';
    toast('Settings saved');
  });
  $('#resetData').addEventListener('click', () => {
    if (!confirm('This deletes all packages, bookings and settings. Continue?')) return;
    db = DEFAULTS(); save(); applyBranding(); renderAdmin(); goStep(1);
    toast('Data reset');
  });

  function applyBranding() {
    $('#businessName').textContent = db.settings.businessName;
    document.title = `${db.settings.businessName} — Book a wash`;
  }

  // ---------- Init ----------
  applyBranding();
  save();
  goStep(1);
})();
