import test from "node:test";
import assert from "node:assert/strict";
import { safeParseModelJson } from "../src/core/remote-client.js";

test("safeParseModelJson repairs loose page summary JSON with markdown quotes", () => {
  const parsed = safeParseModelJson(`{
  "pageSummary": "页面总结",
  "summaryMarkdown": "# 主题

| 字段 | 说明 |
| --- | --- |
| 标题 | 用户说 "增长飞轮" |
",
  "mindmapMermaid": "mindmap
  root((页面主题))
    方法
      A/B 测试
"
}`);

  assert.equal(parsed.pageSummary, "页面总结");
  assert.match(parsed.summaryMarkdown, /增长飞轮/);
  assert.match(parsed.mindmapMermaid, /mindmap/);
});

test("safeParseModelJson keeps strict JSON parsing unchanged", () => {
  const parsed = safeParseModelJson('{"pageSummary":"ok","answer":"正常","confidence":0.8}');

  assert.deepEqual(parsed, {
    pageSummary: "ok",
    answer: "正常",
    confidence: 0.8
  });
});
