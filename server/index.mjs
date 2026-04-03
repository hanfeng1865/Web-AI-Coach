import { createServer } from "node:http";
import { generateGuidance } from "../src/core/guidance-engine.js";
import { buildRedactionSummary, redactArray, redactText } from "../src/core/redaction.js";

function sanitizeSnapshot(snapshot) {
  const sanitized = {
    ...snapshot,
    title: redactText(snapshot.title),
    breadcrumbs: (snapshot.breadcrumbs || []).map((item) => redactText(item)).filter(Boolean),
    leftNavItems: redactArray(snapshot.leftNavItems),
    visibleModules: redactArray(snapshot.visibleModules),
    primaryActions: redactArray(snapshot.primaryActions, 8),
    notices: redactArray(snapshot.notices, 6)
  };

  return {
    ...sanitized,
    redactionSummary: buildRedactionSummary(sanitized)
  };
}

const port = Number(process.env.PORT || 3030);

const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/guidance") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        const payload = JSON.parse(body || "{}");
        const response = generateGuidance({
          ...payload,
          pageSnapshot: sanitizeSnapshot(payload.pageSnapshot || {})
        });
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8"
        });
        res.end(JSON.stringify(response));
      } catch (error) {
        res.writeHead(400, {
          "Content-Type": "application/json; charset=utf-8"
        });
        res.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : "Bad request"
          })
        );
      }
    });
    return;
  }

  res.writeHead(404, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(port, () => {
  console.log(`SEMrush AI Coach server listening on http://localhost:${port}`);
});
