// End-to-end checks of DiceForge. Every test seeds its own localStorage and
// makes Math.random deterministic through window.__rand.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// ---------- Fixtures ----------

const STANDARD = [3, 4, 6, 8, 10, 12, 20, 100];
const dice = (...sides) => sides.map(s => ({ sides: s }));

const gandalf = (overrides = {}) => ({
    id: 'gandalf',
    name: 'Würfelkönig Gandalf',
    attackFunctions: [{ name: 'Schwert', attack: '1w20+5', damage: '2w6+3' }],
    diceFunctions: [{ name: 'Attribut', formula: '4w6h3' }],
    simpleDices: dice(...STANDARD),
    ...overrides
});
const empty = gandalf({ attackFunctions: [], diceFunctions: [] });
const bilbo = { id: 'bilbo', name: 'Bilbo', attackFunctions: [], diceFunctions: [], simpleDices: dice(...STANDARD) };
const backup = [gandalf({ attackFunctions: [{ name: 'Schwert', attack: '1w20+5', damage: '1w8' }] }), bilbo];
const exportFormat = profiles => JSON.stringify({ app: 'DiceForge', version: 1, profiles });

// ---------- Helpers ----------

// Seeds localStorage once per tab (sessionStorage flag, so reloads keep the app's own changes)
// and replaces Math.random with a queue that falls back to the real one when empty.
async function open(page, { profiles, appSettings = { animationEnabled: false } } = {}) {
    const storage = {};
    if (profiles) storage.profiles = profiles;
    if (appSettings) storage.appSettings = appSettings;
    const seed = Object.fromEntries(Object.entries(storage).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
    await page.addInitScript(seed => {
        const real = Math.random;
        window.__rand = [];
        Math.random = () => (window.__rand.length ? window.__rand.shift() : real());
        if (!sessionStorage.getItem('seeded')) {
            sessionStorage.setItem('seeded', '1');
            for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v);
        }
    }, seed);
    await page.goto('/');
}

const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('profiles')));
const resultState = page => page.evaluate(() => history.state?.result);
const cards = (page, list) => page.locator(`[data-list=${list}]`)
    .evaluateAll(els => els.map(e => e.innerText.trim().replace(/\s+/g, ' ')));
const profileNames = page => page.locator('.profile-name').allTextContents();
const validity = (page, selector, key) => page.locator(selector).evaluate((i, key) => i.validity[key], key);

async function openProfile(page, id = 'gandalf') {
    await page.click(`[data-open="${id}"]`);
    await expect(page.locator('#profileScreen')).toBeVisible();
}

async function openSettings(page) {
    await page.click('#settingsBtn');
    await expect(page.locator('#settingsDialog')).toBeVisible();
}

async function roll(page, list, index, rand) {
    await page.evaluate(r => { window.__rand = r; }, rand);
    await page.click(`[data-list=${list}][data-index="${index}"]`);
}

// Closing pops the result history entry asynchronously; wait for it so the next roll pushes a new one
async function closeResult(page) {
    await page.click('#resultDialog .btn');
    await expect(page.locator('#resultDialog')).toBeHidden();
    await expect.poll(() => resultState(page)).toBeUndefined();
}

async function exportFile(page, name) {
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#exportBtn')]);
    const path = test.info().outputPath(`${name}.json`);
    await download.saveAs(path);
    return { path, filename: download.suggestedFilename(), data: JSON.parse(fs.readFileSync(path, 'utf8')) };
}

// Every import ends with a toast (success or error), so hide it first and wait for it to come back
async function importFile(page, file) {
    await page.evaluate(() => { document.getElementById('toast').hidden = true; });
    await page.setInputFiles('#importFile', file);
    await expect(page.locator('#toast')).toBeVisible();
}
const importJson = (page, content) =>
    importFile(page, { name: 'import.json', mimeType: 'application/json', buffer: Buffer.from(content) });

// ---------- No script or HTTP errors in any test ----------

