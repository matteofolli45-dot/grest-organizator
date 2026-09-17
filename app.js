// ==========================================
// 1. Configurazione e Inizializzazione
// ==========================================
const SUPABASE_URL = "https://gjoxvtqcmqmnunewcsgg.supabase.co";
const SUPABASE_KEY = "sb_publishable_liOVczDXHXYACezbKqzGyA_NFMy0DeG";

// Verifica ed inizializzazione sicura del client Supabase
let sb = null;
if (window.supabase && typeof window.supabase.createClient === 'function') {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
} else {
    console.error("Libreria Supabase non caricata. Verifica l'inclusione dello script Supabase nell'HTML.");
}

// Password amministratore (Client-side)
const ADMIN_PASSWORD = "grest2026";


// Periodo ufficializzato del GREST 2026
const GREST_START = new Date(2026, 5, 15); // 15 Giugno 2026
const GREST_END = new Date(2026, 6, 3);    // 03 Luglio 2026 (3 settimane, lunedì-venerdì)

let currentCalendarDate = new Date();
let selectedCalendarDate = new Date();
let animatoriAccounts = [];
let animatoriCorrenti = []; // Cache per filtri dinamici
let selectedEvaluationDay = 'lunedi';

// Oggetto globale per memorizzare le attività caricate
let mappaAttivita = {};
let catalogoAttivita = [];
let listaAttivita = [];

let selezioneProgramma = {
    attivitaNome: '',
    settimanaIndex: 0,
    giornoIndex: 0,
    fascia: ''
};

// Array per memorizzare gli inserimenti del file attivita.txt
let registroProgrammazione = [];


let appelloBambini = [];
let appelloAnimatori = [];
let appelloStatusMap = {};
let appelloPresenzeBambiniMap = {};
let appelloPresenzeAnimatoriMap = {};
let appelloLoadId = 0;
let appelloSquadraCorrente = null;
const appelloSaveQueues = new Map();


let presenzeRealtimeChannel = null;
let presenzePollingTimer = null;
const PRESENZE_POLLING_MS = 1500; // fallback ogni 1,5 secondi


const DAILY_EVALUATION_STORAGE_KEY = 'grest_daily_evaluations_v1';

/**
 * Mostra una notifica a comparsa (Toast)
 * @param {string} messaggio - Testo da mostrare
 * @param {string} tipo - 'success' (verde) o 'error' (rosso)
 */

// Stato della paginazione animatori
let paginaCorrenteAnimatori = 1;
const ANIMATORI_PER_PAGINA = 5;
let paginaCorrenteSquadre = 1;
const ANIMATORI_SQUADRE_PER_PAGINA = 6;

const monthNames = [
    'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
];

function mostraNotifica(messaggio, tipo = 'success') {
    // Crea l'elemento notifica
    const toast = document.createElement('div');
    toast.className = `toast-notification ${tipo}`;
    toast.textContent = messaggio;

    // Inserisce la notifica nella pagina
    document.body.appendChild(toast);

    // Attiva la transizione di entrata
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    // Scompare e si rimuove automaticamente dopo 3 secondi
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300); // Attende la fine dell'animazione CSS
    }, 3000);
}

// Carica il file attivita.txt all'avvio (usa 'testi/attivita.txt' se è nella cartella testi)
fetch('testi/lista_attivita.txt')
    .then(response => {
        if (!response.ok) {
            // Prova a cercarlo nella root principale se non è in testi/
            return fetch('lista_attivita.txt');
        }
        return response;
    })
    .then(response => {
        if (!response.ok) throw new Error("File lista_attivita.txt non trovato");
        return response.text();
    })
    .then(testo => {
        caricaEParserizzaAttivita(testo);
        popolaSelectGiochi();
        if (typeof updateDashboard === 'function') {
            updateDashboard();
        }
    })
    .catch(err => console.error("Errore nel caricamento di lista_attivita.txt:", err));

    // Carica il catalogo di base all'avvio
fetch('testi/lista_attivita.txt')
    .then(response => {
        if (!response.ok) return fetch('lista_attivita.txt');
        return response;
    })
    .then(response => {
        if (!response.ok) throw new Error("File lista_attivita.txt non trovato");
        return response.text();
    })
    .then(testo => {
        caricaEParserizzaListaAttivita(testo);
    })
    .catch(err => console.log("Nessun catalogo di base trovato, attendere importazione admin."));

// ==========================================
// 2. Calcoli Date e Settimane GREST
// ==========================================

/**
 * Calcola a quale settimana del GREST (1, 2 o 3) appartiene una data.
 */
function getSettimanaCycle(date) {
    if (!isDateInGrestRange(date)) return 1;
    const diffTime = date.getTime() - GREST_START.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 3600 * 24));
    const weekNumber = Math.floor(diffDays / 7) + 1;
    return Math.min(Math.max(weekNumber, 1), 3);
}

function getGrestWeekRange(weekNumber) {
    const start = new Date(GREST_START);
    start.setDate(GREST_START.getDate() + (weekNumber - 1) * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 4); // Lun-Ven
    return {
        start,
        end: end > GREST_END ? new Date(GREST_END) : end
    };
}

function isDateInGrestRange(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const start = new Date(GREST_START.getFullYear(), GREST_START.getMonth(), GREST_START.getDate());
    const end = new Date(GREST_END.getFullYear(), GREST_END.getMonth(), GREST_END.getDate());
    return d >= start && d <= end;
}

function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6; // 0 = Domenica, 6 = Sabato
}

function formatItalianShortDate(date) {
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getSelectedWeekNumber() {
    const weekSelect = document.getElementById('weekSelect');
    const value = weekSelect ? Number(weekSelect.value) : NaN;
    return Number.isInteger(value) && value >= 1 && value <= 3 ? value : 1;
}

function getWeekNumberFromDate(date) {
    const targetDate = date || selectedCalendarDate || new Date();
    if (!isDateInGrestRange(targetDate)) {
        return getSelectedWeekNumber();
    }
    return getSettimanaCycle(targetDate);
}

function updateWeekRangeLabel() {
    const weekNumber = getSelectedWeekNumber();
    const weekLabel = document.getElementById('weekRangeLabel');
    const selectedWeekLabel = document.getElementById('selectedWeekLabel');
    const selectedWeekRange = document.getElementById('selectedWeekRange');

    const { start, end } = getGrestWeekRange(weekNumber);
    const rangeText = `${formatItalianShortDate(start)} - ${formatItalianShortDate(end)}`;

    if (weekLabel) weekLabel.textContent = rangeText;
    if (selectedWeekLabel) selectedWeekLabel.textContent = weekNumber;
    if (selectedWeekRange) selectedWeekRange.textContent = rangeText;

    mostraAnimatori();
}

// ==========================================
// 3. Area Admin & Calendario
// ==========================================

function checkAdminPassword() {
    const passwordInput = document.getElementById('adminPassword');
    const password = passwordInput ? passwordInput.value : '';
    if (password === ADMIN_PASSWORD) {
        showLoginError('');
        unlockAdminArea();
    }
    else {
        showLoginError('Password errata. Riprova.');
    }
}

function showLoginError(message) {
    const errorEl = document.getElementById('loginError');
    if (errorEl) errorEl.textContent = message;
}

function unlockAdminArea() {
    selectedCalendarDate = new Date(GREST_START); // Default alla prima data GREST
    currentCalendarDate = new Date(selectedCalendarDate.getFullYear(), selectedCalendarDate.getMonth(), 1);
    
    const label = document.getElementById('selectedDateLabel');
    if (label) {
        label.textContent = selectedCalendarDate.toLocaleDateString('it-IT', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
    }

    const loginCard = document.getElementById('loginCard');
    const adminContent = document.getElementById('adminContent');
    if (loginCard) loginCard.style.display = 'none';
    if (adminContent) adminContent.style.display = 'block';

    renderCalendar(currentCalendarDate);
    mostraAnimatori();

    avviaAggiornamentoPresenze();
}

function renderCalendar(date) {
    const month = date.getMonth();
    const year = date.getFullYear();
    const firstDay = new Date(year, month, 1);
    const startDay = (firstDay.getDay() + 6) % 7; // Lunedì = 0
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const monthLabel = document.getElementById('calendarMonthLabel');
    if (monthLabel) monthLabel.textContent = `${monthNames[month]} ${year}`;

    const body = document.getElementById('calendarBody');
    if (!body) return;
    body.innerHTML = '';

    let row = document.createElement('tr');
    for (let i = 0; i < startDay; i++) {
        row.appendChild(document.createElement('td'));
    }

    for (let day = 1; day <= daysInMonth; day++) {
        if (row.children.length === 7) {
            body.appendChild(row);
            row = document.createElement('tr');
        }

        const cell = document.createElement('td');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'calendar-day';
        button.textContent = day;

        const dateValue = new Date(year, month, day);

        // Evidenziazione stato giorni
        if (isDateInGrestRange(dateValue)) {
            button.classList.add('grest-day');
        }
        if (isWeekend(dateValue)) {
            button.classList.add('weekend-day');
            button.disabled = true;
        }
        if (selectedCalendarDate && selectedCalendarDate.toDateString() === dateValue.toDateString()) {
            button.classList.add('selected');
        }

        button.addEventListener('click', () => selectCalendarDate(dateValue));
        cell.appendChild(button);
        row.appendChild(cell);
    }

    while (row.children.length < 7) {
        row.appendChild(document.createElement('td'));
    }
    body.appendChild(row);
}

function selectCalendarDate(date) {
    selectedCalendarDate = date;
    const label = document.getElementById('selectedDateLabel');
    if (label) {
        label.textContent = date.toLocaleDateString('it-IT', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
    }
    renderCalendar(currentCalendarDate);
    mostraAnimatori();
}

function changeCalendarMonth(offset) {
    currentCalendarDate = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() + offset, 1);
    renderCalendar(currentCalendarDate);
}

function popolaListaInterfaccia() {
    const container = document.getElementById('ul-lista-attivita');

    // CONTROLLO DI SICUREZZA: Se l'elemento non esiste nella pagina HTML, esce senza bloccare l'app
    if (!container) return;
    

    container.innerHTML = '';

    if (!catalogoAttivita || catalogoAttivita.length === 0) {
        container.innerHTML = '<li class="attivita-vuota">Nessuna attività importata.</li>';
        return;
    }

    // 1. Raggruppa le attività per Categoria
    const categorieMap = {};
    catalogoAttivita.forEach(att => {
        const cat = att.categoria || 'Generale';
        if (!categorieMap[cat]) categorieMap[cat] = [];
        categorieMap[cat].push(att);
    });

    // 2. Crea l'interfaccia a fisarmonica (accordion)
    Object.keys(categorieMap).forEach(nomeCategoria => {
        const catLi = document.createElement('li');
        catLi.className = 'categoria-item';

        // Intestazione della Categoria (Cliccabile)
        const catHeader = document.createElement('div');
        catHeader.className = 'categoria-header';
        catHeader.innerHTML = `
            <span>📁 ${nomeCategoria}</span>
            <span class="conteggio-badge">${categorieMap[nomeCategoria].length}</span>
        `;

        // Lista dei giochi appartenenti a questa categoria
        const subList = document.createElement('ul');
        subList.className = 'sotto-lista-attivita nascosto';

        categorieMap[nomeCategoria].forEach(attivita => {
            const giocoLi = document.createElement('li');
            giocoLi.className = 'gioco-item';
            giocoLi.textContent = attivita.nome;

            // Al click sul gioco mostra i dettagli nel pannello
            giocoLi.onclick = (e) => {
                e.stopPropagation(); // Evita di chiudere/aprire la categoria quando si clicca sul gioco
                mostraDettagli(attivita, giocoLi);
            };

            subList.appendChild(giocoLi);
        });

        // Alterna la visibilità della sotto-lista al click sulla categoria
        catHeader.onclick = () => {
            subList.classList.toggle('nascosto');
            catHeader.classList.toggle('aperta');
        };

        catLi.appendChild(catHeader);
        catLi.appendChild(subList);
        container.appendChild(catLi);
    });
}

// Funzione per mostrare il pannello laterale
function mostraDettagli(attivita, elementoCliccato) {
    document.getElementById('dettaglio-nome').textContent = attivita.nome;
    document.getElementById('dettaglio-descrizione').textContent = attivita.descrizione;
    document.getElementById('dettaglio-materiali').textContent = attivita.materiali;
    
    // Evidenzia visivamente il gioco selezionato nella lista
    document.querySelectorAll('.gioco-item').forEach(el => el.classList.remove('attivo'));
    if (elementoCliccato) {
        elementoCliccato.classList.add('attivo');
    }
    // Rimuove la classe 'nascosto'
    document.getElementById('pannello-dettagli').classList.remove('nascosto');
}

function resetDettagli() {
    document.getElementById('dettaglio-nome').textContent = "Seleziona un'attività";
    document.getElementById('dettaglio-descrizione').textContent = "Clicca su un'attività dalla lista per visualizzare la descrizione completa.";
    document.getElementById('dettaglio-materiali').textContent = "I materiali necessari appariranno qui.";
    
    document.querySelectorAll('.gioco-item').forEach(el => el.classList.remove('attivo'));
}

// Funzione per nascondere il pannello laterale
function chiudiDettagli() {
    document.getElementById('pannello-dettagli').classList.add('nascosto');
    // 2. Rimuove l'evidenziazione dalla lista
    document.querySelectorAll('.gioco-item').forEach(el => el.classList.remove('attivo'));
}

// Funzione per espandere/collassare le settimane
function toggleSettimana(bottone) {
    // Trova il div contenuto subito dopo il bottone
    const contenuto = bottone.nextElementSibling;
    
    // Alterna la classe 'aperto'
    contenuto.classList.toggle('aperto');
    
    // Cambia la freccia
    const span = bottone.querySelector('span');
    if (contenuto.classList.contains('aperto')) {
        span.textContent = '▲';
    } else {
        span.textContent = '▼';
    }
}

// ==========================================
// 4. Gestione Dati Animatori (Supabase CRUD)
// ==========================================

async function mostraAnimatori() {
    const titoloLista = document.getElementById('titoloLista');
    const tableBody = document.querySelector('#animatoriTable tbody');

    if (!tableBody) return;
    if (!sb) {
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: red;">Connessione a Supabase non disponibile.</td></tr>`;
        return;
    }

    const isPaginaAdmin = window.location.href.includes('admin') || document.getElementById('adminContent')?.style.display === 'block';
    let weekNumber;

    if (isPaginaAdmin) {
        const dateToUse = selectedCalendarDate || new Date();

        if (!isDateInGrestRange(dateToUse)) {
            if (titoloLista) titoloLista.textContent = "Data fuori dal GREST";
            tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #ff6b6b; padding: 20px;">La data selezionata non rientra nel periodo del GREST.</td></tr>`;
            return;
        }

        if (isWeekend(dateToUse)) {
            if (titoloLista) titoloLista.textContent = "Giorno di riposo (Weekend)";
            tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #ff9800; padding: 20px;">Nessun turno previsto per il fine settimana.</td></tr>`;
            return;
        }

        weekNumber = getSettimanaCycle(dateToUse);
    } else {
        weekNumber = getWeekNumberFromDate(selectedCalendarDate);
    }

    if (titoloLista) {
        titoloLista.textContent = `Animatori in Turno - Settimana ${weekNumber}`;
    }

    tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center;">Caricamento animatori in corso...</td></tr>`;

    try {
        const { data: animatori, error } = await sb
            .from('animatori')
            .select('*')
            .order('squadra', { ascending: true })
            .order('nome', { ascending: true });

        if (error) throw error;

        animatoriCorrenti = (animatori || []).filter(a => {
            if (!a.settimana) return false;
            const arr = Array.isArray(a.settimana) ? a.settimana : [a.settimana];
            return arr.map(String).includes(String(weekNumber));
        });

        // RESETTIAMO LA PAGINA A 1 QUANDO SI CARICANO NUOVI DATI
        paginaCorrenteAnimatori = 1;
        
        // CHIAMIAMO LA FUNZIONE UNICA
        renderTabellaAnimatori(animatoriCorrenti, isPaginaAdmin);
        
        if (typeof renderRegistroValutazioni === 'function') {
            renderRegistroValutazioni(animatoriCorrenti);
        }
        if (typeof initAssegnazioneSquadre === 'function') {
        await initAssegnazioneSquadre(animatoriCorrenti);
        }

    } catch (err) {
        console.error("Errore caricamento animatori:", err);
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: red;">Errore: ${err.message || 'Impossibile recuperare i dati'}</td></tr>`;
    }
}

function getSquadraLabel(animatore) {
    const valoreSquadra = animatore && animatore.squadra !== undefined && animatore.squadra !== null && animatore.squadra !== ''
        ? String(animatore.squadra)
        : 'Nessuna squadra';

    return valoreSquadra === 'Nessuna squadra' ? 'Nessuna squadra' : `Squadra ${valoreSquadra}`;
}

function raggruppaAnimatoriPerSquadra(lista) {
    const gruppi = new Map();

    (lista || []).forEach(animatore => {
        const squadra = getSquadraLabel(animatore);
        if (!gruppi.has(squadra)) {
            gruppi.set(squadra, []);
        }
        gruppi.get(squadra).push(animatore);
    });

    return Array.from(gruppi.entries())
        .map(([squadra, membri]) => ({
            squadra,
            membri: membri.sort((a, b) => {
                const nomeA = `${a.nome || ''} ${a.cognome || ''}`.trim().toLowerCase();
                const nomeB = `${b.nome || ''} ${b.cognome || ''}`.trim().toLowerCase();
                return nomeA.localeCompare(nomeB, 'it');
            })
        }))
        .sort((a, b) => {
            if (a.squadra === 'Nessuna squadra') return 1;
            if (b.squadra === 'Nessuna squadra') return -1;
            return a.squadra.localeCompare(b.squadra, 'it');
        });
}

function normalizzaSettimane(value) {
    if (Array.isArray(value)) {
        return value.map(String).filter(Boolean);
    }
    if (value === null || value === undefined || value === '') {
        return [];
    }
    if (typeof value === 'string') {
        const numeri = value.match(/\d+/g);
        return numeri ? numeri.map(String) : [];
    }
    return [String(value)];
}

function getAnimatoreById(id) {
    return (animatoriCorrenti || []).find(animatore => String(animatore.id_animatore) === String(id));
}

function getAccountKey(animatore) {
    if (!animatore) return '';
    if (animatore.id_animatore) return String(animatore.id_animatore);
    if (animatore.id) return String(animatore.id);
    const nome = (animatore.nome || '').trim().toLowerCase().replace(/\s+/g, '_');
    const cognome = (animatore.cognome || '').trim().toLowerCase().replace(/\s+/g, '_');
    return `${nome}-${cognome}`.replace(/[^a-z0-9_-]/g, '');
}

function getBaseRole(ruolo) {
    const valore = String(ruolo || '').trim().toLowerCase();
    return valore.replace(/\s*\(gioco.*\)$/i, '')
        .replace(/\s*\(arbitro.*\)$/i, '')
        .trim() || 'animatore';

}

function getLocalGameAssignments() {
    try {
        return JSON.parse(localStorage.getItem('grest_game_assignments') || '{}');
    } catch (error) {
        return {};
    }
}

function getLocalGameAssignment(animatore) {
    if (!animatore) return null;
    const assignments = getLocalGameAssignments();
    return assignments[getAccountKey(animatore)] || null;
}

function saveLocalGameAssignment(animatore, assignment) {
    if (!animatore) return;
    const key = getAccountKey(animatore);
    if (!key) return;

    try {
        const assignments = getLocalGameAssignments();
        if (assignment && assignment.day && assignment.game) {
            assignments[key] = { day: assignment.day, game: assignment.game };
        } else {
            delete assignments[key];
        }
        localStorage.setItem('grest_game_assignments', JSON.stringify(assignments));
    } catch (error) {
        console.error('Errore salvataggio assegnazione di gioco locale:', error);
    }
}

function getDisplayRole(animatore) {
    const baseRole = getBaseRole(animatore.ruolo);
    return baseRole;
}

function getGameOptions() {
    return getDailyGamesForDate(date);
}

function parseRoleMetadata(ruolo) {
    const valore = String(ruolo || '').trim();
    const match = valore.match(/\(gioco\s*:\s*(.+?)(?:\s*-\s*(.+))?\)$/i);

    if (match) {
        const [, dettaglioRaw, giornoRaw] = match;
        return {
            tipo: 'gioco',
            dettaglio: dettaglioRaw ? dettaglioRaw.trim() : '',
            giorno: giornoRaw ? giornoRaw.trim() : ''
        };
    }

    const oldGameMatch = valore.match(/\(gioco\)$/i);
    if (oldGameMatch) {
        return { tipo: 'gioco', dettaglio: '', giorno: '' };
    }

    return { tipo: '', dettaglio: '', giorno: '' };
}

function getItalianWeekdayName(date) {
    const giorni = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
    return date && typeof date.getDay === 'function' ? giorni[date.getDay()] : '';
}

function aggiornaVisibilitaSelettoriRuolo() {
    const gameRoleEl = document.getElementById('editGameRole');
    const ruoloEl = document.getElementById('editRuolo');
    const dayWrapper = document.getElementById('editDaySelectionWrapper');
    const gameWrapper = document.getElementById('editGameSelectionWrapper');
    const daySelect = document.getElementById('editDaySelect');
    const gameSelect = document.getElementById('editGameSelect');

    if (!gameRoleEl || !ruoloEl || !dayWrapper || !gameWrapper || !daySelect || !gameSelect) return;

    const mostraSelettori = gameRoleEl.checked;

    dayWrapper.classList.toggle('hidden', !mostraSelettori);
    dayWrapper.setAttribute('aria-hidden', String(!mostraSelettori));

    gameWrapper.classList.toggle('hidden', !mostraSelettori);
    gameWrapper.setAttribute('aria-hidden', String(!mostraSelettori));

    if (!mostraSelettori) {
        daySelect.value = '';
        gameSelect.value = '';
    }
}

function apriModalModifica(idAnimatore) {
    const animatore = getAnimatoreById(idAnimatore);
    const modal = document.getElementById('editAnimatorModal');
    const nameEl = document.getElementById('editAnimatorName');
    const week1 = document.getElementById('editWeek1');
    const week2 = document.getElementById('editWeek2');
    const week3 = document.getElementById('editWeek3');
    const ruoloEl = document.getElementById('editRuolo');
    const gameRoleEl = document.getElementById('editGameRole');
    const gameSelect = document.getElementById('editGameSelect');
    const daySelect = document.getElementById('editDaySelect');

    if (!modal || !animatore) return;

    popolaSelectGiochi();
    const nomeCompleto = `${animatore.nome || ''} ${animatore.cognome || ''}`.trim();
    if (nameEl) {
        nameEl.textContent = nomeCompleto || 'Animatore';
        nameEl.dataset.idAnimatore = String(animatore.id_animatore || idAnimatore || '');
    }

    const settimane = new Set(normalizzaSettimane(animatore.settimana));
    if (week1) week1.checked = settimane.has('1');
    if (week2) week2.checked = settimane.has('2');
    if (week3) week3.checked = settimane.has('3');

    const metadata = parseRoleMetadata(animatore.ruolo || '');
    const localAssignment = getLocalGameAssignment(animatore);

    if (ruoloEl) {
        const ruoloRaw = String(animatore.ruolo || 'animatore').toLowerCase();
        const ruoloBase = ruoloRaw
            .replace(/\s*\(gioco.*\)$/i, '')
            .trim();
        ruoloEl.value = ['animatore', 'capo squadra', 'responsabile'].includes(ruoloBase) ? ruoloBase : 'animatore';
    }

    if (gameRoleEl) {
        gameRoleEl.checked = Boolean(localAssignment || metadata.tipo === 'gioco');
    }

    if (gameSelect) {
        gameSelect.value = localAssignment?.game || (metadata.tipo === 'gioco' && metadata.dettaglio ? metadata.dettaglio : '');
    }

    if (daySelect) {
        daySelect.value = localAssignment?.day || (metadata.tipo === 'gioco' ? metadata.giorno || '' : '');
    }

    aggiornaVisibilitaSelettoriRuolo();
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
}

function chiudiModalModifica() {
    const modal = document.getElementById('editAnimatorModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
}

function inizializzaModalModifica() {
    const modal = document.getElementById('editAnimatorModal');
    if (!modal) return;

    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            chiudiModalModifica();
        }
    });

    const gameRoleEl = document.getElementById('editGameRole');
    if (gameRoleEl) {
        gameRoleEl.addEventListener('change', aggiornaVisibilitaSelettoriRuolo);
    }

    const ruoloEl = document.getElementById('editRuolo');
    if (ruoloEl) {
        ruoloEl.addEventListener('change', aggiornaVisibilitaSelettoriRuolo);
    }
}

