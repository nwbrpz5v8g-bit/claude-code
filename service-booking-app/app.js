/* Service Booking App — vanilla JS, data persisted in localStorage. */
(() => {
  'use strict';

  // ---------- Storage ----------
  const KEY = 'service-booking-app:v1';
  const DEFAULTS = () => ({
    settings: {
      businessName: 'Service Booking',
      open: '09:00',
      close: '17:00',
      interval: 30,
      openDays: [1, 2, 3, 4, 5, 6], // 0 = Sunday
      currency: '$',
      bookAheadDays: 60,
    },
    services: [
      { id: uid(), name: 'Consultation', duration: 30, price: 0, description: 'A quick chat to understand what you need.' },
      { id: uid(), name: 'Standard Service', duration: 60, price: 60, description: 'Our most popular one-hour session.' },
      { id: uid(), name: 'Premium Service', duration: 90, price: 110, description: 'Extended session with extra care and follow-up.' },
      { id: uid(), name: 'Express Check', duration: 15, price: 20, description: 'Fast check-in for small jobs.' },
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
  function uid() { return Math.random().toString(36).slice(2, 8).toUpperCase() + Date.now().toString(36).slice(-3).toUpperCase(); }
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const fmtTime = (min) => {
    const h = Math.floor(min / 60), m = min % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${((h + 11) % 12) + 1}:${pad(m)} ${ampm}`;
  };
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const fmtDate = (s, opts = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) =>
    parseISO(s).toLocaleDateString(undefined, opts);
  const money = (n) => Number(n) === 0 ? 'Free' : `${db.settings.currency}${Number(n).toFixed(2).replace(/\.00$/, '')}`;
  const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const nowMinutes = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
  const serviceById = (id) => db.services.find((s) => s.id === id);
  const bookingStart = (b) => { const d = parseISO(b.date); d.setMinutes(b.start); return d; };

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ---------- Availability ----------
  function isOpenDay(date) { return db.settings.openDays.includes(date.getDay()); }

  function availableSlots(dateStr, duration) {
    const { open, close, interval } = db.settings;
    const openM = toMin(open), closeM = toMin(close);
    const taken = db.bookings.filter((b) => b.date === dateStr && b.status !== 'cancelled');
    const isToday = dateStr === isoDate(new Date());
    const minStart = isToday ? nowMinutes() + 15 : -1; // small lead time for same-day
    const slots = [];
    for (let t = openM; t + duration <= closeM; t += Number(interval)) {
      if (t < minStart) continue;
      const clash = taken.some((b) => t < b.start + b.duration && b.start < t + duration);
      if (!clash) slots.push(t);
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
  const state = { step: 1, serviceId: null, date: null, start: null, month: null, lastBooking: null };

  function goStep(n) {
    state.step = n;
    $$('.step-panel').forEach((p) => p.classList.toggle('hidden', Number(p.dataset.panel) !== n));
    $$('#steps li').forEach((li) => {
      const s = Number(li.dataset.step);
      li.classList.toggle('current', s === n);
      li.classList.toggle('done', s < n);
    });
    if (n === 1) renderServices();
    if (n === 2) renderCalendar();
    if (n === 3) renderSummary();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  $$('[data-back]').forEach((b) => b.addEventListener('click', () => goStep(Number(b.dataset.back))));

  function renderServices() {
    const grid = $('#serviceGrid');
    if (!db.services.length) {
      grid.innerHTML = '<p class="muted">No services yet. Add some in Admin → Services.</p>';
      return;
    }
    grid.innerHTML = db.services.map((s) => `
      <button class="card service" data-id="${esc(s.id)}">
        <span class="title"><strong>${esc(s.name)}</strong></span>
        <span class="muted">${esc(s.description || '')}</span>
        <span class="meta"><span>${s.duration} min</span><span class="price">${money(s.price)}</span></span>
      </button>`).join('');
    $$('.service', grid).forEach((b) => b.addEventListener('click', () => {
      state.serviceId = b.dataset.id;
      state.date = null; state.start = null;
      const t = startOfToday();
      state.month = new Date(t.getFullYear(), t.getMonth(), 1);
      goStep(2);
    }));
  }

  function renderCalendar() {
    const svc = serviceById(state.serviceId);
    if (!svc) return goStep(1);
    $('#selectedServiceLabel').textContent = `${svc.name} · ${svc.duration} min · ${money(svc.price)}`;
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
      const disabled = date < today || date > last || !isOpenDay(date) || availableSlots(iso, svc.duration).length === 0;
      const cls = ['day', iso === isoDate(today) ? 'today' : '', iso === state.date ? 'selected' : ''].join(' ');
      html += `<button class="${cls}" data-date="${iso}" ${disabled ? 'disabled' : ''}>${d}</button>`;
    }
    $('#calDays').innerHTML = html;
    $$('#calDays .day:not(:disabled)').forEach((b) => b.addEventListener('click', () => {
      state.date = b.dataset.date;
      renderCalendar();
    }));
    renderSlots();
  }

  function renderSlots() {
    const list = $('#slotList');
    if (!state.date) {
      $('#slotsTitle').textContent = 'Select a date';
      list.innerHTML = '<p class="muted">Available times will appear here.</p>';
      return;
    }
    const svc = serviceById(state.serviceId);
    const slots = availableSlots(state.date, svc.duration);
    $('#slotsTitle').textContent = fmtDate(state.date, { weekday: 'long', month: 'long', day: 'numeric' });
    list.innerHTML = slots.length
      ? slots.map((t) => `<button class="slot" data-start="${t}">${fmtTime(t)}</button>`).join('')
      : '<p class="muted">No times left on this day.</p>';
    $$('.slot', list).forEach((b) => b.addEventListener('click', () => {
      state.start = Number(b.dataset.start);
      goStep(3);
    }));
  }

  $('#prevMonth').addEventListener('click', () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); renderCalendar(); });
  $('#nextMonth').addEventListener('click', () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); renderCalendar(); });

  function renderSummary() {
    const svc = serviceById(state.serviceId);
    $('#bookingSummary').innerHTML = `
      <div><span>Service</span>${esc(svc.name)}</div>
      <div><span>Date</span>${fmtDate(state.date)}</div>
      <div><span>Time</span>${fmtTime(state.start)} – ${fmtTime(state.start + svc.duration)}</div>
      <div><span>Price</span>${money(svc.price)}</div>`;
    $('#formError').textContent = '';
  }

  $('#detailsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const data = Object.fromEntries(new FormData(f));
    const err = $('#formError');
    if (!data.name.trim()) return (err.textContent = 'Please enter your name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) return (err.textContent = 'Please enter a valid email.');

    const svc = serviceById(state.serviceId);
    // Re-check the slot is still free (another tab may have taken it).
    if (!availableSlots(state.date, svc.duration).includes(state.start)) {
      err.textContent = 'Sorry, that time was just taken. Please pick another.';
      return setTimeout(() => goStep(2), 1200);
    }
    const booking = {
      id: uid(),
      serviceId: svc.id,
      serviceName: svc.name,
      price: Number(svc.price),
      duration: svc.duration,
      date: state.date,
      start: state.start,
      name: data.name.trim(),
      email: data.email.trim().toLowerCase(),
      phone: data.phone.trim(),
      notes: data.notes.trim(),
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    };
    db.bookings.push(booking);
    save();
    state.lastBooking = booking;
    try { localStorage.setItem(KEY + ':lastEmail', booking.email); } catch (_) {}
    f.reset();
    $('#confirmation').innerHTML = `
      <p><strong>${esc(booking.serviceName)}</strong><br>
      ${fmtDate(booking.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}<br>
      ${fmtTime(booking.start)} – ${fmtTime(booking.start + booking.duration)}</p>
      <p>Reference <span class="ref">${esc(booking.id)}</span></p>
      <p class="muted">A confirmation would be sent to ${esc(booking.email)}.</p>`;
    goStep(4);
  });

  $('#bookAnother').addEventListener('click', () => goStep(1));
  $('#viewMine').addEventListener('click', () => {
    $('#lookupForm').email.value = state.lastBooking?.email || '';
    showView('mine');
  });

  // ---------- My bookings ----------
  $('#lookupForm').addEventListener('submit', (e) => { e.preventDefault(); renderMine(); });

  function renderMine() {
    const input = $('#lookupForm').email;
    if (!input.value) { try { input.value = localStorage.getItem(KEY + ':lastEmail') || ''; } catch (_) {} }
    const email = input.value.trim().toLowerCase();
    const box = $('#myBookings');
    if (!email) { box.innerHTML = '<p class="muted">Enter your email to see your bookings.</p>'; return; }
    const mine = db.bookings.filter((b) => b.email === email).sort((a, b) => bookingStart(b) - bookingStart(a));
    if (!mine.length) { box.innerHTML = '<p class="muted">No bookings found for that email.</p>'; return; }
    const now = new Date();
    box.innerHTML = mine.map((b) => {
      const future = bookingStart(b) > now && b.status === 'confirmed';
      return `<div class="card item">
        <div>
          <div class="title">${esc(b.serviceName)} <span class="badge ${b.status}">${b.status}</span></div>
          <div class="muted">${fmtDate(b.date)} · ${fmtTime(b.start)} – ${fmtTime(b.start + b.duration)} · Ref ${esc(b.id)}</div>
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
    const active = db.bookings.filter((b) => b.status !== 'cancelled');
    const upcoming = active.filter((b) => b.status === 'confirmed' && bookingStart(b) > now);
    const today = active.filter((b) => b.date === todayISO);
    const revenue = db.bookings.filter((b) => b.status === 'completed').reduce((s, b) => s + b.price, 0);
    const stats = [
      ['Today', today.length],
      ['Upcoming', upcoming.length],
      ['Total bookings', db.bookings.length],
      ['Completed revenue', `${db.settings.currency}${revenue.toFixed(2)}`],
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
    else if (filter !== 'all') rows = rows.filter((b) => b.status === filter);
    if (q) rows = rows.filter((b) => [b.name, b.email, b.serviceName, b.phone, b.id].join(' ').toLowerCase().includes(q));
    rows.sort((a, b) => filter === 'upcoming' ? bookingStart(a) - bookingStart(b) : bookingStart(b) - bookingStart(a));

    $('#noRows').classList.toggle('hidden', rows.length > 0);
    $('#bookingRows').innerHTML = rows.map((b) => `
      <tr>
        <td>${fmtDate(b.date)}<small>${fmtTime(b.start)} – ${fmtTime(b.start + b.duration)}</small></td>
        <td>${esc(b.serviceName)}<small>${money(b.price)}</small></td>
        <td>${esc(b.name)}<small>${esc(b.email)}${b.phone ? ' · ' + esc(b.phone) : ''}</small>${b.notes ? `<small>“${esc(b.notes)}”</small>` : ''}</td>
        <td><span class="badge ${b.status}">${b.status}</span></td>
        <td class="act">
          ${b.status === 'confirmed' ? `<button class="btn small" data-act="completed" data-id="${esc(b.id)}">Complete</button>
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

  // Services admin
  const sForm = $('#serviceForm');
  function renderServiceAdmin() {
    $('#serviceAdminList').innerHTML = db.services.map((s) => `
      <div class="card item">
        <div>
          <div class="title">${esc(s.name)}</div>
          <div class="muted">${s.duration} min · ${money(s.price)}${s.description ? ' · ' + esc(s.description) : ''}</div>
        </div>
        <div>
          <button class="btn small" data-edit="${esc(s.id)}">Edit</button>
          <button class="btn small danger" data-del="${esc(s.id)}">Delete</button>
        </div>
      </div>`).join('') || '<p class="muted">No services yet.</p>';
    $$('[data-edit]').forEach((b) => b.addEventListener('click', () => {
      const s = serviceById(b.dataset.edit);
      sForm.id.value = s.id; sForm.name.value = s.name; sForm.duration.value = s.duration;
      sForm.price.value = s.price; sForm.description.value = s.description || '';
      $('#serviceFormTitle').textContent = 'Edit service';
      $('#cancelEdit').classList.remove('hidden');
      sForm.name.focus();
    }));
    $$('[data-del]').forEach((b) => b.addEventListener('click', () => {
      if (!confirm('Delete this service? Existing bookings are kept.')) return;
      db.services = db.services.filter((s) => s.id !== b.dataset.del);
      save(); renderServiceAdmin(); toast('Service deleted');
    }));
  }
  function resetServiceForm() {
    sForm.reset(); sForm.id.value = '';
    $('#serviceFormTitle').textContent = 'Add a service';
    $('#cancelEdit').classList.add('hidden');
  }
  $('#cancelEdit').addEventListener('click', resetServiceForm);
  sForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(sForm));
    const svc = { id: d.id || uid(), name: d.name.trim(), duration: Math.max(5, parseInt(d.duration, 10) || 60), price: Math.max(0, parseFloat(d.price) || 0), description: d.description.trim() };
    if (!svc.name) return;
    const i = db.services.findIndex((s) => s.id === svc.id);
    if (i >= 0) db.services[i] = svc; else db.services.push(svc);
    save(); resetServiceForm(); renderServiceAdmin();
    toast(i >= 0 ? 'Service updated' : 'Service added');
  });

  // Settings
  const setForm = $('#settingsForm');
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  $('#dayChecks').innerHTML = [1, 2, 3, 4, 5, 6, 0].map((d) =>
    `<label><input type="checkbox" value="${d}" /> ${DAY_NAMES[d]}</label>`).join('');
  function fillSettings() {
    const s = db.settings;
    setForm.businessName.value = s.businessName; setForm.open.value = s.open; setForm.close.value = s.close;
    setForm.interval.value = s.interval; setForm.currency.value = s.currency;
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
      businessName: setForm.businessName.value.trim() || 'Service Booking',
      open: setForm.open.value,
      close: setForm.close.value,
      interval: Math.max(5, parseInt(setForm.interval.value, 10) || 30),
      currency: setForm.currency.value || '$',
      openDays: $$('#dayChecks input:checked').map((c) => Number(c.value)),
    });
    save(); applyBranding();
    $('#settingsSaved').textContent = 'Saved.';
    toast('Settings saved');
  });
  $('#resetData').addEventListener('click', () => {
    if (!confirm('This deletes all services, bookings and settings. Continue?')) return;
    db = DEFAULTS(); save(); applyBranding(); renderAdmin(); goStep(1);
    toast('Data reset');
  });

  function applyBranding() {
    $('#businessName').textContent = db.settings.businessName;
    document.title = db.settings.businessName;
  }

  // ---------- Init ----------
  applyBranding();
  save();
  goStep(1);
})();
