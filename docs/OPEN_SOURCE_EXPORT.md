# Open Source Export

LucidMerged keeps the private product repo as the source of truth and generates a public/self-hostable repo from an allowlist.

Do not make the private repo public directly. Git history, workflows, native app code, release operations, local plans, and generated evidence may contain material that is not intended for the open-source distribution.

## Boundary

Public export includes:

- `src/` application and API code
- `contracts/`
- `packages/`
- `worker/`
- `supabase/` and `migrations/`
- Docker and self-host documentation
- public-safe scripts and tests

Public export excludes:

- `apps/mobile/`
- `apps/desktop/`
- native release workflows
- signing, EAS, APNS, FCM, and store-release material
- local planning docs and generated review evidence
- private intelligence or memory-bank material
- `package-lock.json` until private app workspace entries are stripped

Official Lucid desktop/mobile apps stay cloud-first unless product strategy explicitly changes. User-launched agent apps should use exportable manifests and templates rather than requiring the official Lucid control apps to be self-hosted.

## Commands

Check the boundary:

```bash
npm run oss:check
```

Scan the private repo for leaked secrets:

```bash
npm run oss:secrets -- --scope private
```

Preview the export:

```bash
npm run oss:export -- --dry-run
```

Generate the export into the default ignored directory:

```bash
npm run oss:export -- --clean
```

Generate into a sibling public repo checkout:

```bash
npm run oss:export -- --out ../LucidMerged-public --clean
```

Run the full generated public repo smoke test:

```bash
npm run oss:smoke -- --clean
```

That command exports the public tree, generates a public `package-lock.json`, installs dependencies, runs the public boundary check, scans secrets, generates an SBOM, audits licenses, typechecks, builds, and runs the public-safe test gate from inside `.oss-export/LucidMerged-public`.

Run only the public-safe test gate:

```bash
npm run oss:public-test
```

The public test gate intentionally avoids private-repo tests that assert private workflows, private generated audit artifacts, SaaS entitlement behavior, or native app release files. Those remain covered by private CI.

Generate an SBOM and license audit for the current tree:

```bash
npm run oss:license -- --root . --out .oss-export/reports/private-sbom.cdx.json
```

## Publishing Flow

1. Run `npm run oss:check`.
2. Run `npm run oss:secrets -- --scope private`.
3. Run `npm run oss:license -- --root . --out .oss-export/reports/private-sbom.cdx.json`.
4. Run `npm run oss:smoke -- --out ../LucidMerged-public --clean`.
5. Review the generated diff in the public repo checkout.
6. Commit and push from the public repo.

The export script rewrites `README.md` from `docs/PUBLIC_README.md`, strips native release ops from the public environment reference, and rewrites `package.json` for public distribution by removing private native app scripts and native release scripts. It does not rewrite source code. If public code imports private native paths, `npm run oss:check` should fail before export.

## CI

Private source repo:

- `.github/workflows/oss-private-gates.yml` runs the public boundary check, private secret scan, license audit/SBOM, and generated public repo smoke test on PRs.
- `.github/workflows/sync-open-source.yml` exports the public tree, generates the public lockfile in the target checkout, initializes an empty public repo on first sync, then pushes a sync branch and opens or updates a PR.
- `sync-open-source.yml` needs a private-repo secret named `OSS_PUBLIC_REPO_TOKEN`. Use a fine-grained GitHub token scoped only to the public repository with `Contents: Read and write` and `Pull requests: Read and write`.
- Do not store this token in `.env`, docs, workflow YAML, or the public repo.

Public repo:

- `.github/workflows/public-ci.yml` is included in the export and runs install, boundary check, secret scan, license audit/SBOM, typecheck, build, and tests.
- The generated public repository target is currently `lucid-fdn/lucid`.

## Public Lockfile Strategy

The private repo's `package-lock.json` is intentionally excluded because it can contain private workspace state, native app dependency graph details, or private release history.

The public repo owns its own lockfile:

1. Export the public tree.
2. In the public checkout, run `npm install --package-lock-only --ignore-scripts --legacy-peer-deps`.
3. Commit the generated `package-lock.json` in the public repo.
4. Public CI uses `npm ci --legacy-peer-deps` and fails if the public lockfile is missing.

## Adding Public Files

Add paths to `oss-include.json` only when they are safe for the public repo. Prefer allowlisting a narrow path over including a broad directory.

If a feature needs private product code, keep the implementation private and expose only:

- shared contracts,
- API documentation,
- templates,
- generated manifests,
- self-host-safe adapters.

For one-click user-launched agent apps, the public surface should be:

```text
contracts/agent-app-manifest.ts
packages/agent-app-runtime/
packages/agent-app-client/
templates/agent-app-web/
templates/agent-app-mobile-expo/
templates/agent-app-desktop-electron/
docs/agent-apps/
```

Native templates are optional and should remain guided-build/export surfaces until signing, push credentials, store review, and platform entitlements can be handled cleanly by the operator.
