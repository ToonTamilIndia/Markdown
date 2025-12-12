// Markdown Notes Application
// Master Key: ToonTamilIndia

const MASTER_KEY = 'ToonTamilIndia';
const STORAGE_KEY = 'markdown_notes';
const MASTER_KEY_UNLOCKED = 'master_key_unlocked';
const SETTINGS_KEY = 'markdown_notes_settings';
const VERSION_KEY = 'markdown_notes_versions';
const SHARED_NOTES_KEY = 'shared_notes_data';
const BASE_URL = 'https://markdown.toontamilindia.in';

// Shared notes local tracking (for managing shared links)
let sharedNotesData = {
    version: "1.0",
    lastUpdated: new Date().toISOString(),
    baseUrl: BASE_URL,
    notes: {}
};

// ==================== URL ENCODING UTILITIES (Pako DEFLATE + base64url) ====================

// Compress text using Pako DEFLATE and encode as base64url
function compressToURL(text) {
    try {
        if (typeof pako !== 'undefined') {
            // Use Pako DEFLATE compression
            const utf8Bytes = new TextEncoder().encode(text);
            const compressed = pako.deflate(utf8Bytes, { level: 9 });
            // Convert to base64url
            const base64 = btoa(String.fromCharCode.apply(null, compressed));
            return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        } else {
            // Fallback to simple base64url
            const base64 = btoa(unescape(encodeURIComponent(text)));
            return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        }
    } catch (e) {
        console.error('Compression error:', e);
        return null;
    }
}

// Decompress from base64url using Pako INFLATE
function decompressFromURL(compressed) {
    try {
        // Restore base64 format
        let base64 = compressed.replace(/-/g, '+').replace(/_/g, '/');
        // Add padding if needed
        while (base64.length % 4) base64 += '=';
        
        if (typeof pako !== 'undefined') {
            // Decode base64 to bytes
            const binaryStr = atob(base64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
            }
            // Decompress with Pako
            const decompressed = pako.inflate(bytes);
            return new TextDecoder().decode(decompressed);
        } else {
            // Fallback
            return decodeURIComponent(escape(atob(base64)));
        }
    } catch (e) {
        // Try fallback for non-compressed data
        try {
            let base64 = compressed.replace(/-/g, '+').replace(/_/g, '/');
            while (base64.length % 4) base64 += '=';
            return decodeURIComponent(escape(atob(base64)));
        } catch (e2) {
            console.error('Decompression error:', e);
            return null;
        }
    }
}

// Create shareable URL with Pako compressed note data
function createShareableURL(note) {
    const noteData = {
        t: note.title,
        c: note.content,
        d: new Date().toISOString()
    };
    const jsonStr = JSON.stringify(noteData);
    const encoded = compressToURL(jsonStr);
    
    if (!encoded) return null;
    
    // Check URL length (Pako compression allows larger content)
    const url = `${BASE_URL}/view.html?d=${encoded}`;
    if (url.length > 15000) {
        // Too long even with compression, truncate
        const shortData = { t: note.title, c: note.content.substring(0, 8000) + '\n\n...(truncated)' };
        const shortEncoded = compressToURL(JSON.stringify(shortData));
        return `${BASE_URL}/view.html?d=${shortEncoded}`;
    }
    
    return url;
}

// Create short alias URL if note has custom alias
function createAliasURL(note) {
    if (note.alias && note.alias.trim()) {
        return `${BASE_URL}/${note.alias.trim()}`;
    }
    return null;
}

// Parse note data from URL
function parseNoteFromURL() {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get('d');
    
    if (!encoded) return null;
    
    const jsonStr = decompressFromURL(encoded);
    if (!jsonStr) return null;
    
    try {
        const data = JSON.parse(jsonStr);
        return {
            title: data.t || 'Shared Note',
            content: data.c || '',
            sharedAt: data.d || new Date().toISOString()
        };
    } catch (e) {
        console.error('Parse error:', e);
        return null;
    }
}

// Application State
let notes = [];
let currentNoteId = null;
let viewMode = 'split'; // 'split', 'editor-only', 'preview-only'
let isMasterKeyUnlocked = false;
let debounceTimer = null;
let settings = {
    autoSave: true,
    spellCheck: false,
    lineNumbers: false,
    theme: 'dark',
    fontSize: 15,
    font: 'monospace'
};
let noteVersions = {};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    loadNotes();
    loadSettings();
    loadVersions();
    loadSharedNotes();
    loadMasterKeyState();
    setupEventListeners();
    applySettings();
    renderNotesList();
    
    // Check for shared note in URL
    if (checkSharedNote()) {
        return;
    }
    
    // Load the most recent note or create a new one
    if (notes.length > 0) {
        loadNote(notes[0].id);
    } else {
        createNewNote();
    }

    // Initialize KaTeX auto-render after page load
    if (typeof renderMathInElement !== 'undefined') {
        setupMathRendering();
    }
    
    // Initialize Mermaid with strict security level
    if (typeof mermaid !== 'undefined') {
        mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict' });
    }
});

// Setup Event Listeners
function setupEventListeners() {
    const editor = document.getElementById('markdownEditor');
    
    // Live preview with debounce
    editor.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            updatePreview();
            autoSave();
        }, 300);
    });

    // Paste detection for ChatGPT content
    editor.addEventListener('paste', handlePaste);

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);

    // Auto-save on title/alias change
    document.getElementById('noteTitle').addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(autoSave, 500);
    });

    document.getElementById('noteAlias').addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(autoSave, 500);
    });

    // Handle URL routing for aliases
    handleUrlRouting();
}

// Handle URL Routing for Custom Aliases
function handleUrlRouting() {
    const path = window.location.pathname;
    const hash = window.location.hash.slice(1);
    
    if (hash) {
        const note = notes.find(n => n.alias === hash || n.id === hash);
        if (note) {
            loadNote(note.id);
        }
    }
}

// Math Rendering Setup
function setupMathRendering() {
    // Configure marked with custom renderer
    marked.setOptions({
        highlight: function(code, lang) {
            if (lang && hljs.getLanguage(lang)) {
                return hljs.highlight(code, { language: lang }).value;
            }
            return hljs.highlightAuto(code).value;
        },
        breaks: true,
        gfm: true
    });
}

// Load Notes from LocalStorage
function loadNotes() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        try {
            notes = JSON.parse(stored);
        } catch (e) {
            console.error('Error loading notes:', e);
            notes = [];
        }
    }
}

// Save Notes to LocalStorage
function saveNotes() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

// Load Master Key State
function loadMasterKeyState() {
    isMasterKeyUnlocked = sessionStorage.getItem(MASTER_KEY_UNLOCKED) === 'true';
    updateMasterKeyUI();
}

