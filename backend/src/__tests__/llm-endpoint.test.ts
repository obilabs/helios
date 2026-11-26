import { describe, it, expect } from '@jest/globals';
import {
  validateLlmEndpoint,
  LlmEndpointError,
  chatBaseUrl,
  isUnreachable,
  unreachableMessage,
} from '../lib/llm-endpoint.js';

describe('validateLlmEndpoint', () => {
  it.each([
    ['http://localhost:11434/v1', 'http://localhost:11434/v1'],
    ['http://192.168.1.20:11434/v1/', 'http://192.168.1.20:11434/v1'],
    ['https://api.openai.com/v1', 'https://api.openai.com/v1'],
    ['  https://llm.example.com  ', 'https://llm.example.com'],
  ])('accepts %s', (raw, expected) => {
    expect(validateLlmEndpoint(raw)).toBe(expected);
  });

  it('drops query strings and fragments', () => {
    expect(validateLlmEndpoint('http://localhost:11434/v1?x=1#y')).toBe('http://localhost:11434/v1');
  });

  it.each([
    ['', 'required'],
    ['not a url', 'valid URL'],
    ['file:///etc/passwd', 'http or https'],
    ['ftp://host/x', 'http or https'],
    ['http://user:pass@host/v1', 'credentials'],
    ['http://169.254.169.254/latest/meta-data', 'not allowed'],
    ['http://[fe80::1]/v1', 'not allowed'],
    ['http://metadata.google.internal/computeMetadata/v1', 'not allowed'],
  ])('rejects %s', (raw, message) => {
    expect(() => validateLlmEndpoint(raw)).toThrow(LlmEndpointError);
    expect(() => validateLlmEndpoint(raw)).toThrow(new RegExp(message));
  });

  it('rejects non-strings', () => {
    expect(() => validateLlmEndpoint(undefined)).toThrow(LlmEndpointError);
    expect(() => validateLlmEndpoint(42)).toThrow(LlmEndpointError);
  });
});

describe('chatBaseUrl', () => {
  it.each([
    ['http://localhost:11434', 'http://localhost:11434/v1'],
    ['http://192.168.1.20:11434/', 'http://192.168.1.20:11434/v1'],
  ])('adds /v1 to an address with no path: %s', (raw, expected) => {
    expect(chatBaseUrl(validateLlmEndpoint(raw))).toBe(expected);
  });

  it.each([
    ['http://localhost:11434/v1', 'http://localhost:11434/v1'],
    ['https://api.openai.com/v1', 'https://api.openai.com/v1'],
    ['https://gateway.example.com/openai/deployments/x', 'https://gateway.example.com/openai/deployments/x'],
  ])('leaves an address with a path alone: %s', (raw, expected) => {
    expect(chatBaseUrl(validateLlmEndpoint(raw))).toBe(expected);
  });
});

describe('isUnreachable / unreachableMessage', () => {
  it('recognises the errors fetch raises when nothing answers', () => {
    expect(isUnreachable(new TypeError('fetch failed'))).toBe(true);
    expect(isUnreachable(Object.assign(new Error('x'), { cause: { code: 'ECONNREFUSED' } }))).toBe(true);
    expect(isUnreachable(new Error('Failed to list models from http://h:9: fetch failed'))).toBe(true);
  });

  it('does not treat an answer from the server as unreachable', () => {
    expect(isUnreachable(new Error('HTTP 404: page not found'))).toBe(false);
    expect(isUnreachable(undefined)).toBe(false);
  });

  it('names the address and says where it must be reachable from', () => {
    const text = unreachableMessage('http://10.0.0.5:11434/v1');
    expect(text).toContain('http://10.0.0.5:11434');
    expect(text).toContain('the server Helios runs on');
  });
});

