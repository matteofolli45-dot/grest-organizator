import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
const vapidSubject = Deno.env.get("VAPID_SUBJECT");
const allowedOrigin = Deno.env.get("APP_ORIGIN");
const webhookSecret = Deno.env.get("PUSH_WEBHOOK_SECRET");
const supabase = supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    })
    : null;

const defaultPreferences = {
    grestManager: true,
    grestActivities: true,
    grestNotices: true,
    grestLunchCount: true,
    saborActivities: true,
    saborNotices: true
};

type PushCategory = keyof typeof defaultPreferences;
type PushMessage = {
    title: string;
    body: string;
    url: string;
    category: PushCategory;
    targetAnimatorId?: number;
};

function jsonResponse(body: unknown, status: number, origin = "") {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-push-webhook-secret",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Vary": "Origin"
        }
    });
}

function toPushMessage(table: string, record: Record<string, unknown>, operation: string): PushMessage | null {
    const truncate = (value: unknown, maxLength = 150) => {
        const text = typeof value === "string" ? value.trim() : "";
        const characters = Array.from(text);
        return characters.length > maxLength
            ? `${characters.slice(0, maxLength - 1).join("")}…`
            : text;
    };

    if (table === "programmazione") {
        const details = [record.nome_attivita, record.fascia, record.data_attivita]
            .filter(value => typeof value === "string" && value.trim())
            .join(" · ");
        return {
            title: operation === "UPDATE" ? "Programmazione GREST aggiornata" : "Nuova attività GREST",
            body: truncate(details) || "È stata aggiornata la programmazione.",
            url: "./index.html",
            category: "grestActivities"
        };
    }

    if (table === "sabor_incontri") {
        const details = [record.titolo_attivita, record.data]
            .filter(value => typeof value === "string" && value.trim())
            .join(" · ");
        return {
            title: operation === "UPDATE"
                ? "Incontro Sabato Oratorio aggiornato"
                : "Nuovo incontro Sabato Oratorio",
            body: truncate(details) || "È stato pubblicato un nuovo incontro.",
            url: "./sabato_oratorio.html",
            category: "saborActivities"
        };
    }

    if (table === "avvisi" || table === "avvisi_sabor") {
        const isSabor = table === "avvisi_sabor";
        return {
            title: isSabor ? "Nuovo avviso Sabato Oratorio" : "Nuovo avviso GREST",
            body: truncate(record.testo) || "È stato pubblicato un nuovo avviso.",
            url: isSabor ? "./avvisi_sabor.html" : "./avvisi_grest.html",
            category: isSabor ? "saborNotices" : "grestNotices"
        };
    }

    if (table === "animatori" && record.gestisce_gioco === true &&
        typeof record.id_animatore === "number" &&
        typeof record.giorno_gioco === "string" &&
        typeof record.nome_gioco === "string") {
        return {
            title: "Gioco assegnato",
            body: `${record.nome_gioco} · ${record.giorno_gioco}`,
            url: "./index.html",
            category: "grestManager",
            targetAnimatorId: record.id_animatore
        };
    }

    return null;
}

