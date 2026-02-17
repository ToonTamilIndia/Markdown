// Safe markdown parser
function parseMarkdown(text) {
    if (typeof marked !== 'undefined' && marked.parse) {
        return marked.parse(text);
    }
    // Fallback: simple text with line breaks
    return text.replace(/\n/g, '<br>');
}

// Helper function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== Selection Persistence =====
// Saves the editor selection so it survives focus changes (clicking AI panel, etc.)
let _savedSelection = { start: 0, end: 0, text: '' };

function saveEditorSelection() {
    const editor = document.getElementById('markdownEditor');
    if (!editor) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    if (end > start) {
        _savedSelection = {
            start,
            end,
            text: editor.value.substring(start, end)
        };
        updateSelectionBadge();
    }
}

function getSavedSelection() {
    return _savedSelection.text || '';
}

function clearSavedSelection() {
    _savedSelection = { start: 0, end: 0, text: '' };
    updateSelectionBadge();
}

function updateSelectionBadge() {
    const badge = document.getElementById('aiSelectionBadge');
    if (!badge) return;
    if (_savedSelection.text) {
        const preview = _savedSelection.text.length > 60
            ? _savedSelection.text.substring(0, 57) + '...'
            : _savedSelection.text;
        badge.innerHTML = `<span class="ai-sel-icon">✂️</span>
            <span class="ai-sel-text" title="${escapeHtml(_savedSelection.text)}">${escapeHtml(preview)}</span>
            <button onclick="clearSavedSelection()" class="ai-sel-clear" title="Clear selection">×</button>`;
        badge.classList.add('visible');
    } else {
        badge.classList.remove('visible');
        badge.innerHTML = '';
    }
}

// Get currently selected text from the editor (uses saved selection if editor not focused)
function getSelectedText() {
    const editor = document.getElementById('markdownEditor');
    if (!editor) return _savedSelection.text || '';
    // If the editor is currently focused and has a live selection, use that
    if (document.activeElement === editor && editor.selectionEnd > editor.selectionStart) {
        return editor.value.substring(editor.selectionStart, editor.selectionEnd);
    }
    // Otherwise return the saved selection
    return _savedSelection.text || '';
}

// AI Assistant for Markdown Notes
// Supports OpenAI, Gemini, and OpenRouter

class AIAssistant {
    constructor() {
        this.apiKeys = this.loadAPIKeys();
        this.currentProvider = localStorage.getItem('ai_provider') || 'openai';
        this.currentModel = localStorage.getItem('ai_model') || 'gpt-3.5-turbo';
        this.isEnabled = false;
        this.conversationHistory = [];
    }

    // Load API keys from localStorage
    loadAPIKeys() {
        return {
            openai: localStorage.getItem('ai_key_openai') || '',
            gemini: localStorage.getItem('ai_key_gemini') || '',
            openrouter: localStorage.getItem('ai_key_openrouter') || ''
        };
    }

    // Save API key
    saveAPIKey(provider, key) {
        localStorage.setItem(`ai_key_${provider}`, key);
        this.apiKeys[provider] = key;
    }

    // Check if AI is available
    isAvailable() {
        return this.apiKeys[this.currentProvider] && this.apiKeys[this.currentProvider].length > 0;
    }

    // Set provider and model
    setProvider(provider, model) {
        this.currentProvider = provider;
        this.currentModel = model;
        localStorage.setItem('ai_provider', provider);
        localStorage.setItem('ai_model', model);
    }

