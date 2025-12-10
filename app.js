// Markdown Notes Application
// Master Key: ToonTamilIndia

const MASTER_KEY = 'ToonTamilIndia';
const STORAGE_KEY = 'markdown_notes';
const MASTER_KEY_UNLOCKED = 'master_key_unlocked';

// Application State
let notes = [];
let currentNoteId = null;
let viewMode = 'split'; // 'split', 'editor-only', 'preview-only'
let isMasterKeyUnlocked = false;
let debounceTimer = null;

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    loadNotes();
    loadMasterKeyState();
    setupEventListeners();
    renderNotesList();
    
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
    if (!currentNoteId) return;

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

    // Pre-process for math equations
    let processedContent = preprocessMath(content);
    
    // Parse markdown
    let html = marked.parse(processedContent);
    
    previewContainer.innerHTML = html;

    // Render math equations
    if (typeof renderMathInElement !== 'undefined') {
        renderMathInElement(previewContainer, {
            delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '$', right: '$', display: false},
                {left: '\\[', right: '\\]', display: true},
                {left: '\\(', right: '\\)', display: false}
            ],
            throwOnError: false
        });
    }

    // Highlight code blocks
    previewContainer.querySelectorAll('pre code').forEach(block => {
        hljs.highlightElement(block);
    });
}

// Preprocess Math Equations
function preprocessMath(content) {
    // Protect math blocks from markdown parser
    let result = content;
    
    // Handle display math
    result = result.replace(/\$\$([\s\S]*?)\$\$/g, (match, math) => {
        return `<div class="math-block">$$${math}$$</div>`;
    });
    
    return result;
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

// Service Worker Registration (for PWA)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {
            // Service worker registration failed, continue without it
        });
    });
}