async function deliverPush(
    message: PushMessage,
    targetAnimatorId?: number,
    suppressIfPreferenceEnabled?: PushCategory
) {
    if (!supabase || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
        console.error("Configurazione push server incompleta.");
        return jsonResponse({ error: "Configurazione push server incompleta." }, 503);
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    const { data: subscriptions, error } = await supabase
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth, preferences, id_animatore");
    if (error) {
        console.error("Lettura iscrizioni push non riuscita:", error);
        return jsonResponse({ error: "Impossibile caricare le iscrizioni push." }, 500);
    }

    const expiredIds: string[] = [];
    let delivered = 0;
    const subscribed = (subscriptions || []).filter(subscription => {
        const preferences = { ...defaultPreferences, ...(subscription.preferences || {}) } as Record<PushCategory, boolean>;
        return preferences[message.category] !== false &&
            (targetAnimatorId === undefined || Number(subscription.id_animatore) === targetAnimatorId) &&
            (!suppressIfPreferenceEnabled || preferences[suppressIfPreferenceEnabled] !== true);
    });
    const results = await Promise.allSettled(subscribed.map(async subscription => {
        try {
            await webpush.sendNotification({
                endpoint: subscription.endpoint,
                keys: { p256dh: subscription.p256dh, auth: subscription.auth }
            }, JSON.stringify(message), { TTL: 86400 });
            delivered += 1;
        } catch (error) {
            const statusCode = typeof error === "object" && error !== null && "statusCode" in error
                ? Number(error.statusCode)
                : 0;
            if (statusCode === 404 || statusCode === 410) expiredIds.push(subscription.id);
            else console.error("Invio push non riuscito:", statusCode || error);
        }
    }));

    const rejected = results.filter(result => result.status === "rejected");
    if (rejected.length) console.error(`${rejected.length} invii push non completati.`);

    if (expiredIds.length) {
        const { error: deleteError } = await supabase
            .from("push_subscriptions")
            .delete()
            .in("id", expiredIds);
        if (deleteError) console.error("Pulizia iscrizioni push scadute non riuscita:", deleteError);
    }

    return jsonResponse({ sent: delivered }, 200);
}

function getProgrammazioneWeekday(value: unknown) {
    if (typeof value !== "string") return null;
    let year: number;
    let month: number;
    let day: number;
    const isoDate = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const italianDate = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (isoDate) {
        year = Number(isoDate[1]);
        month = Number(isoDate[2]);
        day = Number(isoDate[3]);
    } else if (italianDate) {
        day = Number(italianDate[1]);
        month = Number(italianDate[2]);
        year = Number(italianDate[3]);
    } else {
        return null;
    }

    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        return null;
    }
    return new Intl.DateTimeFormat("it-IT", { weekday: "long", timeZone: "UTC" }).format(date);
}

function normalizeText(value: unknown) {
    return typeof value === "string"
        ? value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
        : "";
}

async function notifyAssignedGameManagers(record: Record<string, unknown>, operation: string, activityBody: string) {
    if (!supabase) return;
    const activityName = normalizeText(record.nome_attivita);
    const activityDay = normalizeText(getProgrammazioneWeekday(record.data_attivita));
    if (!activityName || !activityDay) return;

    const { data: managers, error } = await supabase
        .from("animatori")
        .select("id_animatore, giorno_gioco, nome_gioco")
        .eq("gestisce_gioco", true);
    if (error) {
        console.error("Lettura assegnatari del gioco non riuscita:", error);
        throw new Error("Impossibile caricare gli assegnatari del gioco.");
    }

    await Promise.all((managers || [])
        .filter(manager => {
            const assignedGame = normalizeText(manager.nome_gioco);
            return normalizeText(manager.giorno_gioco) === activityDay &&
                assignedGame &&
                (activityName.includes(assignedGame) || assignedGame.includes(activityName));
        })
        .map(manager => deliverPush({
            title: operation === "UPDATE" ? "Gioco GREST aggiornato" : "Gioco GREST programmato",
            body: activityBody,
            url: "./index.html",
            category: "grestManager",
            targetAnimatorId: manager.id_animatore
        }, manager.id_animatore, "grestActivities")));
}

function getRomeDateTime(date: Date) {
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Rome",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
    }).formatToParts(date);
    const value = (type: string) => parts.find(part => part.type === type)?.value || "";
    return {
        date: `${value("year")}-${value("month")}-${value("day")}`,
        weekday: value("weekday"),
        hour: Number(value("hour")),
        minute: Number(value("minute"))
    };
}

