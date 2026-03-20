// ==================== CONFIGURATION ====================
const STORAGE_KEYS = {
    API_KEY: 'minigpt_api_key',
    SETTINGS: 'minigpt_settings',
    HISTORY: 'minigpt_history'
};

// Available models list for validation
const AVAILABLE_MODELS = [
    'stepfun/step-3.5-flash:free',
    'minimax/minimax-m2.5:free',
    'z-ai/glm-4.5-air:free',
    'arcee-ai/trinity-mini:free',
    'arcee-ai/trinity-large-preview:free',
    'liquid/lfm-2.5-1.2b-thinking:free',
    'liquid/lfm-2.5-1.2b-instruct:free',
    'openrouter/free',
    'openrouter/auto',
];

// Model display names mapping
const MODEL_NAMES = {
    'stepfun/step-3.5-flash:free': 'Step 3.5 Flash',
    'minimax/minimax-m2.5:free': 'MiniMax M2.5',
    'arcee-ai/trinity-mini:free': 'Trinity Mini',
    'z-ai/glm-4.5-air:free': 'GLM 4.5 Air',
    'arcee-ai/trinity-large-preview:free': 'Trinity Large',
    'liquid/lfm-2.5-1.2b-thinking:free': 'LFM 1.2B Thinking',
    'liquid/lfm-2.5-1.2b-instruct:free': 'LFM 1.2B Instruct',
    'openrouter/free': 'Free Router',
    'openrouter/auto': 'Auto Router',
};

// Default settings
const DEFAULT_SETTINGS = {
    model: 'stepfun/step-3.5-flash:free',
    temperature: 0.7,
    maxTokens: 1000,
    systemPrompt: 'You are a helpful AI assistant.'
};

// ==================== STATE MANAGEMENT ====================
let state = {
    apiKey: localStorage.getItem(STORAGE_KEYS.API_KEY) || '',
    settings: (() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
            if (saved) {
                const parsed = JSON.parse(saved);
                // Validate and sanitize settings
                return {
                    model: AVAILABLE_MODELS.includes(parsed.model) ? parsed.model : DEFAULT_SETTINGS.model,
                    temperature: parseFloat(parsed.temperature) || DEFAULT_SETTINGS.temperature,
                    maxTokens: parseInt(parsed.maxTokens) || DEFAULT_SETTINGS.maxTokens,
                    systemPrompt: parsed.systemPrompt || DEFAULT_SETTINGS.systemPrompt
                };
            }
        } catch (e) {
            console.error('Error loading settings:', e);
            // Clear corrupted settings
            localStorage.removeItem(STORAGE_KEYS.SETTINGS);
        }
        return { ...DEFAULT_SETTINGS };
    })(),
    conversations: (() => {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY)) || [];
        } catch (e) {
            console.error('Error loading conversations:', e);
            return [];
        }
    })(),
    currentConversation: null,
    isTyping: false,
    abortController: null
};

// ==================== DOM ELEMENTS ====================
const elements = {
    messagesWrapper: document.getElementById('messagesWrapper'),
    messagesContainer: document.getElementById('messagesContainer'),
    userInput: document.getElementById('userInput'),
    sendButton: document.getElementById('sendButton'),
    newChatBtn: document.getElementById('newChatBtn'),
    historyList: document.getElementById('historyList'),
    modelSelect: document.getElementById('modelSelect'),
    currentModelName: document.getElementById('currentModelName'),
    quickTools: document.querySelectorAll('.quick-tool'),
    apiKeyInput: document.getElementById('apiKeyInput'),
    toggleApiKey: document.getElementById('toggleApiKey'),
    temperature: document.getElementById('temperature'),
    tempValue: document.getElementById('tempValue'),
    maxTokens: document.getElementById('maxTokens'),
    systemPrompt: document.getElementById('systemPrompt'),
    saveSettings: document.getElementById('saveSettings'),
    resetSettingsBtn: document.getElementById('resetSettingsBtn'),
    tokenCounter: document.getElementById('tokenCounter'),
    wordCounter: document.getElementById('wordCounter'),
    statusText: document.getElementById('statusText')
};

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupEventListeners();
    loadCurrentChat();
    updateHistoryList();
});

