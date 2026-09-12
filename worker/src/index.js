import { handleMrpRequest, runScheduledMrpBackups } from './mrp.js';
import { handleTariffRequest } from './tariff.js';

const PROVIDERS = {
  google: {
    authorization: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    clientId: 'GOOGLE_CLIENT_ID',
    clientSecret: 'GOOGLE_CLIENT_SECRET',
    scopes: ['openid','email','profile','https://www.googleapis.com/auth/webmasters.readonly','https://www.googleapis.com/auth/analytics.readonly']
  },
  linkedin: {
    authorization: 'https://www.linkedin.com/oauth/v2/authorization',
    token: 'https://www.linkedin.com/oauth/v2/accessToken',
    clientId: 'LINKEDIN_CLIENT_ID',
    clientSecret: 'LINKEDIN_CLIENT_SECRET',
    scopes: ['openid','profile','email']
  },
  wordpress: {
    authorization: 'https://public-api.wordpress.com/oauth2/authorize',
    token: 'https://public-api.wordpress.com/oauth2/token',
    clientId: 'WORDPRESS_CLIENT_ID',
    clientSecret: 'WORDPRESS_CLIENT_SECRET',
    scopes: []
  }
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      let response;
      if (url.pathname === '/health') response = json({ ok: true, service: 'hamvara-growth-api', pageSpeedApiKeyConfigured: Boolean(env.PAGESPEED_API_KEY), oauthConfigured: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.OAUTH_STATE_SECRET && env.TOKEN_ENCRYPTION_KEY), databaseConfigured: Boolean(env.DB), tariffRolesConfigured: Boolean(env.TARIFF_SYNC_TOKEN && env.TARIFF_SYNC_ACTOR && env.TARIFF_PREPARER_TOKEN && env.TARIFF_PREPARER_ACTOR && env.TARIFF_REVIEWER_TOKEN && env.TARIFF_REVIEWER_ACTOR && env.TARIFF_PUBLISHER_TOKEN && env.TARIFF_PUBLISHER_ACTOR), aiConfigured: Boolean(env.AI), time: new Date().toISOString() });
      else if (url.pathname === '/api/audit' && request.method === 'POST') response = await audit(request, env);
      else if (url.pathname === '/api/sku-bridge/analyze' && request.method === 'POST') response = await analyzeSkuColumns(request, env);
      else if (url.pathname === '/api/claimpilot/analyze' && request.method === 'POST') response = await analyzeClaimDocuments(request, env);
      else if (url.pathname === '/api/deadlineguard/analyze' && request.method === 'POST') response = await analyzeDeadlineDocument(request, env);
      else if (url.pathname === '/api/loadfit/analyze' && request.method === 'POST') response = await analyzeLoadFit(request, env);
      else if (url.pathname === '/api/integrations' && request.method === 'GET') response = await integrationStatuses(env);
      else if (url.pathname === '/api/google/overview' && request.method === 'GET') response = await googleOverview(url, env);
      else if (/^\/api\/integrations\/(google|meta|linkedin|wordpress)\/test$/.test(url.pathname) && request.method === 'GET') response = await testIntegration(url.pathname.split('/')[3], env);
      else if (/^\/api\/oauth\/(google|meta|linkedin|wordpress)\/start$/.test(url.pathname)) response = await oauthStart(request, env);
      else if (/^\/api\/oauth\/(google|meta|linkedin|wordpress)\/callback$/.test(url.pathname)) response = await oauthCallback(request, env);
      else if (url.pathname.startsWith('/api/tariff/')) response = await handleTariffRequest(request, env, url);
      else if (url.pathname.startsWith('/api/mrp/')) response = await handleMrpRequest(request, env, url);
      else response = json({ error: 'Not found' }, 404);
      const headers = new Headers(response.headers); Object.entries(cors).forEach(([k,v]) => headers.set(k,v));
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      console.error(error);
      return json({ error: error.message || 'Unexpected server error' }, error.status || 500, cors);
    }
  },
  async scheduled(controller, env, ctx) {
    const scheduledAt = new Date(controller.scheduledTime).toISOString();
    // Tariff collection is intentionally manual in phase 1. Scheduled events are
    // reserved for operational MRP backups and must never mutate tariff staging.
    ctx.waitUntil(runScheduledMrpBackups(env, scheduledAt));
  }
};





