# Releasing session2skills

`session2skills` is published to the npm public registry via a
[Changesets](https://github.com/changesets/changesets)-driven workflow that uses
**npm Trusted Publishing (OIDC)** for provenance. No long-lived npm publish
token is checked into the repo.

The fully-automated half lives in:

- `.github/workflows/release.yml` — the release job (runs on push to `main`).
- `.changeset/config.json` — changeset config (`access: public`,
  `baseBranch: main`).
- `package.json` → `publishConfig: { access: "public", provenance: true }`.

## How a release happens (automated)

1. A contributor adds a changeset on a feature branch:
   ```bash
   npx changeset
   ```
   and commits the generated file under `.changeset/`.
2. The **Changeset GitHub App** (or a maintainer) opens a *"Version Packages"*
   PR that consumes pending changesets and bumps `version` + `CHANGELOG.md`.
3. When that PR is merged into `main`, `release.yml` runs. `changesets/action`
   detects the pending version bump and runs `npx changeset publish`, which
   invokes `npm publish` with provenance (`--provenance`) and public visibility
   (`--access public`), authenticated via npm Trusted Publishing.

## Human-in-the-loop setup (do once, in the UIs)

These steps cannot be automated from this repository — they require access to
the **npm** and **GitHub** settings UIs. The release workflow will fail until
they are complete.

### 1. npm — link Trusted Publishing (OIDC)

On https://www.npmjs.com → `session2skills` package → **Settings** →
**Publishing access**:

- Enable **Trusted Publishing** and configure a publishing configuration linked
  to this GitHub repository and this exact workflow:
  - Repository: `YingkeSu/session2skills`
  - Workflow file: `release.yml`
  - Environment: `Release`
- Create a granular **automation token** and store it as the GitHub secret
  `NPM_TOKEN` (Settings → Secrets and variables → Actions → New repository
  secret). With Trusted Publishing the OIDC identity is what npm authorizes;
  `NPM_TOKEN` is the automation credential the npm CLI receives via
  `NODE_AUTH_TOKEN`.

> Why both? `--provenance` requires an OIDC-verifiable workflow identity. The
> npm CLI still consumes `NODE_AUTH_TOKEN`; Trusted Publishing is what makes
> that token's identity verifiable and revocable per-workflow.

### 2. GitHub — enable the Changeset bot

- Install the **Changeset GitHub App** on `YingkeSu/session2skills`
  (https://github.com/apps/changeset) so it can open/maintain the
  *"Version Packages"* PR automatically. (Alternatively, run `npx changeset
  version` manually before merging.)

### 3. GitHub — protect the `Release` environment

Settings → Environments → **New environment** → name it `Release`:

- **Required reviewers**: add at least one maintainer (publish gate).
- **Deployment branches**: restrict to `main`.
- (Optional) Add a wait timer for a manual publish window.

`release.yml` declares `environment: Release`, so these rules gate every
publish.

## Dry-run / local check

```bash
npm publish --dry-run
```

This packs the tarball and reports what would be published without contacting
the registry. A full provenance-bound publish only happens in CI.