function initializeApp() {
    // Set API key input
    if (elements.apiKeyInput) {
        elements.apiKeyInput.value = state.apiKey;
    }

    // Set settings values
    if (elements.temperature) {
        elements.temperature.value = state.settings.temperature;
        elements.tempValue.textContent = state.settings.temperature;
    }
    if (elements.maxTokens) {
        elements.maxTokens.value = state.settings.maxTokens;
    }
    if (elements.systemPrompt) {
        elements.systemPrompt.value = state.settings.systemPrompt;
    }

    // Set model select and current model display
    if (elements.modelSelect) {
        elements.modelSelect.value = state.settings.model;
    }
    updateCurrentModelDisplay();

    // Check API key status
    updateApiKeyStatus();

    // Focus input
    setTimeout(() => elements.userInput.focus(), 500);
}

function setupEventListeners() {
    // Input
    elements.userInput.addEventListener('input', handleInputChange);
    elements.userInput.addEventListener('keydown', handleKeyDown);

    // Send button
    elements.sendButton.addEventListener('click', sendMessage);

    // New chat button
    if (elements.newChatBtn) {
        elements.newChatBtn.addEventListener('click', createNewChat);
    }

    // Model select
    if (elements.modelSelect) {
        elements.modelSelect.addEventListener('change', (e) => {
            state.settings.model = e.target.value;
            console.log('Model changed to:', state.settings.model);
        });
    }

    // Quick tools
    elements.quickTools.forEach(tool => {
        tool.addEventListener('click', () => handleQuickTool(tool.dataset.tool));
    });

    // Toggle API key visibility
    if (elements.toggleApiKey) {
        elements.toggleApiKey.addEventListener('click', toggleApiKeyVisibility);
    }

    // Temperature slider
    if (elements.temperature) {
        elements.temperature.addEventListener('input', (e) => {
            elements.tempValue.textContent = e.target.value;
        });
    }

    // Save settings
    if (elements.saveSettings) {
        elements.saveSettings.addEventListener('click', saveSettings);
    }

    // Reset settings
    if (elements.resetSettingsBtn) {
        elements.resetSettingsBtn.addEventListener('click', resetSettings);
    }
}

// ==================== UTILITY FUNCTIONS ====================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatMessage(text) {
    if (!text) return '';
    
    // First escape HTML
    let formatted = escapeHtml(text);
    
    // Format code blocks (```code```)
    formatted = formatted.replace(/```([\s\S]*?)```/g, (match, code) => {
        return `<pre><code>${code}</code></pre>`;
    });
    
    // Format inline code (`code`)
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Format bold (**text**)
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Format italic (*text*)
    formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    
    // Convert newlines to <br>
    formatted = formatted.replace(/\n/g, '<br>');
    
    return formatted;
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideDown 0.3s reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function scrollToBottom() {
    setTimeout(() => {
        elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
    }, 100);
}

function updateStatus(text, color) {
    if (elements.statusText) {
        elements.statusText.innerHTML = `
            <i class="fas fa-circle text-${color} me-1" style="font-size: 6px;"></i>
            ${text}
        `;
    }
}

function updateApiKeyStatus() {
    if (state.apiKey && state.apiKey.startsWith('sk-')) {
        updateStatus('Online', 'success');
        elements.sendButton.disabled = !elements.userInput.value.trim();
    } else {
        updateStatus('API Key Needed', 'warning');
        elements.sendButton.disabled = true;
    }
}

function updateCurrentModelDisplay() {
    if (elements.currentModelName) {
        if (state.settings && state.settings.model) {
            let displayName = MODEL_NAMES[state.settings.model];
            
            if (!displayName) {
                try {
                    const parts = state.settings.model.split('/');
                    const lastPart = parts[parts.length - 1];
                    displayName = lastPart.split(':')[0] || lastPart || 'Model';
                } catch (e) {
                    displayName = 'Model';
                }
            }
            
            elements.currentModelName.textContent = displayName;
            console.log('Model display updated to:', displayName);
        } else {
            elements.currentModelName.textContent = 'Select Model';
        }
    }
}

// ==================== INPUT HANDLING ====================
function handleInputChange() {
    // Auto-resize
    elements.userInput.style.height = 'auto';
    elements.userInput.style.height = Math.min(elements.userInput.scrollHeight, 120) + 'px';
    
    // Enable/disable send button
    const hasText = elements.userInput.value.trim().length > 0;
    elements.sendButton.disabled = !hasText || !state.apiKey;

    // Update counters
    const text = elements.userInput.value;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const tokens = Math.ceil(text.length / 4);
    
    if (elements.wordCounter) elements.wordCounter.textContent = `${words} words`;
    if (elements.tokenCounter) elements.tokenCounter.textContent = `~${tokens} tokens`;
}

