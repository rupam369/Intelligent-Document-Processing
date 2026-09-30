/**
 * Configurable AI provider client.
 *
 * The provider is selected with the AI_PROVIDER environment variable and the
 * key lives only on the backend (AI_API_KEY) - it is never sent to the browser.
 *
 * Supported providers:
 *   - mock        : built-in heuristic engine (no network, no key)
 *   - openai      : https://api.openai.com/v1/chat/completions
 *   - anthropic   : https://api.anthropic.com/v1/messages
 *   - gemini      : Google Generative Language API
 *   - openrouter  : https://openrouter.ai/api/v1/chat/completions
 */
import { config, isAiConfigured } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { UpstreamError } from '../utils/errors.js';

const DEFAULT_MODELS = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-latest',
  gemini: 'gemini-1.5-flash',
  openrouter: 'openai/gpt-4o-mini',
};

const DEFAULT_BASE_URLS = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  openrouter: 'https://openrouter.ai/api/v1',
};

export function getProviderInfo() {
  return {
    provider: config.ai.provider,
    model: config.ai.model || DEFAULT_MODELS[config.ai.provider] || 'heuristic-engine',
    configured: isAiConfigured(),
    demoMode: !isAiConfigured(),
  };
}

/** Performs a fetch with an abort-based timeout. */
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function buildRequestBody(provider, { systemPrompt, userPrompt, images, temperature, maxTokens, jsonMode }) {
  const model = config.ai.model || DEFAULT_MODELS[provider] || DEFAULT_MODELS.openai;

  if (provider === 'anthropic') {
    const content = [{ type: 'text', text: userPrompt }];
    for (const image of images || []) {
      content.unshift({
        type: 'image',
        source: { type: 'base64', media_type: image.mimeType, data: image.data },
      });
    }
    return {
      url: `${config.ai.baseUrl || DEFAULT_BASE_URLS.anthropic}/messages`,
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': config.ai.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens ?? 4096,
          temperature: temperature ?? 0.1,
          system: systemPrompt || undefined,
          messages: [{ role: 'user', content }],
        }),
      },
    };
  }

  if (provider === 'gemini') {
    const parts = [{ text: `${systemPrompt ? `${systemPrompt}\n\n` : ''}${userPrompt}` }];
    for (const image of images || []) {
      parts.push({ inline_data: { mime_type: image.mimeType, data: image.data } });
    }
    return {
      url: `${config.ai.baseUrl || DEFAULT_BASE_URLS.gemini}/models/${model}:generateContent?key=${config.ai.apiKey}`,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: {
            temperature: temperature ?? 0.1,
            maxOutputTokens: maxTokens ?? 4096,
            ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
          },
        }),
      },
    };
  }

  // OpenAI-compatible (openai, openrouter)
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  const userContent = [{ type: 'text', text: userPrompt }];
  for (const image of images || []) {
    userContent.unshift({
      type: 'image_url',
      image_url: { url: `data:${image.mimeType};base64,${image.data}` },
    });
  }
  messages.push({ role: 'user', content: images?.length ? userContent : userPrompt });

  return {
    url: `${config.ai.baseUrl || DEFAULT_BASE_URLS[provider]}/chat/completions`,
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.ai.apiKey}`,
        ...(provider === 'openrouter' ? { 'HTTP-Referer': 'https://docuflow.ai', 'X-Title': 'DocuFlow AI' } : {}),
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: temperature ?? 0.1,
        max_tokens: maxTokens ?? 4096,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
    },
  };
}

/** Normalises provider-specific envelopes into plain text. */
function readResponseText(provider, payload) {
  try {
    if (provider === 'anthropic') {
      return (payload.content || []).map((block) => block.text || '').join('').trim();
    }
    if (provider === 'gemini') {
      const parts = payload?.candidates?.[0]?.content?.parts || [];
      return parts.map((part) => part.text || '').join('').trim();
    }
    return payload?.choices?.[0]?.message?.content?.trim() || '';
  } catch {
    return '';
  }
}

/**
 * Sends a prompt to the configured AI provider.
 * @returns {Promise<{text: string, provider: string, model: string, usage: object|null}>}
 */
export async function complete({
  systemPrompt,
  userPrompt,
  images = [],
  temperature = 0.1,
  maxTokens = 4096,
  jsonMode = false,
  retries = config.ai.maxRetries,
}) {
  if (!isAiConfigured()) {
    throw new UpstreamError('AI provider', new Error('No AI provider configured'));
  }

  const provider = config.ai.provider;
  const { url, init } = buildRequestBody(provider, {
    systemPrompt,
    userPrompt,
    images,
    temperature,
    maxTokens,
    jsonMode,
  });

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, init, config.ai.timeoutMs);
      const raw = await response.text();
      if (!response.ok) {
        // 4xx (except 429) is a permanent problem - do not retry.
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          logger.error('AI provider rejected request', { provider, status: response.status });
          throw new UpstreamError('AI provider', new Error(`HTTP ${response.status}`));
        }
        lastError = new Error(`HTTP ${response.status}`);
      } else {
        const payload = JSON.parse(raw);
        const text = readResponseText(provider, payload);
        if (!text) {
          lastError = new Error('Empty completion');
        } else {
          return {
            text,
            provider,
            model: config.ai.model || DEFAULT_MODELS[provider],
            usage: payload.usage || payload.usageMetadata || null,
          };
        }
      }
    } catch (error) {
      if (error instanceof UpstreamError) throw error;
      lastError = error;
    }
    if (attempt < retries) {
      const backoff = 500 * 2 ** attempt;
      logger.warn('AI call failed, retrying', { provider, attempt: attempt + 1, backoffMs: backoff });
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }

  logger.error('AI provider call failed after retries', { provider, error: lastError?.message });
  throw new UpstreamError('AI provider', lastError);
}

/** Calls the AI provider and parses the reply as JSON. */
export async function completeJson(options) {
  const result = await complete({ ...options, jsonMode: true, temperature: options.temperature ?? 0.1 });
  return { ...result, parsed: options.parse(result.text) };
}

export default { complete, completeJson, getProviderInfo };
