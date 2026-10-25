import { Layout } from "./layout";

export const LoginPage = (props: { error?: string }) => (
  <Layout title="Teapot · Login">
    <main>
      <div class="card login">
        <h1>🫖 Teapot</h1>
        <form method="post" action="/login" style="display:block">
          <input
            type="password"
            name="token"
            placeholder="Admin token"
            autofocus
            required
          />
          {props.error && <p class="err">{props.error}</p>}
          <button class="primary" type="submit">
            Sign in
          </button>
        </form>
      </div>
    </main>
  </Layout>
);
