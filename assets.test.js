// Run with: npm test
// The deploy workflow replaces ?v=dev with the commit, so a new index.html always loads
// matching JS and CSS instead of stale copies from the browser cache.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const localReferences = (file, pattern) =>
    [...readFileSync(file, 'utf8').matchAll(pattern)].map(m => m[1]).filter(ref => !/^(https?:|data:)/.test(ref));

test('index.html loads its scripts and stylesheets with the version marker', () => {
    const refs = localReferences('index.html', /<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)
        .filter(ref => /\.(js|css)(\?|$)/.test(ref));
    assert.ok(refs.length >= 2, `found ${refs}`);
    for (const ref of refs) assert.match(ref, /\?v=dev$/, ref);
});

test('app.js imports its modules with the version marker', () => {
    const refs = localReferences('app.js', /from '([^']+)'/g);
    assert.ok(refs.length >= 1);
    for (const ref of refs) assert.match(ref, /\?v=dev$/, ref);
});