async function salvaModificaAnimatore() {
    const modal = document.getElementById('editAnimatorModal');
    const nameEl = document.getElementById('editAnimatorName');
    if (!modal || !sb) return;

    const animatore = getAnimatoreById(nameEl?.dataset?.idAnimatore || '');
    if (!animatore) {
        mostraNotifica('Impossibile trovare l\'animatore da modificare.', 'error');
        return;
    }

    const week1 = document.getElementById('editWeek1');
    const week2 = document.getElementById('editWeek2');
    const week3 = document.getElementById('editWeek3');
    const ruoloEl = document.getElementById('editRuolo');
    const gameRoleEl = document.getElementById('editGameRole');
    const gameSelect = document.getElementById('editGameSelect');
    const daySelect = document.getElementById('editDaySelect');

    const settimaneSelezionate = [week1, week2, week3]
        .filter(Boolean)
        .filter(chk => chk.checked)
        .map(chk => chk.value);

    // Definizione del ruolo finale da salvare
    const ruoloBase = ruoloEl ? ruoloEl.value : 'animatore';
    const ruoloFinale = ruoloBase; // Dichiara la variabile mancante

    const giornoSelezionato = daySelect ? daySelect.value : '';
    const giocoSelezionato = gameSelect ? gameSelect.value : '';
    const managesGame = gameRoleEl && gameRoleEl.checked;
    const hasGameSelection = managesGame && giocoSelezionato && giocoSelezionato.trim() !== '';

    if (managesGame && !giornoSelezionato) {
        mostraNotifica('Seleziona il giorno per il gioco.', 'error');
        return;
    }

    if (managesGame && !hasGameSelection) {
        mostraNotifica('Seleziona un gioco per l’assegnazione di gioco del giorno.', 'error');
        return;
    }

    const oldMetadata = parseRoleMetadata(animatore.ruolo || '');
    const oldBaseRole = getBaseRole(animatore.ruolo);
    const ruoloCambiato = ruoloBase !== oldBaseRole;
    const settimaneCambiato = JSON.stringify(settimaneSelezionate.sort()) !== JSON.stringify(normalizzaSettimane(animatore.settimana).sort());

    const shouldUpdateDB = ruoloCambiato || settimaneCambiato;

    if (managesGame && hasGameSelection) {
        saveLocalGameAssignment(animatore, { day: giornoSelezionato, game: giocoSelezionato });
    } else {
        saveLocalGameAssignment(animatore, null);
    }

    if (!shouldUpdateDB) {
        chiudiModalModifica();
        mostraNotifica('Assegnazione di gioco salvata localmente.', 'success');
        return;
    }

    try {
        const { error } = await sb
            .from('animatori')
            .update({
                ruolo: ruoloFinale,
                settimana: settimaneSelezionate
            })
            .eq('id_animatore', animatore.id_animatore);

        if (error) throw error;

        chiudiModalModifica();
        mostraNotifica('Animatore aggiornato con successo.', 'success');
        await loadAnimatoriAccounts();
        mostraAnimatori();
    } catch (error) {
        console.error('Errore aggiornamento animatore:', error);
        mostraNotifica('Errore durante il salvataggio delle modifiche.', 'error');
    }
}

function renderTabellaAnimatori(lista, isPaginaAdmin = false) {
    animatoriCorrenti = Array.isArray(lista) ? lista : [];

    const tableBody = document.querySelector('#animatoriTable tbody');
    if (!tableBody) return;

    if (animatoriCorrenti.length === 0) {
        const colspan = isPaginaAdmin ? 2 : 4;
        tableBody.innerHTML = `<tr><td colspan="${colspan}" style="text-align: center; padding: 15px;">Nessun animatore trovato per i filtri selezionati.</td></tr>`;
        renderControlliPaginazione(0);
        return;
    }

    const gruppi = raggruppaAnimatoriPerSquadra(animatoriCorrenti);
    const righeTabella = [];

    gruppi.forEach(gruppo => {
        righeTabella.push(`
            <tr class="team-group-row">
                <td colspan="${isPaginaAdmin ? 2 : 4}">
                    <strong>${gruppo.squadra}</strong>
                </td>
            </tr>
        `);

        gruppo.membri.forEach(animatore => {
            const nomeCompleto = `${animatore.nome || ''} ${animatore.cognome || ''}`.trim();
            const squadra = animatore.squadra || 'Nessuna';
            const ruolo = getDisplayRole(animatore);
            const presenze = Array.isArray(animatore.settimana)
                ? animatore.settimana.join(', ')
                : (animatore.settimana || '-');

            if (isPaginaAdmin) {
                righeTabella.push(`
                    <tr>
                        <td><strong>${nomeCompleto}</strong></td>
                        <td style="text-align: center;">
                            <div style="display:flex; justify-content:center; gap:8px; flex-wrap:wrap;">
                                <button type="button" class="btn-edit" onclick="apriModalModifica('${animatore.id_animatore}')" style="background:#2f6f7d; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">
                                    Modifica
                                </button>
                                <button type="button" class="btn-delete" onclick="eliminaAnimatore('${animatore.id_animatore}', '${nomeCompleto.replace(/'/g, "\\'")}')" style="background:#e74c3c; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">
                                    Elimina
                                </button>
                            </div>
                        </td>
                    </tr>
                `);
            } else {
                righeTabella.push(`
                    <tr>
                        <td><strong>${nomeCompleto}</strong></td>
                        <td>${squadra}</td>
                        <td>${ruolo}</td>
                        <td>Sett. ${presenze}</td>
                    </tr>
                `);
            }
        });
    });

    const totalePagine = Math.ceil(righeTabella.length / ANIMATORI_PER_PAGINA);
    if (paginaCorrenteAnimatori > totalePagine && totalePagine > 0) {
        paginaCorrenteAnimatori = totalePagine;
    }

    const inizio = (paginaCorrenteAnimatori - 1) * ANIMATORI_PER_PAGINA;
    const righePagina = righeTabella.slice(inizio, inizio + ANIMATORI_PER_PAGINA);

    tableBody.innerHTML = righePagina.join('');
    renderControlliPaginazione(totalePagine);
}

/**
 * Filtro di ricerca dinamico per il campo di ricerca
 */
function filtraAnimatori(query) {
    const q = (query || '').toLowerCase().trim();
    if (!q) {
        const isAdmin = window.location.href.includes('admin') || document.getElementById('adminContent')?.style.display === 'block';
        renderTabellaAnimatori(animatoriCorrenti, isAdmin);
        return;
    }

    const filtrati = animatoriCorrenti.filter(a => {
        const nome = `${a.nome || ''} ${a.cognome || ''}`.toLowerCase();
        const squadra = (a.squadra || '').toLowerCase();
        const ruolo = (a.ruolo || '').toLowerCase();
        return nome.includes(q) || squadra.includes(q) || ruolo.includes(q);
    });

    const isAdmin = window.location.href.includes('admin') || document.getElementById('adminContent')?.style.display === 'block';
    renderTabellaAnimatori(filtrati, isAdmin);
}

/**
 * Aggiunta di un nuovo animatore nel Database
 */

async function aggiungiAnimatore() {
    if (!sb) {
        alert("Client Supabase non pronto.");
        return;
    }

    // 1. RECUPERO E VALIDAZIONE DATI DAL FORM
    const inputNome = document.getElementById('nomeAnimatore');
    const inputCognome = document.getElementById('cognomeAnimatore');
    const selectRuolo = document.getElementById('ruoloAnimatore');
    const selectSquadra = document.getElementById('squadraAnimatore');

    const nome = inputNome ? inputNome.value.trim() : '';
    const cognome = inputCognome ? inputCognome.value.trim() : '';
    const ruolo = selectRuolo ? selectRuolo.value : 'Animatore';
    const squadra = selectSquadra ? selectSquadra.value : '';

    if (!nome || !cognome) {
        alert("Inserisci sia il nome che il cognome dell'animatore!");
        return;
    }

    // 2. CONTROLLO SETTIMANE SELEZIONATE
    const checkboxes = document.querySelectorAll('.settimana-chk');
    const settimaneSelezionate = [];
    checkboxes.forEach(chk => {
        if (chk.checked) settimaneSelezionate.push(chk.value);
    });

    if (settimaneSelezionate.length === 0) {
        alert("Seleziona almeno una settimana di presenza!");
        return;
    }

    // 3. CONTROLLO DUPLICATI NEL DATABASE
    const nominativo_animatore = `${nome} ${cognome}`;
    const { data: giaPresente, error: checkError } = await sb
        .from('animatori')
        .select('id_animatore')
        .ilike('nominativo', nominativo_animatore);

    if (checkError) {
        mostraNotifica(`Errore durante il controllo duplicati: ${checkError.message}`, 'error');
        console.error("Errore check:", checkError);
        return;
    }

    if (giaPresente && giaPresente.length > 0) {
        mostraNotifica(`L'animatore "${nominativo_animatore}" è già presente nel sistema!`, 'error');
        return;
    }

    // 4. GENERAZIONE PASSWORD E UNICO INSERIMENTO

    const passwordGenerata = generaPasswordCasuale(8);

    const { error: insertError } = await sb
        .from('animatori')
        .insert([{
            nome,
            cognome,
            ruolo,
            squadra: squadra ? parseInt(squadra) : null,
            settimana: settimaneSelezionate,
            Password: passwordGenerata
        }]);

    // 5. GESTIONE ESITO
    if (insertError) {
        mostraNotifica(`Errore durante il salvataggio: ${insertError.message}`, 'error');
        console.error(insertError);
    } else {
        // Reset campi form
        if (inputNome) inputNome.value = "";
        if (inputCognome) inputCognome.value = "";
        if (selectSquadra) selectSquadra.value = "";
        checkboxes.forEach(chk => chk.checked = false);

        mostraNotifica(`Animatore ${nominativo_animatore} salvato! Password: ${passwordGenerata}`, 'success');
        
        if (typeof loadAnimatoriAccounts === 'function') await loadAnimatoriAccounts();
        if (typeof mostraAnimatori === 'function') mostraAnimatori();
    }
}

function generaPasswordCasuale(lunghezza = 8) {
    const caratteri = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let pass = '';
    for (let i = 0; i < lunghezza; i++) {
        pass += caratteri.charAt(Math.floor(Math.random() * caratteri.length));
    }
    return pass;
}
/**
 * Eliminazione di un animatore dal Database
 */
async function eliminaAnimatore(id, nome) {
    if (!sb) {
        alert("Client Supabase non pronto.");
        return;
    }

    if (!id || id === 'undefined') {
        console.error("ID animatore non valido:", id);
        alert("Errore: impossibile identificare l'animatore da eliminare (ID mancante).");
        return;
    }

    const nomeVisualizzato = nome || 'selezionato';

    if (!confirm(`Sei sicuro di voler eliminare l'animatore "${nomeVisualizzato}"?`)) {
        return;
    }

    try {
        const { error } = await sb
            .from('animatori')
            .delete()
            .eq('id_animatore', parseInt(id));

        if (error) throw error;
        
        // Regolazione pagina in caso di eliminazione dell'ultimo elemento della pagina corrente
        const totaleAnimatoriRimasti = animatoriCorrenti.length - 1;
        const maxPagine = Math.ceil(totaleAnimatoriRimasti / ANIMATORI_PER_PAGINA);
        if (paginaCorrenteAnimatori > maxPagine && maxPagine > 0) {
            paginaCorrenteAnimatori = maxPagine;
        }

        if (typeof mostraNotifica === 'function') {
            mostraNotifica(`Animatore "${nomeVisualizzato}" eliminato con successo!`, 'success');
        }

        if (typeof loadAnimatoriAccounts === 'function') {
            await loadAnimatoriAccounts();
        }
        
        if (typeof mostraAnimatori === 'function') {
            await mostraAnimatori();
        }

    } catch (err) {
        if (typeof mostraNotifica === 'function') {
            mostraNotifica("Errore durante l'eliminazione: " + err.message, 'error');
        } else {
            alert("Errore durante l'eliminazione: " + err.message);
        }
        console.error("Errore eliminazione:", err);
    }
}

function aggiornaFileAttivitaTxt() {
    // Trasforma ogni elemento formattandolo come "15/06/2026 - Mattina: Nome attività"
    const righeTxt = registroProgrammazione.map(r => `${r.dataStr} - ${r.fascia}: ${r.nome}`);
    const contenutoAttivitaTxt = righeTxt.join('\n');

    console.log("--- NUOVO CONTENUTO DI ATTIVITA.TXT ---");
    console.log(contenutoAttivitaTxt);
    
    // Salva il file aggiornato in localStorage
    localStorage.setItem('attivita.txt', contenutoAttivitaTxt);
}

// ==========================================
// 5. Account, Dashboard e Attività
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    const menuToggle = document.getElementById('menuToggle');
    const menuDropdown = document.getElementById('menuDropdown');

    if (menuToggle && menuDropdown) {
        menuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = menuDropdown.classList.contains('show') || menuToggle.getAttribute('aria-expanded') === 'true';
            
            menuToggle.setAttribute('aria-expanded', !isOpen);
            menuDropdown.setAttribute('aria-hidden', isOpen);
            menuDropdown.classList.toggle('show');
        });

        // Chiudi il menu se si clicca fuori
        document.addEventListener('click', () => {
            menuToggle.setAttribute('aria-expanded', 'false');
            menuDropdown.setAttribute('aria-hidden', 'true');
            menuDropdown.classList.remove('show');
        });
    }
});

function getAccountId(animatore) {
    if (!animatore) return '';
    if (animatore.id) return String(animatore.id);
    const nome = (animatore.nome || '').trim().toLowerCase().replace(/\s+/g, '_');
    const cognome = (animatore.cognome || '').trim().toLowerCase().replace(/\s+/g, '_');
    return `${nome}-${cognome}`.replace(/[^a-z0-9_-]/g, '');
}

