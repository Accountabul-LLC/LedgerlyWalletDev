export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Ledgerly</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body {
        font: 15px/1.55 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: #f5f5ef;
        color: #171a18;
        display: grid;
        place-items: center;
        min-height: 100vh;
        margin: 0;
        padding: 24px;
      }
      .card {
        width: min(420px, 100%);
        padding: 28px 24px 24px;
        border: 1px solid #e6e8e2;
        border-radius: 26px;
        background: #fff;
        box-shadow: 0 18px 40px rgba(16, 18, 16, 0.07);
        text-align: center;
      }
      .mark {
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        margin: 0 auto 16px;
        border-radius: 12px;
        background: #171a18;
        color: #dff532;
        font: italic 16px Georgia, 'Times New Roman', serif;
      }
      h1 { margin: 0; font: 400 24px Georgia, 'Times New Roman', serif; letter-spacing: -0.01em; }
      p { margin: 10px 0 0; font-size: 13px; color: #737973; }
      .actions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-top: 20px; }
      a, button {
        padding: 11px 18px;
        border-radius: 99px;
        font: 700 13px inherit;
        font-family: inherit;
        cursor: pointer;
        text-decoration: none;
        border: 1px solid #e6e8e2;
        background: #fff;
        color: #171a18;
      }
      .primary { background: #171a18; border-color: #171a18; color: #dff532; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="mark" aria-hidden="true">L</div>
      <h1>Something didn't load</h1>
      <p>The wallet interface hit a snag. Nothing happened to your keys, they stay encrypted on this device. Try loading again.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a href="/">Back to wallet</a>
      </div>
    </div>
  </body>
</html>`;
}
