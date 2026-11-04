import { afterEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import * as plexClient from '../src/providers/plex/client.js';
import { plexCreatePin } from '../src/providers/plex/index.js';

afterEach(() => { vi.restoreAllMocks(); });

describe('Plex sign-in branding', () => {
  it('uses LeMedia on the approval screen while keeping the existing client identity', async () => {
    const createPin = vi.spyOn(plexClient, 'createPlexPin').mockResolvedValue({ id: 42, code: 'example-pin' });
    const { authUrl } = await plexCreatePin();
    const parameters = new URLSearchParams(new URL(authUrl).hash.slice(2));
    expect(parameters.get('context[device][product]')).toBe('LeMedia');
    expect(parameters.get('clientID')).toBe('lemedia-client');
    expect(createPin).toHaveBeenCalledWith('lemedia-client');
  });

  it('identifies the product as LeMedia when requesting a Plex PIN', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { id: 42, code: 'example-pin' } });
    await plexClient.createPlexPin('lemedia-client');
    expect(post.mock.calls[0][2]?.headers).toMatchObject({ 'X-Plex-Product': 'LeMedia', 'X-Plex-Client-Identifier': 'lemedia-client' });
  });
});
