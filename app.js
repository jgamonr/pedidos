const DEFAULT_PRODUCTS = [
  { id: 'hamburguesa', categoria: 'Alimentos', nombre: 'Hamburguesa', descripcion: 'Hamburguesa clásica para evento', disponible: true, orden: 10 },
  { id: 'hot-dog', categoria: 'Alimentos', nombre: 'Hot Dog', descripcion: 'Hot dog clásico', disponible: true, orden: 20 },
  { id: 'agua-ponche', categoria: 'Bebidas', nombre: 'Agua de ponche', descripcion: 'Bebida fría de ponche', disponible: true, orden: 30 },
  { id: 'latte-natural', categoria: 'Bebidas', nombre: 'Latte frío natural', descripcion: 'Café latte frío natural', disponible: true, orden: 40 },
  { id: 'latte-crema-irlandesa', categoria: 'Bebidas', nombre: 'Latte frío crema irlandesa', descripcion: 'Café latte frío sabor crema irlandesa', disponible: true, orden: 50 },
  { id: 'latte-vainilla', categoria: 'Bebidas', nombre: 'Latte frío vainilla', descripcion: 'Café latte frío sabor vainilla', disponible: true, orden: 60 }
];

const FOOD_INGREDIENTS = {
  hamburguesa: ['Carne', 'Queso', 'Lechuga', 'Tomate', 'Cebolla', 'Catsup', 'Mostaza', 'Mayonesa', 'Pepinillos'],
  'hot-dog': ['Salchicha', 'Pan', 'Catsup', 'Mostaza', 'Mayonesa', 'Cebolla', 'Jalapenos', 'Queso']
};

const STATUS_FLOW = ['NUEVO', 'PREPARANDO', 'LISTO', 'ENTREGADO'];
const STORAGE = {
  apiUrl: 'fiesta_api_url',
  cart: 'fiesta_cart',
  ingredients: 'fiesta_ingredients',
  history: 'fiesta_history',
  guestSessionId: 'fiesta_guest_session_id',
  guestPhone: 'fiesta_guest_phone',
  guestName: 'fiesta_guest_name',
  guestLocation: 'fiesta_guest_location',
  pin: 'fiesta_kitchen_pin'
};

const state = {
  apiUrl: localStorage.getItem(STORAGE.apiUrl) || window.FIESTA_API_URL || '',
  guestPhone: normalizePhone(localStorage.getItem(STORAGE.guestPhone) || ''),
  guestSessionId: getInitialGuestSessionId(),
  products: DEFAULT_PRODUCTS,
  cart: readObject(STORAGE.cart),
  ingredients: readObject(STORAGE.ingredients),
  history: filterGuestHistory(readArray(STORAGE.history), localStorage.getItem(STORAGE.guestPhone), localStorage.getItem(STORAGE.guestSessionId)),
  kitchenPin: sessionStorage.getItem(STORAGE.pin) || '',
  orders: new Map(),
  lastOrdersSync: '',
  statusFilter: '',
  search: '',
  menuCategory: 'Alimentos',
  kitchenTimer: null,
  productTimer: null,
  guestStatusTimer: null
};

const els = {};

document.addEventListener('DOMContentLoaded', () => {
  bindElements();
  bindEvents();
  hydrateGuestProfile();
  registerServiceWorker();
  renderAll();
  loadProducts();
  startProductPolling();
  startGuestStatusPolling();

  if (els.kitchenDashboard && !document.body.classList.contains('guest-only')) unlockKitchen();
});

function bindElements() {
  [
    'connectionText', 'settingsButton', 'menuList', 'cartCount', 'cartItems', 'clearCartButton',
    'orderForm', 'guestPhone', 'guestName', 'guestLocation', 'guestNotes', 'submitOrderButton', 'guestHistory',
    'pinGate', 'pinForm', 'kitchenPin', 'kitchenDashboard', 'summaryGrid', 'statusFilter',
    'kitchenSearch', 'lastSyncText', 'refreshKitchenButton', 'ordersList', 'availabilityList',
    'settingsDialog', 'apiUrlInput', 'saveSettingsButton', 'quickOrderButton', 'statusDialog',
    'statusModalBadge', 'statusModalTitle', 'statusModalMessage', 'statusModalClose', 'toast'
  ].forEach(id => { els[id] = document.getElementById(id); });
}

