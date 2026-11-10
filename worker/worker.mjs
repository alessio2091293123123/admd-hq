// Node 22+, no dependencies. No model/provider is enabled by default.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const BOTS = new Set(['pixel','forge','guard','critic','planner','finance','spark','leno']);

export function createRpc({ url, key, fetchImpl = fetch }) {
  const base = new URL(url);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash ||
      base.pathname !== '/') throw new Error('Expected an HTTPS Supabase project origin');
  if (!key) throw new Error('Missing server-only Supabase key');
  return async (name, args) => {
    const response = await fetchImpl(new URL('/rest/v1/rpc/' + name, base), {
      method: 'POST',
      headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error('RPC ' + name + ' failed (HTTP ' + response.status + ')');
    return response.json();
  };
}

export async function runOnce({ bot, handlers, rpc }) {
  if (!BOTS.has(bot) || typeof handlers?.[bot] !== 'function')
    throw new Error('Configure an explicit handler for a known bot before claiming work');
  const task = await rpc('hq_claim', { p_bot: bot });
  if (task === null) return { status: 'idle' };
  if (!task || task.bot !== bot || typeof task.id !== 'string' ||
      typeof task.text !== 'string' || typeof task.claim_token !== 'string')
    throw new Error('Invalid claim; stopped without executing');
  // Do not pass database credentials, the RPC client, or the claim token to the handler.
  // Handlers must treat text as untrusted input and implement their own tool permissions.
  const result = await handlers[bot](Object.freeze({ id: task.id, bot, text: task.text }));
  if (typeof result !== 'string' || !result.trim() || result.length > 100000)
    throw new Error('Handler must return a nonempty result up to 100000 characters');
  const saved = await rpc('hq_finish', {
    p_id: task.id, p_claim_token: task.claim_token, p_result: result
  });
  if (saved !== true) throw new Error('Result rejected; task requires operator review');
  return { status: 'completed', id: task.id };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { HQ_BOT: bot, HQ_HANDLER_MODULE: modulePath, SUPABASE_URL: url,
      SUPABASE_SERVER_KEY: key } = process.env;
    if (!modulePath) throw new Error('Set HQ_HANDLER_MODULE to a trusted local module exporting handlers');
    const { handlers } = await import(pathToFileURL(resolve(modulePath)).href);
    const outcome = await runOnce({ bot, handlers, rpc: createRpc({ url, key }) });
    console.log(JSON.stringify(outcome));
  } catch (error) {
    // Avoid logging arbitrary handler errors, task content, credentials or tokens.
    console.error('HQ worker stopped. Check configuration and review claimed tasks before retrying.');
    process.exitCode = 1;
  }
}
