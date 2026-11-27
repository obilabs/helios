/**
 * The assistant may only suggest commands the Developer Console accepts.
 * Each command in the list is checked against the console source.
 */
import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONSOLE_COMMANDS,
  COMMANDS_PLACEHOLDER,
  commandReference,
  fillPrompt,
} from '../knowledge/console-commands.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, '..', '..', '..');
const consoleSource = fs.readFileSync(
  path.join(repo, 'frontend', 'src', 'pages', 'DeveloperConsole.tsx'),
  'utf8'
);
const routeSource = fs.readFileSync(path.join(here, '..', 'routes', 'ai.routes.ts'), 'utf8');

const all = CONSOLE_COMMANDS.flatMap((g) => g.commands.map((c) => c.command));

describe('assistant command list', () => {
  it('has no duplicates', () => {
    expect(new Set(all).size).toBe(all.length);
  });

  it.each(all.filter((c) => c.startsWith('gw ')))('"%s" is a command the console handles', (command) => {
    const [, noun, verb] = command.split(/\s+/);
    expect(consoleSource).toContain(`case '${noun}'`);
    // `gw offboard <email>` has no verb: the word after the noun is an argument.
    if (verb && !verb.startsWith('<')) {
      expect(consoleSource).toContain(`case '${verb}'`);
    }
  });

  it.each(
    all.flatMap((c) => (c.match(/--[A-Za-z-]+/g) || []).map((flag) => [c, flag.slice(2)] as const))
  )('"%s": the console reads --%s', (_command, flag) => {
    expect(consoleSource).toMatch(new RegExp(`['"\`.]${flag}['"\`\\]=\\s)]|params\\.${flag}\\b|--${flag}\\b`));
  });

  it.each(all.filter((c) => c.startsWith('csv ')))('"%s" is a command the console handles', (command) => {
    const [, action] = command.split(/\s+/);
    expect(consoleSource).toContain("case 'csv'");
    expect(consoleSource).toContain(`case '${action}'`);
  });

  it('does not offer a command to count things', () => {
    expect(all.some((c) => /\bcount\b/.test(c))).toBe(false);
    expect(commandReference()).toContain('no command to count');
  });
});

describe('assistant prompt', () => {
  it('fills the placeholder with the command list', () => {
    const filled = fillPrompt(`Intro\n${COMMANDS_PLACEHOLDER}\nOutro`);
    expect(filled).not.toContain(COMMANDS_PLACEHOLDER);
    expect(filled).toContain('gw users list');
    expect(filled.startsWith('Intro')).toBe(true);
  });

  it('leaves a prompt without the placeholder as written', () => {
    expect(fillPrompt('Only this.')).toBe('Only this.');
  });

  it('keeps no second command list in the route file', () => {
    expect(routeSource).not.toMatch(/gw users (suspend|create|restore) </);
    expect(routeSource.split('${COMMANDS_PLACEHOLDER}').length - 1).toBe(2);
  });
});
