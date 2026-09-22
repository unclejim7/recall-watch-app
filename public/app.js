const appEl = document.getElementById('app');
const accountEl = document.getElementById('account-area');

const CATEGORY_LABELS = {
  consumer_product: 'Consumer product',
  vehicle: 'Vehicle',
  food: 'Food',
  drug: 'Drug / medication'
};

let state = { user: null, items: [], authMode: 'login', error: null, pushSupported: false, pushSubscribed: false };

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

async function init() {
  const { user } = await api('/api/me');
  state.user = user;
  if (user) {
    await loadItems();
    await refreshPushStatus();
  }
  render();
}

async function loadItems() {
  state.items = await api('/api/items');
}

async function refreshPushStatus() {
  state.pushSupported = 'serviceWorker' in navigator && 'PushManager' in window;
  if (!state.pushSupported) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    state.pushSubscribed = !!sub;
  } catch {
    state.pushSubscribed = false;
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from([...atob(base64)].map((c) => c.charCodeAt(0)));
}

async function enablePush() {
  const { key } = await api('/api/push/vapid-public-key');
  if (!key) throw new Error("Push notifications aren't configured on this server yet.");

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted.');

  const reg = await navigator.serviceWorker.register('/sw.js');
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key)
  });

  await api('/api/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: subscription.toJSON() }) });
}

function render() {
  renderAccountArea();
  appEl.innerHTML = '';
  appEl.appendChild(state.user ? renderDashboard() : renderAuth());
}

function renderAccountArea() {
  accountEl.innerHTML = '';
  if (!state.user) return;
  const span = document.createElement('span');
  span.style.cssText = 'font-size:13px;color:var(--ink-soft);margin-right:14px;';
  span.textContent = state.user.email;
  const btn = document.createElement('button');
  btn.className = 'btn-secondary';
  btn.textContent = 'Log out';
  btn.onclick = async () => {
    await api('/api/logout', { method: 'POST' });
    state.user = null;
    state.items = [];
    render();
  };
  accountEl.append(span, btn);
}

function renderAuth() {
  const wrap = document.createElement('div');
  wrap.className = 'auth-card';
  const isSignup = state.authMode === 'signup';
  wrap.innerHTML = `
    <h1>${isSignup ? 'Create your account' : 'Welcome back'}</h1>
    <p class="auth-sub">${isSignup
      ? 'Watch the items you own. Get an email the moment one is recalled.'
      : 'Log in to manage what you\'re watching.'}</p>
    <form id="auth-form">
      <label for="email">Email</label>
      <input id="email" type="email" required autocomplete="email" />
      <label for="password">Password</label>
      <input id="password" type="password" required minlength="8" autocomplete="${isSignup ? 'new-password' : 'current-password'}" />
      <button type="submit" class="btn-primary">${isSignup ? 'Create account' : 'Log in'}</button>
    </form>
    ${state.error ? `<div class="error-msg">${escapeHtml(state.error)}</div>` : ''}
    <p style="margin-top:18px;font-size:13px;color:var(--ink-soft);">
      ${isSignup ? 'Already have an account?' : "Don't have an account?"}
      <button class="btn-text" id="switch-mode">${isSignup ? 'Log in' : 'Sign up'}</button>
    </p>
  `;
  wrap.querySelector('#auth-form').onsubmit = async (e) => {
    e.preventDefault();
    const email = wrap.querySelector('#email').value.trim();
    const password = wrap.querySelector('#password').value;
    try {
      const path = isSignup ? '/api/signup' : '/api/login';
      await api(path, { method: 'POST', body: JSON.stringify({ email, password }) });
      const me = await api('/api/me');
      state.user = me.user;
      state.error = null;
      await loadItems();
      await refreshPushStatus();
      render();
    } catch (err) {
      state.error = err.message;
      render();
    }
  };
  wrap.querySelector('#switch-mode').onclick = () => {
    state.authMode = isSignup ? 'login' : 'signup';
    state.error = null;
    render();
  };
  return wrap;
}