    // Call OpenAI API
    async callOpenAI(messages, options = {}) {
        const apiKey = this.apiKeys.openai;
        if (!apiKey) throw new Error('OpenAI API key not set');

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: this.currentModel,
                messages: messages,
                temperature: options.temperature || 0.7,
                max_tokens: options.maxTokens || 2000,
                stream: options.stream || false
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'OpenAI API request failed');
        }

        return await response.json();
    }

    // Call Google Gemini API
    async callGemini(messages, options = {}) {
        const apiKey = this.apiKeys.gemini;
        if (!apiKey) throw new Error('Gemini API key not set');

        // Use v1 API instead of v1beta
        // Extract model name without 'models/' prefix if present
        const modelName = this.currentModel.replace('models/', '');
        
        // Convert messages to Gemini format - only include user messages
        const userMessages = messages.filter(msg => msg.role !== 'system');
        const contents = userMessages.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));

        // Add system message as first user message if present
        const systemMsg = messages.find(msg => msg.role === 'system');
        if (systemMsg) {
            contents.unshift({
                role: 'user',
                parts: [{ text: systemMsg.content }]
            });
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: contents,
                generationConfig: {
                    temperature: options.temperature || 0.7,
                    maxOutputTokens: options.maxTokens || 2000
                }
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Gemini API request failed');
        }

        const data = await response.json();
        return {
            choices: [{
                message: {
                    content: data.candidates[0].content.parts[0].text
                }
            }]
        };
    }

    // Call OpenRouter API
    async callOpenRouter(messages, options = {}) {
        const apiKey = this.apiKeys.openrouter;
        if (!apiKey) throw new Error('OpenRouter API key not set');

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': window.location.origin,
                'X-Title': 'Markdown Notes AI'
            },
            body: JSON.stringify({
                model: this.currentModel,
                messages: messages,
                temperature: options.temperature || 0.7,
                max_tokens: options.maxTokens || 2000
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'OpenRouter API request failed');
        }

        return await response.json();
    }

    // Main API call function
    async chat(userMessage, systemPrompt = null, options = {}) {
        const messages = [];
        
        if (systemPrompt) {
            messages.push({
                role: 'system',
                content: systemPrompt
            });
        }

        // Add conversation history if available
        if (options.includeHistory && this.conversationHistory.length > 0) {
            messages.push(...this.conversationHistory);
        }

        messages.push({
            role: 'user',
            content: userMessage
        });

        let response;
        
        switch (this.currentProvider) {
            case 'openai':
                response = await this.callOpenAI(messages, options);
                break;
            case 'gemini':
                response = await this.callGemini(messages, options);
                break;
            case 'openrouter':
                response = await this.callOpenRouter(messages, options);
                break;
            default:
                throw new Error('Invalid AI provider');
        }

        const assistantMessage = response.choices[0].message.content;

        // Update conversation history
        if (options.includeHistory) {
            this.conversationHistory.push(
                { role: 'user', content: userMessage },
                { role: 'assistant', content: assistantMessage }
            );
            
            // Keep only last 10 messages
            if (this.conversationHistory.length > 20) {
                this.conversationHistory = this.conversationHistory.slice(-20);
            }
        }

        return assistantMessage;
    }

    // Clear conversation history
    clearHistory() {
        this.conversationHistory = [];
    }

    // AI Actions for markdown editing

    // Improve text
    async improveText(text) {
        const prompt = `Improve the following text while maintaining its meaning. Make it clearer, more concise, and better written:\n\n${text}`;
        return await this.chat(prompt, 'You are a helpful writing assistant that improves text quality.');
    }

    // Fix grammar and spelling
    async fixGrammar(text) {
        const prompt = `Fix grammar, spelling, and punctuation errors in the following text:\n\n${text}`;
        return await this.chat(prompt, 'You are a grammar and spelling expert.');
    }

    // Make text longer
    async expandText(text) {
        const prompt = `Expand the following text with more details, examples, and explanations:\n\n${text}`;
        return await this.chat(prompt, 'You are a helpful writing assistant that expands content.');
    }

    // Make text shorter
    async summarizeText(text) {
        const prompt = `Summarize the following text concisely:\n\n${text}`;
        return await this.chat(prompt, 'You are a helpful summarization assistant.');
    }

    // Explain code/concept
    async explainText(text) {
        const prompt = `Explain the following text or code in simple terms:\n\n${text}`;
        return await this.chat(prompt, 'You are a helpful teacher that explains concepts clearly.');
    }

    // Generate content
    async generateContent(prompt) {
        return await this.chat(prompt, 'You are a helpful writing assistant that generates high-quality markdown content.');
    }

    // Answer questions about the note
    async askAboutNote(question, noteContent) {
        const prompt = `Based on the following note content, answer this question: ${question}\n\nNote content:\n${noteContent}`;
        return await this.chat(prompt, 'You are a helpful assistant that answers questions about document content.');
    }

    // Create a note from description
    async createNote(description) {
        const prompt = `Create a well-structured markdown note about: ${description}\n\nInclude headings, lists, and formatting as appropriate.`;
        return await this.chat(prompt, 'You are a helpful assistant that creates well-formatted markdown notes.');
    }

    // Continue writing
    async continueWriting(currentText) {
        const prompt = `Continue writing from where this text left off:\n\n${currentText}`;
        return await this.chat(prompt, 'You are a creative writing assistant that continues text naturally.');
    }

    // Generate diagram from description
    async generateDiagram(description, diagramType = 'mermaid') {
        let prompt = '';
        
        switch (diagramType) {
            case 'mermaid':
                prompt = `Create a Mermaid diagram for: ${description}\n\nProvide only the diagram code in a markdown code block with \`\`\`mermaid syntax.`;
                break;
            case 'plantuml':
                prompt = `Create a PlantUML diagram for: ${description}\n\nProvide only the diagram code in a markdown code block with \`\`\`plantuml syntax.`;
                break;
            case 'graphviz':
                prompt = `Create a Graphviz DOT diagram for: ${description}\n\nProvide only the diagram code in a markdown code block with \`\`\`dot syntax.`;
                break;
        }
        
        return await this.chat(prompt, 'You are a diagram expert that creates clear, well-structured diagrams.');
    }
}

// Global AI assistant instance
let aiAssistant = null;

// Initialize AI assistant
function initializeAI() {
    aiAssistant = new AIAssistant();
    updateAIButtonState();
}

// Update AI button visibility based on screen size
function updateAIButtonState() {
    const aiButton = document.getElementById('aiAssistantBtn');
    if (!aiButton) return;

    // Hide on mobile (width < 768px)
    const isMobile = window.innerWidth < 768;
    aiButton.style.display = isMobile ? 'none' : 'flex';
    
    // Update button state based on API key availability
    if (aiAssistant && aiAssistant.isAvailable()) {
        aiButton.classList.add('ai-available');
        aiButton.title = 'AI Assistant (Ctrl+I)';
    } else {
        aiButton.classList.remove('ai-available');
        aiButton.title = 'AI Assistant (Configure in Settings)';
    }
}

