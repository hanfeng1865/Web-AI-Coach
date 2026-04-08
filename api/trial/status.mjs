import { handleTrialStatusRequest } from "../../server/trial-service.mjs";

export default async function handler(req, res) {
  try {
    const result = await handleTrialStatusRequest(req.query?.installId);
    res.status(result.status).json(result.body);
  } catch (error) {
    res.status(500).json({
      error: {
        code: "TRIAL_STATUS_ERROR",
        message: error instanceof Error ? error.message : "Server error"
      }
    });
  }
}
