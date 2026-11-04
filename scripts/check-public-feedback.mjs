import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import feedbackContract from "../src/app/issueReportContract.json" with { type: "json" };

export { feedbackContract };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Validate the actual YAML, including duplicate keys, rather than grepping IDs. */
export function validateFeedbackForms(files, contract = feedbackContract) {
  const read = (name) => {
    assert.equal(typeof files[name], "string", `Missing public form: ${name}`);
    return load(files[name]);
  };
  for (const [templates, label] of [[contract.bugTemplates, "bug"], [contract.featureTemplates, "enhancement"]]) {
    for (const name of Object.values(templates)) {
      const form = read(name);
      assert.ok(form.name && form.description, `${name}: missing form name or description`);
      assert.ok(form.labels?.includes(label), `${name}: expected label ${label}`);
      assert.ok(Array.isArray(form.body), `${name}: missing form body`);
      const ids = form.body.filter((field) => field.type !== "markdown").map((field) => field.id);
      assert.ok(ids.every((id) => typeof id === "string" && id.length > 0), `${name}: missing field id`);
      assert.equal(new Set(ids).size, ids.length, `${name}: duplicate field id`);
      if (label === "bug") {
        const field = form.body.find((item) => item.id === contract.diagnosticsField);
        assert.equal(field?.type, "textarea", `${name}: missing diagnostics textarea (${contract.diagnosticsField})`);
        assert.equal(field.attributes?.render, "text", `${name}: diagnostics must render as text`);
        assert.equal(field.validations?.required, true, `${name}: diagnostics must be required`);
      }
    }
  }
  const config = read("config.yml");
  assert.equal(config.blank_issues_enabled, false, "Blank issues must be disabled");
  assert.ok(config.contact_links?.some((link) => link.url === `https://github.com/${contract.repository}/security/advisories/new`), "Missing private security contact");
}

export function validateFeedbackSettings(repository, reporting, labels) {
  assert.equal(repository.full_name, feedbackContract.repository, "Unexpected feedback repository");
  assert.equal(repository.visibility, "public", "Feedback repository is not public");
  assert.equal(repository.archived, false, "Feedback repository is archived");
  assert.equal(repository.has_issues, true, "Feedback issues are disabled");
  assert.equal(reporting.enabled, true, "Private vulnerability reporting is disabled");
  for (const name of ["bug", "enhancement"]) {
    assert.ok(labels.some((label) => label.name === name), `Missing issue label: ${name}`);
  }
}

async function check() {
  const names = [...Object.values(feedbackContract.bugTemplates), ...Object.values(feedbackContract.featureTemplates), "config.yml"];
  const files = Object.fromEntries(await Promise.all(names.map(async (name) => [name, await readFile(path.join(ROOT, ".github/ISSUE_TEMPLATE", name), "utf8")])));
  validateFeedbackForms(files);
  console.log("Feedback forms match the app contract in English and Spanish.");

  const headers = { Accept: "application/vnd.github+json", "User-Agent": "GitOdile-feedback-contract" };
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  const api = async (endpoint) => {
    const response = await fetch(`https://api.github.com/repos/${feedbackContract.repository}${endpoint}`, {
      headers, signal: AbortSignal.timeout(15_000), redirect: "error",
    });
    assert.ok(response.ok, `GitHub ${endpoint}: HTTP ${response.status}`);
    return response.json();
  };
  const [repository, reporting, labels] = await Promise.all([
    api(""), api("/private-vulnerability-reporting"), api("/labels?per_page=100"),
  ]);
  validateFeedbackSettings(repository, reporting, labels);
  console.log("Public feedback settings verified.");
}

if (import.meta.url.startsWith("file:") && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  check().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
