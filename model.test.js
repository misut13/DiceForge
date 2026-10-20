// Run with: node model.test.js
import assert from 'node:assert/strict';
import { parseFormula, rollFormula, normalizeProfiles } from './model.js';

const valid = ['3w6+3', '3w6+3+2w6-2', 'w20', '1d20+5', '100w6', '2w20h+5', '4w6kh3', '2W20n', '2w20kl1'];
const invalid = ['', 'abc', '3w6-', '0w6', '1w0', '101w6', '99999999w6', '2w20h3', '2w20h0', '3w6x'];
valid.forEach(f => assert.ok(parseFormula(f), f));
invalid.forEach(f => assert.equal(parseFormula(f), null, f));

// Fixed random source: 0.99 -> highest face, 0 -> 1
const seq = values => () => values.shift();
assert.deepEqual(rollFormula('2w6+3', seq([0, 0.99])), { total: 10, detail: '2w6 [1, 6] +3', natural: null });
assert.deepEqual(rollFormula('-1w4-2', seq([0.99])), { total: -6, detail: '-1w4 [4] -2', natural: null });
assert.deepEqual(rollFormula('2w20h+5', seq([0.99, 0])), { total: 25, detail: '2w20h1 [20, (1)] +5', natural: 20 });
assert.deepEqual(rollFormula('2w20n', seq([0.99, 0])), { total: 1, detail: '2w20n1 [(20), 1]', natural: 1 });
assert.equal(rollFormula('4w6kh3', seq([0, 0.5, 0.99, 0.5])).total, 6 + 4 + 4);

const profiles = normalizeProfiles({
    profiles: [
        { id: 'a', name: 'Gandalf', attackFunctions: [{ name: 'Stab', attack: '1w20', damage: '1w6', extra: 1 }], simpleDices: [{ sides: 6 }, { sides: 'x' }] },
        { name: '' },
        null
    ]
});
assert.equal(profiles.length, 1);
assert.deepEqual(profiles[0], {
    id: 'a', name: 'Gandalf',
    attackFunctions: [{ name: 'Stab', attack: '1w20', damage: '1w6' }],
    diceFunctions: [],
    simpleDices: [{ sides: 6 }]
});
assert.equal(normalizeProfiles('kaputt'), null);
assert.ok(normalizeProfiles([{ name: 'Ohne Id' }])[0].id);

console.log('model.test.js ok');
