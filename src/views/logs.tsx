import { raw } from "hono/html";
import { displayName } from "../helpers/devices";
import type { Device } from "../types";
import { Layout } from "./layout";

export const LogsPage = (props: { devices: Device[]; device: string }) => (
  <Layout title="Teapot · Logs">
    <main>
      <a class="back" href="/">
        ← All devices
      </a>
      <header>
        <h1>Mesh logs</h1>
        <span id="state" class="muted">
          Connecting…
        </span>
      </header>
      <div class="actions-bar">
        <select id="device" aria-label="Device">
          <option value="">All devices</option>
          <option value="control" selected={props.device === "control"}>
            Control
          </option>
          {props.devices.map((d) => (
            <option value={d.node_id} selected={props.device === d.node_id}>
              {displayName(d)}
            </option>
          ))}
        </select>
        <select id="level" aria-label="Minimum level">
          <option>debug</option>
          <option>info</option>
          <option>warn</option>
          <option>error</option>
        </select>
        <input
          id="search"
          placeholder="Filter messages…"
          aria-label="Search logs"
        />
        <button id="pause" type="button">
          Pause
        </button>
        <button id="copy" type="button">
          Copy visible logs
        </button>
      </div>
      <pre
        id="output"
        class="card"
        style="padding:16px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:75vh;overflow-y:auto"
      />
      <p class="muted small">
        Latest 1,000 displayed · control retains up to 10,000 events / 7 days ·
        timestamps are device time
      </p>
      <script>
        {raw(`(() => {
        const $ = id => document.getElementById(id);
        let socket, retry, ping, cursor = 0, entries = [], paused = false, heard = Date.now(), generation = 0;
        const names = new Map([...$('device').options].map(o => [o.value, o.text]));
        function render() {
          const q = $('search').value.toLowerCase();
          $('output').textContent = entries.map(e => new Date(e.timestamp).toISOString() + ' ' + e.level.toUpperCase() + ' [' + (names.get(e.node_id) || e.node_id.slice(0,8)) + '] ' + e.source + ': ' + e.message).filter(s => s.toLowerCase().includes(q)).join('\\n');
          $('output').scrollTop = $('output').scrollHeight;
        }
        function connect(reset = false) {
          const gen = ++generation;
          clearTimeout(retry); clearInterval(ping); if (socket) socket.close();
          if (reset) { cursor = 0; entries = []; render(); }
          if (paused) return;
          const params = new URLSearchParams({device: $('device').value, level: $('level').value});
          if (cursor) params.set('after', String(cursor));
          $('state').textContent = 'Connecting…';
          const ws = socket = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/admin/logs/stream?' + params);
          ws.onopen = () => {
            if (gen !== generation) return;
            heard = Date.now(); $('state').textContent = 'Live';
            ping = setInterval(() => { if (Date.now()-heard > 45000) ws.close(); else if (ws.readyState === 1) ws.send('ping'); }, 15000);
          };
          ws.onmessage = ev => {
            if (gen !== generation) return;
            heard = Date.now(); if (ev.data === 'pong') return;
            const msg = JSON.parse(ev.data);
            for (const e of msg.entries || []) if (e.cursor > cursor) { entries.push(e); cursor = e.cursor; }
            entries = entries.slice(-1000); render();
          };
          ws.onclose = () => {
            if (gen !== generation) return;
            clearInterval(ping); $('state').textContent = 'Disconnected · retrying (check login if this persists)';
            retry = setTimeout(() => connect(), 3000);
          };
        }
        $('device').onchange = $('level').onchange = () => connect(true);
        $('search').oninput = render;
        $('pause').onclick = () => { paused = !paused; $('pause').textContent = paused ? 'Resume' : 'Pause'; connect(); if (paused) $('state').textContent = 'Paused'; };
        $('copy').onclick = async () => { try { await navigator.clipboard.writeText($('output').textContent); } catch { $('state').textContent = 'Copy failed'; } };
        window.addEventListener('pagehide', () => { paused = true; connect(); });
        connect();
      })();`)}
      </script>
    </main>
  </Layout>
);
