import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const workflowFile = "deploy-pages.yml";
const workflow = readFileSync(new URL(`.github/workflows/${workflowFile}`, root), "utf8");
const qualityWorkflow = readFileSync(new URL(".github/workflows/quality.yml", root), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const jobs = workflow.slice(workflow.indexOf("\njobs:\n"));
const publish = jobs.slice(jobs.indexOf("\n  publish-edge:\n"));

test("deployment only runs quality and edge publication, without Pages jobs or permissions", () => {
  assert.match(workflow, /^name: Deploy edge-proxy$/m);
  assert.deepEqual([...jobs.matchAll(/^  ([\w-]+):$/gm)].map((match) => match[1]), ["quality", "publish-edge"]);
  assert.doesNotMatch(workflow, /actions\/(?:configure-pages|upload-pages-artifact|deploy-pages)@/);
  assert.doesNotMatch(workflow, /^\s+(?:pages|id-token):/m);
  assert.doesNotMatch(workflow, /github-pages|\/ToniCrespoWEB\/|dist\/404\.html/);
  assert.match(workflow, /^permissions:\n  contents: read$/m);
  assert.match(workflow, /^concurrency:\n  group: edge-proxy\n  cancel-in-progress: false$/m);
});

test("edge publication keeps the required tests and exactly one full public-health check before its build", () => {
  assert.match(jobs, /^    uses: \.\/\.github\/workflows\/quality\.yml$/m);
  assert.match(publish, /^    needs: quality$/m);
  assert.match(publish, /^    if: github\.ref == 'refs\/heads\/main'$/m);
  assert.match(publish, /^    permissions:\n      contents: write$/m);
  assert.match(qualityWorkflow, /^      - run: npm run test:ci$/m);
  assert.match(qualityWorkflow, /^        run: npm run test:supabase:local$/m);
  assert.equal([...workflow.matchAll(/run: npm run test:public-health\b/g)].length, 1);
  assert.doesNotMatch(publish, /--skip-media|continue-on-error/);
  const health = publish.indexOf("run: npm run test:public-health");
  const build = publish.indexOf("run: npm run build");
  const archive = publish.indexOf("tar --sort=name");
  const release = publish.indexOf("gh release create");
  assert.ok(health >= 0 && build > health && archive > build && release > archive);
});

test("edge artifacts preserve the root-domain build and consumer manifest contract", () => {
  assert.match(publish, /^          VITE_BASE_PATH: \/$/m);
  for (const variable of ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]) {
    assert.ok(publish.includes(`${variable}: \${{ secrets.${variable} }}`));
  }
  assert.ok(publish.includes(`"workflow": "${workflowFile}"`));
  assert.match(publish, /"base_path": "\/"/);
  assert.match(publish, /"commit": os\.environ\["GITHUB_SHA"\]/);
  assert.match(publish, /"run_id": int\(os\.environ\["GITHUB_RUN_ID"\]\)/);
  assert.match(publish, /-czf site\.tar\.gz -C dist \./);
  assert.match(publish, /sha256sum site\.tar\.gz > site\.tar\.gz\.sha256/);
  assert.match(publish, /gh release create "\$release_tag" site\.tar\.gz site\.tar\.gz\.sha256 release\.json/);
  assert.doesNotMatch(publish, /--clobber|SUPABASE_SERVICE_ROLE_KEY|sb_secret_/);
});

test("the release gate installs WebKit and runs the focused iPhone layout and language regressions", () => {
  const browserConfig = readFileSync(new URL("playwright.config.ts", root), "utf8");
  assert.match(qualityWorkflow, /playwright install --with-deps chromium webkit/);
  assert.match(browserConfig, /name: "mobile-webkit"/);
  assert.match(browserConfig, /browserName: "webkit"/);
  for (const spec of ["footer-viewport.spec.ts", "room-eligibility.spec.ts", "language-selector.spec.ts", "language-preferences.spec.ts"]) {
    assert.ok(browserConfig.includes(`"**/${spec}"`));
  }
  assert.equal(packageJson.scripts["test:e2e"], "playwright test");
});

test("the obsolete Pages preview is removed while normal Vite preview remains available", () => {
  assert.equal(packageJson.scripts["preview:pages"], undefined);
  assert.match(packageJson.scripts.preview, /^vite preview\b/);
  assert.equal(existsSync(new URL("scripts/preview-github-pages.mjs", root)), false);
});
