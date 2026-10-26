import { raw } from "hono/html";
import type { Child } from "hono/jsx";

const css = `
:root{--bg:#faf8f5;--fg:#1d1b19;--muted:#77706a;--line:#e7e1da;--card:#fff;--accent:#2f6f5e;--warn:#a5651a;--bad:#a33a2c;--ok:#2e8b57}
@media (prefers-color-scheme:dark){:root{--bg:#171513;--fg:#ece7e1;--muted:#9a928a;--line:#2d2925;--card:#1f1c19;--accent:#6fbfa6;--warn:#e0a35a;--bad:#e07a6a;--ok:#5fc48c}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 ui-sans-serif,system-ui,-apple-system,sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px}
header{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:20px}
h1{font-size:20px;margin:0}h1 span{color:var(--muted);font-weight:400;font-size:14px;margin-left:8px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;overflow-x:auto}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top;white-space:nowrap}
th{font-size:12px;color:var(--muted);font-weight:500;text-transform:uppercase;letter-spacing:.04em}tr:last-child td{border-bottom:0}
code{font:12px ui-monospace,SFMono-Regular,Menlo,monospace}.muted{color:var(--muted)}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:var(--muted)}.dot.on{background:var(--ok)}
.pill{display:inline-block;padding:1px 8px;border-radius:99px;font-size:12px;border:1px solid var(--line)}.pill.pending{color:var(--warn);border-color:var(--warn)}.pill.approved{color:var(--accent);border-color:var(--accent)}
.path{font-size:12px}.path.relay{color:var(--warn)}.path.direct{color:var(--ok)}
form{display:inline}button{font:inherit;font-size:12px;padding:3px 10px;border-radius:6px;border:1px solid var(--line);background:transparent;color:var(--fg);cursor:pointer}button:hover{border-color:var(--fg)}button.primary{border-color:var(--accent);color:var(--accent)}button.danger{color:var(--bad)}
.empty{padding:32px;text-align:center;color:var(--muted)}
.login{max-width:340px;margin:12vh auto;padding:24px}.login input{width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg);font:inherit;margin:12px 0}
.err{color:var(--bad);font-size:13px}
.small{font-size:12px}
a.device{color:inherit;text-decoration:none}a.device:hover strong{text-decoration:underline}
td.row-actions{text-align:right;position:sticky;right:0;background:var(--card)}td.row-actions>form{display:inline-block;margin-right:6px}td.links{white-space:normal;min-width:180px}
details.menu{display:inline-block}
details.menu summary{list-style:none;cursor:pointer;padding:2px 9px;border:1px solid var(--line);border-radius:6px;font-weight:700;letter-spacing:1px;color:var(--muted)}
details.menu summary::-webkit-details-marker{display:none}
details.menu[open] summary,details.menu summary:hover{color:var(--fg);border-color:var(--fg)}
.menu-items{position:fixed;z-index:10;min-width:150px;background:var(--card);border:1px solid var(--line);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.18);padding:4px;display:flex;flex-direction:column}
.menu-items a,.menu-items button{display:block;width:100%;text-align:left;border:0;border-radius:6px;padding:7px 10px;font-size:13px;color:var(--fg);text-decoration:none;background:none}
.menu-items form{display:block}
.menu-items a:hover,.menu-items button:hover{background:var(--line)}
.menu-items button.danger{color:var(--bad)}
.back{color:var(--muted);text-decoration:none;font-size:13px}.back:hover{color:var(--fg)}
dl.kv{display:grid;grid-template-columns:max-content 1fr;gap:6px 18px;margin:0;padding:16px}
dl.kv dt{color:var(--muted);font-size:13px}dl.kv dd{margin:0;word-break:break-all}
.section{margin-top:16px}.section h2{font-size:13px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.04em;margin:0 0 8px}
.inline-form{display:flex;gap:8px;padding:16px;flex-wrap:wrap}.inline-form input{font:inherit;padding:6px 10px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg);min-width:220px}
.actions-bar{display:flex;gap:8px;padding:16px;flex-wrap:wrap}
`;

export const Layout = (props: { title: string; children: Child }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{props.title}</title>
      <style>{raw(css)}</style>
    </head>
    <body>
      <nav style="max-width:1100px;margin:auto;padding:12px 16px">
        <a class="back" href="/admin/logs">
          Mesh logs
        </a>
      </nav>
      {props.children}
    </body>
  </html>
);
