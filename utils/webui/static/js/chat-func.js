// 在文件开头添加 marked 配置
marked.setOptions({
    renderer: new marked.Renderer(),
    highlight: function(code, lang) {
        return code;
    },
    breaks: true
});

// 共用的标签变量
const messageInput = document.getElementById('message-input');
const chatMessages = document.getElementById('chat-messages');

// 共用的添加消息函数
function addMessage(content, type, streaming = false, callback = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}-message`;
    
    const iconDiv = document.createElement('div');
    iconDiv.className = 'message-icon';
    iconDiv.innerHTML = type === 'user' ? 
        '<i class="fas fa-user"></i>' : 
        type === 'system' ?
        '<i class="fas fa-info-circle"></i>' :
        '<i class="fas fa-robot"></i>';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    if (!streaming) {
        contentDiv.innerHTML = content;
    }
    
    messageDiv.appendChild(iconDiv);
    messageDiv.appendChild(contentDiv);
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    if (streaming && type === 'assistant') {
        streamMessage(content, messageDiv, callback);
    } else if (callback && typeof callback === 'function') {
        setTimeout(callback, 0);
    }
    
    return messageDiv;
}

function formatMessage(content) {
    content = content.replace(/<think>(.*?)<\/think>\s*(.*)/s, '<think>thinking:  $1</think><result>$2</result>')
    content = content.replace(/(\\\(|\\\)|\[|\])/g, (m) => {
        switch (m) {
            case '\\(': return '\\\\(';
            case '\\)': return '\\\\)';
            case '[': return '\\[';
            case ']': return '\\]';
            default: return m;
        }
    });
    return content;
}

// 共用的添加流式输出函数
function streamMessage(content, messageDiv, callback = null) {
    console.log(content);
    const contentDiv = messageDiv.querySelector('.message-content');
    content = formatMessage(content);
    const chars = content.split('');

    let index = 0;
    let buffer = '';
    
    function appendNextChar() {
        if (index < chars.length) {
            if (chars[index] === '<') {
                let tagContent = '<';
                let j = index + 1;
                while (j < chars.length && chars[j] !== '>') {
                    tagContent += chars[j];
                    j++;
                }
                tagContent += '>';
                
                // 检查是否是think或result标签
                if (tagContent === '<think>' || tagContent === '<result>') {
                    // 先渲染之前累积的buffer
                    if (buffer) {
                        contentDiv.innerHTML += marked.parse(buffer);
                        MathJax.typesetPromise().catch(err => {
                            console.log('公式渲染错误:', err);
                        });
                        buffer = '';
                    }
                    
                    // 创建容器
                    const specialDiv = document.createElement('div');
                    specialDiv.className = tagContent === '<think>' ? 'think' : 'result';
                    contentDiv.appendChild(specialDiv);
                    
                    // 跳过开始标签
                    index = j + 1;
                    let specialBuffer = '';
                    
                    // 开始逐字输出内容
                    function appendSpecialContent() {
                        if (index < chars.length) {
                            // 检查是否到达结束标签
                            const endTag = tagContent === '<think>' ? '</think>' : '</result>';
                            if (chars[index] === '<' && chars.slice(index, index + endTag.length).join('') === endTag) {
                                // 渲染累积的特殊内容
                                specialDiv.innerHTML = marked.parse(specialBuffer);
                                MathJax.typesetPromise().catch(err => {
                                    console.log('公式渲染错误:', err);
                                });
                                index += endTag.length; // 跳过结束标签
                                appendNextChar(); // 继续处理后续内容
                                return;
                            }
                            
                            specialBuffer += chars[index];
                            // 每积累一定数量的字符就渲染一次
                            if (specialBuffer.includes('\n') || specialBuffer.length > 50) {
                                specialDiv.innerHTML = marked.parse(specialBuffer);
                                MathJax.typesetPromise().catch(err => {
                                    console.log('公式渲染错误:', err);
                                });
                            }
                            
                            index++;
                            chatMessages.scrollTop = chatMessages.scrollHeight;
                            setTimeout(appendSpecialContent, 20);
                        }
                    }
                    
                    appendSpecialContent();
                } else {
                    buffer += tagContent;
                    index = j + 1;
                    setTimeout(appendNextChar, 20);
                }
            } 
        } else {
            // 当所有字符都处理完毕后，调用回调函数
            if (callback && typeof callback === 'function') {
                setTimeout(callback, 100); // 给最后的渲染一点时间
            }
        }
    }
    
    appendNextChar();
}

// 共用的加载动画
function addLoadingMessage() {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message assistant-message loading';
    loadingDiv.innerHTML = `
        <div class="message-icon">
            <i class="fas fa-robot"></i>
        </div>
        <div class="message-content">
            <div class="loading-dots">
                <span></span><span></span><span></span>
            </div>
        </div>
    `;
    chatMessages.appendChild(loadingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return loadingDiv;
}

// 共用的加载模型配置
async function loadModelConfig() {
    try {
        const response = await fetch('/api/config');
        const data = await response.json();
        if (data.status === 'success') {
            const modelSelect = document.getElementById('model-select');
            modelSelect.innerHTML = data.available_models.map(model => 
                `<option value="${model}" ${model === data.current_model ? 'selected' : ''}>
                    ${model}
                </option>`
            ).join('');
        }
    } catch (error) {
        console.error('加载模型配置失败:', error);
        document.getElementById('model-select').innerHTML = '<option value="">加载失败</option>';
    }
}

// 共用的切换模型
function setupModelSwitching() {
    document.getElementById('model-select').addEventListener('change', async (e) => {
        const modelName = e.target.value;
        try {
            const response = await fetch('/api/config/model', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ model: modelName })
            });
            
            const data = await response.json();
            if (data.status === 'success') {
                addMessage(`已切换到模型: ${modelName}`, 'system');
            } else {
                addMessage('切换模型失败：' + data.message, 'error');
            }
        } catch (error) {
            console.error('切换模型失败:', error);
            addMessage('切换模型失败，请重试', 'error');
        }
    });
}

// 共用的自动调整输入框高度
function autoResizeTextarea() {
    messageInput.style.height = 'auto';
    messageInput.style.height = messageInput.scrollHeight + 'px';
}

// 添加输入区域折叠功能
function setupInputCollapse() {
    const chatInput = document.querySelector('.chat-input');
    const chatMessages = document.getElementById('chat-messages');
    // 创建折叠按钮
    const collapseBtn = document.createElement('button');
    collapseBtn.className = 'input-collapse-btn';
    collapseBtn.innerHTML = '<i class="fas fa-chevron-down">折叠输入框</i>';
    chatInput.parentElement.insertBefore(collapseBtn, chatInput);
    
    // 记录输入区域原始高度
    let inputHeight = chatInput.offsetHeight;
    
    // 折叠/展开功能
    function toggleCollapse() {
        const isCollapsed = chatInput.classList.toggle('collapsed');
        
        // 调整消息区域高度
        if (isCollapsed) {
            chatMessages.style.height = `auto`;
            chatInput.style.display = 'none';
            collapseBtn.innerHTML = '<i class="fas fa-chevron-up">展开输入框</i>';

        } else {
            // 重新计算输入区域高度
            chatInput.style.height = 'auto';
            inputHeight = chatInput.offsetHeight;
            // chatMessages.style.height = `calc(100% - ${inputHeight}px)`;
            collapseBtn.innerHTML = '<i class="fas fa-chevron-down">折叠输入框</i>';
            chatMessages.style.height = `auto`;
            chatInput.style.display = 'block';
        }
        
        // 滚动到底部
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    // 监听折叠按钮点击
    collapseBtn.addEventListener('click', toggleCollapse);
    
}

// 修改历史对话处理函数
let currentChatId = null; // 添加全局变量记录当前对话ID

function saveChat(chatType, messages) {
    // 如果没有实质性消息则不保存
    if (messages.length <= 0 || 
        (messages.length === 1 && messages[0].classList.contains('welcome-message'))) {
        return null;
    }
    
    // 获取当前对话的第一条消息作为标题
    let title = "新对话";
    for (const msg of messages) {
        if (msg.classList.contains('user-message')) {
            const content = msg.querySelector('.message-content').textContent.trim();
            title = content.length > 30 ? content.substring(0, 30) + '...' : content;
            break;
        }
    }
    
    // 提取消息内容
    const chatData = [];
    messages.forEach(msg => {
        // 跳过欢迎消息
        if (msg.classList.contains('welcome-message')) return;
        
        const type = msg.classList.contains('user-message') ? 'user' : 
                    msg.classList.contains('assistant-message') ? 'assistant' : 'system';
        
        // 获取消息内容
        const contentDiv = msg.querySelector('.message-content');
        let content = '';
        content = contentDiv.innerHTML;
        chatData.push({ type, content });
    });
    
    // 如果没有实质性消息则不保存
    if (chatData.length === 0) return null;
    
    // 保存到localStorage
    const history = JSON.parse(localStorage.getItem(`${chatType}_history`) || '[]');
    if (currentChatId) {
        // 更新现有对话
        const existingChatIndex = history.findIndex(chat => chat.id === currentChatId);
        if (existingChatIndex >= 0) {
            history[existingChatIndex] = {
                id: currentChatId,
                title,
                date: new Date().toISOString(),
                messages: chatData
            };
        } else {
            // 如果找不到现有对话，创建新对话
            currentChatId = Date.now().toString();
            history.push({
                id: currentChatId,
                title,
                date: new Date().toISOString(),
                messages: chatData
            });
        }
    } else {
        // 创建新对话
        currentChatId = Date.now().toString();
        history.push({
            id: currentChatId,
            title,
            date: new Date().toISOString(),
            messages: chatData
        });
    }
    
    localStorage.setItem(`${chatType}_history`, JSON.stringify(history));
    // 更新历史列表
    loadChatHistory(chatType);
    
    return currentChatId;
}

function loadChatHistory(chatType) {
    const historyList = document.getElementById('chat-history-list');
    if (!historyList) return;
    
    const history = JSON.parse(localStorage.getItem(`${chatType}_history`) || '[]');
    
    historyList.innerHTML = history.length ? 
        history.map(chat => `
            <div class="chat-history-item" data-id="${chat.id}">
                <i class="fas fa-comment"></i>
                <div class="chat-history-title">${chat.title}</div>
                <div class="chat-history-date">${new Date(chat.date).toLocaleDateString()}</div>
                <div class="chat-history-delete" data-id="${chat.id}">
                    <i class="fas fa-times"></i>
                </div>
            </div>
        `).join('') : 
        '<div class="empty-history">无历史对话</div>';
        
    // 添加事件监听
    document.querySelectorAll('.chat-history-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.chat-history-delete')) {
                // 删除对话
                const id = e.target.closest('.chat-history-delete').dataset.id;
                deleteChat(chatType, id);
                e.stopPropagation();
            } else {
                // 加载对话
                const id = item.dataset.id;
                console.log(history)
                loadChat(chatType, id);
            }
        });
    });
}

function loadChat(chatType, chatId) {
    const history = JSON.parse(localStorage.getItem(`${chatType}_history`) || '[]');
    const chat = history.find(c => c.id === chatId);
    
    if (chat) {
        // 设置当前对话ID
        currentChatId = chatId;
        
        const chatMessages = document.getElementById('chat-messages');
        chatMessages.innerHTML = '';
        
        // 如果没有消息，显示欢迎信息
        if (chat.messages.length === 0) {
            showWelcomeMessage(chatType);
            return;
        }
        
        chat.messages.forEach(msg => {
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${msg.type}-message`;
            
            const iconDiv = document.createElement('div');
            iconDiv.className = 'message-icon';
            iconDiv.innerHTML = msg.type === 'user' ? 
                '<i class="fas fa-user"></i>' : 
                msg.type === 'system' ?
                '<i class="fas fa-info-circle"></i>' :
                '<i class="fas fa-robot"></i>';
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            
            // 直接设置innerHTML，保持原有结构
            contentDiv.innerHTML = msg.content;
            
            messageDiv.appendChild(iconDiv);
            messageDiv.appendChild(contentDiv);
            
            chatMessages.appendChild(messageDiv);
        });
        
        // 标记当前活动对话
        document.querySelectorAll('.chat-history-item').forEach(item => {
            item.classList.toggle('active', item.dataset.id === chatId);
        });
        
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