// Show AI panel
function showAIPanel() {
    if (!aiAssistant) {
        initializeAI();
    }

    if (!aiAssistant.isAvailable()) {
        showToast('Please configure AI API keys in Settings first', 'warning');
        showAISettings();
        return;
    }

    const panel = document.getElementById('aiPanel');
    panel.classList.add('active');
    panel.classList.remove('minimized');
    document.getElementById('aiInput').focus();
}

// Hide AI panel
function hideAIPanel() {
    const panel = document.getElementById('aiPanel');
    panel.classList.remove('active', 'minimized', 'maximized');
}

// Toggle AI panel open/close
function toggleAIPanel() {
    const panel = document.getElementById('aiPanel');
    if (panel.classList.contains('active')) {
        hideAIPanel();
    } else {
        showAIPanel();
    }
}

// Minimize AI panel (collapse to just the header bar)
function toggleAIMinimize() {
    const panel = document.getElementById('aiPanel');
    panel.classList.toggle('minimized');
    panel.classList.remove('maximized');
}

// Maximize AI panel (full width)
function toggleAIMaximize() {
    const panel = document.getElementById('aiPanel');
    panel.classList.toggle('maximized');
    panel.classList.remove('minimized');
}

// Set AI mode (ask / agent / edit)
function setAIMode(mode) {
    // Update tabs
    document.querySelectorAll('.ai-mode-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.mode === mode);
    });

    // Update badge
    const badge = document.getElementById('aiModeBadge');
    if (badge) {
        badge.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
    }

    // Store mode
    if (mode === 'agent') {
        localStorage.setItem('ai_agent_mode', 'true');
    } else {
        localStorage.setItem('ai_agent_mode', 'false');
    }

    // Update placeholder
    const input = document.getElementById('aiInput');
    if (input) {
        const placeholders = {
            ask: 'Ask a question about your note...',
            agent: 'Tell me what to create or edit...',
            edit: 'Describe edits to apply to your note...'
        };
        input.placeholder = placeholders[mode] || 'Ask anything... (Ctrl+Enter to send)';
    }
}

// Clear AI chat messages
function clearAIChat() {
    const messagesContainer = document.getElementById('aiMessages');
    if (messagesContainer) messagesContainer.innerHTML = '';

    // Show welcome again
    const welcome = document.getElementById('aiWelcome');
    if (welcome) welcome.style.display = '';

    // Clear conversation history
    if (aiAssistant) aiAssistant.clearHistory();

    window.currentAIResult = null;
}

// ===== Chat Message Rendering Helpers =====

function addUserMessage(text) {
    hideWelcome();
    const container = document.getElementById('aiMessages');
    const msg = document.createElement('div');
    msg.className = 'ai-msg user';
    msg.innerHTML = `
        <div class="ai-msg-avatar">👤</div>
        <div class="ai-msg-body">
            <div class="ai-msg-content">${escapeHtml(text)}</div>
        </div>
    `;
    container.appendChild(msg);
    scrollChatToBottom();
}

function addAssistantMessage(html, rawText) {
    const container = document.getElementById('aiMessages');
    const msg = document.createElement('div');
    msg.className = 'ai-msg assistant';
    msg.innerHTML = `
        <div class="ai-msg-avatar">🤖</div>
        <div class="ai-msg-body">
            <div class="ai-msg-content">${html}</div>
            <div class="ai-msg-actions">
                <button onclick="insertAIResult()" class="ai-msg-action primary">✓ Insert</button>
                <button onclick="replaceWithAIResult()" class="ai-msg-action">⟳ Replace</button>
                <button onclick="copyAIResult()" class="ai-msg-action">📋 Copy</button>
            </div>
        </div>
    `;
    container.appendChild(msg);
    window.currentAIResult = rawText;
    scrollChatToBottom();
}

function addErrorMessage(errorText) {
    const container = document.getElementById('aiMessages');
    const msg = document.createElement('div');
    msg.className = 'ai-msg assistant';
    msg.innerHTML = `
        <div class="ai-msg-avatar">⚠️</div>
        <div class="ai-msg-body">
            <div class="ai-error">
                <div style="display:flex;align-items:flex-start;gap:8px">
                    <span style="font-size:1.1rem">❌</span>
                    <div style="flex:1;min-width:0">
                        <div style="font-weight:500;margin-bottom:2px">Something went wrong</div>
                        <div style="opacity:.85;font-size:.82rem">${escapeHtml(errorText)}</div>
                    </div>
                </div>
                <div style="display:flex;gap:6px;margin-top:8px">
                    <button onclick="showAISettings()" class="ai-msg-action" style="font-size:.75rem">⚙️ Settings</button>
                </div>
            </div>
        </div>
    `;
    container.appendChild(msg);
    scrollChatToBottom();
}

