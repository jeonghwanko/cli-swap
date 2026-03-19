import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as display from './display.js';

describe('exitWithError', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('EXIT'); });
  });

  it('outputs JSON when json=true', () => {
    const logSpy = vi.spyOn(console, 'log');
    try {
      display.exitWithError('test error', true);
    } catch {
      // process.exit mock throws
    }
    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify({ status: 'failed', error: 'test error' }, null, 2),
    );
  });

  it('outputs to stderr when json=false', () => {
    const errSpy = vi.spyOn(console, 'error');
    try {
      display.exitWithError('test error', false);
    } catch {
      // process.exit mock throws
    }
    expect(errSpy).toHaveBeenCalled();
  });

  it('calls process.exit(1)', () => {
    const exitSpy = vi.spyOn(process, 'exit');
    try {
      display.exitWithError('test', false);
    } catch {
      // mock throws
    }
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe('jsonOutput', () => {
  it('outputs formatted JSON to stdout', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    display.jsonOutput({ foo: 'bar' });
    expect(logSpy).toHaveBeenCalledWith(JSON.stringify({ foo: 'bar' }, null, 2));
  });
});