function bindEvents() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
  });

  if (els.settingsButton) els.settingsButton.addEventListener('click', () => {
    els.apiUrlInput.value = state.apiUrl;
    els.settingsDialog.showModal();
  });

  if (els.saveSettingsButton) els.saveSettingsButton.addEventListener('click', () => {
    state.apiUrl = els.apiUrlInput.value.trim();
    localStorage.setItem(STORAGE.apiUrl, state.apiUrl);
    toast('URL guardada');
    loadProducts();
  });

  if (els.clearCartButton) els.clearCartButton.addEventListener('click', () => {
    state.cart = {};
    state.ingredients = {};
    persistCart();
    renderCart();
    renderMenu();
  });

  if (els.quickOrderButton) els.quickOrderButton.addEventListener('click', quickOrder);
  if (els.orderForm) els.orderForm.addEventListener('submit', submitOrder);
  if (els.guestPhone) els.guestPhone.addEventListener('change', saveGuestProfile);
  if (els.guestName) els.guestName.addEventListener('change', saveGuestProfile);
  if (els.guestLocation) els.guestLocation.addEventListener('change', saveGuestProfile);

  if (els.pinForm) els.pinForm.addEventListener('submit', event => {
    event.preventDefault();
    state.kitchenPin = els.kitchenPin.value.trim();
    sessionStorage.setItem(STORAGE.pin, state.kitchenPin);
    unlockKitchen();
  });

  if (els.statusFilter) els.statusFilter.addEventListener('click', event => {
    const button = event.target.closest('button[data-status]');
    if (!button) return;
    state.statusFilter = button.dataset.status;
    els.statusFilter.querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
    renderOrders();
  });

  if (els.kitchenSearch) els.kitchenSearch.addEventListener('input', event => {
    state.search = event.target.value.trim().toLowerCase();
    renderOrders();
  });

  if (els.refreshKitchenButton) els.refreshKitchenButton.addEventListener('click', () => syncKitchen({ full: true }));
  if (els.statusDialog) els.statusDialog.addEventListener('close', () => {
    const orderId = els.statusDialog.dataset.orderId;
    if (!orderId) return;
    const order = state.history.find(item => item.orderId === orderId);
    if (!order) return;
    order.attention = false;
    localStorage.setItem(STORAGE.history, JSON.stringify(state.history));
    renderHistory();
    delete els.statusDialog.dataset.orderId;
  });
  if (els.guestHistory) els.guestHistory.addEventListener('click', event => {
    const card = event.target.closest('[data-history-id]');
    if (!card) return;
    const order = state.history.find(item => item.orderId === card.dataset.historyId);
    if (!order) return;
    order.attention = false;
    localStorage.setItem(STORAGE.history, JSON.stringify(state.history));
    renderHistory();
  });
  document.querySelectorAll('[data-scroll-target]').forEach(button => {
    button.addEventListener('click', () => {
      const target = document.getElementById(button.dataset.scrollTarget);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function switchView(viewId) {
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.view === viewId));
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === viewId));
  if (viewId === 'kitchenView') syncKitchen({ full: true });
}

function renderAll() {
  renderConnection();
  renderMenu();
  renderCart();
  renderHistory();
  if (els.availabilityList) renderAvailability();
  if (els.summaryGrid) renderSummary();
  if (els.ordersList) renderOrders();
}

function renderConnection() {
  if (els.connectionText) els.connectionText.textContent = state.apiUrl ? 'Conectado a Apps Script' : 'Configura la URL de Apps Script';
}

