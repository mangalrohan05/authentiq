/**
 * useRealtimeUpdates — Custom React hook for live dashboard updates.
 *
 * Strategy:
 *   1. Opens a single WebSocket connection to the backend /ws endpoint.
 *   2. Calls `onUpdate()` whenever a scan_update, batch_update, or
 *      product_update event is received — with a debounce guard to prevent
 *      rapid successive refreshes from causing a request storm.
 *   3. FALLBACK: If the WebSocket connection fails permanently after
 *      MAX_RECONNECT_ATTEMPTS, falls back to polling every
 *      `fallbackIntervalMs` milliseconds so dashboards never go stale.
 *
 * KEY FIX: `onUpdate` is stored in a ref so it never appears in the
 * useEffect dependency array. This prevents the effect from re-running
 * (and the WebSocket from reconnecting) on every render, which was the
 * primary cause of the reconnect storm and 429 errors.
 *
 * Usage:
 *   useRealtimeUpdates(fetchData);            // real-time, 30s fallback
 *   useRealtimeUpdates(fetchData, 30000);     // real-time, 30s fallback
 */

import { useEffect, useRef, useCallback, useState } from 'react';

const cleanBaseUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '');
const WS_BASE = cleanBaseUrl.replace(/^http/, 'ws');   // http://... → ws://...  |  https://... → wss://...

const RECONNECT_DELAY_BASE_MS = 3000;  // initial reconnect wait
const MAX_RECONNECT_ATTEMPTS = 5;      // give up after 5 consecutive failures
const UPDATE_DEBOUNCE_MS = 2000;       // minimum ms between onUpdate() calls from WS events

export function useRealtimeUpdates(
  onUpdate: () => void,
  fallbackIntervalMs: number = 30_000,
  enabled: boolean = true
) {
  const [status, setStatus] = useState<'connected' | 'reconnecting' | 'offline'>('offline');

  // Store onUpdate in a ref so it never triggers the effect to re-run.
  // This is the critical fix — onUpdate (fetchData) is recreated on every
  // render, but storing it in a ref means the effect only runs once.
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fallbackTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMounted = useRef(false);
  const lastUpdateTime = useRef(0); // debounce guard

  // Stable debounced update caller — never changes identity
  const triggerUpdate = useCallback(() => {
    const now = Date.now();
    if (now - lastUpdateTime.current < UPDATE_DEBOUNCE_MS) return;
    lastUpdateTime.current = now;
    onUpdateRef.current();
  }, []);

  useEffect(() => {
    if (!enabled) {
      setStatus('offline');
      return;
    }

    isMounted.current = true;

    function startFallbackPolling() {
      if (fallbackTimer.current) return; // already running
      console.warn('[Authentiq WS] Falling back to polling every', fallbackIntervalMs, 'ms.');
      fallbackTimer.current = setInterval(() => {
        if (isMounted.current) triggerUpdate();
      }, fallbackIntervalMs);
    }

    function stopFallbackPolling() {
      if (fallbackTimer.current) {
        clearInterval(fallbackTimer.current);
        fallbackTimer.current = null;
      }
    }

    function cancelPendingReconnect() {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    }

    function startHeartbeat(ws: WebSocket) {
      stopHeartbeat();
      heartbeatTimerRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: 'ping' }));
          } catch (err) {
            console.warn('[Authentiq WS] Failed to send heartbeat ping:', err);
          }
        }
      }, 10000); // 10s heartbeat
    }

    function stopHeartbeat() {
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
    }

    function connect() {
      if (!isMounted.current) return;

      // Guard: never open a second connection if one is already open/connecting
      if (wsRef.current && wsRef.current.readyState < WebSocket.CLOSING) {
        return;
      }

      setStatus('reconnecting');
      try {
        // Dynamically resolve WS base using current page host to support LAN IPs (e.g. 192.168.x.x) or domain names
        let finalWsBase = WS_BASE;
        if (typeof window !== 'undefined') {
          const isHttps = window.location.protocol === 'https:';
          const defaultHost = window.location.hostname ? `${window.location.hostname}:8000` : 'localhost:8000';
          const apiHost = process.env.NEXT_PUBLIC_API_URL
            ? process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '').replace(/^http[s]?:\/\//, '')
            : defaultHost;
          finalWsBase = `${isHttps ? 'wss' : 'ws'}://${apiHost}`;
        }
        const ws = new WebSocket(`${finalWsBase}/ws`);
        wsRef.current = ws;

        ws.onopen = () => {
          console.info('[Authentiq WS] Connected.');
          setStatus('connected');
          reconnectAttempts.current = 0;
          stopFallbackPolling(); // WS is healthy; stop fallback polling
          startHeartbeat(ws);
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'pong') {
              // Heartbeat pong received - keepalive success
              return;
            }
            const relevantTypes = ['scan_update', 'batch_update', 'product_update'];
            if (relevantTypes.includes(msg.type)) {
              triggerUpdate(); // debounced — will not hammer the API
            }
          } catch {
            // Ignore unparseable messages
          }
        };

        ws.onerror = () => {
          // onerror is always followed by onclose, so we handle reconnect there
          console.warn('[Authentiq WS] Connection error.');
        };

        ws.onclose = () => {
          console.warn('[Authentiq WS] Disconnected.');
          wsRef.current = null;
          stopHeartbeat();

          if (!isMounted.current) return;

          reconnectAttempts.current += 1;

          if (reconnectAttempts.current <= MAX_RECONNECT_ATTEMPTS) {
            setStatus('reconnecting');
            // Exponential backoff: 3s, 6s, 12s, 24s, 48s
            const delay = RECONNECT_DELAY_BASE_MS * Math.pow(2, reconnectAttempts.current - 1);
            console.info(`[Authentiq WS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current}/${MAX_RECONNECT_ATTEMPTS})...`);
            reconnectTimerRef.current = setTimeout(connect, delay);
          } else {
            console.warn('[Authentiq WS] Max reconnect attempts reached. Switching to polling.');
            setStatus('offline');
            startFallbackPolling();
          }
        };
      } catch {
        // WebSocket API unavailable (e.g., SSR environment)
        setStatus('offline');
        startFallbackPolling();
      }
    }

    connect();

    return () => {
      isMounted.current = false;
      cancelPendingReconnect();
      stopHeartbeat();
      // Close cleanly without triggering another reconnect
      if (wsRef.current) {
        const ws = wsRef.current;
        ws.onclose = null;
        ws.onmessage = null;
        ws.onerror = null;
        
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.onopen = () => {
            try {
              ws.close();
            } catch {
              // ignore
            }
          };
        } else {
          try {
            ws.close();
          } catch {
            // ignore
          }
        }
        wsRef.current = null;
      }
      stopFallbackPolling();
    };

    // INTENTIONALLY omitting `onUpdate` and `triggerUpdate` from deps.
    // `enabled` and `fallbackIntervalMs` are the only legitimate triggers
    // for restarting the entire connection lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, fallbackIntervalMs]);

  return { status };
}
