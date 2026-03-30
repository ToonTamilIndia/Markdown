// Cloudflare Pages Worker with KV Storage for Shared Notes
// KV Namespace binding: SHARED_NOTES (configure in Cloudflare Pages settings)

const DEFAULT_PISTON_URL = 'https://emkc.org/api/v2/piston/execute';
const MAX_SOURCE_CODE_LENGTH = 50000;
const MAX_STDIN_LENGTH = 10000;

const JUDGE0_LANGUAGE_MAP = {
  javascript: 63,
  js: 63,
  python: 71,
  py: 71,
  java: 62,
  c: 50,
  cpp: 54,
  'c++': 54,
  csharp: 51,
  cs: 51,
  go: 60,
  rust: 73,
  rs: 73,
  bash: 46,
  sh: 46
};

const PISTON_LANGUAGE_MAP = {
  javascript: 'javascript',
  js: 'javascript',
  python: 'python',
  py: 'python',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  'c++': 'cpp',
  csharp: 'csharp',
  cs: 'csharp',
  go: 'go',
  rust: 'rust',
  rs: 'rust',
  bash: 'bash',
  sh: 'bash'
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Handle CORS for API requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Master-Key',
        },
      });
    }
    
    // API Routes for KV Storage
    if (path.startsWith('/api/')) {
      return handleAPI(request, env, path);
    }
    
    // Static files - serve normally
    const staticExtensions = ['.html', '.js', '.css', '.json', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.map', '.md', '.txt', '.xml', '.webmanifest'];
    const staticPaths = ['/', '/index.html', '/app.js', '/styles.css', '/view.html', '/manifest.json', '/sw.js'];
    
    const hasExtension = staticExtensions.some(ext => path.toLowerCase().endsWith(ext));
    const isStaticPath = staticPaths.includes(path) || path === '/';
    
    if (hasExtension || isStaticPath) {
      return env.ASSETS.fetch(request);
    }
    
    // Check if path is an alias (alphanumeric, hyphens, underscores)
    const aliasMatch = path.match(/^\/([a-zA-Z0-9_-]+)\/?$/);
    
    if (aliasMatch) {
      const alias = aliasMatch[1];
      
      // Try to get note data from KV
      if (env.SHARED_NOTES) {
        const noteData = await env.SHARED_NOTES.get(alias);
        if (noteData) {
          // Serve view.html with the data embedded or as query param
          const newUrl = new URL(request.url);
          newUrl.pathname = '/view.html';
          newUrl.searchParams.set('alias', alias);
          const newRequest = new Request(newUrl.toString(), request);
          return env.ASSETS.fetch(newRequest);
        }
      }
      
      // Alias not found - still serve view.html (it will show error)
      const newUrl = new URL(request.url);
      newUrl.pathname = '/view.html';
      newUrl.searchParams.set('alias', alias);
      const newRequest = new Request(newUrl.toString(), request);
      return env.ASSETS.fetch(newRequest);
    }
    
    // Default: serve as static asset
    return env.ASSETS.fetch(request);
  }
};