function renderMenu() {
  const products = Array.isArray(state.products) && state.products.length ? state.products : DEFAULT_PRODUCTS;
  const sorted = products.slice().sort((a, b) => Number(a.orden) - Number(b.orden));
  const categories = Object.keys(groupBy(sorted, 'categoria'));
  els.menuList.innerHTML = `
    <div class="menu-tabs">
      ${categories.map(category => `
        <button type="button" class="${state.menuCategory === category ? 'active' : ''}" data-menu-category="${escapeHtml(category)}">
          <span>${categoryIcon(category)}</span>${escapeHtml(category)}
        </button>
      `).join('')}
    </div>
    <div class="products-showcase">
      ${sorted.map(productCard).join('')}
    </div>
  `;

  els.menuList.querySelectorAll('[data-menu-category]').forEach(button => {
    button.addEventListener('click', () => {
      state.menuCategory = button.dataset.menuCategory;
      const first = Array.from(els.menuList.querySelectorAll('[data-product-category]')).find(card => card.dataset.productCategory === state.menuCategory);
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      renderMenu();
    });
  });

  els.menuList.querySelectorAll('[data-add]').forEach(button => {
    button.addEventListener('click', () => changeCart(button.dataset.add, 1));
  });
  els.menuList.querySelectorAll('[data-remove]').forEach(button => {
    button.addEventListener('click', () => changeCart(button.dataset.remove, -1));
  });
  els.menuList.querySelectorAll('[data-ingredient-product]').forEach(input => {
    input.addEventListener('change', () => updateIngredient(input.dataset.ingredientProduct, input.value, input.checked));
  });
}

