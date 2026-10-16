import assert from "node:assert/strict";
import test from "node:test";
import { OS_MODULE_NAMES, getOSModule } from "../src/os/modules";
import { loadModulePrompt } from "../src/os/modulePrompt";
import { loadActivePrompts } from "../src/harness/promptVersions";

for (const name of OS_MODULE_NAMES) {
  test(`${name} has a readable specialization prompt and tool configuration`, async () => {
    const module = getOSModule(name);
    assert.equal(module.name, name);
    assert.ok(module.description.trim());
    assert.ok(module.tools.length > 0);
    assert.equal(new Set(module.tools).size, module.tools.length);
    assert.match(await loadModulePrompt(module), new RegExp(name));
    for (const harnessOnly of ["save_health_plan", "append_daily_log", "update_preferences"]) {
      assert.equal(module.tools.includes(harnessOnly), false);
    }
  });
}

test("active coach and safety prompts are present on a fresh checkout", async () => {
  const { prompts, versions } = await loadActivePrompts();
  assert.ok(prompts.coach.trim());
  assert.ok(prompts.reviewer.trim());
  assert.match(versions.coach, /^v\d+$/);
  assert.match(versions.reviewer, /^v\d+$/);
});