function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!elements.sendButton.disabled) {
            sendMessage();
        }
    }
}

// ==================== MESSAGE HANDLING ====================
function addMessage(role, content, isError = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role === 'user' ? 'message-user' : ''}`;
    
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    if (role === 'user') {
        messageDiv.innerHTML = `
            <div class="message-content">
                <div class="d-flex align-items-center gap-2 justify-content-end mb-1">
                    <small class="text-secondary">${time}</small>
                    <span class="fw-semibold small">You</span>
                </div>
                <div class="message-bubble user">
                    ${escapeHtml(content).replace(/\n/g, '<br>')}
                </div>
            </div>
            <div class="message-avatar user">
                <i class="fas fa-user text-white"></i>
            </div>
        `;
    } else {
        const formattedContent = isError ? escapeHtml(content) : formatMessage(content);
        
        messageDiv.innerHTML = `
            <div class="message-avatar bot">
                <i class="fas fa-robot text-primary"></i>
            </div>
            <div class="message-content">
                <div class="d-flex align-items-center gap-2 mb-1">
                    <span class="fw-semibold small">MiniGPT</span>
                    <small class="text-secondary ms-auto">${time}</small>
                </div>
                <div class="message-bubble bot ${isError ? 'text-danger' : ''}">
                    ${formattedContent}
                </div>
                ${!isError ? `
                <div class="d-flex gap-3 mt-1 ms-2">
                    <button class="btn btn-link text-secondary p-0 small copy-btn">
                        <i class="far fa-copy"></i>
                    </button>
                    <button class="btn btn-link text-secondary p-0 small regenerate-btn">
                        <i class="fas fa-rotate-right"></i>
                    </button>
                </div>
                ` : ''}
            </div>
        `;
        
        const copyBtn = messageDiv.querySelector('.copy-btn');
        const regenerateBtn = messageDiv.querySelector('.regenerate-btn');
        
        if (copyBtn) {
            copyBtn.addEventListener('click', () => copyMessage(copyBtn));
        }
        if (regenerateBtn) {
            regenerateBtn.addEventListener('click', () => regenerateMessage(regenerateBtn));
        }
    }
    
    elements.messagesWrapper.appendChild(messageDiv);
    scrollToBottom();
}

function showTypingIndicator() {
    if (state.isTyping) return;
    
    state.isTyping = true;
    
    const indicator = document.createElement('div');
    indicator.id = 'typingIndicator';
    indicator.className = 'message';
    indicator.innerHTML = `
        <div class="message-avatar bot">
            <i class="fas fa-robot text-primary"></i>
        </div>
        <div class="message-content">
            <div class="message-bubble bot">
                <div class="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        </div>
    `;
    
    elements.messagesWrapper.appendChild(indicator);
    scrollToBottom();
}

function hideTypingIndicator() {
    state.isTyping = false;
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
        indicator.remove();
    }
}

async function sendMessage() {
    const message = elements.userInput.value.trim();
    if (!message || !state.apiKey) return;

    if (!state.apiKey.startsWith('sk-')) {
        showToast('Invalid API key format. It should start with "sk-"', 'error');
        return;
    }

    elements.userInput.value = '';
    elements.userInput.style.height = 'auto';
    elements.sendButton.disabled = true;
    handleInputChange();

    addMessage('user', message);

    if (!state.currentConversation) {
        createNewConversation(message);
    } else {
        state.currentConversation.messages.push({
            role: 'user',
            content: message,
            timestamp: new Date().toISOString()
        });
        saveConversations();
    }

    showTypingIndicator();
    updateStatus('Thinking...', 'warning');

    try {
        const response = await callOpenRouter(message);
        
        hideTypingIndicator();
        addMessage('assistant', response);

        if (state.currentConversation) {
            state.currentConversation.messages.push({
                role: 'assistant',
                content: response,
                timestamp: new Date().toISOString()
            });
            saveConversations();
            updateHistoryList();
        }

        updateStatus('Online', 'success');
        
    } catch (error) {
        hideTypingIndicator();
        updateStatus('Error', 'danger');
        showToast(error.message, 'error');
        addMessage('assistant', `Error: ${error.message}`, true);
        console.error('API Error:', error);
    }
}

async function callOpenRouter(message) {
    const messages = [];
    
    if (state.settings.systemPrompt) {
        messages.push({ role: 'system', content: state.settings.systemPrompt });
    }

    if (state.currentConversation) {
        state.currentConversation.messages.forEach(msg => {
            messages.push({ role: msg.role, content: msg.content });
        });
    } else {
        messages.push({ role: 'user', content: message });
    }

    state.abortController = new AbortController();
    const timeoutId = setTimeout(() => state.abortController.abort(), 30000);

    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${state.apiKey}`,
                'HTTP-Referer': window.location.origin,
                'X-Title': 'MiniGPT-PRO Mobile',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: state.settings.model,
                messages: messages,
                temperature: parseFloat(state.settings.temperature),
                max_tokens: parseInt(state.settings.maxTokens)
            }),
            signal: state.abortController.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `HTTP ${response.status}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;

    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('Request timeout. Please try again.');
        }
        throw error;
    }
}

// ==================== CONVERSATION MANAGEMENT ====================
function createNewChat() {
    elements.messagesWrapper.innerHTML = '';
    state.currentConversation = null;
    
    const offcanvas = document.getElementById('historyDrawer');
    const bsOffcanvas = bootstrap.Offcanvas.getInstance(offcanvas);
    if (bsOffcanvas) bsOffcanvas.hide();
    
    addWelcomeMessage();
    elements.userInput.focus();
}

function createNewConversation(firstMessage) {
    const conversation = {
        id: Date.now().toString(),
        title: firstMessage.substring(0, 30) + (firstMessage.length > 30 ? '...' : ''),
        messages: [{
            role: 'user',
            content: firstMessage,
            timestamp: new Date().toISOString()
        }],
        createdAt: new Date().toISOString(),
        model: state.settings.model
    };
    
    state.conversations.unshift(conversation);
    state.currentConversation = conversation;
    saveConversations();
    updateHistoryList();
}

function loadCurrentChat() {
    if (state.conversations.length > 0) {
        state.currentConversation = state.conversations[0];
        loadConversation(state.currentConversation.id);
    } else {
        addWelcomeMessage();
    }
}

function loadConversation(conversationId) {
    const conversation = state.conversations.find(c => c.id === conversationId);
    if (!conversation) return;
    
    state.currentConversation = conversation;
    elements.messagesWrapper.innerHTML = '';
    
    conversation.messages.forEach(msg => {
        addMessage(msg.role, msg.content);
    });
    
    const offcanvas = document.getElementById('historyDrawer');
    const bsOffcanvas = bootstrap.Offcanvas.getInstance(offcanvas);
    if (bsOffcanvas) bsOffcanvas.hide();
}

function addWelcomeMessage() {
    const welcomeText = `👋 Hello! I'm your AI assistant.

