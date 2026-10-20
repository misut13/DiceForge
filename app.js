import { parseFormula, rollFormula, normalizeProfiles, mergeProfiles, moveItem } from './model.js?v=dev';

const STANDARD_DICE = [3, 4, 6, 8, 10, 12, 20, 100];
const SOUNDS = {
    single: [1, 2, 3, 4, 5].map(n => `sounds/dice${n}.m4a`),
    multi: [1, 2, 3, 4, 5, 6].map(n => `sounds/multidice${n}.m4a`)
};
const ANIMATION_MS = 2000;
const TOAST_MS = 6000;

// One form per item list of a profile
const FORMS = {
    attackFunctions: { id: 'attackForm', title: 'Angriffsfunktion', add: 'Neue Funktion hinzufügen', edit: 'Funktion bearbeiten' },
    diceFunctions: { id: 'diceForm', title: 'Würfelfunktion', add: 'Neue Funktion hinzufügen', edit: 'Funktion bearbeiten' },
    simpleDices: { id: 'simpleForm', title: 'Einfacher Würfel', add: 'Neuen Würfel hinzufügen', edit: 'Würfel bearbeiten' }
};

const $ = id => document.getElementById(id);

let profiles = [];
let settings = { animationEnabled: true, soundEnabled: true, quickRollEnabled: false };
let mode = null; // null | 'edit' | 'delete'
let drag = null; // entry being dragged by its handle in edit mode
let lastRoll = null;
let animationBlob = null;
let animationUrl = null;
let animationTimer = null;
let toastTimer = null;

// ---------- Storage ----------

function load(key, fallback) {
    try {
        return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
        return fallback;
    }
}

function saveProfiles() {
    try {
        localStorage.setItem('profiles', JSON.stringify(profiles));
    } catch {
        showToast('Speichern fehlgeschlagen. Bitte Profile exportieren.');
    }
}

function saveSettings() {
    try {
        localStorage.setItem('appSettings', JSON.stringify(settings));
    } catch {
        // Setting just isn't persisted
    }
}

// ---------- Navigation ----------
// Every screen and the result popup are history entries, so the browser and
// Android back button behave like the in-app back button.
// State: { view: 'list' | 'create' | 'profile' | 'form', profileId, form, index, result, depth }
// 'create' with a profileId renames that profile.

function navigate(state, replace = false) {
    const next = { ...state, depth: (history.state?.depth ?? 0) + (replace ? 0 : 1) };
    if (replace) {
        history.replaceState(next, '');
    } else {
        history.pushState(next, '');
    }
    render(next);
}

function goBack() {
    if (history.state?.depth > 0) {
        history.back();
    } else {
        navigate({ view: 'list' }, true);
    }
}

function currentProfile() {
    return profiles.find(p => p.id === history.state?.profileId);
}

function render(state) {
    const profile = profiles.find(p => p.id === state.profileId);
    if (state.profileId ? !profile : state.view === 'profile' || state.view === 'form') {
        navigate({ view: 'list' }, true);
        return;
    }

    setMode(null);
    $('settingsDialog').close();

    switch (state.view) {
        case 'create':
            showProfileForm(profile);
            break;
        case 'profile':
            showScreen('profileScreen', profile.name);
            renderProfile(profile);
            break;
        case 'form':
            showForm(profile, state.form, state.index);
            break;
        default:
            showScreen('profileListScreen', 'DiceForge');
            renderProfileList();
    }

    const dialog = $('resultDialog');
    if (state.view === 'profile' && state.result && lastRoll) {
        renderResult();
        if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
        dialog.close();
    }
}

function showScreen(id, title, subtitle = '') {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.hidden = screen.id !== id;
    });
    const isProfile = id === 'profileScreen';
    $('header').classList.toggle('header--profile', isProfile);
    $('backBtn').hidden = id === 'profileListScreen';
    $('settingsBtn').hidden = !isProfile;
    $('headerTitle').textContent = title;
    $('headerTitle').classList.toggle('long', title.length > 14);
    $('headerSubtitle').textContent = subtitle;
    updateQuickRoll();
}

function updateQuickRoll() {
    $('quickRollForm').hidden = !(settings.quickRollEnabled && !$('profileScreen').hidden);
}

// ---------- Rendering ----------

function el(tag, className, ...children) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.append(...children);
    return node;
}

