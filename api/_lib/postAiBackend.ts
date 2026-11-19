import { GoogleGenAI } from '@google/genai';
import { verifyFirebaseBearerToken } from './statusBackend.ts';

export const AVAILABLE_GEMINI_IMAGE_MODELS = [
  'gemini-3.1-flash-lite-image',
  'gemini-3.1-flash-image',
  'gemini-3-pro-image',
  'gemini-2.5-flash-image',
];

export const POST_AI_PHOTO_MODEL = 'gemini-3.1-flash-lite-image';
const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_PROMPT_LENGTH = 600;
const MAX_IMAGE_BASE64_CHARS = 12 * 1024 * 1024;

export interface PostAiCapabilityStatus {
  ok: true;
  configured: boolean;
  provider: 'google-gemini';
  photoSupported: boolean;
  photoModel: string;
  supportedModels: string[];
  videoSupported: boolean;
  videoReason: string;
  missingEnv: string[];
}

export function getPostAiCapabilityStatus(): PostAiCapabilityStatus {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  const configured = Boolean(apiKey);
  return {
    ok: true,
    configured,
    provider: 'google-gemini',
    photoSupported: configured,
    photoModel: POST_AI_PHOTO_MODEL,
    supportedModels: AVAILABLE_GEMINI_IMAGE_MODELS,
    videoSupported: false,
    videoReason:
      'Video AI generation/prompt editing is not configured in KING backend. Photo editing uses Gemini Image, which processes still images only.',
    missingEnv: configured ? [] : ['GEMINI_API_KEY'],
  };
}

function buildPhotoInstruction(prompt: string, presetAction?: string): string {
  const cleanPrompt = prompt.trim();
  const actionContext =
    typeof presetAction === 'string' && presetAction.trim()
      ? `Requested tool: ${presetAction.trim()}. `
      : '';
  return [
    'Edit the provided user photo faithfully according to these instructions while preserving the main subject identity and natural proportions unless explicitly asked to change them.',
    actionContext + cleanPrompt,
    'Return the edited image directly.',
  ].join(' ');
}

function parseGeminiUpstreamError(err: any): {
  status: number;
  code: string;
  message: string;
  retryable: boolean;
} {
  const rawMessage = String(err?.message || err || 'AI processing failed.');
  const statusCode = Number(err?.status || err?.code || 0);

  if (
    statusCode === 403 ||
    statusCode === 400 ||
    rawMessage.includes('PERMISSION_DENIED') ||
    rawMessage.includes('API_KEY_INVALID')
  ) {
    return {
      status: 403,
      code: 'GEMINI_KEY_INVALID',
      message:
        'Gemini API key was rejected or lacks permission. Please verify GEMINI_API_KEY in server secrets.',
      retryable: false,
    };
  }

  if (statusCode === 429 || rawMessage.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      code: 'GEMINI_QUOTA_EXCEEDED',
      message:
        'AI editing quota or rate limit exceeded on the configured Gemini API key. Please wait and try again.',
      retryable: true,
    };
  }

  if (statusCode === 404 || rawMessage.includes('NOT_FOUND')) {
    return {
      status: 502,
      code: 'GEMINI_MODEL_UNAVAILABLE',
      message: `Configured Gemini image model (${POST_AI_PHOTO_MODEL}) is unavailable for this API key.`,
      retryable: false,
    };
  }

  if (statusCode >= 500) {
    return {
      status: 502,
      code: 'GEMINI_UPSTREAM_ERROR',
      message: 'AI editing service experienced a temporary upstream error. Please try again.',
      retryable: true,
    };
  }

  return {
    status: 500,
    code: 'GEMINI_EDIT_FAILED',
    message: rawMessage || 'Could not process AI photo edit.',
    retryable: false,
  };
}