let problems;
test.beforeEach(async ({ page }) => {
    problems = [];
    page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
    page.on('requestfailed', r => problems.push(`failed: ${r.url()} ${r.failure()?.errorText}`));
    page.on('response', r => {
        if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) problems.push(`${r.status()} ${r.url()}`);
    });
});
test.afterEach(() => {
    expect(problems).toEqual([]);
});

// ---------- Profiles ----------

test.describe('Profile', () => {
    test('Leerer Start zeigt Hinweis', async ({ page }) => {
        await open(page);
        await expect(page.locator('#emptyState')).toBeVisible();
        await expect(page.locator('.profile-card')).toHaveCount(0);
    });

    test('Export ohne Profile', async ({ page }) => {
        await open(page);
        const { data, filename } = await exportFile(page, 'empty');
        expect(filename).toMatch(/^diceforge-\d{4}-\d{2}-\d{2}\.json$/);
        expect(data).toEqual({ app: 'DiceForge', version: 1, profiles: [] });
    });

    test('Profil anlegen: leer, nur Leerzeichen und >24 Zeichen werden abgefangen', async ({ page }) => {
        await open(page);
        await page.click('#createProfileBtn');
        await expect(page.locator('#headerTitle')).toHaveText('Neues Profil');
        const name = '#createProfileScreen [name=name]';
        await page.click('#createProfileScreen [type=submit]');
        expect(await validity(page, name, 'valueMissing')).toBe(true);
        await page.fill(name, '   ');
        await page.click('#createProfileScreen [type=submit]');
        expect(await validity(page, name, 'patternMismatch')).toBe(true);
        await page.fill(name, '');
        await page.locator(name).pressSequentially('X'.repeat(30));
        await expect(page.locator(name)).toHaveValue('X'.repeat(24));
        await expect(page.locator('#createProfileScreen')).toBeVisible();
    });

    test('Profil anlegen mit Enter, 8 Standardwürfel', async ({ page }) => {
        await open(page);
        await page.click('#createProfileBtn');
        await page.fill('#createProfileScreen [name=name]', 'Würfelkönig Gandalf');
        await page.press('#createProfileScreen [name=name]', 'Enter');
        await expect(page.locator('#profileListScreen')).toBeVisible();
        const [p] = await stored(page);
        expect(p.name).toBe('Würfelkönig Gandalf');
        expect(p.simpleDices.map(d => d.sides)).toEqual(STANDARD);
        await expect(page.locator('.profile-card')).toHaveText(/0 Funktionen.*8 Würfel/);
    });

    test('Profil anlegen abbrechen', async ({ page }) => {
        await open(page, { profiles: [empty] });
        await page.click('#createProfileBtn');
        await expect(page.locator('#createProfileScreen')).toBeVisible();
        await page.click('#createProfileScreen [data-back]');
        await expect(page.locator('#profileListScreen')).toBeVisible();
        expect(await stored(page)).toHaveLength(1);
    });

    test('Profil öffnen: Titel, Zurück und Einstellungen sichtbar', async ({ page }) => {
        await open(page, { profiles: [empty] });
        await openProfile(page);
        await expect(page.locator('#headerTitle')).toHaveText('Würfelkönig Gandalf');
        await expect(page.locator('#settingsBtn')).toBeVisible();
        await expect(page.locator('#backBtn')).toBeVisible();
        await expect(page.locator('#functionList')).toHaveText(/keine Funktionen/);
    });

    test('Profil löschen und Rückgängig behält Reihenfolge', async ({ page }) => {
        await open(page, { profiles: [empty, bilbo] });
        const before = ['Würfelkönig Gandalf', 'Bilbo'];
        await expect(page.locator('.profile-name')).toHaveText(before);
        await page.click('.profile-card:first-child .profile-delete');
        await expect(page.locator('.profile-name')).toHaveText(['Bilbo']);
        await page.click('#toastUndoBtn');
        await expect(page.locator('.profile-name')).toHaveText(before);
    });
});