function nameSizeClass(name) {
    const length = name.trim().length;
    return length > 19 ? 'item-name item-name--small' : length > 15 ? 'item-name item-name--medium' : 'item-name';
}

function renderProfileList() {
    $('emptyState').hidden = profiles.length > 0;
    $('profileList').replaceChildren(...profiles.map(profile => {
        const functionCount = profile.attackFunctions.length + profile.diceFunctions.length;
        const open = el('button', 'profile-open',
            el('span', 'profile-name', profile.name),
            el('span', 'profile-stats',
                el('span', '', `📜 ${functionCount} Funktionen`),
                el('span', '', `🎲 ${profile.simpleDices.length} Würfel`)));
        open.dataset.open = profile.id;
        const remove = el('button', 'profile-delete', '×');
        remove.dataset.delete = profile.id;
        remove.setAttribute('aria-label', `Profil ${profile.name} löschen`);
        return el('div', 'frame-card profile-card', open, remove);
    }));
}

function itemCard(list, index, className, ...children) {
    // The handle is only shown in edit mode, see startDrag()
    const handle = el('span', 'drag-handle');
    handle.setAttribute('aria-hidden', 'true');
    const card = el('button', `frame-card ${className}`, ...children, handle);
    card.dataset.list = list;
    card.dataset.index = index;
    return card;
}

function renderProfile(profile) {
    const functions = [
        ...profile.attackFunctions.map((f, i) => itemCard('attackFunctions', i, 'function-card',
            el('span', nameSizeClass(f.name), f.name),
            // Parts wrap onto a second line on narrow cards; CSS then clips the separator
            el('span', 'formula formula--attack', el('span', 'formula-parts',
                el('span', 'formula-part', `A: ${f.attack}`),
                el('span', 'formula-part', `S: ${f.damage}`))))),
        ...profile.diceFunctions.map((f, i) => itemCard('diceFunctions', i, 'function-card',
            el('span', nameSizeClass(f.name), f.name),
            el('span', 'formula', f.formula)))
    ];
    const dice = profile.simpleDices.map((d, i) => itemCard('simpleDices', i, 'dice-card', `W${d.sides}`));

    $('functionList').replaceChildren(...(functions.length ? functions : [el('p', 'empty-hint', 'Es sind keine Funktionen definiert')]));
    $('simpleDiceList').replaceChildren(...(dice.length ? dice : [el('p', 'empty-hint', 'Keine einfachen Würfel hinzugefügt')]));
}

function renderResult() {
    $('resultText').replaceChildren(
        el('div', 'roll-name', lastRoll.name),
        el('div', 'roll-results', ...lastRoll.lines.map(line => {
            const row = el('div', 'roll-result');
            if (line.label) row.append(el('div', 'roll-label', line.label));
            row.append(el('div', 'roll-total', String(line.total)), el('div', 'roll-detail', line.detail));
            if (line.natural === 20) row.append(el('div', 'natural natural--20', 'Natürliche 20!'));
            if (line.natural === 1) row.append(el('div', 'natural natural--1', 'Natürliche 1'));
            return row;
        }))
    );
}

// ---------- Profiles ----------

function showProfileForm(profile) {
    showScreen('createProfileScreen', profile ? 'Profil umbenennen' : 'Neues Profil', profile ? '' : 'Charakterprofil erstellen');
    const form = $('createProfileScreen');
    form.reset();
    form.querySelector('h2').textContent = profile ? 'Profil umbenennen' : 'Neues Profil erstellen';
    form.querySelector('[type=submit]').textContent = profile ? 'Speichern' : 'Profil erstellen';
    form.elements.namedItem('name').value = profile?.name ?? '';
}

function saveProfile(event) {
    event.preventDefault();
    const name = event.target.elements.namedItem('name').value.trim();
    const profile = currentProfile();
    if (profile) {
        profile.name = name;
        saveProfiles();
        goBack();
        return;
    }
    profiles.push({
        id: crypto.randomUUID(),
        name,
        attackFunctions: [],
        diceFunctions: [],
        simpleDices: STANDARD_DICE.map(sides => ({ sides }))
    });
    saveProfiles();
    goBack();
}

function openProfile(id) {
    lastRoll = null;
    $('quickRollForm').reset();
    navigate({ view: 'profile', profileId: id });
}

