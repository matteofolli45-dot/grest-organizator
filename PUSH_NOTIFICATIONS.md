# Notifiche push

Le notifiche sono opt-in per dispositivo e coprono:

- nuove attività o modifiche a data, fascia e nome nella programmazione GREST;
- nuovi incontri o modifiche a data e titolo del Sabato Oratorio;
- nuovi avvisi GREST e Sabato Oratorio;
- assegnazioni di gioco, inviate solo ai dispositivi associati all'animatore assegnato;
- totale delle persone segnate a mensa, bambini e animatori inclusi, alle 9:15 nei giorni feriali del periodo GREST.

Dal menu **Impostazioni** ogni dispositivo può attivare/disattivare le notifiche e scegliere separatamente Gestore del gioco, attività e avvisi GREST, totale mensa, attività/incontri e avvisi Sabato Oratorio. Le preferenze sono salvate sul dispositivo e applicate anche dal server.

Il pannello di invito può essere chiuso con **×**; la chiusura è ricordata sul dispositivo. Per attivare le push in seguito, apri **Impostazioni** dal menu.
Per ricevere la notifica del Gestore, il dispositivo deve essere associato all'account dell'animatore selezionato. Il digest mensa resta inattivo finché la data di fine GREST non è configurata in `grest_push_schedule`.

Il browser deve supportare Web Push e il sito deve essere servito su HTTPS. Su iPhone/iPad (iOS/iPadOS 16.4 o successivi) l'utente deve prima aggiungere il sito alla schermata Home e aprirlo da lì. L'autorizzazione viene chiesta solo premendo **Attiva notifiche**.

## Configurazione Supabase

1. Installa la CLI Supabase e collega il progetto già usato dall'app:

   ```sh
   supabase login
   supabase link --project-ref gjoxvtqcmqmnunewcsgg
   ```

2. Genera una coppia VAPID, senza inserirla nei file del repository:

   ```sh
   npx web-push generate-vapid-keys
   ```

3. Configura i segreti della Edge Function. `APP_ORIGIN` deve essere l'origine esatta del sito pubblicato, senza percorso finale (ad esempio `https://esempio.it`).

   ```sh
   supabase secrets set APP_ORIGIN="https://esempio.it" VAPID_PUBLIC_KEY="<chiave pubblica VAPID>" VAPID_PRIVATE_KEY="<chiave privata VAPID>" VAPID_SUBJECT="https://esempio.it" PUSH_WEBHOOK_SECRET="<segreto casuale lungo>"
   ```

   Supabase fornisce già `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` all'ambiente Edge. La chiave privata VAPID e il segreto webhook restano solo nei segreti Supabase. L'origine deve corrispondere esattamente all'URL pubblico dell'app (schema e dominio, senza percorso).

4. In SQL Editor salva l'URL della funzione e lo stesso segreto webhook in Vault:

   ```sql
   select vault.create_secret(
     'https://gjoxvtqcmqmnunewcsgg.supabase.co/functions/v1/push-notifications',
     'push_function_url'
   );

   select vault.create_secret('<lo stesso PUSH_WEBHOOK_SECRET>', 'push_webhook_secret');
   ```

   Esegui `supabase/migrations/20261124182000_web_push_notifications.sql` se la configurazione push iniziale non è ancora stata applicata, poi `supabase/migrations/20261124193000_push_manager_and_lunch.sql`. In alternativa usa `supabase db push` se il progetto è già gestito con le migrazioni Supabase.

5. Dopo aver applicato le migrazioni, distribuisci la funzione aggiornata:

   ```sh
   supabase functions deploy push-notifications --no-verify-jwt
   ```

La seconda migrazione aggiunge i campi condivisi per le assegnazioni di gioco, associa le sottoscrizioni all'animatore, abilita `pg_cron` e programma il controllo delle 9:15 (gestendo l'ora legale italiana). La tabella `grest_push_schedule` è inizializzata con il 14 giugno 2027 come inizio indicativo e fine non impostata: aggiornare e confermare entrambe le date prima di attivare il digest. La funzione confronta le date in `Europe/Rome` e invia al massimo una notifica al giorno.

Le righe delle sottoscrizioni non sono leggibili dal browser: la tabella è accessibile solo alla Edge Function con service role. Se Vault non è configurato, gli inserimenti applicativi continuano a funzionare e Supabase registra un warning; le notifiche non verranno inviate finché i due segreti Vault non saranno presenti.
