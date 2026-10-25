import { raw } from "hono/html";
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

const Action = (props: { path: string; label: string; kind?: string }) => (
  <form method="post" action={props.path}>
    <button class={props.kind ?? ""} type="submit">
      {props.label}
    </button>
  </form>
);

export const DeviceRows = (props: {
  devices: Device[];
  online: OnlineDevice[];
}) => {
  const online = new Map(props.online.map((o) => [o.node_id, o]));
  const names = new Map(
    props.devices.map((d) => [d.node_id, d.name || d.node_id.slice(0, 8)])
  );
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
              <strong>{d.name || "unnamed"}</strong>
              <div>
                <code class="muted" title={d.node_id}>
                  {d.node_id.slice(0, 16)}…
                </code>
              </div>
            </td>
            <td>{d.platform || <span class="muted">—</span>}</td>
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
                <code class="muted">{d.last_ip ?? ""}</code>
              </div>
            </td>
            <td>
              {d.can_exit ? (
                d.exit_enabled ? (
                  <Action
                    path={`${base}/exit`}
                    label="exit: on"
                    kind="primary"
                  />
                ) : (
                  <Action path={`${base}/exit`} label="exit: off" />
                )
              ) : (
                <span class="muted">not capable</span>
              )}
            </td>
            <td>
              {live?.paths.length ? (
                live.paths.map((p) => (
                  <div class={`path ${p.kind}`}>
                    → {names.get(p.peer) ?? p.peer.slice(0, 8)}: {p.kind}{" "}
                    {p.rtt_ms}ms
                  </div>
                ))
              ) : (
                <span class="muted">—</span>
              )}
            </td>
            <td>
              {d.status === "pending" ? (
                <Action
                  path={`${base}/approve`}
                  label="Approve"
                  kind="primary"
                />
              ) : (
                <Action path={`${base}/revoke`} label="Revoke" />
              )}{" "}
              <Action path={`${base}/delete`} label="Remove" kind="danger" />
            </td>
          </tr>
        );
      })}
    </>
  );
};

// Re-renders only the table body every 5 s; forms keep working in between.
const poll = `
setInterval(async () => {
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
              <th>Paths</th>
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