async function analyzeDeadlineDocument(request, env) {
  if (!env.AI) throw httpError(503, 'Workers AI binding is not configured.');
  const body = await request.json();
  const fileName = cleanCell(body.fileName, 140) || 'trade-document';
  const mimeType = cleanCell(body.mimeType, 100) || 'application/octet-stream';
  const documentRole = cleanCell(body.documentRole, 50) || 'other';
  const context = cleanCell(body.context, 700);
  const encoded = String(body.dataBase64 || '');
  if (!encoded || !/^[A-Za-z0-9+/=\s]+$/.test(encoded)) throw httpError(400, 'A valid document is required.');
  let binary;
  try { binary = atob(encoded.replace(/\s/g, '')); } catch { throw httpError(400, 'Invalid document encoding.'); }
  if (binary.length > 5 * 1024 * 1024) throw httpError(413, 'The document exceeds the 5 MB beta limit.');
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  let documentText = '';
  if (/^(text\/|application\/(csv|json))/.test(mimeType)) {
    documentText = new TextDecoder().decode(bytes);
  } else {
    let conversion;
    try {
      conversion = await env.AI.toMarkdown({ name: fileName, blob: new Blob([bytes], { type: mimeType }) });
    } catch {
      throw httpError(502, 'The document could not be read. Use a clear PDF, image, Excel, CSV or text file.');
    }
    const converted = Array.isArray(conversion) ? conversion[0] : conversion;
    if (!converted || converted.format === 'error' || !String(converted.data || '').trim()) {
      throw httpError(502, cleanCell(converted?.error, 240) || 'No readable text was found in the document.');
    }
    documentText = String(converted.data);
  }
  documentText = documentText.slice(0, 18000);
  const prompt = [
    'Extract trade deadlines from the supplied document and return strict JSON only.',
    'Do not invent dates, parties, references, obligations or conditions.',
    'Use YYYY-MM-DD only when the source supports a calendar date. Otherwise use an empty string.',
    'A conditional date must be marked conditional=true and its trigger explained in condition.',
    'Source excerpt must be a short faithful excerpt or close factual rendering of the relevant document text.',
    'Return at most 20 deadlines and this exact shape:',
    '{"project":"","counterparty":"","reference":"","deadlines":[{"title":"","date":"YYYY-MM-DD or empty","owner":"","category":"Shipment|Contract|Payment|Insurance|Certificate|Inspection|Claim|Customs|Other","importance":"high|medium|low","sourceExcerpt":"","confidence":0.0,"conditional":false,"condition":""}]}',
    'High importance means missing the date could plausibly block shipment, payment, insurance coverage, document presentation, customs action or a contractual claim.',
    'Document role: ' + documentRole,
    context ? 'User context: ' + context : '',
    'Document text: ' + documentText
  ].filter(Boolean).join('\\n');
  const model = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
  const result = await env.AI.run(model, {
    messages: [
      { role: 'system', content: 'You are a cautious international-trade deadline extraction engine. You identify document facts for human review and do not provide legal, banking, customs or insurance advice.' },
      { role: 'user', content: prompt }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        type: 'object',
        properties: {
          project: { type: 'string' },
          counterparty: { type: 'string' },
          reference: { type: 'string' },
          deadlines: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                date: { type: 'string' },
                owner: { type: 'string' },
                category: { type: 'string', enum: ['Shipment','Contract','Payment','Insurance','Certificate','Inspection','Claim','Customs','Other'] },
                importance: { type: 'string', enum: ['high','medium','low'] },
                sourceExcerpt: { type: 'string' },
                confidence: { type: 'number' },
                conditional: { type: 'boolean' },
                condition: { type: 'string' }
              },
              required: ['title','date','owner','category','importance','sourceExcerpt','confidence','conditional','condition']
            }
          }
        },
        required: ['project','counterparty','reference','deadlines']
      }
    },
    temperature: 0.1,
    max_tokens: 2200
  });
  const structured = result && typeof result.response === 'object'
    ? result.response
    : (result && typeof result.result?.response === 'object' ? result.result.response : null);
  const raw = typeof result === 'string'
    ? result
    : (typeof result?.response === 'string' ? result.response : (typeof result?.result?.response === 'string' ? result.result.response : ''));
  let parsed = structured;
  if (!parsed) {
    try { parsed = JSON.parse(extractJson(raw)); }
    catch { throw httpError(502, 'AI returned an invalid deadline response.'); }
  }
  const allowedCategories = ['Shipment','Contract','Payment','Insurance','Certificate','Inspection','Claim','Customs','Other'];
  const allowedImportance = ['high','medium','low'];
  const deadlines = (Array.isArray(parsed.deadlines) ? parsed.deadlines : []).slice(0, 20).map(item => {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(item.date || '')) ? String(item.date) : '';
    const condition = cleanCell(item.condition, 260);
    const excerpt = cleanCell(item.sourceExcerpt, 360);
    return {
      title: cleanCell(item.title, 160),
      date,
      owner: cleanCell(item.owner, 100),
      category: allowedCategories.includes(item.category) ? item.category : 'Other',
      importance: allowedImportance.includes(item.importance) ? item.importance : 'medium',
      sourceExcerpt: [excerpt, condition ? 'Condition: ' + condition : ''].filter(Boolean).join(' · '),
      confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0)),
      conditional: Boolean(item.conditional)
    };
  }).filter(item => item.title || item.date || item.sourceExcerpt);
  const extension = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
  const inputType = ['xlsx','xls','csv'].includes(extension) ? 'Excel/spreadsheet'
    : extension === 'pdf' ? 'PDF'
    : ['jpg','jpeg','png','webp'].includes(extension) ? 'image'
    : 'document';
  return json({
    project: cleanCell(parsed.project, 160) || fileName,
    counterparty: cleanCell(parsed.counterparty, 140),
    reference: cleanCell(parsed.reference, 100),
    deadlines,
    generationMethod: 'AI extraction from ' + inputType,
    source: 'Cloudflare Workers AI',
    model,
    sourceFile: fileName,
    extractedAt: new Date().toISOString(),
    requiresHumanApproval: true,
    disclaimer: 'Review every extracted date against the original document before use.'
  });
}

