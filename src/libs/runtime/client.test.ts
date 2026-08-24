/**
 * Where the user's own API key is allowed to travel.
 *
 * cvitae forwards a key entered in Settings to cvitae-agent-runtime, which
 * spends it for the one call. That is what makes the settings field work for
 * the capabilities that exist only in the runtime — but it puts a credential on
 * the wire, and the only place that can judge the wire is here, before the
 * request is sent. These tests pin that judgement in both directions: what may
 * carry a key, and that a key with nowhere safe to go is dropped rather than
 * sent, with the caller told to refuse instead of delegating.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  clientKeyBlocksDelegation,
  runtimeAcceptsCredentials,
  toRuntimeModel
} from './client';

const originalUrl = process.env.RUNTIME_URL;

const withRuntimeUrl = (value: string | undefined) => {
  if (value === undefined) delete process.env.RUNTIME_URL;
  else process.env.RUNTIME_URL = value;
};

afterEach(() => withRuntimeUrl(originalUrl));

const settings = { providerId: 'openai', modelId: 'gpt-4o-mini', apiKey: 'sk-user' };

describe('runtimeAcceptsCredentials', () => {
  it('accepts loopback and TLS, and nothing else', () => {
    // Unset is the default runtime on loopback, which is the ordinary case and
    // the one the whole arrangement is built for.
    withRuntimeUrl(undefined);
    expect(runtimeAcceptsCredentials()).toBe(true);

    for (const url of [
      'http://127.0.0.1:8788',
      'http://localhost:8788',
      'http://[::1]:8788',
      'https://runtime.example.com'
    ]) {
      withRuntimeUrl(url);
      expect(runtimeAcceptsCredentials(), url).toBe(true);
    }

    for (const url of ['http://runtime.example.com', 'http://192.168.1.20:8788']) {
      withRuntimeUrl(url);
      expect(runtimeAcceptsCredentials(), url).toBe(false);
    }
  });

  it('treats an empty or unparseable RUNTIME_URL as no destination', () => {
    // Empty means the runtime is switched off; a malformed value means nobody
    // knows where the key would go. Neither is a place to send a secret.
    withRuntimeUrl('');
    expect(runtimeAcceptsCredentials()).toBe(false);

    withRuntimeUrl('not a url');
    expect(runtimeAcceptsCredentials()).toBe(false);
  });
});

describe('toRuntimeModel', () => {
  it('forwards the key when the connection can carry it', () => {
    withRuntimeUrl('http://127.0.0.1:8788');

    expect(toRuntimeModel(settings, 'main')).toMatchObject({
      providerId: 'openai',
      modelId: 'gpt-4o-mini',
      apiKey: 'sk-user'
    });
    expect(clientKeyBlocksDelegation(settings)).toBe(false);
  });

  it('drops the key over plain HTTP to another machine, and blocks the call', () => {
    withRuntimeUrl('http://runtime.example.com');

    expect(toRuntimeModel(settings, 'main')?.apiKey).toBeUndefined();
    // The pair is the point. Dropping the key on its own would leave the run to
    // be answered on the server's credential — spending someone else's quota
    // while the user believed they were spending their own — so the caller has
    // to refuse rather than send a request the key fell out of.
    expect(clientKeyBlocksDelegation(settings)).toBe(true);
  });

  it('says nothing about credentials when the user has not set one', () => {
    withRuntimeUrl('http://runtime.example.com');

    const model = toRuntimeModel({ providerId: 'local' }, 'main');

    expect(model?.apiKey).toBeUndefined();
    // Nothing to protect, so nothing is blocked: the runtime answers on its own
    // key exactly as it did before any of this existed.
    expect(clientKeyBlocksDelegation({ providerId: 'local' })).toBe(false);
  });
});
