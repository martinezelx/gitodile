import { describe, expect, it } from "vitest";
import { dump } from "js-yaml";
import { feedbackContract, validateFeedbackForms, validateFeedbackSettings } from "./check-public-feedback.mjs";

function forms() {
  const result = {};
  for (const [templates, label] of [[feedbackContract.bugTemplates, "bug"], [feedbackContract.featureTemplates, "enhancement"]]) {
    for (const name of Object.values(templates)) {
      result[name] = dump({ name, description: "Report", labels: [label], body: [{
        type: "textarea", id: "diagnostics", attributes: { label: "System", render: "text" }, validations: { required: true },
      }] });
    }
  }
  result["config.yml"] = dump({ blank_issues_enabled: false, contact_links: [{ url: `https://github.com/${feedbackContract.repository}/security/advisories/new` }] });
  return result;
}

describe("public feedback publication check", () => {
  it("accepts all forms with the published contract", () => expect(() => validateFeedbackForms(forms())).not.toThrow());
  it("rejects a renamed Spanish diagnostic field", () => {
    const files = forms();
    files["bug-es.yml"] = files["bug-es.yml"].replace("id: diagnostics", "id: renamed");
    expect(() => validateFeedbackForms(files)).toThrow(/bug-es.yml.*diagnostics/);
  });
  it("rejects missing templates and malformed YAML", () => {
    const files = forms();
    delete files["bug.yml"];
    expect(() => validateFeedbackForms(files)).toThrow(/Missing public form/);
    files["bug.yml"] = "body: [";
    expect(() => validateFeedbackForms(files)).toThrow();
  });
  it("rejects a duplicate diagnostic field", () => {
    const files = forms();
    files["bug.yml"] += "  - type: textarea\n    id: diagnostics\n";
    expect(() => validateFeedbackForms(files)).toThrow(/duplicate field id/);
  });
  it("rejects a tracker whose private security channel has been disabled", () => {
    const repository = { full_name: feedbackContract.repository, visibility: "public", archived: false, has_issues: true };
    const labels = [{ name: "bug" }, { name: "enhancement" }];
    expect(() => validateFeedbackSettings(repository, { enabled: false }, labels)).toThrow(/Private vulnerability reporting/);
    expect(() => validateFeedbackSettings(repository, { enabled: true }, labels)).not.toThrow();
  });
});
