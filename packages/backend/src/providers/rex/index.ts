import axios from 'axios';
import type { Provider } from '../types.js';

export const rexProvider: Provider = {
  service: {
    id: 'rex', label: 'REX', icon: '/providers/plex.png', category: 'monitoring',
    fields: [
      { key: 'url', labelKey: 'common.url', type: 'text', placeholder: 'http://127.0.0.1:32400' },
      { key: 'token', labelKey: 'common.token', type: 'password' },
    ],
    async test(config) {
      const { data } = await axios.get(`${config.url.replace(/\/+$/, '')}/library/sections`, {
        timeout: 5000, headers: { Accept: 'application/json', 'X-Plex-Token': config.token || '' },
      });
      if (!data?.MediaContainer || !Array.isArray(data.MediaContainer.Directory)) throw new Error('Invalid REX library response');
      return { ok: true };
    },
  },
};
