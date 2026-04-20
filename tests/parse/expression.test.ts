import { describe, expect, test } from "bun:test";
import { parseExpr, parseString } from "../../src/parse/expression.ts";

describe("parseExpr", () => {
  test("E-1: resource reference", () => {
    const result = parseExpr("skill.search.id");
    expect(result).toEqual({
      type: "resource_ref",
      resource: "skill",
      name: "search",
      attr: "id",
    });
  });

  test("E-2: file reference", () => {
    const result = parseExpr("file('./prompt.md')");
    expect(result).toEqual({ type: "file_ref", path: "./prompt.md" });
  });

  test("E-2: file reference with double quotes", () => {
    const result = parseExpr('file("./prompt.md")');
    expect(result).toEqual({ type: "file_ref", path: "./prompt.md" });
  });

  test("E-5: invalid expression", () => {
    expect(() => parseExpr("invalid")).toThrow("Invalid expression");
  });

  test("E-6: hyphenated name", () => {
    const result = parseExpr("skill.my-skill.id");
    expect(result).toEqual({
      type: "resource_ref",
      resource: "skill",
      name: "my-skill",
      attr: "id",
    });
  });
});

describe("parseString", () => {
  test("plain string returns literal", () => {
    const result = parseString("hello world");
    expect(result).toEqual({ type: "literal", value: "hello world" });
  });

  test("E-3: expression in string with prefix and suffix", () => {
    const result = parseString("prefix ${skill.x.id} suffix");
    expect(result).toEqual({
      type: "template",
      parts: [
        { type: "text", value: "prefix " },
        { type: "expr", expr: { type: "resource_ref", resource: "skill", name: "x", attr: "id" } },
        { type: "text", value: " suffix" },
      ],
    });
  });

  test("E-4: multiple expressions", () => {
    const result = parseString("${file('./a.md')} and ${skill.b.id}");
    expect(result).toEqual({
      type: "template",
      parts: [
        { type: "expr", expr: { type: "file_ref", path: "./a.md" } },
        { type: "text", value: " and " },
        { type: "expr", expr: { type: "resource_ref", resource: "skill", name: "b", attr: "id" } },
      ],
    });
  });

  test("single expression fills entire string", () => {
    const result = parseString("${file('./prompt.md')}");
    expect(result).toEqual({
      type: "template",
      parts: [
        { type: "expr", expr: { type: "file_ref", path: "./prompt.md" } },
      ],
    });
  });
});