function renderDashboard() {
  const wrap = document.createElement('div');

  const head = document.createElement('div');
  head.className = 'dash-head';
  head.innerHTML = `
    <div>
      <h1>Watched items</h1>
      <p>We check for new recalls on a schedule and alert you the moment one matches — by email, and instantly by text or push if you turn those on below.</p>
    </div>
  `;
  wrap.appendChild(head);

  wrap.appendChild(renderItemList());
  wrap.appendChild(renderAddForm());
  wrap.appendChild(renderNotificationSettings());

  const checkNow = document.createElement('div');
  checkNow.className = 'check-now';
  checkNow.innerHTML = `Want to test it right away? <button class="btn-text" id="check-now-btn">Run a check now</button>`;
  const statusMsg = document.createElement('div');
  statusMsg.className = 'status-msg';
  checkNow.appendChild(statusMsg);
  checkNow.querySelector('#check-now-btn').onclick = async () => {
    statusMsg.textContent = 'Checking…';
    try {
      const data = await api('/api/check-now', { method: 'POST' });
      statusMsg.textContent = data.note;
    } catch (err) {
      statusMsg.textContent = err.message;
    }
  };
  wrap.appendChild(checkNow);

  return wrap;
}

function renderItemList() {
  const section = document.createElement('div');
  if (state.items.length === 0) {
    section.innerHTML = `<div class="empty-state">You're not watching anything yet. Add a product, vehicle, or food/drug item below.</div>`;
    return section;
  }
  state.items.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'item-row';
    const detail = item.category === 'vehicle'
      ? `${item.criteria.year} ${item.criteria.make} ${item.criteria.model}`
      : item.criteria.keywords;
    row.innerHTML = `
      <span class="item-tag tag-${item.category}">${CATEGORY_LABELS[item.category]}</span>
      <div class="item-info">
        <div class="item-label">${escapeHtml(item.label)}</div>
        <div class="item-detail">${escapeHtml(detail)}</div>
      </div>
      <button class="item-remove">Remove</button>
    `;
    row.querySelector('.item-remove').onclick = async () => {
      await api(`/api/items/${item.id}`, { method: 'DELETE' });
      await loadItems();
      render();
    };
    section.appendChild(row);
  });
  return section;
}

function renderNotificationSettings() {
  const section = document.createElement('div');
  section.innerHTML = `<div class="section-title">Notifications</div>`;

  const card = document.createElement('div');
  card.className = 'add-form';

  const phoneWrap = document.createElement('div');
  phoneWrap.innerHTML = `
    <label for="phone">Phone number (for instant text alerts)</label>
    <input id="phone" type="tel" placeholder="(555) 123-4567" value="${escapeHtml(state.user.phone || '')}" />
    <div class="helptext">Standard message rates may apply. Leave blank to skip text alerts.</div>
  `;
  const phoneActions = document.createElement('div');
  phoneActions.className = 'form-actions';
  const phoneStatus = document.createElement('div');
  phoneStatus.className = 'status-msg';
  phoneActions.innerHTML = `<button type="button" class="btn-secondary">Save phone number</button>`;
  phoneActions.querySelector('button').onclick = async () => {
    phoneStatus.textContent = 'Saving…';
    try {
      const phone = phoneWrap.querySelector('#phone').value.trim();
      const data = await api('/api/me', { method: 'PATCH', body: JSON.stringify({ phone }) });
      state.user.phone = data.phone;
      phoneStatus.textContent = data.phone ? 'Text alerts enabled for this number.' : 'Text alerts turned off.';
    } catch (err) {
      phoneStatus.textContent = err.message;
    }
  };
  card.append(phoneWrap, phoneActions, phoneStatus);

  const pushWrap = document.createElement('div');
  pushWrap.style.cssText = 'margin-top:20px;padding-top:20px;border-top:1px solid var(--line);';
  const pushStatus = document.createElement('div');
  pushStatus.className = 'status-msg';

  if (!state.pushSupported) {
    pushWrap.innerHTML = `
      <label>Push notifications</label>
      <div class="helptext">Not supported in this browser. On iPhone: add this site to your home screen (Share → Add to Home Screen), then open it from there and try again.</div>
    `;
  } else {
    pushWrap.innerHTML = `
      <label>Push notifications</label>
      <div class="helptext">Get an instant alert on this device — no app install required.</div>
    `;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-secondary';
    btn.style.marginTop = '10px';
    btn.textContent = state.pushSubscribed ? 'Push notifications on for this device' : 'Enable push notifications on this device';
    btn.disabled = state.pushSubscribed;
    btn.onclick = async () => {
      pushStatus.textContent = 'Enabling…';
      try {
        await enablePush();
        state.pushSubscribed = true;
        pushStatus.textContent = 'Push notifications enabled on this device.';
        render();
      } catch (err) {
        pushStatus.textContent = err.message;
      }
    };
    pushWrap.appendChild(btn);
  }
  pushWrap.appendChild(pushStatus);
  card.appendChild(pushWrap);

  section.appendChild(card);
  return section;
}

