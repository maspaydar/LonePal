import { Router } from "express";
import { storage } from "../storage";
import { log } from "../logger-util";
import {
  authorizeServiceProvider,
  extractRequestingProviderId,
  SETUP_ALLOWED_STATUSES,
} from "../services/provider-authorization";
import { pingGeminiKey, clearEntityAiClient } from "../ai-engine";
import { encryptSecret } from "../crypto";

const router = Router();

// Providers we can validate + initialize today. The schema leaves room for more
// (e.g. "anthropic", "openai"); add them here once a validation path exists.
const SUPPORTED_AI_PROVIDERS = ["google-gemini"];

// POST /api/service-providers/config-ai
//
// Lets a certified/approved agent_sp configure a subscriber-owned ("bring your
// own key") AI provider for a single entity. The acting provider is authorized
// against the target entity (which also enforces tenant isolation — a provider
// can only configure the entity it belongs to). The supplied key is validated
// with a live "ping" before being encrypted at rest and persisted. The key is
// never echoed back in the response.
router.post("/config-ai", async (req, res) => {
  try {
    const entityId = Number(req.body?.entityId);
    if (!Number.isInteger(entityId) || entityId <= 0) {
      return res.status(400).json({ error: "A valid entityId is required" });
    }

    const auth = await authorizeServiceProvider({
      entityId,
      serviceProviderId: extractRequestingProviderId(req),
      allowedStatuses: SETUP_ALLOWED_STATUSES,
      requiredType: "agent_sp",
      action: `configure AI provider for entity ${entityId}`,
    });
    if (!auth.ok) {
      return res.status(auth.httpStatus ?? 403).json({ error: auth.error });
    }

    const aiProvider =
      typeof req.body?.ai_provider === "string" && req.body.ai_provider.trim()
        ? req.body.ai_provider.trim()
        : "google-gemini";
    const apiKey = req.body?.api_key;
    const aiModelOverride =
      typeof req.body?.ai_model_override === "string" && req.body.ai_model_override.trim()
        ? req.body.ai_model_override.trim()
        : null;

    if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
      return res.status(400).json({ error: "api_key is required" });
    }
    if (!SUPPORTED_AI_PROVIDERS.includes(aiProvider)) {
      return res.status(400).json({
        error: `Unsupported ai_provider '${aiProvider}'. Supported: ${SUPPORTED_AI_PROVIDERS.join(", ")}`,
      });
    }

    // Live validation: confirm the key is valid and not rate-limited before we
    // persist it, using a throwaway isolated client.
    const ping = await pingGeminiKey(apiKey.trim(), aiModelOverride || undefined);
    if (!ping.ok) {
      log(
        `AI key validation failed for entity ${entityId} (provider ${aiProvider}): ${ping.error}`,
        "service-providers",
      );
      return res.status(400).json({ error: `API key validation failed: ${ping.error}` });
    }

    const encryptedApiKey = encryptSecret(apiKey.trim());
    const updated = await storage.updateEntity(entityId, {
      aiProvider,
      encryptedApiKey,
      aiModelOverride,
    });
    if (!updated) {
      return res.status(404).json({ error: "Entity not found" });
    }

    // Drop any cached client/model so the next AI call rebuilds with the new key.
    clearEntityAiClient(entityId);

    log(
      `AI provider configured for entity ${entityId} by agent_sp ${auth.provider?.id} (provider ${aiProvider}${
        aiModelOverride ? `, model ${aiModelOverride}` : ""
      })`,
      "service-providers",
    );

    return res.json({
      success: true,
      entityId,
      aiProvider,
      aiModelOverride,
    });
  } catch (error: any) {
    log(`config-ai failed: ${error?.message || error}`, "service-providers");
    return res.status(500).json({ error: "Failed to configure AI provider" });
  }
});

export default router;
