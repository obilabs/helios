import { describe, it, expect } from '@jest/globals';
import { validateLlmEndpoint, LlmEndpointError } from '../lib/llm-endpoint.js';

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