// Handle API requests for KV storage
async function handleAPI(request, env, path) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  // GET /api/code-runner-status - Check active code runner backend
  if (path === '/api/code-runner-status' && request.method === 'GET') {
    const judge0BaseUrl = normalizeJudge0BaseUrl(env.JUDGE0_SELF_HOST_URL);
    const usesJudge0 = Boolean(judge0BaseUrl);
    return new Response(JSON.stringify({
      success: true,
      enabled: true,
      usesJudge0,
      mode: usesJudge0 ? 'judge0' : 'piston'
    }), { status: 200, headers: corsHeaders });
  }

  // POST /api/run-code - Execute code via Judge0 self-host or Piston fallback
  if (path === '/api/run-code' && request.method === 'POST') {
    return handleRunCode(request, env, corsHeaders);
  }
  
  // Check if KV is configured
  if (!env.SHARED_NOTES) {
    return new Response(JSON.stringify({ 
      error: 'KV namespace not configured. Add SHARED_NOTES binding in Cloudflare Pages settings.' 
    }), { status: 500, headers: corsHeaders });
  }
  
  // POST /api/share - Save a shared note
  if (path === '/api/share' && request.method === 'POST') {
    try {
      const body = await request.json();
      const { alias, data, title } = body;
      
      if (!alias || !data) {
        return new Response(JSON.stringify({ error: 'Missing alias or data' }), { 
          status: 400, headers: corsHeaders 
        });
      }
      
      // Validate alias (alphanumeric, hyphens, underscores, 2-50 chars)
      if (!/^[a-zA-Z0-9_-]{2,50}$/.test(alias)) {
        return new Response(JSON.stringify({ 
          error: 'Invalid alias. Use 2-50 alphanumeric characters, hyphens, or underscores.' 
        }), { status: 400, headers: corsHeaders });
      }
      
      // Store in KV with metadata
      const noteEntry = {
        data: data,
        title: title || 'Untitled',
        createdAt: new Date().toISOString(),
        views: 0
      };
      
      await env.SHARED_NOTES.put(alias, JSON.stringify(noteEntry));
      
      return new Response(JSON.stringify({ 
        success: true, 
        alias: alias,
        url: `/${alias}`
      }), { status: 200, headers: corsHeaders });
      
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Failed to save note: ' + e.message }), { 
        status: 500, headers: corsHeaders 
      });
    }
  }
  
  // GET /api/note/:alias - Get a shared note
  if (path.startsWith('/api/note/') && request.method === 'GET') {
    const alias = path.replace('/api/note/', '');
    
    try {
      const noteJson = await env.SHARED_NOTES.get(alias);
      
      if (!noteJson) {
        return new Response(JSON.stringify({ error: 'Note not found' }), { 
          status: 404, headers: corsHeaders 
        });
      }
      
      const note = JSON.parse(noteJson);
      
      // Increment view count (fire and forget)
      note.views = (note.views || 0) + 1;
      env.SHARED_NOTES.put(alias, JSON.stringify(note)).catch(() => {});
      
      return new Response(JSON.stringify({ 
        success: true, 
        data: note.data,
        title: note.title,
        createdAt: note.createdAt,
        views: note.views
      }), { status: 200, headers: corsHeaders });
      
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Failed to get note: ' + e.message }), { 
        status: 500, headers: corsHeaders 
      });
    }
  }
  
  // DELETE /api/note/:alias - Delete a shared note (requires master key)
  if (path.startsWith('/api/note/') && request.method === 'DELETE') {
    const alias = path.replace('/api/note/', '');
    const masterKey = request.headers.get('X-Master-Key');
    
    if (!env.MASTER_KEY || masterKey !== env.MASTER_KEY) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401, headers: corsHeaders 
      });
    }
    
    try {
      await env.SHARED_NOTES.delete(alias);
      return new Response(JSON.stringify({ success: true }), { 
        status: 200, headers: corsHeaders 
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Failed to delete: ' + e.message }), { 
        status: 500, headers: corsHeaders 
      });
    }
  }
  
  // GET /api/list - List all shared notes (requires master key)
  if (path === '/api/list' && request.method === 'GET') {
    const masterKey = request.headers.get('X-Master-Key');
    
    if (!env.MASTER_KEY || masterKey !== env.MASTER_KEY) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
        status: 401, headers: corsHeaders 
      });
    }
    
    try {
      const list = await env.SHARED_NOTES.list();
      const notes = [];
      
      for (const key of list.keys) {
        const noteJson = await env.SHARED_NOTES.get(key.name);
        if (noteJson) {
          const note = JSON.parse(noteJson);
          notes.push({
            alias: key.name,
            title: note.title,
            createdAt: note.createdAt,
            views: note.views || 0
          });
        }
      }
      
      return new Response(JSON.stringify({ success: true, notes }), { 
        status: 200, headers: corsHeaders 
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Failed to list: ' + e.message }), { 
        status: 500, headers: corsHeaders 
      });
    }
  }
  
  // Check alias availability
  if (path.startsWith('/api/check/') && request.method === 'GET') {
    const alias = path.replace('/api/check/', '');
    
    try {
      const exists = await env.SHARED_NOTES.get(alias);
      return new Response(JSON.stringify({ 
        available: !exists,
        alias: alias
      }), { status: 200, headers: corsHeaders });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { 
        status: 500, headers: corsHeaders 
      });
    }
  }
  
  return new Response(JSON.stringify({ error: 'Not found' }), { 
    status: 404, headers: corsHeaders 
  });
}