async function analyzeLoadFit(request, env) {
  if (!env.AI) throw httpError(503, 'Workers AI binding is not configured.');
  const body = await request.json();
  const shipment = {
    product: cleanCell(body.product, 100),
    category: cleanCell(body.category, 40),
    quantity: Math.max(0, Number(body.qty || 0)),
    loadedUnits: Math.max(0, Number(body.loadedUnits || 0)),
    cartons: Math.max(0, Number(body.cartons || 0)),
    pallets: Math.max(0, Number(body.palletCount || 0)),
    grossWeightKg: Math.max(0, Number(body.gross || 0)),
    volumeUtilizationPercent: Math.max(0, Math.min(100, Number(body.volumePct || 0))),
    payloadUtilizationPercent: Math.max(0, Math.min(100, Number(body.weightPct || 0))),
    freightCostPerUnit: Math.max(0, Number(body.costPer || 0)),
    emptyOrderUnits: Math.max(0, Number(body.empty || 0)),
    transport: cleanCell(body.tr?.name, 80),
    riskScore: Math.max(0, Math.min(100, Number(body.risk || 0))),
    conditions: {
      fragile: Boolean(body.conditions?.fragile),
      upright: Boolean(body.conditions?.upright),
      stackable: Boolean(body.conditions?.stackable),
      ventilation: Boolean(body.conditions?.ventilation),
      moistureSensitive: Boolean(body.conditions?.moisture),
      potentialDangerousGoods: Boolean(body.conditions?.hazardous),
      minimumTemperatureC: body.conditions?.tempMin === null ? null : Number(body.conditions?.tempMin),
      maximumTemperatureC: body.conditions?.tempMax === null ? null : Number(body.conditions?.tempMax),
      maximumHumidityPercent: body.conditions?.humidity === null ? null : Number(body.conditions?.humidity),
      insurance: cleanCell(body.conditions?.insurance, 30)
    }
  };
  if (!shipment.product || !shipment.transport || shipment.quantity < 1) throw httpError(400, 'A calculated shipment is required.');
  const prompt = [
    'Review this shipment-planning result and return strict JSON only.',
    'Do not recalculate geometry and do not invent regulations, carrier limits, policy coverage or certifications.',
    'Give operationally useful checks, phrased as items the user must confirm before loading.',
    'If potentialDangerousGoods is true, clearly require classification and carrier approval without guessing a UN number.',
    'If temperature or ventilation is specified, mention cold-chain or airflow verification.',
    'If insurance is none or unknown, tell the user to confirm cargo cover and exclusions.',
    'Return exactly: {"summary":"","recommendations":[""],"riskSignal":"low|medium|high","disclaimer":""}.',
    'Provide 3 to 5 concise recommendations.',
    'Shipment: ' + JSON.stringify(shipment)
  ].join('\n');
  try {
    const result = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        { role: 'system', content: 'You are a cautious cargo-planning assistant. You do not provide certified loading, dangerous-goods, insurance or legal approval.' },
        { role: 'user', content: prompt }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            recommendations: { type: 'array', items: { type: 'string' } },
            riskSignal: { type: 'string', enum: ['low','medium','high'] },
            disclaimer: { type: 'string' }
          },
          required: ['summary','recommendations','riskSignal','disclaimer']
        }
      },
      temperature: 0.1,
      max_tokens: 900
    });
    const structured = result && typeof result.response === 'object' ? result.response : (result && typeof result.result?.response === 'object' ? result.result.response : null);
    const raw = typeof result === 'string' ? result : (typeof result?.response === 'string' ? result.response : (typeof result?.result?.response === 'string' ? result.result.response : ''));
    const parsed = structured || extractJson(raw);
    return json({
      summary: cleanCell(parsed.summary, 240),
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0, 5).map(item => cleanCell(item, 220)).filter(Boolean) : [],
      riskSignal: ['low','medium','high'].includes(parsed.riskSignal) ? parsed.riskSignal : (shipment.riskScore >= 65 ? 'high' : shipment.riskScore >= 35 ? 'medium' : 'low'),
      disclaimer: cleanCell(parsed.disclaimer, 240) || 'Planning estimate only. Verify with the carrier and qualified personnel.'
    });
  } catch (error) {
    console.error('LoadFit AI review fallback:', error);
    const recommendations = ['Confirm the transport unit internal dimensions and payload with the carrier.', 'Verify packaging strength, load distribution and cargo securing before loading.'];
    if (shipment.conditions.ventilation) recommendations.push('Confirm that the loading pattern preserves required airflow.');
    if (shipment.conditions.moistureSensitive) recommendations.push('Confirm moisture barriers, desiccants and storage humidity limits.');
    if (shipment.conditions.potentialDangerousGoods) recommendations.push('Obtain dangerous-goods classification and carrier approval before booking.');
    if (shipment.conditions.insurance === 'none' || shipment.conditions.insurance === 'unknown') recommendations.push('Confirm cargo insurance scope, exclusions and declared value.');
    return json({
      summary: 'The capacity estimate is usable for planning, but handling and carrier checks remain open.',
      recommendations: recommendations.slice(0, 5),
      riskSignal: shipment.riskScore >= 65 ? 'high' : shipment.riskScore >= 35 ? 'medium' : 'low',
      disclaimer: 'Planning estimate only. Verify with the carrier and qualified personnel.'
    });
  }
}

