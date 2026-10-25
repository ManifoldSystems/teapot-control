import type { Device } from "../types";
import { Layout } from "./layout";

type State = "confirm" | "added" | "already" | "missing";

export const ApprovePage = (props: {
  nodeId: string;
  device: Device | null;
  state: State;
}) => {
  const d = props.device;
  const name = d?.name || "unnamed device";
  const code = props.nodeId.slice(0, 8);
  return (
    <Layout title="Teapot · Add device">
      <main>
        <div class="card login">
          <h1>🫖 Teapot</h1>
          {props.state === "missing" && (
            <p>
              No device with code <code>{code}</code> has logged in. Run{" "}
              <code>teapot login</code> again on it.
            </p>
          )}
          {props.state === "already" && (
            <p>
              <strong>{name}</strong> is already in your mesh.
            </p>
          )}
          {props.state === "added" && (
            <p>
              <strong>{name}</strong> was added. The device continues on its
              own; you can close this tab.
            </p>
          )}
          {props.state === "confirm" && d && (
            <>
              <p>Add this device to your mesh?</p>
              <table>
                <tbody>
                  <tr>
                    <th>Name</th>
                    <td>{name}</td>
                  </tr>
                  <tr>
                    <th>Platform</th>
                    <td>{d.platform ?? "—"}</td>
                  </tr>
                  <tr>
                    <th>Code</th>
                    <td>
                      <code>{code}</code>
                    </td>
                  </tr>
                  <tr>
                    <th>From IP</th>
                    <td>
                      <code>{d.last_ip ?? "—"}</code>
                    </td>
                  </tr>
                </tbody>
              </table>
              <p class="muted">
                Check that the code matches what <code>teapot login</code>{" "}
                printed.
              </p>
              <form method="post" action={`/approve/${props.nodeId}`}>
                <button class="primary" type="submit">
                  Add device
                </button>
              </form>{" "}
              <a href="/">
                <button type="button">Cancel</button>
              </a>
            </>
          )}
          {props.state !== "confirm" && (
            <p>
              <a href="/">Go to dashboard</a>
            </p>
          )}
        </div>
      </main>
    </Layout>
  );
};