function showThinking() {
    hideWelcome();
    const container = document.getElementById('aiMessages');
    const el = document.createElement('div');
    el.id = 'aiThinking';
    el.className = 'ai-msg assistant';
    el.innerHTML = `
        <div class="ai-msg-avatar">🤖</div>
        <div class="ai-msg-body">
            <div class="ai-thinking">
                <div class="ai-thinking-dots"><span></span><span></span><span></span></div>
                <span class="ai-thinking-text">Thinking...</span>
            </div>
        </div>
    `;
    container.appendChild(el);
    scrollChatToBottom();
}

function hideThinking() {
    const el = document.getElementById('aiThinking');
    if (el) el.remove();
}

function hideWelcome() {
    const welcome = document.getElementById('aiWelcome');
    if (welcome) welcome.style.display = 'none';
}

function scrollChatToBottom() {
    const body = document.getElementById('aiChatBody');
    if (body) {
        requestAnimationFrame(() => {
            body.scrollTop = body.scrollHeight;
        });
    }
}

function setAIStatusDot(state) {
    const dot = document.getElementById('aiStatusDot');
    if (!dot) return;
    dot.className = 'ai-status-dot';
    if (state === 'busy') dot.classList.add('busy');
    else if (state === 'error') dot.classList.add('error');
}

// Show AI settings
function showAISettings() {
    const modal = document.getElementById('aiSettingsModal');
    modal.classList.add('active');
    
    // Load current settings
    if (aiAssistant) {
        document.getElementById('aiProviderSelect').value = aiAssistant.currentProvider;
        document.getElementById('aiOpenAIKey').value = aiAssistant.apiKeys.openai || '';
        document.getElementById('aiGeminiKey').value = aiAssistant.apiKeys.gemini || '';
        document.getElementById('aiOpenRouterKey').value = aiAssistant.apiKeys.openrouter || '';
        
        // Load agent mode settings
        const agentMode = localStorage.getItem('ai_agent_mode') === 'true';
        const autoSave = localStorage.getItem('ai_auto_save') === 'true';
        const confirmChanges = localStorage.getItem('ai_confirm_changes') !== 'false';
        
        if (document.getElementById('aiAgentMode')) {
            document.getElementById('aiAgentMode').checked = agentMode;
        }
        if (document.getElementById('aiAutoSave')) {
            document.getElementById('aiAutoSave').checked = autoSave;
        }
        if (document.getElementById('aiConfirmChanges')) {
            document.getElementById('aiConfirmChanges').checked = confirmChanges;
        }
        
        // Update provider and load models
        updateProviderSettings();
    }
    
    // Update API key statuses
    updateAPIKeyStatuses();
}

// Close AI settings
function closeAISettings() {
    document.getElementById('aiSettingsModal').classList.remove('active');
}

// Update model options based on provider (DEPRECATED - use refreshModels instead)
function updateModelOptions() {
    // Kept for backwards compatibility
    refreshModels();
}

// Save AI settings
function saveAISettings() {
    const provider = document.getElementById('aiProviderSelect').value;
    const model = document.getElementById('aiModelSelect').value;
    const openaiKey = document.getElementById('aiOpenAIKey').value.trim();
    const geminiKey = document.getElementById('aiGeminiKey').value.trim();
    const openrouterKey = document.getElementById('aiOpenRouterKey').value.trim();
    
    // Agent mode settings
    const agentMode = document.getElementById('aiAgentMode')?.checked || false;
    const autoSave = document.getElementById('aiAutoSave')?.checked || false;
    const confirmChanges = document.getElementById('aiConfirmChanges')?.checked || true;
    
    if (!aiAssistant) {
        initializeAI();
    }
    
    // Save API keys (only if not empty)
    if (openaiKey) aiAssistant.saveAPIKey('openai', openaiKey);
    if (geminiKey) aiAssistant.saveAPIKey('gemini', geminiKey);
    if (openrouterKey) aiAssistant.saveAPIKey('openrouter', openrouterKey);
    
    // Set provider and model
    if (model) {
        aiAssistant.setProvider(provider, model);
    }
    
    // Save agent mode settings
    localStorage.setItem('ai_agent_mode', agentMode);
    localStorage.setItem('ai_auto_save', autoSave);
    localStorage.setItem('ai_confirm_changes', confirmChanges);
    
    updateAIButtonState();
    updateAPIKeyStatuses();
    closeAISettings();
    
    if (typeof showToast === 'function') {
        showToast('✓ AI settings saved successfully', 'success');
    } else {
        alert('✓ AI settings saved successfully');
    }
}