async function analyzeClaimDocuments(request, env) {
  if (!env.AI) throw httpError(503, 'Workers AI binding is not configured.');
  const body = await request.json();
  const documents = Array.isArray(body.documents) ? body.documents.slice(0, 3) : [];
  if (!documents.length) throw httpError(400, 'At least one document is required.');
  let totalBytes = 0;
  const extracted = [];
  for (const document of documents) {
    const role = cleanCell(document.role, 40);
    const fileName = cleanCell(document.fileName, 120) || 'claim-document';
    const mimeType = cleanCell(document.mimeType, 100) || 'application/octet-stream';
    const encoded = String(document.dataBase64 || '');
    if (!/^[A-Za-z0-9+/=\s]+$/.test(encoded)) throw httpError(400, 'Invalid document encoding.');
    let binary;
    try { binary = atob(encoded.replace(/\s/g, '')); } catch { throw httpError(400, 'Invalid document encoding.'); }
    if (binary.length > 3 * 1024 * 1024) throw httpError(413, fileName + ' exceeds the 3 MB beta limit.');
    totalBytes += binary.length;
    if (totalBytes > 8 * 1024 * 1024) throw httpError(413, 'The combined document size exceeds 8 MB.');
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    let text = '';
    if (/^(text\/|application\/(csv|json))/.test(mimeType)) {
      text = new TextDecoder().decode(bytes);
    } else {
      let conversion;
      try {
        conversion = await env.AI.toMarkdown({ name: fileName, blob: new Blob([bytes], { type: mimeType }) });
      } catch {
        throw httpError(502, fileName + ' could not be read. Use a clear PDF, image, spreadsheet or text file.');
      }
      const converted = Array.isArray(conversion) ? conversion[0] : conversion;
      if (!converted || converted.format === 'error' || !String(converted.data || '').trim()) {
        throw httpError(502, cleanCell(converted?.error, 240) || 'No readable text was found in ' + fileName + '.');
      }
      text = String(converted.data);
    }
    extracted.push({ role: role || 'supporting_document', fileName, text: text.slice(0, 12000) });
  }
  const currency = cleanCell(body.currency, 8) || 'USD';
  const prompt = [
    'Compare purchasing documents and return strict JSON only.',
    'Never invent a SKU, quantity, price, date, contractual term or evidence. Use null or omit a finding when facts are uncertain.',
    'A discrepancy must cite the source facts visible in the supplied document text.',
    'Return exactly this shape:',
    '{"claimStrength":0,"scoreText":"","headline":"","missingEvidence":[""],"discrepancies":[{"type":"","reference":"","evidence":"","freeResult":""}]}',
    'claimStrength must be 0-100 and must decrease for missing documents, contradictory OCR or weak evidence.',
    'Include at most 8 discrepancies. freeResult may show a quantity or unit price difference, but never calculate or reveal the total monetary claim.',
    'Supported checks: shortage, overcharge, wrong SKU, packing mismatch, receipt mismatch, visible damage, quality rejection, late delivery, and documented freight/other cost.',
    'Currency: ' + currency,
    'Documents: ' + JSON.stringify(extracted)
  ].join('\n');
  const result = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
    messages: [
      { role: 'system', content: 'You are a cautious supplier-claim document comparison engine. Return valid JSON only. You do not provide legal advice.' },
      { role: 'user', content: prompt }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        type: 'object',
        properties: {
          claimStrength: { type: 'number' },
          scoreText: { type: 'string' },
          headline: { type: 'string' },
          missingEvidence: { type: 'array', items: { type: 'string' } },
          discrepancies: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                reference: { type: 'string' },
                evidence: { type: 'string' },
                freeResult: { type: 'string' }
              },
              required: ['type','reference','evidence','freeResult']
            }
          }
        },
        required: ['claimStrength','scoreText','headline','missingEvidence','discrepancies']
      }
    },
    temperature: 0.1,
    max_tokens: 1800
  });
  const structured = result && typeof result.response === 'object' ? result.response : (result && typeof result.result?.response === 'object' ? result.result.response : null);
  const raw = typeof result === 'string' ? result : (typeof result?.response === 'string' ? result.response : (typeof result?.result?.response === 'string' ? result.result.response : ''));
  const parsed = structured || extractJson(raw);
  const discrepancies = Array.isArray(parsed.discrepancies) ? parsed.discrepancies.slice(0, 8).map(item => ({
    type: cleanCell(item.type, 80),
    reference: cleanCell(item.reference, 100),
    evidence: cleanCell(item.evidence, 220),
    freeResult: cleanCell(item.freeResult, 180)
  })).filter(item => item.type) : [];
  const missingEvidence = Array.isArray(parsed.missingEvidence) ? parsed.missingEvidence.slice(0, 8).map(item => cleanCell(item, 140)).filter(Boolean) : [];
  const windowDays = Math.max(1, Math.min(365, Number(body.claimWindowDays || 14)));
  let deadlineRisk = 'Check the claim period in your contract';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(body.deliveryDate || ''))) {
    const deadline = new Date(body.deliveryDate + 'T12:00:00Z');
    deadline.setUTCDate(deadline.getUTCDate() + windowDays);
    const days = Math.ceil((deadline.getTime() - Date.now()) / 86400000);
    deadlineRisk = days < 0 ? 'Contractual window may have expired ' + Math.abs(days) + ' day(s) ago' : days === 0 ? 'Contractual window may expire today' : 'Estimated contractual window: ' + days + ' day(s) remaining';
  }
  return json({
    claimStrength: Math.max(0, Math.min(100, Number(parsed.claimStrength || 0))),
    scoreText: cleanCell(parsed.scoreText, 180),
    headline: cleanCell(parsed.headline, 180),
    missingEvidence,
    discrepancies: discrepancies.slice(0, 3),
    totalDiscrepancies: discrepancies.length,
    deadlineRisk,
    processedDocuments: extracted.map(item => ({ role: item.role, fileName: item.fileName })),
    premiumLocked: ['exact_claim_amount','all_discrepancies','damage_delay_freight_calculation','claim_letter','debit_note','pdf_package'],
    requiresHumanApproval: true,
    disclaimer: 'Document comparison only; not legal, customs or insurance advice.'
  });
}

