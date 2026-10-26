import { raw } from "hono/html";
import { displayName } from "../helpers/devices";
import type { Device, OnlineDevice } from "../types";
import { Layout } from "./layout";

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

const bytes = (n: number) => {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
};

/** One line per peer: current path (if connected) and tunnel bytes. */
const Links = (props: {
  live: OnlineDevice | undefined;
  names: Map<string, string>;
}) => {
  const paths = props.live?.paths ?? [];
  const traffic = new Map((props.live?.traffic ?? []).map((t) => [t.peer, t]));
  const peers = [...new Set([...paths.map((p) => p.peer), ...traffic.keys()])];
  if (peers.length === 0) return <span class="muted">—</span>;
  return (
    <>
      {peers.map((peer) => {
        const path = paths.find((p) => p.peer === peer);
        const t = traffic.get(peer);
        return (
          <div class={`path ${path?.kind ?? ""}`}>
            → {props.names.get(peer) ?? peer.slice(0, 8)}
            {path
              ? `: ${path.kind}${path.rtt_ms >= 0 ? ` ${path.rtt_ms}ms` : ""}`
              : ""}
            {t && (
              <span class="muted">
                {" "}
                · ↑{bytes(t.tx)} ↓{bytes(t.rx)}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
};

const Action = (props: {
  path: string;
  label: string;
  kind?: string;
  back?: string;
  confirm?: string;
}) => (
  <form
    method="post"
    action={props.path}
    onsubmit={
      props.confirm
        ? `return confirm(${JSON.stringify(props.confirm)})`
        : undefined
    }
  >
    {props.back && <input type="hidden" name="back" value={props.back} />}
    <button class={props.kind ?? ""} type="submit">
      {props.label}
    </button>
  </form>
);

/** ⋯ menu: everything that is not the row's main action. */
const RowMenu = (props: { d: Device }) => {
  const { d } = props;
  const base = `/admin/devices/${d.node_id}`;
  return (
    <details class="menu">
      <summary aria-label="More actions">⋯</summary>
      <div class="menu-items">
        <a href={`/devices/${d.node_id}`}>Details</a>
        <a href={`/devices/${d.node_id}#rename`}>Rename…</a>
        {d.status === "approved" && (
          <Action path={`${base}/revoke`} label="Revoke" />
        )}
        <Action
          path={`${base}/delete`}
          label="Remove"
          kind="danger"
          confirm={`Remove ${displayName(d)}? It has to log in and be approved again.`}
        />
      </div>
    </details>
  );
};

export { Action, ago, bytes, Links };

export const DeviceRows = (props: {
  devices: Device[];
  online: OnlineDevice[];
}) => {
  const online = new Map(props.online.map((o) => [o.node_id, o]));
  const names = new Map(props.devices.map((d) => [d.node_id, displayName(d)]));
  if (props.devices.length === 0) {
    return (
      <tr>
        <td colspan={7} class="empty">
          No devices yet. A device appears here after its first{" "}
          <code>teapot</code> login.
        </td>
      </tr>
    );
  }
  return (
    <>
      {props.devices.map((d) => {
        const live = online.get(d.node_id);
        const base = `/admin/devices/${d.node_id}`;
        return (
          <tr>
            <td>
              <a class="device" href={`/devices/${d.node_id}`}>
                <strong>{displayName(d)}</strong>
              </a>
              <div class="muted small">
                {d.alias && d.name ? `${d.name} · ` : ""}
                <code>{d.node_id.slice(0, 8)}</code>
              </div>
            </td>
            <td>
              {d.platform || <span class="muted">—</span>}
              {d.model && <div class="muted small">{d.model}</div>}
            </td>
            <td>
              <span class={`pill ${d.status}`}>{d.status}</span>
            </td>
            <td>
              <span class={`dot ${live ? "on" : ""}`} />
              {live ? (
                "online"
              ) : (
                <span class="muted">{ago(d.last_seen_at)}</span>
              )}
              <div>
                <code class="muted">
                  {d.public_ipv4 ?? d.public_ipv6 ?? d.last_ip ?? ""}
                </code>
              </div>
            </td>
            <td>
              {d.can_exit ? (
                <Action
                  path={`${base}/exit`}
                  label={d.exit_enabled ? "exit: on" : "exit: off"}
                  kind={d.exit_enabled ? "primary" : undefined}
                />
              ) : (
                <span class="muted">not capable</span>
              )}
            </td>
            <td>
              <Links live={live} names={names} />
            </td>
            <td class="row-actions">
              {d.status === "pending" && (
                <Action
                  path={`${base}/approve`}
                  label="Approve"
                  kind="primary"
                />
              )}
              <RowMenu d={d} />
            </td>
          </tr>
        );
      })}
    </>
  );
};

// Re-renders only the table body every 5 s; forms keep working in between.
// Skipped while a ⋯ menu is open, or the refresh would close it under you.
// Menus are position:fixed so the table's scroll box does not clip them.
const poll = `
document.addEventListener("toggle", (e) => {
  const d = e.target;
  if (!(d instanceof HTMLDetailsElement) || !d.classList.contains("menu") || !d.open) return;
  document.querySelectorAll("details.menu[open]").forEach((o) => { if (o !== d) o.open = false; });
  const r = d.querySelector("summary").getBoundingClientRect();
  const m = d.querySelector(".menu-items");
  m.style.top = (r.bottom + 4) + "px";
  m.style.right = (window.innerWidth - r.right) + "px";
}, true);
document.addEventListener("click", (e) => {
  if (!e.target.closest("details.menu")) document.querySelectorAll("details.menu[open]").forEach((o) => { o.open = false; });
});
setInterval(async () => {
  if (document.querySelector("details.menu[open]")) return;
  try {
    const res = await fetch("/?partial=rows", { headers: { accept: "text/html" } });
    if (res.redirected) return location.reload();
    if (res.ok) document.getElementById("rows").innerHTML = await res.text();
  } catch {}
}, 5000);
`;

export const DashboardPage = (props: {
  devices: Device[];
  online: OnlineDevice[];
}) => (
  <Layout title="Teapot · Devices">
    <main>
      <header>
        <h1>
          🫖 Teapot
          <span>
            {props.online.length} online · {props.devices.length} devices
          </span>
        </h1>
        <form method="post" action="/logout">
          <button type="submit">Sign out</button>
        </form>
      </header>
      <div class="card">
        <table>
          <thead>
            <tr>
              <th>Device</th>
              <th>Platform</th>
              <th>Status</th>
              <th>Presence</th>
              <th>Exit node</th>
              <th>Links · since agent start</th>
              <th />
            </tr>
          </thead>
          <tbody id="rows">
            <DeviceRows devices={props.devices} online={props.online} />
          </tbody>
        </table>
      </div>
    </main>
    <script>{raw(poll)}</script>
  </Layout>
);
