import { createServer } from "node:http";
import {
  createJsonResponse,
  handleGuidanceRequest,
  handleTrialChatRequest,
  handleTrialStatusRequest,
  readRequestJson
} from "./trial-service.mjs";

const port = Number(process.env.PORT || 3030);

function sendJson(res, result) {
  res.writeHead(result.status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
  });
  res.end(JSON.stringify(result.body));
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      sendJson(res, createJsonResponse(204, { ok: true }));
      return;
    }

    if (req.method === "POST" && req.url === "/api/guidance") {
      sendJson(res, await handleGuidanceRequest(await readRequestJson(req)));
      return;
    }

    if (req.method === "GET" && req.url?.startsWith("/api/trial/status")) {
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      sendJson(res, await handleTrialStatusRequest(url.searchParams.get("installId")));
      return;
    }

    if (req.method === "POST" && req.url === "/api/trial/chat") {
      sendJson(res, await handleTrialChatRequest(await readRequestJson(req)));
      return;
    }

    sendJson(res, createJsonResponse(404, { error: "Not found" }));
  } catch (error) {
    sendJson(res, createJsonResponse(500, {
      error: {
        code: "TRIAL_SERVER_ERROR",
        message: error instanceof Error ? error.message : "Server error"
      }
    }));
  }
});

server.listen(port, () => {
  console.log(`AI Coach server listening on http://localhost:${port}`);
  console.log(`Trial status endpoint: http://localhost:${port}/api/trial/status`);
  console.log(`Trial chat endpoint: http://localhost:${port}/api/trial/chat`);
});
