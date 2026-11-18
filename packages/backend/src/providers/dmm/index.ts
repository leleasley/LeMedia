import axios from 'axios';
import type { Provider } from '../types.js';

export const dmmProvider: Provider = {
  service: {
    id: 'dmm', label: 'Debrid Media Manager', icon: '/providers/dmm.png', category: 'arr',
    fields: [{ key: 'apiKey', labelKey: 'common.api_key', type: 'password' }],
    async test(config) {
      if (!config.apiKey?.trim()) throw new Error('API key required');
      const { data } = await axios.get('https://debridmediamanager.com/api/metadata/tmdb:movie:603', {
        params: { sources: 'tmdb' }, headers: { 'X-API-Key': config.apiKey.trim() }, timeout: 12000, maxRedirects: 0,
      });
      if (!data || typeof data !== 'object' || !data.ids) throw new Error('Unexpected DMM response');
      return { ok: true };
    },
  },
};
