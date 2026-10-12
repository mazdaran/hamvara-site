// Deliberately has no D1, R2, AI, service bindings, cron or application imports.
export default {
  fetch() {
    return new Response('Isolated preview: application data access is disabled. Use the dedicated pilot environment for acceptance testing.', {
      status: 503,
      headers: {'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}
    });
  }
};
