import type { JSX } from "react";
import { useLocale } from "../i18n/LocaleContext.js";

type DocsPageProps = {
  onBack: () => void;
};

export function DocsPage({ onBack }: DocsPageProps): JSX.Element {
  const { t } = useLocale();

  return (
    <div className="docs-page">
      <div className="docs-header">
        <button type="button" onClick={onBack} className="s2s-btn docs-back-button">
          {t("docs.back")}
        </button>
        <h1>{t("docs.title")}</h1>
      </div>

      <nav className="docs-toc" aria-label={t("docs.toc")}>
        <ul>
          <li><a href="#overview">{t("docs.overview")}</a></li>
          <li><a href="#quickstart">{t("docs.quickstart")}</a></li>
          <li><a href="#commands">{t("docs.commands")}</a></li>
          <li><a href="#api">{t("docs.api")}</a></li>
          <li><a href="#configuration">{t("docs.configuration")}</a></li>
          <li><a href="#faq">{t("docs.faq")}</a></li>
        </ul>
      </nav>

      <main className="docs-content">
        <section id="overview" className="docs-section">
          <h2>{t("docs.overview")}</h2>
          <p>{t("docs.overview.description")}</p>
          <div className="docs-features">
            <div className="docs-feature">
              <h3>📖 {t("docs.feature.read")}</h3>
              <p>{t("docs.feature.read.description")}</p>
            </div>
            <div className="docs-feature">
              <h3>🔍 {t("docs.feature.analyze")}</h3>
              <p>{t("docs.feature.analyze.description")}</p>
            </div>
            <div className="docs-feature">
              <h3>📝 {t("docs.feature.generate")}</h3>
              <p>{t("docs.feature.generate.description")}</p>
            </div>
          </div>
        </section>

        <section id="quickstart" className="docs-section">
          <h2>{t("docs.quickstart")}</h2>
          <div className="docs-steps">
            <div className="docs-step">
              <h3>1. {t("docs.step.install")}</h3>
              <pre className="docs-code">
                <code>{`git clone https://github.com/YingkeSu/session2skills.git
cd session2skills
npm install
npm run build`}</code>
              </pre>
            </div>
            <div className="docs-step">
              <h3>2. {t("docs.step.configure")}</h3>
              <pre className="docs-code">
                <code>{`# Required
export SESSION2SKILLS_LLM_BASE_URL="https://api.example.com/v1"
export SESSION2SKILLS_LLM_MODEL="gpt-4o"

# Optional
export SESSION2SKILLS_LLM_API_KEY="sk-..."`}</code>
              </pre>
            </div>
            <div className="docs-step">
              <h3>3. {t("docs.step.run")}</h3>
              <pre className="docs-code">
                <code>{`# Generate skills from sessions
node dist/cli/main.js generate --directory /project/path --recent 10

# Launch Web UI
node dist/cli/main.js serve --directory /project/path`}</code>
              </pre>
            </div>
          </div>
        </section>

        <section id="commands" className="docs-section">
          <h2>{t("docs.commands")}</h2>
          <div className="docs-command">
            <h3>inspect</h3>
            <p>{t("docs.command.inspect")}</p>
            <pre className="docs-code">
              <code>{`node dist/cli/main.js inspect --directory /project/path --recent 5`}</code>
            </pre>
          </div>
          <div className="docs-command">
            <h3>generate</h3>
            <p>{t("docs.command.generate")}</p>
            <pre className="docs-code">
              <code>{`node dist/cli/main.js generate \\
  --directory /project/path \\
  --recent 10 \\
  --output generated-skills/my-skill \\
  --tone balanced`}</code>
            </pre>
          </div>
          <div className="docs-command">
            <h3>evaluate</h3>
            <p>{t("docs.command.evaluate")}</p>
            <pre className="docs-code">
              <code>{`node dist/cli/main.js evaluate --directory /project/path`}</code>
            </pre>
          </div>
          <div className="docs-command">
            <h3>serve</h3>
            <p>{t("docs.command.serve")}</p>
            <pre className="docs-code">
              <code>{`node dist/cli/main.js serve --directory /project/path --port 3000`}</code>
            </pre>
          </div>
        </section>

        <section id="api" className="docs-section">
          <h2>{t("docs.api")}</h2>
          <p>{t("docs.api.description")}</p>
          <table className="docs-table">
            <thead>
              <tr>
                <th>{t("docs.api.method")}</th>
                <th>{t("docs.api.endpoint")}</th>
                <th>{t("docs.api.descriptionHeader")}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>GET</code></td>
                <td><code>/api/health</code></td>
                <td>{t("docs.api.health")}</td>
              </tr>
              <tr>
                <td><code>GET</code></td>
                <td><code>/api/runs</code></td>
                <td>{t("docs.api.listRuns")}</td>
              </tr>
              <tr>
                <td><code>GET</code></td>
                <td><code>/api/runs/:name</code></td>
                <td>{t("docs.api.getRun")}</td>
              </tr>
              <tr>
                <td><code>POST</code></td>
                <td><code>/api/runs</code></td>
                <td>{t("docs.api.createRun")}</td>
              </tr>
              <tr>
                <td><code>POST</code></td>
                <td><code>/api/runs/:name/evaluate</code></td>
                <td>{t("docs.api.evaluateRun")}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section id="configuration" className="docs-section">
          <h2>{t("docs.configuration")}</h2>
          <div className="docs-config">
            <h3>{t("docs.config.llm")}</h3>
            <table className="docs-table">
              <thead>
                <tr>
                  <th>{t("docs.config.variable")}</th>
                  <th>{t("docs.config.required")}</th>
                  <th>{t("docs.config.description")}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>SESSION2SKILLS_LLM_BASE_URL</code></td>
                  <td>✅</td>
                  <td>{t("docs.config.baseUrl")}</td>
                </tr>
                <tr>
                  <td><code>SESSION2SKILLS_LLM_MODEL</code></td>
                  <td>✅</td>
                  <td>{t("docs.config.model")}</td>
                </tr>
                <tr>
                  <td><code>SESSION2SKILLS_LLM_API_KEY</code></td>
                  <td>❌</td>
                  <td>{t("docs.config.apiKey")}</td>
                </tr>
                <tr>
                  <td><code>SESSION2SKILLS_LLM_PROVIDER</code></td>
                  <td>❌</td>
                  <td>{t("docs.config.provider")}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="docs-config">
            <h3>{t("docs.config.adapter")}</h3>
            <table className="docs-table">
              <thead>
                <tr>
                  <th>{t("docs.config.variable")}</th>
                  <th>{t("docs.config.default")}</th>
                  <th>{t("docs.config.description")}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>SESSION2SKILLS_ADAPTER</code></td>
                  <td>auto</td>
                  <td>{t("docs.config.adapterType")}</td>
                </tr>
                <tr>
                  <td><code>SESSION2SKILLS_DB_PATH</code></td>
                  <td>~/.local/share/opencode/opencode.db</td>
                  <td>{t("docs.config.dbPath")}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section id="faq" className="docs-section">
          <h2>{t("docs.faq")}</h2>
          <div className="docs-faq-item">
            <h3>{t("docs.faq.q1")}</h3>
            <p>{t("docs.faq.a1")}</p>
          </div>
          <div className="docs-faq-item">
            <h3>{t("docs.faq.q2")}</h3>
            <p>{t("docs.faq.a2")}</p>
          </div>
          <div className="docs-faq-item">
            <h3>{t("docs.faq.q3")}</h3>
            <p>{t("docs.faq.a3")}</p>
          </div>
        </section>

        <section className="docs-section docs-links">
          <h2>{t("docs.links")}</h2>
          <ul>
            <li>
              <a href="https://github.com/YingkeSu/session2skills" target="_blank" rel="noopener noreferrer">
                GitHub Repository
              </a>
            </li>
            <li>
              <a href="https://github.com/YingkeSu/session2skills/issues" target="_blank" rel="noopener noreferrer">
                Issues & Support
              </a>
            </li>
            <li>
              <a href="https://opencode.ai" target="_blank" rel="noopener noreferrer">
                OpenCode
              </a>
            </li>
          </ul>
        </section>
      </main>
    </div>
  );
}
