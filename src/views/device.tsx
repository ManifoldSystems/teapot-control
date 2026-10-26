import { displayName } from "../helpers/devices";
import type { Device, OnlineDevice } from "../types";
import { Action, ago, Links } from "./dashboard";
import { Layout } from "./layout";

/** Everything about one device, plus rename and the less common actions. */
export const DevicePage = (props: {
  d: Device;
  live: OnlineDevice | undefined;
  names: Map<string, string>;
  error?: string;
}) => {
  const { d, live } = props;
  const base = `/admin/devices/${d.node_id}`;
  const back = `/devices/${d.node_id}`;
  return (
    <Layout title={`Teapot · ${displayName(d)}`}>
      <main>
        <a class="back" href="/">
          ← All devices
        </a>
        <header>
          <h1>
            {displayName(d)}
            <span>
              <span class={`pill ${d.status}`}>{d.status}</span>{" "}
              <span class={`dot ${live ? "on" : ""}`} />
              {live ? "online" : `seen ${ago(d.last_seen_at)}`}
            </span>
          </h1>
        </header>

        <div class="card">
          <dl class="kv">
            <dt>Alias</dt>
            <dd>{d.alias ?? <span class="muted">—</span>}</dd>
            <dt>Device name</dt>
            <dd>{d.name ?? <span class="muted">—</span>}</dd>
            <dt>Platform</dt>
            <dd>
              {d.platform ?? "—"}
              {d.model ? ` · ${d.model}` : ""}
            </dd>
            <dt>Endpoint id</dt>
            <dd>
              <code>{d.node_id}</code>
            </dd>
            <dt>Public IPv4</dt>
            <dd>
              <code>{d.public_ipv4 ?? "—"}</code>
            </dd>
            <dt>Public IPv6</dt>
            <dd>
              <code>{d.public_ipv6 ?? "—"}</code>
            </dd>
            <dt>Seen by control</dt>
            <dd>
              <code>{d.last_ip ?? "—"}</code>
            </dd>
            <dt>Online since</dt>
            <dd>
              {live ? live.connected_at.replace("T", " ").slice(0, 19) : "—"}
            </dd>
            <dt>Added</dt>
            <dd>{d.created_at.replace("T", " ").replace("Z", "")}</dd>
            <dt>Exit</dt>
            <dd>
              {d.can_exit
                ? d.exit_enabled
                  ? "on"
                  : "offered, off"
                : "not offered"}
            </dd>
            <dt>Links</dt>
            <dd>
              <Links live={live} names={props.names} />
            </dd>
          </dl>
        </div>

        <div class="section" id="rename">
          <h2>Alias</h2>
          <div class="card">
            <form class="inline-form" method="post" action={`${base}/alias`}>
              <input type="hidden" name="back" value={back} />
              <input
                name="alias"
                value={d.alias ?? ""}
                placeholder={d.name ?? "e.g. oppo-tsel"}
                pattern="[A-Za-z0-9][A-Za-z0-9._-]{0,63}"
                title="letters, digits, dot, dash, underscore"
              />
              <button class="primary" type="submit">
                Save
              </button>
              <span class="muted small" style="align-self:center">
                Used in the dashboard, <code>--exit</code> and <code>via=</code>
                . Empty clears it.
              </span>
            </form>
            {props.error && (
              <p class="err" style="padding:0 16px 16px">
                {props.error}
              </p>
            )}
          </div>
        </div>

        <div class="section">
          <h2>Actions</h2>
          <div class="card actions-bar">
            {d.status === "pending" ? (
              <Action
                path={`${base}/approve`}
                label="Approve"
                kind="primary"
                back={back}
              />
            ) : (
              <Action path={`${base}/revoke`} label="Revoke" back={back} />
            )}
            {d.can_exit === 1 && (
              <Action
                path={`${base}/exit`}
                label={d.exit_enabled ? "Turn exit off" : "Turn exit on"}
                back={back}
              />
            )}
            <Action
              path={`${base}/delete`}
              label="Remove"
              kind="danger"
              confirm={`Remove ${displayName(d)}? It has to log in and be approved again.`}
            />
          </div>
        </div>
      </main>
    </Layout>
  );
};
