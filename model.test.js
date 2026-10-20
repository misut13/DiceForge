// Run with: npm test
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseFormula, rollFormula, normalizeProfiles, mergeProfiles, moveItem } from './model.js';

// Deterministic random source: 0.99 gives the highest face, 0 gives 1
const sequence = values => () => values.shift();

describe('parseFormula', () => {
    test('accepts dice, modifiers and combinations', () => {
        for (const formula of ['3w6+3', '3w6+3+2w6-2', 'w20', '1d20+5', '3 w 6 + 3']) {
            assert.ok(parseFormula(formula), formula);
        }
    });

    test('accepts keep highest and keep lowest notation', () => {
        for (const formula of ['2w20h+5', '4w6kh3', '2W20n', '2w20kl1', '2w20l']) {
            assert.ok(parseFormula(formula), formula);
        }
    });

    test('rejects text and incomplete formulas', () => {
        for (const formula of ['', 'abc', '3w6-', '-', '3w6x', null]) {
            assert.equal(parseFormula(formula), null, String(formula));
        }
    });

    test('allows up to 100 dice per term', () => {
        assert.ok(parseFormula('100w6'));
        assert.equal(parseFormula('101w6'), null);
    });

    test('rejects huge dice counts that would freeze the browser', () => {
        assert.equal(parseFormula('99999999w6'), null);
    });

    test('rejects zero dice and zero sides', () => {
        assert.equal(parseFormula('0w6'), null);
        assert.equal(parseFormula('1w0'), null);
    });

    test('rejects keeping more dice than rolled or none', () => {
        assert.equal(parseFormula('2w20h3'), null);
        assert.equal(parseFormula('2w20h0'), null);
    });
});

describe('rollFormula', () => {
    test('sums dice and modifiers and lists every die', () => {
        assert.deepEqual(rollFormula('2w6+3', sequence([0, 0.99])), { total: 10, detail: '2w6 [1, 6] +3', natural: null });
    });

    test('subtracts negative dice and numbers', () => {
        assert.deepEqual(rollFormula('-1w4-2', sequence([0.99])), { total: -6, detail: '-1w4 [4] -2', natural: null });
    });

    test('keeps the highest die for advantage and shows dropped dice in brackets', () => {
        assert.deepEqual(rollFormula('2w20h+5', sequence([0.99, 0])), { total: 25, detail: '2w20h1 [20, (1)] +5', natural: 20 });
    });

    test('keeps the lowest die for disadvantage', () => {
        assert.deepEqual(rollFormula('2w20n', sequence([0.99, 0])), { total: 1, detail: '2w20n1 [(20), 1]', natural: 1 });
    });

    test('keeps the best three of four', () => {
        assert.equal(rollFormula('4w6kh3', sequence([0, 0.5, 0.99, 0.5])).total, 6 + 4 + 4);
    });

    test('reports no natural value when several w20 are kept', () => {
        assert.equal(rollFormula('2w20', sequence([0.99, 0.99])).natural, null);
    });

    test('returns null for an invalid formula', () => {
        assert.equal(rollFormula('abc'), null);
    });
});

describe('normalizeProfiles', () => {
    test('accepts the export file format and drops unknown fields', () => {
        const [profile] = normalizeProfiles({
            profiles: [{ id: 'a', name: 'Gandalf', extra: 1, functions: [{ type: 'attack', name: 'Stab', attack: '1w20', damage: '1w6', extra: 1 }] }]
        });
        assert.deepEqual(profile, {
            id: 'a',
            name: 'Gandalf',
            functions: [{ type: 'attack', name: 'Stab', attack: '1w20', damage: '1w6' }],
            simpleDices: []
        });
    });

    test('keeps attack and dice functions mixed in their stored order', () => {
        const [profile] = normalizeProfiles([{
            id: 'a',
            name: 'Gandalf',
            functions: [
                { type: 'dice', name: 'Feuerball', formula: '8w6' },
                { type: 'attack', name: 'Stab', attack: '1w20', damage: '1w6' }
            ]
        }]);
        assert.deepEqual(profile.functions.map(f => f.name), ['Feuerball', 'Stab']);
    });

    test('converts the separate lists of older versions, attacks first', () => {
        const [profile] = normalizeProfiles([{
            id: 'a',
            name: 'Alt',
            diceFunctions: [{ name: 'Feuerball', formula: '8w6' }],
            attackFunctions: [{ name: 'Stab', attack: '1w20', damage: '1w6' }]
        }]);
        assert.deepEqual(profile.functions, [
            { type: 'attack', name: 'Stab', attack: '1w20', damage: '1w6' },
            { type: 'dice', name: 'Feuerball', formula: '8w6' }
        ]);
        assert.equal('attackFunctions' in profile, false);
        assert.equal('diceFunctions' in profile, false);
    });

    test('drops functions of unknown type or with missing fields', () => {
        const [profile] = normalizeProfiles([{
            id: 'a',
            name: 'Mix',
            functions: [{ type: 'spell', name: 'X', formula: '1w6' }, { type: 'attack', name: 'Halb', attack: '1w20' }, null]
        }]);
        assert.deepEqual(profile.functions, []);
    });

    test('accepts the plain array stored in localStorage', () => {
        assert.equal(normalizeProfiles([{ id: 'a', name: 'Gandalf' }]).length, 1);
    });

    test('drops entries without a name and invalid dice', () => {
        const profiles = normalizeProfiles([null, { name: '' }, { id: 'a', name: 'Ok', simpleDices: [{ sides: 6 }, { sides: 'x' }, { sides: 0 }] }]);
        assert.deepEqual(profiles.map(p => p.name), ['Ok']);
        assert.deepEqual(profiles[0].simpleDices, [{ sides: 6 }]);
    });

    test('keeps invalid formulas so old data is never lost', () => {
        const [profile] = normalizeProfiles([{ id: 'a', name: 'Alt', diceFunctions: [{ name: 'Zu viel', formula: '200w6' }] }]);
        assert.equal(profile.functions[0].formula, '200w6');
    });

    test('creates an id when it is missing', () => {
        assert.ok(normalizeProfiles([{ name: 'Ohne Id' }])[0].id);
    });

    test('returns null for data that is not a profile list', () => {
        for (const data of ['kaputt', { foo: 1 }, null, 42]) {
            assert.equal(normalizeProfiles(data), null, JSON.stringify(data));
        }
    });
});

describe('mergeProfiles', () => {
    const profile = (id, name) => ({ id, name, attackFunctions: [], diceFunctions: [], simpleDices: [] });

    test('replaces a profile with the same id at its position', () => {
        const merged = mergeProfiles([profile('a', 'Alt'), profile('b', 'B')], [profile('a', 'Neu')]);
        assert.deepEqual(merged.map(p => p.name), ['Neu', 'B']);
    });

    test('appends profiles with a new id', () => {
        const merged = mergeProfiles([profile('a', 'A')], [profile('c', 'C')]);
        assert.deepEqual(merged.map(p => p.id), ['a', 'c']);
    });

    test('does not change the existing list', () => {
        const existing = [profile('a', 'A')];
        mergeProfiles(existing, [profile('a', 'Neu'), profile('b', 'B')]);
        assert.deepEqual(existing, [profile('a', 'A')]);
    });
});

describe('moveItem', () => {
    test('moves a later item forward to the target position', () => {
        assert.deepEqual(moveItem(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
    });

    test('moves an earlier item back to the target position', () => {
        assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a']);
    });

    test('changes the list in place so other references stay valid', () => {
        const list = ['a', 'b'];
        moveItem(list, 1, 0);
        assert.deepEqual(list, ['b', 'a']);
    });
});
