// Pure dice and profile logic without DOM access. Checked by model.test.js.

export const MAX_DICE = 100;

// 3w6, 1d20, w8
const DICE_TERM = /^(\d*)[wd](\d+)$/i;

export function parseFormula(formula) {
    const tokens = String(formula ?? '').replace(/\s+/g, '').replace(/-/g, '+-').split('+').filter(Boolean);
    if (tokens.length === 0) return null;
    const terms = [];

    for (let token of tokens) {
        const sign = token.startsWith('-') ? -1 : 1;
        if (sign < 0) token = token.slice(1);

        const dice = token.match(DICE_TERM);
        if (dice) {
            const count = Number(dice[1] || 1);
            const sides = Number(dice[2]);
            // Huge counts like 99999999w6 would freeze the browser
            if (count < 1 || count > MAX_DICE || sides < 1) return null;
            terms.push({ type: 'dice', sign, count, sides });
        } else if (/^\d+$/.test(token)) {
            terms.push({ type: 'number', value: sign * Number(token) });
        } else {
            return null;
        }
    }
    return terms;
}

export function rollDie(sides, random = Math.random) {
    return Math.floor(random() * sides) + 1;
}

// Returns { total, detail, natural } or null for an invalid formula.
// natural is the face of a single w20, used to highlight a natural 20 or 1.
export function rollFormula(formula, random = Math.random) {
    const terms = parseFormula(formula);
    if (!terms) return null;
    let total = 0;
    let natural = null;
    const parts = [];

    for (const term of terms) {
        const negative = term.type === 'dice' ? term.sign < 0 : term.value < 0;
        const sign = negative ? '-' : (parts.length ? '+' : '');

        if (term.type === 'number') {
            total += term.value;
            parts.push(`${sign}${Math.abs(term.value)}`);
            continue;
        }

        const rolls = Array.from({ length: term.count }, () => rollDie(term.sides, random));
        total += term.sign * rolls.reduce((acc, value) => acc + value, 0);
        parts.push(`${sign}${term.count}w${term.sides} [${rolls.join(', ')}]`);

        if (term.sides === 20 && term.count === 1) {
            natural = rolls[0];
        }
    }

    return { total, detail: parts.join(' '), natural };
}

const asList = value => Array.isArray(value) ? value : [];
const isText = value => typeof value === 'string' && value.trim() !== '';

// A function is { type: 'attack', name, attack, damage } or { type: 'dice', name, formula }.
// Attack and dice functions share one list so players can order them freely.
function normalizeFunction(f) {
    if (f?.type === 'attack' && isText(f.name) && isText(f.attack) && isText(f.damage)) {
        return { type: 'attack', name: f.name, attack: f.attack, damage: f.damage };
    }
    if (f?.type === 'dice' && isText(f.name) && isText(f.formula)) {
        return { type: 'dice', name: f.name, formula: f.formula };
    }
    return null;
}

// Cleans profiles from localStorage or an import file. Accepts a plain array
// or an export file { profiles: [...] }. Returns null if nothing usable is found.
// Formulas are kept as text even if invalid, so old data is never dropped silently.
// Versions before export format 2 kept attackFunctions and diceFunctions in separate
// lists; they are merged with the attacks first, the order those versions showed them.
export function normalizeProfiles(data) {
    const list = Array.isArray(data) ? data : data?.profiles;
    if (!Array.isArray(list)) return null;

    return list.filter(p => p && isText(p.name)).map(p => ({
        id: isText(p.id) ? p.id : crypto.randomUUID(),
        name: p.name,
        functions: (Array.isArray(p.functions)
            ? p.functions
            : [
                ...asList(p.attackFunctions).map(f => ({ ...f, type: 'attack' })),
                ...asList(p.diceFunctions).map(f => ({ ...f, type: 'dice' }))
            ]
        ).map(normalizeFunction).filter(Boolean),
        simpleDices: asList(p.simpleDices)
            .filter(d => d && Number.isInteger(d.sides) && d.sides >= 1)
            .map(({ sides }) => ({ sides }))
    }));
}

// Import: a profile with a known id replaces the existing one in place, so re-importing
// a backup does not duplicate it. New ids are appended.
export function mergeProfiles(existing, imported) {
    const merged = [...existing];
    for (const profile of imported) {
        const index = merged.findIndex(p => p.id === profile.id);
        if (index >= 0) {
            merged[index] = profile;
        } else {
            merged.push(profile);
        }
    }
    return merged;
}

// Moves one entry to another position. Changes the list in place, so references held
// elsewhere (for example by a pending undo) stay valid.
export function moveItem(list, from, to) {
    list.splice(to, 0, ...list.splice(from, 1));
    return list;
}
