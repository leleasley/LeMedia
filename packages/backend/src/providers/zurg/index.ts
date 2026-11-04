import axios from 'axios';
import type { Provider } from '../types.js';
import { connFromConfig } from '../../services/zurg/client.js';

/** Zurg (debrid/usenet WebDAV + acquisition). Not an *arr: LeMedia only reads its acquisition
 *  status to mark titles available the moment zurg has placed them, and surfaces its health. */
export const zurgProvider: Provider = {
  service: {
    id: 'zurg',
    label: 'Zurg',
    icon: '/providers/zurg.png',
    category: 'monitoring',
    fields: [
      { key: 'url', labelKey: 'common.url', type: 'text', placeholder: 'http://10.0.0.10:9999' },
      { key: 'username', labelKey: 'common.username', type: 'text' },
      { key: 'password', labelKey: 'common.password', type: 'password' },
      // Optional: zurg's qBittorrent-compatible API key (zurg data/qbittorrent-apikey) — lets the
      // admin page show torrents still downloading on the debrid account.
      { key: 'qbittorrentApiKey', labelKey: 'admin.services.zurg_qbit_key', type: 'password' },
    ],
    async test(config) {
      const conn = connFromConfig(config);
      if (!conn) throw new Error('INVALID_URL');
      // A protected endpoint, so wrong credentials fail the test instead of passing on a public page.
      await axios.get(`${conn.base}/api/rclone/status`, { timeout: 5000, auth: conn.auth, validateStatus: (s) => s === 200 });
      const { data } = await axios.get<string>(`${conn.base}/http/version.txt`, { timeout: 5000, auth: conn.auth, responseType: 'text' }).catch(() => ({ data: '' }));
      const version = /version[:\s]+v?([\w.\-]+)/i.exec(String(data))?.[1];
      return { ok: true, version };
    },
  },
};
