import type { InternalAxiosRequestConfig } from "axios";
import axios from "axios";
import http from "http";
import https from "https";

let keepAliveInitialized = false;

function ensureKeepAliveAgents() {
  if (keepAliveInitialized) return;
  const httpAgent = new http.Agent({
    keepAlive: true,
    maxSockets: 100,
    maxFreeSockets: 20,
    timeout: 60000
  });
  const httpsAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 100,
    maxFreeSockets: 20,
    timeout: 60000
  });
  axios.defaults.httpAgent = httpAgent;
  axios.defaults.httpsAgent = httpsAgent;
  keepAliveInitialized = true;
}

export function requestInterceptorFunction(config: InternalAxiosRequestConfig) {
  ensureKeepAliveAgents();
  return config;
}
