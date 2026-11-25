(() => {
    const SUPABASE_URL = 'https://gjoxvtqcmqmnunewcsgg.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_liOVczDXHXYACezbKqzGyA_NFMy0DeG';
    const DEVICE_ID_KEY = 'grest_push_device_id_v1';
    const PREFERENCES_KEY = 'grest_push_preferences_v1';
    const DISMISSED_KEY = 'grest_push_prompt_dismissed_v1';
    const FUNCTION_NAME = 'push-notifications';
    const DEFAULT_PREFERENCES = Object.freeze({
        grestActivities: true,
        grestNotices: true,
        saborMeetings: true,
        saborNotices: true
    });

    const isStandalone = () =>
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;

    function supportsPush() {
        return window.isSecureContext &&
            'serviceWorker' in navigator &&
            'PushManager' in window &&
            'Notification' in window;
    }

    function readPreferences() {
        try {
            const stored = JSON.parse(localStorage.getItem(PREFERENCES_KEY) || '{}');
            return Object.fromEntries(
                Object.keys(DEFAULT_PREFERENCES).map(key => [
                    key,
                    typeof stored[key] === 'boolean' ? stored[key] : DEFAULT_PREFERENCES[key]
                ])
            );
        } catch (error) {
            console.error('Lettura preferenze notifiche non riuscita:', error);
            return { ...DEFAULT_PREFERENCES };
        }
    }

    function saveLocalPreferences(preferences) {
        localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    }

    function getDeviceId() {
        let deviceId = localStorage.getItem(DEVICE_ID_KEY);
        if (!deviceId) {
            deviceId = crypto.randomUUID();
            localStorage.setItem(DEVICE_ID_KEY, deviceId);
        }
        return deviceId;
    }

    function base64UrlToBytes(value) {
        const padded = value + '='.repeat((4 - value.length % 4) % 4);
        const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
        const raw = atob(base64);
        return Uint8Array.from(raw, character => character.charCodeAt(0));
    }

    async function invokePushFunction(action, data = {}) {
        if (!window.supabase?.createClient) {
            throw new Error('La libreria Supabase non è disponibile.');
        }

        const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        const { data: result, error } = await client.functions.invoke(FUNCTION_NAME, {
            body: { action, ...data }
        });
        if (error) throw error;
        if (result?.error) throw new Error(result.error);
        return result;
    }

    function createPanel() {
        const panel = document.createElement('aside');
        panel.className = 'push-notifications-panel';
        panel.setAttribute('aria-label', 'Notifiche push');
        panel.innerHTML = `
            <div class="push-notifications-copy">
                <strong class="push-notifications-title">Aggiornamenti sul telefono</strong>
                <p class="push-notifications-status" role="status" aria-live="polite"></p>
            </div>
            <button type="button" class="push-notifications-button">Attiva</button>
            <button type="button" class="push-notifications-dismiss" aria-label="Chiudi il messaggio notifiche" title="Chiudi">×</button>
        `;
        document.body.appendChild(panel);
        return {
            panel,
            status: panel.querySelector('.push-notifications-status'),
            button: panel.querySelector('.push-notifications-button'),
            dismiss: panel.querySelector('.push-notifications-dismiss')
        };
    }

    function readPreferencesFromForm() {
        return Object.fromEntries(
            Object.keys(DEFAULT_PREFERENCES).map(key => [
                key,
                document.querySelector(`[data-push-category="${key}"]`)?.checked === true
            ])
        );
    }

    function populatePreferencesForm(preferences) {
        Object.entries(preferences).forEach(([key, enabled]) => {
            const checkbox = document.querySelector(`[data-push-category="${key}"]`);
            if (checkbox) checkbox.checked = enabled;
        });
    }

    async function initialize() {
        const settingsPage = document.body.classList.contains('settings-page');
        let panel = null;
        let status;
        let button;

        if (settingsPage) {
            status = document.getElementById('pushPreferencesStatus');
            button = document.getElementById('pushSettingsToggle');
            populatePreferencesForm(readPreferences());
            const preferencesForm = document.getElementById('pushPreferences');
            const savePreferencesButton = document.getElementById('savePushPreferences');
            if (preferencesForm) preferencesForm.disabled = false;
            if (savePreferencesButton) savePreferencesButton.disabled = false;
        } else if (localStorage.getItem(DISMISSED_KEY) !== '1') {
            ({ panel, status, button } = createPanel());
        } else {
            return;
        }

        if (!status || !button) return;

        const setStatus = message => { status.textContent = message; };
        const setBusy = busy => {
            button.disabled = busy;
            button.setAttribute('aria-busy', String(busy));
        };

        if (panel) {
            panel.querySelector('.push-notifications-dismiss').addEventListener('click', () => {
                localStorage.setItem(DISMISSED_KEY, '1');
                panel.remove();
            });
        }

        const preferencesForm = document.getElementById('pushPreferences');
        const savePreferencesButton = document.getElementById('savePushPreferences');
        if (settingsPage && savePreferencesButton) {
            savePreferencesButton.addEventListener('click', async () => {
                const preferences = readPreferencesFromForm();
                try {
                    saveLocalPreferences(preferences);
                    if (button.dataset.enabled === 'true') {
                        await invokePushFunction('preferences', {
                            deviceId: getDeviceId(),
                            preferences
                        });
                        setStatus('Preferenze salvate e sincronizzate con questo dispositivo.');
                    } else {
                        setStatus('Preferenze salvate. Saranno applicate quando attivi le notifiche.');
                    }
                } catch (error) {
                    console.error('Salvataggio preferenze notifiche non riuscito:', error);
                    setStatus('Preferenze salvate sul dispositivo, ma non sincronizzate. Riprova.');
                }
            });
        }

        if (!supportsPush()) {
            setStatus('Le notifiche push non sono supportate qui. Usa HTTPS e un browser compatibile.');
            button.hidden = true;
            if (preferencesForm) preferencesForm.disabled = true;
            if (savePreferencesButton) savePreferencesButton.disabled = true;
            return;
        }

        button.disabled = true;
        let registration;
        let publicKey;
        try {
            [registration, { publicKey }] = await Promise.all([
                navigator.serviceWorker.register('./service-worker.js'),
                invokePushFunction('get-public-key')
            ]);
        } catch (error) {
            console.error('Inizializzazione notifiche push non riuscita:', error);
            setStatus('Notifiche non ancora configurate. Riprova più tardi.');
            if (!settingsPage) button.disabled = true;
            else {
                button.textContent = 'Riprova';
                button.disabled = false;
            }
            return;
        }

        if (!publicKey) {
            setStatus('Notifiche push non configurate sul server.');
            button.disabled = true;
            return;
        }

        const subscription = await registration.pushManager.getSubscription();
        if (subscription && Notification.permission === 'granted') {
            try {
                await invokePushFunction('subscribe', {
                    deviceId: getDeviceId(),
                    subscription: subscription.toJSON(),
                    preferences: readPreferences()
                });
                if (!settingsPage) {
                    panel.remove();
                    return;
                }
                setStatus('Notifiche attive su questo dispositivo.');
                button.textContent = 'Disattiva notifiche';
                button.dataset.enabled = 'true';
                button.disabled = false;
            } catch (error) {
                console.error('Aggiornamento iscrizione push non riuscito:', error);
                setStatus('Impossibile verificare l’iscrizione. Tocca per riprovare.');
                button.textContent = 'Riprova';
                button.disabled = false;
            }
        } else if (Notification.permission === 'denied') {
            setStatus('Notifiche bloccate dal browser. Riattivale dalle impostazioni del sito.');
            button.hidden = !settingsPage;
            button.disabled = true;
        } else {
            const isIphone = /iPhone|iPad|iPod/i.test(navigator.userAgent);
            setStatus(isIphone && !isStandalone()
                ? 'Su iPhone aggiungi prima il sito alla schermata Home, poi riaprilo da lì.'
                : 'Ricevi le attività e gli avvisi che selezioni nelle impostazioni.');
            button.textContent = 'Attiva notifiche';
            button.disabled = false;
        }

        button.addEventListener('click', async () => {
            setBusy(true);
            try {
                const current = await registration.pushManager.getSubscription();
                if (button.dataset.enabled === 'true' && current) {
                    await invokePushFunction('unsubscribe', { deviceId: getDeviceId() });
                    const removed = await current.unsubscribe();
                    if (!removed) throw new Error('Il browser non ha rimosso la sottoscrizione push.');
                    localStorage.removeItem(DEVICE_ID_KEY);
                    delete button.dataset.enabled;
                    button.textContent = 'Attiva notifiche';
                    setStatus('Notifiche disattivate su questo dispositivo.');
                    if (panel) panel.remove();
                    return;
                }

                if (Notification.permission !== 'granted') {
                    const permission = await Notification.requestPermission();
                    if (permission !== 'granted') {
                        setStatus(permission === 'denied'
                            ? 'Permesso negato. Puoi riattivare le notifiche dalle impostazioni del browser.'
                            : 'Permesso non concesso. Puoi riprovare quando vuoi.');
                        return;
                    }
                }

                const activeSubscription = current || await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: base64UrlToBytes(publicKey)
                });
                await invokePushFunction('subscribe', {
                    deviceId: getDeviceId(),
                    subscription: activeSubscription.toJSON(),
                    preferences: readPreferences()
                });
                localStorage.removeItem(DISMISSED_KEY);
                if (panel) {
                    panel.remove();
                    return;
                }
                button.dataset.enabled = 'true';
                button.textContent = 'Disattiva notifiche';
                setStatus('Notifiche attive su questo dispositivo.');
            } catch (error) {
                console.error('Attivazione notifiche push non riuscita:', error);
                setStatus('Non è stato possibile aggiornare le notifiche. Verifica la connessione e riprova.');
            } finally {
                setBusy(false);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
})();
