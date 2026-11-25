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

function toPushMessage(table: string, record: Record<string, unknown>, operation: string) {
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
            url: "./index.html"
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
            url: "./sabato_oratorio.html"
        };
    }

    if (table === "avvisi" || table === "avvisi_sabor") {
        const isSabor = table === "avvisi_sabor";
        return {
            title: isSabor ? "Nuovo avviso Sabato Oratorio" : "Nuovo avviso GREST",
            body: truncate(record.testo) || "È stato pubblicato un nuovo avviso.",
            url: isSabor ? "./avvisi_sabor.html" : "./avvisi_grest.html"
        };
    }

    return null;
}

async function sendPush(payload: Record<string, unknown>) {
    const table = typeof payload.table === "string" ? payload.table : "";
    const operation = typeof payload.operation === "string" ? payload.operation : "INSERT";
    const record = payload.record && typeof payload.record === "object"
        ? payload.record as Record<string, unknown>
        : {};
    const message = toPushMessage(table, record, operation);
    if (!message) return jsonResponse({ error: "Tipo di notifica non supportato." }, 400);

    if (!supabase || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
        console.error("Configurazione push server incompleta.");
        return jsonResponse({ error: "Configurazione push server incompleta." }, 503);
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    const { data: subscriptions, error } = await supabase
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth");
    if (error) {
        console.error("Lettura iscrizioni push non riuscita:", error);
        return jsonResponse({ error: "Impossibile caricare le iscrizioni push." }, 500);
    }

    const expiredIds: string[] = [];
    let delivered = 0;
    const results = await Promise.allSettled((subscriptions || []).map(async subscription => {
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
        const { action, deviceId, subscription } = await request.json();
        if (action === "get-public-key") {
            return jsonResponse({ publicKey: vapidPublicKey || null }, 200, origin);
        }

        if (!supabase) return jsonResponse({ error: "Configurazione database incompleta." }, 503, origin);

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
                updated_at: new Date().toISOString()
            }, { onConflict: "endpoint" });
            if (error) {
                console.error("Salvataggio iscrizione push non riuscito:", error);
                return jsonResponse({ error: "Impossibile salvare l’iscrizione push." }, 500, origin);
            }
            return jsonResponse({ subscribed: true }, 200, origin);
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