async function loadAnimatoriAccounts() {
    if (!sb) return [];
    try {
        const { data, error } = await sb
        .from('animatori')
        .select('*')
        .order('nome', { ascending: true })
        .order('cognome', { ascending: true });
        
        if (error) throw error;

        animatoriAccounts = (data || []).map(animatore => ({
            ...animatore,
            id: getAccountId(animatore)
        }));

        const select = document.getElementById('accountSelect');
        if (select) {
            if (!animatoriAccounts.length) {
                select.innerHTML = '<option value="">Nessun animatore trovato</option>';
            } else {
                select.innerHTML = '<option value="">Seleziona un animatore</option>' + animatoriAccounts
                    .map(a => `<option value="${a.id}">${a.nome || ''} ${a.cognome || ''}</option>`)
                    .join('');
            }
        }

        renderAccountCards();
        return animatoriAccounts;
    } catch (error) {
        console.error('Errore caricamento account:', error);
        return [];
    }
}

function createInitials(name, surname) {
    const first = (name || '').trim().charAt(0).toUpperCase();
    const last = (surname || '').trim().charAt(0).toUpperCase();
    return `${first}${last}` || 'AN';
}

function renderAccountCards() {
    const accountGrid = document.getElementById('accountCards');
    if (!accountGrid) return;

    if (!animatoriAccounts.length) {
        accountGrid.innerHTML = '<div class="account-loading">Nessun account disponibile.</div>';
        return;
    }

    accountGrid.innerHTML = animatoriAccounts.map(animatore => {
        const initials = createInitials(animatore.nome, animatore.cognome);
        const accountId = encodeURIComponent(animatore.id);
        return `
            <div class="account-card" onclick="apriModalPassword('${animatore.id}')" style="cursor: pointer;">
                <div class="account-initials">${initials}</div>
                <h3>${animatore.nome || '-'} ${animatore.cognome || '-'}</h3>
                <p>${animatore.ruolo || 'Animatore'}</p>
            </div>
        `;
    }).join('');
}

function apriModalPassword(accountId) {
    const animatore = animatoriAccounts.find(acc => String(acc.id) === String(accountId));
    if (!animatore) return;

    accountSelezionatoTemporaneo = animatore;

    const modalTitle = document.getElementById('modalTitle');
    const inputPass = document.getElementById('inputPasswordAccount');
    const errDiv = document.getElementById('passwordError');

    if (modalTitle) modalTitle.textContent = `Password per ${animatore.nome} ${animatore.cognome}`;
    if (inputPass) inputPass.value = '';
    if (errDiv) errDiv.style.display = 'none';

    const modal = document.getElementById('passwordModal');
    if (modal) modal.classList.add('active');
    
    setTimeout(() => { if (inputPass) inputPass.focus(); }, 100);
}

function chiudiModalPassword() {
    accountSelezionatoTemporaneo = null;
    const modal = document.getElementById('passwordModal');
    if (modal) modal.classList.remove('active');
}

function confermaPasswordAccount(event) {
    if (event) event.preventDefault();
    if (!accountSelezionatoTemporaneo) return;

    const inputPass = document.getElementById('inputPasswordAccount');
    const errDiv = document.getElementById('passwordError');
    const passwordInserita = inputPass ? inputPass.value.trim() : '';

    // Legge la password dal DB (accetta sia "Password" che "password")
    const passwordCorretta = accountSelezionatoTemporaneo.Password || accountSelezionatoTemporaneo.password || '';

    // Se nel DB la password è vuota/NULL oppure corrisponde a quella inserita dall'utente
    if (!passwordCorretta || passwordInserita === passwordCorretta) {
        const accountId = encodeURIComponent(accountSelezionatoTemporaneo.id);
        
        // Salva in Storage
        try {
            localStorage.setItem('selectedAccountId', accountSelezionatoTemporaneo.id);
            sessionStorage.setItem('selectedAccountId', accountSelezionatoTemporaneo.id);
        } catch (e) { console.error(e); }

        // Reindirizza alla pagina principale con l'ID selezionato
        window.location.href = `index.html?selectedAccountId=${accountId}`;
    } else {
        // Password errata
        if (errDiv) {
            errDiv.style.display = 'block';
            errDiv.textContent = 'Password non corretta!';
        }
        if (inputPass) inputPass.select();
    }
}

window.apriModalPassword = apriModalPassword;
window.chiudiModalPassword = chiudiModalPassword;
window.confermaPasswordAccount = confermaPasswordAccount;

// --- GESTIONE CAMBIO PASSWORD ---

// Recupera il nominativo leggendolo direttamente dall'elemento HTML
function getNominativoCorrente() {
    const el = document.getElementById('currentAccountLabel');
    return el ? el.textContent.trim() : null;
}

async function apriModalCambiaPassword() {
    const modal = document.getElementById('cambiaPasswordModal');
    const labelNome = document.getElementById('nomeAnimatoreLoggato');
    const msg = document.getElementById('msgCambioPassword');
    
    document.getElementById('inputVecchiaPassword').value = '';
    document.getElementById('inputNuovaPassword').value = '';
    if (msg) msg.style.display = 'none';

    const nominativo = getNominativoCorrente();

    if (!nominativo) {
        alert("Impossibile identificare l'account corrente dall'etichetta.");
        return;
    }

    if (labelNome) {
        labelNome.textContent = nominativo;
    }

    if (modal) modal.classList.add('active');
}

function chiudiModalCambiaPassword() {
    const modal = document.getElementById('cambiaPasswordModal');
    if (modal) modal.classList.remove('active');
}

async function eseguiCambioPassword(event) {
    if (event) event.preventDefault();
    
    const inputVecchia = document.getElementById('inputVecchiaPassword');
    const inputNuova = document.getElementById('inputNuovaPassword');
    const nominativo = getNominativoCorrente();

    if (!nominativo) {
        mostraMessaggioModal('Nessun animatore selezionato o identificato.', 'error');
        return;
    }

    const vecchiaPassword = inputVecchia ? inputVecchia.value.trim() : '';
    const nuovaPassword = inputNuova ? inputNuova.value.trim() : '';

    // 1. Validazione input obbligatori
    if (!vecchiaPassword) {
        mostraMessaggioModal('Inserisci la password attuale!', 'error');
        return;
    }

    if (!nuovaPassword) {
        mostraMessaggioModal('Inserisci la nuova password!', 'error');
        return;
    }

    if (nuovaPassword.length < 4) {
        mostraMessaggioModal('La nuova password deve contenere almeno 4 caratteri!', 'error');
        return;
    }

    try {
        // 2. Recupera l'animatore dal DB tramite il nominativo
        const { data: dbUser, error: fetchError } = await sb
            .from('animatori')
            .select('*')
            .eq('nominativo', nominativo)
            .maybeSingle();

        if (fetchError || !dbUser) {
            mostraMessaggioModal('Account non trovato nel database.', 'error');
            return;
        }

        const passDB = dbUser.Password || dbUser.password || '';

        // 3. CONTROLLO RIGIDO: La password attuale deve coincidere perfettamente
        if (vecchiaPassword !== passDB) {
            mostraMessaggioModal('La password attuale inserita non è corretta!', 'error');
            return;
        }

        // 4. Aggiornamento password nel DB
        const { error: updateError } = await sb
            .from('animatori')
            .update({ Password: nuovaPassword })
            .eq('id_animatore', dbUser.id_animatore);

        if (updateError) {
            mostraMessaggioModal('Errore salvataggio: ' + updateError.message, 'error');
        } else {
            mostraMessaggioModal('Password aggiornata con successo!', 'success');
            setTimeout(() => {
                chiudiModalCambiaPassword();
            }, 1200);
        }

    } catch (err) {
        console.error("Errore cambio password:", err);
        mostraMessaggioModal('Errore di connessione al database.', 'error');
    }
}

function mostraMessaggioModal(testo, tipo) {
    const msg = document.getElementById('msgCambioPassword');
    if (!msg) return;
    msg.textContent = testo;
    msg.className = `msg-box ${tipo}`;
    msg.style.display = 'block';
}

window.apriModalCambiaPassword = apriModalCambiaPassword;
window.chiudiModalCambiaPassword = chiudiModalCambiaPassword;
window.eseguiCambioPassword = eseguiCambioPassword;

function getSelectedAccount() {
    const urlParams = new URLSearchParams(window.location.search);
    const selectedIdFromUrl = urlParams.get('selectedAccountId');
    if (selectedIdFromUrl) {
        try {
            localStorage.setItem('selectedAccountId', selectedIdFromUrl);
            sessionStorage.setItem('selectedAccountId', selectedIdFromUrl);
        } catch (e) { /* ignore */ }
    }

    const selectedId = selectedIdFromUrl || localStorage.getItem('selectedAccountId') || sessionStorage.getItem('selectedAccountId');
    return selectedId ? animatoriAccounts.find(acc => String(acc.id) === selectedId) || null : null;
}