// ---------- Adding ----------

test.describe('Hinzufügen', () => {
    test('Angriffsfunktion: ungültige Formel abgelehnt, gültige gespeichert', async ({ page }) => {
        await open(page, { profiles: [empty] });
        await openProfile(page);
        await openSettings(page);
        await page.click('[data-add=attackFunctions]');
        await expect(page.locator('#headerSubtitle')).toHaveText('Neue Funktion hinzufügen');
        await page.fill('#attackForm [name=name]', 'Schwert');
        await page.fill('#attackForm [name=attack]', 'abc');
        await page.fill('#attackForm [name=damage]', '2w6+3');
        await page.click('#attackForm [type=submit]');
        await expect.poll(() => page.locator('#attackForm [name=attack]').evaluate(i => i.validationMessage)).toMatch(/^Ungültige Formel/);
        await expect(page.locator('#attackForm')).toBeVisible();
        await page.fill('#attackForm [name=attack]', '1w20+5');
        await page.click('#attackForm [type=submit]');
        await expect(page.locator('#profileScreen')).toBeVisible();
        await expect.poll(() => cards(page, 'attackFunctions')).toEqual(['Schwert A: 1w20+5 S: 2w6+3']);
    });

    test('Würfelfunktion: 101w6 abgelehnt, 4w6h3 gespeichert', async ({ page }) => {
        await open(page, { profiles: [empty] });
        await openProfile(page);
        await openSettings(page);
        await page.click('[data-add=diceFunctions]');
        await page.fill('#diceForm [name=name]', 'Attribut');
        await page.fill('#diceForm [name=formula]', '101w6');
        await page.click('#diceForm [type=submit]');
        await expect.poll(() => page.locator('#diceForm [name=formula]').evaluate(i => i.validationMessage)).toMatch(/^Ungültige Formel/);
        await page.fill('#diceForm [name=formula]', '4w6h3');
        await page.click('#diceForm [type=submit]');
        await expect(page.locator('#profileScreen')).toBeVisible();
        await expect.poll(() => cards(page, 'diceFunctions')).toEqual(['Attribut 4w6h3']);
    });

    test('Eigener Würfel: Feld nur bei "Individuell", 0 und Buchstaben abgelehnt, W7 gespeichert', async ({ page }) => {
        await open(page, { profiles: [empty] });
        await openProfile(page);
        await openSettings(page);
        await page.click('[data-add=simpleDices]');
        const sides = '#simpleForm [name=sides]';
        await expect(page.locator('#simpleForm')).toBeVisible();
        await expect(page.locator(sides)).toBeHidden();
        await page.selectOption('#simpleForm [name=diceType]', 'custom');
        await expect(page.locator(sides)).toBeVisible();
        await page.fill(sides, '0');
        await page.click('#simpleForm [type=submit]');
        expect(await validity(page, sides, 'patternMismatch')).toBe(true);
        await page.fill(sides, 'abc');
        await page.click('#simpleForm [type=submit]');
        expect(await validity(page, sides, 'valid')).toBe(false);
        await page.fill(sides, '7');
        await page.click('#simpleForm [type=submit]');
        await expect(page.locator('#profileScreen')).toBeVisible();
        await expect.poll(async () => (await cards(page, 'simpleDices')).at(-1)).toBe('W7');
    });

    test('Standardwürfel hinzufügen (W20 doppelt)', async ({ page }) => {
        await open(page, { profiles: [empty] });
        await openProfile(page);
        await openSettings(page);
        await page.click('[data-add=simpleDices]');
        await page.selectOption('#simpleForm [name=diceType]', '20');
        await page.click('#simpleForm [type=submit]');
        await expect(page.locator('#profileScreen')).toBeVisible();
        await expect.poll(() => cards(page, 'simpleDices')).toEqual(['W3', 'W4', 'W6', 'W8', 'W10', 'W12', 'W20', 'W100', 'W20']);
    });
});

