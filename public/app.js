const appEl = document.getElementById('app');
const accountEl = document.getElementById('account-area');

const CATEGORY_LABELS = {
  consumer_product: 'Consumer product',
  vehicle: 'Vehicle',
  food: 'Food',
  drug: 'Drug / medication'
};

let state = { user: null, items: [], authMode: 'login', error: null };

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
  if (user) await loadItems();
  render();
}

async function loadItems() {
  state.items = await api('/api/items');
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
      const data = await api(path, { method: 'POST', body: JSON.stringify({ email, password }) });
      state.user = { email: data.email };
      state.error = null;
      await loadItems();
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
      <p>We check for new recalls on a schedule and email you the moment one matches.</p>
    </div>
  `;
  wrap.appendChild(head);

  wrap.appendChild(renderItemList());
  wrap.appendChild(renderAddForm());

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