function getStoredDailyEvaluations() {
    try {
        const raw = localStorage.getItem(DAILY_EVALUATION_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
        console.warn('Impossibile leggere le valutazioni giornaliere salvate:', error);
        return {};
    }
}

function saveStoredDailyEvaluations(evaluations) {
    try {
        localStorage.setItem(DAILY_EVALUATION_STORAGE_KEY, JSON.stringify(evaluations));
    } catch (error) {
        console.warn('Impossibile salvare le valutazioni giornaliere:', error);
    }
}

function getEvaluationScore(value) {
    switch (String(value || '').toLowerCase()) {
        case 'ottimo':
            return 2;
        case 'neutro':
            return 1;
        case 'attento':
            return 0;
        default:
            return null;
    }
}

function getBehaviorMoodFromAverage(average) {
    if (average === null || Number.isNaN(average)) return 'neutral';
    if (average >= 1.5) return 'happy';
    if (average >= 0.75) return 'neutral';
    return 'sad';
}

function getBehaviorSummary(account) {
    if (!account) {
        return {
            mood: 'neutral',
            message: 'L’andamento sarà mostrato dopo la selezione dell’account.',
            average: null,
            hasEvaluations: false
        };
    }

    const evaluations = getStoredDailyEvaluations();
    const accountKey = String(account.id);
    const accountValues = evaluations[accountKey] || {};
    const scores = Object.values(accountValues)
        .map(value => getEvaluationScore(value))
        .filter(score => score !== null);

    if (!scores.length) {
        const fallbackMood = account.mood || account.umore || account.statoUmorismo || 'neutral';
        const fallbackMessage = account.behaviorMessage || account.statoUmorismo || 'Nessun avviso comportamentale.';
        return {
            mood: fallbackMood.toString().toLowerCase().includes('ottimo') || fallbackMood.toString().toLowerCase().includes('happy') ? 'happy'
                : fallbackMood.toString().toLowerCase().includes('attento') || fallbackMood.toString().toLowerCase().includes('attenzione') || fallbackMood.toString().toLowerCase().includes('problemi') ? 'sad'
                : 'neutral',
            message: fallbackMessage,
            average: null,
            hasEvaluations: false
        };
    }

    const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const percentage = Math.round((average / 2) * 100);
    const label = average >= 1.5 ? 'ottimo' : average >= 0.75 ? 'stabile' : 'attenzione';

    return {
        mood: getBehaviorMoodFromAverage(average),
        message: `Andamento comportamentale: media ${average.toFixed(1)}/2 (${percentage}% ${label}).`,
        average,
        hasEvaluations: true
    };
}

function saveDailyEvaluation(animatoreId, giorno, value) {
    const evaluations = getStoredDailyEvaluations();
    const accountValues = evaluations[String(animatoreId)] || {};

    if (value) {
        accountValues[giorno] = value;
    } else {
        delete accountValues[giorno];
    }

    evaluations[String(animatoreId)] = accountValues;
    saveStoredDailyEvaluations(evaluations);
    window.dispatchEvent(new CustomEvent('grest-evaluations-updated', {
        detail: { animatoreId, giorno, value }
    }));
}

/* =========================================================
   HELPER: caricamento bambini (con cache)
   Tabella "bambini" → id_bambini, nome, cognome, classe, squadra (int4)
   ========================================================= */
let bambiniCacheGrest = null;
let bambiniCachePromise = null;

async function caricaTuttiBambiniGrest() {
    if (bambiniCacheGrest) return bambiniCacheGrest;
    if (bambiniCachePromise) return bambiniCachePromise;

    if (typeof sb === 'undefined' || !sb) {
        console.warn('[appello] Supabase non disponibile per caricare bambini');
        return [];
    }

    bambiniCachePromise = (async () => {
        try {
            const { data, error } = await sb
                .from('bambini')
                .select('id_bambini, nome, cognome, classe, squadra');

            if (error) throw error;

            bambiniCacheGrest = (data || []).map(b => ({
                id: b.id_bambini,
                id_bambino: b.id_bambini,
                nome: b.nome,
                cognome: b.cognome,
                classe: b.classe,
                squadra: b.squadra,      // int4 → riferimento a squadre.id_squadra
                tipo: 'bambino'
            }));

            console.log(`[squadra] Bambini caricati: ${bambiniCacheGrest.length}`);
            return bambiniCacheGrest;
        } catch (err) {
            console.error('[squadra] Errore caricamento bambini:', err);
            return [];
        } finally {
            bambiniCachePromise = null;
        }
    })();

    return bambiniCachePromise;
}

function resetCacheBambiniGrest() {
    bambiniCacheGrest = null;
    bambiniCachePromise = null;
}

async function updateDashboard() {
    const account = getSelectedAccount();
    const inputDate = document.getElementById('activityDate');
    const date = inputDate ? parseDateValue(inputDate.value) || new Date() : new Date();

    const nameEl = document.getElementById('selectedAccountName');
    const roleEl = document.getElementById('selectedAccountRole');
    const teamEl = document.getElementById('selectedAccountTeam');
    const teamInfo = document.getElementById('teamInfo');
    const membersEl = document.getElementById('teamMembers');
    const poolInfo = document.getElementById('poolInfo');
    const menuInfo = document.getElementById('menuInfo');
    const allergyInfo = document.getElementById('allergyInfo');
    const behaviorMessage = document.getElementById('behaviorMessage');
    const currentAccountLabel = document.getElementById('currentAccountLabel');

    if (!account) {
        if (currentAccountLabel) currentAccountLabel.textContent = 'Nessun account selezionato';
        if (nameEl) nameEl.textContent = 'Nessun account selezionato';
        if (roleEl) roleEl.textContent = 'Ruolo: -';
        if (teamEl) teamEl.textContent = 'Squadra: -';
        if (teamInfo) teamInfo.textContent = 'Seleziona un account per vedere la squadra.';
        if (membersEl) membersEl.innerHTML = '';
        if (poolInfo) poolInfo.textContent = 'Seleziona un account e un giorno per controllare la piscina.';

        const refereeInfo = document.getElementById('refereeInfo');
        const dailyGameInfo = document.getElementById('dailyGameInfo');
        if (refereeInfo) refereeInfo.textContent = '-';
        if (dailyGameInfo) dailyGameInfo.textContent = '-';

        if (menuInfo) menuInfo.textContent = await getMenuTextForDate(date, null);
        if (allergyInfo) allergyInfo.textContent = '-';
        if (behaviorMessage) behaviorMessage.textContent = 'L’andamento sarà mostrato dopo la selezione dell’account.';
        updateMoodDisplay(null);
        return;
    }

    const nomeCompleto = `${account.nome || '-'} ${account.cognome || ''}`.trim();
    if (currentAccountLabel) currentAccountLabel.textContent = nomeCompleto;
    if (nameEl) nameEl.textContent = nomeCompleto;

    // 1. Ruolo pulito
    const ruoloPulito = typeof getBaseRole === 'function'
        ? getBaseRole(account.ruolo)
        : String(account.ruolo || '-').split('(')[0].trim();
    if (roleEl) roleEl.textContent = `Ruolo: ${ruoloPulito}`;

    // 2. Lista squadre (dal DB)
    let listaSquadre = typeof SQUADRE !== 'undefined' ? SQUADRE : (window.SQUADRE || []);
    if ((!listaSquadre || listaSquadre.length === 0) && typeof sb !== 'undefined') {
        const { data: dbSquadre } = await sb.from('squadre').select('*');
        if (dbSquadre) {
            listaSquadre = dbSquadre;
            window.SQUADRE = dbSquadre;
        }
    }

    // Risoluzione ID → Nome squadra
    const squadraRaw = String(account.squadra || account.id_squadra || '').trim();
    let squadraNome = squadraRaw;

    const sqTrovata = listaSquadre.find(s =>
        String(s.id_squadra) === squadraRaw ||
        String(s.id) === squadraRaw ||
        String(s.nome).toLowerCase() === squadraRaw.toLowerCase()
    );
    if (sqTrovata && sqTrovata.nome) {
        squadraNome = sqTrovata.nome;
    }

    if (teamEl) teamEl.textContent = `Squadra: ${squadraNome || '-'}`;

    // 3. Membri della squadra: animatori + bambini
    const normalizza = v => String(v ?? '').trim();

    const matchSquadra = m => {
        const mSquadra = normalizza(m.squadra || m.id_squadra);
        if (!mSquadra) return false;
        if (mSquadra === squadraRaw) return true;
        if (squadraNome && m.squadraNome) {
            return normalizza(m.squadraNome).toLowerCase() ===
                   normalizza(squadraNome).toLowerCase();
        }
        return false;
    };

    const animatoriSquadra = squadraRaw
        ? (animatoriAccounts || []).filter(matchSquadra).map(m => ({
            ...m,
            id: m.id_animatore ?? m.id,
            id_animatore: m.id_animatore ?? m.id,
            tipo: 'animatore'
        }))
        : [];

    const tuttiBambini = await caricaTuttiBambiniGrest();
    const bambiniSquadra = squadraRaw
        ? tuttiBambini.filter(matchSquadra)
        : [];

    const ordinaPerCognome = (a, b) =>
        String(a.cognome || '').localeCompare(String(b.cognome || ''), 'it');
    bambiniSquadra.sort(ordinaPerCognome);
    animatoriSquadra.sort(ordinaPerCognome);

    const members = [...bambiniSquadra, ...animatoriSquadra];

    console.log(
        `[squadra] id="${squadraRaw}" nome="${squadraNome}" → ` +
        `${animatoriSquadra.length} animatori, ${bambiniSquadra.length} bambini`,
        { animatoriSquadra, bambiniSquadra }
    );

    if (teamInfo) {
        teamInfo.textContent = members.length
            ? `La tua squadra è ${squadraNome} con ${members.length} component${members.length < 2 ? 'e' : 'i'}.`
            : 'Nessuna squadra assegnata.';
    }

    renderComponentiSquadra(members, account.id ?? account.id_animatore);

    // 4. Controllo Piscina
    if (poolInfo) {
        const squadraValida = squadraNome && squadraNome !== '-' && squadraNome.toLowerCase() !== 'nessuna';

        let turnoPiscina = squadraValida ? getTurnoPiscinaSquadra(squadraNome, date) : null;
        if (!turnoPiscina && squadraValida) {
            turnoPiscina = getTurnoPiscinaSquadra(squadraRaw, date)
                || getTurnoPiscinaSquadra(squadraNome.toLowerCase(), date);
        }

        poolInfo.textContent = !squadraValida
            ? 'Devi far parte di una squadra per sapere il risultato della piscina.'
            : turnoPiscina
                ? `Risultato piscina: la squadra ${squadraNome} è in piscina di ${turnoPiscina.toLowerCase()}.`
                : 'Risultato piscina: oggi non si è in piscina.';
    }

    if (menuInfo) menuInfo.textContent = await getMenuTextForDate(date, account);
    if (allergyInfo) allergyInfo.textContent = formatAllergies(account.allergie);
    const behaviorSummary = getBehaviorSummary(account);
    if (behaviorMessage) behaviorMessage.textContent = behaviorSummary.message;

    updateMoodDisplay(account, behaviorSummary.mood);

    if (typeof aggiornaInfoArbitraggioEGioco === 'function') {
        await aggiornaInfoArbitraggioEGioco(account, date);
    }

    if (account && account.id_animatore) {
        localStorage.setItem('selectedAnimatoreId', account.id_animatore);
    }
}

function updateMoodDisplay(account, moodOverride = null) {
    const mood = moodOverride || (account ? (account.mood || account.umore || account.statoUmorismo || 'neutral') : 'neutral');
    const normalized = mood.toString().toLowerCase();
    const activeMood = (normalized.includes('ottimo') || normalized.includes('happy')) ? 'happy'
        : (normalized.includes('attento') || normalized.includes('sad') || normalized.includes('problemi') || normalized.includes('attenzione')) ? 'sad'
        : 'neutral';

    document.querySelectorAll('.face-card').forEach(card => {
        card.classList.toggle('active', card.dataset.mood === activeMood);
    });
}

function formatAllergies(allergies) {
    if (!allergies) return 'Nessuna allergia segnalata.';
    if (Array.isArray(allergies)) {
        return allergies.length ? `Allergie: ${allergies.join(', ')}` : 'Nessuna allergia segnalata.';
    }
    return `Allergie: ${allergies}`;
}

async function getMenuForDate(date) {
    // 1. Assicura che la data sia un oggetto Date valido
    const dateObj = (date instanceof Date && !isNaN(date)) ? date : new Date(date);
    if (isNaN(dateObj)) return 'Data non valida.';

    // 2. Formatta la data nel formato del tuo txt (DD/MM/YYYY)
    const dd = String(dateObj.getDate()).padStart(2, '0');
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const yyyy = dateObj.getFullYear();
    const dataStr = `${dd}/${mm}/${yyyy}`;

    try {
        // 3. Legge il file di testo (assicurati che il percorso sia corretto)
        const response = await fetch('testi/mensa.txt'); 
        
        if (!response.ok) {
            throw new Error(`Impossibile leggere il file: ${response.statusText}`);
        }
        
        const text = await response.text();
        const lines = text.split('\n');

        // 4. Cerca la riga corrispondente alla data
        for (let line of lines) {
            line = line.trim();
            
            // Se la riga inizia con la data che cerchiamo (es. "02/08/2026")
            if (line.startsWith(dataStr)) {
                // Prende tutto quello che c'è dopo la data e i due punti
                return line.substring(dataStr.length + 1).trim(); 
            }
        }
        
        // Se il ciclo finisce e non ha trovato la data
        return 'Nessun menu programmato per questa data.';

    } catch (error) {
        console.error("Errore durante la lettura del menu:", error);
        return 'Pranzo leggero con pane e frutta.'; // Il tuo fallback in caso di errore
    }
}

function getPublishedActivitiesText() {
    try {
        const stored = localStorage.getItem('grest_published_activities');
        return stored && stored.trim() ? stored : null;
    } catch (error) {
        console.warn('Errore lettura attività pubblicate:', error);
        return null;
    }
}

function getPendingActivitiesText() {
    try {
        const stored = localStorage.getItem('grest_pending_activities');
        return stored && stored.trim() ? stored : null;
    } catch (error) {
        console.warn('Errore lettura attività in sospeso:', error);
        return null;
    }
}

async function aggiornaInfoArbitraggioEGioco(account, date) {
    const refereeInfoEl = document.getElementById('refereeInfo');
    const dailyGameInfoEl = document.getElementById('dailyGameInfo');

    if (!refereeInfoEl || !dailyGameInfoEl) return;

    if (!account || !date) {
        refereeInfoEl.textContent = '-';
        dailyGameInfoEl.textContent = '-';
        return;
    }

    const dateObj = (date instanceof Date && !isNaN(date)) ? date : new Date(date);
    if (isNaN(dateObj)) return;

    const pulisciStringa = (str) => String(str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const TESTO_MANCANTE = "Gioco non ancora registrato";

    // 1. Lettura giochi del giorno da Supabase
    const dd = String(dateObj.getDate()).padStart(2, '0');
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const yyyy = dateObj.getFullYear();
    const dataStrIT = `${dd}/${mm}/${yyyy}`;
    const dataStrISO = `${yyyy}-${mm}-${dd}`;

    let giocoMattina = TESTO_MANCANTE;
    let giocoPomeriggio = TESTO_MANCANTE;

    try {
        const { data, error } = await sb
            .from('programmazione')
            .select('*')
            .or(`data_attivita.eq.${dataStrIT},data_attivita.eq.${dataStrISO}`);

        if (!error && data && data.length > 0) {
            const itemMattina = data.find(item => pulisciStringa(item.fascia) === 'mattina');
            const itemPomeriggio = data.find(item => pulisciStringa(item.fascia) === 'pomeriggio');

            if (itemMattina?.nome_attivita?.trim()) giocoMattina = itemMattina.nome_attivita.trim();
            if (itemPomeriggio?.nome_attivita?.trim()) giocoPomeriggio = itemPomeriggio.nome_attivita.trim();
        }
    } catch (err) {
        console.error("Errore lettura giochi DB:", err);
    }

    // 2. Giorno del calendario
    let giornoNome = typeof getItalianWeekdayName === 'function' ? getItalianWeekdayName(dateObj) : '';
    if (!giornoNome) {
        giornoNome = dateObj.toLocaleDateString('it-IT', { weekday: 'long' });
    }
    const giornoSelezionato = pulisciStringa(giornoNome);

    // 3. RECUPERO MEMORIA LOCALE tramite la TUA funzione
    const assignment = typeof getLocalGameAssignment === 'function' ? getLocalGameAssignment(account) : null;
    
    // LOG DIAGNOSTICI - Controlla la console!
    console.log("--- DEBUG ARBITRAGGIO ---");
    console.log("1. Account analizzato:", account.nome, account.cognome);
    console.log("2. Assegnazione trovata in memoria:", assignment);

    let giocoAssegnato = null;
    let giornoAssegnatoPulito = null;

    if (assignment) {
        giocoAssegnato = assignment.game;
        giornoAssegnatoPulito = pulisciStringa(assignment.day);
    }

    console.log("3. Giorno del calendario (pulito):", giornoSelezionato);
    console.log("4. Giorno assegnato in memoria (pulito):", giornoAssegnatoPulito);

    const eIlGiornoGiusto = (giornoAssegnatoPulito === giornoSelezionato);
    console.log("5. È il giorno giusto?", eIlGiornoGiusto);
    console.log("-------------------------");

    // 4. Match
    let gestisceMattina = false;
    let gestiscePomeriggio = false;

    if (eIlGiornoGiusto && giocoAssegnato) {
        const giocoAssegnatoPulito = pulisciStringa(giocoAssegnato);
        const giocoMattinaPulito = pulisciStringa(giocoMattina);
        const giocoPomeriggioPulito = pulisciStringa(giocoPomeriggio);

        if (giocoMattina !== TESTO_MANCANTE && (giocoMattinaPulito.includes(giocoAssegnatoPulito) || giocoAssegnatoPulito.includes(giocoMattinaPulito))) {
            gestisceMattina = true;
        }
        if (giocoPomeriggio !== TESTO_MANCANTE && (giocoPomeriggioPulito.includes(giocoAssegnatoPulito) || giocoAssegnatoPulito.includes(giocoPomeriggioPulito))) {
            gestiscePomeriggio = true;
        }

        if (!gestisceMattina && !gestiscePomeriggio) {
            gestisceMattina = true; 
        }
    }

    // 5. Scrittura a schermo HTML
    if (gestisceMattina && gestiscePomeriggio) {
        refereeInfoEl.innerHTML = `<strong>Gestione:</strong> Entrambi i giochi`;
    } else if (gestisceMattina) {
        refereeInfoEl.innerHTML = `<strong>Gestione:</strong> Gioco Mattina`;
    } else if (gestiscePomeriggio) {
        refereeInfoEl.innerHTML = `<strong>Gestione:</strong> Gioco Pomeriggio`;
    } else {
        refereeInfoEl.textContent = 'Nessun gioco da gestire oggi';
    }

    const stileEvidenziato = 'color: #FF8C1A; font-weight: bold; background: rgba(255, 140, 26, 0.18); padding: 2px 6px; border-radius: 4px;';

    const rigoMattina = gestisceMattina
        ? `<span style="${stileEvidenziato}">Mattina: ${giocoMattina} (Gestisci tu)</span></br>`
        : `<span>Mattina: ${giocoMattina}</span></br>`;

    const rigoPomeriggio = gestiscePomeriggio
        ? `<span style="${stileEvidenziato}">Pomeriggio: ${giocoPomeriggio} (Gestisci tu)</span>`
        : `<span>Pomeriggio: ${giocoPomeriggio}</span>`;

    dailyGameInfoEl.innerHTML = `${rigoMattina}<br style="display:block; margin-top:4px;">${rigoPomeriggio}`;
}

function dettaglioGioco(animatore) {
    if (!animatore) return '-';

    // Recupera il ruolo base in modo sicuro
    const baseRole = typeof getBaseRole === 'function' 
        ? getBaseRole(animatore.ruolo) 
        : (animatore.ruolo || '').split('(')[0].trim();

    const localAssignment = typeof getLocalGameAssignment === 'function' ? getLocalGameAssignment(animatore) : null;
    if (localAssignment && localAssignment.day && localAssignment.game) {
        return `${baseRole} (gioco: ${localAssignment.game} - ${localAssignment.day})`;
    }

    const metadata = typeof parseRoleMetadata === 'function' ? parseRoleMetadata(animatore.ruolo || '') : {};
    if (metadata.tipo === 'gioco' && metadata.dettaglio) {
        return `${baseRole} (gioco: ${metadata.dettaglio}${metadata.giorno ? ` - ${metadata.giorno}` : ''})`;
    }

    return '-';
}

function selezionaMenuPerData(testoFile, data) {
    const righe = testoFile.split(/\r?\n/).map(riga => riga.trim()).filter(Boolean);
    const targetDate = formatDateForLookup(data);

    for (const riga of righe) {
        const match = riga.match(/^(.+?)\s*:\s*(.+)$/);
        if (!match) continue;

        const [, giorno, descrizione] = match;
        const parsedFileDate = parseDateValue(giorno.trim());
        const isDateMatch = parsedFileDate ? formatDateForLookup(parsedFileDate) === targetDate : false;

        if (isDateMatch) {
            return descrizione.trim();
        }
    }

    return null;
}

async function getMenuTextForDate(date, account = null) {
    if (account && account.menu) {
        return account.menu;
    }

    try {
        const response = await fetch('testi/mensa.txt');
        if (!response.ok) throw new Error('File non trovato');
        const testo = await response.text();
        const menuDalFile = selezionaMenuPerData(testo, date);
        if (menuDalFile) {
            return menuDalFile;
        }
    } catch (error) {
        console.warn('Impossibile caricare il menu dalla lista:', error);
    }

    return getMenuForDate(date);
}

function formattaDataPerAttivita(date) {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    const giorno = String(d.getDate()).padStart(2, '0');
    const mese = String(d.getMonth() + 1).padStart(2, '0');
    const anno = d.getFullYear();
    return `${giorno}/${mese}/${anno}`;
}

function getDailyGameForDate(date) {
    const dataFormattata = formattaDataPerAttivita(date);
    
    if (mappaAttivita[dataFormattata]) {
        return {
            mattina: mappaAttivita[dataFormattata].mattina || '',
            
            pomeriggio: mappaAttivita[dataFormattata].pomeriggio || ''
        };
    }

    return { mattina: '', pomeriggio: '' };
}

function isPoolDay(date) {
    return [2, 4].includes(date.getDay()); // Martedì e Giovedì
}

async function popolaSelectSquadrePiscina() {
    let listaSquadre = typeof SQUADRE !== 'undefined' ? SQUADRE : (window.SQUADRE || []);

    if ((!listaSquadre || listaSquadre.length === 0) && typeof sb !== 'undefined') {
        const { data } = await sb.from('squadre').select('*');
        if (data) {
            listaSquadre = data;
            window.SQUADRE = data;
        }
    }

    const dropdowns = document.querySelectorAll('.piscinaSquadreSelect');
    dropdowns.forEach(select => {
        // Mantiene l'opzione "Nessuna"
        select.innerHTML = '<option value="">Nessuna</option>'; 
        
        listaSquadre.forEach(sq => {
            const opt = document.createElement('option');
            opt.value = sq.nome; // Salva il nome esatto (es. "Rossa", "Blu")
            opt.textContent = sq.nome;
            select.appendChild(opt);
        });
    });
}

// Chiamala all'avvio dell'applicazione
document.addEventListener("DOMContentLoaded", popolaSelectSquadrePiscina);

function getRefereeStatus(account, date) {
    if (!account || !date) return 'Non arbitri oggi.';

    const role = (account.ruolo || '').toLowerCase();
    if (role.includes('arbitro')) {
        return 'Sì, sei designato per arbitrare un gioco oggi.';
    }
    if (date.getDay() === 2) {
        return 'Oggi sei stato scelto come gestore di gioco.';
    }
    return 'Non arbitri oggi.';
}

function caricaEParserizzaListaAttivita(testoTxt) {
    catalogoAttivita = []; // Svuota il catalogo attuale
    
    // Divide il testo per righe
    const righe = testoTxt.split(/\r?\n/);

    righe.forEach(riga => {
            const rigaPulita = riga.trim();
            if (!rigaPulita) return; // Salta le righe vuote
    
            // 1. Prova prima a dividere SOLO per ';'
            let elementi = rigaPulita.split(';').map(item => item.trim()).filter(Boolean);
    
            // 2. Se non trova ';' nella riga, usa come ruota di scorta i doppi/tripli spazi
            if (elementi.length < 2) {
                elementi = rigaPulita.split(/\s{2,}/).map(item => item.trim()).filter(Boolean);
            }
        
            // Assegna correttamente i 4 campi
            if (elementi.length >= 1) {
                const categoria = elementi[0] || "Senza Categoria";
                const nome = elementi[1] || "Senza Nome";
                const descrizione = elementi[2] || "Nessuna descrizione";
                // Se ci sono più elementi oltre al secondo, li unisce nei materiali
                const materiali = elementi.slice(3).join(' - ') || "Nessun materiale specificato";
            
                catalogoAttivita.push({
                    categoria: categoria,
                    nome: nome,
                    descrizione: descrizione,
                    materiali: materiali
                });
            }
        });
    
        console.log("Catalogo attività caricato con successo:", catalogoAttivita);
    
        // Aggiorna la lista visibile a schermo
        if (typeof popolaListaInterfaccia === 'function') {
            popolaListaInterfaccia();
        }
    }

/**
 * Converte il testo grezzo di attività.txt in una mappa strutturata
 */
function caricaEParserizzaAttivita(testoTxt) {
    listaAttivita = [];// Divide il testo in righe e rimuove eventuali righe vuote
    const righe = testoTxt.split(/\r?\n/).filter(Boolean);

    righe.forEach(riga => {
        // Usa \t per dividere gli elementi separati da Tab
        const elementi = riga.split(';');
        
        /// Assegna i valori con fallback sicuro prima di eseguire .trim()
        const categoria = (elementi[0] || "Generale").trim();
        const nome = (elementi[1] || "Senza Nome").trim();
        const descrizione = (elementi[2] || "Nessuna descrizione").trim();
        const materiali = (elementi[3] || "Nessun materiale").trim();

        // Aggiunge l'attività solo se almeno il nome è valido
        if (nome) {
            listaAttivita.push({
                categoria: categoria,
                nome: nome,
                descrizione: descrizione,
                materiali: materiali
            });
        }
    });
    
    console.log("Attività caricate con successo:", listaAttivita);

    if (typeof popolaListaInterfaccia === 'function') {
        popolaListaInterfaccia();
    }
}

function popolaSelectGiochi() {
    const selectEl = document.getElementById('editGameSelect');
    if (!selectEl) return;

    // Resetta il contenuto del selettore
    selectEl.innerHTML = '';

    // Opzione di default
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Seleziona un gioco';
    defaultOption.disabled = true;
    defaultOption.selected = true;
    defaultOption.style.color = '#888888';
    selectEl.appendChild(defaultOption);

    // Mappa per raggruppare i giochi per categoria
    const categorieMap = {};

    // 1. Se esiste il catalogo attività completo, raggruppa per la sua categoria
    if (typeof catalogoAttivita !== 'undefined' && Array.isArray(catalogoAttivita) && catalogoAttivita.length > 0) {
        catalogoAttivita.forEach(att => {
            const cat = att.categoria || 'Generale';
            if (!categorieMap[cat]) categorieMap[cat] = new Set();
            if (att.nome && att.nome.trim()) {
                categorieMap[cat].add(att.nome.trim());
            }
        });
    } else if (typeof mappaAttivita !== 'undefined') {
        // Fallback: se non c'è ancora il catalogo, usa la mappa delle attività programmate
        categorieMap['Attività Programmate'] = new Set();
        Object.values(mappaAttivita).forEach(giorno => {
            if (giorno.mattina && giorno.mattina.trim()) categorieMap['Attività Programmate'].add(giorno.mattina.trim());
            if (giorno.pomeriggio && giorno.pomeriggio.trim()) categorieMap['Attività Programmate'].add(giorno.pomeriggio.trim());
        });
    }

    // 2. Popola i gruppi (<optgroup>) nel selettore in ordine alfabetico
    Object.keys(categorieMap).sort().forEach(nomeCategoria => {
        const giochiOrdinati = Array.from(categorieMap[nomeCategoria]).sort();
        if (giochiOrdinati.length === 0) return;

        // Crea il gruppo per la categoria
        const optgroup = document.createElement('optgroup');
        optgroup.label = `📁 ${nomeCategoria}`;

        // Inserisce i giochi della categoria
        giochiOrdinati.forEach(gioco => {
            const option = document.createElement('option');
            option.value = gioco;
            option.textContent = gioco;
            option.style.color = '#000000'; // Testo nero per visibilità nei menu a tendina
            optgroup.appendChild(option);
        });

        selectEl.appendChild(optgroup);
    });
}

function apriModalProgrammazione() {
    const nome = document.getElementById('dettaglio-nome').textContent;
    if (!nome || nome === "Seleziona un'attività") {
        alert("Seleziona prima un'attività dalla lista!");
        return;
    }

    selezioneProgramma.attivitaNome = nome;
    document.getElementById('modal-programmazione').classList.remove('nascosto');
    stepSelezionaSettimana();
}

function chiudiModalProgrammazione() {
    document.getElementById('modal-programmazione').classList.add('nascosto');
}

// FASE 1: Scelta della Settimana
function stepSelezionaSettimana() {
    const container = document.getElementById('modal-step-content');
    container.innerHTML = `
        <h3 class="modal-step-title">Seleziona la Settimana</h3>
        <div class="modal-options-grid">
            <button class="btn-opzione-modal" onclick="confermaSettimana(0)">Settimana 1</button>
            <button class="btn-opzione-modal" onclick="confermaSettimana(1)">Settimana 2</button>
            <button class="btn-opzione-modal" onclick="confermaSettimana(2)">Settimana 3</button>
        </div>
    `;
}

function confermaSettimana(idx) {
    selezioneProgramma.settimanaIndex = idx;
    stepSelezionaGiorno();
}

// FASE 2: Scelta del Giorno
function stepSelezionaGiorno() {
    const giorni = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì'];
    const container = document.getElementById('modal-step-content');
    
    let html = `<h3 class="modal-step-title">In quale giorno?</h3><div class="modal-options-grid">`;
    giorni.forEach((giorno, idx) => {
        html += `<button class="btn-opzione-modal" onclick="confermaGiorno(${idx})">${giorno}</button>`;
    });
    html += `</div>`;
    
    container.innerHTML = html;
}

function confermaGiorno(idx) {
    selezioneProgramma.giornoIndex = idx;
    stepSelezionaFascia();
}

// FASE 3: Scelta della Fascia
function stepSelezionaFascia() {
    const container = document.getElementById('modal-step-content');
    container.innerHTML = `
        <h3 class="modal-step-title">Quando la vuoi fare?</h3>
        <div class="modal-options-grid">
            <button class="btn-opzione-modal" onclick="salvaProgrammazione('Mattina')">Mattina</button>
            <button class="btn-opzione-modal" onclick="salvaProgrammazione('Pomeriggio')">Pomeriggio</button>
        </div>
    `;
}

// Salvataggio finale e Generazione attivita.txt
function salvaProgrammazione(fascia) {
    selezioneProgramma.fascia = fascia;

    // Calcolo della data effettiva (Settimana * 7 + Giorno)
    const giorniOffset = (selezioneProgramma.settimanaIndex * 7) + selezioneProgramma.giornoIndex;
    const dataCalcolata = new Date(GREST_START);
    dataCalcolata.setDate(dataCalcolata.getDate() + giorniOffset);

    // Formattazione data DD/MM/YYYY
    const dd = String(dataCalcolata.getDate()).padStart(2, '0');
    const mm = String(dataCalcolata.getMonth() + 1).padStart(2, '0');
    const yyyy = dataCalcolata.getFullYear();
    const dataStr = `${dd}/${mm}/${yyyy}`;

    // Aggiunta record al registro
    registroProgrammazione.push({
        dataObj: dataCalcolata,
        dataStr: dataStr,
        fascia: fascia,
        nome: selezioneProgramma.attivitaNome,
        settimanaIndex: selezioneProgramma.settimanaIndex,
        giornoIndex: selezioneProgramma.giornoIndex
    });

    // Riordino cronologico per Data e per Fascia (Mattina prima di Pomeriggio)
    registroProgrammazione.sort((a, b) => {
        if (a.dataObj.getTime() !== b.dataObj.getTime()) {
            return a.dataObj - b.dataObj;
        }
        return a.fascia === 'Mattina' ? -1 : 1;
    });

    // Genera il testo del file attivita.txt
    aggiornaFileAttivitaTxt();

    chiudiModalProgrammazione();
}
// ==========================================
// 6. Utility e Caricamento Testi Esterni
// ==========================================

function parseDateValue(value) {
    if (!value) return null;
    if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
            const [y, m, d] = trimmed.split('-').map(Number);
            return new Date(y, m - 1, d);
        }
        if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(trimmed)) {
            const [d, m, y] = trimmed.split(/[\/\-]/).map(Number);
            return new Date(y, m - 1, d);
        }
    }
    return null;
}

