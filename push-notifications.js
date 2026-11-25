(() => {
    const SUPABASE_URL = 'https://gjoxvtqcmqmnunewcsgg.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_liOVczDXHXYACezbKqzGyA_NFMy0DeG';
    const DEVICE_ID_KEY = 'grest_push_device_id_v1';
    const FUNCTION_NAME = 'push-notifications';

    const isStandalone = () =>
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;

    function supportsPush() {
        return window.isSecureContext &&
            'serviceWorker' in navigator &&
            'PushManager' in window &&
            'Notification' in window;
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
        `;
        document.body.appendChild(panel);
        return {
            status: panel.querySelector('.push-notifications-status'),
            button: panel.querySelector('.push-notifications-button')
        };
    }

    async function initialize() {
        const { status, button } = createPanel();
        button.disabled = true;
        const setStatus = message => { status.textContent = message; };
        const setBusy = busy => {
            button.disabled = busy;
            button.setAttribute('aria-busy', String(busy));
        };

        if (!supportsPush()) {
            setStatus('Le notifiche push non sono supportate qui. Usa il sito su HTTPS con un browser compatibile.');
            button.hidden = true;
            return;
        }

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
            button.disabled = true;
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
                    subscription: subscription.toJSON()
                });
                setStatus('Riceverai gli avvisi e le nuove attività.');
                button.textContent = 'Disattiva';
                button.dataset.enabled = 'true';
            } catch (error) {
                console.error('Aggiornamento iscrizione push non riuscito:', error);
                setStatus('Impossibile verificare l’iscrizione. Tocca per riprovare.');
                button.textContent = 'Riprova';
                button.disabled = false;
            }
        } else if (Notification.permission === 'denied') {
            setStatus('Notifiche bloccate dal browser. Riattivale dalle impostazioni del sito.');
        } else {
            const isIphone = /iPhone|iPad|iPod/i.test(navigator.userAgent);
            setStatus(isIphone && !isStandalone()
                ? 'Su iPhone aggiungi prima il sito alla schermata Home, poi riaprilo da lì.'
                : 'Ricevi sul dispositivo le nuove attività GREST e gli avvisi di entrambi i progetti.');
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
                    subscription: activeSubscription.toJSON()
                });
                button.dataset.enabled = 'true';
                button.textContent = 'Disattiva';
                setStatus('Notifiche attive: riceverai gli avvisi e le nuove attività.');
            } catch (error) {
                console.error('Attivazione notifiche push non riuscita:', error);
                setStatus('Non è stato possibile attivare le notifiche. Verifica la connessione e riprova.');
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