function normalizeJudge0BaseUrl(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    const parsed = new URL(value.trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function parseLanguageId(languageId) {
  if (typeof languageId === 'number' && Number.isInteger(languageId) && languageId > 0) {
    return languageId;
  }
  if (typeof languageId === 'string' && languageId.trim()) {
    const parsed = Number.parseInt(languageId, 10);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function resolveLanguageMeta(language, languageId) {
  let key = typeof language === 'string' ? language.trim().toLowerCase() : '';

  if (!key) {
    const parsedId = parseLanguageId(languageId);
    if (parsedId) {
      const match = Object.entries(JUDGE0_LANGUAGE_MAP).find(([, id]) => id === parsedId);
      if (match) key = match[0];
      return {
        key,
        judge0Id: parsedId,
        pistonLanguage: key ? PISTON_LANGUAGE_MAP[key] || null : null
      };
    }
  }

  if (!key) return null;

  return {
    key,
    judge0Id: JUDGE0_LANGUAGE_MAP[key] || null,
    pistonLanguage: PISTON_LANGUAGE_MAP[key] || null
  };
}

async function fetchWithTimeout(url, init, timeoutMs = 25000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function handleRunCode(request, env, corsHeaders) {
  let body;

  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: corsHeaders
    });
  }

  const sourceCode = typeof body.sourceCode === 'string' ? body.sourceCode : '';
  const stdin = typeof body.stdin === 'string' ? body.stdin : '';
  const languageMeta = resolveLanguageMeta(body.language, body.languageId);

  if (!sourceCode.trim()) {
    return new Response(JSON.stringify({ error: 'sourceCode is required' }), {
      status: 400,
      headers: corsHeaders
    });
  }

  if (sourceCode.length > MAX_SOURCE_CODE_LENGTH) {
    return new Response(JSON.stringify({
      error: `sourceCode too large (max ${MAX_SOURCE_CODE_LENGTH} chars)`
    }), {
      status: 413,
      headers: corsHeaders
    });
  }

  if (stdin.length > MAX_STDIN_LENGTH) {
    return new Response(JSON.stringify({
      error: `stdin too large (max ${MAX_STDIN_LENGTH} chars)`
    }), {
      status: 413,
      headers: corsHeaders
    });
  }

  if (!languageMeta) {
    return new Response(JSON.stringify({
      error: 'Unsupported or missing language/languageId'
    }), {
      status: 400,
      headers: corsHeaders
    });
  }

  const judge0BaseUrl = normalizeJudge0BaseUrl(env.JUDGE0_SELF_HOST_URL);
  if (judge0BaseUrl) {
    const judge0LanguageId = languageMeta.judge0Id || parseLanguageId(body.languageId);
    if (!judge0LanguageId) {
      return new Response(JSON.stringify({
        error: 'Language not supported for Judge0 self-host.'
      }), { status: 400, headers: corsHeaders });
    }

    const submissionPayload = {
      language_id: judge0LanguageId,
      source_code: sourceCode,
      stdin
    };

    if (typeof body.expectedOutput === 'string') {
      submissionPayload.expected_output = body.expectedOutput;
    }

    const url = `${judge0BaseUrl}/submissions?base64_encoded=false&wait=true&fields=stdout,stderr,compile_output,message,status,exit_code,time,memory`;

    let judge0Response;
    try {
      judge0Response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submissionPayload)
      });
    } catch (err) {
      const timeoutError = err && err.name === 'AbortError';
      return new Response(JSON.stringify({
        error: timeoutError ? 'Code execution timed out while contacting Judge0' : `Judge0 request failed: ${err.message}`
      }), {
        status: 502,
        headers: corsHeaders
      });
    }

    let judge0Data;
    try {
      judge0Data = await judge0Response.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid response from Judge0' }), {
        status: 502,
        headers: corsHeaders
      });
    }

    if (!judge0Response.ok) {
      return new Response(JSON.stringify({
        error: 'Judge0 API error',
        details: judge0Data.message || judge0Data.error || 'Unknown error',
        upstreamStatus: judge0Response.status
      }), {
        status: 502,
        headers: corsHeaders
      });
    }

    return new Response(JSON.stringify({
      success: true,
      provider: 'judge0',
      result: {
        status: judge0Data.status || null,
        stdout: judge0Data.stdout || '',
        stderr: judge0Data.stderr || '',
        compileOutput: judge0Data.compile_output || '',
        message: judge0Data.message || '',
        exitCode: judge0Data.exit_code ?? null,
        time: judge0Data.time || null,
        memory: judge0Data.memory || null
      }
    }), {
      status: 200,
      headers: corsHeaders
    });
  }

  if (!languageMeta.pistonLanguage) {
    return new Response(JSON.stringify({
      error: 'Language not supported for Piston.'
    }), {
      status: 400,
      headers: corsHeaders
    });
  }

  const pistonPayload = {
    language: languageMeta.pistonLanguage,
    source: sourceCode,
    stdin
  };

  let pistonResponse;
  try {
    pistonResponse = await fetchWithTimeout(DEFAULT_PISTON_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pistonPayload)
    });
  } catch (err) {
    const timeoutError = err && err.name === 'AbortError';
    return new Response(JSON.stringify({
      error: timeoutError ? 'Code execution timed out while contacting Piston' : `Piston request failed: ${err.message}`
    }), {
      status: 502,
      headers: corsHeaders
    });
  }

  let pistonData;
  try {
    pistonData = await pistonResponse.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid response from Piston' }), {
      status: 502,
      headers: corsHeaders
    });
  }

  if (!pistonResponse.ok) {
    return new Response(JSON.stringify({
      error: 'Piston API error',
      details: pistonData.message || pistonData.error || 'Unknown error',
      upstreamStatus: pistonResponse.status
    }), {
      status: 502,
      headers: corsHeaders
    });
  }

  const run = pistonData.run || {};
  const compile = pistonData.compile || {};
  const stdout = run.stdout || run.output || '';
  const stderr = run.stderr || '';
  const compileOutput = compile.stderr || compile.output || '';
  const exitCode = typeof run.code === 'number' ? run.code : null;
  const messageParts = [];

  if (run.signal) messageParts.push(`Signal: ${run.signal}`);
  if (typeof pistonData.message === 'string' && pistonData.message.trim()) {
    messageParts.push(pistonData.message.trim());
  }

  const success = exitCode === 0 && !stderr && !compileOutput;

  return new Response(JSON.stringify({
    success: true,
    provider: 'piston',
    result: {
      status: {
        id: success ? 3 : 11,
        description: success ? 'Accepted' : 'Runtime Error'
      },
      stdout,
      stderr,
      compileOutput,
      message: messageParts.join(' | '),
      exitCode,
      time: run.time || null,
      memory: run.memory || null
    }
  }), {
    status: 200,
    headers: corsHeaders
  });
}