function parseSettimaneDaRiga(values) {
    const joined = (values || []).join(' ');
    const matches = joined.match(/[1-3]/g);
    return matches ? [...new Set(matches.map(String))] : [];
}

async function importaAnimatoriDaFile() {
    if (!sb) {
        mostraNotifica('Client Supabase non pronto.', 'error');
        return;
    }

    const input = document.getElementById('importAnimatoriFile');
    const file = input?.files?.[0];
    if (!file) {
        mostraNotifica('Seleziona un file prima di importare.', 'error');
        return;
    }

    try {
        let rows = [];
        const nomeFile = file.name.toLowerCase();

        if (nomeFile.endsWith('.xlsx') || nomeFile.endsWith('.xlsm') || nomeFile.endsWith('.xls')) {
            if (typeof window.XLSX === 'undefined') {
                throw new Error('Il parser Excel non è disponibile.');
            }
            const buffer = await file.arrayBuffer();
            const workbook = window.XLSX.read(buffer, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
        } else {
            const testo = await file.text();
            rows = testo
                .split(/\r?\n/)
                .map(riga => riga.split(/\t|,|;/).map(valore => valore.trim()))
                .filter(riga => riga.some(valore => valore));
        }

        const nuoviAnimatori = [];
        const nomiGiaPresenti = new Set((animatoriAccounts || []).map(a => `${a.nome || ''} ${a.cognome || ''}`.trim().toLowerCase()));

        rows.forEach(riga => {
            if (!Array.isArray(riga) || riga.length === 0) return;

            const valori = riga.filter(valore => valore !== undefined && valore !== null && String(valore).trim() !== '');
            if (!valori.length) return;

            const nome = String(valori[0] || '').trim();
            const cognome = String(valori[1] || '').trim();
            const nomeCompleto = `${nome} ${cognome}`.trim().toLowerCase();

            if (!nome || !cognome || nomiGiaPresenti.has(nomeCompleto)) return;

            const settimane = parseSettimaneDaRiga(valori);
            nuoviAnimatori.push({
                nome,
                cognome,
                ruolo: 'animatore',
                settimana: settimane
            });
            nomiGiaPresenti.add(nomeCompleto);
        });

        if (!nuoviAnimatori.length) {
            mostraNotifica('Nessun nuovo animatore da importare.', 'error');
            return;
        }

        const { error } = await sb.from('animatori').insert(nuoviAnimatori);
        if (error) throw error;

        input.value = '';
        await loadAnimatoriAccounts();
        mostraAnimatori();
        mostraNotifica(`Importati ${nuoviAnimatori.length} animatori.`, 'success');
    } catch (error) {
        console.error('Errore importazione animatori:', error);
        mostraNotifica('Errore durante l\'importazione del file.', 'error');
    }
}

async function importaListaAttivitaDaFile() {
    const input = document.getElementById('importAttivitaFile'); // Controlla che questo ID sia corretto nel tuo HTML
    const file = input?.files?.[0];
    
    if (!file) {
        if (typeof mostraNotifica === 'function') mostraNotifica('Seleziona prima un file!', 'error');
        return;
    }

    try {
        const testo = await file.text();
        if (!testo.trim()) return;

        // Salva in localStorage e parserizza
        localStorage.setItem('grest_catalogo_attivita', testo);
        caricaEParserizzaListaAttivita(testo);

        if (typeof mostraNotifica === 'function') mostraNotifica('Catalogo importato con successo!', 'success');
    } catch (error) {
        console.error("Errore lettura file:", error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const salvato = localStorage.getItem('grest_catalogo_attivita');
    
    if (salvato) {
        // Se l'admin ha già importato un file in precedenza, usa quello
        caricaEParserizzaListaAttivita(salvato);
    } else {
        // Altrimenti prova a caricare il file di default dal server
        fetch('testi/lista_attivita.txt')
            .then(res => res.ok ? res.text() : fetch('lista_attivita.txt').then(r => r.text()))
            .then(testo => caricaEParserizzaListaAttivita(testo))
            .catch(err => console.log("Nessun file lista_attivita.txt trovato di default."));
    }
});

async function importaAttivitaDaFile() {
    const input = document.getElementById('importAttivitaFile');
    const file = input?.files?.[0];
    if (!file) {
        mostraNotifica('Seleziona un file prima di importare la lista attività.', 'error');
        return;
    }

    try {
        const testo = await file.text();
        if (!testo.trim()) {
            mostraNotifica('Il file delle attività è vuoto.', 'error');
            return;
        }

        localStorage.setItem('grest_pending_activities', testo);
        mostraNotifica('Lista attività importata. Premi Rilascia attività per pubblicarla.', 'success');
    } catch (error) {
        console.error('Errore importazione attività:', error);
        mostraNotifica('Errore durante l\'importazione della lista attività.', 'error');
    }
}

function parseSettimaneBambino(rawValue) {
    if (rawValue === undefined || rawValue === null) return null;

    const settimaneValide = new Set(['1', '2', '3', '4']);

    const pezzi = String(rawValue)
        .replace(/["'\[\]{}]/g, ' ')      // rimuove virgolette e parentesi
        .split(/[\s,;./\\|\-–—]+/)         // separatori comuni
        .map(s => s.trim())
        .filter(Boolean);

    const uniche = [...new Set(pezzi)].filter(s => settimaneValide.has(s));

    return uniche.length ? uniche : null;
}

async function importaBambiniDaFile() {
    if (!sb) {
        mostraNotifica('Client Supabase non pronto.', 'error');
        return;
    }

    const input = document.getElementById('importBambiniFile');
    const file = input?.files?.[0];
    if (!file) {
        mostraNotifica('Seleziona un file prima di importare.', 'error');
        return;
    }

    try {
        let rows = [];
        const nomeFile = file.name.toLowerCase();

        // Lettura Excel
        if (nomeFile.endsWith('.xlsx') || nomeFile.endsWith('.xlsm') || nomeFile.endsWith('.xls')) {
            if (typeof window.XLSX === 'undefined') {
                throw new Error('Il parser Excel non è disponibile.');
            }
            const buffer = await file.arrayBuffer();
            const workbook = window.XLSX.read(buffer, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            rows = window.XLSX.utils.sheet_to_json(sheet, {
                header: 1,
                blankrows: false,
                defval: ''
            });
        } else {
            // Lettura CSV / TSV / TXT
            const testo = await file.text();
            rows = testo
                .split(/\r?\n/)
                .map(riga => riga.split(/\t|,|;/).map(valore => valore.trim()))
                .filter(riga => riga.some(valore => valore));
        }

        // Salta eventuale intestazione
        if (rows.length && rows[0].some(v => /nome|cognome|classe|settimana/i.test(String(v)))) {
            rows = rows.slice(1);
        }

        if (!rows.length) {
            mostraNotifica('Il file non contiene righe valide.', 'error');
            return;
        }

        // Bambini già presenti (per evitare duplicati)
        const { data: esistenti, error: errEsistenti } = await sb
            .from('bambini')
            .select('nome, cognome');
        if (errEsistenti) throw errEsistenti;

        const nomiGiaPresenti = new Set(
            (esistenti || []).map(b =>
                `${b.nome || ''} ${b.cognome || ''}`.trim().toLowerCase()
            )
        );

        const validi = [];
        const scartati = [];

        rows.forEach((riga, idx) => {
            if (!Array.isArray(riga) || riga.length === 0) return;

            const valori = riga.map(v =>
                v === undefined || v === null ? '' : String(v).trim()
            );
            if (valori.every(v => v === '')) return;

            // 👇 Colonne: Nome | Cognome | Classe | Settimana
            const nome    = valori[0] || '';
            const cognome = valori[1] || '';
            const classe  = valori[2] || null;
            const settTxt = valori[3] || '';

            const settimana = parseSettimaneBambino(settTxt);

            const nomeCompleto = `${nome} ${cognome}`.trim().toLowerCase();

            if (!nome || !cognome) {
                scartati.push({ riga: idx + 1, motivo: 'nome o cognome mancante', valore: riga });
                return;
            }
            if (nomiGiaPresenti.has(nomeCompleto)) {
                scartati.push({ riga: idx + 1, motivo: 'già presente', valore: riga });
                return;
            }

            validi.push({
                nome,
                cognome,
                classe,
                settimana   // array tipo ["1","2"] oppure null
            });
            nomiGiaPresenti.add(nomeCompleto);
        });

        if (!validi.length) {
            const dettaglio = scartati.length
                ? ` (${scartati.length} righe scartate, vedi console)`
                : '';
            console.warn('Righe scartate:', scartati);
            mostraNotifica(`Nessun nuovo bambino da importare${dettaglio}.`, 'error');
            return;
        }

        const { error } = await sb.from('bambini').insert(validi);
        if (error) throw error;

        input.value = '';
        if (scartati.length) {
            console.warn('Righe scartate durante l\'import:', scartati);
        }

        // Invalida cache dei bambini usata dalla dashboard
        if (typeof resetCacheBambiniGrest === 'function') {
            resetCacheBambiniGrest();
        }

        mostraNotifica(
            `Importati ${validi.length} bambin${validi.length === 1 ? 'o' : 'i'}` +
            (scartati.length ? `, ${scartati.length} righe scartate.` : '.'),
            'success'
        );
    } catch (error) {
        console.error('Errore importazione bambini:', error);
        mostraNotifica(
            'Errore durante l\'importazione: ' + (error.message || 'errore sconosciuto'),
            'error'
        );
    }
}

function formatDateForLookup(date) {
    const p = parseDateValue(date);
    if (!p) return '';
    return `${String(p.getDate()).padStart(2, '0')}/${String(p.getMonth() + 1).padStart(2, '0')}/${p.getFullYear()}`;
}

function getItalianDayName(date) {
    const p = parseDateValue(date);
    if (!p) return '';
    return ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'][p.getDay()];
}

function selezionaAttivitaPerData(testoFile, momento, data) {
    const righe = testoFile.split(/\r?\n/).map(r => r.trim()).filter(Boolean);
    const targetDate = formatDateForLookup(data);
    const targetDayName = getItalianDayName(data).toLowerCase();
    const targetMoment = momento.toLowerCase();

    for (const riga of righe) {
        const match = riga.match(/^(.+?)\s*-\s*(Mattina|Pomeriggio)\s*:\s*(.+)$/i);
        if (!match) continue;

        const [, giorno, momentoRiga, descrizione] = match;
        if (momentoRiga.toLowerCase() !== targetMoment) continue;

        const giornoNorm = giorno.trim().toLowerCase();
        const parsedFileDate = parseDateValue(giorno.trim());

        const isDateMatch = parsedFileDate ? formatDateForLookup(parsedFileDate) === targetDate : false;
        const isDayMatch = giornoNorm === targetDayName;

        if (isDateMatch || isDayMatch) {
            return descrizione.trim();
        }
    }
    return '';
}

async function caricaAttivitaDaFile(filePath, elementoId, momento, data = new Date()) {
    try {
        let testo = getPublishedActivitiesText();
        if (!testo) {
            const response = await fetch(filePath);
            if (!response.ok) throw new Error('File non trovato');
            testo = await response.text();
        }

        const elemento = document.getElementById(elementoId);
        if (elemento) {
            const attivita = selezionaAttivitaPerData(testo, momento, data);
            elemento.textContent = attivita || 'Nessuna attività prevista.';
        }
    } catch (error) {
        const elemento = document.getElementById(elementoId);
        if (elemento) elemento.textContent = 'Testo non disponibile.';
    }
}

function aggiornaAttivitaDelGiorno() {
    const inputDate = document.getElementById('activityDate');
    const selectedDate = inputDate ? parseDateValue(inputDate.value) || new Date() : new Date();

    if (document.getElementById('mattinaText')) {
        caricaAttivitaDaFile('testi/lista_attivita.txt', 'mattinaText', 'Mattina', selectedDate);
    }
    if (document.getElementById('pomeriggioText')) {
        caricaAttivitaDaFile('testi/lista_attivita.txt', 'pomeriggioText', 'Pomeriggio', selectedDate);
    }
    // Trova l'ID dell'animatore attualmente selezionato nella tendina
    const idSelezionato = document.getElementById('accountSelect') ? document.getElementById('accountSelect').value : null;
    
    // Cerca tutti i dati di quell'animatore nella lista globale
    const animatoreTrovato = (typeof animatoriAccounts !== 'undefined' && animatoriAccounts) 
        ? animatoriAccounts.find(a => String(a.id) === String(idSelezionato)) 
        : null;

    // Ora che sa chi è, aggiorna il testo dell'arbitraggio
    if (typeof aggiornaInfoArbitraggioEGioco === 'function') {
        aggiornaInfoArbitraggioEGioco(animatoreTrovato);
    }
}

function aggiornaMessaggioAvvisi() {
    const avvisiContent = document.getElementById('avvisiContent');
    if (!avvisiContent) return;
    const testo = (avvisiContent.textContent || '').trim();
    if (!testo || testo === 'Caricamento...' || testo === 'Nessun avviso al momento.') {
        avvisiContent.textContent = 'Nessun avviso al momento.';
    }
}

// Recupera il nominativo dell'utente attualmente loggato/selezionato
function getNominativoUtenteCorrente() {
    // 1. Cerca l'ID dall'elemento di selezione dell'account
    const accountSelect = document.getElementById('accountSelect');
    const selectedId = accountSelect ? accountSelect.value : null;

    let account = null;

    if (selectedId && window.animatoriAccounts) {
        account = window.animatoriAccounts.find(a => String(a.id || a.id_animatore) === String(selectedId));
    }

    // 2. Fallback: cerca da localStorage se presente
    if (!account) {
        try {
            const savedAccount = localStorage.getItem('grest_selected_account');
            if (savedAccount) account = JSON.parse(savedAccount);
        } catch (e) {}
    }

    // 3. Se trovato, restituisce il nominativo formattato esattamente come nella tabella
    if (account) {
        return account.nominativo || `${account.nome || ''} ${account.cognome || ''}`.trim() || 'Anonimo';
    }

    return 'Anonimo';
}

// Aggiorna l'etichetta dell'autore nell'interfaccia degli avvisi
function aggiornaBadgeAutore() {
    const badge = document.getElementById('autoreCorrenteBadge');
    if (badge) {
        badge.textContent = getNominativoUtenteCorrente();
    }
}

// Recupera il nominativo salvato nelle altre pagine
function getAutoreAttivo() {
    return localStorage.getItem('grest_active_user') || null;
}
// Recupera il nominativo dell'account attivo usando getSelectedAccount()
function getNominativoAutoreAttivo() {
    if (typeof getSelectedAccount !== 'function') return null;
    
    const account = getSelectedAccount();
    if (!account) return null;

    // Formatta il nominativo con la stessa priorità usata nella tabella
    return account.nominativo || `${account.nome || ''} ${account.cognome || ''}`.trim() || null;
}

// Aggiorna la dicitura dell'autore nella card della pagina avvisi
function caricaBadgeAutoreAvvisi() {
    const autoreDisplay = document.getElementById('autoreDisplay');
    if (!autoreDisplay) return;

    const nominativo = getNominativoAutoreAttivo();

    if (nominativo) {
        autoreDisplay.textContent = nominativo;
        autoreDisplay.style.color = 'var(--accent, #4ecdc4)';
    } else {
        autoreDisplay.innerHTML = `<span style="color: #e63946;">Nessun account selezionato! <a href="selezione_account.html" style="color: #e63946; text-decoration: underline;">Selezionalo qui</a></span>`;
    }
}

// Invia l'avviso a Supabase impedendo l'invio ad utenti non identificati
async function inviaNuovoAvviso() {
    const inputTesto = document.getElementById('avvisoInput');
    if (!inputTesto) return;

    const autore = getNominativoAutoreAttivo();

    // BLOCCO RIGIDO: se non c'è un account valido, rimanda alla selezione
    if (!autore) {
        alert("Devi prima selezionare il tuo account per poter inviare un avviso!");
        window.location.href = 'selezione_account.html';
        return;
    }

    const testo = inputTesto.value.trim();
    if (!testo) {
        alert("Scrivi un messaggio prima di inviare!");
        return;
    }

    try {
        const { error } = await sb.from('avvisi').insert([{ testo, autore }]);
        if (error) throw error;

        inputTesto.value = '';
        await caricaAvvisi(); // Ricarica la lista aggiornata
    } catch (err) {
        console.error("Errore salvataggio avviso:", err);
        alert("Errore durante l'invio dell'avviso.");
    }
}

// Carica e mostra gli avvisi nel layout a due colonne
async function caricaAvvisi() {
    const odierniContainer = document.getElementById('avvisiOdierniContent');
    const storicoContainer = document.getElementById('avvisiStoricoContent');

    if (!odierniContainer && !storicoContainer) return;

    try {
        const { data, error } = await sb
            .from('avvisi')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            if (odierniContainer) odierniContainer.innerHTML = '<p style="color: #999;">Nessun avviso per oggi.</p>';
            if (storicoContainer) storicoContainer.innerHTML = '<p style="color: #999;">Nessun avviso nel registro.</p>';
            return;
        }

        const oggiStr = new Date().toISOString().split('T')[0];
        const avvisiOdierni = data.filter(a => a.created_at && a.created_at.startsWith(oggiStr));
        
        // Render Avvisi Odierni
        if (odierniContainer) {
            if (avvisiOdierni.length === 0) {
                odierniContainer.innerHTML = '<p style="color: #999;">Nessun avviso per oggi.</p>';
            } else {
                odierniContainer.innerHTML = avvisiOdierni.map(a => `
                    <div class="avviso-item">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                            <strong style="color: var(--accent, #4ecdc4); font-size: 0.9em;">${a.autore || 'Anonimo'}</strong>
                            <span class="avviso-data">${new Date(a.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        </div>
                        <p style="margin: 0; color: #c9c9c9;">${a.testo}</p>
                    </div>
                `).join('');
            }
        }

        // Render Storico Completo
        if (storicoContainer) {
            storicoContainer.innerHTML = data.map(a => `
                <div class="avviso-item">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                        <strong style="color: var(--accent, #4ecdc4); font-size: 0.9em;">${a.autore || 'Anonimo'}</strong>
                        <span class="avviso-data">${new Date(a.created_at).toLocaleString()}</span>
                    </div>
                    <p style="margin: 0; color: #c9c9c9;">${a.testo}</p>
                </div>
            `).join('');
        }

    } catch (err) {
        console.error("Errore caricamento avvisi:", err);
    }
}

async function salvaAvvisoAdmin() {
    const input = document.getElementById('adminAvvisoInput');
    if (!input) return;

    const testo = input.value.trim();
    if (!testo) {
        alert("Inserisci un testo per l'avviso prima di pubblicare.");
        return;
    }

    try {
        const { error } = await sb.from('avvisi').insert([
            {
                autore: 'Admin',
                testo: testo
            }
        ]);

        if (error) throw error;

        input.value = ''; // Pulisce il campo di testo
        await caricaAvvisiAdmin(); // Ricarica la lista avvisi
    } catch (err) {
        console.error("Errore salvataggio avviso:", err);
        alert("Impossibile salvare l'avviso.");
    }
}

async function caricaAvvisiAdmin() {
    const listContainer = document.getElementById('adminAvvisiList');
    if (!listContainer) return;

    try {
        const { data, error } = await sb
            .from('avvisi')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            listContainer.innerHTML = '<p style="color: #999;">Nessun avviso presente nel database.</p>';
            return;
        }

        listContainer.innerHTML = data.map(a => `
            <div style="position: relative; background: rgba(255,255,255,0.05); padding: 12px 14px; margin-bottom: 10px; border-radius: 6px; border-left: 4px solid var(--accent, #ff7b00);">
                <div style="padding-right: 70px;">
                    <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 6px;">
                        <strong style="color: var(--accent, #ff7b00); font-size: 0.95em;">${a.autore || 'Anonimo'}</strong>
                        <small style="color: #888; font-size: 0.8em;">${new Date(a.created_at).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}</small>
                    </div>
                    <p style="margin: 0; font-size: 0.95em; color: #fff; word-break: break-word; line-height: 1.4;">${a.testo}</p>
                </div>
                <button onclick="eliminaAvvisoAdmin(${a.id})" title="Elimina avviso" style="position: absolute; top: 12px; right: 12px; width: auto !important; min-width: unset !important; background: #e63946; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 0.75em; font-weight: bold;">
                    ✕ Elimina
                </button>
            </div>
        `).join('');

    } catch (err) {
        console.error("Errore caricamento avvisi admin:", err);
        listContainer.innerHTML = '<p style="color: #e63946;">Errore durante il caricamento degli avvisi.</p>';
    }
}

// Elimina l'avviso selezionato
async function eliminaAvvisoAdmin(id) {
    if (!confirm("Sei sicuro di voler eliminare definitivamente questo avviso?")) return;

    try {
        const { error } = await sb.from('avvisi').delete().eq('id', id);
        if (error) throw error;

        await caricaAvvisiAdmin();
    } catch (err) {
        console.error("Errore eliminazione avviso:", err);
        alert("Impossibile eliminare l'avviso selezionato.");
    }
}

function setCurrentYear() {
    document.querySelectorAll('.current-year').forEach(el => {
        el.textContent = new Date().getFullYear();
    });
}

// ==========================================
// 7. Event Listeners & Inizializzazione DOM
// ==========================================

document.addEventListener("DOMContentLoaded", async () => {
    setCurrentYear();
    aggiornaMessaggioAvvisi();

    // Gestione Password Login Admin
    const loginButton = document.getElementById('loginButton');
    const adminPassword = document.getElementById('adminPassword');
    if (loginButton && adminPassword) {
        loginButton.addEventListener('click', checkAdminPassword);
        adminPassword.addEventListener('keypress', e => {
            if (e.key === 'Enter') checkAdminPassword();
        });
    }

    // Navigazione Mese Calendario
    const prevMonth = document.getElementById('prevMonth');
    const nextMonth = document.getElementById('nextMonth');
    if (prevMonth) prevMonth.addEventListener('click', () => changeCalendarMonth(-1));
    if (nextMonth) nextMonth.addEventListener('click', () => changeCalendarMonth(1));

    // Gestione Menu Dropdown Mobile
    const menuToggle = document.getElementById('menuToggle');
    const menuDropdown = document.getElementById('menuDropdown');
    if (menuToggle && menuDropdown) {
        menuToggle.addEventListener('click', () => {
            const isOpen = menuDropdown.classList.toggle('open');
            menuToggle.setAttribute('aria-expanded', String(isOpen));
            menuDropdown.setAttribute('aria-hidden', String(!isOpen));
        });

        menuDropdown.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                const targetSection = item.getAttribute('data-section');
                if (targetSection) {
                    document.querySelectorAll('.menu-section').forEach(s => s.classList.add('hidden'));
                    const targetEl = document.getElementById(targetSection);
                    if (targetEl) targetEl.classList.remove('hidden');

                    const activityContent = document.getElementById('activityContent');
                    if (activityContent) {
                        activityContent.style.display = targetSection === 'homeCard' ? 'flex' : 'none';
                    }

                    try { localStorage.setItem('activeSection', targetSection); } catch (e) { }
                }
                menuDropdown.classList.remove('open');
            });
        });
    }

    // Campo ricerca dinamico per animatori
    const searchInput = document.getElementById('searchAnimatori');
    if (searchInput) {
        searchInput.addEventListener('input', e => filtraAnimatori(e.target.value));
    }

    // Selettore Data Attività
    const activityDate = document.getElementById('activityDate');
    if (activityDate) {
        const oggi = new Date();
        activityDate.value = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}-${String(oggi.getDate()).padStart(2, '0')}`;
        activityDate.addEventListener('change', () => {
            aggiornaAttivitaDelGiorno();
            updateDashboard();
        });
    }

    // Selettore Settimana Pubblico
    const weekSelect = document.getElementById('weekSelect');
    if (weekSelect) {
        weekSelect.addEventListener('change', updateWeekRangeLabel);
    }

    // Selettore Account Animatore
    const accountSelect = document.getElementById('accountSelect');
    if (accountSelect) {
        accountSelect.addEventListener('change', updateDashboard);
    }

    window.addEventListener('grest-evaluations-updated', () => {
        if (typeof updateDashboard === 'function') {
            updateDashboard();
        }
    });

    inizializzaModalModifica();

    // Caricamento Dati Iniziali
    await loadAnimatoriAccounts();
    updateDashboard();
    updateWeekRangeLabel();
    aggiornaAttivitaDelGiorno();

    const evaluationDaySelect = document.getElementById('evaluationDaySelect');
    if (evaluationDaySelect) {
        evaluationDaySelect.value = selectedEvaluationDay;
        evaluationDaySelect.addEventListener('change', (event) => {
            selectedEvaluationDay = event.target.value;
            renderRegistroValutazioni(animatoriCorrenti);
        });
    }

    const mediaQuery = window.matchMedia('(max-width: 720px)');
    const onMediaChange = () => {
        renderRegistroValutazioni(animatoriCorrenti);
    };
    if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', onMediaChange);
    } else if (mediaQuery.addListener) {
        mediaQuery.addListener(onMediaChange);
    }

    if (document.getElementById('listaAnimatori') || document.getElementById('animatoriTable')) {
        mostraAnimatori();
    }
    // 1. Collega il listener al pulsante di invio
    const btnInvia = document.getElementById('refreshButton');
    if (btnInvia) {
        btnInvia.addEventListener('click', inviaNuovoAvviso);
    }

    // 2. Carica la lista degli account se non è ancora presente in memoria
    if ((!window.animatoriAccounts || window.animatoriAccounts.length === 0) && typeof loadAnimatoriAccounts === 'function') {
        await loadAnimatoriAccounts();
    }

    if (document.getElementById('adminAvvisiList')) {
        await caricaAvvisiAdmin();
    }

    // 3. Ora che animatoriAccounts è pronto, aggiorna il badge autore e carica gli avvisi
    caricaBadgeAutoreAvvisi();
    await caricaAvvisi();
});


function aggiornaIntestazioneGiornoSelezionato() {
    const header = document.getElementById('selectedDayHeader');
    if (!header) return;
    const labels = {
        lunedi: 'Lunedì',
        martedi: 'Martedì',
        mercoledi: 'Mercoledì',
        giovedi: 'Giovedì',
        venerdi: 'Venerdì'
    };
    header.textContent = labels[selectedEvaluationDay] || 'Valutazione';
}

function getItalianDayName(giorno) {
    const labels = {
        lunedi: 'Lunedì',
        martedi: 'Martedì',
        mercoledi: 'Mercoledì',
        giovedi: 'Giovedì',
        venerdi: 'Venerdì'
    };
    return labels[giorno] || giorno;
}

// ==========================================
// 1. Funzione per generare il Registro Valutazioni Dinamico
// ==========================================
function isMobileEvaluationView() {
    return window.matchMedia('(max-width: 720px)').matches;
}

function renderRegistroValutazioni(listaAnimatori) {
    const tbody = document.getElementById('registroValutazioniBody');
    const thead = document.getElementById('registroValutazioniHead');
    if (!tbody || !thead) return;

    if (!listaAnimatori || listaAnimatori.length === 0) {
        thead.innerHTML = `<tr><th class="col-animatore">Animatore</th><th>Valutazione</th></tr>`;
        tbody.innerHTML = `<tr><td colspan="2" style="text-align:center; padding:15px; color:#888;">Nessun animatore presente.</td></tr>`;
        return;
    }

    const mobileView = isMobileEvaluationView();
    const evaluations = getStoredDailyEvaluations();

    if (mobileView) {
        thead.innerHTML = `<tr><th class="col-animatore">Animatore</th><th>${getItalianDayName(selectedEvaluationDay)}</th></tr>`;
        tbody.innerHTML = listaAnimatori.map(animatore => {
            const nomeCompleto = `${animatore.nome || ''} ${animatore.cognome || ''}`.trim();
            const animatoreId = getAccountId(animatore);
            const storedValue = evaluations[String(animatoreId)]?.[selectedEvaluationDay] || '';
            const classe = storedValue ? ` ${storedValue}` : '';

            return `
                <tr>
                    <td class="col-animatore"><strong>${nomeCompleto}</strong></td>
                    <td>
                        <select class="valutazione-select${classe}" onchange="cambiaColoreValutazione(this, '${animatoreId}', '${selectedEvaluationDay}')">
                            <option value="" ${storedValue ? '' : 'selected'}>- Null -</option>
                            <option value="ottimo" ${storedValue === 'ottimo' ? 'selected' : ''}>🟢 Ottimo</option>
                            <option value="neutro" ${storedValue === 'neutro' ? 'selected' : ''}>🟡 Neutro</option>
                            <option value="attento" ${storedValue === 'attento' ? 'selected' : ''}>🔴 Attento</option>
                        </select>
                    </td>
                </tr>
            `;
        }).join('');
    } else {
        thead.innerHTML = `
            <tr>
                <th class="col-animatore">Animatore</th>
                <th>Lunedì</th>
                <th>Martedì</th>
                <th>Mercoledì</th>
                <th>Giovedì</th>
                <th>Venerdì</th>
            </tr>
        `;

        tbody.innerHTML = listaAnimatori.map(animatore => {
            const nomeCompleto = `${animatore.nome || ''} ${animatore.cognome || ''}`.trim();
            const animatoreId = getAccountId(animatore);
            const giorni = ['lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi'];

            const celleGiorni = giorni.map(giorno => {
                const storedValue = evaluations[String(animatoreId)]?.[giorno] || '';
                const classe = storedValue ? ` ${storedValue}` : '';
                return `
                    <td>
                        <select class="valutazione-select${classe}" onchange="cambiaColoreValutazione(this, '${animatoreId}', '${giorno}')">
                            <option value="" ${storedValue ? '' : 'selected'}>- Null -</option>
                            <option value="ottimo" ${storedValue === 'ottimo' ? 'selected' : ''}>🟢 Ottimo</option>
                            <option value="neutro" ${storedValue === 'neutro' ? 'selected' : ''}>🟡 Neutro</option>
                            <option value="attento" ${storedValue === 'attento' ? 'selected' : ''}>🔴 Attento</option>
                        </select>
                    </td>
                `;
            }).join('');

            return `
                <tr>
                    <td class="col-animatore"><strong>${nomeCompleto}</strong></td>
                    ${celleGiorni}
                </tr>
            `;
        }).join('');
    }

    aggiornaIntestazioneGiornoSelezionato();
}

// ==========================================
// 2. Funzione per aggiornare il colore del menu a tendina
// ==========================================
function cambiaColoreValutazione(selectElement, animatoreId, giorno) {
    // Rimuove le classi di stato precedenti
    selectElement.classList.remove('ottimo', 'neutro', 'attento');

    // Aggiunge la classe corrispondente al valore selezionato
    if (selectElement.value) {
        selectElement.classList.add(selectElement.value);
    }

    saveDailyEvaluation(animatoreId, giorno, selectElement.value);
    if (typeof updateDashboard === 'function') {
        updateDashboard();
    }

    console.log(`Valutazione per animatore ${animatoreId} (${giorno}): ${selectElement.value}`);
}

/**
 * Recupera il meteo in tempo reale e aggiorna la card
 * (Coordinate predefinite impostate su Montevarchi/Toscana)
 */
async function caricaMeteoGrest(lat = 43.5235, lon = 11.5677) {
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,weathercode&current_weather=true&timezone=auto`;
        
        const response = await fetch(url);
        if (!response.ok) throw new Error("Impossibile recuperare i dati meteo");
        
        const data = await response.json();

        // Estrazione dati
        const tempAttuale = Math.round(data.current_weather.temperature);
        const tempMax = Math.round(data.daily.temperature_2m_max[0]);
        const tempMin = Math.round(data.daily.temperature_2m_min[0]);
        const weatherCode = data.current_weather.weathercode;

        // Interpretazione codice WMO
        const info = interpretaCodiceMeteo(weatherCode);

        // Preleviamo gli elementi del DOM
        const elTempCurrent = document.getElementById('tempCurrent');
        const elTempRange = document.getElementById('tempRange');
        const elWeatherIcon = document.getElementById('weatherIcon');
        const elWeatherDesc = document.getElementById('weatherDesc');

        // Aggiorniamo il DOM SOLO SE gli elementi esistono nella pagina corrente
        if (elTempCurrent) elTempCurrent.textContent = `${tempAttuale}°C`;
        if (elTempRange) elTempRange.textContent = `Max ${tempMax}° / Min ${tempMin}°`;
        if (elWeatherIcon) elWeatherIcon.textContent = info.icona;
        if (elWeatherDesc) elWeatherDesc.textContent = info.descrizione;

    } catch (error) {
        console.error("Errore meteo:", error);
        
        // Controllo di sicurezza anche nel catch!
        const elWeatherDesc = document.getElementById('weatherDesc');
        if (elWeatherDesc) {
            elWeatherDesc.textContent = "Servizio meteo non disponibile";
        }
    }
}