// Create New Note
function createNewNote() {
    const newNote = {
        id: generateId(),
        title: 'Untitled Note',
        alias: '',
        content: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    notes.unshift(newNote);
    saveNotes();
    renderNotesList();
    loadNote(newNote.id);
    showToast('New note created', 'success');
}

// Generate Unique ID
function generateId() {
    return 'note_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Load Note
function loadNote(noteId) {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;

    currentNoteId = noteId;
    document.getElementById('noteTitle').value = note.title;
    document.getElementById('noteAlias').value = note.alias || '';
    document.getElementById('markdownEditor').value = note.content;
    
    updatePreview();
    renderNotesList();
    
    // Update URL hash
    if (note.alias) {
        history.replaceState(null, '', '#' + note.alias);
    } else {
        history.replaceState(null, '', window.location.pathname);
    }
}

// Save Note
function saveNote() {
    if (!currentNoteId) return;

    const noteIndex = notes.findIndex(n => n.id === currentNoteId);
    if (noteIndex === -1) return;

    const title = document.getElementById('noteTitle').value.trim() || 'Untitled Note';
    const alias = document.getElementById('noteAlias').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const content = document.getElementById('markdownEditor').value;

    // Check for alias conflicts
    if (alias) {
        const conflictNote = notes.find(n => n.alias === alias && n.id !== currentNoteId);
        if (conflictNote) {
            showToast('Alias already in use by another note', 'error');
            return;
        }
    }

    notes[noteIndex] = {
        ...notes[noteIndex],
        title,
        alias,
        content,
        updatedAt: new Date().toISOString()
    };

    // Move to top of list
    const note = notes.splice(noteIndex, 1)[0];
    notes.unshift(note);

    saveNotes();
    renderNotesList();
    showToast('Note saved', 'success');

    // Update URL hash
    if (alias) {
        history.replaceState(null, '', '#' + alias);
    }
}

// Auto Save
function autoSave() {
    if (!currentNoteId || !settings.autoSave) return;

    const noteIndex = notes.findIndex(n => n.id === currentNoteId);
    if (noteIndex === -1) return;

    const title = document.getElementById('noteTitle').value.trim() || 'Untitled Note';
    const alias = document.getElementById('noteAlias').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    const content = document.getElementById('markdownEditor').value;

    // Check for alias conflicts (silently skip if conflict)
    if (alias) {
        const conflictNote = notes.find(n => n.alias === alias && n.id !== currentNoteId);
        if (conflictNote) {
            document.getElementById('noteAlias').value = notes[noteIndex].alias || '';
            return;
        }
    }

    // Save version periodically (every significant change)
    const oldContent = notes[noteIndex].content;
    if (content && oldContent && content.length !== oldContent.length && Math.abs(content.length - oldContent.length) > 50) {
        saveVersion(currentNoteId, oldContent);
    }

    notes[noteIndex] = {
        ...notes[noteIndex],
        title,
        alias,
        content,
        updatedAt: new Date().toISOString()
    };

    saveNotes();
    renderNotesList();
}

// Delete Current Note
function deleteCurrentNote() {
    if (!currentNoteId) return;

    if (!confirm('Are you sure you want to delete this note?')) return;

    const noteIndex = notes.findIndex(n => n.id === currentNoteId);
    if (noteIndex === -1) return;

    notes.splice(noteIndex, 1);
    saveNotes();
    renderNotesList();

    if (notes.length > 0) {
        loadNote(notes[0].id);
    } else {
        createNewNote();
    }

    showToast('Note deleted', 'info');
}

// Render Notes List
function renderNotesList() {
    const container = document.getElementById('notesList');
    
    if (notes.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📝</div>
                <div class="empty-state-text">No notes yet.<br>Create your first note!</div>
            </div>
        `;
        return;
    }

    container.innerHTML = notes.map(note => {
        const isActive = note.id === currentNoteId;
        const preview = note.content.substring(0, 100).replace(/[#*`]/g, '');
        const date = new Date(note.updatedAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });

        return `
            <div class="note-item ${isActive ? 'active' : ''}" onclick="loadNote('${note.id}')">
                <div class="note-item-title">${escapeHtml(note.title)}</div>
                ${note.alias ? `<div class="note-item-alias">@${escapeHtml(note.alias)}</div>` : ''}
                <div class="note-item-date">${date}</div>
                <div class="note-item-preview">${escapeHtml(preview)}</div>
            </div>
        `;
    }).join('');
}

// Search Notes
function searchNotes() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    const container = document.getElementById('notesList');

    const filtered = notes.filter(note => 
        note.title.toLowerCase().includes(query) ||
        note.content.toLowerCase().includes(query) ||
        (note.alias && note.alias.toLowerCase().includes(query))
    );

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔍</div>
                <div class="empty-state-text">No notes found</div>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(note => {
        const isActive = note.id === currentNoteId;
        const preview = note.content.substring(0, 100).replace(/[#*`]/g, '');
        const date = new Date(note.updatedAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });

        return `
            <div class="note-item ${isActive ? 'active' : ''}" onclick="loadNote('${note.id}')">
                <div class="note-item-title">${escapeHtml(note.title)}</div>
                ${note.alias ? `<div class="note-item-alias">@${escapeHtml(note.alias)}</div>` : ''}
                <div class="note-item-date">${date}</div>
                <div class="note-item-preview">${escapeHtml(preview)}</div>
            </div>
        `;
    }).join('');
}

// Update Preview
function updatePreview() {
    const content = document.getElementById('markdownEditor').value;
    const previewContainer = document.getElementById('previewContent');

    if (!content.trim()) {
        previewContainer.innerHTML = '<p class="placeholder-text">Preview will appear here...</p>';
        return;
    }

    // Pre-process for math equations (protect from markdown parser)
    let processedContent = preprocessMath(content);
    
    // Parse markdown
    let html = marked.parse(processedContent);
    
    // Post-process to restore math blocks
    html = postprocessMath(html);
    
    // Sanitize HTML output to prevent XSS attacks
    if (typeof DOMPurify !== 'undefined') {
        html = DOMPurify.sanitize(html, {
            ADD_TAGS: ['math', 'mrow', 'mi', 'mn', 'mo', 'msup', 'msub', 'mfrac', 'mroot', 'msqrt', 'mtext', 'mtable', 'mtr', 'mtd', 'mover', 'munder', 'munderover', 'semantics', 'annotation'],
            ADD_ATTR: ['xmlns', 'mathvariant', 'fence', 'separator', 'stretchy']
        });
    }
    
    previewContainer.innerHTML = html;

    // Render math equations with KaTeX
    if (typeof renderMathInElement !== 'undefined') {
        renderMathInElement(previewContainer, {
            delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '$', right: '$', display: false},
                {left: '\\[', right: '\\]', display: true},
                {left: '\\(', right: '\\)', display: false}
            ],
            throwOnError: false,
            trust: false,
            strict: false,
            macros: {
                "\\R": "\\mathbb{R}",
                "\\N": "\\mathbb{N}",
                "\\Z": "\\mathbb{Z}",
                "\\C": "\\mathbb{C}",
                "\\Q": "\\mathbb{Q}"
            }
        });
    }

    // Highlight code blocks
    previewContainer.querySelectorAll('pre code').forEach(block => {
        hljs.highlightElement(block);
    });
    
    // Render Mermaid diagrams
    if (typeof mermaid !== 'undefined') {
        previewContainer.querySelectorAll('pre code.language-mermaid').forEach((block, idx) => {
            const code = block.textContent;
            const div = document.createElement('div');
            div.className = 'mermaid';
            div.textContent = code;
            block.parentElement.replaceWith(div);
        });
        mermaid.init(undefined, previewContainer.querySelectorAll('.mermaid'));
    }
    
    // Handle task lists
    previewContainer.querySelectorAll('li').forEach(li => {
        const text = li.innerHTML;
        if (text.startsWith('[ ] ')) {
            li.innerHTML = `<input type="checkbox" disabled> ${text.slice(4)}`;
            li.classList.add('task-list-item');
        } else if (text.startsWith('[x] ') || text.startsWith('[X] ')) {
            li.innerHTML = `<input type="checkbox" checked disabled> ${text.slice(4)}`;
            li.classList.add('task-list-item');
        }
    });
    
    // Handle callouts/admonitions
    previewContainer.innerHTML = previewContainer.innerHTML
        .replace(/<p>:::\s*(warning|info|success|danger)\s*<\/p>/gi, '<div class="callout callout-$1">')
        .replace(/<p>:::<\/p>/g, '</div>');
}

