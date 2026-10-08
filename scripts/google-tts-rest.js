import { GoogleAuth } from "google-auth-library";
import { ProxyAgent, fetch } from "undici";

const GOOGLE_TTS_REST_ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
const PROXY_ENV_KEYS = ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"];

function maskProxyUrl(value) {
  if (!value) return "";

  try {
    const url = new URL(value);
    if (url.username) {
      url.username = "***";
    }
    if (url.password) {
      url.password = "***";
    }
    return url.toString();
  } catch {
    if (value.length <= 80) return value;
    return `${value.slice(0, 77)}...`;
  }
}

function resolveProxyFromEnv() {
  for (const key of PROXY_ENV_KEYS) {
    const value = String(process.env[key] || "").trim();
    if (value) {
      return {
        enabled: true,
        envKey: key,
        rawUrl: value,
        maskedUrl: maskProxyUrl(value)
      };
    }
  }

  return {
    enabled: false,
    envKey: "",
    rawUrl: "",
    maskedUrl: ""
  };
}

function getQuotaProjectOrThrow() {
  const quotaProject = String(process.env.GOOGLE_CLOUD_QUOTA_PROJECT || "").trim();
  if (!quotaProject) {
    throw new Error("GOOGLE_CLOUD_QUOTA_PROJECT is required.");
  }
  return quotaProject;
}

function getCredentialsPath() {
  return String(process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();
}

function buildTimeoutError(timeoutMs) {
  return new Error(`Google TTS REST request timeout after ${timeoutMs}ms`);
}

export function isTimeoutLikeError(error) {
  const message = String(error instanceof Error ? error.message : error).toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("deadline exceeded") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export function formatErrorDetails(error) {
  if (error instanceof Error) {
    return error.stack || error.message;
  }
  return String(error);
}

export async function createGoogleTtsRestClient() {
  const quotaProject = getQuotaProjectOrThrow();
  const proxy = resolveProxyFromEnv();
  const credentialsPath = getCredentialsPath();
  const auth = new GoogleAuth({ scopes: [GOOGLE_SCOPE] });
  const authClient = await auth.getClient();
  const dispatcher = proxy.enabled ? new ProxyAgent(proxy.rawUrl) : undefined;

  return {
    config: {
      endpoint: GOOGLE_TTS_REST_ENDPOINT,
      quotaProject,
      credentialsPath,
      proxyEnabled: proxy.enabled,
      proxyEnvKey: proxy.envKey,
      proxyMaskedUrl: proxy.maskedUrl
    },
    async synthesizeSpeech({
      text,
      voice,
      audioConfig,
      timeoutMs
    }) {
      if (!text) {
        throw new Error("Google TTS REST request text is empty.");
      }

      const accessTokenValue = await authClient.getAccessToken();
      const accessToken =
        typeof accessTokenValue === "string" ? accessTokenValue : accessTokenValue?.token;

      if (!accessToken) {
        throw new Error("Unable to obtain ADC access token.");
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(GOOGLE_TTS_REST_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "x-goog-user-project": quotaProject
          },
          body: JSON.stringify({
            input: { text },
            voice,
            audioConfig
          }),
          signal: controller.signal,
          ...(dispatcher ? { dispatcher } : {})
        });

        const responseText = await response.text();
        let payload = {};

        if (responseText) {
          try {
            payload = JSON.parse(responseText);
          } catch {
            throw new Error(
              `Google TTS REST returned non-JSON body (${response.status} ${response.statusText}): ${responseText}`
            );
          }
        }

        if (!response.ok) {
          throw new Error(
            `Google TTS REST failed (${response.status} ${response.statusText}): ${JSON.stringify(payload)}`
          );
        }

        if (!payload.audioContent) {
          throw new Error(`Google TTS REST response missing audioContent: ${JSON.stringify(payload)}`);
        }

        return payload.audioContent;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw buildTimeoutError(timeoutMs);
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    },
    async close() {
      if (dispatcher && typeof dispatcher.close === "function") {
        await dispatcher.close();
      }
    }
  };
}
