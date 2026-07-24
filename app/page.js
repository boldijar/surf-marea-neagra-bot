const webhookCommand = `curl "https://api.telegram.org/bot\${TELEGRAM_BOT_TOKEN}/setWebhook" \\
  -d "url=https://surf-marea-neagra-bot.vercel.app/api/webhook" \\
  -d "secret_token=\${TELEGRAM_WEBHOOK_SECRET}" \\
  -d 'allowed_updates=["message"]'`;

export default function Home() {
  return (
    <main>
      <p className="status">Vercel live</p>
      <h1>Marea Neagră — Telegram surf bot</h1>
      <p className="lede">
        Bot de surf pe Marea Neagră: abonări prin webhook pe Vercel și
        rapoarte programate prin GitHub Actions.
      </p>

      <nav>
        <a href="https://boldijar.github.io/marea-neagra/">Site prognoză</a>
        <a href="/api/marco">/api/marco</a>
        <a href="/api/webhook">/api/webhook</a>
        <a href="/api/subscribers">/api/subscribers</a>
      </nav>

      <section>
        <h2>Cum funcționează</h2>
        <ul>
          <li>
            <strong>Vercel</strong> primește comenzile Telegram. La{" "}
            <code>/start</code>, chat ID-ul este salvat în Upstash Redis.
          </li>
          <li>
            <strong>GitHub Actions</strong> rulează <code>bot.py</code> și
            trimite prognoza.
          </li>
        </ul>
      </section>

      <section>
        <h2>Configurare</h2>
        <ol>
          <li>Conectează o bază Upstash Redis la proiectul Vercel.</li>
          <li>
            Configurează <code>TELEGRAM_BOT_TOKEN</code>,{" "}
            <code>TELEGRAM_WEBHOOK_SECRET</code> și{" "}
            <code>SUBSCRIBERS_API_SECRET</code>.
          </li>
          <li>Înregistrează webhook-ul Telegram:</li>
        </ol>
        <pre><code>{webhookCommand}</code></pre>
      </section>

      <section>
        <h2>Comenzi</h2>
        <dl>
          <div><dt><code>/start</code></dt><dd>abonare la raport</dd></div>
          <div><dt><code>/stop</code></dt><dd>dezabonare</dd></div>
          <div><dt><code>/help</code></dt><dd>afișarea comenzilor</dd></div>
        </dl>
      </section>
    </main>
  );
}
