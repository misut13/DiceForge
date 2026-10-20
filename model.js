// Pure dice and profile logic without DOM access. Checked by model.test.js.

export const MAX_DICE = 100;

// 3w6, 1d20, w8, 2w20h (keep highest), 4w6kh3, 2w20n / 2w20kl (keep lowest)
const DICE_TERM = /^(\d*)[wd](\d+)(?:(kh|kl|h|n|l)(\d*))?$/i;

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
            const keepMode = (dice[3] || '').toLowerCase();
            const keep = keepMode ? Number(dice[4] || 1) : count;
            // Huge counts like 99999999w6 would freeze the browser
            if (count < 1 || count > MAX_DICE || sides < 1 || keep < 1 || keep > count) return null;
            terms.push({
                type: 'dice',
                sign,
                count,
                sides,
                keep,
                keepLowest: ['kl', 'n', 'l'].includes(keepMode),
                notation: `${count}w${sides}${keepMode ? keepMode + keep : ''}`
            });
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
// natural is the face of a single kept w20, used to highlight a natural 20 or 1.
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
        const byValue = rolls.map((_, i) => i).sort((a, b) => term.keepLowest ? rolls[a] - rolls[b] : rolls[b] - rolls[a]);
        const kept = new Set(byValue.slice(0, term.keep));
        const sum = rolls.reduce((acc, value, i) => kept.has(i) ? acc + value : acc, 0);
        total += term.sign * sum;
        const shown = rolls.map((value, i) => kept.has(i) ? value : `(${value})`).join(', ');
        parts.push(`${sign}${term.notation} [${shown}]`);

        if (term.sides === 20 && term.keep === 1) {
            natural = rolls[byValue[0]];
        }
    }

    return { total, detail: parts.join(' '), natural };
}

const asList = value => Array.isArray(value) ? value : [];
const isText = value => typeof value === 'string' && value.trim() !== '';

// Cleans profiles from localStorage or an import file. Accepts a plain array
// or an export file { profiles: [...] }. Returns null if nothing usable is found.
// Formulas are kept as text even if invalid, so old data is never dropped silently.
export function normalizeProfiles(data) {
    const list = Array.isArray(data) ? data : data?.profiles;
    if (!Array.isArray(list)) return null;

    return list.filter(p => p && isText(p.name)).map(p => ({
        id: isText(p.id) ? p.id : crypto.randomUUID(),
        name: p.name,
        attackFunctions: asList(p.attackFunctions)
            .filter(f => f && isText(f.name) && isText(f.attack) && isText(f.damage))
            .map(({ name, attack, damage }) => ({ name, attack, damage })),
        diceFunctions: asList(p.diceFunctions)
            .filter(f => f && isText(f.name) && isText(f.formula))
            .map(({ name, formula }) => ({ name, formula })),
        simpleDices: asList(p.simpleDices)
            .filter(d => d && Number.isInteger(d.sides) && d.sides >= 1)
            .map(({ sides }) => ({ sides }))
    }));
}