function productCard(product) {
  const qty = state.cart[product.id] || 0;
  const disabled = !product.disponible ? 'disabled' : '';
  const ingredients = getIngredientOptions(product.id);
  const selected = getSelectedIngredients(product.id);
  const isFood = product.categoria === 'Alimentos';
  return `
    <article class="product-card ${isFood ? 'food-card' : 'drink-card'} ${product.disponible ? '' : 'unavailable'}" data-product-category="${escapeHtml(product.categoria)}">
      <img class="product-photo" src="${productPhoto(product)}" alt="" loading="lazy">
      <div class="product-info">
        <h3>${escapeHtml(product.nombre)}</h3>
        <p>${escapeHtml(product.descripcion || '')}</p>
        <div class="product-meta">
          <span class="pill"><span class="dot"></span>${product.categoria === 'Alimentos' ? 'Alimento' : 'Bebida'}</span>
          <span class="pill">${product.disponible ? 'Disponible' : 'Agotado'}</span>
        </div>
        ${ingredients.length ? `
          <div class="ingredient-picker">
            <strong>Ingredientes (puedes quitar los que no quieras)</strong>
            <div class="ingredient-options">
              ${ingredients.map(ingredient => `
                <label class="ingredient-chip">
                  <input type="checkbox" data-ingredient-product="${product.id}" value="${escapeHtml(ingredient)}" ${selected.includes(ingredient) ? 'checked' : ''}>
                  <span>${escapeHtml(ingredient)}</span>
                </label>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
      <div class="qty-control" aria-label="Cantidad de ${escapeHtml(product.nombre)}">
        <button type="button" data-remove="${product.id}" ${qty < 1 ? 'disabled' : ''}>−</button>
        <span>${qty}</span>
        <button type="button" data-add="${product.id}" ${disabled}>+</button>
      </div>
      <button class="add-product-button ${isFood ? 'food-action' : 'drink-action'}" type="button" data-add="${product.id}" ${disabled}>
        <span aria-hidden="true">🛒</span> Agregar
      </button>
    </article>
  `;
}

function renderCart() {
  const lines = cartLines();
  const total = lines.reduce((sum, line) => sum + line.quantity, 0);
  els.cartCount.textContent = total ? `${total} producto${total === 1 ? '' : 's'}` : 'Sin productos';
  updateBottomCartCount(total);

  if (!lines.length) {
    els.cartItems.className = 'cart-items empty';
    els.cartItems.textContent = 'Agrega productos del menú.';
    return;
  }

  els.cartItems.className = 'cart-items';
  els.cartItems.innerHTML = lines.map(line => `
    <div class="cart-line">
      <img class="cart-thumb" src="${productPhoto(line.product)}" alt="" loading="lazy">
      <div>
        <strong>${escapeHtml(line.product.nombre)}</strong>
        <p><span class="cart-qty">${line.quantity}</span> ${escapeHtml(line.product.categoria)}</p>
        ${line.notes ? `<small>${escapeHtml(line.notes)}</small>` : ''}
      </div>
      <div class="qty-control">
        <button type="button" data-cart-remove="${line.product.id}">−</button>
        <span>${line.quantity}</span>
        <button type="button" data-cart-add="${line.product.id}" ${line.product.disponible ? '' : 'disabled'}>+</button>
      </div>
    </div>
  `).join('');

  els.cartItems.querySelectorAll('[data-cart-add]').forEach(button => button.addEventListener('click', () => changeCart(button.dataset.cartAdd, 1)));
  els.cartItems.querySelectorAll('[data-cart-remove]').forEach(button => button.addEventListener('click', () => changeCart(button.dataset.cartRemove, -1)));
}

function renderHistory() {
  const recent = Array.isArray(state.history) ? state.history.slice(0, 5) : [];
  els.guestHistory.innerHTML = recent.length ? `
    <h3>Seguimiento de tus pedidos</h3>
    ${recent.map(order => `
      <article class="history-card ${order.attention ? 'needs-attention' : ''}" data-history-id="${escapeHtml(order.orderId || '')}">
        <div>
          <strong>Pedido #${escapeHtml(order.folio || '')}</strong>
          <p>${escapeHtml(statusMessage(order.status))} · ${formatTime(order.updatedAt || order.createdAt)}</p>
        </div>
        <span class="status-badge status-${escapeHtml(order.status || 'NUEVO')}">${escapeHtml(order.status || 'NUEVO')}</span>
      </article>
    `).join('')}
  ` : '';
}

function renderSummary(summary) {
  const counts = summary && summary.counts ? summary.counts : {};
  const cards = [
    ['Nuevos', counts.NUEVO || 0],
    ['Preparando', counts.PREPARANDO || 0],
    ['Listos', counts.LISTO || 0],
    ['Entregados', counts.ENTREGADO || 0],
    ['Piezas abiertas', summary ? summary.openItems : 0]
  ];

  els.summaryGrid.innerHTML = cards.map(([label, value]) => `
    <div class="summary-card">
      <strong>${value}</strong>
      <span>${label}</span>
    </div>
  `).join('');
}

function renderOrders() {
  const query = state.search;
  const orders = Array.from(state.orders.values())
    .filter(order => !state.statusFilter || order.status === state.statusFilter)
    .filter(order => {
      if (!query) return true;
      return [order.folio, order.guestName, order.location, order.status].join(' ').toLowerCase().includes(query);
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (!orders.length) {
    els.ordersList.innerHTML = '<div class="history-card">No hay pedidos con este filtro.</div>';
    return;
  }

  els.ordersList.innerHTML = orders.map(orderCard).join('');
  els.ordersList.querySelectorAll('[data-next-status]').forEach(button => {
    button.addEventListener('click', () => updateStatus(button.dataset.orderId, button.dataset.nextStatus));
  });
}

function orderCard(order) {
  const nextStatuses = STATUS_FLOW.filter(status => status !== order.status);
  return `
    <article class="order-card">
      <header>
        <div>
          <div class="folio">#${escapeHtml(order.folio || '')}</div>
          <h3>${escapeHtml(order.guestName || 'Invitado')}</h3>
          <p>${escapeHtml(order.location || 'Sin ubicación')} · ${formatTime(order.createdAt)}</p>
        </div>
        <span class="pill">${escapeHtml(order.status)}</span>
      </header>
      <div class="order-items">
        ${(order.items || []).map(item => `
          <div class="order-item">
            <span>
              ${escapeHtml(item.productName)}
              ${item.notes ? `<small>${escapeHtml(item.notes)}</small>` : ''}
            </span>
            <strong>x${Number(item.quantity || 0)}</strong>
          </div>
        `).join('')}
      </div>
      ${order.notes ? `<p><strong>Notas:</strong> ${escapeHtml(order.notes)}</p>` : ''}
      <div class="status-actions">
        ${nextStatuses.map(status => `
          <button class="status-button" type="button" data-status="${status}" data-next-status="${status}" data-order-id="${order.orderId}">
            ${labelStatus(status)}
          </button>
        `).join('')}
        ${order.status !== 'CANCELADO' ? `
          <button class="status-button" type="button" data-status="CANCELADO" data-next-status="CANCELADO" data-order-id="${order.orderId}">
            Cancelar
          </button>
        ` : ''}
      </div>
    </article>
  `;
}

function renderAvailability() {
  els.availabilityList.innerHTML = state.products.map(product => `
    <div class="availability-row">
      <div>
        <strong>${escapeHtml(product.nombre)}</strong>
        <p>${escapeHtml(product.categoria)}</p>
      </div>
      <label class="switch" aria-label="Disponibilidad de ${escapeHtml(product.nombre)}">
        <input type="checkbox" data-availability="${product.id}" ${product.disponible ? 'checked' : ''}>
        <span class="slider"></span>
      </label>
    </div>
  `).join('');

  els.availabilityList.querySelectorAll('[data-availability]').forEach(input => {
    input.addEventListener('change', () => updateAvailability(input.dataset.availability, input.checked));
  });
}

function changeCart(productId, delta) {
  const product = state.products.find(item => item.id === productId);
  if (!product || (!product.disponible && delta > 0)) return;

  const next = Math.max(0, Math.min(20, (state.cart[productId] || 0) + delta));
  if (next === 0) {
    delete state.cart[productId];
  } else {
    state.cart[productId] = next;
    ensureDefaultIngredients(productId);
  }

  persistCart();
  renderMenu();
  renderCart();
}

function quickOrder() {
  const burger = state.products.find(product => product.id === 'hamburguesa' && product.disponible);
  const water = state.products.find(product => product.id === 'agua-ponche' && product.disponible);
  if (burger) state.cart[burger.id] = (state.cart[burger.id] || 0) + 1;
  if (water) state.cart[water.id] = (state.cart[water.id] || 0) + 1;
  if (burger) ensureDefaultIngredients(burger.id);
  persistCart();
  renderMenu();
  renderCart();
  toast('Pedido rápido agregado');
}

async function submitOrder(event) {
  event.preventDefault();
  if (!state.apiUrl) return openSettingsWithMessage('Configura la URL de Apps Script antes de enviar pedidos.');

  const lines = cartLines();
  if (!lines.length) return toast('Agrega al menos un producto');
  const phone = normalizePhone(els.guestPhone ? els.guestPhone.value : state.guestPhone);
  if (phone.length < 7) return toast('Ingresa tu telefono para guardar tus pedidos');
  saveGuestProfile();

  const clientRequestId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const payload = {
    action: 'createOrder',
    clientRequestId,
    guestSessionId: state.guestSessionId,
    guestPhone: state.guestPhone,
    guestName: els.guestName.value.trim(),
    location: els.guestLocation.value.trim(),
    notes: els.guestNotes.value.trim(),
    items: lines.map(line => ({ productId: line.product.id, quantity: line.quantity, notes: line.notes }))
  };

  els.submitOrderButton.disabled = true;
  els.submitOrderButton.textContent = 'Enviando...';

  try {
    const result = await apiPost(payload);
    if (!result.ok) throw new Error(result.error || 'No se pudo enviar');

    const guestOrder = Object.assign({}, result.order, {
      guestSessionId: result.order.guestSessionId || state.guestSessionId,
      guestPhone: result.order.guestPhone || state.guestPhone
    });
    state.history.unshift(guestOrder);
    state.history = state.history.slice(0, 10);
    localStorage.setItem(STORAGE.history, JSON.stringify(state.history));
    state.cart = {};
    state.ingredients = {};
    persistCart();
    if (els.guestNotes) els.guestNotes.value = '';
    hydrateGuestProfile();
    renderMenu();
    renderCart();
    renderHistory();
    requestGuestNotifications();
    startGuestStatusPolling();
    toast(`Pedido #${result.order.folio} enviado`);
  } catch (err) {
    toast(err.message || 'Error al enviar pedido');
  } finally {
    els.submitOrderButton.disabled = false;
    els.submitOrderButton.textContent = 'Enviar pedido';
  }
}

function unlockKitchen() {
  if (!els.kitchenDashboard) return;
  if (els.pinGate) els.pinGate.classList.add('hidden');
  els.kitchenDashboard.classList.remove('hidden');
  syncKitchen({ full: true });
  if (state.kitchenTimer) clearInterval(state.kitchenTimer);
  state.kitchenTimer = setInterval(() => syncKitchen({ full: false }), 5000);
}

async function syncKitchen({ full }) {
  if (!state.apiUrl) return openSettingsWithMessage('Configura la URL de Apps Script para usar cocina.');
  if (!els.ordersList) return;

  try {
    const since = full ? '' : state.lastOrdersSync;
    const data = await apiGet('orders', { updatedSince: since });
    if (!data.ok) throw new Error(data.error || 'No se pudo sincronizar');

    if (full) state.orders.clear();
    data.orders.forEach(order => state.orders.set(order.orderId, order));
    state.lastOrdersSync = data.serverTime || new Date().toISOString();
    els.lastSyncText.textContent = `Actualizado ${formatTime(state.lastOrdersSync)}`;
    renderOrders();

    const summary = await apiGet('summary');
    if (summary.ok) renderSummary(summary.summary);
  } catch (err) {
    toast(err.message || 'Error de sincronización');
  }
}

async function updateStatus(orderId, status) {
  try {
    const result = await apiPost({ action: 'updateStatus', orderId, status });
    if (!result.ok) throw new Error(result.error || 'No se pudo actualizar');
    state.orders.set(result.order.orderId, result.order);
    renderOrders();
    syncKitchen({ full: false });
    toast(`Pedido #${result.order.folio} actualizado`);
  } catch (err) {
    toast(err.message || 'Error al actualizar');
  }
}

async function updateAvailability(productId, available) {
  try {
    const result = await apiPost({ action: 'updateAvailability', productId, available });
    if (!result.ok) throw new Error(result.error || 'No se pudo cambiar disponibilidad');
    state.products = result.products;
    renderMenu();
    renderAvailability();
    toast('Disponibilidad actualizada');
  } catch (err) {
    toast(err.message || 'Error al actualizar disponibilidad');
    loadProducts();
  }
}

async function loadProducts() {
  renderConnection();
  if (!state.apiUrl) {
    state.products = DEFAULT_PRODUCTS;
    renderMenu();
    if (els.availabilityList) renderAvailability();
    return;
  }

  try {
    const data = await apiGet('products');
    if (!data.ok) throw new Error(data.error || 'No se pudo cargar el menú');
    state.products = Array.isArray(data.products) && data.products.length ? data.products : DEFAULT_PRODUCTS;
    renderConnection();
    renderMenu();
    if (els.availabilityList) renderAvailability();
  } catch (err) {
    els.connectionText.textContent = 'Usando menú local';
    toast(err.message || 'No se pudo cargar el menú');
  }
}

function startProductPolling() {
  if (state.productTimer) clearInterval(state.productTimer);
  state.productTimer = setInterval(loadProducts, 20000);
}

function startGuestStatusPolling() {
  if (state.guestStatusTimer) clearInterval(state.guestStatusTimer);
  syncGuestStatuses();
  state.guestStatusTimer = setInterval(syncGuestStatuses, 7000);
}

async function syncGuestStatuses() {
  if (!state.apiUrl) return;

  const ids = state.history
    .map(order => order.clientRequestId)
    .filter(Boolean)
    .slice(0, 10);
  const guestPhone = normalizePhone(state.guestPhone || localStorage.getItem(STORAGE.guestPhone) || '');
  if (!ids.length && !guestPhone) return;

  try {
    const data = await apiGet('guestOrders', {
      guestSessionId: state.guestSessionId,
      guestPhone,
      clientRequestIds: ids.join(',')
    });
    if (!data.ok || !Array.isArray(data.orders)) return;

    let changed = false;
    data.orders.forEach(remoteOrder => {
      const index = state.history.findIndex(order => {
        if (remoteOrder.orderId && order.orderId === remoteOrder.orderId) return true;
        return remoteOrder.clientRequestId && order.clientRequestId === remoteOrder.clientRequestId;
      });
      if (index === -1) {
        remoteOrder.attention = false;
        state.history.unshift(remoteOrder);
        changed = true;
        return;
      }

      const current = state.history[index];
      if (current.status && current.status !== remoteOrder.status) {
        remoteOrder.attention = true;
        notifyGuestStatus(remoteOrder);
      } else {
        remoteOrder.attention = current.attention || false;
      }

      state.history[index] = remoteOrder;
      changed = true;
    });

    if (changed) {
      state.history = filterGuestHistory(state.history, state.guestPhone, state.guestSessionId).slice(0, 20);
      localStorage.setItem(STORAGE.history, JSON.stringify(state.history));
      renderHistory();
    }
  } catch (err) {
    // El seguimiento de invitado es auxiliar; no debe interrumpir el pedido.
  }
}

function notifyGuestStatus(order) {
  const message = `Pedido #${order.folio}: ${statusMessage(order.status)}`;
  if (order.status === 'LISTO' || order.status === 'CANCELADO') {
    showStatusModal(order);
  } else {
    toast(message, 6200);
  }
  if (navigator.vibrate) navigator.vibrate([180, 90, 180]);

  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Fiesta Pedidos', {
      body: message,
      tag: `pedido-${order.orderId}`,
      icon: './assets/icon.svg'
    });
  }
}

function showStatusModal(order) {
  els.statusDialog.dataset.orderId = order.orderId || '';
  els.statusModalBadge.textContent = order.status || 'NUEVO';
  els.statusModalBadge.className = `status-badge status-${order.status || 'NUEVO'}`;
  els.statusModalTitle.textContent = `Pedido #${order.folio || ''}`;
  els.statusModalMessage.textContent = order.status === 'CANCELADO'
    ? 'Lo sentimos, tu pedido fue cancelado. Por favor acércate a la zona de alimentos para que podamos ayudarte.'
    : 'Tu pedido esta listo para entregar en la zona de alimentos.';

  if (els.statusDialog.open) els.statusDialog.close();
  els.statusDialog.showModal();
}

function requestGuestNotifications() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

async function apiGet(action, params = {}) {
  const url = new URL(state.apiUrl);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  });
  const response = await fetch(url.toString(), { method: 'GET' });
  return response.json();
}