// Process AI command
async function processAICommand() {
    const inputEl = document.getElementById('aiInput');
    const input = inputEl.value.trim();
    if (!input) return;
    
    const editor = document.getElementById('markdownEditor');
    // Use saved selection (persists even after focus moves to AI panel)
    const selectedText = getSelectedText();
    const fullText = editor.value;
    
    // Add user message to chat (include selection context if any)
    let displayMsg = input;
    if (selectedText && input.toLowerCase() !== selectedText.toLowerCase()) {
        displayMsg = input + '\n\n📎 Using selected text (' + selectedText.length + ' chars)';
    }
    addUserMessage(displayMsg);
    inputEl.value = '';
    inputEl.style.height = 'auto';
    
    // Show thinking indicator
    showThinking();
    updateAIStatus('Processing...');
    setAIStatusDot('busy');
    
    try {
        let result = '';
        const lowerInput = input.toLowerCase();
        
        if (lowerInput.startsWith('create') || lowerInput.startsWith('generate')) {
            result = await aiAssistant.createNote(input);
        } else if (lowerInput.includes('improve') && selectedText) {
            result = await aiAssistant.improveText(selectedText);
        } else if (lowerInput.includes('fix') || lowerInput.includes('grammar')) {
            result = await aiAssistant.fixGrammar(selectedText || fullText);
        } else if (lowerInput.includes('expand') || lowerInput.includes('longer')) {
            result = await aiAssistant.expandText(selectedText || fullText);
        } else if (lowerInput.includes('summarize') || lowerInput.includes('shorter')) {
            result = await aiAssistant.summarizeText(selectedText || fullText);
        } else if (lowerInput.includes('explain')) {
            result = await aiAssistant.explainText(selectedText || input);
        } else if (lowerInput.includes('continue')) {
            result = await aiAssistant.continueWriting(fullText);
        } else if (lowerInput.includes('diagram')) {
            const diagramType = lowerInput.includes('plantuml') ? 'plantuml' : 
                               lowerInput.includes('graphviz') ? 'graphviz' : 'mermaid';
            result = await aiAssistant.generateDiagram(input, diagramType);
        } else if (input.endsWith('?')) {
            result = await aiAssistant.askAboutNote(input, fullText);
        } else {
            result = await aiAssistant.generateContent(input);
        }
        
        hideThinking();
        addAssistantMessage(parseMarkdown(result), result);
        updateAIStatus('Ready');
        setAIStatusDot('ready');
        
    } catch (error) {
        hideThinking();
        addErrorMessage(error.message);
        updateAIStatus('Error');
        setAIStatusDot('error');
        console.error('AI error:', error);
    }
}

// AI result actions
function insertAIResult() {
    const editor = document.getElementById('markdownEditor');
    // Insert at saved selection position, or at cursor, or at end
    const pos = _savedSelection.end || editor.selectionStart || editor.value.length;
    const text = editor.value;
    const result = window.currentAIResult || '';
    
    editor.value = text.substring(0, pos) + '\n\n' + result + '\n\n' + text.substring(pos);
    editor.focus();
    updatePreview();
    showToast('AI content inserted', 'success');
}

function replaceWithAIResult() {
    const editor = document.getElementById('markdownEditor');
    const text = editor.value;
    const result = window.currentAIResult || '';
    
    // Use saved selection range for replacement
    const start = _savedSelection.start;
    const end = _savedSelection.end;
    
    if (start !== end && start < text.length) {
        editor.value = text.substring(0, start) + result + text.substring(end);
    } else {
        editor.value = result;
    }
    
    editor.focus();
    updatePreview();
    clearSavedSelection();
    showToast('Content replaced with AI result', 'success');
}

function copyAIResult() {
    const result = window.currentAIResult || '';
    navigator.clipboard.writeText(result).then(() => {
        showToast('AI result copied to clipboard', 'success');
    });
}

// Quick AI actions
async function quickAIAction(action) {
    // Use saved selection (persists even after clicking AI panel)
    const selectedText = getSelectedText();
    
    if (!selectedText && action !== 'create') {
        if (typeof showToast === 'function') {
            showToast('Select text in the editor first, then try again', 'warning');
        } else {
            alert('Please select text first');
        }
        return;
    }
    
    if (!aiAssistant || !aiAssistant.isAvailable()) {
        if (typeof showToast === 'function') {
            showToast('Please configure AI API keys first', 'warning');
        } else {
            alert('Please configure AI API keys first');
        }
        showAISettings();
        return;
    }
    
    // Ensure panel is open
    const panel = document.getElementById('aiPanel');
    if (!panel.classList.contains('active')) showAIPanel();

    const actionLabels = {
        improve: '✨ Improve text',
        fix: '✓ Fix grammar',
        expand: '📝 Expand text',
        summarize: '📄 Summarize',
        explain: '💡 Explain'
    };
    
    addUserMessage(actionLabels[action] || action);
    showThinking();
    updateAIStatus('Processing...');
    setAIStatusDot('busy');
    
    try {
        let result = '';
        
        switch (action) {
            case 'improve':
                result = await aiAssistant.improveText(selectedText);
                break;
            case 'fix':
                result = await aiAssistant.fixGrammar(selectedText);
                break;
            case 'expand':
                result = await aiAssistant.expandText(selectedText);
                break;
            case 'summarize':
                result = await aiAssistant.summarizeText(selectedText);
                break;
            case 'explain':
                result = await aiAssistant.explainText(selectedText);
                break;
        }
        
        hideThinking();
        addAssistantMessage(parseMarkdown(result), result);
        updateAIStatus('Ready');
        setAIStatusDot('ready');
        
    } catch (error) {
        hideThinking();
        addErrorMessage(error.message);
        updateAIStatus('Error');
        setAIStatusDot('error');
        console.error('AI error:', error);
    }
}