I can help you with:
• Answering questions
• Writing and editing code
• Analysis and research
• Translation
• And much more!

To get started:
1. Open Settings (⚙️)
2. Add your OpenRouter API key
3. Start chatting!

Your conversations are saved locally.`;
    
    addMessage('assistant', welcomeText);
}

function updateHistoryList() {
    if (!elements.historyList) return;
    
    if (state.conversations.length === 0) {
        elements.historyList.innerHTML = `
            <div class="text-center text-secondary py-4">
                <i class="fas fa-comment-slash fa-2x mb-2"></i>
                <p>No conversations yet</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    state.conversations.forEach(conv => {
        const date = new Date(conv.createdAt).toLocaleDateString();
        
        html += `
            <div class="history-item" onclick="window.loadConversation('${conv.id}')">
                <i class="fas fa-message text-secondary"></i>
                <div class="flex-grow-1">
                    <div>${escapeHtml(conv.title)}</div>
                    <small class="text-secondary">${MODEL_NAMES[conv.model] || conv.model.split('/').pop()}</small>
                </div>
                <small class="text-secondary">${date}</small>
                <button class="btn btn-link text-danger p-0" onclick="window.deleteConversation('${conv.id}', event)">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
    });
    
    elements.historyList.innerHTML = html;
}

function deleteConversation(id, event) {
    event.stopPropagation();
    
    state.conversations = state.conversations.filter(c => c.id !== id);
    
    if (state.currentConversation?.id === id) {
        state.currentConversation = null;
        createNewChat();
    }
    
    saveConversations();
    updateHistoryList();
    showToast('Conversation deleted', 'success');
}

function saveConversations() {
    try {
        localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(state.conversations));
    } catch (e) {
        console.error('Error saving conversations:', e);
        showToast('Error saving conversations', 'error');
    }
}

// ==================== SETTINGS ====================
function handleQuickTool(tool) {
    const prompts = {
        analyze: 'Analyze this: ',
        summarize: 'Summarize this: ',
        translate: 'Translate this to English: ',
        code: 'Write code for: ',
        explain: 'Explain this: '
    };
    
    elements.userInput.value = prompts[tool] + elements.userInput.value;
    elements.userInput.focus();
    handleInputChange();
}

function toggleApiKeyVisibility() {
    const type = elements.apiKeyInput.type;
    elements.apiKeyInput.type = type === 'password' ? 'text' : 'password';
    elements.toggleApiKey.innerHTML = `<i class="fas fa-eye${type === 'password' ? '' : '-slash'}"></i>`;
}

function saveSettings() {
    try {
        // Save API key
        state.apiKey = elements.apiKeyInput.value.trim();
        localStorage.setItem(STORAGE_KEYS.API_KEY, state.apiKey);
        
        // Get and validate settings
        const selectedModel = elements.modelSelect ? elements.modelSelect.value : state.settings.model;
        const temperature = parseFloat(elements.temperature.value);
        const maxTokens = parseInt(elements.maxTokens.value);
        const systemPrompt = elements.systemPrompt.value.trim();
        
        // Validate model
        if (!AVAILABLE_MODELS.includes(selectedModel)) {
            showToast('Selected model is not available', 'error');
            return;
        }
        
        // Save settings
        state.settings = {
            model: selectedModel,
            temperature: isNaN(temperature) ? DEFAULT_SETTINGS.temperature : temperature,
            maxTokens: isNaN(maxTokens) ? DEFAULT_SETTINGS.maxTokens : maxTokens,
            systemPrompt: systemPrompt || DEFAULT_SETTINGS.systemPrompt
        };
        
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(state.settings));
        console.log('Settings saved:', state.settings);
        
        // Update UI
        updateCurrentModelDisplay();
        updateApiKeyStatus();
        
        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('settingsModal'));
        if (modal) modal.hide();
        
        showToast('Settings saved successfully!', 'success');
        
    } catch (e) {
        console.error('Error saving settings:', e);
        showToast('Error saving settings', 'error');
    }
}

function resetSettings() {
    if (confirm('Reset all settings to default?')) {
        // Clear settings from localStorage
        localStorage.removeItem(STORAGE_KEYS.SETTINGS);
        localStorage.removeItem(STORAGE_KEYS.API_KEY);
        
        // Reset state
        state.apiKey = '';
        state.settings = { ...DEFAULT_SETTINGS };
        
        // Update UI
        if (elements.apiKeyInput) elements.apiKeyInput.value = '';
        if (elements.temperature) {
            elements.temperature.value = DEFAULT_SETTINGS.temperature;
            elements.tempValue.textContent = DEFAULT_SETTINGS.temperature;
        }
        if (elements.maxTokens) elements.maxTokens.value = DEFAULT_SETTINGS.maxTokens;
        if (elements.systemPrompt) elements.systemPrompt.value = DEFAULT_SETTINGS.systemPrompt;
        if (elements.modelSelect) elements.modelSelect.value = DEFAULT_SETTINGS.model;
        
        updateCurrentModelDisplay();
        updateApiKeyStatus();
        
        showToast('Settings reset to default', 'info');
    }
}

// ==================== MESSAGE ACTIONS ====================
function copyMessage(button) {
    const messageDiv = button.closest('.message-content');
    const messageText = messageDiv.querySelector('.message-bubble').textContent;
    navigator.clipboard.writeText(messageText);
    showToast('Copied to clipboard!', 'success');
}

function regenerateMessage(button) {
    const messageDiv = button.closest('.message');
    const prevMessage = messageDiv.previousElementSibling;
    
    if (prevMessage && prevMessage.querySelector('.fa-user')) {
        messageDiv.remove();
        prevMessage.remove();
        
        if (state.currentConversation) {
            state.currentConversation.messages.pop();
            state.currentConversation.messages.pop();
            saveConversations();
        }
        
        elements.userInput.focus();
    }
}

// ==================== GLOBAL FUNCTIONS ====================
window.loadConversation = loadConversation;
window.deleteConversation = deleteConversation;
