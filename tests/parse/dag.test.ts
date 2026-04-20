import { describe, expect, test } from "bun:test";
import { parseYaml } from "../../src/parse/parser.ts";
import { buildDag } from "../../src/parse/dag.ts";

describe("buildDag", () => {
  test("D-1: no dependencies - environment + skill only", () => {
    const config = parseYaml(`
environments:
  dev:
    name: Dev
    config:
      type: cloud
skills:
  search:
    directory: ./skills/search
`);
    const dag = buildDag(config);
    expect(dag.sorted.length).toBe(2);
    expect(dag.nodes.get("environment.dev")!.dependencies).toEqual([]);
    expect(dag.nodes.get("skill.search")!.dependencies).toEqual([]);
  });

  test("D-2: agent depends on skill", () => {
    const config = parseYaml(`
skills:
  search:
    directory: ./skills/search
agents:
  bot:
    name: Bot
    model: claude-sonnet-4-6-20250514
    system: Hello
    skills:
      - type: custom
        skill_id: "\${skill.search.id}"
`);
    const dag = buildDag(config);
    const botIdx = dag.sorted.indexOf("agent.bot");
    const searchIdx = dag.sorted.indexOf("skill.search");
    expect(searchIdx).toBeLessThan(botIdx);
  });

  test("D-3: circular dependency", () => {
    const config = parseYaml(`
skills:
  a:
    directory: "\${agent.b.id}"
agents:
  b:
    name: B
    model: claude-sonnet-4-6-20250514
    system: "\${skill.a.id}"
`);
    expect(() => buildDag(config)).toThrow("Circular dependency detected");
  });

  test("D-4: agent depends on multiple skills", () => {
    const config = parseYaml(`
skills:
  search:
    directory: ./skills/search
  calc:
    directory: ./skills/calc
agents:
  bot:
    name: Bot
    model: claude-sonnet-4-6-20250514
    system: "\${skill.search.id} and \${skill.calc.id}"
`);
    const dag = buildDag(config);
    const botIdx = dag.sorted.indexOf("agent.bot");
    const searchIdx = dag.sorted.indexOf("skill.search");
    const calcIdx = dag.sorted.indexOf("skill.calc");
    expect(searchIdx).toBeLessThan(botIdx);
    expect(calcIdx).toBeLessThan(botIdx);
  });
});