async function sendLunchDigest() {
    if (!supabase) return jsonResponse({ error: "Configurazione database incompleta." }, 503);

    const romeNow = getRomeDateTime(new Date());
    if (romeNow.hour !== 9 || romeNow.minute !== 15 || romeNow.weekday === "Sat" || romeNow.weekday === "Sun") {
        return jsonResponse({ sent: 0, skipped: "outside-schedule" }, 200);
    }

    const { data: schedule, error: scheduleError } = await supabase
        .from("grest_push_schedule")
        .select("start_date, end_date")
        .eq("id", 1)
        .maybeSingle();
    if (scheduleError) {
        console.error("Lettura periodo GREST non riuscita:", scheduleError);
        return jsonResponse({ error: "Impossibile leggere il periodo GREST." }, 500);
    }
    if (!schedule?.start_date || !schedule?.end_date ||
        romeNow.date < schedule.start_date || romeNow.date > schedule.end_date) {
        return jsonResponse({ sent: 0, skipped: "outside-grest-period" }, 200);
    }

    const { count, error: presenceError } = await supabase
        .from("presenze")
        .select("id_presenza", { count: "exact", head: true })
        .eq("data", romeNow.date)
        .eq("pranzo", "si");
    if (presenceError) {
        console.error("Conteggio mensa non riuscito:", presenceError);
        return jsonResponse({ error: "Impossibile calcolare il totale mensa." }, 500);
    }

    const { error: dispatchError } = await supabase
        .from("grest_lunch_push_dispatches")
        .insert({ dispatch_date: romeNow.date });
    if (dispatchError) {
        if (dispatchError.code === "23505") {
            return jsonResponse({ sent: 0, skipped: "already-sent" }, 200);
        }
        console.error("Registrazione notifica mensa non riuscita:", dispatchError);
        return jsonResponse({ error: "Impossibile registrare la notifica mensa." }, 500);
    }

    return await deliverPush({
        title: "Totale persone a mensa",
        body: `Oggi sono previste ${count || 0} persone a mensa.`,
        url: "./appello.html",
        category: "grestLunchCount"
    });
}

async function sendPush(payload: Record<string, unknown>) {
    if (payload.table === "grest_lunch_digest") return await sendLunchDigest();

    const table = typeof payload.table === "string" ? payload.table : "";
    const operation = typeof payload.operation === "string" ? payload.operation : "INSERT";
    const record = payload.record && typeof payload.record === "object"
        ? payload.record as Record<string, unknown>
        : {};
    const message = toPushMessage(table, record, operation);
    if (!message) return jsonResponse({ error: "Tipo di notifica non supportato." }, 400);
    const response = await deliverPush(message, message.targetAnimatorId);
    if (table === "programmazione") {
        await notifyAssignedGameManagers(record, operation, message.body);
    }
    return response;
}

