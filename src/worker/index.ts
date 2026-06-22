export interface Env {
  APP_ASSETS: { fetch: (request: Request) => Promise<Response> };
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return json({
        ok: true,
        name: 'vidframes',
        version: '0.0.1',
        bindings: { assets: !!env.APP_ASSETS },
      });
    }

    if (env.APP_ASSETS) {
      return env.APP_ASSETS.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  },
};