async function analyzeSkuColumns(request, env) {
  if (!env.AI) throw httpError(503, 'Workers AI binding is not configured.');
  const body = await request.json();
  const headers = Array.isArray(body.headers) ? body.headers.slice(0, 50).map(value => cleanCell(value, 120)) : [];
  const sampleRows = Array.isArray(body.sampleRows) ? body.sampleRows.slice(0, 20).map(row => Array.isArray(row) ? row.slice(0, 50).map(value => cleanCell(value, 160)) : []) : [];
  if (!headers.length) throw httpError(400, 'At least one column header is required.');
  if (headers.some(header => !header)) throw httpError(400, 'Column headers cannot be empty.');
  const fields = ['sku','description','barcode','uom','price','currency','stock','warehouse','min','max','category','supplier'];
  const prompt = [
    'You map spreadsheet columns to inventory fields.',
    'Return strict JSON only, with this shape: {"mappings":[{"sourceIndex":0,"sourceHeader":"...","targetField":"sku","confidence":0.97,"reason":"..."}],"unmapped":[0]}.',
    'targetField must be one of: ' + fields.join(', ') + '.',
    'Use each targetField at most once. Confidence must be between 0 and 1.',
    'Do not infer a mapping when evidence is weak; put its sourceIndex in unmapped.',
    'Column headers: ' + JSON.stringify(headers),
    'Sample rows: ' + JSON.stringify(sampleRows)
  ].join('\n');
  const model = '@cf/meta/llama-3.1-8b-instruct-fast';
  const result = await env.AI.run(model, {
    messages: [
      { role: 'system', content: 'You are a precise inventory-data mapping engine. Output valid JSON only.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.1,
    max_tokens: 1200
  });
  const text = typeof result === 'string' ? result : (result.response || result.result?.response || '');
  let parsed;
  try { parsed = JSON.parse(extractJson(text)); }
  catch { throw httpError(502, 'AI returned an invalid mapping response.'); }
  const used = new Set();
  const mappings = (Array.isArray(parsed.mappings) ? parsed.mappings : []).map(item => {
    const sourceIndex = Number(item.sourceIndex);
    const targetField = String(item.targetField || '');
    if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= headers.length || !fields.includes(targetField) || used.has(targetField)) return null;
    used.add(targetField);
    return {
      sourceIndex,
      sourceHeader: headers[sourceIndex],
      targetField,
      confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0)),
      reason: cleanCell(item.reason, 180)
    };
  }).filter(Boolean);
  return json({
    source: 'Cloudflare Workers AI',
    model,
    analyzedAt: new Date().toISOString(),
    mappings,
    unmapped: headers.map((_, index) => index).filter(index => !mappings.some(item => item.sourceIndex === index)),
    requiresHumanApproval: true
  });
}

function cleanCell(value, limit) {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}
function extractJson(value) {
  const text = String(value || '').trim().replace(/^\x60\x60\x60(?:json)?/i, '').replace(/\x60\x60\x60$/,'').trim();
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON object.');
  return text.slice(start, end + 1);
}

async function audit(request, env) {
  const body = await request.json();
  const target = validHttpUrl(body.url); if (!target) throw httpError(400, 'A valid http/https URL is required.');
  const strategy = body.strategy === 'desktop' ? 'desktop' : 'mobile';
  const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  endpoint.searchParams.set('url', target.href); endpoint.searchParams.set('strategy', strategy);
  ['performance','accessibility','best-practices','seo'].forEach(x => endpoint.searchParams.append('category',x));
  if (env.PAGESPEED_API_KEY) endpoint.searchParams.set('key', env.PAGESPEED_API_KEY);
  const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
  const raw = await response.json();
  if (!response.ok) throw httpError(response.status, raw.error?.message || 'PageSpeed analysis failed.');
  return json(normalizePageSpeed(raw, target.href, strategy));
}

