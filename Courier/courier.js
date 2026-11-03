
document.addEventListener('DOMContentLoaded', () => {
    const API = 'courier_api.php';
    const $ = id => document.getElementById(id);

    const queueGrid = $('queueGrid');
    const mineGrid = $('mineGrid');
    const queueEmpty = $('queueEmpty');
    const mineEmpty = $('mineEmpty');
    const locationFilter = $('qLoc');
    const queueView = $('view-queue');
    const mineView = $('view-mine');
    const navLinks = document.querySelectorAll('.sidebar nav a');

    // Create the completion modal using the existing CSS classes.
    if (!$('completeModal')) {
        document.body.insertAdjacentHTML('beforeend', `
            <div id="completeModal" class="modal-overlay" hidden>
                <div class="delivery-modal" role="dialog"
                     aria-modal="true" aria-labelledby="modalTitle">

                    <div class="modal-header">
                        <h2 id="modalTitle">Complete delivery</h2>
                        <button type="button" id="closeModal"
                                class="close-modal">Close</button>
                    </div>

                    <p class="modal-description">
                        Ask the recipient to show their claim code
                        at the drop-off point.
                    </p>

                    <form id="completeDeliveryForm">
                        <label for="claimCode">Claim code</label>
                        <input id="claimCode" maxlength="10"
                               required autocomplete="off"
                               style="text-transform:uppercase">

                        <div class="modal-form-row">
                            <div class="modal-field">
                                <label for="distanceTravelled">
                                    Distance travelled (km)
                                </label>
                                <input id="distanceTravelled"
                                       type="number" min="0.1"
                                       step="0.1" value="1" required>
                            </div>

                            <div class="modal-field">
                                <label for="transportMode">
                                    Transport mode
                                </label>
                                <select id="transportMode" required>
                                    <option value="walking">Walking</option>
                                    <option value="cycling">Cycling</option>
                                    <option value="public_transport">
                                        Public transport
                                    </option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                        </div>

                        <p id="modalError" class="modal-error"
                           role="alert" hidden></p>

                        <button type="submit"
                                class="confirm-delivery-btn">
                            Confirm delivery
                        </button>
                    </form>
                </div>
            </div>
        `);
    }

    let queueRows = [];
    let mineRows = [];
    let courier = null;
    let currentDeliveryId = null;
    let toastTimer = null;

    // Read the user ID stored by the existing login page, if available.
    function storedUser() {
        const keys = [
            'sharebite_user',
            'currentUser',
            'user',
            'loggedInUser'
        ];

        for (const key of keys) {
            for (const storage of [sessionStorage, localStorage]) {
                try {
                    const value = storage.getItem(key);
                    if (!value) continue;

                    const parsed = JSON.parse(value);

                    if (parsed && typeof parsed === 'object') {
                        return parsed.user || parsed;
                    }
                } catch (_) {}
            }
        }

        for (const storage of [sessionStorage, localStorage]) {
            const rawId =
                storage.getItem('user_id') ||
                storage.getItem('userId') ||
                storage.getItem('currentUserId');

            if (rawId && /^\d+$/.test(rawId)) {
                return {
                    user_id: Number(rawId),
                    id: Number(rawId)
                };
            }
        }

        return null;
    }

    function getCourierId() {
        const user = courier || storedUser();

        if (!user) return null;

        return Number(
            user.user_id ??
            user.userId ??
            user.id ??
            user.uid
        ) || null;
    }

    // Communicate with the PHP API.
    async function api(action, data = null) {
        const url =
            `${API}?action=${encodeURIComponent(action)}`;

        const options = {
            method: data ? 'POST' : 'GET',
            headers: {
                'Accept': 'application/json'
            },
            credentials: 'same-origin'
        };

        if (data) {
            options.headers['Content-Type'] = 'application/json';

            options.body = JSON.stringify({
                ...data,
                courier_id: getCourierId()
            });
        } else if (getCourierId()) {
            options.headers['X-Courier-ID'] =
                String(getCourierId());
        }

        const response = await fetch(url, options);

        let result;

        try {
            result = await response.json();
        } catch (_) {
            throw new Error(
                'The server did not return JSON. Check Apache, PHP and the localhost URL.'
            );
        }

        if (!response.ok || !result.success) {
            throw new Error(
                result.message || 'Request failed.'
            );
        }

        return result;
    }

    function esc(value) {
        return String(value ?? '').replace(
            /[&<>"']/g,
            ch => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            })[ch]
        );
    }

    function dateText(value) {
        if (!value) return 'Not recorded';

        const date = new Date(
            String(value).replace(' ', 'T')
        );

        return Number.isNaN(date.getTime())
            ? esc(value)
            : date.toLocaleString();
    }

    function locationText(row, prefix) {
        const name =
            row[`${prefix}_location`] || 'Unknown location';

        const building = row[`${prefix}_building`];

        return building
            ? `${name} (${building})`
            : name;
    }

    function statusLabel(status) {
        return {
            awaiting_courier: 'Waiting for courier',
            assigned: 'Accepted',
            picked_up: 'Picked up',
            en_route: 'On the way',
            delivered: 'Delivered'
        }[status] || status;
    }

    function statusPill(status) {
        return `
            <span class="status-pill status-${esc(status)}">
                ${esc(statusLabel(status))}
            </span>
        `;
    }

    function showToast(message, error = false) {
        let element = $('courierToast');

        if (!element) {
            element = document.createElement('div');
            element.id = 'courierToast';
            element.setAttribute('role', 'status');

            element.style.cssText = `
                position:fixed;
                right:24px;
                bottom:24px;
                z-index:1200;
                max-width:360px;
                padding:12px 18px;
                border-radius:10px;
                color:#fff;
                box-shadow:0 8px 24px rgba(0,0,0,.18);
            `;

            document.body.appendChild(element);
        }

        element.style.background =
            error ? '#8b2525' : '#204b32';

        element.textContent = message;
        element.hidden = false;

        clearTimeout(toastTimer);

        toastTimer = setTimeout(() => {
            element.hidden = true;
        }, 4000);
    }

    // Switch between the delivery queue and personal deliveries.
    function showView(view) {
        queueView.style.display =
            view === 'queue' ? '' : 'none';

        mineView.style.display =
            view === 'mine' ? '' : 'none';

        navLinks.forEach(link => {
            link.classList.toggle(
                'active',
                link.dataset.view === view
            );
        });

        if (view === 'queue') {
            loadQueue();
        } else {
            loadMine();
        }
    }

    navLinks.forEach(link => {
        link.addEventListener('click', event => {
            event.preventDefault();
            showView(link.dataset.view);
        });
    });

    $('logoutLink')?.addEventListener('click', async event => {
    event.preventDefault();
    window.location.replace('/Assigment/Assigment/LogIn_SignUp/index.html');
    });

    locationFilter.addEventListener('change', renderQueue);

    // Load locations from the database.
    async function loadLocations() {
        const result = await api('locations');
        const locations = result.data || [];

        locationFilter
            .querySelectorAll('option:not(:first-child)')
            .forEach(option => option.remove());

        locations.forEach(location => {
            const label = location.building
                ? `${location.name} (${location.building})`
                : location.name;

            locationFilter.add(
                new Option(label, location.id)
            );
        });
    }

    // Load available deliveries.
    async function loadQueue() {
        queueGrid.innerHTML =
            '<p class="loading">Loading available deliveries…</p>';

        try {
            const result = await api('queue');

            queueRows = result.data || [];

            renderQueue();
        } catch (error) {
            queueRows = [];
            queueGrid.innerHTML = '';

            queueEmpty.style.display = 'block';
            queueEmpty.querySelector('p').textContent =
                error.message;
        }
    }

    function renderQueue() {
        const selected = Number(locationFilter.value) || 0;

        const rows = queueRows.filter(row => {
            return !selected ||
                Number(row.location_id) === selected ||
                Number(row.dropoff_location_id) === selected;
        });

        queueGrid.innerHTML = '';

        queueEmpty.style.display =
            rows.length ? 'none' : 'block';

        if (!rows.length) return;

        rows.forEach(row => {
            const card = document.createElement('article');
            card.className = 'listing-card';

            card.innerHTML = `
                <div class="body">
                    <h3>${esc(row.title)}</h3>

                    <p class="kv">
                        <b>${esc(row.portions)}</b> portions
                        · approx.
                        <b>${esc(row.estimated_kg)}</b> kg
                    </p>

                    <p class="kv">
                        Category:
                        <b>${esc(row.category || 'Food')}</b>
                    </p>

                    <p class="kv">
                        Pick up:
                        <b>${esc(locationText(row, 'pickup'))}</b>
                    </p>

                    <p class="kv">
                        Drop off:
                        <b>${esc(locationText(row, 'dropoff'))}</b>
                    </p>

                    <p class="kv">
                        Recipient:
                        ${esc(row.recipient_name || 'Recipient')}
                        · Deadline ${dateText(row.expiry_time)}
                    </p>

                    <div class="actions">
                        <button type="button"
                                data-accept="${Number(row.delivery_id)}">
                            Accept delivery
                        </button>
                    </div>
                </div>
            `;

            queueGrid.appendChild(card);
        });

        queueGrid.querySelectorAll('[data-accept]')
            .forEach(button => {
                button.addEventListener('click', async () => {
                    button.disabled = true;
                    button.textContent = 'Accepting…';

                    try {
                        await api('accept', {
                            delivery_id:
                                Number(button.dataset.accept)
                        });

                        showToast('Delivery accepted.');

                        await Promise.all([
                            loadQueue(),
                            loadMine()
                        ]);
                    } catch (error) {
                        showToast(error.message, true);

                        button.disabled = false;
                        button.textContent = 'Accept delivery';
                    }
                });
            });
    }

    // Load the current courier's deliveries.
    async function loadMine() {
        mineGrid.innerHTML =
            '<p class="loading">Loading your deliveries…</p>';

        try {
            const result = await api('mine');

            mineRows = result.data || [];
            courier = result.courier || courier;

            if ($('sideUser') && courier?.name) {
                $('sideUser').textContent = courier.name;
            }

            renderMine();
        } catch (error) {
            mineRows = [];
            mineGrid.innerHTML = '';

            mineEmpty.style.display = 'block';
            mineEmpty.querySelector('p').textContent =
                error.message;

            updateStats({
                completed: 0,
                in_progress: 0,
                km: 0
            });
        }
    }

    function updateStats(stats) {
        $('sDone').textContent = stats.completed ?? 0;
        $('sProg').textContent = stats.in_progress ?? 0;
        $('sKm').textContent =
            Number(stats.km ?? 0).toFixed(1);
    }

    function renderMine() {
        mineGrid.innerHTML = '';

        mineEmpty.style.display =
            mineRows.length ? 'none' : 'block';

        const stats = {
            completed: 0,
            in_progress: 0,
            km: 0
        };

        mineRows.forEach(delivery => {
            if (delivery.delivery_status === 'delivered') {
                stats.completed++;

                stats.km += Number(
                    delivery.distance_km || 0
                );
            } else {
                stats.in_progress++;
            }
        });

        updateStats(stats);

        mineRows.forEach(row => {
            let action = '';

            if (row.delivery_status === 'assigned') {
                action = `
                    <button type="button"
                            data-next="picked_up"
                            data-id="${Number(row.delivery_id)}">
                        Mark picked up
                    </button>
                `;
            } else if (row.delivery_status === 'picked_up') {
                action = `
                    <button type="button"
                            data-next="en_route"
                            data-id="${Number(row.delivery_id)}">
                        Mark en route
                    </button>
                `;
            } else if (row.delivery_status === 'en_route') {
                action = `
                    <button type="button"
                            data-complete="${Number(row.delivery_id)}">
                        Complete delivery
                    </button>
                `;
            }

            const extra =
                row.delivery_status === 'delivered'
                    ? `
                        <p class="kv">
                            Delivered ${dateText(row.delivered_at)}
                            · <b>${esc(row.distance_km)} km</b>
                            by ${esc(
                                String(row.transport_mode || '')
                                    .replaceAll('_', ' ')
                            )}
                        </p>
                    `
                    : '';

            const card = document.createElement('article');
            card.className = 'card listing-card';

            card.innerHTML = `
                <div class="body">
                    <h3>${esc(row.title)}</h3>

                    <p class="kv">
                        ${esc(row.portions)} portions
                        · approx. ${esc(row.estimated_kg)} kg
                    </p>

                    <p class="kv">
                        ${esc(locationText(row, 'pickup'))}
                        →
                        <b>${esc(locationText(row, 'dropoff'))}</b>
                    </p>

                    <p class="kv">
                        Recipient:
                        ${esc(row.recipient_name || 'Recipient')}
                    </p>

                    <p>${statusPill(row.delivery_status)}</p>

                    <p class="kv">
                        Accepted ${dateText(row.assigned_at)}
                        ${row.picked_up_at
                            ? ` · picked up ${dateText(row.picked_up_at)}`
                            : ''}
                    </p>

                    ${extra}

                    <div class="actions" style="margin-top:.6em">
                        ${action}
                    </div>
                </div>
            `;

            mineGrid.appendChild(card);
        });

        mineGrid.querySelectorAll('[data-next]')
            .forEach(button => {
                button.addEventListener('click', async () => {
                    button.disabled = true;

                    try {
                        await api('status', {
                            delivery_id: Number(button.dataset.id),
                            status: button.dataset.next === 'picked_up'
                                ? 'assigned'
                                : 'picked_up'
                        });

                        showToast('Delivery status updated.');

                        await loadMine();
                    } catch (error) {
                        showToast(error.message, true);
                        button.disabled = false;
                    }
                });
            });

        mineGrid.querySelectorAll('[data-complete]')
            .forEach(button => {
                button.addEventListener('click', () => {
                    openComplete(
                        Number(button.dataset.complete)
                    );
                });
            });
    }

    // Open the completion modal.
    function openComplete(deliveryId) {
        currentDeliveryId = deliveryId;

        $('claimCode').value = '';
        $('distanceTravelled').value = '1';
        $('transportMode').value = 'walking';
        $('modalError').hidden = true;

        $('completeModal').hidden = false;
        $('claimCode').focus();
    }

    function closeModal() {
        $('completeModal').hidden = true;
        currentDeliveryId = null;
    }

    $('closeModal').addEventListener('click', closeModal);

    $('completeModal').addEventListener('click', event => {
        if (event.target === $('completeModal')) {
            closeModal();
        }
    });

    document.addEventListener('keydown', event => {
        if (
            event.key === 'Escape' &&
            !$('completeModal').hidden
        ) {
            closeModal();
        }
    });

    // Submit completion details to PHP and update the database.
    $('completeDeliveryForm')
        .addEventListener('submit', async event => {
            event.preventDefault();

            if (!currentDeliveryId) return;

            const error = $('modalError');
            error.hidden = true;

            const distance =
                Number($('distanceTravelled').value);

            if (!Number.isFinite(distance) || distance <= 0) {
                error.textContent =
                    'Enter a distance greater than zero.';

                error.hidden = false;
                return;
            }

            const submit = $('completeDeliveryForm')
                .querySelector('[type="submit"]');

            submit.disabled = true;

            try {
                await api('complete', {
                    delivery_id: currentDeliveryId,
                    claim_code: $('claimCode').value
                        .trim()
                        .toUpperCase(),
                    distance_km: distance,
                    transport_mode: $('transportMode').value
                });

                closeModal();

                showToast('Delivery completed successfully.');

                await loadMine();
            } catch (err) {
                error.textContent = err.message;
                error.hidden = false;
            } finally {
                submit.disabled = false;
            }
        });

    // Initial page setup.
    (async () => {
        try {
            await loadLocations();
        } catch (error) {
            showToast(error.message, true);
        }

        showView('queue');

        // Refresh the queue every 30 seconds.
        setInterval(() => {
            if (
                $('completeModal').hidden &&
                queueView.style.display !== 'none'
            ) {
                loadQueue();
            }
        }, 30000);
    })();
});
