import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { isValidTokenValue } from '../../controller/src/theme-tokens';

// Built-ins are silently dropped by the controller when any token is invalid.
// Exercise its real validator so a broken palette cannot ship unnoticed.
for (const finish of ['ivory', 'obsidian']) {
  test(`Enochian ${finish} can enter the controller theme registry`, () => {
    const path = new URL(`../../controller/src/themes/builtin/enochian-${finish}.json`, import.meta.url);
    const theme = JSON.parse(readFileSync(path, 'utf8'));
    for (const [key, value] of Object.entries(theme.tokens)) {
      assert.equal(isValidTokenValue(key, String(value)), true, `${key}: ${value}`);
    }
    assert.equal(theme.mode, finish === 'ivory' ? 'light' : 'dark');
    assert.equal(theme.tokens['--mono-font'], 'ibm-plex-mono');
  });
}