function normalizePageSpeed(raw, requestedUrl, strategy) {
  const lr=raw.lighthouseResult||{}, cats=lr.categories||{}, audits=lr.audits||{};
  const score=id=>Math.round((cats[id]?.score||0)*100);
  const metric=id=>({id,label:audits[id]?.title||id,value:audits[id]?.displayValue||'—',score:audits[id]?.score});
  const findings=Object.values(audits).filter(a=>a&&a.score!==null&&a.score<.9&&a.details?.type==='opportunity').sort((a,b)=>(b.details?.overallSavingsMs||0)-(a.details?.overallSavingsMs||0)).slice(0,8).map(a=>({id:a.id,title:a.title,description:stripMarkdownLinks(a.description||''),score:a.score,savingsMs:Math.round(a.details?.overallSavingsMs||0)}));
  if(!findings.length) Object.values(audits).filter(a=>a&&a.score!==null&&a.score<.9&&a.title).sort((a,b)=>(a.score??1)-(b.score??1)).slice(0,8).forEach(a=>findings.push({id:a.id,title:a.title,description:stripMarkdownLinks(a.description||''),score:a.score,savingsMs:Math.round(a.details?.overallSavingsMs||0)}));
  return {source:'Google PageSpeed Insights / Lighthouse',url:lr.finalUrl||requestedUrl,requestedUrl,strategy,fetchedAt:raw.analysisUTCTimestamp||new Date().toISOString(),scores:{performance:score('performance'),accessibility:score('accessibility'),'best-practices':score('best-practices'),seo:score('seo')},vitals:[metric('largest-contentful-paint'),metric('interaction-to-next-paint'),metric('cumulative-layout-shift'),metric('first-contentful-paint'),metric('speed-index'),metric('total-blocking-time')],findings};
}

async function integrationStatuses(env) {
  const rows = env.DB ? await env.DB.prepare('SELECT provider, updated_at FROM oauth_connections WHERE workspace_id = ?').bind('hamvara').all() : { results: [] };
  const found = Object.fromEntries((rows.results||[]).map(x=>[x.provider,x]));
  return json({ integrations: {
    'google-search-console': status(found.google), 'google-analytics': status(found.google), meta: status(found.meta), linkedin: status(found.linkedin), wordpress: status(found.wordpress)
  }});
}

async function oauthStart(request, env) {
  requireEnv(env, ['OAUTH_STATE_SECRET','TOKEN_ENCRYPTION_KEY']);
  const url=new URL(request.url), provider=url.pathname.split('/')[3], redirectUri=`${url.origin}/api/oauth/${provider}/callback`;
  const cfg=providerConfig(provider,env); requireEnv(env,[cfg.clientId,cfg.clientSecret]);
  const returnTo=safeReturnTo(url.searchParams.get('return_to'),env);
  const state=await signState({provider,returnTo,createdAt:Date.now()},env.OAUTH_STATE_SECRET);
  const authorization=new URL(cfg.authorization); authorization.searchParams.set('client_id',env[cfg.clientId]); authorization.searchParams.set('redirect_uri',redirectUri); authorization.searchParams.set('response_type','code'); authorization.searchParams.set('state',state);
  if(cfg.scopes.length)authorization.searchParams.set('scope',cfg.scopes.join(' '));
  if(provider==='google'){authorization.searchParams.set('access_type','offline');authorization.searchParams.set('prompt','consent');authorization.searchParams.set('include_granted_scopes','true');}
  return Response.redirect(authorization.toString(),302);
}

async function oauthCallback(request, env) {
  requireEnv(env,['OAUTH_STATE_SECRET','TOKEN_ENCRYPTION_KEY']); if(!env.DB)throw httpError(503,'Database binding is not configured.');
  const url=new URL(request.url), provider=url.pathname.split('/')[3], code=url.searchParams.get('code'), state=url.searchParams.get('state');
  if(!code||!state)throw httpError(400,url.searchParams.get('error_description')||'OAuth callback is incomplete.');
  const stateData=await verifyState(state,env.OAUTH_STATE_SECRET); if(stateData.provider!==provider||Date.now()-stateData.createdAt>600000)throw httpError(400,'OAuth state is invalid or expired.');
  const cfg=providerConfig(provider,env); requireEnv(env,[cfg.clientId,cfg.clientSecret]); const redirectUri=`${url.origin}/api/oauth/${provider}/callback`;
  const form=new URLSearchParams({client_id:env[cfg.clientId],client_secret:env[cfg.clientSecret],redirect_uri:redirectUri,code,grant_type:'authorization_code'});
  const tokenResponse=await fetch(cfg.token,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},body:form});
  const token=await tokenResponse.json(); if(!tokenResponse.ok||!token.access_token)throw httpError(400,token.error_description||token.error||'Token exchange failed.');
  const access=await encrypt(token.access_token,env.TOKEN_ENCRYPTION_KEY); const refresh=token.refresh_token?await encrypt(token.refresh_token,env.TOKEN_ENCRYPTION_KEY):null;
  const expiresAt=token.expires_in?new Date(Date.now()+Number(token.expires_in)*1000).toISOString():null;
  await env.DB.prepare(`INSERT INTO oauth_connections (workspace_id,provider,access_token_ciphertext,refresh_token_ciphertext,expires_at,scopes,metadata,updated_at) VALUES (?,?,?,?,?,?,?,datetime('now')) ON CONFLICT(workspace_id,provider) DO UPDATE SET access_token_ciphertext=excluded.access_token_ciphertext,refresh_token_ciphertext=COALESCE(excluded.refresh_token_ciphertext,oauth_connections.refresh_token_ciphertext),expires_at=excluded.expires_at,scopes=excluded.scopes,metadata=excluded.metadata,updated_at=datetime('now')`).bind('hamvara',provider,access,refresh,expiresAt,token.scope||cfg.scopes.join(' '),JSON.stringify({token_type:token.token_type||'Bearer'})).run();
  const destination=new URL(stateData.returnTo); destination.searchParams.set('connected',provider); return Response.redirect(destination.toString(),302);
}