// Keyboard shortcut for AI (Ctrl+I)
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'i' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        toggleAIPanel();
    }
    
    // Ctrl+Enter to send AI message
    if (e.ctrlKey && e.key === 'Enter' && document.activeElement.id === 'aiInput') {
        e.preventDefault();
        handleAICommand();
    }

    // Escape to close AI panel
    if (e.key === 'Escape') {
        const panel = document.getElementById('aiPanel');
        if (panel && panel.classList.contains('active')) {
            hideAIPanel();
        }
    }
});

// Text formatting functions
function aiFormatText(format) {
    const textarea = document.getElementById('markdownEditor');
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    
    if (!selectedText) {
        alert('Please select text first');
        return;
    }
    
    let formattedText = '';
    
    switch(format) {
        case 'bold':
            formattedText = `**${selectedText}**`;
            break;
        case 'italic':
            formattedText = `*${selectedText}*`;
            break;
        case 'code':
            formattedText = selectedText.includes('\n') 
                ? `\`\`\`\n${selectedText}\n\`\`\`` 
                : `\`${selectedText}\``;
            break;
        case 'heading':
            formattedText = `## ${selectedText}`;
            break;
        case 'list':
            formattedText = selectedText.split('\n').map(line => `- ${line}`).join('\n');
            break;
    }
    
    textarea.value = textarea.value.substring(0, start) + formattedText + textarea.value.substring(end);
    textarea.focus();
    textarea.selectionStart = start;
    textarea.selectionEnd = start + formattedText.length;
    
    // Update preview
    if (typeof updatePreview === 'function') {
        updatePreview();
    }
}

// Show AI templates
function showAITemplates() {
    const templatesDiv = document.getElementById('aiTemplates');
    if (templatesDiv) {
        templatesDiv.classList.remove('hidden');
    }
}

// Hide AI templates
function hideAITemplates() {
    const templatesDiv = document.getElementById('aiTemplates');
    if (templatesDiv) {
        templatesDiv.classList.add('hidden');
    }
}

// Use template
function useTemplate(templateType) {
    const aiInput = document.getElementById('aiInput');
    let prompt = '';
    
    switch(templateType) {
        case 'create-tutorial':
            prompt = 'Create a step-by-step tutorial about ';
            break;
        case 'generate-diagram':
            prompt = 'Generate a mermaid diagram for ';
            break;
        case 'write-blog':
            prompt = 'Write a blog post about ';
            break;
        case 'explain-code':
            const selectedText = getSelectedText();
            if (selectedText) {
                prompt = `Explain this code in simple terms:\n\n${selectedText}`;
                aiInput.value = prompt;
                hideAITemplates();
                return;
            } else {
                prompt = 'Explain this code: ';
            }
            break;
        case 'create-list':
            prompt = 'Create a comprehensive list of ';
            break;
        case 'compare':
            prompt = 'Compare and contrast ';
            break;
    }
    
    aiInput.value = prompt;
    aiInput.focus();
    // Move cursor to end
    aiInput.selectionStart = aiInput.selectionEnd = prompt.length;
    hideAITemplates();
}

// Show AI help
function showAIHelp() {
    hideWelcome();
    const helpHtml = `
        <h3>🤖 AI Assistant Help</h3>
        <h4>Quick Actions</h4>
        <ul>
            <li><strong>✨ Improve:</strong> Enhance selected text quality</li>
            <li><strong>✓ Fix Grammar:</strong> Correct spelling and grammar</li>
            <li><strong>📝 Expand:</strong> Add more details and context</li>
            <li><strong>📄 Summarize:</strong> Make text shorter and concise</li>
            <li><strong>💡 Explain:</strong> Simplify complex concepts</li>
        </ul>
        <h4>Custom Prompts</h4>
        <p>Type any request like:</p>
        <ul>
            <li>"Create a tutorial about Python loops"</li>
            <li>"Generate a flowchart for user login"</li>
            <li>"Explain quantum computing simply"</li>
            <li>"Continue writing from here"</li>
        </ul>
        <h4>Keyboard Shortcuts</h4>
        <ul>
            <li><kbd>Ctrl+I</kbd>: Toggle AI panel</li>
            <li><kbd>Ctrl+Enter</kbd>: Send prompt</li>
            <li><kbd>Escape</kbd>: Close panel</li>
        </ul>
    `;
    
    const container = document.getElementById('aiMessages');
    const msg = document.createElement('div');
    msg.className = 'ai-msg assistant';
    msg.innerHTML = `
        <div class="ai-msg-avatar">ℹ️</div>
        <div class="ai-msg-body">
            <div class="ai-msg-content">${helpHtml}</div>
        </div>
    `;
    container.appendChild(msg);
    scrollChatToBottom();
}

// Update AI status
function updateAIStatus(status) {
    const statusEl = document.getElementById('aiStatus');
    if (statusEl) {
        statusEl.textContent = status;
    }
}