async function apiPost(payload) {
  const response = await fetch(state.apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  return response.json();
}

function cartLines() {
  return Object.entries(state.cart).map(([productId, quantity]) => {
    const product = state.products.find(item => item.id === productId);
    return product ? { product, quantity, notes: ingredientSummary(productId) } : null;
  }).filter(Boolean);
}

function persistCart() {
  localStorage.setItem(STORAGE.cart, JSON.stringify(state.cart));
  localStorage.setItem(STORAGE.ingredients, JSON.stringify(state.ingredients));
}

function hydrateGuestProfile() {
  if (els.guestPhone) els.guestPhone.value = state.guestPhone || '';
  if (els.guestName) els.guestName.value = localStorage.getItem(STORAGE.guestName) || '';
  if (els.guestLocation) els.guestLocation.value = localStorage.getItem(STORAGE.guestLocation) || '';
}

function saveGuestProfile() {
  const previousPhone = state.guestPhone;
  const phone = normalizePhone(els.guestPhone ? els.guestPhone.value : state.guestPhone);
  if (phone) {
    state.guestPhone = phone;
    state.guestSessionId = sessionIdForPhone(phone);
    localStorage.setItem(STORAGE.guestPhone, phone);
    localStorage.setItem(STORAGE.guestSessionId, state.guestSessionId);
    if (phone !== previousPhone) {
      state.history = filterGuestHistory(readArray(STORAGE.history), phone, state.guestSessionId);
      localStorage.setItem(STORAGE.history, JSON.stringify(state.history));
      if (els.guestHistory) renderHistory();
    }
  }
  if (els.guestName) localStorage.setItem(STORAGE.guestName, els.guestName.value.trim());
  if (els.guestLocation) localStorage.setItem(STORAGE.guestLocation, els.guestLocation.value.trim());
}

function ensureDefaultIngredients(productId) {
  const options = getIngredientOptions(productId);
  if (!options.length || Array.isArray(state.ingredients[productId])) return;
  state.ingredients[productId] = options.slice();
}

function getSelectedIngredients(productId) {
  const options = getIngredientOptions(productId);
  if (!options.length) return [];
  if (!Array.isArray(state.ingredients[productId])) return options.slice();
  return state.ingredients[productId].filter(ingredient => options.includes(ingredient));
}

function updateIngredient(productId, ingredient, checked) {
  const selected = new Set(getSelectedIngredients(productId));
  if (checked) selected.add(ingredient);
  else selected.delete(ingredient);
  state.ingredients[productId] = Array.from(selected);
  persistCart();
  renderCart();
}

function ingredientSummary(productId) {
  const options = getIngredientOptions(productId);
  if (!options.length || !state.cart[productId]) return '';
  const selected = getSelectedIngredients(productId);
  const removed = options.filter(option => !selected.includes(option));
  if (selected.length === options.length) return 'Ingredientes: todos';
  if (!selected.length) return `Ingredientes: sin ingredientes. Quitar: ${options.join(', ')}`;
  return `Ingredientes: ${selected.join(', ')}. Quitar: ${removed.join(', ')}`;
}

function getIngredientOptions(productId) {
  const options = FOOD_INGREDIENTS[productId];
  return Array.isArray(options) ? options : [];
}

function productPhoto(product) {
  const known = [
    'hamburguesa',
    'hot-dog',
    'agua-ponche',
    'latte-natural',
    'latte-crema-irlandesa',
    'latte-vainilla'
  ];
  const id = known.includes(product.id) ? product.id : 'hamburguesa';
  return `./assets/photos/${id}.jpg`;
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch (err) {
    return fallback;
  }
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 15);
}