async function testIntegration(provider,env){
  if(!env.DB)throw httpError(503,'Database binding is not configured.');
  const token=await providerAccessToken(provider,env); let endpoint,headers={Authorization:`Bearer ${token}`,Accept:'application/json'};
  if(provider==='google')endpoint='https://openidconnect.googleapis.com/v1/userinfo';
  if(provider==='linkedin')endpoint='https://api.linkedin.com/v2/userinfo';
  if(provider==='wordpress')endpoint='https://public-api.wordpress.com/rest/v1.1/me';
  if(provider==='meta'){const version=env.META_GRAPH_VERSION||'v23.0';endpoint=`https://graph.facebook.com/${version}/me?fields=id,name`;}
  const response=await fetch(endpoint,{headers});const body=await response.json();if(!response.ok)throw httpError(response.status,body.error?.message||'Provider rejected the token.');
  return json({ok:true,provider,account:{id:body.id||body.ID||body.sub||null,name:body.name||body.display_name||body.email||null}});
}

async function googleOverview(url,env){
  if(!env.DB)throw httpError(503,'Database binding is not configured.');
  const token=await providerAccessToken('google',env),headers={Authorization:`Bearer ${token}`,Accept:'application/json'};
  let sitesResult={},accountsResult={},siteListError=null,accountListError=null;
  await Promise.all([
    googleJson('https://www.googleapis.com/webmasters/v3/sites',{headers}).then(value=>{sitesResult=value;}).catch(error=>{siteListError=error.message;}),
    googleJson('https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200',{headers}).then(value=>{accountsResult=value;}).catch(error=>{accountListError=error.message;})
  ]);
  const sites=(sitesResult.siteEntry||[]).map(x=>({siteUrl:x.siteUrl,permissionLevel:x.permissionLevel}));
  const properties=(accountsResult.accountSummaries||[]).flatMap(account=>(account.propertySummaries||[]).map(property=>({name:property.property,displayName:property.displayName,account:account.displayName})));
  const requestedSite=url.searchParams.get('site'),requestedProperty=url.searchParams.get('property');
  const selectedSite=sites.find(x=>x.siteUrl===requestedSite)||sites.find(x=>x.siteUrl.toLowerCase().includes('hamvara.com'))||sites[0]||null;
  const selectedProperty=properties.find(x=>x.name===requestedProperty)||properties.find(x=>String(x.displayName||'').toLowerCase().includes('hamvara'))||properties[0]||null;
  const endDate=isoDate(-1),startDate=isoDate(-28);
  let searchConsole={sites,selectedSite,totals:null,error:siteListError};
  let analytics={properties,selectedProperty,totals:null,error:accountListError};
  if(selectedSite){
    try{
      const report=await googleJson(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(selectedSite.siteUrl)}/searchAnalytics/query`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({startDate,endDate,dimensions:['date'],rowLimit:1000})});
      const rows=report.rows||[],impressions=rows.reduce((n,x)=>n+Number(x.impressions||0),0),clicks=rows.reduce((n,x)=>n+Number(x.clicks||0),0);
      searchConsole.totals={clicks,impressions,ctr:impressions?clicks/impressions:0,position:impressions?rows.reduce((n,x)=>n+Number(x.position||0)*Number(x.impressions||0),0)/impressions:0,startDate,endDate};
    }catch(error){searchConsole.error=error.message;}
  }
  if(selectedProperty){
    try{
      const report=await googleJson(`https://analyticsdata.googleapis.com/v1beta/${selectedProperty.name}:runReport`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({dateRanges:[{startDate:'28daysAgo',endDate:'yesterday'}],metrics:['activeUsers','newUsers','sessions','screenPageViews','eventCount'].map(name=>({name}))})});
      const values=report.rows?.[0]?.metricValues||[];
      analytics.totals={activeUsers:Number(values[0]?.value||0),newUsers:Number(values[1]?.value||0),sessions:Number(values[2]?.value||0),pageViews:Number(values[3]?.value||0),eventCount:Number(values[4]?.value||0),startDate,endDate};
    }catch(error){analytics.error=error.message;}
  }
  return json({generatedAt:new Date().toISOString(),searchConsole,analytics});
}

