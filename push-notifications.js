(() => {
    const DEVICE_ID_KEY = 'grest_push_device_id_v1';
    const PREFERENCES_KEY = 'grest_push_preferences_v1';
    const DISMISSED_KEY = 'grest_push_prompt_dismissed_v1';
    const FUNCTION_NAME = 'push-notifications';
    const DEFAULT_PREFERENCES = Object.freeze({
        grestManager: true,
        grestActivities: true,
        grestNotices: true,
        grestLunchCount: true,
        saborActivities: true,
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
                    typeof stored[key] === 'boolean'
                        ? stored[key]
                        : key === 'saborActivities' && typeof stored.saborMeetings === 'boolean'
                            ? stored.saborMeetings
                            : DEFAULT_PREFERENCES[key]
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

    function getAnimatorId() {
        const value = Number(localStorage.getItem('selectedAnimatoreId'));
        return Number.isSafeInteger(value) && value > 0 ? value : null;
    }

    function base64UrlToBytes(value) {
        const padded = value + '='.repeat((4 - value.length % 4) % 4);
        const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
        const raw = atob(base64);
        return Uint8Array.from(raw, character => character.charCodeAt(0));
    }

    async function invokePushFunction(action, data = {}) {
        const client = window.grestSupabaseClient;
        if (!client?.functions?.invoke) {
            throw new Error('La libreria Supabase non è disponibile.');
        }

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

    function isMobileDevice() {
        return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    }

    function createActivationGuide(isIphone, onContinue, onClose) {
        const previousFocus = document.activeElement;
        const guide = document.createElement('div');
        guide.className = 'push-guide-backdrop';
        guide.innerHTML = `
            <section class="push-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="pushGuideTitle" tabindex="-1">
                <h2 id="pushGuideTitle">Come attivare le notifiche</h2>
                <p class="push-guide-first-step"><strong>Prima di iniziare:</strong> apri l’elenco delle schede e duplica questa pagina (se non trovi “Duplica”, non chiuderla). Lascia aperta questa scheda: potrai tornare qui senza rifare i passaggi.</p>
                ${isIphone ? `
                    <h3>🍏 iPhone</h3>
                    <ol>
                        <li>Apri questa pagina in <strong>Safari</strong>. Non usare Chrome o il browser interno di WhatsApp, Instagram o altre app.</li>
                        <li>Tocca <strong>Condividi</strong> (il quadrato con la freccia verso l’alto).</li>
                        <li>Scorri e scegli <strong>Aggiungi alla schermata Home</strong>, poi tocca <strong>Aggiungi</strong>.</li>
                        <li>Torna alla schermata Home e apri l’app dall’icona nuova. Se serve, fai di nuovo il login. Se non trovi il pulsante, apri <strong>Menu → Impostazioni</strong>.</li>
                        <li>In questa app premi <strong>Attiva notifiche</strong> e poi <strong>Consenti</strong>.</li>
                    </ol>
                ` : `
                    <h3>🤖 Android</h3>
                    <ol>
                        <li>Apri questa pagina con <strong>Google Chrome</strong> (consigliato) o Samsung Internet, non dentro WhatsApp o Instagram.</li>
                        <li>Fai il login con il tuo profilo animatore.</li>
                        <li>Premi <strong>Attiva notifiche</strong> e poi <strong>Consenti</strong> nel riquadro che compare.</li>
                        <li><strong>Facoltativo:</strong> in Chrome apri i tre puntini <strong>⋮</strong> e scegli <strong>Aggiungi a schermata Home</strong> o <strong>Installa app</strong>.</li>
                    </ol>
                `}
                <p class="push-guide-note" role="status" aria-live="polite"></p>
                <div class="push-guide-actions">
                    <button type="button" class="push-guide-cancel">Non ora</button>
                    <button type="button" class="push-guide-continue">Ho capito, continua</button>
                </div>
            </section>
        `;
        document.body.appendChild(guide);

        const dialog = guide.querySelector('.push-guide-dialog');
        const note = guide.querySelector('.push-guide-note');
        const cancelButton = guide.querySelector('.push-guide-cancel');
        const continueButton = guide.querySelector('.push-guide-continue');
        const closeGuide = () => {
            guide.remove();
            onClose();
            if (previousFocus instanceof HTMLElement) previousFocus.focus();
        };
        dialog.focus();

        cancelButton.addEventListener('click', closeGuide);
        guide.addEventListener('click', event => {
            if (event.target === guide) closeGuide();
        });
        guide.addEventListener('keydown', event => {
            if (event.key === 'Escape') closeGuide();
        });
        continueButton.addEventListener('click', async () => {
            if (isIphone && !isStandalone()) {
                note.textContent = 'Su iPhone le notifiche si attivano solo dall’app aperta con la nuova icona sulla schermata Home. Completa prima i passaggi sopra, apri quell’icona e riprova.';
                return;
            }
            closeGuide();
            await onContinue();
        });

        return guide;
    }

    function readPreferencesFromForm() {
        return Object.fromEntries(
            Object.keys(DEFAULT_PREFERENCES).map(key => [
                key,
                document.querySelector(`[data-push-category="${key}"]`)?.checked === true
            ])
        );
    }

    function setPreferencesDisabled(disabled) {
        document.querySelectorAll('#pushPreferences fieldset').forEach(fieldset => {
            fieldset.disabled = disabled;
        });
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
            const animatorStatus = document.getElementById('pushAnimatorStatus');
            if (animatorStatus) {
                animatorStatus.textContent = getAnimatorId()
                    ? 'Dispositivo associato all’account animatore selezionato.'
                    : 'Per ricevere la notifica “Gestore del gioco”, seleziona prima il tuo account animatore.';
            }
            populatePreferencesForm(readPreferences());
            const savePreferencesButton = document.getElementById('savePushPreferences');
            setPreferencesDisabled(false);
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

        if (isMobileDevice()) {
            button.addEventListener('click', event => {
                if (button.dataset.enabled === 'true' || button.dataset.guideConfirmed === 'true') return;
                event.stopImmediatePropagation();
                if (button.dataset.guideOpen === 'true') return;
                button.dataset.guideOpen = 'true';
                createActivationGuide(/iPhone|iPad|iPod/i.test(navigator.userAgent), async () => {
                    if (button.dataset.pushReady !== 'true') {
                        setStatus('Connessione non pronta. Ricarico la pagina: riprova ad attivare le notifiche tra poco.');
                        button.dataset.guideConfirmed = 'true';
                        button.click();
                        return;
                    }
                    button.dataset.guideConfirmed = 'true';
                    button.click();
                }, () => {
                    button.dataset.guideOpen = 'false';
                });
            }, true);
        }

        if (panel) {
            panel.querySelector('.push-notifications-dismiss').addEventListener('click', () => {
                localStorage.setItem(DISMISSED_KEY, '1');
                panel.remove();
            });
        }

        const savePreferencesButton = document.getElementById('savePushPreferences');
        if (settingsPage && savePreferencesButton) {
            savePreferencesButton.addEventListener('click', async () => {
                const preferences = readPreferencesFromForm();
                try {
                    saveLocalPreferences(preferences);
                    if (button.dataset.enabled === 'true') {
                        await invokePushFunction('preferences', {
                            deviceId: getDeviceId(),
                            preferences,
                            animatorId: getAnimatorId()
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
            setPreferencesDisabled(true);
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
                button.addEventListener('click', () => window.location.reload(), { once: true });
            }
            return;
        }

        if (!publicKey) {
            setStatus('Notifiche push non configurate sul server.');
            button.disabled = true;
            return;
        }
        button.dataset.pushReady = 'true';

        const subscription = await registration.pushManager.getSubscription();
        if (subscription && Notification.permission === 'granted') {
            try {
                await invokePushFunction('subscribe', {
                    deviceId: getDeviceId(),
                    subscription: subscription.toJSON(),
                    preferences: readPreferences(),
                    animatorId: getAnimatorId()
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
                    preferences: readPreferences(),
                    animatorId: getAnimatorId()
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