function deleteChat(chatType, chatId) {
    if (confirm('确定要删除此对话？')) {
        let history = JSON.parse(localStorage.getItem(`${chatType}_history`) || '[]');
        history = history.filter(chat => chat.id !== chatId);
        localStorage.setItem(`${chatType}_history`, JSON.stringify(history));
        loadChatHistory(chatType);
    }
}

function setupChatHistory(chatType) {
    // 加载历史对话
    loadChatHistory(chatType);
    
    // 新对话按钮事件
    const newChatBtn = document.getElementById('new-chat-btn');
    if (newChatBtn) {
        newChatBtn.addEventListener('click', () => {
            // 重置当前对话ID
            currentChatId = null;
            
            // 显示欢迎信息
            showWelcomeMessage(chatType);
            
            // 清除活动状态
            document.querySelectorAll('.chat-history-item').forEach(item => {
                item.classList.remove('active');
            });
        });
    }
}

// 添加一个显示欢迎信息的函数
function showWelcomeMessage(chatType) {
    const chatMessages = document.getElementById('chat-messages');
    
    // 根据聊天类型显示不同的欢迎信息
    let welcomeContent = '';
    switch(chatType) {
        case 'raw':
            welcomeContent = `
                <div class="welcome-message">
                    <i class="fas fa-robot"></i>
                    <h3>欢迎使用 Raw Chat</h3>
                    <p>这是一个简单的对话模式，直接与语言模型交互。</p>
                    <p>您可以开始输入任何问题...</p>
                </div>
            `;
            break;
        case 'rag':
            welcomeContent = `
                <div class="welcome-message">
                    <i class="fas fa-robot"></i>
                    <h3>欢迎使用 RAG Chat</h3>
                    <p>这是一个基于文档的智能问答系统。</p>
                    <p>请先上传文档，然后开始提问...</p>
                </div>
            `;
            break;
        case 'agent':
            welcomeContent = `
                <div class="welcome-message">
                    <i class="fas fa-robot"></i>
                    <h3>欢迎使用 Agent Chat</h3>
                    <p>这是一个增强型对话系统，可以使用各种工具来辅助回答。</p>
                    <p>您可以开始输入任何问题...</p>
                </div>
            `;
            break;
        default:
            welcomeContent = `
                <div class="welcome-message">
                    <i class="fas fa-robot"></i>
                    <h3>欢迎使用</h3>
                    <p>您可以开始输入任何问题...</p>
                </div>
            `;
    }
    
    chatMessages.innerHTML = welcomeContent;
}

// 导出共用函数
export {
    formatMessage,
    addMessage,
    addLoadingMessage,
    streamMessage,
    loadModelConfig,
    setupModelSwitching,
    autoResizeTextarea,
    setupInputCollapse,
    saveChat,
    loadChatHistory,
    loadChat,
    deleteChat,
    setupChatHistory,
    showWelcomeMessage,
    currentChatId
}; 