async function providerAccessToken(provider,env){
  requireEnv(env,['TOKEN_ENCRYPTION_KEY']);
  const row=await env.DB.prepare('SELECT access_token_ciphertext,refresh_token_ciphertext,expires_at FROM oauth_connections WHERE workspace_id=? AND provider=?').bind('hamvara',provider).first();
  if(!row)throw httpError(404,'Integration is not connected.');
  const expiresAt=row.expires_at?Date.parse(row.expires_at):0;
  if(provider!=='google'||!expiresAt||expiresAt>Date.now()+60000)return decrypt(row.access_token_ciphertext,env.TOKEN_ENCRYPTION_KEY);
  if(!row.refresh_token_ciphertext)throw httpError(401,'Google access expired. Reconnect the integration.');
  requireEnv(env,['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET']);
  const refreshToken=await decrypt(row.refresh_token_ciphertext,env.TOKEN_ENCRYPTION_KEY);
  const tokenResponse=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,refresh_token:refreshToken,grant_type:'refresh_token'})});
  const token=await tokenResponse.json();if(!tokenResponse.ok||!token.access_token)throw httpError(401,token.error_description||token.error||'Google token refresh failed.');
  const access=await encrypt(token.access_token,env.TOKEN_ENCRYPTION_KEY),newExpiresAt=new Date(Date.now()+Number(token.expires_in||3600)*1000).toISOString();
  await env.DB.prepare("UPDATE oauth_connections SET access_token_ciphertext=?,expires_at=?,updated_at=datetime('now') WHERE workspace_id=? AND provider=?").bind(access,newExpiresAt,'hamvara',provider).run();
  return token.access_token;
}

async function googleJson(endpoint,options){
  const response=await fetch(endpoint,options),body=await response.json();
  if(!response.ok)throw httpError(response.status,body.error?.message||'Google API request failed.');
  return body;
}

function isoDate(offsetDays){const date=new Date();date.setUTCDate(date.getUTCDate()+offsetDays);return date.toISOString().slice(0,10);}

function providerConfig(provider,env){
  if(provider!=='meta')return PROVIDERS[provider];
  const version=env.META_GRAPH_VERSION||'v23.0';return{authorization:`https://www.facebook.com/${version}/dialog/oauth`,token:`https://graph.facebook.com/${version}/oauth/access_token`,clientId:'META_APP_ID',clientSecret:'META_APP_SECRET',scopes:['pages_show_list','pages_read_engagement','instagram_basic','instagram_manage_insights']};
}
function status(row){return{connected:Boolean(row),updatedAt:row?.updated_at||null};}
function validHttpUrl(value){try{const url=new URL(String(value||''));return /^https?:$/.test(url.protocol)?url:null}catch{return null}}
function allowedOrigins(env){return(env.ALLOWED_ORIGINS||'https://hamvara.com,https://www.hamvara.com,https://mazdaran.github.io,http://localhost:8080,http://127.0.0.1:8080').split(',').map(x=>x.trim())}
function safeReturnTo(value,env){const fallback='https://hamvara.com/growth/';try{const url=new URL(value||fallback);return allowedOrigins(env).includes(url.origin)?url.toString():fallback}catch{return fallback}}
function corsHeaders(origin,env){const allowed=allowedOrigins(env);return{'Access-Control-Allow-Origin':allowed.includes(origin)?origin:allowed[0],'Access-Control-Allow-Headers':'Content-Type, Authorization, X-Hamvara-Workspace, X-Hamvara-User, X-Hamvara-Key, X-Hamvara-Scan-Token, X-Hamvara-Scan-Device','Access-Control-Allow-Methods':'GET, POST, PUT, OPTIONS','Vary':'Origin'};}
function stripMarkdownLinks(text){return text.replace(/\[([^\]]+)\]\([^\)]+\)/g,'$1').replace(/\s+/g,' ').trim();}
function requireEnv(env,names){const missing=names.filter(x=>!env[x]);if(missing.length)throw httpError(503,`Missing server configuration: ${missing.join(', ')}`);}
function httpError(status,message){const error=new Error(message);error.status=status;return error;}
function json(body,status=200,extra={}){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra}});}

async function signState(payload,secret){const encoded=base64url(new TextEncoder().encode(JSON.stringify(payload)));const signature=await hmac(encoded,secret);return `${encoded}.${signature}`;}
async function verifyState(value,secret){const [encoded,signature]=value.split('.');if(!encoded||!signature||!constantTimeEqual(signature,await hmac(encoded,secret)))throw httpError(400,'Invalid OAuth state.');return JSON.parse(new TextDecoder().decode(fromBase64url(encoded)));}
async function hmac(value,secret){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return base64url(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value))));}
async function encrypt(value,keyText){const key=await aesKey(keyText),iv=crypto.getRandomValues(new Uint8Array(12)),cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(value)));return `${base64url(iv)}.${base64url(cipher)}`;}
async function decrypt(value,keyText){const [iv,cipher]=value.split('.');const key=await aesKey(keyText);return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:fromBase64url(iv)},key,fromBase64url(cipher)));}
async function aesKey(keyText){const bytes=fromBase64url(keyText);if(bytes.byteLength!==32)throw httpError(503,'TOKEN_ENCRYPTION_KEY must be a base64url-encoded 32-byte key.');return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);}
function base64url(bytes){let binary='';bytes.forEach(x=>binary+=String.fromCharCode(x));return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function fromBase64url(value){const normalized=value.replace(/-/g,'+').replace(/_/g,'/');const binary=atob(normalized+'='.repeat((4-normalized.length%4)%4));return Uint8Array.from(binary,c=>c.charCodeAt(0));}
function constantTimeEqual(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
