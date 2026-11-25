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

const SABOR_ADMIN_PASSWORD = "sabatoratorio";
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
let appelloAnimatoreCorrente = null;
let childHealthTarget = null;
let childFlagRecords = [];
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
    } else {
        showLoginError('Password errata. Riprova.');
    }
}

function checkSaborAdminPassword() {
    const passwordInput = document.getElementById('adminPassword');
    const password = passwordInput ? passwordInput.value : '';
    if (password === SABOR_ADMIN_PASSWORD) {
        showLoginError('');
        unlockAdminArea();
    } else {
        showLoginError('Password errata. Riprova.');
    }
}

function showLoginError(message) {
    const errorEl = document.getElementById('loginError');
    if (errorEl) errorEl.textContent = message;
}

function unlockAdminArea() {
    
    document.body.classList.add('admin-active'); 

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
    if (adminContent) {
        adminContent.style.display = document.querySelector('.sabor-admin-container') ? 'grid' : 'block';
    }

    renderCalendar(currentCalendarDate);
    mostraAnimatori();

    avviaAggiornamentoPresenze();
    if (document.getElementById('registrazioniBambiniList')) aggiornaElencoRegistrazioniBambini();
    if (document.getElementById('saborIncontriAdminBody')) inizializzaAdminSabor();
    if (document.getElementById('saborAdminAvvisiList')) caricaAvvisiAdminSabor();
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

    // 🔽 NUOVO: assicura che la cache delle squadre sia caricata PRIMA di renderizzare
    if (typeof caricaSquadre === 'function' && (!squadreCorrenti || squadreCorrenti.length === 0)) {
        try { await caricaSquadre(); } catch (e) { console.warn('Squadre non caricate:', e); }
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
        // ✅ Query semplice, senza join (i nomi squadra li risolviamo in JS)
        const { data: animatori, error } = await sb
            .from('animatori')
            .select('id_animatore, nome, cognome, ruolo, settimana, squadra, nominativo, sabato_oratorio')
            .order('squadra', { ascending: true })
            .order('nome', { ascending: true });

        if (error) throw error;

        animatoriCorrenti = (animatori || []).filter(a => {
            if (!a.settimana) return false;
            const arr = Array.isArray(a.settimana) ? a.settimana : [a.settimana];
            return arr.map(String).includes(String(weekNumber));
        });

        paginaCorrenteAnimatori = 1;

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

function getNomeSquadra(animatore) {
    if (!animatore) return 'Nessuna';

    const squadraId = animatore.squadra;
    if (squadraId === null || squadraId === undefined || squadraId === '') {
        return 'Nessuna';
    }

    // Cerca nella cache delle squadre
    if (typeof squadreCorrenti !== 'undefined' && Array.isArray(squadreCorrenti) && squadreCorrenti.length > 0) {
        const sq = squadreCorrenti.find(s =>
            String(s.id_squadra) === String(squadraId) ||
            String(s.id) === String(squadraId)
        );
        if (sq && sq.nome) return sq.nome;
    }

    // Fallback: prova con window.SQUADRE (caricato da altri punti dell'app)
    const listaSquadre = (typeof SQUADRE !== 'undefined' && SQUADRE) || window.SQUADRE || [];
    if (Array.isArray(listaSquadre) && listaSquadre.length > 0) {
        const sq = listaSquadre.find(s =>
            String(s.id_squadra) === String(squadraId) ||
            String(s.id) === String(squadraId)
        );
        if (sq && sq.nome) return sq.nome;
    }

    // Ultimo fallback: mostra l'ID numerico
    return String(squadraId);
}

function getSquadraLabel(animatore) {
    const nome = getNomeSquadra(animatore);
    return (nome === 'Nessuna') ? 'Nessuna squadra' : `Squadra ${nome}`;
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
            const squadra = getNomeSquadra(animatore);
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
            password: passwordGenerata
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

    const passwordCorretta = accountSelezionatoTemporaneo.Password
        || accountSelezionatoTemporaneo.password
        || '';
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

    if (nuovaPassword.length < 6) {
        mostraMessaggioModal('La nuova password deve contenere almeno 6 caratteri!', 'error');
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

        const passwordDatabase = dbUser.Password || dbUser.password || '';
        if (vecchiaPassword !== passwordDatabase) {
            mostraMessaggioModal('La password attuale inserita non è corretta!', 'error');
            return;
        }

        const { error: updateError } = await sb
            .from('animatori')
            .update({ password: nuovaPassword })
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
    if ((!listaSquadre || listaSquadre.length === 0) && sb) {
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
    let bambiniSquadra = squadraRaw
        ? tuttiBambini.filter(matchSquadra)
        : [];
    if (sb && bambiniSquadra.length) {
        const { data: flags, error: flagsError } = await sb
            .from('status_bimbi')
            .select('id_bambino, stellina')
            .eq('stellina', 'si');
        if (flagsError) {
            console.error('Errore caricamento stelline della squadra:', flagsError);
        } else {
            const starredChildIds = new Set((flags || []).map(flag => Number(flag.id_bambino)));
            bambiniSquadra = bambiniSquadra.map(child => ({
                ...child,
                stellina: starredChildIds.has(Number(child.id_bambino))
            }));
        }
    }

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
    const dropdowns = document.querySelectorAll('.piscinaSquadreSelect');
    if (!dropdowns.length) return;

    let listaSquadre = typeof SQUADRE !== 'undefined' ? SQUADRE : (window.SQUADRE || []);

    if ((!listaSquadre || listaSquadre.length === 0) && typeof sb !== 'undefined') {
        const { data } = await sb.from('squadre').select('*');
        if (data) {
            listaSquadre = data;
            window.SQUADRE = data;
        }
    }

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

async function apriGestioneStelline() {
    const modal = document.getElementById('childFlagsModal');
    const list = document.getElementById('childFlagsList');
    if (!modal || !list || !sb) return;

    list.textContent = 'Caricamento bambini...';
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');

    const [childrenResult, flagsResult] = await Promise.all([
        sb.from('bambini').select('id_bambini, nome, cognome').order('cognome').order('nome'),
        sb.from('status_bimbi').select('id_bambino, stellina, problematica, istruzioni')
    ]);
    if (childrenResult.error || flagsResult.error) {
        const error = childrenResult.error || flagsResult.error;
        console.error('Errore caricamento stelline bambini:', error);
        list.textContent = 'Errore durante il caricamento. Riprova.';
        mostraNotifica('Impossibile caricare l’elenco dei bambini.', 'error');
        return;
    }

    const flagsByChild = new Map((flagsResult.data || []).map(flag => [Number(flag.id_bambino), flag]));
    childFlagRecords = childrenResult.data || [];
    document.getElementById('childFlagsTotal').textContent = String(childFlagRecords.length);
    if (!childFlagRecords.length) {
        list.textContent = 'Nessun bambino presente nella lista.';
        return;
    }

    list.innerHTML = childFlagRecords.map(child => {
        const flag = flagsByChild.get(Number(child.id_bambini));
        const marked = flag?.stellina === 'si';
        const nomeCompleto = escapeAppelloHtml(`${child.cognome || ''} ${child.nome || ''}`.trim());
        return `<article class="child-flag-row${marked ? ' is-marked' : ''}" data-child-id="${child.id_bambini}">
            <strong class="child-flag-name">${nomeCompleto}${marked ? ' <span class="appello-stellina" aria-label="Bambino con stellina">★</span>' : ''}</strong>
            <label class="child-flag-check">
                <input type="checkbox" data-child-flag-toggle ${marked ? 'checked' : ''}>
                Stellina
            </label>
            <label>
                <span>Problematica</span>
                <input type="text" data-child-flag-problem value="${escapeAppelloHtml(flag?.problematica || '')}" ${marked ? '' : 'disabled'} maxlength="1000">
            </label>
            <label>
                <span>Indicazioni per assisterlo</span>
                <textarea data-child-flag-instructions ${marked ? '' : 'disabled'} maxlength="4000">${escapeAppelloHtml(flag?.istruzioni || '')}</textarea>
            </label>
        </article>`;
    }).join('');
}

function chiudiGestioneStelline() {
    const modal = document.getElementById('childFlagsModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    childFlagRecords = [];
}

async function salvaGestioneStelline() {
    const list = document.getElementById('childFlagsList');
    if (!sb || !list) return;

    const payload = [];
    for (const row of list.querySelectorAll('.child-flag-row')) {
        const checkbox = row.querySelector('[data-child-flag-toggle]');
        const problemInput = row.querySelector('[data-child-flag-problem]');
        const instructionsInput = row.querySelector('[data-child-flag-instructions]');
        const problematica = problemInput.value.trim();
        if (checkbox.checked && !problematica) {
            problemInput.focus();
            mostraNotifica('Indica la problematica per ogni bambino con la stellina.', 'error');
            return;
        }
        payload.push({
            id_bambino: Number(row.dataset.childId),
            stellina: checkbox.checked ? 'si' : 'no',
            problematica: checkbox.checked ? problematica : null,
            istruzioni: checkbox.checked ? instructionsInput.value.trim() || null : null
        });
    }

    const button = document.getElementById('saveChildFlagsBtn');
    button.disabled = true;
    try {
        for (let i = 0; i < payload.length; i += 100) {
            const { error } = await sb.from('status_bimbi').upsert(payload.slice(i, i + 100), {
                onConflict: 'id_bambino'
            });
            if (error) throw error;
        }
        mostraNotifica('Stelline e informazioni salvate.', 'success');
        chiudiGestioneStelline();
    } catch (error) {
        console.error('Errore salvataggio stelline bambini:', error);
        mostraNotifica('Errore durante il salvataggio. Le modifiche potrebbero non essere complete.', 'error');
    } finally {
        button.disabled = false;
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

    if (document.body.classList.contains('sabor-theme')) {
        const autoreSelect = document.getElementById('avvisoAutore');
        autoreDisplay.textContent = autoreSelect?.value || 'Animatore';
        return;
    }

    const nominativo = getNominativoAutoreAttivo();

    if (nominativo) {
        autoreDisplay.textContent = nominativo;
        autoreDisplay.style.color = 'var(--accent, #4ecdc4)';
    } else {
        autoreDisplay.innerHTML = '<span class="avviso-account-warning">Nessun account selezionato! <a class="avviso-account-link" href="selezione_account.html">Selezionalo qui</a></span>';
    }
}

// Invia l'avviso a Supabase impedendo l'invio ad utenti non identificati
async function inviaNuovoAvviso() {
    const inputTesto = document.getElementById('avvisoInput');
    if (!inputTesto) return;

    const isSabor = document.body.classList.contains('sabor-theme');
    const autore = isSabor
        ? (document.getElementById('avvisoAutore')?.value || 'Animatore')
        : getNominativoAutoreAttivo();

    if (!isSabor && !autore) {
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
        const tabella = isSabor ? 'avvisi_sabor' : 'avvisi';
        const { error } = await sb.from(tabella).insert([{ testo, autore }]);
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
    const escapeNotice = document.body.classList.contains('sabor-theme')
        ? escapeAppelloHtml
        : value => value;

    if (!odierniContainer && !storicoContainer) return;

    try {
        const tabella = document.body.classList.contains('sabor-theme') ? 'avvisi_sabor' : 'avvisi';
        const { data, error } = await sb
            .from(tabella)
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
                odierniContainer.innerHTML = '<p class="avvisi-empty">Nessun avviso per oggi.</p>';
            } else {
                odierniContainer.innerHTML = avvisiOdierni.map(a => `
                    <div class="avviso-item">
                        <div class="avviso-meta">
                            <strong class="avviso-autore">${escapeNotice(a.autore || 'Anonimo')}</strong>
                            <span class="avviso-data">${new Date(a.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        </div>
                        <p class="avviso-testo">${escapeNotice(a.testo)}</p>
                    </div>
                `).join('');
            }
        }

        // Render Storico Completo
        if (storicoContainer) {
            storicoContainer.innerHTML = data.map(a => `
                <div class="avviso-item">
                    <div class="avviso-meta">
                        <strong class="avviso-autore">${escapeNotice(a.autore || 'Anonimo')}</strong>
                        <span class="avviso-data">${new Date(a.created_at).toLocaleString()}</span>
                    </div>
                    <p class="avviso-testo">${escapeNotice(a.testo)}</p>
                </div>
            `).join('');
        }

    } catch (err) {
        console.error("Errore caricamento avvisi:", err);
        if (document.body.classList.contains('sabor-theme') && (odierniContainer || storicoContainer)) {
            const messaggio = err.code === 'PGRST205'
                ? 'Avvisi Sabato Oratorio non ancora configurati. Esegui db_migration_avvisi_sabor.sql su Supabase.'
                : 'Impossibile caricare gli avvisi. Controlla la connessione e riprova.';
            if (odierniContainer) odierniContainer.textContent = messaggio;
            if (storicoContainer) storicoContainer.textContent = messaggio;
        }
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

async function salvaAvvisoAdminSabor() {
    const input = document.getElementById('saborAdminAvvisoInput');
    if (!input) return;

    const testo = input.value.trim();
    if (!testo) {
        mostraNotifica('Scrivi il testo dell\'avviso prima di pubblicare.', 'error');
        return;
    }

    try {
        const { error } = await sb.from('avvisi_sabor').insert([{ autore: 'Admin', testo }]);
        if (error) throw error;

        input.value = '';
        mostraNotifica('Avviso pubblicato.', 'success');
        await caricaAvvisiAdminSabor();
    } catch (error) {
        console.error('Errore pubblicazione avviso Sabato Oratorio:', error);
        mostraNotifica('Impossibile pubblicare l\'avviso.', 'error');
    }
}

async function caricaAvvisiAdminSabor() {
    const container = document.getElementById('saborAdminAvvisiList');
    if (!container || !sb) return;

    try {
        const { data, error } = await sb
            .from('avvisi_sabor')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;

        if (!data?.length) {
            container.innerHTML = '<p>Nessun avviso pubblicato.</p>';
            return;
        }

        container.innerHTML = data.map(avviso => `
            <article class="avviso-item">
                <div class="sabor-avviso-admin-meta">
                    <strong>${escapeAppelloHtml(avviso.autore || 'Admin')}</strong>
                    <time>${new Date(avviso.created_at).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}</time>
                </div>
                <p>${escapeAppelloHtml(avviso.testo)}</p>
                <button type="button" class="sabor-btn-azione sabor-btn-delete" data-sabor-avviso-delete="${Number(avviso.id)}">Elimina</button>
            </article>
        `).join('');
    } catch (error) {
        console.error('Errore caricamento avvisi Sabato Oratorio admin:', error);
        container.textContent = error.code === 'PGRST205'
            ? 'La tabella avvisi_sabor non esiste ancora. Esegui db_migration_avvisi_sabor.sql su Supabase.'
            : 'Errore durante il caricamento degli avvisi.';
    }
}

async function eliminaAvvisoAdminSabor(id) {
    if (!confirm('Eliminare questo avviso?')) return;

    try {
        const { error } = await sb.from('avvisi_sabor').delete().eq('id', id);
        if (error) throw error;
        await caricaAvvisiAdminSabor();
    } catch (error) {
        console.error('Errore eliminazione avviso Sabato Oratorio:', error);
        mostraNotifica('Impossibile eliminare l\'avviso.', 'error');
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
        const verificaPassword = document.body.classList.contains('sabor-admin-theme')
            ? checkSaborAdminPassword
            : checkAdminPassword;
        loginButton.addEventListener('click', verificaPassword);
        adminPassword.addEventListener('keypress', e => {
            if (e.key === 'Enter') verificaPassword();
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
        const closeMenu = () => {
            menuDropdown.classList.remove('open');
            menuToggle.setAttribute('aria-expanded', 'false');
            menuDropdown.setAttribute('aria-hidden', 'true');
        };

        menuToggle.addEventListener('click', event => {
            event.stopPropagation();
            const isOpen = menuDropdown.classList.toggle('open');
            menuToggle.setAttribute('aria-expanded', String(isOpen));
            menuDropdown.setAttribute('aria-hidden', String(!isOpen));
        });

        document.addEventListener('click', event => {
            if (!menuToggle.contains(event.target) && !menuDropdown.contains(event.target)) {
                closeMenu();
            }
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
                closeMenu();
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
    if (!document.body.classList.contains('sabor-theme') &&
        (!window.animatoriAccounts || window.animatoriAccounts.length === 0) &&
        typeof loadAnimatoriAccounts === 'function') {
        await loadAnimatoriAccounts();
    }

    if (document.getElementById('adminAvvisiList')) {
        await caricaAvvisiAdmin();
    }

    // 3. Ora che animatoriAccounts è pronto, aggiorna il badge autore e carica gli avvisi
    if (!document.body.classList.contains('sabor-theme')) caricaBadgeAutoreAvvisi();
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

function formattaDataMeteo(dateString, options) {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Intl.DateTimeFormat('it-IT', options).format(new Date(year, month - 1, day, 12));
}

function creaCardPrevisioneMeteo(dateString, tempMax, tempMin, weatherCode, label = '') {
    const forecast = document.createElement('article');
    forecast.className = 'weather-day';
    const info = interpretaCodiceMeteo(weatherCode);

    const heading = document.createElement('h4');
    heading.textContent = label || formattaDataMeteo(dateString, { weekday: 'long', day: 'numeric', month: 'long' });

    const icon = document.createElement('span');
    icon.className = 'weather-day-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = info.icona;

    const description = document.createElement('span');
    description.className = 'weather-day-description';
    description.textContent = info.descrizione;

    const temperatures = document.createElement('span');
    temperatures.className = 'weather-day-temperatures';
    temperatures.textContent = `${Math.round(tempMax)}° / ${Math.round(tempMin)}°`;

    forecast.append(heading, icon, description, temperatures);
    return forecast;
}

function mostraMessaggioMeteo(container, message) {
    if (!container) return;
    const paragraph = document.createElement('p');
    paragraph.className = 'weather-forecast-message';
    paragraph.textContent = message;
    container.replaceChildren(paragraph);
}

/**
 * Carica una previsione condivisa per il GREST e per gli incontri del sabato.
 */
async function caricaPrevisioniMeteo(lat = 43.5235, lon = 11.5677) {
    const forecastGrest = document.getElementById('weatherForecast');
    const forecastSabor = document.getElementById('saborWeatherForecast');
    const currentWeatherElements = {
        temperature: document.getElementById('tempCurrent'),
        range: document.getElementById('tempRange'),
        icon: document.getElementById('weatherIcon'),
        description: document.getElementById('weatherDesc')
    };

    if (!forecastGrest && !forecastSabor && !currentWeatherElements.temperature) return;

    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&forecast_days=16&timezone=auto`;
        const response = await fetch(url);
        if (!response.ok) throw new Error("Impossibile recuperare i dati meteo");
        const data = await response.json();
        const daily = data.daily;
        const today = data.current.time.split('T')[0];
        const todayIndex = daily.time.indexOf(today);
        if (todayIndex < 0) throw new Error("Previsioni giornaliere non disponibili per oggi");

        if (currentWeatherElements.temperature) {
            const info = interpretaCodiceMeteo(data.current.weather_code);
            currentWeatherElements.temperature.textContent = `${Math.round(data.current.temperature_2m)}°C`;
            if (currentWeatherElements.range) currentWeatherElements.range.textContent = `Max ${Math.round(daily.temperature_2m_max[todayIndex])}° / Min ${Math.round(daily.temperature_2m_min[todayIndex])}°`;
            if (currentWeatherElements.icon) currentWeatherElements.icon.textContent = info.icona;
            if (currentWeatherElements.description) currentWeatherElements.description.textContent = info.descrizione;
        }

        if (forecastGrest) {
            const forecastDays = daily.time
                .map((date, index) => ({ date, index }))
                .filter(day => day.date > today && ![0, 6].includes(new Date(`${day.date}T12:00:00`).getDay()))
                .slice(0, 4);
            forecastGrest.replaceChildren(...forecastDays.map(({ date, index }) =>
                creaCardPrevisioneMeteo(date, daily.temperature_2m_max[index], daily.temperature_2m_min[index], daily.weather_code[index])
            ));
            if (!forecastDays.length) mostraMessaggioMeteo(forecastGrest, 'Previsioni dei prossimi giorni non disponibili.');
        }

        if (forecastSabor) {
            const saturdayForecasts = daily.time
                .map((date, index) => ({ date, index }))
                .filter(day => day.date >= today && new Date(`${day.date}T12:00:00`).getDay() === 6)
                .slice(0, 2);
            forecastSabor.replaceChildren(...saturdayForecasts.map(({ date, index }) =>
                creaCardPrevisioneMeteo(
                    date,
                    daily.temperature_2m_max[index],
                    daily.temperature_2m_min[index],
                    daily.weather_code[index],
                    `${date === today ? 'Oggi · ' : ''}${formattaDataMeteo(date, { weekday: 'long', day: 'numeric', month: 'long' })}`
                )
            ));
            if (!saturdayForecasts.length) mostraMessaggioMeteo(forecastSabor, 'Previsioni per i prossimi sabati non disponibili.');
        }

    } catch (error) {
        console.error("Errore meteo:", error);
        if (currentWeatherElements.description) currentWeatherElements.description.textContent = "Servizio meteo non disponibile";
        mostraMessaggioMeteo(forecastGrest, 'Previsioni non disponibili. Riprova più tardi.');
        mostraMessaggioMeteo(forecastSabor, 'Previsioni non disponibili. Riprova più tardi.');
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

document.addEventListener('DOMContentLoaded', () => {
    caricaPrevisioniMeteo();
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
    if (!sb) {
        alert('Connessione al database non disponibile. Riprova quando la connessione è attiva.');
        return;
    }
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
    if (!sb || !document.querySelector('.attivita-contenitore')) return;

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

function normalizzaDataSabato(dataISO) {
    const [anno, mese, giorno] = dataISO.split('-').map(Number);
    const data = new Date(anno, mese - 1, giorno);
    const giorniAlSabato = (6 - data.getDay() + 7) % 7;
    data.setDate(data.getDate() + giorniAlSabato);
    return formattaDataISO(data);
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
    appelloAnimatoreCorrente = null;

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
            sb.from('animatori')
                .select('id_animatore, nome, cognome, ruolo, settimana, squadra, nominativo, sabato_oratorio')
                .order('cognome', { ascending: true }),
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
        appelloAnimatoreCorrente = animatoreCorrente;

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
                
            // 1. L'animatore loggato deve SEMPRE comparire,
            //    anche se la sua settimana non corrisponde a quella attiva
            const isProprietario = (() => {
                if (selectedAnimatoreId !== null && selectedAnimatoreId !== undefined && selectedAnimatoreId !== '') {
                    return String(a.id_animatore) === String(selectedAnimatoreId);
                }
                if (selectedAccountId) {
                    return String(getAccountId(a)) === String(selectedAccountId);
                }
                return false;
            })();
        
            if (isProprietario) return true;
        
            // 2. Per gli altri: parsing robusto della settimana
            const settimane = typeof normalizzaSettimane === 'function'
                ? normalizzaSettimane(a.settimana)
                : (Array.isArray(a.settimana) ? a.settimana.map(String) : [String(a.settimana || '')]);
        
            // Se non ha nessuna settimana valida, mostralo comunque
            if (!settimane.length || !settimane[0]) return true;
        
            return settimane.includes(String(weekNumber));
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

function assicuraModaleDettagliBambino() {
    let modal = document.getElementById('childHealthModal');
    if (modal) return modal;

    const container = document.createElement('div');
    container.innerHTML = `
        <div id="childHealthModal" class="modal-overlay" aria-hidden="true">
            <section class="modal-box child-health-modal" role="dialog" aria-modal="true" aria-labelledby="childHealthTitle">
                <h2 id="childHealthTitle">Informazioni importanti</h2>
                <p id="childHealthChildName" class="child-health-name"></p>
                <div id="childHealthDetails" class="child-health-details" hidden>
                    <h3>Problematica</h3>
                    <p id="childHealthProblem"></p>
                    <h3>Indicazioni per assisterlo</h3>
                    <p id="childHealthInstructions" style="resize:none"></p>
                    <div class="modal-actions">
                        <button type="button" class="btn-confirm" id="closeChildHealthDetailsBtn">Chiudi</button>
                    </div>
                </div>
            </section>
        </div>`;
    modal = container.firstElementChild;
    document.body.appendChild(modal);
    return modal;
}

async function apriDettagliSaluteBambino(idBambino) {
    const bambino = appelloBambini.find(item => Number(item.id_bambino) === Number(idBambino))
        || (bambiniCacheGrest || []).find(item => Number(item.id_bambino) === Number(idBambino));
    if (!bambino) return;
    const modal = assicuraModaleDettagliBambino();
    if (!modal) return;

    childHealthTarget = bambino;
    document.getElementById('childHealthChildName').textContent =
        `${bambino.cognome || ''} ${bambino.nome || ''}`.trim();
    document.getElementById('childHealthProblem').textContent = '';
    document.getElementById('childHealthInstructions').textContent = '';
    document.getElementById('childHealthDetails').hidden = false;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    try {
        const { data, error } = await sb
            .from('status_bimbi')
            .select('problematica, istruzioni')
            .eq('id_bambino', childHealthTarget.id_bambino)
            .maybeSingle();
        if (error) throw error;
        document.getElementById('childHealthProblem').textContent = data?.problematica || 'Nessun dettaglio disponibile.';
        document.getElementById('childHealthInstructions').textContent = data?.istruzioni || 'Nessuna indicazione aggiuntiva.';
    } catch (error) {
        console.error('Errore caricamento dettagli bambino:', error);
        document.getElementById('childHealthProblem').textContent = 'Impossibile caricare i dettagli.';
        document.getElementById('childHealthInstructions').textContent = 'Riprova più tardi.';
    }
}

function chiudiDettagliSaluteBambino() {
    const modal = document.getElementById('childHealthModal');
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    childHealthTarget = null;
}

function renderRigaAppello(persona, tipo) {
    const nomeCompleto = `${persona.cognome || ''} ${persona.nome || ''}`.trim();
    const id = tipo === 'bambino' ? persona.id_bambino : persona.id_animatore;
    const presenzaEsistente = getAppelloPresenza(tipo, id);

    const haStellina = tipo === 'bambino'
        && appelloStatusMap[id]?.stellina === 'si';
    const stellinaHtml = haStellina
        ? `<button type="button" class="appello-stellina appello-stellina-button" data-child-health-id="${id}" aria-label="Visualizza le informazioni importanti del bambino">★</button>`
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

async function registraNuovoBambino(event) {
    event.preventDefault();

    if (!sb) {
        mostraNotifica('Database non disponibile. Ricarica la pagina.', 'error');
        return;
    }

    const form = document.getElementById('childRegistrationForm');
    const submitButton = document.getElementById('childRegistrationSubmit');
    const message = document.getElementById('childRegistrationMessage');
    if (!form || !submitButton || !message) return;

    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const nome = document.getElementById('childName').value.trim();
    const cognome = document.getElementById('childSurname').value.trim();
    const classe = document.getElementById('childClass').value;
    const saNuotare = document.querySelector('input[name="childSwimming"]:checked')?.value === 'true';
    const haAllergie = document.querySelector('input[name="childAllergies"]:checked')?.value === 'true';
    const allergieDettagli = document.getElementById('childAllergyDetails').value.trim();
    const problemi = document.getElementById('childProblems').value.trim();

    if (!nome || !cognome || !classe) {
        message.textContent = 'Compila tutti i campi obbligatori.';
        message.className = 'child-registration-message error';
        return;
    }

    if (haAllergie && !allergieDettagli) {
        message.textContent = 'Descrivi le allergie selezionate.';
        message.className = 'child-registration-message error';
        document.getElementById('childAllergyDetails').focus();
        return;
    }

    submitButton.disabled = true;
    message.textContent = 'Registrazione in corso...';
    message.className = 'child-registration-message';

    try {
        const registrazionePayload = {
            nome,
            cognome,
            classe: Number(classe),
            sa_nuotare: saNuotare,
            allergie: haAllergie,
            allergie_dettagli: haAllergie ? allergieDettagli : null,
            problemi: problemi || null,
            stato: 'in_attesa'
        };

        const { error: registrazioneError } = await sb
            .from('iscrizioni_grest')
            .insert(registrazionePayload);

        if (registrazioneError) throw registrazioneError;

        form.reset();
        document.getElementById('childAllergyDetailsLabel').hidden = true;
        document.getElementById('childAllergyDetails').required = false;
        message.textContent = `${nome} ${cognome} è stato inserito nella lista delle registrazioni in attesa.`;
        message.className = 'child-registration-message success';
        mostraNotifica('Registrazione inviata correttamente.', 'success');
    } catch (error) {
        console.error('Errore registrazione bambino:', error);
        const tabellaMancante = error?.code === 'PGRST205' || error?.code === '42P01';
        message.textContent = tabellaMancante
            ? 'Registrazioni temporaneamente non disponibili.'
            : 'Impossibile inviare la registrazione. Riprova più tardi.';
        message.className = 'child-registration-message error';
        mostraNotifica('Errore durante la registrazione.', 'error');
    } finally {
        submitButton.disabled = false;
    }
}

function csvRegistrazioni(value) {
    let testo = value === null || value === undefined ? '' : String(value);
    if (/^[=+@-]/.test(testo)) testo = `'${testo}`;
    return `"${testo.replace(/"/g, '""')}"`;
}

async function caricaRegistrazioniBambini() {
    if (!sb) throw new Error('Client Supabase non pronto');
    const { data, error } = await sb
        .from('iscrizioni_grest')
        .select('*')
        .eq('stato', 'in_attesa')
        .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
}

async function scaricaRegistrazioniBambini() {
    try {
        const registrazioni = await caricaRegistrazioniBambini();
        if (!registrazioni.length) {
            mostraNotifica('Nessuna registrazione da scaricare.', 'error');
            return;
        }

        const intestazione = [
            'ID registrazione', 'Nome', 'Cognome', 'Classe', 'Sa nuotare',
            'Allergie', 'Descrizione allergie', 'Problemi o indicazioni', 'Data registrazione'
        ];
        const righe = registrazioni.map(r => [
            r.id, r.nome, r.cognome, r.classe,
            r.sa_nuotare ? 'si' : 'no',
            r.allergie ? 'si' : 'no',
            r.allergie_dettagli || '', r.problemi || '', r.created_at || ''
        ]);

        const contenuto = '\uFEFF' + [intestazione, ...righe]
            .map(riga => riga.map(csvRegistrazioni).join(','))
            .join('\r\n');
        const blob = new Blob([contenuto], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `registrazioni_bambini_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        mostraNotifica(`Scaricate ${registrazioni.length} registrazioni.`, 'success');
    } catch (error) {
        console.error('Errore download registrazioni:', error);
        mostraNotifica('Impossibile creare il file delle registrazioni.', 'error');
    }
}

async function importaRegistrazioniBambini() {
    if (!sb) {
        mostraNotifica('Client Supabase non pronto.', 'error');
        return;
    }

    try {
        const registrazioni = await caricaRegistrazioniBambini();

        if (!registrazioni?.length) {
            mostraNotifica('Nessuna nuova registrazione da approvare.', 'error');
            return;
        }

        const { data: esistenti, error: erroreEsistenti } = await sb
            .from('bambini')
            .select('nome, cognome');
        if (erroreEsistenti) throw erroreEsistenti;

        const presenti = new Set((esistenti || []).map(bambino =>
            `${bambino.nome || ''} ${bambino.cognome || ''}`.trim().toLowerCase()
        ));

        const nuove = [];
        const righeDaAggiornare = [];

        for (const registrazione of registrazioni) {
            const nome = String(registrazione.nome || '').trim();
            const cognome = String(registrazione.cognome || '').trim();
            const nomeCompleto = `${nome} ${cognome}`.trim().toLowerCase();

            if (!nome || !cognome) {
                righeDaAggiornare.push({ id: registrazione.id, stato: 'errore' });
                continue;
            }

            if (presenti.has(nomeCompleto)) {
                righeDaAggiornare.push({ id: registrazione.id, stato: 'ignorata_duplicata' });
                continue;
            }

            nuove.push({
                nome,
                cognome,
                classe: registrazione.classe,
                squadra: null,
                settimana: null
            });
            presenti.add(nomeCompleto);
        }

        if (!nuove.length) {
            mostraNotifica('Nessuna nuova iscrizione: tutti i bambini sono già presenti o non validi.', 'error');
            return;
        }

        const payloadBambini = nuove;
        const { data: inseriti, error: erroreInserimento } = await sb
            .from('bambini')
            .insert(payloadBambini)
            .select('id_bambini, nome, cognome');
        if (erroreInserimento) throw erroreInserimento;

        const statoPayload = [];
        for (const bambinoInserito of inseriti || []) {
            const nomeCompleto = `${bambinoInserito.nome || ''} ${bambinoInserito.cognome || ''}`.trim().toLowerCase();
            const registrazione = registrazioni.find(r =>
                `${r.nome || ''} ${r.cognome || ''}`.trim().toLowerCase() === nomeCompleto
            );
            if (!registrazione) continue;

            statoPayload.push({
                id_bambino: bambinoInserito.id_bambini,
                stellina: 'no',
                nuoto: registrazione.sa_nuotare ? 'si' : 'no',
                problematica: registrazione.problemi,
                istruzioni: null
            });
            righeDaAggiornare.push({ id: registrazione.id, stato: 'importata' });
        }

        if (statoPayload.length) {
            const { error: erroreStato } = await sb
                .from('status_bimbi')
                .upsert(statoPayload, { onConflict: 'id_bambino' });
            if (erroreStato) throw erroreStato;
        }

        for (const riga of righeDaAggiornare) {
            await sb.from('iscrizioni_grest').update({ stato: riga.stato }).eq('id', riga.id);
        }

        if (typeof resetCacheBambiniGrest === 'function') resetCacheBambiniGrest();
        mostraNotifica(`Importate ${nuove.length} registrazioni approvate.`, 'success');
    } catch (error) {
        console.error('Errore approvazione registrazioni:', error);
        mostraNotifica('Impossibile importare le registrazioni.', 'error');
    }
}

async function aggiornaElencoRegistrazioniBambini() {
    const container = document.getElementById('registrazioniBambiniList');
    const cardCount = document.getElementById('registrazioniBambiniCount');
    const modalCount = document.getElementById('registrazioniBambiniModalCount');
    if (!container || !sb) return;

    container.textContent = 'Caricamento registrazioni...';
    try {
        const registrazioni = await caricaRegistrazioniBambini();
        const countText = registrazioni.length
            ? `${registrazioni.length} registrazion${registrazioni.length === 1 ? 'e' : 'i'} in attesa`
            : 'Nessuna registrazione in attesa';
        if (cardCount) cardCount.textContent = countText;
        if (modalCount) modalCount.textContent = String(registrazioni.length);

        if (!registrazioni.length) {
            container.innerHTML = '<p>Nessuna registrazione in attesa.</p>';
            const selectAll = document.getElementById('registrazioniSelectAll');
            if (selectAll) {
                selectAll.checked = false;
                selectAll.disabled = true;
            }
            return;
        }

        container.innerHTML = registrazioni.map(r => {
            const nome = `${r.cognome || ''} ${r.nome || ''}`.trim();
            const allergie = r.allergie
                ? `Sì - ${r.allergie_dettagli || 'dettagli non specificati'}`
                : 'No';
            const problemi = r.problemi || 'Nessuna indicazione';
            return `<article data-registration-id="${r.id}">
                <label class="registrazioni-bambini-check" aria-label="Seleziona ${escapeAppelloHtml(nome)}">
                    <input type="checkbox" class="registrazione-checkbox" value="${r.id}">
                </label>
                <div class="registrazioni-bambini-info">
                    <strong>${escapeAppelloHtml(nome)}</strong>
                    <span>Classe ${escapeAppelloHtml(r.classe || '-')} · Nuoto: ${r.sa_nuotare ? 'Sì' : 'No'}</span>
                    <span>Allergie: ${escapeAppelloHtml(allergie)}</span>
                    <span>Problemi: ${escapeAppelloHtml(problemi)}</span>
                </div>
                <div class="registrazioni-bambini-row-actions">
                    <button type="button" class="reject-registration" onclick="rifiutaRegistrazioneBambino(${r.id})">Rifiuta</button>
                    <button type="button" onclick="approvaRegistrazioneBambino(${r.id})">Approva</button>
                </div>
            </article>`;
        }).join('');

        const selectAll = document.getElementById('registrazioniSelectAll');
        if (selectAll) {
            selectAll.disabled = false;
            selectAll.checked = false;
            selectAll.onchange = () => {
                container.querySelectorAll('.registrazione-checkbox').forEach(check => {
                    check.checked = selectAll.checked;
                });
                aggiornaSelezioneRegistrazioni();
            };
        }

        container.querySelectorAll('.registrazione-checkbox').forEach(check => {
            check.addEventListener('change', aggiornaSelezioneRegistrazioni);
        });
    } catch (error) {
        console.error('Errore elenco registrazioni:', error);
        container.innerHTML = '<p>Impossibile caricare le registrazioni.</p>';
        if (cardCount) cardCount.textContent = 'Registrazioni non disponibili';
        if (modalCount) modalCount.textContent = '0';
    }
}

function aggiornaSelezioneRegistrazioni() {
    const container = document.getElementById('registrazioniBambiniList');
    if (!container) return;
    container.querySelectorAll('article[data-registration-id]').forEach(article => {
        const selected = article.querySelector('.registrazione-checkbox')?.checked;
        article.classList.toggle('is-selected', Boolean(selected));
    });
}

function apriRegistrazioniBambiniModal() {
    const modal = document.getElementById('registrazioniBambiniModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    aggiornaElencoRegistrazioniBambini();
}

function chiudiRegistrazioniBambiniModal() {
    const modal = document.getElementById('registrazioniBambiniModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
}

function getSelectedRegistrationIds() {
    return [...document.querySelectorAll('.registrazione-checkbox:checked')]
        .map(check => Number(check.value))
        .filter(Boolean);
}

async function approvaRegistrazioneBambino(id) {
    await approvaRegistrazioniBambiniByIds([id]);
}

async function rifiutaRegistrazioneBambino(id) {
    await rifiutaRegistrazioniBambiniByIds([id]);
}

async function approvaRegistrazioniSelezionate() {
    const ids = getSelectedRegistrationIds();
    if (!ids.length) {
        mostraNotifica('Seleziona almeno una registrazione.', 'error');
        return;
    }
    await approvaRegistrazioniBambiniByIds(ids);
}

async function rifiutaRegistrazioniSelezionate() {
    const ids = getSelectedRegistrationIds();
    if (!ids.length) {
        mostraNotifica('Seleziona almeno una registrazione.', 'error');
        return;
    }
    await rifiutaRegistrazioniBambiniByIds(ids);
}

async function approvaTutteRegistrazioniBambini() {
    if (!sb) return;
    const registrazioni = await caricaRegistrazioniBambini();
    if (!registrazioni.length) {
        mostraNotifica('Nessuna registrazione da approvare.', 'error');
        return;
    }
    await approvaRegistrazioniBambiniByIds(registrazioni.map(r => r.id));
}

async function approvaRegistrazioniBambiniByIds(ids) {
    if (!sb || !ids.length) return;

    try {
        const registrazioni = await caricaRegistrazioniBambini();
        const selezionate = registrazioni.filter(r => ids.includes(Number(r.id)));
        if (!selezionate.length) {
            mostraNotifica('Le registrazioni selezionate non sono più disponibili.', 'error');
            return;
        }

        const { data: esistenti, error: errorEsistenti } = await sb
            .from('bambini')
            .select('nome, cognome');
        if (errorEsistenti) throw errorEsistenti;

        const presenti = new Set((esistenti || []).map(b =>
            `${b.nome || ''} ${b.cognome || ''}`.trim().toLowerCase()
        ));

        let approvate = 0;
        for (const registrazione of selezionate) {
            const nome = String(registrazione.nome || '').trim();
            const cognome = String(registrazione.cognome || '').trim();
            const chiave = `${nome} ${cognome}`.trim().toLowerCase();

            if (!nome || !cognome) {
                await sb.from('iscrizioni_grest').update({ stato: 'errore' }).eq('id', registrazione.id);
                continue;
            }
            if (presenti.has(chiave)) {
                await sb.from('iscrizioni_grest').update({ stato: 'ignorata_duplicata' }).eq('id', registrazione.id);
                continue;
            }

            const { data: inserito, error: errorBambino } = await sb
                .from('bambini')
                .insert({
                    nome,
                    cognome,
                    classe: registrazione.classe,
                    squadra: null,
                    settimana: null
                })
                .select('id_bambini')
                .single();
            if (errorBambino) throw errorBambino;

            const { error: errorStato } = await sb
                .from('status_bimbi')
                .upsert({
                    id_bambino: inserito.id_bambini,
                    stellina: 'no',
                    nuoto: registrazione.sa_nuotare ? 'si' : 'no',
                    problematica: registrazione.problemi || null,
                    istruzioni: null
                }, { onConflict: 'id_bambino' });
            if (errorStato) throw errorStato;

            await sb.from('iscrizioni_grest').update({ stato: 'importata' }).eq('id', registrazione.id);
            presenti.add(chiave);
            approvate++;
        }

        if (typeof resetCacheBambiniGrest === 'function') resetCacheBambiniGrest();
        mostraNotifica(`${approvate} registrazion${approvate === 1 ? 'e approvata' : 'i approvate'}.`, 'success');
        await aggiornaElencoRegistrazioniBambini();
    } catch (error) {
        console.error('Errore approvazione registrazioni:', error);
        mostraNotifica('Impossibile approvare le registrazioni selezionate.', 'error');
    }
}

async function rifiutaRegistrazioniBambiniByIds(ids) {
    if (!sb || !ids.length) return;

    try {
        for (const id of ids) {
            const { error } = await sb
                .from('iscrizioni_grest')
                .update({ stato: 'rifiutata' })
                .eq('id', id);
            if (error) throw error;
        }
        mostraNotifica(`${ids.length} registrazion${ids.length === 1 ? 'e rifiutata' : 'i rifiutate'}.`, 'success');
        await aggiornaElencoRegistrazioniBambini();
    } catch (error) {
        console.error('Errore rifiuto registrazioni:', error);
        mostraNotifica('Impossibile rifiutare le registrazioni selezionate.', 'error');
    }
}

async function rifiutaTutteRegistrazioniBambini() {
    if (!sb) return;
    const registrazioni = await caricaRegistrazioniBambini();
    if (!registrazioni.length) {
        mostraNotifica('Nessuna registrazione da rifiutare.', 'error');
        return;
    }
    await rifiutaRegistrazioniBambiniByIds(registrazioni.map(r => r.id));
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('childRegistrationForm');
    if (!form) return;

    form.addEventListener('submit', registraNuovoBambino);

    const cancelButton = document.getElementById('cancelChildRegistration');
    if (cancelButton) {
        cancelButton.addEventListener('click', () => {
            form.reset();
            const detailsLabel = document.getElementById('childAllergyDetailsLabel');
            const detailsInput = document.getElementById('childAllergyDetails');
            if (detailsLabel) detailsLabel.hidden = true;
            if (detailsInput) detailsInput.required = false;

            let hasPreviousPage = false;
            try {
                hasPreviousPage = Boolean(document.referrer) &&
                    new URL(document.referrer).pathname !== location.pathname;
            } catch (error) {
                hasPreviousPage = false;
            }

            if (hasPreviousPage) {
                history.back();
            } else {
                location.href = 'iscrizione_grest.html';
            }
        });
    }

    document.querySelectorAll('input[name="childAllergies"]').forEach(radio => {
        radio.addEventListener('change', event => {
            const haAllergie = event.target.value === 'true';
            const detailsLabel = document.getElementById('childAllergyDetailsLabel');
            const detailsInput = document.getElementById('childAllergyDetails');
            detailsLabel.hidden = !haAllergie;
            detailsInput.required = haAllergie;
            if (!haAllergie) detailsInput.value = '';
        });
    });

    form.addEventListener('reset', () => {
        setTimeout(() => {
            document.getElementById('childAllergyDetailsLabel').hidden = true;
            document.getElementById('childAllergyDetails').required = false;
        }, 0);
    });
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
        const stellina = m.tipo === 'bambino' && m.stellina
            ? ` <button type="button" class="appello-stellina appello-stellina-button" data-child-health-id="${m.id_bambino}" aria-label="Visualizza le informazioni importanti di ${escapeAppelloHtml(nomeCompleto)}">★</button>`
            : '';
        return `<li><span class="team-member-label">${escapeAppelloHtml(nomeCompleto)}${etichettaTu}${badge}</span>${stellina}</li>`;
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

//======================================
// SABATO ORATORIO
//======================================

let saborIncontroCorrente = null;
let saborAnimatoriDisponibili = [];
let saborIncontriAdmin = [];
let saborIncontroInModificaId = null;
let saborCampiModificati = new Set();
let saborRealtimeChannel = null;
let saborPollingTimer = null;
let saborSyncInCorso = false;
let saborSalvataggioInCorso = false;
let saborAutoSaveTimer = null;
let saborSchemaMerendaDisponibile = false;
const SABOR_POLLING_MS = 500;
const SABOR_AUTOSAVE_DELAY_MS = 700;
const SABOR_COLONNE_MERENDA = [
    'numero_bambini', 'bambini_classe_1', 'bambini_classe_2', 'bambini_classe_3',
    'bambini_classe_4', 'bambini_classe_5', 'numero_celiaci', 'numero_intolleranti',
    'intolleranze', 'problematiche_merenda', 'merende'
];

function impostaDisponibilitaCampiMerenda(disponibili) {
    saborSchemaMerendaDisponibile = disponibili;
    document.querySelectorAll('.sabor-merenda-panel [data-sabor-field]').forEach(input => {
        input.disabled = !disponibili;
    });
    const stato = document.getElementById('saborMerendaStato');
    if (stato && !disponibili) {
        stato.textContent = 'Database non aggiornato: esegui db_migration_merenda_sabor.sql nel SQL Editor di Supabase.';
    }
}

function valoreCampoSabor(nomeCampo) {
    if (nomeCampo === 'merende') {
        return [...document.querySelectorAll('input[name="saborMerenda"]:checked')].map(input => input.value);
    }
    const input = document.querySelector(`[data-sabor-field="${nomeCampo}"]`);
    if (!input) return null;
    if (input.type === 'number') return Number(input.value);
    return input.value.trim() || null;
}

function marcaCampoSaborModificato(input) {
    const nomeCampo = input?.dataset.saborField;
    if (!nomeCampo) return;
    saborCampiModificati.add(nomeCampo);
    if (nomeCampo.startsWith('bambini_classe_')) aggiornaTotaleBambiniSabor();
    const stato = document.getElementById('saborMerendaStato');
    if (stato) stato.textContent = 'Salvataggio...';
    programmaSalvataggioSabor();
}

function programmaSalvataggioSabor() {
    if (saborAutoSaveTimer) clearTimeout(saborAutoSaveTimer);
    saborAutoSaveTimer = setTimeout(() => {
        saborAutoSaveTimer = null;
        salvaSaborMerenda();
    }, SABOR_AUTOSAVE_DELAY_MS);
}

function parseResponsabiliAnimatoriSabor(incontro) {
    if (!incontro) return [];
    const raw = incontro.responsabili_animatori ?? incontro.id_animatore_responsabile;
    if (Array.isArray(raw)) return raw.filter(value => value !== null && value !== undefined && value !== '').map(Number).filter(Number.isFinite);
    if (raw === null || raw === undefined || raw === '') return [];
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed.filter(value => value !== null && value !== undefined && value !== '').map(Number).filter(Number.isFinite);
            }
        } catch (error) {
            return raw.split(',').map(v => Number(v.trim())).filter(Number.isFinite);
        }
    }
    return [Number(raw)].filter(Number.isFinite);
}

function getNomiResponsabiliSabor(incontro) {
    const ids = parseResponsabiliAnimatoriSabor(incontro);
    if (!ids.length) {
        return incontro?.tipo_responsabile === 'animatore' ? 'Animatore' : (incontro?.nome_responsabile || '—');
    }

    const nomi = ids
        .map(id => {
            const animatore = saborAnimatoriDisponibili.find(item => Number(item.id_animatore) === Number(id));
            return animatore ? `${animatore.cognome} ${animatore.nome}` : `Animatore ${id}`;
        })
        .filter(Boolean);

    return nomi.length ? nomi.join(' + ') : 'Animatore';
}

function creaResponsabileItemSabor(value = '') {
    const container = document.getElementById('saborResponsabileAnimatoriList');
    if (!container) return null;

    const item = document.createElement('div');
    item.className = 'sabor-responsabile-item';

    const select = document.createElement('select');
    select.className = 'sabor-responsabile-select';
    select.innerHTML = saborAnimatoriDisponibili
        .map(a => `<option value="${a.id_animatore}">${a.cognome} ${a.nome}</option>`)
        .join('');
    if (value) select.value = String(value);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'sabor-responsabile-remove';
    removeBtn.textContent = 'Rimuovi';
    removeBtn.addEventListener('click', () => {
        const totaleSelect = container.querySelectorAll('.sabor-responsabile-select').length;
        if (totaleSelect > 1) {
            item.remove();
        } else {
            select.value = '';
        }
    });

    item.appendChild(select);
    item.appendChild(removeBtn);
    return item;
}

function riempiResponsabiliSabor(values = []) {
    const container = document.getElementById('saborResponsabileAnimatoriList');
    if (!container) return;

    container.innerHTML = '';
    const listaValori = values.length ? values : [null];
    listaValori.forEach(value => {
        const item = creaResponsabileItemSabor(value ?? '');
        if (item) container.appendChild(item);
    });
}

async function caricaSaborAnimatori() {
    if (!sb) return;
    const { data, error } = await sb
        .from('animatori')
        .select('id_animatore, nome, cognome, sabato_oratorio')
        .eq('sabato_oratorio', 'si')
        .order('cognome', { ascending: true });

    if (error) {
        console.error('Errore caricamento animatori (sabor):', error);
        if (typeof mostraNotifica === 'function') mostraNotifica('Errore caricamento animatori.', 'error');
        return;
    }
    saborAnimatoriDisponibili = data || [];
    if (document.getElementById('saborResponsabileAnimatoriList')) {
        riempiResponsabiliSabor();
    }
}

// --- Incontro del sabato ---

async function caricaSaborIncontriAdmin() {
    const tbody = document.getElementById('saborIncontriAdminBody');
    if (!tbody || !sb) return;
    const { data, error } = await sb.from('sabor_incontri').select('*').order('data', { ascending: false });
    if (error) {
        console.error('Errore caricamento incontri sabato:', error);
        if (typeof mostraNotifica === 'function') mostraNotifica('Errore caricamento attività.', 'error');
        return;
    }
    const incontri = data || [];
    saborIncontriAdmin = incontri;
    if (incontri.length === 0) {
        tbody.innerHTML = '<tr class="sabor-empty-row"><td colspan="4">Nessuna attività registrata.</td></tr>';
        return;
    }
    tbody.innerHTML = incontri.map(incontro => {
        const responsabile = incontro.tipo_responsabile === 'animatore'
            ? getNomiResponsabiliSabor(incontro)
            : (incontro.nome_responsabile || 'Catechista');
        const data = new Date(`${incontro.data}T00:00:00`).toLocaleDateString('it-IT');
        return `<tr class="sabor-row">
            <td>${escapeAppelloHtml(data)}</td>
            <td>${escapeAppelloHtml(incontro.titolo_attivita)}</td>
            <td>${escapeAppelloHtml(responsabile)}</td>
            <td class="sabor-admin-actions">
                <button type="button" class="sabor-btn-azione" data-sabor-action="edit-incontro" data-id="${incontro.id_incontro}">Modifica</button>
                <button type="button" class="sabor-btn-azione sabor-btn-delete" data-sabor-action="delete-incontro" data-id="${incontro.id_incontro}">Rimuovi</button>
            </td>
        </tr>`;
    }).join('');
}

function annullaModificaSaborIncontro() {
    saborIncontroInModificaId = null;
    document.getElementById('saborFormTitle').textContent = 'Nuovo incontro';
    document.getElementById('saborCreaIncontroBtn').textContent = 'Crea incontro';
    document.getElementById('saborAnnullaModificaBtn').hidden = true;
    document.getElementById('saborTitoloInput').value = '';
    document.getElementById('saborDescrizioneInput').value = '';
    document.getElementById('saborTipoResponsabile').value = 'animatore';
    document.getElementById('saborResponsabileAnimatoreRow').style.display = 'flex';
    document.getElementById('saborResponsabileNomeRow').style.display = 'none';
    document.getElementById('saborResponsabileNomeInput').value = '';
    riempiResponsabiliSabor();
}

function modificaSaborIncontro(idIncontro) {
    const incontro = saborIncontriAdmin.find(item => Number(item.id_incontro) === Number(idIncontro));
    if (!incontro) {
        if (typeof mostraNotifica === 'function') mostraNotifica('Impossibile trovare l\'attività da modificare.', 'error');
        return;
    }

    saborIncontroInModificaId = Number(incontro.id_incontro);
    document.getElementById('saborFormTitle').textContent = 'Modifica attività';
    document.getElementById('saborCreaIncontroBtn').textContent = 'Salva modifiche';
    document.getElementById('saborAnnullaModificaBtn').hidden = false;
    document.getElementById('saborDataInput').value = incontro.data;
    document.getElementById('saborTitoloInput').value = incontro.titolo_attivita || '';
    document.getElementById('saborDescrizioneInput').value = incontro.descrizione || '';

    const isAnimatore = incontro.tipo_responsabile === 'animatore';
    document.getElementById('saborTipoResponsabile').value = isAnimatore ? 'animatore' : 'catechista';
    document.getElementById('saborResponsabileAnimatoreRow').style.display = isAnimatore ? 'flex' : 'none';
    document.getElementById('saborResponsabileNomeRow').style.display = isAnimatore ? 'none' : 'flex';
    document.getElementById('saborResponsabileNomeInput').value = incontro.nome_responsabile || '';
    riempiResponsabiliSabor(isAnimatore ? parseResponsabiliAnimatoriSabor(incontro) : []);
    document.getElementById('saborFormTitle').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function eliminaSaborIncontro(idIncontro) {
    if (!sb || !confirm('Rimuovere questa attività e tutte le presenze collegate?')) return;
    const { error } = await sb.from('sabor_incontri').delete().eq('id_incontro', idIncontro);
    if (error) {
        console.error('Errore rimozione incontro sabato:', error);
        if (typeof mostraNotifica === 'function') mostraNotifica('Errore durante la rimozione.', 'error');
        return;
    }
    if (saborIncontroCorrente?.id_incontro === Number(idIncontro)) saborIncontroCorrente = null;
    if (saborIncontroInModificaId === Number(idIncontro)) annullaModificaSaborIncontro();
    if (typeof mostraNotifica === 'function') mostraNotifica('Attività rimossa.', 'success');
    await caricaSaborIncontriAdmin();
}

async function inizializzaAdminSabor() {
    const dataInput = document.getElementById('saborDataInput');
    if (!dataInput) return;
    dataInput.value = normalizzaDataSabato(formattaDataISO(new Date()));
    dataInput.addEventListener('change', () => {
        dataInput.value = normalizzaDataSabato(dataInput.value);
    });
    await caricaSaborAnimatori();
    await caricaSaborIncontriAdmin();
}

async function caricaSaborIncontro(dataISO) {
    if (!sb) return;
    const { data: incontro, error } = await sb.from('sabor_incontri').select('*').eq('data', dataISO).maybeSingle();

    if (error) {
        console.error('Errore caricamento incontro sabato:', error);
        if (typeof mostraNotifica === 'function') mostraNotifica('Errore caricamento incontro.', 'error');
        return;
    }

    saborIncontroCorrente = incontro || null;

    const dettagliEl = document.getElementById('saborIncontroDettagli');
    const noIncontroEl = document.getElementById('saborNessunIncontro');
    if (!dettagliEl) return;

    if (!saborIncontroCorrente) {
        impostaDisponibilitaCampiMerenda(false);
        dettagliEl.style.display = 'none';
        if (noIncontroEl) noIncontroEl.style.display = 'block';
        [1, 2, 3, 4, 5].forEach(classe => {
            document.getElementById(`saborBambiniClasse${classe}`).value = 0;
        });
        aggiornaTotaleBambiniSabor();
        document.getElementById('saborNumeroCeliaci').value = 0;
        document.getElementById('saborNumeroIntolleranti').value = 0;
        document.getElementById('saborIntolleranze').value = '';
        document.getElementById('saborProblematicheMerenda').value = '';
        document.querySelectorAll('input[name="saborMerenda"]').forEach(input => { input.checked = false; });
        return;
    }

    const schemaMerendaDisponibile = SABOR_COLONNE_MERENDA.every(nomeCampo =>
        Object.hasOwn(saborIncontroCorrente, nomeCampo)
    );
    impostaDisponibilitaCampiMerenda(schemaMerendaDisponibile);
    if (noIncontroEl) noIncontroEl.style.display = 'none';
    dettagliEl.style.display = 'grid';

    document.getElementById('saborIncontroTitolo').textContent = saborIncontroCorrente.titolo_attivita;
    document.getElementById('saborIncontroDescrizione').textContent = saborIncontroCorrente.descrizione || '';

    let nomeResponsabile = saborIncontroCorrente.nome_responsabile || '—';
    if (saborIncontroCorrente.tipo_responsabile === 'animatore') {
        const responsabili = getNomiResponsabiliSabor(saborIncontroCorrente);
        nomeResponsabile = responsabili === 'Animatore' ? 'Animatore' : `${responsabili} (animatori)`;
    } else if (saborIncontroCorrente.tipo_responsabile === 'catechista') {
        nomeResponsabile = `${nomeResponsabile} (catechista)`;
    }
    document.getElementById('saborIncontroResponsabile').textContent = nomeResponsabile;
    const conteggiClassi = [1, 2, 3, 4, 5].map(classe => {
        const nomeCampo = `bambini_classe_${classe}`;
        const input = document.getElementById(`saborBambiniClasse${classe}`);
        if (!saborCampiModificati.has(nomeCampo)) {
            input.value = saborIncontroCorrente[nomeCampo] ?? 0;
        }
        return Number(input.value || 0);
    });
    aggiornaTotaleBambiniSabor(conteggiClassi);
    ['numero_celiaci', 'numero_intolleranti', 'intolleranze', 'problematiche_merenda'].forEach(nomeCampo => {
        if (!saborCampiModificati.has(nomeCampo)) {
            const input = document.querySelector(`[data-sabor-field="${nomeCampo}"]`);
            input.value = saborIncontroCorrente[nomeCampo] ?? '';
        }
    });
    if (!saborCampiModificati.has('merende')) {
        const merendeSelezionate = new Set(saborIncontroCorrente.merende || []);
        document.querySelectorAll('input[name="saborMerenda"]').forEach(input => {
            input.checked = merendeSelezionate.has(input.value);
        });
    }
    if (saborSchemaMerendaDisponibile && saborCampiModificati.size === 0) {
        document.getElementById('saborMerendaStato').textContent = '';
    }
}

async function sincronizzaSaborIncontro() {
    const dataInput = document.getElementById('saborDataInput');
    if (!dataInput || !sb || saborSyncInCorso) return;
    saborSyncInCorso = true;
    try {
        await caricaSaborIncontro(dataInput.value);
    } finally {
        saborSyncInCorso = false;
    }
}

function avviaSincronizzazioneSabor() {
    if (!sb || !document.getElementById('saborIncontroDettagli')) return;
    if (saborPollingTimer) clearInterval(saborPollingTimer);
    saborPollingTimer = setInterval(sincronizzaSaborIncontro, SABOR_POLLING_MS);

    try {
        if (saborRealtimeChannel && typeof sb.removeChannel === 'function') {
            sb.removeChannel(saborRealtimeChannel);
        }
        saborRealtimeChannel = sb
            .channel('sabor-incontri-realtime')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'sabor_incontri' },
                sincronizzaSaborIncontro
            )
            .subscribe(status => console.log('Realtime incontri sabato:', status));
    } catch (error) {
        console.warn('Realtime sabato non disponibile; resta attivo il polling.', error);
    }
}

function aggiornaTotaleBambiniSabor(conteggi = null) {
    const valori = conteggi || [1, 2, 3, 4, 5].map(classe =>
        Number(document.getElementById(`saborBambiniClasse${classe}`)?.value || 0)
    );
    const totale = valori.reduce((somma, valore) => somma + valore, 0);
    const totaleElement = document.getElementById('saborTotaleBambini');
    if (totaleElement) totaleElement.textContent = Number.isFinite(totale) ? totale : '0';
    return totale;
}

async function salvaSaborMerenda() {
    const messaggio = document.getElementById('saborMerendaStato');
    if (!sb || !saborIncontroCorrente || saborSalvataggioInCorso) return;
    if (!saborSchemaMerendaDisponibile) {
        impostaDisponibilitaCampiMerenda(false);
        return;
    }

    const campiDaSalvare = new Set(saborCampiModificati);
    if (campiDaSalvare.size === 0) {
        messaggio.textContent = 'Nessuna modifica da salvare.';
        return;
    }

    const conteggiClassi = [1, 2, 3, 4, 5].map(classe =>
        Number(document.getElementById(`saborBambiniClasse${classe}`).value)
    );
    const numeroBambini = conteggiClassi.reduce((somma, valore) => somma + valore, 0);
    const numeroCeliaci = Number(document.getElementById('saborNumeroCeliaci').value);
    const numeroIntolleranti = Number(document.getElementById('saborNumeroIntolleranti').value);
    if (![...conteggiClassi, numeroCeliaci, numeroIntolleranti].every(value => Number.isInteger(value) && value >= 0) ||
        numeroCeliaci > numeroBambini || numeroIntolleranti > numeroBambini) {
        messaggio.textContent = 'Controlla i conteggi: nessun valore può superare il numero di bambini.';
        return;
    }

    const valoriInviati = Object.fromEntries([...campiDaSalvare].map(nomeCampo => [nomeCampo, valoreCampoSabor(nomeCampo)]));
    const payload = { ...valoriInviati };

    saborSalvataggioInCorso = true;
    let salvataggioRiuscito = false;
    messaggio.textContent = 'Salvataggio...';
    try {
        const { error } = await sb.from('sabor_incontri').update(payload).eq('id_incontro', saborIncontroCorrente.id_incontro);
        if (error) {
            console.error('Errore salvataggio dati merenda:', error);
            const schemaDaAggiornare = error.code === 'PGRST204' &&
                SABOR_COLONNE_MERENDA.some(nomeCampo => (error.message || '').includes(nomeCampo));
            messaggio.textContent = schemaDaAggiornare
                ? 'Database non aggiornato: esegui db_migration_merenda_sabor.sql nel SQL Editor di Supabase.'
                : 'Salvataggio non riuscito. Controlla la connessione e riprova.';
            return;
        }
        salvataggioRiuscito = true;
        for (const [nomeCampo, valoreInviato] of Object.entries(valoriInviati)) {
            if (JSON.stringify(valoreCampoSabor(nomeCampo)) === JSON.stringify(valoreInviato)) {
                saborCampiModificati.delete(nomeCampo);
            }
        }
        await sincronizzaSaborIncontro();
        messaggio.textContent = saborCampiModificati.size ? 'Salvataggio...' : 'Salvato.';
    } catch (error) {
        console.error('Errore di rete durante il salvataggio dei dati merenda:', error);
        messaggio.textContent = 'Salvataggio non riuscito. Controlla la connessione e riprova.';
    } finally {
        saborSalvataggioInCorso = false;
        if (salvataggioRiuscito && saborCampiModificati.size) programmaSalvataggioSabor();
    }
}

async function creaSaborIncontro() {
    if (!sb) return;
    const dataInput = document.getElementById('saborDataInput');
    dataInput.value = normalizzaDataSabato(dataInput.value);
    const titolo = document.getElementById('saborTitoloInput').value.trim();
    const descrizione = document.getElementById('saborDescrizioneInput').value.trim();
    const tipoResponsabile = document.getElementById('saborTipoResponsabile').value;

    if (!titolo) {
        if (typeof mostraNotifica === 'function') mostraNotifica('Inserisci il nome dell\'attività.', 'error');
        return;
    }

    const payload = {
        data: dataInput.value,
        titolo_attivita: titolo,
        descrizione: descrizione || null,
        tipo_responsabile: tipoResponsabile,
        id_animatore_responsabile: null,
        responsabili_animatori: [],
        nome_responsabile: null
    };

    if (tipoResponsabile === 'animatore') {
        const responsabili = Array.from(document.querySelectorAll('.sabor-responsabile-select'))
            .map(select => Number(select.value))
            .filter(value => Number.isFinite(value) && value > 0);

        if (responsabili.length === 0) {
            if (typeof mostraNotifica === 'function') mostraNotifica('Seleziona almeno un animatore responsabile.', 'error');
            return;
        }

        payload.id_animatore_responsabile = responsabili[0];
        payload.responsabili_animatori = responsabili;
    } else {
        const nome = document.getElementById('saborResponsabileNomeInput').value.trim();
        if (!nome) {
            if (typeof mostraNotifica === 'function') mostraNotifica('Inserisci il nome del catechista.', 'error');
            return;
        }
        payload.nome_responsabile = nome;
    }

    const query = saborIncontroInModificaId
        ? sb.from('sabor_incontri').update(payload).eq('id_incontro', saborIncontroInModificaId)
        : sb.from('sabor_incontri').insert(payload);
    const { error } = await query;
    if (error) {
        console.error('Errore salvataggio incontro sabato:', error);
        const messaggio = error.code === '23505'
            ? 'Esiste già un’attività registrata per questo sabato.'
            : saborIncontroInModificaId ? 'Errore durante la modifica.' : 'Errore durante la creazione.';
        if (typeof mostraNotifica === 'function') mostraNotifica(messaggio, 'error');
        return;
    }

    const inModifica = Boolean(saborIncontroInModificaId);
    if (typeof mostraNotifica === 'function') {
        mostraNotifica(inModifica ? 'Attività modificata.' : 'Incontro creato.', 'success');
    }
    annullaModificaSaborIncontro();
    await Promise.all([caricaSaborIncontriAdmin(), caricaSaborIncontro(dataInput.value)]);
}

// --- Eventi e init ---

document.addEventListener('change', (e) => {
    if (e.target.matches('[data-child-flag-toggle]')) {
        const row = e.target.closest('.child-flag-row');
        row.classList.toggle('is-marked', e.target.checked);
        row.querySelector('[data-child-flag-problem]').disabled = !e.target.checked;
        row.querySelector('[data-child-flag-instructions]').disabled = !e.target.checked;
    }
    if (e.target.id === 'saborTipoResponsabile') {
        const isAnimatore = e.target.value === 'animatore';
        document.getElementById('saborResponsabileAnimatoreRow').style.display = isAnimatore ? 'flex' : 'none';
        document.getElementById('saborResponsabileNomeRow').style.display = isAnimatore ? 'none' : 'flex';
        if (isAnimatore && !document.querySelector('.sabor-responsabile-select')) {
            riempiResponsabiliSabor();
        }
    }
    if (e.target.matches('[data-sabor-field][type="checkbox"]')) marcaCampoSaborModificato(e.target);
});

document.addEventListener('input', (e) => {
    if (e.target.matches('[data-sabor-field]') && e.target.type !== 'checkbox') {
        marcaCampoSaborModificato(e.target);
    }
});

document.addEventListener('click', (e) => {
    if (e.target.id === 'manageChildFlagsBtn') apriGestioneStelline();
    if (e.target.id === 'saveChildFlagsBtn') salvaGestioneStelline();
    if (e.target.id === 'closeChildFlagsBtn' || e.target.id === 'cancelChildFlagsBtn') chiudiGestioneStelline();
    const healthInfoButton = e.target.closest('[data-child-health-id]');
    if (healthInfoButton) apriDettagliSaluteBambino(healthInfoButton.dataset.childHealthId);
    if (e.target.id === 'closeChildHealthBtn' || e.target.id === 'closeChildHealthDetailsBtn') {
        chiudiDettagliSaluteBambino();
    }
    if (e.target.id === 'saborCreaIncontroBtn') creaSaborIncontro();
    if (e.target.id === 'saborAnnullaModificaBtn') annullaModificaSaborIncontro();
    if (e.target.id === 'saborAdminAvvisoBtn') salvaAvvisoAdminSabor();
    if (e.target.id === 'saborAddResponsabileBtn') {
        const container = document.getElementById('saborResponsabileAnimatoriList');
        if (container) {
            const item = creaResponsabileItemSabor();
            if (item) container.appendChild(item);
        }
    }
    const actionButton = e.target.closest('[data-sabor-action]');
    if (actionButton?.dataset.saborAction === 'edit-incontro') modificaSaborIncontro(actionButton.dataset.id);
    if (actionButton?.dataset.saborAction === 'delete-incontro') eliminaSaborIncontro(actionButton.dataset.id);
    const deleteNoticeButton = e.target.closest('[data-sabor-avviso-delete]');
    if (deleteNoticeButton) eliminaAvvisoAdminSabor(deleteNoticeButton.dataset.saborAvvisoDelete);
});

document.addEventListener('DOMContentLoaded', async () => {
    const dataInput = document.getElementById('saborDataInput');
    if (!dataInput) return; // non siamo sulla pagina sabato_oratorio

    if (document.getElementById('saborIncontriAdminBody')) return;
    dataInput.value = normalizzaDataSabato(formattaDataISO(new Date()));
    dataInput.addEventListener('change', async () => {
        dataInput.value = normalizzaDataSabato(dataInput.value);
        if (saborCampiModificati.size && !confirm('Ci sono modifiche non salvate. Cambiare data e scartarle?')) {
            dataInput.value = saborIncontroCorrente?.data || normalizzaDataSabato(formattaDataISO(new Date()));
            return;
        }
        if (saborAutoSaveTimer) clearTimeout(saborAutoSaveTimer);
        saborAutoSaveTimer = null;
        saborCampiModificati.clear();
        await sincronizzaSaborIncontro();
    });

    await caricaSaborAnimatori();
    if (document.getElementById('saborResponsabileAnimatoriList')) {
        riempiResponsabiliSabor();
    }
    await caricaSaborIncontro(dataInput.value);
    avviaSincronizzazioneSabor();
});