function sessionIdForPhone(phone) {
  return `phone-${normalizePhone(phone)}`;
}

function getInitialGuestSessionId() {
  const phone = normalizePhone(localStorage.getItem(STORAGE.guestPhone) || '');
  if (phone) {
    const id = sessionIdForPhone(phone);
    localStorage.setItem(STORAGE.guestSessionId, id);
    return id;
  }
  return getOrCreateGuestSessionId();
}

function filterGuestHistory(history, phoneValue, sessionIdValue) {
  const phone = normalizePhone(phoneValue || '');
  const sessionId = String(sessionIdValue || '').trim();
  return history.filter(order => {
    if (phone && normalizePhone(order.guestPhone) === phone) return true;
    return sessionId && order.guestSessionId === sessionId;
  });
}

function getOrCreateGuestSessionId() {
  const existing = localStorage.getItem(STORAGE.guestSessionId);
  if (existing) return existing;
  const id = crypto.randomUUID ? crypto.randomUUID() : `guest-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(STORAGE.guestSessionId, id);
  return id;
}

function readArray(key) {
  const value = readJson(key, []);
  return Array.isArray(value) ? value : [];
}

function readObject(key) {
  const value = readJson(key, {});
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function groupBy(items, key) {
  return items.reduce((acc, item) => {
    const group = item[key] || 'Otros';
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {});
}

function labelStatus(status) {
  return {
    NUEVO: 'Marcar nuevo',
    PREPARANDO: 'Preparar',
    LISTO: 'Listo',
    ENTREGADO: 'Entregar',
    CANCELADO: 'Cancelar'
  }[status] || status;
}

function categoryIcon(category) {
  return category === 'Alimentos' ? '🍔' : '🧋';
}

function updateBottomCartCount(total) {
  document.querySelectorAll('[data-cart-total]').forEach(item => {
    item.textContent = String(total);
    item.classList.toggle('hidden', total < 1);
  });
}

function statusMessage(status) {
  return {
    NUEVO: 'Tu pedido fue recibido',
    PREPARANDO: 'Tu pedido ya se esta preparando',
    LISTO: 'Tu pedido esta listo para entregar en la zona de alimentos',
    ENTREGADO: 'Tu pedido fue entregado',
    CANCELADO: 'Lo sentimos, tu pedido fue cancelado'
  }[status] || 'Pedido enviado';
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function openSettingsWithMessage(message) {
  toast(message);
  els.apiUrlInput.value = state.apiUrl;
  els.settingsDialog.showModal();
}

function toast(message, duration = 3200) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  window.clearTimeout(toast._timer);
  toast._timer = window.setTimeout(() => els.toast.classList.remove('show'), duration);
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}
