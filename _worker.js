// Cloudflare Pages Worker with KV Storage for Shared Notes
// KV Namespace binding: SHARED_NOTES (configure in Cloudflare Pages settings)

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
          'Access-Control-Allow-Headers': 'Content-Type',
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
    
    if (masterKey !== 'ToonTamilIndia') {
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
    
    if (masterKey !== 'ToonTamilIndia') {
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
