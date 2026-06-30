// api/copilot.ts
//
// Vercel Edge Function — AI Recruiting Copilot proxy.
//
// Why an Edge Function: the Claude API key must never be exposed to the browser.
// This route accepts { messages, context } from the frontend, attaches a system
// prompt built from live ranking/candidate data, calls the Claude API with
// streaming enabled, and re-streams plain-text deltas back to the client as SSE.
//
// Setup:
//   1. `vercel env add ANTHROPIC_API_KEY` (or set it in the Vercel dashboard)
//   2. Deploy. No other config needed — this route ships alongside your app.

export const config = { runtime: 'edge' };

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1024;

function buildSystemPrompt(context: any): string {
  const safeContext = JSON.stringify(context ?? {}, null, 2).slice(0, 14000);

  return `You are Nexus AI, the embedded recruiting copilot inside the Nexus AI Recruiter platform.

You help recruiters by answering questions about candidate rankings, resumes, scoring breakdowns, hiring recommendations, candidate comparisons, JD analysis, interview question generation, email drafting, and pipeline analytics — using ONLY the live data provided below. Never invent candidate facts that aren't in the context.

Rules:
- Be concise and scannable. Prefer short bullet points over long paragraphs.
- When discussing a candidate's score, ground your explanation in the actual "breakdown" fields (career, description, skills, jd_fit, assessments, experience, location, education, behavioral_mult) provided in context — don't make up numbers.
- If the user asks something the context can't answer (e.g. data not present), say so plainly instead of guessing.
- When asked to draft an email, write a complete, ready-to-send draft with a subject line.
- When asked for interview questions, group them by topic.
- When asked for a hiring recommendation, give a YES/NO/MAYBE, a confidence percentage, 3-5 reasons, and any concerns — based on the candidate's actual signals in context.
- If no specific candidate is named, default to the top-ranked candidate (rank 1) in "top_candidates", unless "focus_candidate" is provided (meaning the recruiter currently has a specific candidate open) — prefer focus_candidate when present.
- Use markdown-style formatting: **bold** for emphasis and "- " bullet lists. Keep responses under ~250 words unless the user asks for something longer (like an email or full interview question set).

LIVE PIPELINE CONTEXT (JSON):
${safeContext}`;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Server is missing ANTHROPIC_API_KEY. Set it in your Vercel project env vars.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const { messages, context } = body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: '"messages" must be a non-empty array' }), { status: 400 });
  }

  // Anthropic only wants role/content pairs, alternating user/assistant.
  const cleanMessages = messages
    .filter((m: any) => m && typeof m.content === 'string' && m.content.trim().length > 0)
    .map((m: any) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

  let anthropicRes: Response;
  try {
    anthropicRes = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: buildSystemPrompt(context),
        messages: cleanMessages,
        stream: true,
      }),
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: 'Failed to reach Claude API: ' + (e?.message || 'unknown error') }), { status: 502 });
  }

  if (!anthropicRes.ok || !anthropicRes.body) {
    const errText = await anthropicRes.text().catch(() => 'Unknown error from Claude API');
    return new Response(JSON.stringify({ error: errText }), { status: anthropicRes.status || 500 });
  }

  const reader = anthropicRes.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (!data || data === '[DONE]') continue;

            try {
              const evt = JSON.parse(data);
              if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: evt.delta.text })}\n\n`));
              } else if (evt.type === 'error') {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: evt.error?.message || 'Claude API error' })}\n\n`));
              }
            } catch {
              // Ignore malformed/partial SSE fragments — they'll complete on the next chunk.
            }
          }
        }
      } catch (e: any) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: e?.message || 'Stream interrupted' })}\n\n`));
      } finally {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