// Dynamic model fetching
async function fetchAvailableModels(provider) {
    const apiKey = aiAssistant.apiKeys[provider];
    if (!apiKey) return [];
    
    try {
        updateAIStatus('Fetching models...');
        
        switch(provider) {
            case 'openai':
                const openaiResponse = await fetch('https://api.openai.com/v1/models', {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });
                if (openaiResponse.ok) {
                    const data = await openaiResponse.json();
                    const models = data.data
                        .filter(m => m.id.includes('gpt'))
                        .map(m => ({ id: m.id, name: m.id }))
                        .sort((a, b) => b.id.localeCompare(a.id));
                    updateAIStatus('Ready');
                    return models;
                }
                break;
                
            case 'gemini':
                // Fetch available Gemini models from API
                const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`);
                if (geminiResponse.ok) {
                    const data = await geminiResponse.json();
                    const models = data.models
                        .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
                        .map(m => ({
                            id: m.name,
                            name: m.displayName || m.name.replace('models/', '')
                        }));
                    updateAIStatus('Ready');
                    return models;
                }
                // Fallback to default models
                break;
                
            case 'openrouter':
                const orResponse = await fetch('https://openrouter.ai/api/v1/models', {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });
                if (orResponse.ok) {
                    const data = await orResponse.json();
                    const models = data.data
                        .slice(0, 50) // Limit to top 50 models
                        .map(m => ({
                            id: m.id,
                            name: m.name || m.id
                        }));
                    updateAIStatus('Ready');
                    return models;
                }
                break;
        }
    } catch (error) {
        console.error('Error fetching models:', error);
        updateAIStatus('Error fetching models');
    }
    
    // Fallback models
    return getDefaultModels(provider);
}

function getDefaultModels(provider) {
    switch(provider) {
        case 'openai':
            return [
                { id: 'gpt-4-turbo-preview', name: 'GPT-4 Turbo' },
                { id: 'gpt-4', name: 'GPT-4' },
                { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }
            ];
        case 'gemini':
            return [
                { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
                { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
                { id: 'gemini-pro', name: 'Gemini Pro' }
            ];
        case 'openrouter':
            return [
                { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus' },
                { id: 'anthropic/claude-3-sonnet', name: 'Claude 3 Sonnet' },
                { id: 'openai/gpt-4-turbo', name: 'GPT-4 Turbo (OpenRouter)' },
                { id: 'google/gemini-pro', name: 'Gemini Pro (OpenRouter)' }
            ];
        default:
            return [];
    }
}

async function refreshModels() {
    const provider = document.getElementById('aiProviderSelect').value;
    const modelSelect = document.getElementById('aiModelSelect');
    
    modelSelect.innerHTML = '<option value="">Loading...</option>';
    
    const models = await fetchAvailableModels(provider);
    
    modelSelect.innerHTML = '';
    models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.name;
        modelSelect.appendChild(option);
    });
    
    // Restore saved model if available
    const savedModel = localStorage.getItem('ai_model');
    if (savedModel) {
        modelSelect.value = savedModel;
    }
}

async function updateProviderSettings() {
    const provider = document.getElementById('aiProviderSelect').value;
    
    // Update model list
    await refreshModels();
    
    // Update status indicators
    updateAPIKeyStatuses();
    
    // Update info text
    const modelInfo = document.getElementById('modelInfo');
    if (modelInfo) {
        const hasKey = aiAssistant.apiKeys[provider];
        modelInfo.textContent = hasKey 
            ? 'Models loaded successfully. Select one from the dropdown.'
            : `Add a ${provider} API key to see available models`;
    }
}

function updateAPIKeyStatuses() {
    const providers = ['openai', 'gemini', 'openrouter'];
    
    providers.forEach(provider => {
        const statusEl = document.getElementById(`${provider}Status`);
        if (statusEl) {
            const hasKey = aiAssistant.apiKeys[provider];
            statusEl.textContent = hasKey ? '✓ Configured' : 'Not configured';
            statusEl.classList.toggle('configured', hasKey);
        }
    });
}

// Test AI connection
async function testAIConnection() {
    const provider = document.getElementById('aiProviderSelect').value;
    const apiKey = aiAssistant.apiKeys[provider];
    
    if (!apiKey) {
        alert(`Please add a ${provider} API key first`);
        return;
    }
    
    updateAIStatus('Testing connection...');
    
    try {
        const testMessage = 'Reply with just "OK" if you receive this.';
        const result = await aiAssistant.chat(testMessage);
        
        updateAIStatus('Ready');
        alert(`✓ Connection successful!\n\nProvider: ${provider}\nModel: ${aiAssistant.currentModel}\n\nResponse: ${result}`);
    } catch (error) {
        updateAIStatus('Connection failed');
        alert(`❌ Connection failed:\n\n${error.message}\n\nPlease check your API key and try again.`);
    }
}

// Agent mode - Auto create/edit notes
async function agentModeExecute(prompt) {
    const agentEnabled = localStorage.getItem('ai_agent_mode') === 'true';
    if (!agentEnabled) {
        return;
    }
    
    const autoSave = localStorage.getItem('ai_auto_save') === 'true';
    const confirmChanges = localStorage.getItem('ai_confirm_changes') !== 'false';
    
    addUserMessage(prompt);
    showThinking();
    updateAIStatus('Agent working...');
    setAIStatusDot('busy');
    
    try {
        const systemPrompt = `You are a helpful AI assistant in agent mode. 
When the user asks you to create or edit content, you should:
1. Generate clean, well-formatted markdown content
2. Include appropriate headings, lists, and formatting
3. Add relevant diagrams if applicable (mermaid, plantuml, etc.)
4. Keep responses focused and actionable

Do not include explanations about what you're doing - just provide the content.`;

        const result = await aiAssistant.chat(prompt, systemPrompt);
        
        hideThinking();
        
        if (confirmChanges) {
            // Show the result with accept/discard buttons
            const container = document.getElementById('aiMessages');
            const msg = document.createElement('div');
            msg.className = 'ai-msg assistant';
            msg.innerHTML = `
                <div class="ai-msg-avatar">🤖</div>
                <div class="ai-msg-body">
                    <div class="ai-msg-content">${parseMarkdown(result)}</div>
                    <div class="ai-msg-actions">
                        <button onclick="applyAgentResult(this)" class="ai-msg-action primary">✓ Accept &amp; Apply</button>
                        <button onclick="insertAIResult()" class="ai-msg-action">↓ Insert</button>
                        <button onclick="copyAIResult()" class="ai-msg-action">📋 Copy</button>
                        <button onclick="this.closest('.ai-msg-actions').innerHTML='<span style=color:var(--text-secondary)>Discarded</span>'" class="ai-msg-action">✕ Discard</button>
                    </div>
                </div>
            `;
            container.appendChild(msg);
            window.currentAIResult = result;
            scrollChatToBottom();
        } else {
            // Auto-apply
            const editor = document.getElementById('markdownEditor');
            if (editor) {
                editor.value = result;
                if (typeof updatePreview === 'function') updatePreview();
                if (autoSave && typeof saveCurrentNote === 'function') saveCurrentNote();
            }
            addAssistantMessage('<p>✅ Content generated and applied to editor!</p>' + (autoSave ? '<p><small>Changes saved automatically.</small></p>' : ''), result);
        }
        
        updateAIStatus('Ready');
        setAIStatusDot('ready');
        
    } catch (error) {
        hideThinking();
        addErrorMessage('Agent mode error: ' + error.message);
        updateAIStatus('Error');
        setAIStatusDot('error');
    }
}

// Apply agent result to editor
function applyAgentResult(btn) {
    const result = window.currentAIResult || '';
    const editor = document.getElementById('markdownEditor');
    if (editor && result) {
        editor.value = result;
        if (typeof updatePreview === 'function') updatePreview();
        
        const autoSave = localStorage.getItem('ai_auto_save') === 'true';
        if (autoSave && typeof saveCurrentNote === 'function') saveCurrentNote();
        
        // Update button to show applied
        const actions = btn.closest('.ai-msg-actions');
        if (actions) actions.innerHTML = '<span style="color: var(--accent-success)">✅ Applied to editor</span>';
        
        showToast('Content applied to editor', 'success');
    }
}

// Handle AI command with mode-aware dispatch
async function handleAICommand() {
    const input = document.getElementById('aiInput');
    const prompt = input?.value?.trim();
    
    if (!prompt) return;
    
    // Get current active mode from tabs
    const activeTab = document.querySelector('.ai-mode-tab.active');
    const currentMode = activeTab ? activeTab.dataset.mode : 'ask';
    
    if (currentMode === 'agent') {
        // Agent mode: auto-apply content
        localStorage.setItem('ai_agent_mode', 'true');
        await agentModeExecute(prompt);
        input.value = '';
    } else if (currentMode === 'edit') {
        // Edit mode: try to apply directly
        localStorage.setItem('ai_agent_mode', 'true');
        await agentModeExecute(prompt);
        input.value = '';
    } else {
        // Ask mode: normal processing
        localStorage.setItem('ai_agent_mode', 'false');
        await processAICommand();
    }
}

// Initialize AI on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeAI();
    window.addEventListener('resize', updateAIButtonState);
    
    // Set initial mode from saved settings
    const agentMode = localStorage.getItem('ai_agent_mode') === 'true';
    setAIMode(agentMode ? 'agent' : 'ask');
    
    // ===== Editor selection persistence =====
    // Save selection whenever the editor loses focus (e.g., clicking AI panel)
    const editor = document.getElementById('markdownEditor');
    if (editor) {
        // Save on blur (when clicking away)
        editor.addEventListener('blur', () => {
            saveEditorSelection();
        });
        // Also save on mouseup and keyup (catch selection via keyboard)
        editor.addEventListener('mouseup', () => {
            saveEditorSelection();
        });
        editor.addEventListener('keyup', (e) => {
            // Save on selection-related keys
            if (e.shiftKey || e.ctrlKey || e.key === 'Home' || e.key === 'End') {
                saveEditorSelection();
            }
        });
        // Also save on Ctrl+A
        editor.addEventListener('select', () => {
            saveEditorSelection();
        });
    }
    
    // ===== AI Input auto-resize + Enter to send =====
    const aiInput = document.getElementById('aiInput');
    if (aiInput) {
        aiInput.addEventListener('input', () => {
            aiInput.style.height = 'auto';
            aiInput.style.height = Math.min(aiInput.scrollHeight, 120) + 'px';
        });
        
        // Enter sends (Shift+Enter for newline)
        aiInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
                e.preventDefault();
                handleAICommand();
            }
        });
    }
});