/**
 * Converte il codice meteo WMO in icona e testo italiano
 */
function interpretaCodiceMeteo(code) {
    if (code === 0) return { icona: '☀️', descrizione: 'Cielo Sereno', isPioggia: false };
    if (code >= 1 && code <= 3) return { icona: '⛅', descrizione: 'Poco o Parzialmente Nuvoloso', isPioggia: false };
    if (code >= 45 && code <= 48) return { icona: '🌫️', descrizione: 'Nebbia / Foschia', isPioggia: false };
    if (code >= 51 && code <= 67) return { icona: '🌧️', descrizione: 'Pioggia / Pioviggine', isPioggia: true };
    if (code >= 80 && code <= 82) return { icona: '🌦️', descrizione: 'Rovesci di Pioggia', isPioggia: true };
    if (code >= 95) return { icona: '⛈️', descrizione: 'Temporale', isPioggia: true };
    return { icona: '🌤️', descrizione: 'Variabile', isPioggia: false };
}

// Chiamata automatica al caricamento della pagina
document.addEventListener('DOMContentLoaded', () => {
    caricaMeteoGrest();
});

function renderTabellaAnimatoriPaginata(lista, isPaginaAdmin) {
    const tableBody = document.querySelector('#animatoriTable tbody');
    if (!tableBody) return;

    if (lista.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px;">Nessun animatore in turno per questa settimana.</td></tr>`;
        renderControlliPaginazione(0);
        return;
    }

    // 1. Calcoliamo il totale delle pagine
    const totalePagine = Math.ceil(lista.length / ANIMATORI_PER_PAGINA);
    
    // 2. Sicurezza: se cancelli l'ultimo animatore di una pagina, torna indietro di una
    if (paginaCorrenteAnimatori > totalePagine && totalePagine > 0) {
        paginaCorrenteAnimatori = totalePagine;
    }

    // 3. Estraiamo solo i 5 animatori della pagina corrente
    const inizio = (paginaCorrenteAnimatori - 1) * ANIMATORI_PER_PAGINA;
    const animatoriPagina = lista.slice(inizio, inizio + ANIMATORI_PER_PAGINA);

    // 4. Manteniamo IL TUO render identico, lavorando solo sui 5 animatori (animatoriPagina)
    tableBody.innerHTML = animatoriPagina.map(a => `
        <tr>
            <td><strong>${a.nominativo || (a.nome + ' ' + a.cognome)}</strong></td>
            <td>${a.ruolo || 'Animatore'}</td>
            <td>${a.squadra ? 'Squadra ' + a.squadra : 'Nessuna'}</td>
            ${isPaginaAdmin ? `
                <td style="text-align: right;">
                    <button class="btn-elimina" onclick="eliminaAnimatore(${a.id_animatore}, '${a.nominativo || a.nome}')">
                        Elimina
                    </button>
                </td>
            ` : ''}
        </tr>
    `).join('');

    // 5. Aggiorniamo i pallini e le frecce sotto
    renderControlliPaginazione(totalePagine);
}

