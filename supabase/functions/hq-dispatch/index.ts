import { createHandler } from './handler.mjs';
Deno.serve(createHandler({
  env: (name: string) => Deno.env.get(name),
  waitUntil: (promise: Promise<unknown>) => EdgeRuntime.waitUntil(promise)
}));