// ---------- Rolling ----------

test.describe('Würfeln', () => {
    test.beforeEach(async ({ page }) => {
        await open(page, { profiles: [gandalf()] });
        await openProfile(page);
    });

    test('W20 würfeln: natürliche 20, schliessen per Button', async ({ page }) => {
        await roll(page, 'simpleDices', 6, [0.999]);
        await expect(page.locator('#resultDialog')).toBeVisible();
        await expect(page.locator('#resultText')).toHaveText(/W20.*1w20 \[20\] = 20.*Natürliche 20!/);
        await closeResult(page);
    });

    test('Angriff würfeln: Summen stimmen, natürliche 1, Verlauf, schliessen per Escape', async ({ page }) => {
        await roll(page, 'simpleDices', 6, [0.999]);
        await closeResult(page);
        await roll(page, 'attackFunctions', 0, [0, 0.5, 0.5]);
        const text = page.locator('#resultText');
        await expect(text).toHaveText(/Angriff: 1w20 \[1\] \+5 = 6/);
        await expect(text).toHaveText(/Natürliche 1/);
        await expect(text).toHaveText(/Schaden: 2w6 \[4, 4\] \+3 = 11/);
        await expect(page.locator('#rollHistory li')).toHaveText(['W20: 20']);
        await page.keyboard.press('Escape');
        await expect(page.locator('#resultDialog')).toBeHidden();
        await expect.poll(() => resultState(page)).toBeUndefined();
    });

    test('4w6h3 würfeln: bester 3 von 4, schliessen per Klick daneben', async ({ page }) => {
        await roll(page, 'diceFunctions', 0, [0, 0.5, 0.999, 0.5]);
        await expect(page.locator('#resultText')).toHaveText(/4w6h3 \[\(1\), 4, 6, 4\] = 14/);
        await page.mouse.click(3, 3);
        await expect(page.locator('#resultDialog')).toBeHidden();
    });

    test('Zurück-Taste des Browsers schliesst Ergebnis, bleibt im Profil', async ({ page }) => {
        await roll(page, 'simpleDices', 2, [0.5]);
        await expect(page.locator('#resultDialog')).toBeVisible();
        await page.goBack();
        await expect(page.locator('#resultDialog')).toBeHidden();
        await expect(page.locator('#profileScreen')).toBeVisible();
    });

    test('Verlauf zeigt höchstens 5 frühere Würfe', async ({ page }) => {
        for (let i = 0; i < 7; i++) {
            await roll(page, 'simpleDices', 0, [0]);
            await expect(page.locator('#resultDialog')).toBeVisible();
            await closeResult(page);
        }
        await roll(page, 'simpleDices', 0, [0]);
        await expect(page.locator('#resultDialog')).toBeVisible();
        await expect(page.locator('#rollHistory li')).toHaveCount(5);
        await closeResult(page);
    });

    test('Sounds laden (200, audio/*)', async ({ page }) => {
        for (const [list, pattern] of [['simpleDices', /\/sounds\/dice\d\.m4a/], ['attackFunctions', /\/sounds\/multidice\d\.m4a/]]) {
            const response = page.waitForResponse(r => pattern.test(r.url()));
            await roll(page, list, 0, []);
            const r = await response;
            expect(`${r.status()} ${r.headers()['content-type']}`).toMatch(/^(200|206) audio\//);
            await closeResult(page);
        }
    });
});

// ---------- Editing ----------

test.describe('Bearbeiten', () => {
    test('Bearbeiten: Angriff vorbefüllt, Änderung gespeichert, keine Kopie', async ({ page }) => {
        await open(page, { profiles: [gandalf()] });
        await openProfile(page);
        await openSettings(page);
        await page.click('[data-mode=edit]');
        await expect(page.locator('#modeBar')).toBeVisible();
        await expect(page.locator('#modeText')).toHaveText(/Bearbeiten/);
        await page.click('[data-list=attackFunctions][data-index="0"]');
        await expect(page.locator('#headerSubtitle')).toHaveText('Funktion bearbeiten');
        await expect(page.locator('#attackForm [type=submit]')).toHaveText('Speichern');
        await expect(page.locator('#attackForm [name=attack]')).toHaveValue('1w20+5');
        await page.fill('#attackForm [name=damage]', '1w8');
        await page.click('#attackForm [type=submit]');
        await expect(page.locator('#profileScreen')).toBeVisible();
        await expect.poll(() => cards(page, 'attackFunctions')).toEqual(['Schwert A: 1w20+5 S: 1w8']);
    });

    test('Hinzugefügtes und Bearbeitetes überlebt Neuladen', async ({ page }) => {
        await open(page, { profiles: [gandalf()] });
        await openProfile(page);
        await openSettings(page);
        await page.click('[data-add=diceFunctions]');
        await page.fill('#diceForm [name=name]', 'Initiative');
        await page.fill('#diceForm [name=formula]', '1w20+2');
        await page.click('#diceForm [type=submit]');
        await expect(page.locator('#profileScreen')).toBeVisible();
        await openSettings(page);
        await page.click('[data-mode=edit]');
        await page.click('[data-list=attackFunctions][data-index="0"]');
        await page.fill('#attackForm [name=damage]', '1w8');
        await page.click('#attackForm [type=submit]');
        await expect(page.locator('#profileScreen')).toBeVisible();
        await page.reload();
        await expect.poll(() => cards(page, 'diceFunctions')).toEqual(['Attribut 4w6h3', 'Initiative 1w20+2']);
        await expect.poll(() => cards(page, 'attackFunctions')).toEqual(['Schwert A: 1w20+5 S: 1w8']);
    });

    test('Bearbeiten: W7 auf Standard W12, W3 auf eigenen W5', async ({ page }) => {
        await open(page, { profiles: [gandalf({ simpleDices: dice(...STANDARD, 7, 20) })] });
        await openProfile(page);
        await openSettings(page);
        await page.click('[data-mode=edit]');
        await page.click('[data-list=simpleDices][data-index="8"]');
        await expect(page.locator('#simpleForm [name=diceType]')).toHaveValue('custom');
        await expect(page.locator('#simpleForm [name=sides]')).toHaveValue('7');
        await page.selectOption('#simpleForm [name=diceType]', '12');
        await page.click('#simpleForm [type=submit]');
        await expect(page.locator('#profileScreen')).toBeVisible();

        await openSettings(page);
        await page.click('[data-mode=edit]');
        await page.click('[data-list=simpleDices][data-index="0"]');
        await expect(page.locator('#simpleForm [name=diceType]')).toHaveValue('3');
        await page.selectOption('#simpleForm [name=diceType]', 'custom');
        await page.fill('#simpleForm [name=sides]', '5');
        await page.click('#simpleForm [type=submit]');
        await expect(page.locator('#profileScreen')).toBeVisible();
        await expect.poll(() => cards(page, 'simpleDices'))
            .toEqual(['W5', 'W4', 'W6', 'W8', 'W10', 'W12', 'W20', 'W100', 'W12', 'W20']);
    });

    test('Neu laden im Bearbeiten-Formular behält Inhalt', async ({ page }) => {
        await open(page, { profiles: [gandalf()] });
        await openProfile(page);
        await openSettings(page);
        await page.click('[data-mode=edit]');
        await page.click('[data-list=diceFunctions][data-index="0"]');
        await expect(page.locator('#diceForm')).toBeVisible();
        await page.reload();
        await expect(page.locator('#diceForm')).toBeVisible();
        await expect(page.locator('#diceForm [name=formula]')).toHaveValue('4w6h3');
        await page.click('#diceForm [data-back]');
        await expect(page.locator('#profileScreen')).toBeVisible();
    });

    test('Modus abbrechen per Button und Escape, danach wird wieder gewürfelt', async ({ page }) => {
        await open(page, { profiles: [gandalf()] });
        await openProfile(page);
        await openSettings(page);
        await page.click('[data-mode=delete]');
        await expect(page.locator('#modeBar')).toBeVisible();
        await page.click('#modeCancelBtn');
        await expect(page.locator('#modeBar')).toBeHidden();
        await openSettings(page);
        await page.click('[data-mode=edit]');
        await expect(page.locator('#modeBar')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.locator('#modeBar')).toBeHidden();
        await roll(page, 'simpleDices', 1, [0]);
        await expect(page.locator('#resultDialog')).toBeVisible();
        await closeResult(page);
    });
});

// ---------- Deleting ----------

test.describe('Löschen', () => {
    test.beforeEach(async ({ page }) => {
        await open(page, { profiles: [gandalf()] });
        await openProfile(page);
    });

    test('Löschen mit Rückgängig stellt an gleicher Stelle wieder her', async ({ page }) => {
        const before = await cards(page, 'simpleDices');
        await openSettings(page);
        await page.click('[data-mode=delete]');
        await expect(page.locator('#modeText')).toHaveText(/Löschen/);
        await page.click('[data-list=simpleDices][data-index="3"]');
        await expect.poll(async () => (await cards(page, 'simpleDices')).length).toBe(before.length - 1);
        await expect(page.locator('#toastText')).toHaveText(/"W8" gelöscht/);
        await expect(page.locator('#modeBar')).toBeHidden();
        await page.click('#toastUndoBtn');
        await expect.poll(() => cards(page, 'simpleDices')).toEqual(before);
        expect((await stored(page))[0].simpleDices).toHaveLength(before.length);
    });

    test('Löschen ohne Rückgängig bleibt gelöscht (auch nach Neuladen)', async ({ page }) => {
        await openSettings(page);
        await page.click('[data-mode=delete]');
        await page.click('[data-list=diceFunctions][data-index="0"]');
        await expect.poll(() => cards(page, 'diceFunctions')).toEqual([]);
        await page.reload();
        await expect(page.locator('#profileScreen')).toBeVisible();
        await expect.poll(() => cards(page, 'attackFunctions')).toHaveLength(1);
        expect(await cards(page, 'diceFunctions')).toEqual([]);
    });

    test('Löschmodus endet beim Verlassen des Profils', async ({ page }) => {
        await openSettings(page);
        await page.click('[data-mode=delete]');
        await page.click('#backBtn');
        await expect(page.locator('#profileListScreen')).toBeVisible();
        await openProfile(page);
        await expect(page.locator('#profileContent')).toHaveAttribute('data-mode', '');
    });
});

// ---------- Settings ----------

test.describe('Einstellungen', () => {
    test('Einstellungen schliessen per Klick daneben', async ({ page }) => {
        await open(page, { profiles: [gandalf()] });
        await openProfile(page);
        await openSettings(page);
        await page.mouse.click(3, 3);
        await expect(page.locator('#settingsDialog')).toBeHidden();
    });

    test('Animation an: erscheint und verschwindet nach ca. 2 s', async ({ page }) => {
        await open(page, { profiles: [gandalf()], appSettings: { animationEnabled: true } });
        await openProfile(page);
        await expect(page.locator('#toggleAnimationBtn')).toHaveText('Animation ausschalten');
        const start = Date.now();
        await roll(page, 'simpleDices', 1, [0]);
        await expect(page.locator('#diceAnimation')).toBeVisible();
        await expect(page.locator('#diceAnimation')).toBeHidden({ timeout: 4000 });
        expect(Date.now() - start).toBeGreaterThanOrEqual(1900);
        await closeResult(page);
    });

    test('Animation aus: bleibt nach Neuladen aus, keine Animation beim Würfeln', async ({ page }) => {
        await open(page, { profiles: [gandalf()], appSettings: { animationEnabled: true } });
        await openProfile(page);
        await openSettings(page);
        await page.click('#toggleAnimationBtn');
        await expect(page.locator('#toggleAnimationBtn')).toHaveText('Animation einschalten');
        await page.keyboard.press('Escape');
        await expect(page.locator('#settingsDialog')).toBeHidden();
        await page.reload();
        await expect(page.locator('#profileScreen')).toBeVisible();
        await expect(page.locator('#toggleAnimationBtn')).toHaveText('Animation einschalten');
        await roll(page, 'simpleDices', 1, [0]);
        // showAnimation runs synchronously with opening the dialog, so hidden now means it never started
        await expect(page.locator('#resultDialog')).toBeVisible();
        await expect(page.locator('#diceAnimation')).toBeHidden();
        await closeResult(page);
    });
});

// ---------- Navigation ----------

test('Browser zurück/vor durch Bildschirme', async ({ page }) => {
    await open(page, { profiles: [gandalf()] });
    await openProfile(page);
    await openSettings(page);
    await page.click('[data-add=diceFunctions]');
    await expect(page.locator('#diceForm')).toBeVisible();
    await page.goBack();
    await expect(page.locator('#profileScreen')).toBeVisible();
    await page.goForward();
    await expect(page.locator('#diceForm')).toBeVisible();
    await page.click('#backBtn');
    await expect(page.locator('#profileScreen')).toBeVisible();
    await page.click('#backBtn');
    await expect(page.locator('#profileListScreen')).toBeVisible();
});

// ---------- Export / import ----------

test.describe('Export und Import', () => {
    test('Export enthält genau die gespeicherten Daten', async ({ page }) => {
        await open(page, { profiles: backup });
        const { data, filename } = await exportFile(page, 'backup');
        expect(filename).toMatch(/^diceforge-\d{4}-\d{2}-\d{2}\.json$/);
        expect(data.app).toBe('DiceForge');
        expect(data.version).toBe(1);
        expect(data.profiles).toEqual(await stored(page));
        expect(data.profiles).toHaveLength(2);
    });

    test('Import in leeren Browser: Daten identisch, Würfeln geht', async ({ page }) => {
        await open(page, { profiles: backup });
        const exported = await exportFile(page, 'backup');
        // Empty the browser; the seed flag keeps the reload from restoring the data
        await page.evaluate(() => localStorage.clear());
        await page.reload();
        await expect(page.locator('#emptyState')).toBeVisible();

        await importFile(page, exported.path);
        await expect(page.locator('#toastText')).toHaveText('2 Profil(e) importiert.');
        expect(await stored(page)).toEqual(exported.data.profiles);
        await openProfile(page);
        await roll(page, 'attackFunctions', 0, [0.999, 0.999]);
        await expect(page.locator('#resultText')).toHaveText(/1w20 \[20\] \+5 = 25.*1w8 \[8\] = 8/);
        await closeResult(page);
    });

    test('Gleiche Datei zweimal hintereinander: keine Duplikate', async ({ page }) => {
        await open(page);
        await importJson(page, exportFormat(backup));
        await importJson(page, exportFormat(backup));
        expect(await stored(page)).toHaveLength(2);
        await expect(page.locator('.profile-card')).toHaveCount(2);
    });

    test('Geänderte Datei mit gleicher Id ersetzt, neue Id wird ergänzt', async ({ page }) => {
        await open(page, { profiles: backup });
        const changed = structuredClone(backup);
        changed[0].name = 'Umbenannt';
        changed.push({ id: 'neu-1', name: 'Neu', diceFunctions: [{ name: 'Test', formula: '1w6' }] });
        await importJson(page, exportFormat(changed));
        const s = await stored(page);
        expect(s.map(p => p.name)).toEqual(['Umbenannt', 'Bilbo', 'Neu']);
        expect(s[2]).toEqual({ id: 'neu-1', name: 'Neu', attackFunctions: [], diceFunctions: [{ name: 'Test', formula: '1w6' }], simpleDices: [] });
        await expect(page.locator('.profile-name')).toHaveText(['Umbenannt', 'Bilbo', 'Neu']);
    });

    test('Import im alten Format (reines Array aus localStorage)', async ({ page }) => {
        await open(page, { profiles: backup });
        await importJson(page, JSON.stringify([{ id: 'alt-1', name: 'Altprofil', diceFunctions: [], attackFunctions: [], simpleDices: [{ sides: 6 }] }]));
        await expect(page.locator('#toastText')).toHaveText('1 Profil(e) importiert.');
        expect(await stored(page)).toHaveLength(3);
    });

    test('Kaputte Datei: Fehlermeldung, Daten unverändert', async ({ page }) => {
        await open(page, { profiles: backup });
        const before = await stored(page);
        for (const bad of ['{kaputt', '{"foo":1}', '"text"', '']) {
            await importJson(page, bad);
            await expect(page.locator('#toastText'), `Inhalt: ${bad}`).toHaveText('Datei konnte nicht gelesen werden.');
            expect(await stored(page)).toEqual(before);
        }
    });

    test('Müll-Einträge werden beim Import aussortiert', async ({ page }) => {
        await open(page);
        await importJson(page, JSON.stringify({ profiles: [null, { name: '' }, { id: 'm', name: 'Mix', attackFunctions: [{ name: 'x' }], simpleDices: [{ sides: -1 }, { sides: 4 }] }] }));
        await expect(page.locator('#toastText')).toHaveText('1 Profil(e) importiert.');
        expect(await stored(page)).toEqual([{ id: 'm', name: 'Mix', attackFunctions: [], diceFunctions: [], simpleDices: [{ sides: 4 }] }]);
    });

    test('HTML im Namen wird als Text angezeigt (kein Skript)', async ({ page }) => {
        const name = '<img src=x onerror="window.__xss=1">';
        await open(page);
        await importJson(page, JSON.stringify([{ id: 'x', name }]));
        await expect(page.locator('.profile-name')).toHaveText([name]);
        // No element was created, so no onerror can ever fire
        await expect(page.locator('#profileList img')).toHaveCount(0);
        expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    });
});

// ---------- Data from the original version ----------

test.describe('Daten der Originalversion', () => {
    test.beforeEach(async ({ page }) => {
        await open(page, {
            profiles: JSON.stringify([
                { id: '1727000000000abc123xyz', name: 'Altes Profil', diceFunctions: [{ name: 'Feuerball', formula: '8w6' }], attackFunctions: [{ name: 'Axt', attack: '1w20+4', damage: '1w12+2' }], simpleDices: [{ sides: 6 }, { sides: 13 }] },
                { id: '1727000000001def', name: 'Uralt ohne Angriffe', diceFunctions: [{ name: 'Zu viel', formula: '200w6' }], simpleDices: [] }
            ]),
            appSettings: JSON.stringify({ animationEnabled: false })
        });
    });

    test('Daten der Originalversion werden geladen', async ({ page }) => {
        await expect(page.locator('.profile-name')).toHaveText(['Altes Profil', 'Uralt ohne Angriffe']);
        await openProfile(page, '1727000000000abc123xyz');
        await expect.poll(() => cards(page, 'simpleDices')).toEqual(['W6', 'W13']);
        await roll(page, 'diceFunctions', 0, Array(8).fill(0));
        await expect(page.locator('#resultText')).toHaveText(/8w6 \[1, 1, 1, 1, 1, 1, 1, 1\] = 8/);
        await closeResult(page);
    });

    test('Alte ungültige Formel (200w6) bleibt erhalten, Würfeln meldet Fehler', async ({ page }) => {
        await openProfile(page, '1727000000001def');
        await page.click('[data-list=diceFunctions][data-index="0"]');
        await expect(page.locator('#toastText')).toHaveText(/Fehlerhafte Formel/);
        await expect(page.locator('#resultDialog')).toBeHidden();
        expect((await stored(page))[1].diceFunctions[0].formula).toBe('200w6');
    });
});