function renderControlliPaginazione(totalePagine) {
    let containerPaginazione = document.getElementById('animatoriPagination');
    const tabella = document.querySelector('#animatoriTable');
    
    if (!tabella) return;

    // Se non esiste, creiamo il contenitore
    if (!containerPaginazione) {
        containerPaginazione = document.createElement('div');
        containerPaginazione.id = 'animatoriPagination';
        containerPaginazione.className = 'pagination-container';
        
        // Lo inseriamo in modo chirurgico SUBITO DOPO la tabella
        tabella.parentNode.insertBefore(containerPaginazione, tabella.nextSibling);
    }

    // Se c'è una sola pagina, svuota il contenitore
    if (totalePagine <= 1) {
        containerPaginazione.innerHTML = '';
        containerPaginazione.style.display = 'none'; // Lo nascondiamo del tutto
        return;
    }

    containerPaginazione.style.display = 'flex'; // Lo rendiamo visibile

    let dotsHTML = '';
    for (let i = 1; i <= totalePagine; i++) {
        const isActive = i === paginaCorrenteAnimatori ? 'active' : '';
        dotsHTML += `<span class="pagination-dot ${isActive}" onclick="cambiaPaginaAnimatori(${i})"></span>`;
    }

    containerPaginazione.innerHTML = `
        <button type="button" class="pagination-btn" ${paginaCorrenteAnimatori === 1 ? 'disabled' : ''} onclick="cambiaPaginaAnimatori(${paginaCorrenteAnimatori - 1})">&#10094;</button>
        <div class="pagination-dots">${dotsHTML}</div>
        <button type="button" class="pagination-btn" ${paginaCorrenteAnimatori === totalePagine ? 'disabled' : ''} onclick="cambiaPaginaAnimatori(${paginaCorrenteAnimatori + 1})">&#10095;</button>
    `;
}

function cambiaPaginaAnimatori(nuovaPagina) {
    paginaCorrenteAnimatori = nuovaPagina;
    const isPaginaAdmin = window.location.href.includes('admin') || document.getElementById('adminContent')?.style.display === 'block';
    // Chiamiamo la funzione unificata!
    renderTabellaAnimatori(animatoriCorrenti, isPaginaAdmin);
}


/*----------------------------------------------------------------------- */
async function salvaProgrammazione(fascia) {
    selezioneProgramma.fascia = fascia;

    // Calcolo della data
    const giorniOffset = (selezioneProgramma.settimanaIndex * 7) + selezioneProgramma.giornoIndex;
    const dataCalcolata = new Date(GREST_START);
    dataCalcolata.setDate(dataCalcolata.getDate() + giorniOffset);

    const dd = String(dataCalcolata.getDate()).padStart(2, '0');
    const mm = String(dataCalcolata.getMonth() + 1).padStart(2, '0');
    const yyyy = dataCalcolata.getFullYear();
    const dataStr = `${dd}/${mm}/${yyyy}`;

    // Invio dati alla tabella di Supabase
    const { data, error } = await sb
        .from('programmazione')
        .insert([
            {
                data_attivita: dataStr,
                settimana_index: selezioneProgramma.settimanaIndex,
                giorno_index: selezioneProgramma.giornoIndex,
                fascia: fascia,
                nome_attivita: selezioneProgramma.attivitaNome
            }
        ]);

    if (error) {
        console.error("Errore salvataggio Supabase:", error);
        alert("Si è verificato un errore durante il salvataggio.");
        return;
    }

    // Ricarica la programmazione aggiornata dal DB
    await caricaProgrammazioneDaSupabase();
    chiudiModalProgrammazione();
}

async function caricaProgrammazioneDaSupabase() {
    const { data, error } = await sb
        .from('programmazione')
        .select('*')
        .order('id', { ascending: true });

    if (error) {
        console.error("Errore caricamento da Supabase:", error);
        return;
    }

    // Trasforma i dati del DB nel formato usato dall'app
    registroProgrammazione = data.map(item => ({
        id: item.id,
        dataStr: item.data_attivita,
        fascia: item.fascia,
        nome: item.nome_attivita,
        settimanaIndex: item.settimana_index,
        giornoIndex: item.giorno_index
    }));

    // 1. Disegna le attività sulla griglia a schermo
    aggiornaVistaProgrammazione();

    // 2. Se su PC hai collegato il file locale, lo aggiorna in automatico in background
    if (typeof fileHandleAttivita !== 'undefined' && fileHandleAttivita) {
        salvaSuDiscoSilenzioso();
    }
}

// Richiama la funzione al caricamento della pagina
document.addEventListener('DOMContentLoaded', () => {
    caricaProgrammazioneDaSupabase();
});

