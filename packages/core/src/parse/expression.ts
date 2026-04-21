const EXPR_PATTERN = /\$\{(.+?)\}/g;

export type Expr =
  | { type: "resource_ref"; resource: string; name: string; attr: string }
  | { type: "file_ref"; path: string };

export type StringWithExprs =
  | { type: "literal"; value: string }
  | { type: "template"; parts: TemplatePart[] };

export type TemplatePart =
  | { type: "text"; value: string }
  | { type: "expr"; expr: Expr };

export function parseExpr(raw: string): Expr {
  const fileMatch = raw.match(/^file\(['"](.+?)['"]\)$/);
  if (fileMatch) return { type: "file_ref", path: fileMatch[1]! };

  const refMatch = raw.match(/^([\w][\w-]*)\.([\w][\w-]*)\.([\w]+)$/);
  if (refMatch) {
    return {
      type: "resource_ref",
      resource: refMatch[1]!,
      name: refMatch[2]!,
      attr: refMatch[3]!,
    };
  }

  throw new Error(`Invalid expression: \${${raw}}`);
}

export function parseString(input: string): StringWithExprs {
  const parts: TemplatePart[] = [];
  let lastIndex = 0;

  const regex = new RegExp(EXPR_PATTERN.source, "g");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(input)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: input.slice(lastIndex, match.index) });
    }
    parts.push({ type: "expr", expr: parseExpr(match[1]!) });
    lastIndex = regex.lastIndex;
  }

  if (parts.length === 0) {
    return { type: "literal", value: input };
  }

  if (lastIndex < input.length) {
    parts.push({ type: "text", value: input.slice(lastIndex) });
  }

  return { type: "template", parts };
}