function renderAddForm() {
  const section = document.createElement('div');
  section.innerHTML = `<div class="section-title">Add an item</div>`;

  const form = document.createElement('form');
  form.className = 'add-form';
  form.innerHTML = `
    <label for="category">Category</label>
    <select id="category">
      <option value="consumer_product">Consumer product (toy, car seat, appliance, furniture…)</option>
      <option value="vehicle">Vehicle</option>
      <option value="food">Food</option>
      <option value="drug">Drug / medication</option>
    </select>

    <div id="fields-consumer_product">
      <label for="label">What is it? (this is just for your own reference)</label>
      <input id="label" placeholder="e.g. Graco 4Ever car seat" />
      <label for="keywords">Brand, model, and any distinguishing details</label>
      <input id="keywords" placeholder="e.g. Graco 4Ever DLX car seat" />
      <div class="helptext">We match these words against recall titles and descriptions — the more specific, the fewer false positives.</div>
    </div>

    <div id="fields-vehicle" style="display:none;">
      <label for="v-label">What is it? (this is just for your own reference)</label>
      <input id="v-label" placeholder="e.g. Family SUV" />
      <div class="form-row">
        <div>
          <label for="v-year">Year</label>
          <input id="v-year" placeholder="2019" inputmode="numeric" />
        </div>
        <div>
          <label for="v-make">Make</label>
          <input id="v-make" placeholder="Honda" />
        </div>
        <div>
          <label for="v-model">Model</label>
          <input id="v-model" placeholder="CR-V" />
        </div>
      </div>
    </div>

    <div class="form-actions">
      <button type="submit" class="btn-primary" style="width:auto;margin-top:0;">Add to watch list</button>
    </div>
    <div class="error-msg" id="add-error" style="display:none;"></div>
  `;

  const categorySelect = form.querySelector('#category');
  const consumerFields = form.querySelector('#fields-consumer_product');
  const vehicleFields = form.querySelector('#fields-vehicle');
  categorySelect.onchange = () => {
    const isVehicle = categorySelect.value === 'vehicle';
    vehicleFields.style.display = isVehicle ? 'block' : 'none';
    consumerFields.style.display = isVehicle ? 'none' : 'block';
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const errEl = form.querySelector('#add-error');
    errEl.style.display = 'none';
    const category = categorySelect.value;

    let payload;
    if (category === 'vehicle') {
      payload = {
        category,
        label: form.querySelector('#v-label').value.trim() || `${form.querySelector('#v-year').value} ${form.querySelector('#v-make').value} ${form.querySelector('#v-model').value}`,
        criteria: {
          year: form.querySelector('#v-year').value.trim(),
          make: form.querySelector('#v-make').value.trim(),
          model: form.querySelector('#v-model').value.trim()
        }
      };
    } else {
      payload = {
        category,
        label: form.querySelector('#label').value.trim(),
        criteria: { keywords: form.querySelector('#keywords').value.trim() }
      };
    }

    try {
      await api('/api/items', { method: 'POST', body: JSON.stringify(payload) });
      await loadItems();
      render();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    }
  };

  section.appendChild(form);
  return section;
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

init();