Deno.serve(async request => {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") {
        if (!allowedOrigin || origin !== allowedOrigin) return new Response(null, { status: 403 });
        return new Response("ok", {
            headers: {
                "Access-Control-Allow-Origin": allowedOrigin,
                "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-push-webhook-secret",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Vary": "Origin"
            }
        });
    }

    if (request.method !== "POST") return jsonResponse({ error: "Metodo non supportato." }, 405, origin);

    const receivedWebhookSecret = request.headers.get("x-push-webhook-secret");
    if (webhookSecret && receivedWebhookSecret === webhookSecret) {
        try {
            return await sendPush(await request.json());
        } catch (error) {
            console.error("Elaborazione webhook push non riuscita:", error);
            return jsonResponse({ error: "Elaborazione webhook push non riuscita." }, 500);
        }
    }

    if (!allowedOrigin || origin !== allowedOrigin) {
        return jsonResponse({ error: "Origine non autorizzata." }, 403);
    }
    if (!request.headers.get("apikey")) {
        return jsonResponse({ error: "Chiave applicazione non valida." }, 401, allowedOrigin);
    }

    try {
        const { action, deviceId, subscription, preferences, animatorId } = await request.json();
        if (action === "get-public-key") {
            return jsonResponse({ publicKey: vapidPublicKey || null }, 200, origin);
        }

        if (!supabase) return jsonResponse({ error: "Configurazione database incompleta." }, 503, origin);

        if (animatorId !== null && animatorId !== undefined &&
            (!Number.isSafeInteger(animatorId) || animatorId <= 0)) {
            return jsonResponse({ error: "Account animatore non valido." }, 400, origin);
        }

        if (action === "subscribe") {
            if (typeof deviceId !== "string" || !/^[0-9a-f-]{36}$/i.test(deviceId)) {
                return jsonResponse({ error: "Identificativo dispositivo non valido." }, 400, origin);
            }
            if (!subscription || typeof subscription.endpoint !== "string" ||
                typeof subscription.keys?.p256dh !== "string" ||
                typeof subscription.keys?.auth !== "string" ||
                subscription.endpoint.length > 4096 ||
                subscription.keys.p256dh.length > 200 ||
                subscription.keys.auth.length > 100) {
                return jsonResponse({ error: "Sottoscrizione push non valida." }, 400, origin);
            }
            const endpointUrl = new URL(subscription.endpoint);
            const host = endpointUrl.hostname.toLowerCase();
            const allowedPushHost = host === "fcm.googleapis.com" ||
                host === "web.push.apple.com" ||
                host === "push.services.mozilla.com" ||
                host.endsWith(".push.services.mozilla.com") ||
                host.endsWith(".notify.windows.com");
            if (endpointUrl.protocol !== "https:" || !allowedPushHost) {
                return jsonResponse({ error: "Endpoint push non valido." }, 400, origin);
            }

            const { error } = await supabase.from("push_subscriptions").upsert({
                id: deviceId,
                endpoint: subscription.endpoint,
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth,
                preferences: normalizePreferences(preferences),
                id_animatore: typeof animatorId === "number" ? animatorId : null,
                updated_at: new Date().toISOString()
            }, { onConflict: "endpoint" });
            if (error) {
                console.error("Salvataggio iscrizione push non riuscito:", error);
                return jsonResponse({ error: "Impossibile salvare l’iscrizione push." }, 500, origin);
            }
            return jsonResponse({ subscribed: true }, 200, origin);
        }

        if (action === "preferences") {
            if (typeof deviceId !== "string" || !/^[0-9a-f-]{36}$/i.test(deviceId)) {
                return jsonResponse({ error: "Identificativo dispositivo non valido." }, 400, origin);
            }
            if (!isValidPreferences(preferences)) {
                return jsonResponse({ error: "Preferenze notifiche non valide." }, 400, origin);
            }
            const updates: Record<string, unknown> = {
                preferences,
                updated_at: new Date().toISOString()
            };
            if (animatorId !== undefined) {
                updates.id_animatore = animatorId;
            }
            const { error } = await supabase
                .from("push_subscriptions")
                .update(updates)
                .eq("id", deviceId);
            if (error) {
                console.error("Aggiornamento preferenze push non riuscito:", error);
                return jsonResponse({ error: "Impossibile aggiornare le preferenze." }, 500, origin);
            }
            return jsonResponse({ preferences }, 200, origin);
        }

        if (action === "unsubscribe") {
            if (typeof deviceId !== "string" || !/^[0-9a-f-]{36}$/i.test(deviceId)) {
                return jsonResponse({ error: "Identificativo dispositivo non valido." }, 400, origin);
            }
            const { error } = await supabase.from("push_subscriptions").delete().eq("id", deviceId);
            if (error) {
                console.error("Rimozione iscrizione push non riuscita:", error);
                return jsonResponse({ error: "Impossibile rimuovere l’iscrizione push." }, 500, origin);
            }
            return jsonResponse({ subscribed: false }, 200, origin);
        }

        return jsonResponse({ error: "Azione non supportata." }, 400, origin);
    } catch (error) {
        console.error("Richiesta push non valida:", error);
        return jsonResponse({ error: "Richiesta push non valida." }, 400, origin);
    }
});

function isValidPreferences(value: unknown): value is Record<PushCategory, boolean> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const preferences = value as Record<string, unknown>;
    return Object.keys(defaultPreferences).every(key => typeof preferences[key] === "boolean") &&
        Object.keys(preferences).every(key => key in defaultPreferences);
}

function normalizePreferences(value: unknown): Record<PushCategory, boolean> {
    if (!isValidPreferences(value)) return { ...defaultPreferences };
    return { ...value };
}
