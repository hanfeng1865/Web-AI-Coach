import { handleTrialChatRequest, readRequestJson } from "../../server/trial-service.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: { code: "METHOD_NOT_ALLOWED", message: "Use POST" } });
    return;
  }

  try {
    const result = await handleTrialChatRequest(await readRequestJson(req));
    res.status(result.status).json(result.body);
  } catch (error) {
    res.status(500).json({
      error: {
        code: "TRIAL_CHAT_ERROR",
        message: error instanceof Error ? error.message : "Server error"
      }
    });
  }
}