export async function handlePostAiPhotoEdit(params: {
  authHeader?: string | string[];
  body: any;
}): Promise<{
  status: number;
  payload: Record<string, any>;
}> {
  const caller = await verifyFirebaseBearerToken(params.authHeader);
  if (!caller) {
    return {
      status: 401,
      payload: {
        ok: false,
        code: 'AUTH_REQUIRED',
        error: 'Please sign in to use KING AI photo editing.',
      },
    };
  }

  const cap = getPostAiCapabilityStatus();
  if (!cap.configured) {
    return {
      status: 503,
      payload: {
        ok: false,
        code: 'AI_PROVIDER_NOT_CONFIGURED',
        missingEnv: cap.missingEnv,
        error:
          'KING AI Photo Editor backend is not connected yet. Configure GEMINI_API_KEY in server environment secrets.',
      },
    };
  }

  const body = params.body || {};
  const mediaType = String(body.mediaType || 'photo').toLowerCase();
  if (mediaType === 'video') {
    return {
      status: 400,
      payload: {
        ok: false,
        code: 'VIDEO_AI_UNSUPPORTED',
        error:
          'Prompt-based AI video editing is not supported yet. Use Trim, Filters, Music, Text, or Emoji in the Post Editor.',
      },
    };
  }

  const rawPrompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!rawPrompt) {
    return {
      status: 400,
      payload: {
        ok: false,
        code: 'INVALID_PROMPT',
        error: 'Describe what you want to change first.',
      },
    };
  }
  if (rawPrompt.length > MAX_PROMPT_LENGTH) {
    return {
      status: 400,
      payload: {
        ok: false,
        code: 'PROMPT_TOO_LONG',
        error: `Prompt must be ${MAX_PROMPT_LENGTH} characters or less.`,
      },
    };
  }

  const mimeType = typeof body.mimeType === 'string' ? body.mimeType.trim().toLowerCase() : '';
  if (!ALLOWED_IMAGE_MIMES.has(mimeType)) {
    return {
      status: 400,
      payload: {
        ok: false,
        code: 'UNSUPPORTED_IMAGE_TYPE',
        error: 'Only JPEG, PNG, and WebP photos are supported by AI editing.',
      },
    };
  }

  const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64.trim() : '';
  if (!imageBase64 || imageBase64.length > MAX_IMAGE_BASE64_CHARS) {
    return {
      status: 400,
      payload: {
        ok: false,
        code: 'INVALID_IMAGE_PAYLOAD',
        error: 'Photo payload is missing or too large. Please try a smaller photo.',
      },
    };
  }

  const ai = new GoogleGenAI({
    apiKey: (process.env.GEMINI_API_KEY || '').trim(),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const instruction = buildPhotoInstruction(rawPrompt, body.presetAction);
  let lastError: any = null;

  for (const modelId of AVAILABLE_GEMINI_IMAGE_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model: modelId,
        contents: {
          parts: [
            {
              inlineData: {
                data: imageBase64,
                mimeType,
              },
            },
            {
              text: instruction,
            },
          ],
        },
      });

      const parts = response?.candidates?.[0]?.content?.parts ?? [];
      let outputBase64 = '';
      let outputMime = 'image/png';
      let modelNote = '';

      for (const part of parts) {
        if (part?.inlineData?.data && !outputBase64) {
          outputBase64 = part.inlineData.data;
          outputMime = part.inlineData.mimeType || 'image/png';
        } else if (typeof part?.text === 'string' && part.text.trim()) {
          modelNote = modelNote ? `${modelNote} ${part.text.trim()}` : part.text.trim();
        }
      }

      if (outputBase64) {
        return {
          status: 200,
          payload: {
            ok: true,
            provider: 'google-gemini',
            model: modelId,
            imageBase64: outputBase64,
            mimeType: outputMime,
            note: modelNote || undefined,
          },
        };
      }
    } catch (err: any) {
      lastError = err;
      const parsed = parseGeminiUpstreamError(err);
      if (parsed.status === 403) {
        return {
          status: 403,
          payload: {
            ok: false,
            code: parsed.code,
            error: parsed.message,
          },
        };
      }
      // Try next model in fallback chain
      continue;
    }
  }

  const fallback = parseGeminiUpstreamError(lastError);
  return {
    status: fallback.status,
    payload: {
      ok: false,
      code: fallback.code,
      error: fallback.message || 'All available Gemini image models exhausted quota or failed.',
    },
  };
}