// 1. Disegna le attività nei rispettivi giorni con il tasto elimina a destra
function aggiornaVistaProgrammazione() {
    // Svuota prima tutti i contenitori dei giorni
    document.querySelectorAll('.attivita-contenitore').forEach(el => el.innerHTML = '');

    // Inserisce ogni attività salvata nel relativo giorno
    registroProgrammazione.forEach(item => {
        const slot = document.querySelector(`.giorno-slot[data-settimana="${item.settimanaIndex}"][data-giorno="${item.giornoIndex}"] .attivita-contenitore`);

        if (slot) {
            const badge = document.createElement('div');
            // Flexbox per spingere il pulsante tutto a destra
            badge.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: #2a2a2a;
                border-left: 3px solid #d27b2d;
                padding: 4px 8px;
                margin-top: 5px;
                border-radius: 4px;
                color: #ffffff;
                font-size: 13px;
            `;

            badge.innerHTML = `
                <span><span style="color:#d27b2d; font-weight:bold;">[${item.fascia}]</span> ${item.nome}</span>
                <button onclick="eliminaProgrammazione(${item.id})" 
                        title="Rimuovi dalla programmazione"
                        style="background: transparent; border: none; color: #ff4d4d; cursor: pointer; font-size: 14px; font-weight: bold; margin-left: 10px; padding: 0 4px;">
                    ✕
                </button>
            `;

            slot.appendChild(badge);
        }
    });
}

// 2. Elimina un'attività sia da Supabase che dallo schermo
async function eliminaProgrammazione(idDb) {
    if (!confirm("Vuoi davvero rimuovere questo gioco dalla programmazione?")) {
        return;
    }

    // Cancella la riga da Supabase usando l'ID
    const { error } = await sb
        .from('programmazione')
        .delete()
        .eq('id', idDb);

    if (error) {
        console.error("Errore durante la cancellazione:", error);
        alert("Si è verificato un errore durante l'eliminazione.");
        return;
    }

    // Ricarica la lista aggiornata dal DB
    await caricaProgrammazioneDaSupabase();
}
// Genera la stringa di testo nel formato "DD/MM/YYYY - Fascia: Nome"
function generaTestoAttivita() {
    return registroProgrammazione
        .map(r => `${r.dataStr} - ${r.fascia}: ${r.nome}`)
        .join('\n');
}  

// Salva i turni associandoli al giorno selezionato (es. 'martedi')
function salvaTurniPiscina() {
    const giorno = document.getElementById('piscinaGiorno').value;
    if (!giorno) return;

    const turni = {
        mattina: [
            document.getElementById('piscinaMattina1').value,
            document.getElementById('piscinaMattina2').value
        ],
        pomeriggio: [
            document.getElementById('piscinaPomeriggio1').value,
            document.getElementById('piscinaPomeriggio2').value
        ]
    };

    localStorage.setItem('piscina_giorno_' + giorno.toLowerCase().trim(), JSON.stringify(turni));
    alert(`Turni piscina per ${giorno.toUpperCase()} salvati con successo!`);
    
    // Aggiorna la dashboard se aperta
    if (typeof updateDashboard === 'function') {
        updateDashboard();
    }
}

// Carica i menu a tendina quando l'admin cambia il giorno selezionato
function caricaTurniPiscinaPerGiorno(giorno) {
    if (!giorno) return;
    const datiSalvati = localStorage.getItem('piscina_giorno_' + giorno.toLowerCase().trim());
    
    if (datiSalvati) {
        const turni = JSON.parse(datiSalvati);
        if (document.getElementById('piscinaMattina1')) document.getElementById('piscinaMattina1').value = turni.mattina[0] || "";
        if (document.getElementById('piscinaMattina2')) document.getElementById('piscinaMattina2').value = turni.mattina[1] || "";
        if (document.getElementById('piscinaPomeriggio1')) document.getElementById('piscinaPomeriggio1').value = turni.pomeriggio[0] || "";
        if (document.getElementById('piscinaPomeriggio2')) document.getElementById('piscinaPomeriggio2').value = turni.pomeriggio[1] || "";
    } else {
        if (document.getElementById('piscinaMattina1')) document.getElementById('piscinaMattina1').value = "";
        if (document.getElementById('piscinaMattina2')) document.getElementById('piscinaMattina2').value = "";
        if (document.getElementById('piscinaPomeriggio1')) document.getElementById('piscinaPomeriggio1').value = "";
        if (document.getElementById('piscinaPomeriggio2')) document.getElementById('piscinaPomeriggio2').value = "";
    }
}

// Funzione Helper: controlla se la squadra dell'animatore va in piscina nella data selezionata
function getTurnoPiscinaSquadra(nomeSquadra, date) {
    if (!nomeSquadra || !date) return null;

    // 1. Mappatura sicura del giorno senza accenti per combaciare con la chiave di localStorage
    const giorniMappa = ['domenica', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato'];
    const dateObj = (date instanceof Date) ? date : new Date(date);
    const giornoSettimana = giorniMappa[dateObj.getDay()];

    const datiSalvati = localStorage.getItem('piscina_giorno_' + giornoSettimana);
    if (!datiSalvati) return null;

    const turni = JSON.parse(datiSalvati);
    
    // 2. Risoluzione dei dettagli della squadra (cerca sia per ID che per Nome)
    const target = String(nomeSquadra || '').trim().toLowerCase();
    
    // Cerca l'oggetto squadra completo se SQUADRE è disponibile nel DB/window
    const listaSquadre = typeof SQUADRE !== 'undefined' ? SQUADRE : (window.SQUADRE || []);
    const sqObj = listaSquadre.find(s => 
        String(s.id_squadra) === target || 
        String(s.id) === target || 
        String(s.nome).toLowerCase() === target
    );

    // Raccoglie tutti i valori possibili per questa squadra (es. "2", "blu", "Blu")
    const valoriValidi = new Set([target]);
    if (sqObj) {
        if (sqObj.id_squadra) valoriValidi.add(String(sqObj.id_squadra).toLowerCase());
        if (sqObj.id) valoriValidi.add(String(sqObj.id).toLowerCase());
        if (sqObj.nome) valoriValidi.add(String(sqObj.nome).toLowerCase());
    }

    const appartieneAllaSquadra = valore => {
        if (!valore) return false;
        const valClean = String(valore).trim().toLowerCase();
        return valoriValidi.has(valClean);
    };

    const inMattina = Array.isArray(turni.mattina) && turni.mattina.some(appartieneAllaSquadra);
    const inPomeriggio = Array.isArray(turni.pomeriggio) && turni.pomeriggio.some(appartieneAllaSquadra);

    if (inMattina) return 'Mattina';
    if (inPomeriggio) return 'Pomeriggio';
    return null;
}

//======================================//

// Cache in memoria delle squadre caricate dal DB
let squadreCorrenti = [];

async function caricaSquadre() {
    if (!sb) return [];
    const { data, error } = await sb
        .from('squadre')
        .select('id_squadra, nome, numero_membri_tot, punteggio, piscina')
        .order('nome', { ascending: true });

    console.log('SQUADRE →', { data, error }); // DEBUG temporaneo

    if (error) {
        console.error('Errore caricamento squadre:', error);
        mostraNotifica('Errore durante il caricamento delle squadre.', 'error');
        return [];
    }
    squadreCorrenti = data || [];
    return squadreCorrenti;
}

// Da chiamare quando apri la sezione "Imposta Squadre Animatori",
// PRIMA della prima renderAssegnazioneSquadre
async function initAssegnazioneSquadre(listaAnimatori) {
    await caricaSquadre();
    renderAssegnazioneSquadre(listaAnimatori);
}


function renderAssegnazioneSquadre(listaAnimatori) {
    const tbody = document.getElementById('assegnazioneSquadreBody');
    if (!tbody) return;

    if (!listaAnimatori || listaAnimatori.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; padding:15px; color:#888;">Nessun animatore presente.</td></tr>';
        aggiornaPaginazioneSquadre(0);
        return;
    }

    const totalePagine = Math.ceil(listaAnimatori.length / ANIMATORI_SQUADRE_PER_PAGINA);
    if (paginaCorrenteSquadre > totalePagine) paginaCorrenteSquadre = totalePagine;

    const inizio = (paginaCorrenteSquadre - 1) * ANIMATORI_SQUADRE_PER_PAGINA;
    const animatoriPagina = listaAnimatori.slice(inizio, inizio + ANIMATORI_SQUADRE_PER_PAGINA);

    tbody.innerHTML = animatoriPagina.map(animatore => {
        const nomeCompleto = `${animatore.nome || ''} ${animatore.cognome || ''}`.trim();
        const animatoreId = getAccountId(animatore);
        const squadraAssegnata = animatore.squadra === null || animatore.squadra === undefined
            ? ''
            : String(animatore.squadra);

        const opzioniSquadre = squadreCorrenti
            .map(sq => `<option value="${sq.id_squadra}" ${squadraAssegnata === String(sq.id_squadra) ? 'selected' : ''}>${sq.nome}</option>`)
            .join('');

        return `
            <tr>
                <td class="col-animatore"><strong>${nomeCompleto}</strong></td>
                <td>
                    <select id="squadra-${animatoreId}" aria-label="Squadra di ${nomeCompleto}" onchange="salvaSquadraAnimatore('${animatoreId}')">
                        <option value="" ${squadraAssegnata ? '' : 'selected'}>Nessuna squadra</option>
                        ${opzioniSquadre}
                    </select>
                </td>
            </tr>
        `;
    }).join('');
    aggiornaPaginazioneSquadre(totalePagine);
}

function aggiornaPaginazioneSquadre(totalePagine) {
    const tabella = document.getElementById('assegnazioneSquadreTable');
    if (!tabella) return;

    let paginazione = document.getElementById('assegnazioneSquadrePagination');
    if (!paginazione) {
        paginazione = document.createElement('div');
        paginazione.id = 'assegnazioneSquadrePagination';
        paginazione.className = 'pagination-container';
        tabella.parentNode.insertBefore(paginazione, tabella.nextSibling);
    }

    if (totalePagine <= 1) {
        paginazione.innerHTML = '';
        paginazione.style.display = 'none';
        return;
    }

    paginazione.style.display = 'flex';
    const dots = Array.from({ length: totalePagine }, (_, indice) => {
        const pagina = indice + 1;
        const attiva = pagina === paginaCorrenteSquadre ? 'active' : '';
        return `<span class="pagination-dot ${attiva}" onclick="cambiaPaginaSquadre(${pagina})"></span>`;
    }).join('');

    paginazione.innerHTML = `
        <button type="button" class="pagination-btn" ${paginaCorrenteSquadre === 1 ? 'disabled' : ''} onclick="cambiaPaginaSquadre(${paginaCorrenteSquadre - 1})">&#10094;</button>
        <div class="pagination-dots">${dots}</div>
        <button type="button" class="pagination-btn" ${paginaCorrenteSquadre === totalePagine ? 'disabled' : ''} onclick="cambiaPaginaSquadre(${paginaCorrenteSquadre + 1})">&#10095;</button>
    `;
}

function cambiaPaginaSquadre(nuovaPagina) {
    paginaCorrenteSquadre = nuovaPagina;
    renderAssegnazioneSquadre(animatoriCorrenti);
}

async function salvaSquadraAnimatore(animatoreId) {
    if (!sb) {
        mostraNotifica('Connessione a Supabase non disponibile.', 'error');
        return;
    }

    const select = document.getElementById(`squadra-${animatoreId}`);
    const animatore = animatoriCorrenti.find(item => String(getAccountId(item)) === String(animatoreId));
    if (!select || !animatore) return;

    const squadra = select.value ? Number(select.value) : null;
    const { error } = await sb
        .from('animatori')
        .update({ squadra })
        .eq('id_animatore', animatore.id_animatore);

    if (error) {
        console.error('Errore assegnazione squadra:', error);
        mostraNotifica('Errore durante il salvataggio della squadra.', 'error');
        return;
    }

    animatore.squadra = squadra;
    mostraNotifica('Squadra assegnata con successo.', 'success');
    renderAssegnazioneSquadre(animatoriCorrenti);
    renderTabellaAnimatori(animatoriCorrenti, true);
}


//=====================================//

// Quando l'utente cambia account nel menu a tendina principale
const accountSelect = document.getElementById('accountSelect');
if (accountSelect) {
    accountSelect.addEventListener('change', (e) => {
        const idSelezionato = e.target.value;
        
        // Trova l'animatore corrispondente
        const animatore = (window.animatoriAccounts || []).find(a => String(a.id || a.id_animatore) === String(idSelezionato));
        
        if (animatore) {
            const nominativo = animatore.nominativo || `${animatore.nome || ''} ${animatore.cognome || ''}`.trim();
            // Salva nel browser
            localStorage.setItem('grest_active_user', nominativo);
        } else {
            localStorage.removeItem('grest_active_user');
        }

        if (typeof updateDashboard === 'function') updateDashboard();
    });
}

//======================================
// APPELLO - Registro Presenze
//======================================


function formattaDataISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function parseDataAppello(value) {
    const [year, month, day] = String(value || '').split('-').map(Number);
    if (!year || !month || !day) return new Date();
    return new Date(year, month - 1, day);
}

function escapeAppelloHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => {
        switch (char) {
            case '&': return '&amp;';
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '"': return '&quot;';
            case "'": return '&#039;';
            default: return char;
        }
    });
}

function getAppelloIdSquadra(persona) {
    return String(persona?.id_squadra ?? persona?.squadra ?? '').trim();
}

function getAppelloPresenza(tipo, id) {
    return tipo === 'animatore'
        ? appelloPresenzeAnimatoriMap[id]
        : appelloPresenzeBambiniMap[id];
}

function accodaSalvataggioAppello(chiave, operazione) {
    const precedente = appelloSaveQueues.get(chiave) || Promise.resolve();
    const corrente = precedente.then(operazione, operazione);
    appelloSaveQueues.set(chiave, corrente);

    return corrente.finally(() => {
        if (appelloSaveQueues.get(chiave) === corrente) {
            appelloSaveQueues.delete(chiave);
        }
    });
}

async function caricaAppello(dataSelezionata) {
    const tbody = document.getElementById('appelloBody');
    if (!tbody) return;

    const loadId = ++appelloLoadId;
    appelloBambini = [];
    appelloAnimatori = [];
    appelloStatusMap = {};
    appelloPresenzeBambiniMap = {};
    appelloPresenzeAnimatoriMap = {};

    if (typeof sb === 'undefined' || !sb) {
        tbody.innerHTML = '<tr class="appello-empty-row"><td colspan="4">Connessione a Supabase non disponibile.</td></tr>';
        return;
    }

    tbody.innerHTML = '<tr class="appello-empty-row"><td colspan="4">Caricamento appello in corso...</td></tr>';

    const dataISO = formattaDataISO(dataSelezionata);
    const weekNumber = typeof getSettimanaCycle === 'function'
        ? getSettimanaCycle(dataSelezionata)
        : 1;

    try {
        const [bambiniRes, animatoriRes, statusRes, presenzeRes] = await Promise.all([
            sb.from('bambini').select('*').order('cognome', { ascending: true }),
            sb.from('animatori').select('*').order('cognome', { ascending: true }),
            sb.from('status_bimbi').select('id_bambino, stellina'),
            sb.from('presenze').select('*').eq('data', dataISO)
        ]);

        if (loadId !== appelloLoadId) return;

        for (const [tabella, result] of [
            ['bambini', bambiniRes],
            ['animatori', animatoriRes],
            ['status_bimbi', statusRes],
            ['presenze', presenzeRes]
        ]) {
            if (result.error) {
                throw new Error(`${tabella}: ${result.error.message}`);
            }
        }

        const tuttiBambini = (bambiniRes.data || []).map(b => ({
            ...b,
            id_bambino: b.id_bambini
        }));
        const tuttiAnimatori = animatoriRes.data || [];
        const accountSelezionato = typeof getSelectedAccount === 'function'
            ? getSelectedAccount()
            : null;

        const selectedAccountId = accountSelezionato?.id
            || new URLSearchParams(window.location.search).get('selectedAccountId')
            || localStorage.getItem('selectedAccountId')
            || sessionStorage.getItem('selectedAccountId');

        const selectedAnimatoreId = accountSelezionato?.id_animatore
            ?? (selectedAccountId ? null : localStorage.getItem('selectedAnimatoreId'));

        const animatoreCorrente = tuttiAnimatori.find(a => {
            if (selectedAnimatoreId !== null && selectedAnimatoreId !== undefined && selectedAnimatoreId !== '') {
                return String(a.id_animatore) === String(selectedAnimatoreId);
            }
            return selectedAccountId && String(getAccountId(a)) === String(selectedAccountId);
        });

        if (!animatoreCorrente) {
            tbody.innerHTML = '<tr class="appello-empty-row"><td colspan="4">Seleziona un account per visualizzare l’appello della tua squadra.</td></tr>';
            return;
        }

        const idSquadra = getAppelloIdSquadra(animatoreCorrente);
        if (!idSquadra) {
            tbody.innerHTML = '<tr class="appello-empty-row"><td colspan="4">Nessuna squadra assegnata al tuo account.</td></tr>';
            return;
        }

        let nomeSquadra = idSquadra;
        try {
            const { data: squadraRow } = await sb
                .from('squadre')
                .select('id_squadra, nome')
                .eq('id_squadra', idSquadra)
                .maybeSingle();
            if (squadraRow?.nome) nomeSquadra = squadraRow.nome;
        } catch (_) { /* ignora, uso l'ID */ }
        
        appelloSquadraCorrente = {
            id: idSquadra,
            nome: nomeSquadra
        };

        appelloBambini = tuttiBambini.filter(b =>
            getAppelloIdSquadra(b) === idSquadra
        );

        appelloAnimatori = tuttiAnimatori.filter(a => {
            if (getAppelloIdSquadra(a) !== idSquadra) return false;
            if (!a.settimana) return true;

            const settimane = Array.isArray(a.settimana) ? a.settimana : [a.settimana];
            return settimane.map(String).includes(String(weekNumber));
        });

        (statusRes.data || []).forEach(status => {
            appelloStatusMap[status.id_bambino] = status;
        });

        (presenzeRes.data || []).forEach(presenza => {
            if (presenza.id_bambino !== null && presenza.id_bambino !== undefined) {
                appelloPresenzeBambiniMap[presenza.id_bambino] = presenza;
            }
            if (presenza.id_animatore !== null && presenza.id_animatore !== undefined) {
                appelloPresenzeAnimatoriMap[presenza.id_animatore] = presenza;
            }
        });

        renderAppello();
    } catch (err) {
        if (loadId !== appelloLoadId) return;
        console.error('Errore caricamento appello:', err);
        tbody.innerHTML = '<tr class="appello-empty-row"><td colspan="4"></td></tr>';
        tbody.querySelector('td').textContent =
            `Errore: ${err.message || 'Impossibile recuperare i dati dell’appello.'}`;
    }
}

function renderAppello() {
    const tbody = document.getElementById('appelloBody');
    if (!tbody) return;

    if (appelloBambini.length === 0 && appelloAnimatori.length === 0) {
        tbody.innerHTML = '<tr class="appello-empty-row"><td colspan="4">Nessun nominativo presente.</td></tr>';
        return;
    }

    const righeBambini = appelloBambini.length > 0
        ? appelloBambini.map(b => renderRigaAppello(b, 'bambino')).join('')
        : '<tr class="appello-empty-row"><td colspan="4">Nessun bambino trovato per la tua squadra.</td></tr>';

    const righeAnimatori = appelloAnimatori
        .map(a => renderRigaAppello(a, 'animatore'))
        .join('');

    const separatore = appelloAnimatori.length > 0
        ? '<tr class="appello-separator-row"><td colspan="4">Animatori</td></tr>'
        : '';

    tbody.innerHTML = righeBambini + separatore + righeAnimatori;
}

function renderRigaAppello(persona, tipo) {
    const nomeCompleto = `${persona.cognome || ''} ${persona.nome || ''}`.trim();
    const id = tipo === 'bambino' ? persona.id_bambino : persona.id_animatore;
    const presenzaEsistente = getAppelloPresenza(tipo, id);

    const haStellina = tipo === 'bambino'
        && appelloStatusMap[id]?.stellina === 'si';
    const stellinaHtml = haStellina
        ? '<span class="appello-stellina">★</span>'
        : '';

    const presenteChecked = presenzaEsistente?.ora_arrivo ? 'checked' : '';
    const mensaChecked = presenzaEsistente?.pranzo === 'si' ? 'checked' : '';
    const rigaClasse = tipo === 'bambino'
        ? 'appello-row-bambino'
        : 'appello-row-animatore';

    const riconsegnaCell = tipo === 'bambino'
        ? `<input type="text" class="appello-riconsegna-input" data-id="${id}" data-tipo="${tipo}" placeholder="Chi ritira / orario" value="${escapeAppelloHtml(presenzaEsistente?.riconsegna || '')}">`
        : '<input type="text" class="appello-riconsegna-input" disabled>';

    return `
        <tr class="${rigaClasse}">
            <td class="appello-cell-nome">
                <span>${escapeAppelloHtml(nomeCompleto)}</span>
                ${stellinaHtml}
            </td>
            <td class="appello-cell-check">
                <input type="checkbox" class="appello-checkbox appello-check-giornata" data-id="${id}" data-tipo="${tipo}" ${presenteChecked}>
            </td>
            <td class="appello-cell-check">
                <input type="checkbox" class="appello-checkbox appello-check-mensa" data-id="${id}" data-tipo="${tipo}" ${mensaChecked}>
            </td>
            <td class="appello-cell-riconsegna">
                ${riconsegnaCell}
            </td>
        </tr>
    `;
}

function ripristinaControlliAppello(tipo, id) {
    const presenza = getAppelloPresenza(tipo, id);
    const presenteEl = document.querySelector(
        `.appello-check-giornata[data-id="${id}"][data-tipo="${tipo}"]`
    );
    const mensaEl = document.querySelector(
        `.appello-check-mensa[data-id="${id}"][data-tipo="${tipo}"]`
    );

    if (presenteEl) presenteEl.checked = Boolean(presenza?.ora_arrivo);
    if (mensaEl) mensaEl.checked = presenza?.pranzo === 'si';
}

async function salvaPresenzaAppello(idPersona, { presente, mensa, riconsegna } = {}, tipo = 'bambino') {
    if (tipo !== 'bambino' && tipo !== 'animatore') {
        const messaggio = `Errore salvataggio presenza: tipo "${tipo}" non valido.`;
        console.error(messaggio);
        if (typeof mostraNotifica === 'function') {
            mostraNotifica(messaggio, 'error');
        }
        return false;
    }

    const id = Number(idPersona);
    if (!Number.isInteger(id) || String(idPersona ?? '').trim() === '') {
        const messaggio = 'Errore salvataggio presenza: ID non valido.';
        console.error(messaggio);
        if (typeof mostraNotifica === 'function') {
            mostraNotifica(messaggio, 'error');
        }
        return false;
    }

    const dataISO = document.getElementById('appelloDataInput')?.value
        || formattaDataISO(new Date());
    const chiaveCoda = `${tipo}:${id}:${dataISO}`;

    return accodaSalvataggioAppello(chiaveCoda, async () => {
        try {
            if (typeof sb === 'undefined' || !sb) {
                throw new Error('Connessione a Supabase non disponibile.');
            }

            const presenzaSalvata = getAppelloPresenza(tipo, id);
            const presenzaEsistente = presenzaSalvata?.data === dataISO
                ? presenzaSalvata
                : null;
            const payload = tipo === 'animatore'
                ? { id_animatore: id, data: dataISO }
                : { id_bambino: id, data: dataISO };

            if (presente !== undefined) {
                payload.ora_arrivo = presente
                    ? presenzaEsistente?.ora_arrivo || new Date().toTimeString().slice(0, 8)
                    : null;
            }
            if (mensa !== undefined) payload.pranzo = mensa ? 'si' : 'no';
            if (tipo === 'bambino' && riconsegna !== undefined) {
                payload.riconsegna = riconsegna;
            }

            const onConflict = tipo === 'animatore'
                ? 'id_animatore,data'
                : 'id_bambino,data';

            const { data, error } = await sb
                .from('presenze')
                .upsert(payload, { onConflict })
                .select('id_presenza, id_animatore, id_bambino, data, ora_arrivo, pranzo, riconsegna')
                .single();

            if (error) {
                throw new Error(
                    [error.code, error.message, error.details, error.hint]
                        .filter(Boolean)
                        .join(' | ')
                );
            }

            const dataAttuale = document.getElementById('appelloDataInput')?.value
                || formattaDataISO(new Date());

            if (dataAttuale === dataISO) {
                if (tipo === 'animatore') {
                    appelloPresenzeAnimatoriMap[id] = data;
                } else {
                    appelloPresenzeBambiniMap[id] = data;
                }
            }

            if (typeof mostraNotifica === 'function') {
                mostraNotifica('Presenza aggiornata.', 'success');
            }
            return true;
        } catch (err) {
            const messaggio = `Errore salvataggio presenza: ${err.message}`;
            console.error(messaggio);
            if (typeof mostraNotifica === 'function') {
                mostraNotifica(messaggio, 'error');
            }
            return false;
        }
    });
}

document.addEventListener('change', async event => {
    if (!event.target.matches('.appello-check-giornata, .appello-check-mensa')) {
        return;
    }

    const id = event.target.dataset.id;
    const tipo = event.target.dataset.tipo;
    const presenteEl = document.querySelector(
        `.appello-check-giornata[data-id="${id}"][data-tipo="${tipo}"]`
    );
    const mensaEl = document.querySelector(
        `.appello-check-mensa[data-id="${id}"][data-tipo="${tipo}"]`
    );

    if (!presenteEl || !mensaEl) return;

    presenteEl.disabled = true;
    mensaEl.disabled = true;

    const salvata = await salvaPresenzaAppello(id, {
        presente: presenteEl.checked,
        mensa: mensaEl.checked
    }, tipo);

    if (!salvata) ripristinaControlliAppello(tipo, id);
    presenteEl.disabled = false;
    mensaEl.disabled = false;
});

document.addEventListener('blur', async event => {
    if (!event.target.matches('.appello-riconsegna-input') || event.target.disabled) {
        return;
    }

    const salvata = await salvaPresenzaAppello(
        event.target.dataset.id,
        { riconsegna: event.target.value },
        'bambino'
    );

    if (!salvata) {
        const presenza = appelloPresenzeBambiniMap[event.target.dataset.id];
        event.target.value = presenza?.riconsegna || '';
    }
}, true);

document.addEventListener('DOMContentLoaded', () => {
    const dataInput = document.getElementById('appelloDataInput');
    if (!dataInput) return;

    dataInput.value = formattaDataISO(new Date());
    dataInput.addEventListener('change', () => {
        caricaAppello(parseDataAppello(dataInput.value));
    });
    caricaAppello(parseDataAppello(dataInput.value));
});

//======================================
// CONTEGGIO PRESENZE GIORNALIERE (Admin)
// Mostra in tempo reale quante persone (bambini + animatori)
// sono presenti e quante sono a mensa oggi.
//======================================
/**
 * Conta le presenze di oggi dalla tabella 'presenze' e aggiorna la card.
 */
async function caricaConteggiPresenze() {
    const elPresenti = document.getElementById('presenzePresentiCount');
    const elMensa = document.getElementById('presenzeMensaCount');
    const elData = document.getElementById('presenzeDataLabel');

    if (!elPresenti || !elMensa) return;
    if (typeof sb === 'undefined' || !sb) return;

    const oggiISO = formattaDataISO(new Date());

    if (elData) {
        elData.textContent = new Date().toLocaleDateString('it-IT', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
    }

    try {
        const { data, error } = await sb
            .from('presenze')
            .select('ora_arrivo, pranzo')
            .eq('data', oggiISO);

        if (error) throw error;

        const righe = data || [];
        // Righe con ora_arrivo valorizzata = persona presente (bambino O animatore)
        const presenti = righe.filter(r => r.ora_arrivo !== null && r.ora_arrivo !== '').length;
        const mensa = righe.filter(r => r.pranzo === 'si').length;

        elPresenti.textContent = presenti;
        elMensa.textContent = mensa;
    } catch (err) {
        console.error('Errore conteggio presenze:', err);
        elPresenti.textContent = '–';
        elMensa.textContent = '–';
    }
}

/**
 * Avvia l'aggiornamento automatico dei conteggi:
 * 1) Realtime Supabase (istantaneo) se abilitato sulla tabella 'presenze'
 * 2) Polling ogni 15 secondi come fallback sempre attivo
 */
function avviaAggiornamentoPresenze() {
    if (!document.getElementById('presenzePresentiCount')) return;
    if (typeof sb === 'undefined' || !sb) return;

    // Caricamento iniziale
    caricaConteggiPresenze();

    // 1) Iscrizione Realtime (richiede replication abilitata su 'presenze')
    try {
        if (presenzeRealtimeChannel && typeof sb.removeChannel === 'function') {
            sb.removeChannel(presenzeRealtimeChannel);
        }
        presenzeRealtimeChannel = sb
            .channel('presenze-grest-realtime')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'presenze' },
                () => caricaConteggiPresenze()
            )
            .subscribe((status) => {
                console.log('Realtime presenze:', status);
            });
    } catch (err) {
        console.warn('Realtime non disponibile, uso solo il polling:', err);
    }

    // 2) Fallback polling
    if (presenzePollingTimer) clearInterval(presenzePollingTimer);
    presenzePollingTimer = setInterval(caricaConteggiPresenze, PRESENZE_POLLING_MS);
}

// Avvia anche se la pagina viene ricaricata mentre l'admin è già sbloccato
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('presenzeCard')) {
        // Se la card esiste, prova subito (funziona anche senza login admin)
        avviaAggiornamentoPresenze();
    }
});

//======================================
// NAVIGAZIONE MENU: forza apertura nella STESSA scheda
// (evita l'apertura di nuove schede quando si esce dalla pagina admin)
//======================================
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.top-right-dropdown a, .top-right-menu a').forEach(link => {
        // Rimuove qualsiasi attributo target presente
        link.removeAttribute('target');
        // Forza la navigazione nella stessa scheda
        link.addEventListener('click', (e) => {
            e.preventDefault();
            if (link.href) {
                window.location.href = link.href;
            }
        });
    });
});

let paginaCorrenteComponentiSquadra = 1;
const COMPONENTI_SQUADRA_PER_PAGINA = 4;
let componentiSquadraCorrente = [];
let componentiSquadraAccountId = null;

function renderComponentiSquadra(members, accountId) {
    const membersEl = document.getElementById('teamMembers');
    if (!membersEl) return;

    // Se cambio account, riparto da pagina 1
    if (componentiSquadraAccountId !== accountId) {
        paginaCorrenteComponentiSquadra = 1;
    }
    componentiSquadraCorrente = members;
    componentiSquadraAccountId = accountId;

    if (!members || members.length === 0) {
        membersEl.innerHTML = '<li>Nessun componente trovato.</li>';
        aggiornaPaginazioneComponentiSquadra(0);
        return;
    }

    const totalePagine = Math.ceil(members.length / COMPONENTI_SQUADRA_PER_PAGINA);
    if (paginaCorrenteComponentiSquadra > totalePagine) paginaCorrenteComponentiSquadra = totalePagine;
    if (paginaCorrenteComponentiSquadra < 1) paginaCorrenteComponentiSquadra = 1;

    const inizio = (paginaCorrenteComponentiSquadra - 1) * COMPONENTI_SQUADRA_PER_PAGINA;
    const paginaMembri = members.slice(inizio, inizio + COMPONENTI_SQUADRA_PER_PAGINA);

    membersEl.innerHTML = paginaMembri.map(m => {
        const nomeCompleto = `${m.nome || ''} ${m.cognome || ''}`.trim();
        const isTu = m.tipo === 'animatore' && String(m.id) === String(accountId);
        const etichettaTu = isTu ? ' (tu)' : '';
        const badge = m.tipo === 'bambino'
            ? ' <span class="member-badge member-badge-bambino">B</span>'
            : ' <span class="member-badge member-badge-animatore">A</span>';
        return `<li>${nomeCompleto}${etichettaTu}${badge}</li>`;
    }).join('');

    aggiornaPaginazioneComponentiSquadra(totalePagine);
}

function aggiornaPaginazioneComponentiSquadra(totalePagine) {
    const membersEl = document.getElementById('teamMembers');
    if (!membersEl || !membersEl.parentNode) return;

    let paginazione = document.getElementById('teamMembersPagination');
    if (!paginazione) {
        paginazione = document.createElement('div');
        paginazione.id = 'teamMembersPagination';
        paginazione.className = 'pagination-container';
        membersEl.parentNode.insertBefore(paginazione, membersEl.nextSibling);
    }

    if (totalePagine <= 1) {
        paginazione.innerHTML = '';
        paginazione.style.display = 'none';
        return;
    }

    paginazione.style.display = 'flex';

    const dots = Array.from({ length: totalePagine }, (_, i) => {
        const pagina = i + 1;
        const attiva = pagina === paginaCorrenteComponentiSquadra ? 'active' : '';
        return `<span class="pagination-dot ${attiva}" data-page="${pagina}"></span>`;
    }).join('');

    paginazione.innerHTML = `
        <button type="button" class="pagination-btn"
            ${paginaCorrenteComponentiSquadra === 1 ? 'disabled' : ''}
            data-nav="prev">&#10094;</button>
        <div class="pagination-dots">${dots}</div>
        <button type="button" class="pagination-btn"
            ${paginaCorrenteComponentiSquadra === totalePagine ? 'disabled' : ''}
            data-nav="next">&#10095;</button>
    `;
}

function cambiaPaginaComponentiSquadra(nuovaPagina) {
    const totalePagine = Math.ceil(componentiSquadraCorrente.length / COMPONENTI_SQUADRA_PER_PAGINA) || 1;
    if (nuovaPagina < 1 || nuovaPagina > totalePagine) return;
    paginaCorrenteComponentiSquadra = nuovaPagina;
    renderComponentiSquadra(componentiSquadraCorrente, componentiSquadraAccountId);
}

// Delega eventi: niente onclick inline, più pulito
document.addEventListener('click', event => {
    const nav = event.target.closest('.pagination-btn');
    if (nav && nav.closest('#teamMembersPagination')) {
        if (nav.disabled) return;
        const delta = nav.dataset.nav === 'prev' ? -1 : 1;
        cambiaPaginaComponentiSquadra(paginaCorrenteComponentiSquadra + delta);
        return;
    }
    const dot = event.target.closest('.pagination-dot');
    if (dot && dot.closest('#teamMembersPagination')) {
        cambiaPaginaComponentiSquadra(Number(dot.dataset.page));
    }
});