function removeWithUndo(list, index, message) {
    const [item] = list.splice(index, 1);
    saveProfiles();
    render(history.state);
    showToast(message, () => {
        list.splice(index, 0, item);
        saveProfiles();
        render(history.state);
    });
}

function exportProfiles() {
    const data = JSON.stringify({ app: 'DiceForge', version: 1, profiles }, null, 2);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    link.download = `diceforge-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function importProfiles(file) {
    let imported = null;
    try {
        imported = normalizeProfiles(JSON.parse(await file.text()));
    } catch {
        // Handled below
    }
    if (!imported) {
        showToast('Datei konnte nicht gelesen werden.');
        return;
    }
    profiles = mergeProfiles(profiles, imported);
    saveProfiles();
    render(history.state);
    showToast(`${imported.length} Profil(e) importiert.`);
}

// ---------- Items (functions and simple dice) ----------

function onItemClick(list, index) {
    const profile = currentProfile();
    const item = profile[list][index];
    if (mode === 'delete') {
        removeWithUndo(profile[list], index, `"${item.name ?? `W${item.sides}`}" gelöscht`);
    } else if (mode === 'edit') {
        navigate({ view: 'form', profileId: profile.id, form: list, index });
    } else {
        roll(item, list);
    }
}

function showForm(profile, list, index) {
    const config = FORMS[list];
    const item = index != null ? profile[list][index] : null;
    showScreen(config.id, config.title, item ? config.edit : config.add);

    const form = $(config.id);
    form.reset();
    form.querySelectorAll('[data-formula]').forEach(input => input.setCustomValidity(''));
    form.querySelector('[type=submit]').textContent = item ? 'Speichern' : 'Hinzufügen';

    if (list === 'simpleDices') {
        const sides = item?.sides ?? 6;
        const standard = STANDARD_DICE.includes(sides);
        form.elements.namedItem('diceType').value = standard ? String(sides) : 'custom';
        form.elements.namedItem('sides').value = standard ? '' : sides;
        toggleCustomSides(form);
    } else if (item) {
        Object.entries(item).forEach(([key, value]) => {
            form.elements.namedItem(key).value = value;
        });
    }
}

function toggleCustomSides(form) {
    const input = form.elements.namedItem('sides');
    // Disabled inputs are skipped by form validation
    input.hidden = input.disabled = form.elements.namedItem('diceType').value !== 'custom';
}

// Native validation plus the formula check, shown as the browser's validation bubble
function validate(form) {
    form.querySelectorAll('[data-formula]').forEach(input => {
        input.setCustomValidity(parseFormula(input.value) ? '' : 'Ungültige Formel. Beispiele: 3w6+3, 3w6+3+2w6-2, 2w20h+5');
    });
    return form.reportValidity();
}

function saveItem(event) {
    event.preventDefault();
    const form = event.target;
    if (!validate(form)) return;

    const { form: list, index } = history.state;
    const items = currentProfile()[list];
    const data = Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, value.trim()]));
    const item = list === 'simpleDices'
        ? { sides: Number(data.diceType === 'custom' ? data.sides : data.diceType) }
        : data;

    if (index != null && items[index]) {
        items[index] = item;
    } else {
        items.push(item);
    }
    saveProfiles();
    goBack();
}

// ---------- Rolling ----------

function roll(item, list) {
    const formulas = list === 'attackFunctions'
        ? [['Angriff', item.attack], ['Schaden', item.damage]]
        : [[null, list === 'diceFunctions' ? item.formula : `1w${item.sides}`]];
    rollFormulas(item.name ?? `W${item.sides}`, formulas, list === 'simpleDices' ? SOUNDS.single : SOUNDS.multi);
}

function quickRoll(event) {
    event.preventDefault();
    if (validate(event.target)) {
        rollFormulas('Freier Wurf', [[null, event.target.elements.namedItem('formula').value]], SOUNDS.multi);
    }
}

// formulas: [[label, formula], ...]
function rollFormulas(name, formulas, sounds) {
    const results = formulas.map(([, formula]) => rollFormula(formula));
    if (results.includes(null)) {
        showToast('Fehlerhafte Formel. Bitte über "Bearbeiten" korrigieren.');
        return;
    }

    lastRoll = {
        name,
        lines: results.map((result, i) => ({ label: formulas[i][0], ...result }))
    };

    if (settings.soundEnabled) playRandomSound(sounds);
    navigate({ ...history.state, result: true }, !!history.state.result);
    showAnimation();
}

function playRandomSound(files) {
    new Audio(files[Math.floor(Math.random() * files.length)]).play().catch(() => {});
}

function showAnimation() {
    if (!settings.animationEnabled) return;
    const image = $('diceAnimation');
    clearTimeout(animationTimer);
    if (animationUrl) URL.revokeObjectURL(animationUrl);
    // A fresh object URL restarts the animation at frame one without downloading it again
    animationUrl = animationBlob ? URL.createObjectURL(animationBlob) : null;
    image.onload = () => {
        animationTimer = setTimeout(hideAnimation, ANIMATION_MS);
    };
    image.onerror = hideAnimation;
    image.src = animationUrl ?? `img/dice.webp?${Date.now()}`;
    image.hidden = false;
}

function hideAnimation() {
    clearTimeout(animationTimer);
    const image = $('diceAnimation');
    image.onload = image.onerror = null;
    image.hidden = true;
}

// ---------- Modes, settings, toast ----------

const MODE_TEXT = {
    edit: 'Antippen zum Bearbeiten, am ☰ ziehen zum Verschieben',
    delete: 'Element antippen zum Löschen'
};

function setMode(next) {
    mode = next;
    $('profileContent').dataset.mode = next ?? '';
    $('modeBar').hidden = !next;
    $('modeText').textContent = MODE_TEXT[next] ?? '';
}

// ---------- Drag and drop (edit mode) ----------
// Pointer events instead of the HTML drag and drop API, which is unreliable on touch screens.
// Only the handle starts a drag (touch-action: none), so the list still scrolls everywhere else.

function startDrag(event) {
    const handle = event.target.closest('.drag-handle');
    if (!handle || mode !== 'edit') return;
    event.preventDefault();
    const card = handle.closest('[data-list]');
    const rect = card.getBoundingClientRect();
    const ghost = card.cloneNode(true);
    ghost.removeAttribute('data-list');
    ghost.classList.add('drag-ghost');
    Object.assign(ghost.style, { width: `${rect.width}px`, height: `${rect.height}px`, left: `${rect.left}px`, top: `${rect.top}px` });
    document.body.append(ghost);
    card.classList.add('dragging');
    const index = Number(card.dataset.index);
    drag = { list: card.dataset.list, from: index, to: index, ghost, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
}

function moveDrag(event) {
    if (!drag) return;
    drag.ghost.style.left = `${event.clientX - drag.dx}px`;
    drag.ghost.style.top = `${event.clientY - drag.dy}px`;
    // The ghost ignores pointer events, so this finds the card below the finger
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(`[data-list="${drag.list}"]`);
    drag.to = target ? Number(target.dataset.index) : drag.from;
    document.querySelectorAll('.drop-target').forEach(card => card.classList.remove('drop-target'));
    if (drag.to !== drag.from) target.classList.add('drop-target');
}

function endDrag() {
    if (!drag) return;
    const { list, from, to, ghost } = drag;
    drag = null;
    ghost.remove();
    const profile = currentProfile();
    if (to !== from) {
        moveItem(profile[list], from, to);
        saveProfiles();
    }
    renderProfile(profile);
}

// [button id, setting, label when on, label when off]
const SETTING_BUTTONS = [
    ['toggleAnimationBtn', 'animationEnabled', 'Animation ausschalten', 'Animation einschalten'],
    ['toggleSoundBtn', 'soundEnabled', 'Sound ausschalten', 'Sound einschalten'],
    ['toggleQuickRollBtn', 'quickRollEnabled', 'Freien Wurf ausblenden', 'Freien Wurf einblenden']
];

function updateSettingsButtons() {
    for (const [id, key, on, off] of SETTING_BUTTONS) {
        $(id).textContent = settings[key] ? on : off;
        $(id).setAttribute('aria-pressed', String(settings[key]));
    }
}

// Keep the screen on at the table. The browser drops the lock when the app is hidden,
// so it is requested again whenever the app becomes visible.
async function keepScreenOn() {
    if (document.visibilityState !== 'visible') return;
    try {
        await navigator.wakeLock?.request('screen');
    } catch {
        // Not allowed, for example in battery saver mode
    }
}

function onSettingsClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.add) {
        navigate({ view: 'form', profileId: currentProfile().id, form: button.dataset.add });
    } else if (button.dataset.mode) {
        $('settingsDialog').close();
        setMode(button.dataset.mode);
    } else if (button.id === 'renameProfileBtn') {
        navigate({ view: 'create', profileId: currentProfile().id });
    } else if (button.dataset.setting) {
        settings[button.dataset.setting] = !settings[button.dataset.setting];
        saveSettings();
        updateSettingsButtons();
        updateQuickRoll();
    }
}

function showToast(message, undo = null) {
    $('toastText').textContent = message;
    $('toastUndoBtn').hidden = !undo;
    $('toastUndoBtn').onclick = () => {
        $('toast').hidden = true;
        undo();
    };
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        $('toast').hidden = true;
    }, TOAST_MS);
}

// ---------- Init ----------

function closeOnBackdropClick(dialog) {
    dialog.addEventListener('click', event => {
        if (event.target === dialog) dialog.close();
    });
}

function init() {
    profiles = normalizeProfiles(load('profiles', [])) ?? [];
    const storedSettings = load('appSettings', {});
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    settings.animationEnabled = storedSettings.animationEnabled ?? !reducedMotion;
    settings.soundEnabled = storedSettings.soundEnabled ?? true;
    settings.quickRollEnabled = storedSettings.quickRollEnabled ?? false;
    updateSettingsButtons();
    keepScreenOn();
    document.addEventListener('visibilitychange', keepScreenOn);

    fetch('img/dice.webp').then(r => r.blob()).then(blob => {
        animationBlob = blob;
    }).catch(() => {});

    $('backBtn').addEventListener('click', goBack);
    $('settingsBtn').addEventListener('click', () => {
        setMode(null);
        $('settingsDialog').showModal();
    });
    document.querySelectorAll('[data-back]').forEach(button => button.addEventListener('click', goBack));

    $('createProfileBtn').addEventListener('click', () => navigate({ view: 'create' }));
    $('createProfileScreen').addEventListener('submit', saveProfile);
    $('exportBtn').addEventListener('click', exportProfiles);
    $('importBtn').addEventListener('click', () => $('importFile').click());
    $('importFile').addEventListener('change', event => {
        const [file] = event.target.files;
        event.target.value = '';
        if (file) importProfiles(file);
    });
    $('profileList').addEventListener('click', event => {
        const remove = event.target.closest('[data-delete]');
        const open = event.target.closest('[data-open]');
        if (remove) {
            const index = profiles.findIndex(p => p.id === remove.dataset.delete);
            removeWithUndo(profiles, index, `Profil "${profiles[index].name}" gelöscht`);
        } else if (open) {
            openProfile(open.dataset.open);
        }
    });

    $('profileContent').addEventListener('click', event => {
        if (event.target.closest('.drag-handle')) return;
        const card = event.target.closest('[data-list]');
        if (card) onItemClick(card.dataset.list, Number(card.dataset.index));
    });
    $('modeCancelBtn').addEventListener('click', () => setMode(null));
    $('profileContent').addEventListener('pointerdown', startDrag);
    document.addEventListener('pointermove', moveDrag);
    document.addEventListener('pointerup', endDrag);
    document.addEventListener('pointercancel', endDrag);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') setMode(null);
    });

    for (const { id } of Object.values(FORMS)) {
        $(id).addEventListener('submit', saveItem);
    }
    $('quickRollForm').addEventListener('submit', quickRoll);
    document.querySelectorAll('[data-formula]').forEach(input => {
        input.addEventListener('input', () => input.setCustomValidity(''));
    });
    $('simpleForm').elements.namedItem('diceType').addEventListener('change', () => toggleCustomSides($('simpleForm')));

    $('settingsDialog').addEventListener('click', onSettingsClick);
    closeOnBackdropClick($('settingsDialog'));
    const resultDialog = $('resultDialog');
    closeOnBackdropClick(resultDialog);
    // Closed by button, backdrop or Escape: drop the result history entry as well
    resultDialog.addEventListener('close', () => {
        hideAnimation();
        if (history.state?.result) goBack();
    });

    window.addEventListener('popstate', event => render(event.state ?? { view: 'list', depth: 0 }));
    // Keep the current screen on reload, but not a popup whose roll is gone
    const { result, ...state } = history.state?.view ? history.state : { view: 'list', depth: 0 };
    history.replaceState(state, '');
    render(state);
}

init();