// Preprocess Math Equations
function preprocessMath(content) {
    // Protect math blocks from markdown parser
    let result = content;
    
    // Store math blocks temporarily to protect them from markdown parsing
    const mathBlocks = [];
    
    // Handle display math (including multiline with matrices)
    result = result.replace(/\$\$([\s\S]*?)\$\$/g, (match, math) => {
        const index = mathBlocks.length;
        mathBlocks.push({ type: 'display', content: math.trim() });
        return `%%MATHBLOCK${index}%%`;
    });
    
    // Handle inline math (but not double $$)
    result = result.replace(/\$([^\$\n]+?)\$/g, (match, math) => {
        const index = mathBlocks.length;
        mathBlocks.push({ type: 'inline', content: math.trim() });
        return `%%MATHBLOCK${index}%%`;
    });
    
    // Store for later restoration
    window._mathBlocks = mathBlocks;
    
    return result;
}

// Post-process to restore math blocks after markdown parsing
function postprocessMath(html) {
    const mathBlocks = window._mathBlocks || [];
    
    mathBlocks.forEach((block, index) => {
        const placeholder = `%%MATHBLOCK${index}%%`;
        if (block.type === 'display') {
            html = html.replace(placeholder, `<div class="math-display">$$${block.content}$$</div>`);
        } else {
            html = html.replace(placeholder, `$${block.content}$`);
        }
    });
    
    return html;
}

// Insert Format
function insertFormat(before, after) {
    const editor = document.getElementById('markdownEditor');
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const text = editor.value;
    const selectedText = text.substring(start, end);

    const newText = text.substring(0, start) + before + selectedText + after + text.substring(end);
    editor.value = newText;
    
    // Set cursor position
    const newCursorPos = selectedText ? start + before.length + selectedText.length + after.length : start + before.length;
    editor.setSelectionRange(newCursorPos, newCursorPos);
    editor.focus();

    updatePreview();
}

// Toggle View Mode
function toggleView() {
    const container = document.getElementById('editorContainer') || document.querySelector('.editor-container');
    const button = document.getElementById('viewToggle');
    
    if (viewMode === 'split') {
        viewMode = 'preview-only';
        container.className = 'editor-container preview-only';
        button.textContent = '✏️ Edit';
    } else if (viewMode === 'preview-only') {
        viewMode = 'editor-only';
        container.className = 'editor-container editor-only';
        button.textContent = '👁️ Preview';
    } else {
        viewMode = 'split';
        container.className = 'editor-container split';
        button.textContent = '👁️ Preview';
    }
}

// Toggle Sidebar
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');
}

// Handle Paste (ChatGPT content detection)
function handlePaste(e) {
    const pastedText = e.clipboardData.getData('text');
    
    // Check if it's a large paste (likely from ChatGPT)
    if (pastedText.length > 500 && !currentNoteId) {
        e.preventDefault();
        
        // Show overlay
        const overlay = document.getElementById('pasteOverlay');
        overlay.classList.add('active');
        
        setTimeout(() => {
            createNewNote();
            document.getElementById('markdownEditor').value = pastedText;
            
            // Try to extract title from first line
            const firstLine = pastedText.split('\n')[0].replace(/^#*\s*/, '').substring(0, 50);
            if (firstLine) {
                document.getElementById('noteTitle').value = firstLine;
            }
            
            updatePreview();
            autoSave();
            
            overlay.classList.remove('active');
            showToast('Content imported as new note', 'success');
        }, 500);
    }
}

// Keyboard Shortcuts
function handleKeyboardShortcuts(e) {
    // Ctrl/Cmd + S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveNote();
    }
    
    // Ctrl/Cmd + N for new note
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        createNewNote();
    }

    // Ctrl/Cmd + B for bold
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        insertFormat('**', '**');
    }

    // Ctrl/Cmd + I for italic
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault();
        insertFormat('*', '*');
    }

    // Ctrl/Cmd + K for link
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        insertFormat('[', '](url)');
    }

    // Escape to close modals
    if (e.key === 'Escape') {
        closeMasterKeyModal();
        closeImportModal();
    }
}

// Master Key Functions
function showMasterKeyModal() {
    document.getElementById('masterKeyModal').classList.add('active');
    document.getElementById('masterKeyInput').focus();
}

function closeMasterKeyModal() {
    document.getElementById('masterKeyModal').classList.remove('active');
    document.getElementById('masterKeyInput').value = '';
    document.getElementById('masterKeyStatus').textContent = '';
}

function verifyMasterKey() {
    const input = document.getElementById('masterKeyInput').value;
    const status = document.getElementById('masterKeyStatus');

    if (input === MASTER_KEY) {
        isMasterKeyUnlocked = true;
        sessionStorage.setItem(MASTER_KEY_UNLOCKED, 'true');
        status.textContent = '✅ Master key verified! Full editing access granted.';
        status.className = 'master-key-status success';
        updateMasterKeyUI();
        
        setTimeout(() => {
            closeMasterKeyModal();
            showToast('Master key access granted', 'success');
        }, 1000);
    } else {
        status.textContent = '❌ Invalid master key. Please try again.';
        status.className = 'master-key-status error';
    }
}

function updateMasterKeyUI() {
    const btn = document.querySelector('.master-key-btn');
    if (isMasterKeyUnlocked) {
        btn.classList.add('unlocked');
        btn.textContent = '🔓 Unlocked';
    } else {
        btn.classList.remove('unlocked');
        btn.textContent = '🔑 Master Key';
    }
}

// Import Modal
function showImportModal() {
    document.getElementById('importModal').classList.add('active');
}

function closeImportModal() {
    document.getElementById('importModal').classList.remove('active');
    document.getElementById('importTextarea').value = '';
}

function importNotes() {
    const content = document.getElementById('importTextarea').value;
    if (!content.trim()) {
        showToast('Please paste some content to import', 'error');
        return;
    }

    createNewNote();
    document.getElementById('markdownEditor').value = content;
    
    // Extract title
    const firstLine = content.split('\n')[0].replace(/^#*\s*/, '').substring(0, 50);
    if (firstLine) {
        document.getElementById('noteTitle').value = firstLine;
    }
    
    updatePreview();
    autoSave();
    closeImportModal();
    showToast('Content imported successfully', 'success');
}

// Export All Notes
function exportAllNotes() {
    if (notes.length === 0) {
        showToast('No notes to export', 'error');
        return;
    }

    const exportData = notes.map(note => ({
        title: note.title,
        alias: note.alias,
        content: note.content,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `markdown-notes-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showToast('Notes exported successfully', 'success');
}

// Copy to Clipboard
function copyToClipboard() {
    const content = document.getElementById('markdownEditor').value;
    if (!content) {
        showToast('Nothing to copy', 'error');
        return;
    }

    navigator.clipboard.writeText(content).then(() => {
        showToast('Markdown copied to clipboard', 'success');
    }).catch(() => {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = content;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('Markdown copied to clipboard', 'success');
    });
}

// Toast Notifications
function showToast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== SHARING FEATURES ====================

// Load Shared Notes from localStorage
function loadSharedNotes() {
    const stored = localStorage.getItem(SHARED_NOTES_KEY);
    if (stored) {
        try {
            sharedNotesData = JSON.parse(stored);
        } catch (e) {
            console.error('Error loading shared notes:', e);
        }
    }
    
    // Also try to load from shared-notes.json file
    fetch('shared-notes.json')
        .then(response => response.json())
        .then(data => {
            // Merge with local data
            if (data.notes) {
                sharedNotesData.notes = { ...data.notes, ...sharedNotesData.notes };
                saveSharedNotes();
            }
        })
        .catch(() => {
            // File not accessible, use local storage only
        });
}

// Save Shared Notes to localStorage and generate JSON
function saveSharedNotes() {
    sharedNotesData.lastUpdated = new Date().toISOString();
    localStorage.setItem(SHARED_NOTES_KEY, JSON.stringify(sharedNotesData));
}

// Add note to shared notes (local tracking)
function addToSharedNotes(note, shareUrl, compressedData) {
    const shareId = note.id;
    sharedNotesData.notes[shareId] = {
        id: note.id,
        title: note.title,
        alias: note.alias,
        shareUrl: shareUrl,
        data: compressedData, // Store compressed data for direct loading
        sharedAt: new Date().toISOString(),
        updatedAt: note.updatedAt
    };
    
    // If note has alias, store compressed data in aliases map for direct lookup
    if (note.alias && note.alias.trim()) {
        if (!sharedNotesData.aliases) {
            sharedNotesData.aliases = {};
        }
        // Store compressed data, not the full URL - view.html will decompress it
        sharedNotesData.aliases[note.alias.trim()] = compressedData;
    }
    
    saveSharedNotes();
    return shareId;
}

// Remove note from shared notes
function removeFromSharedNotes(shareId) {
    delete sharedNotesData.notes[shareId];
    saveSharedNotes();
}

// Get shared note by ID
function getSharedNote(shareId) {
    return sharedNotesData.notes[shareId];
}

// Check if note is shared
function isNoteShared(noteId, alias) {
    return sharedNotesData.notes[alias] || sharedNotesData.notes[noteId];
}

// ==================== KV API Functions ====================

// Save note to KV storage via API
async function saveToKV(alias, data, title) {
    try {
        const response = await fetch(`${BASE_URL}/api/share`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ alias, data, title })
        });
        
        const result = await response.json();
        
        if (result.success) {
            return { success: true, url: `${BASE_URL}/${alias}` };
        } else {
            return { success: false, error: result.error };
        }
    } catch (e) {
        console.error('KV save error:', e);
        return { success: false, error: e.message };
    }
}

// Get note from KV storage via API
async function getFromKV(alias) {
    try {
        const response = await fetch(`${BASE_URL}/api/note/${alias}`);
        const result = await response.json();
        
        if (result.success) {
            return result;
        }
        return null;
    } catch (e) {
        console.error('KV get error:', e);
        return null;
    }
}

// Check if alias is available
async function checkAliasAvailable(alias) {
    try {
        const response = await fetch(`${BASE_URL}/api/check/${alias}`);
        const result = await response.json();
        return result.available;
    } catch (e) {
        return true; // Assume available on error
    }
}

// Show Share Modal
async function showShareModal() {
    if (!currentNoteId) {
        showToast('No note selected to share', 'error');
        return;
    }
    
    const note = notes.find(n => n.id === currentNoteId);
    if (!note) return;
    
    // Generate compressed data
    const noteData = {
        t: note.title,
        c: note.content,
        d: new Date().toISOString()
    };
    const compressedData = compressToURL(JSON.stringify(noteData));
    
    if (!compressedData) {
        showToast('Error creating share link', 'error');
        return;
    }
    
    // Full share URL with embedded data (fallback)
    const shareUrl = `${BASE_URL}/view.html?d=${compressedData}`;
    let displayUrl = shareUrl;
    let kvSaved = false;
    
    // If alias exists, save to KV and use short URL
    if (note.alias && note.alias.trim()) {
        const alias = note.alias.trim();
        
        // Show loading state
        document.getElementById('shareUrl').value = 'Saving to server...';
        document.getElementById('shareModal').classList.add('active');
        switchShareTab('link');
        
        // Save to KV
        const result = await saveToKV(alias, compressedData, note.title);
        
        if (result.success) {
            displayUrl = `${BASE_URL}/${alias}`;
            kvSaved = true;
            showToast(`Saved! Share link: ${displayUrl}`, 'success');
        } else {
            showToast(`KV save failed: ${result.error}. Using fallback URL.`, 'warning');
            displayUrl = shareUrl;
        }
    }
    
    document.getElementById('shareUrl').value = displayUrl;
    
    // Track locally
    addToSharedNotes(note, displayUrl, compressedData);
    
    // Generate embed code
    const embedCode = `<iframe src="${displayUrl}" width="100%" height="500" frameborder="0" style="border: 1px solid #30363d; border-radius: 8px;"></iframe>`;
    document.getElementById('embedCode').value = embedCode;
    
    // Generate QR code
    generateQRCode(displayUrl);
    
    // Update share status
    updateShareStatus(note.id);
    
    // Show info
    const sizeInfo = document.getElementById('shareSizeInfo');
    if (sizeInfo) {
        const sizeKB = (compressedData.length / 1024).toFixed(1);
        let infoText = `Data: ${sizeKB} KB`;
        if (note.alias) {
            infoText += ` | Alias: ${note.alias}`;
            infoText += kvSaved ? ' ✅ Saved to server' : ' ⚠️ Local only';
        }
        sizeInfo.textContent = infoText;
        sizeInfo.style.color = kvSaved ? '#3fb950' : '#8b949e';
    }
    
    if (!document.getElementById('shareModal').classList.contains('active')) {
        document.getElementById('shareModal').classList.add('active');
        switchShareTab('link');
    }
}

// Update share status display
function updateShareStatus(shareId) {
    const sharedNote = sharedNotesData.notes[shareId];
    if (sharedNote) {
        const statusHtml = `
            <div class="share-status">
                <span class="share-status-badge shared">✓ Shared</span>
                <span class="share-status-info">Views: ${sharedNote.views || 0}</span>
            </div>
        `;
        const statusContainer = document.getElementById('shareStatusContainer');
        if (statusContainer) {
            statusContainer.innerHTML = statusHtml;
        }
    }
}

function closeShareModal() {
    document.getElementById('shareModal').classList.remove('active');
}

function switchShareTab(tab) {
    // Hide all tabs
    document.querySelectorAll('.share-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.share-tab').forEach(el => el.classList.remove('active'));
    
    // Show selected tab
    document.getElementById(`share${tab.charAt(0).toUpperCase() + tab.slice(1)}Content`).classList.remove('hidden');
    document.querySelector(`.share-tab[onclick*="${tab}"]`).classList.add('active');
    
    // If showing manage tab, render shared links list
    if (tab === 'manage') {
        renderSharedLinksList();
    }
}

// Refresh shared list from KV (if master key unlocked)
async function refreshSharedList() {
    if (!isMasterKeyUnlocked) {
        showToast('Unlock master key to view server list', 'warning');
        renderSharedLinksList();
        return;
    }
    
    const container = document.getElementById('sharedLinksList');
    if (container) {
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: #8b949e;">Loading from server...</div>';
    }
    
    try {
        const response = await fetch(`${BASE_URL}/api/list`, {
            headers: { 'X-Master-Key': MASTER_KEY }
        });
        
        if (response.ok) {
            const result = await response.json();
            if (result.success && result.notes) {
                renderKVSharedList(result.notes);
                showToast(`Loaded ${result.notes.length} notes from server`, 'success');
                return;
            }
        }
    } catch (e) {
        console.error('Failed to fetch KV list:', e);
    }
    
    showToast('Could not load from server, showing local data', 'warning');
    renderSharedLinksList();
}

// Render shared links from KV storage
function renderKVSharedList(kvNotes) {
    const container = document.getElementById('sharedLinksList');
    if (!container) return;
    
    if (kvNotes.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">☁️</div>
                <div class="empty-state-text">No notes on server</div>
                <p style="color: #8b949e; font-size: 0.9rem; margin-top: 10px;">Share a note with an alias to save it to KV</p>
            </div>`;
        return;
    }
    
    let html = `
        <div style="background: #238636; color: white; padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; font-size: 0.9rem;">
            ☁️ ${kvNotes.length} note(s) stored in Cloudflare KV
        </div>
    `;
    
    html += kvNotes.map(note => {
        const createdDate = note.createdAt ? new Date(note.createdAt).toLocaleDateString() : 'Unknown';
        return `
            <div class="shared-link-item">
                <div class="shared-link-info">
                    <div class="shared-link-title">${escapeHtml(note.title)}</div>
                    <div class="shared-link-meta">
                        <span>📅 ${createdDate}</span>
                        <span style="color: #58a6ff;">🏷️ /${note.alias}</span>
                        <span>👁️ ${note.views || 0} views</span>
                    </div>
                    <div class="shared-link-url" style="font-size: 0.85rem; color: #3fb950;">${BASE_URL}/${note.alias}</div>
                </div>
                <div class="shared-link-actions">
                    <button onclick="copyToClip('${BASE_URL}/${note.alias}')" class="btn-small">📋 Copy</button>
                    <button onclick="deleteFromKV('${note.alias}')" class="btn-small danger">🗑️ Delete</button>
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = html;
}

// Copy text to clipboard helper
function copyToClip(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Link copied!', 'success');
    });
}

// Delete from KV
async function deleteFromKV(alias) {
    if (!confirm(`Delete "${alias}" from server? This cannot be undone.`)) return;
    
    try {
        const response = await fetch(`${BASE_URL}/api/note/${alias}`, {
            method: 'DELETE',
            headers: { 'X-Master-Key': MASTER_KEY }
        });
        
        if (response.ok) {
            showToast('Deleted from server', 'success');
            refreshSharedList();
        } else {
            const result = await response.json();
            showToast(result.error || 'Failed to delete', 'error');
        }
    } catch (e) {
        showToast('Error: ' + e.message, 'error');
    }
}

// Render list of all shared links (local)
function renderSharedLinksList() {
    const container = document.getElementById('sharedLinksList');
    if (!container) return;
    
    const sharedNotes = Object.entries(sharedNotesData.notes);
    
    if (sharedNotes.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔗</div>
                <div class="empty-state-text">No shared links yet</div>
                <p style="color: #8b949e; font-size: 0.9rem; margin-top: 10px;">Share a note with an alias to save it to the server</p>
            </div>`;
        return;
    }
    
    let html = `
        <div style="background: #1c2128; border: 1px solid #30363d; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
            <p style="color: #8b949e; font-size: 0.9rem; margin: 0;">
                📊 ${sharedNotes.length} note(s) in local storage
            </p>
        </div>
    `;
    
    html += sharedNotes.map(([shareId, note]) => {
        const shareUrl = note.shareUrl || '#';
        const sharedDate = new Date(note.sharedAt).toLocaleDateString();
        return `
            <div class="shared-link-item">
                <div class="shared-link-info">
                    <div class="shared-link-title">${escapeHtml(note.title)}</div>
                    <div class="shared-link-meta">
                        <span>📅 ${sharedDate}</span>
                        ${note.alias ? `<span style="color: #3fb950;">🏷️ /${note.alias} ✅</span>` : '<span style="color: #f0883e;">⚠️ No alias (not on server)</span>'}
                    </div>
                </div>
                <div class="shared-link-actions">
                    <button onclick="copySharedLinkById('${shareId}')" class="btn-small">📋 Copy</button>
                    <button onclick="unshareNote('${shareId}')" class="btn-small danger">🗑️ Remove</button>
                </div>
            </div>
        `;
    }).join('');
    
    container.innerHTML = html;
}

// Copy a specific shared link by ID
function copySharedLinkById(shareId) {
    const note = sharedNotesData.notes[shareId];
    if (note && note.shareUrl) {
        navigator.clipboard.writeText(note.shareUrl).then(() => {
            showToast('Link copied!', 'success');
        });
    } else {
        showToast('Link not found', 'error');
    }
}

// Unshare a note
function unshareNote(shareId) {
    if (!confirm('Remove this shared link? Others will no longer be able to access it.')) return;
    
    removeFromSharedNotes(shareId);
    renderSharedLinksList();
    showToast('Link removed', 'info');
}

// Export shared notes JSON file
function exportSharedNotesJson() {
    const jsonContent = JSON.stringify(sharedNotesData, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    downloadBlob(blob, 'shared-notes.json');
    showToast('Shared notes JSON exported!', 'success');
}

// Generate .htaccess rules for alias redirects
function generateHtaccess() {
    if (!sharedNotesData.aliases || Object.keys(sharedNotesData.aliases).length === 0) {
        showToast('No aliases to export. Add custom aliases to your notes first.', 'warning');
        return '';
    }
    
    let htaccess = `# Markdown Notes - Alias Redirects
# Generated: ${new Date().toISOString()}
# Upload this file to your web root

RewriteEngine On
RewriteBase /

# Route unknown paths to view.html with alias parameter
`;
    
    htaccess += `
# Don't rewrite actual files or directories
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d

# Rewrite /anything to view.html?alias=anything
RewriteRule ^([a-zA-Z0-9_-]+)/?$ /view.html?alias=$1 [L,QSA]
`;
    
    return htaccess;
}

// Generate Cloudflare _redirects file
function generateCloudflareRedirects() {
    return `# Cloudflare Pages Redirects
# Generated: ${new Date().toISOString()}
# Routes alias URLs to view.html which loads from shared-notes.json

# Catch-all for alias URLs (static files are served normally)
/:alias  /view.html?alias=:alias  200
`;
}

// Export Cloudflare _redirects file
function exportCloudflareRedirects() {
    const redirects = generateCloudflareRedirects();
    const blob = new Blob([redirects], { type: 'text/plain' });
    downloadBlob(blob, '_redirects');
    showToast('_redirects exported for Cloudflare Pages!', 'success');
}

// Export .htaccess file
function exportHtaccess() {
    const htaccess = generateHtaccess();
    const blob = new Blob([htaccess], { type: 'text/plain' });
    downloadBlob(blob, '.htaccess');
    showToast('.htaccess exported! Upload to your web root.', 'success');
}

// Export shared-notes.json (contains all alias data)
function exportHostingFiles() {
    // Export shared-notes.json - this is the main file needed!
    const jsonContent = JSON.stringify(sharedNotesData, null, 2);
    const jsonBlob = new Blob([jsonContent], { type: 'application/json' });
    downloadBlob(jsonBlob, 'shared-notes.json');
    
    showToast('shared-notes.json exported! Upload to replace the one on your server.', 'success');
}

// Download shared notes for hosting
function downloadSharedNotesForHosting() {
    // Create a complete package for hosting
    const htmlContent = generateSharedNotesViewer();
    const jsonContent = JSON.stringify(sharedNotesData, null, 2);
    
    // Download JSON
    const jsonBlob = new Blob([jsonContent], { type: 'application/json' });
    downloadBlob(jsonBlob, 'shared-notes.json');
    
    // Download viewer HTML
    setTimeout(() => {
        const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
        downloadBlob(htmlBlob, 'view.html');
        showToast('Downloaded shared-notes.json and view.html', 'success');
    }, 500);
}

// Generate standalone viewer HTML
function generateSharedNotesViewer() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Shared Notes - ToonTamilIndia</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
    <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"><\/script>
    <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"><\/script>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"><\/script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0d1117; color: #e6edf3; line-height: 1.6; }
        .container { max-width: 900px; margin: 0 auto; padding: 40px 20px; }
        h1 { margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid #30363d; }
        .note-content { background: #161b22; padding: 30px; border-radius: 8px; border: 1px solid #30363d; }
        pre { background: #21262d; padding: 16px; border-radius: 8px; overflow-x: auto; }
        code { background: #21262d; padding: 2px 6px; border-radius: 4px; }
        blockquote { border-left: 4px solid #58a6ff; padding-left: 16px; color: #8b949e; }
        a { color: #58a6ff; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #30363d; padding: 10px; }
        th { background: #21262d; }
        .error { text-align: center; padding: 60px; color: #f85149; }
        .footer { margin-top: 30px; text-align: center; color: #8b949e; font-size: 0.9rem; }
        .footer a { color: #58a6ff; text-decoration: none; }
    </style>
</head>
<body>
    <div class="container">
        <div id="noteContent">Loading...</div>
        <div class="footer">
            Powered by <a href="https://markdown.toontamilindia.in">MD Notes</a>
        </div>
    </div>
    <script>
        async function loadNote() {
            const params = new URLSearchParams(window.location.search);
            const noteId = params.get('note');
            
            if (!noteId) {
                document.getElementById('noteContent').innerHTML = '<div class="error"><h2>No note specified</h2><p>Add ?note=your-note-id to the URL</p></div>';
                return;
            }
            
            try {
                const response = await fetch('shared-notes.json');
                const data = await response.json();
                const note = data.notes[noteId];
                
                if (!note) {
                    document.getElementById('noteContent').innerHTML = '<div class="error"><h2>Note not found</h2><p>This note may have been removed or the link is incorrect.</p></div>';
                    return;
                }
                
                document.title = note.title + ' - Shared Notes';
                const html = marked.parse(note.content);
                document.getElementById('noteContent').innerHTML = '<h1>' + note.title + '</h1><div class="note-content">' + html + '</div>';
                
                // Render math
                renderMathInElement(document.getElementById('noteContent'), {
                    delimiters: [
                        {left: '$$', right: '$$', display: true},
                        {left: '$', right: '$', display: false}
                    ],
                    throwOnError: false
                });
                
                // Highlight code
                document.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
                
            } catch (e) {
                document.getElementById('noteContent').innerHTML = '<div class="error"><h2>Error loading note</h2><p>Could not load shared-notes.json</p></div>';
            }
        }
        loadNote();
    <\/script>
</body>
</html>`;
}

function copyShareLink() {
    const url = document.getElementById('shareUrl').value;
    navigator.clipboard.writeText(url).then(() => {
        showToast('Share link copied!', 'success');
    });
}

function copyEmbedCode() {
    const code = document.getElementById('embedCode').value;
    navigator.clipboard.writeText(code).then(() => {
        showToast('Embed code copied!', 'success');
    });
}

// Social Sharing
function shareToTwitter() {
    const note = notes.find(n => n.id === currentNoteId);
    const url = document.getElementById('shareUrl').value;
    const text = encodeURIComponent(`Check out my note: ${note.title}`);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(url)}`, '_blank');
}

function shareToLinkedIn() {
    const url = document.getElementById('shareUrl').value;
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, '_blank');
}

function shareToWhatsApp() {
    const note = notes.find(n => n.id === currentNoteId);
    const url = document.getElementById('shareUrl').value;
    const text = encodeURIComponent(`${note.title}\n${url}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
}

function shareToTelegram() {
    const note = notes.find(n => n.id === currentNoteId);
    const url = document.getElementById('shareUrl').value;
    const text = encodeURIComponent(note.title);
    window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${text}`, '_blank');
}

function shareByEmail() {
    const note = notes.find(n => n.id === currentNoteId);
    const url = document.getElementById('shareUrl').value;
    const subject = encodeURIComponent(`Shared Note: ${note.title}`);
    const body = encodeURIComponent(`Check out this note:\n\n${note.title}\n\n${url}`);
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
}

// QR Code Generation (simple canvas-based)
function generateQRCode(url) {
    const canvas = document.getElementById('qrCanvas');
    const ctx = canvas.getContext('2d');
    const size = 200;
    canvas.width = size;
    canvas.height = size;
    
    // Use a simple QR-like pattern (for full QR, you'd need a library)
    // This creates a placeholder - for production, use qrcode.js library
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    
    ctx.fillStyle = '#000000';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    
    // Draw QR-like pattern
    const moduleSize = 4;
    const data = url.split('').map(c => c.charCodeAt(0));
    
    for (let y = 0; y < 50; y++) {
        for (let x = 0; x < 50; x++) {
            const idx = (y * 50 + x) % data.length;
            if ((data[idx] + x + y) % 2 === 0) {
                ctx.fillRect(x * moduleSize, y * moduleSize, moduleSize, moduleSize);
            }
        }
    }
    
    // Draw position patterns (corners)
    drawPositionPattern(ctx, 0, 0);
    drawPositionPattern(ctx, size - 28, 0);
    drawPositionPattern(ctx, 0, size - 28);
}

function drawPositionPattern(ctx, x, y) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(x, y, 28, 28);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 4, y + 4, 20, 20);
    ctx.fillStyle = '#000000';
    ctx.fillRect(x + 8, y + 8, 12, 12);
}

function downloadQR() {
    const canvas = document.getElementById('qrCanvas');
    const link = document.createElement('a');
    link.download = 'note-qr-code.png';
    link.href = canvas.toDataURL();
    link.click();
    showToast('QR code downloaded!', 'success');
}

// Export Functions
function exportAsMarkdown() {
    const note = notes.find(n => n.id === currentNoteId);
    if (!note) return;
    
    const blob = new Blob([note.content], { type: 'text/markdown' });
    downloadBlob(blob, `${sanitizeFilename(note.title)}.md`);
    showToast('Exported as Markdown', 'success');
}

function exportAsHTML() {
    const note = notes.find(n => n.id === currentNoteId);
    if (!note) return;
    
    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${escapeHtml(note.title)}</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; }
        pre { background: #f4f4f4; padding: 16px; border-radius: 8px; overflow-x: auto; }
        code { background: #f4f4f4; padding: 2px 6px; border-radius: 4px; }
        blockquote { border-left: 4px solid #0066cc; padding-left: 16px; margin-left: 0; color: #666; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
    </style>
</head>
<body>
    <h1>${escapeHtml(note.title)}</h1>
    ${marked.parse(note.content)}
    <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
    <script>renderMathInElement(document.body);</script>
</body>
</html>`;
    
    const blob = new Blob([html], { type: 'text/html' });
    downloadBlob(blob, `${sanitizeFilename(note.title)}.html`);
    showToast('Exported as HTML', 'success');
}

function exportAsPDF() {
    // Use browser's print function for PDF
    const note = notes.find(n => n.id === currentNoteId);
    if (!note) return;
    
    // Switch to preview only mode for printing
    const container = document.querySelector('.editor-container');
    container.className = 'editor-container preview-only';
    
    setTimeout(() => {
        window.print();
        // Restore view mode
        container.className = `editor-container ${viewMode}`;
    }, 100);
}

function exportAsText() {
    const note = notes.find(n => n.id === currentNoteId);
    if (!note) return;
    
    // Strip markdown formatting
    const text = note.content
        .replace(/#{1,6}\s/g, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    
    const blob = new Blob([text], { type: 'text/plain' });
    downloadBlob(blob, `${sanitizeFilename(note.title)}.txt`);
    showToast('Exported as plain text', 'success');
}

function exportAsJSON() {
    const note = notes.find(n => n.id === currentNoteId);
    if (!note) return;
    
    const data = {
        title: note.title,
        alias: note.alias,
        content: note.content,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `${sanitizeFilename(note.title)}.json`);
    showToast('Exported as JSON', 'success');
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function sanitizeFilename(name) {
    return name.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
}

// ==================== MORE OPTIONS ====================

function showMoreOptions() {
    updateNoteStats();
    document.getElementById('moreOptionsModal').classList.add('active');
}

function closeMoreOptions() {
    document.getElementById('moreOptionsModal').classList.remove('active');
}

function updateNoteStats() {
    const content = document.getElementById('markdownEditor').value;
    const words = content.trim() ? content.trim().split(/\s+/).length : 0;
    const chars = content.length;
    const lines = content.split('\n').length;
    const readTime = Math.ceil(words / 200);
    
    document.getElementById('statWords').textContent = words.toLocaleString();
    document.getElementById('statChars').textContent = chars.toLocaleString();
    document.getElementById('statLines').textContent = lines.toLocaleString();
    document.getElementById('statReadTime').textContent = readTime;
}

// Settings Functions
function loadSettings() {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
        try {
            settings = { ...settings, ...JSON.parse(stored) };
        } catch (e) {
            console.error('Error loading settings:', e);
        }
    }
}

function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function applySettings() {
    // Apply theme
    document.body.className = settings.theme !== 'dark' ? `theme-${settings.theme}` : '';
    
    // Apply font size
    const editor = document.getElementById('markdownEditor');
    editor.style.fontSize = `${settings.fontSize}px`;
    
    // Apply font
    editor.style.fontFamily = settings.font;
    
    // Apply spell check
    editor.spellcheck = settings.spellCheck;
    
    // Update UI controls
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) themeSelect.value = settings.theme;
    
    const fontSizeRange = document.getElementById('fontSizeRange');
    if (fontSizeRange) {
        fontSizeRange.value = settings.fontSize;
        document.getElementById('fontSizeValue').textContent = `${settings.fontSize}px`;
    }
    
    const fontSelect = document.getElementById('fontSelect');
    if (fontSelect) fontSelect.value = settings.font;
    
    const autoSaveCheck = document.getElementById('optionAutoSave');
    if (autoSaveCheck) autoSaveCheck.checked = settings.autoSave;
    
    const spellCheck = document.getElementById('optionSpellCheck');
    if (spellCheck) spellCheck.checked = settings.spellCheck;
}

function toggleAutoSave() {
    settings.autoSave = document.getElementById('optionAutoSave').checked;
    saveSettings();
    showToast(`Auto-save ${settings.autoSave ? 'enabled' : 'disabled'}`, 'info');
}

function toggleSpellCheck() {
    settings.spellCheck = document.getElementById('optionSpellCheck').checked;
    document.getElementById('markdownEditor').spellcheck = settings.spellCheck;
    saveSettings();
    showToast(`Spell check ${settings.spellCheck ? 'enabled' : 'disabled'}`, 'info');
}

function toggleLineNumbers() {
    settings.lineNumbers = document.getElementById('optionLineNumbers').checked;
    saveSettings();
    showToast('Line numbers toggled (requires page refresh)', 'info');
}

function changeTheme() {
    settings.theme = document.getElementById('themeSelect').value;
    document.body.className = settings.theme !== 'dark' ? `theme-${settings.theme}` : '';
    saveSettings();
}

function changeFontSize() {
    settings.fontSize = parseInt(document.getElementById('fontSizeRange').value);
    document.getElementById('fontSizeValue').textContent = `${settings.fontSize}px`;
    document.getElementById('markdownEditor').style.fontSize = `${settings.fontSize}px`;
    saveSettings();
}

function changeFont() {
    settings.font = document.getElementById('fontSelect').value;
    document.getElementById('markdownEditor').style.fontFamily = settings.font;
    saveSettings();
}

// Note Actions
function duplicateNote() {
    if (!currentNoteId) return;
    
    const note = notes.find(n => n.id === currentNoteId);
    if (!note) return;
    
    const newNote = {
        id: generateId(),
        title: `${note.title} (Copy)`,
        alias: '',
        content: note.content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    notes.unshift(newNote);
    saveNotes();
    renderNotesList();
    loadNote(newNote.id);
    closeMoreOptions();
    showToast('Note duplicated', 'success');
}

function printNote() {
    closeMoreOptions();
    exportAsPDF();
}

function clearAllNotes() {
    if (!confirm('Are you sure you want to delete ALL notes? This cannot be undone!')) return;
    if (!confirm('This will permanently delete all your notes. Type "DELETE" to confirm:')) return;
    
    const confirmation = prompt('Type DELETE to confirm:');
    if (confirmation !== 'DELETE') {
        showToast('Deletion cancelled', 'info');
        return;
    }
    
    notes = [];
    noteVersions = {};
    saveNotes();
    saveVersions();
    renderNotesList();
    createNewNote();
    closeMoreOptions();
    showToast('All notes deleted', 'info');
}

// ==================== VERSION HISTORY ====================

function loadVersions() {
    const stored = localStorage.getItem(VERSION_KEY);
    if (stored) {
        try {
            noteVersions = JSON.parse(stored);
        } catch (e) {
            console.error('Error loading versions:', e);
            noteVersions = {};
        }
    }
}

function saveVersions() {
    // Limit storage by keeping only recent versions
    const maxVersionsPerNote = 10;
    Object.keys(noteVersions).forEach(noteId => {
        if (noteVersions[noteId].length > maxVersionsPerNote) {
            noteVersions[noteId] = noteVersions[noteId].slice(0, maxVersionsPerNote);
        }
    });
    localStorage.setItem(VERSION_KEY, JSON.stringify(noteVersions));
}

function saveVersion(noteId, content) {
    if (!noteVersions[noteId]) {
        noteVersions[noteId] = [];
    }
    
    // Don't save if content is the same as last version
    if (noteVersions[noteId].length > 0 && noteVersions[noteId][0].content === content) {
        return;
    }
    
    noteVersions[noteId].unshift({
        timestamp: new Date().toISOString(),
        content: content,
        preview: content.substring(0, 100)
    });
    
    saveVersions();
}

function showVersionHistory() {
    if (!currentNoteId) return;
    
    const versions = noteVersions[currentNoteId] || [];
    const container = document.getElementById('versionList');
    
    if (versions.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📜</div><div class="empty-state-text">No version history available</div></div>';
    } else {
        container.innerHTML = versions.map((v, idx) => {
            const date = new Date(v.timestamp).toLocaleString();
            return `
                <div class="version-item">
                    <div class="version-info">
                        <div class="version-date">${date}</div>
                        <div class="version-preview">${escapeHtml(v.preview)}...</div>
                    </div>
                    <div class="version-actions">
                        <button class="btn-secondary" onclick="previewVersion(${idx})">Preview</button>
                        <button class="btn-primary" onclick="restoreVersion(${idx})">Restore</button>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    closeMoreOptions();
    document.getElementById('versionModal').classList.add('active');
}

function closeVersionHistory() {
    document.getElementById('versionModal').classList.remove('active');
}

function previewVersion(idx) {
    const versions = noteVersions[currentNoteId];
    if (!versions || !versions[idx]) return;
    
    const content = versions[idx].content;
    const previewContent = document.getElementById('previewContent');
    
    let processedContent = preprocessMath(content);
    let html = marked.parse(processedContent);
    html = postprocessMath(html);
    previewContent.innerHTML = html;
    
    if (typeof renderMathInElement !== 'undefined') {
        renderMathInElement(previewContent, {
            delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '$', right: '$', display: false}
            ],
            throwOnError: false
        });
    }
    
    showToast('Previewing version from ' + new Date(versions[idx].timestamp).toLocaleString(), 'info');
}

function restoreVersion(idx) {
    const versions = noteVersions[currentNoteId];
    if (!versions || !versions[idx]) return;
    
    if (!confirm('Restore this version? Current content will be saved as a new version.')) return;
    
    // Save current content as a version first
    const currentContent = document.getElementById('markdownEditor').value;
    saveVersion(currentNoteId, currentContent);
    
    // Restore old version
    document.getElementById('markdownEditor').value = versions[idx].content;
    updatePreview();
    autoSave();
    
    closeVersionHistory();
    showToast('Version restored', 'success');
}

// ==================== SHARED VIEW ====================

function checkSharedNote() {
    const params = new URLSearchParams(window.location.search);
    const encodedData = params.get('d');
    const isEmbed = params.get('embed') === 'true';
    
    // Also check hash for backwards compatibility with alias
    const hash = window.location.hash.slice(1);
    
    let sharedNote = null;
    
    // First try URL-encoded data (new method)
    if (encodedData) {
        sharedNote = parseNoteFromURL();
    }
    
    // Fallback: check local notes by alias/hash
    if (!sharedNote && hash) {
        const localNote = notes.find(n => n.alias === hash || n.id === hash);
        if (localNote) {
            sharedNote = {
                title: localNote.title,
                content: localNote.content
            };
        }
    }
    
    if (!sharedNote) {
        return false;
    }
    
    if (isEmbed) {
        showEmbedView(sharedNote);
        return true;
    }
    
    showSharedView(sharedNote);
    return true;
}

function showSharedView(sharedNote) {
    document.getElementById('sharedTitle').textContent = sharedNote.title;
    const sharedContent = document.getElementById('sharedContent');
    
    let processedContent = preprocessMath(sharedNote.content);
    let html = marked.parse(processedContent);
    html = postprocessMath(html);
    
    // Sanitize HTML output to prevent XSS attacks
    if (typeof DOMPurify !== 'undefined') {
        html = DOMPurify.sanitize(html, {
            ADD_TAGS: ['math', 'mrow', 'mi', 'mn', 'mo', 'msup', 'msub', 'mfrac', 'mroot', 'msqrt', 'mtext', 'mtable', 'mtr', 'mtd', 'mover', 'munder', 'munderover', 'semantics', 'annotation'],
            ADD_ATTR: ['xmlns', 'mathvariant', 'fence', 'separator', 'stretchy']
        });
    }
    
    sharedContent.innerHTML = html;
    
    if (typeof renderMathInElement !== 'undefined') {
        renderMathInElement(sharedContent, {
            delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '$', right: '$', display: false}
            ],
            throwOnError: false,
            trust: false
        });
    }
    
    // Highlight code
    sharedContent.querySelectorAll('pre code').forEach(block => {
        hljs.highlightElement(block);
    });
    
    document.getElementById('sharedView').classList.remove('hidden');
    document.querySelector('.app-container').style.display = 'none';
}

function showEmbedView(sharedNote) {
    document.body.innerHTML = `
        <div style="padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0d1117; color: #e6edf3; min-height: 100vh;">
            <h1 style="margin-bottom: 20px; border-bottom: 1px solid #30363d; padding-bottom: 10px;">${escapeHtml(sharedNote.title)}</h1>
            <div id="embedContent">${marked.parse(sharedNote.content)}</div>
            <div style="margin-top: 20px; padding-top: 10px; border-top: 1px solid #30363d; font-size: 0.8rem; color: #8b949e;">
                Powered by <a href="${BASE_URL}" style="color: #58a6ff;">MD Notes</a>
            </div>
        </div>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
        <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"><\/script>
        <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"><\/script>
        <script>
            document.addEventListener('DOMContentLoaded', function() {
                if (typeof renderMathInElement !== 'undefined') {
                    renderMathInElement(document.getElementById('embedContent'), {
                        delimiters: [
                            {left: '$$', right: '$$', display: true},
                            {left: '$', right: '$', display: false}
                        ],
                        throwOnError: false
                    });
                }
            });
        <\/script>
    `;
}

function copySharedNote() {
    const content = document.getElementById('sharedContent').innerText;
    navigator.clipboard.writeText(content).then(() => {
        showToast('Content copied!', 'success');
    });
}

function exitSharedView() {
    document.getElementById('sharedView').classList.add('hidden');
    document.querySelector('.app-container').style.display = 'flex';
    history.replaceState(null, '', window.location.pathname);
}

// ==================== IMPORT MODAL ====================

function showImportModal() {
    document.getElementById('importModal').classList.add('active');
    switchImportTab('paste');
    document.getElementById('importTextarea').focus();
}

function closeImportModal() {
    document.getElementById('importModal').classList.remove('active');
    document.getElementById('importTextarea').value = '';
}

function switchImportTab(tab) {
    document.querySelectorAll('.import-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.import-tabs .share-tab').forEach(el => el.classList.remove('active'));
    
    document.getElementById(`import${tab.charAt(0).toUpperCase() + tab.slice(1)}Content`).classList.remove('hidden');
    document.querySelector(`.import-tabs .share-tab[onclick*="${tab}"]`).classList.add('active');
}

function handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const content = e.target.result;
        
        createNewNote();
        document.getElementById('markdownEditor').value = content;
        document.getElementById('noteTitle').value = file.name.replace(/\.(md|txt|markdown)$/i, '');
        updatePreview();
        autoSave();
        closeImportModal();
        showToast(`Imported: ${file.name}`, 'success');
    };
    reader.readAsText(file);
}

function handleJsonImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importedNotes = JSON.parse(e.target.result);
            
            if (!Array.isArray(importedNotes)) {
                throw new Error('Invalid format');
            }
            
            let importCount = 0;
            importedNotes.forEach(note => {
                if (note.title && note.content) {
                    const newNote = {
                        id: generateId(),
                        title: note.title,
                        alias: note.alias || '',
                        content: note.content,
                        createdAt: note.createdAt || new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    };
                    notes.unshift(newNote);
                    importCount++;
                }
            });
            
            saveNotes();
            renderNotesList();
            if (notes.length > 0) {
                loadNote(notes[0].id);
            }
            closeImportModal();
            showToast(`Imported ${importCount} notes from backup`, 'success');
        } catch (err) {
            showToast('Invalid JSON backup file', 'error');
        }
    };
    reader.readAsText(file);
}

async function importFromUrl() {
    const url = document.getElementById('importUrl').value.trim();
    if (!url) {
        showToast('Please enter a URL', 'error');
        return;
    }
    
    try {
        showToast('Fetching content...', 'info');
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch');
        
        const content = await response.text();
        
        createNewNote();
        document.getElementById('markdownEditor').value = content;
        
        // Try to extract title from URL or content
        const urlParts = url.split('/');
        let title = urlParts[urlParts.length - 1].replace(/\.(md|txt|markdown)$/i, '');
        const firstLine = content.split('\n')[0].replace(/^#*\s*/, '');
        if (firstLine && firstLine.length < 100) {
            title = firstLine;
        }
        document.getElementById('noteTitle').value = title;
        
        updatePreview();
        autoSave();
        closeImportModal();
        showToast('Content imported from URL', 'success');
    } catch (err) {
        showToast('Failed to fetch content from URL. Make sure it\'s a raw file URL.', 'error');
    }
}

// Drag and drop support for file import
document.addEventListener('DOMContentLoaded', () => {
    const fileUploadBoxes = document.querySelectorAll('.file-upload-box');
    
    fileUploadBoxes.forEach(box => {
        box.addEventListener('dragover', (e) => {
            e.preventDefault();
            box.classList.add('drag-over');
        });
        
        box.addEventListener('dragleave', () => {
            box.classList.remove('drag-over');
        });
        
        box.addEventListener('drop', (e) => {
            e.preventDefault();
            box.classList.remove('drag-over');
            
            const file = e.dataTransfer.files[0];
            if (file) {
                if (file.name.endsWith('.json')) {
                    handleJsonImport({ target: { files: [file] } });
                } else {
                    handleFileImport({ target: { files: [file] } });
                }
            }
        });
    });
});

// Service Worker Registration (for PWA)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {
            // Service worker registration failed, continue without it
        });
    });
}
