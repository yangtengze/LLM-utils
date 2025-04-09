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
function addMessage(content, type) {
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
    
    contentDiv.innerHTML = content;
    
    messageDiv.appendChild(iconDiv);
    messageDiv.appendChild(contentDiv);
    
    chatMessages.appendChild(messageDiv);
    scrollToBottom();
    
    return messageDiv;
}

// 滚动到底部函数
function scrollToBottom() {
    if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

// 处理LaTeX公式的特殊字符
function formatLatex(content) {
    if (!content) return content;
    
    // 转义特殊字符以适应LaTeX渲染
    return content.replace(/(\\\(|\\\)|\[|\])/g, (m) => {
        switch (m) {
            case '\\(': return '\\\\(';
            case '\\)': return '\\\\)';
            case '[': return '\\[';
            case ']': return '\\]';
            default: return m;
        }
    });
}

// 使用Fetch API和ReadableStream从Ollama获取流式响应
async function streamFromOllama(url, data, contentDiv, callback = null) {
    try {
        // 发送请求获取流式响应
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ...data,
                stream: true
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // 获取响应流
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let thinkBuffer = '';
        let resultBuffer = '';
        let thinkDiv = null;
        let resultDiv = null;
        let isInThinkTag = false;
        
        // 读取流
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            // 解码二进制数据
            const chunk = decoder.decode(value, { stream: true });
            
            // 处理数据块
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (!line.trim()) continue;
                
                try {
                    // 解析JSON数据
                    const data = JSON.parse(line);
                    if (data.message && data.message.content) {
                        const newContent = data.message.content;
                        buffer += newContent;
                        
                        // 检测并处理特殊标签
                        processContent(newContent);
                    }
                } catch (e) {
                    console.error('解析返回数据失败:', e, line);
                    // 对于非JSON格式数据，直接作为文本追加
                    buffer += line;
                    processContent(line);
                }
            }
            
            // 滚动到底部
            scrollToBottom();
        }
        
        // 进行内容的最终处理
        finalizeRendering();
        
        // 完成时调用回调函数
        if (callback && typeof callback === 'function') {
            setTimeout(callback, 100);
        }
        
        // 处理接收到的内容块
        function processContent(content) {
            // 查找标签位置
            const thinkStartPos = content.indexOf('<think>');
            const thinkEndPos = content.indexOf('</think>');
            
            // 根据标签位置分情况处理
            if (thinkStartPos !== -1 && thinkEndPos !== -1) {
                // 同时包含开始和结束标签的情况
                handleBeforeThink(content.substring(0, thinkStartPos));
                handleThink(content.substring(thinkStartPos + 7, thinkEndPos));
                handleAfterThink(content.substring(thinkEndPos + 8));
                isInThinkTag = false;
            } else if (thinkStartPos !== -1) {
                // 只有开始标签
                handleBeforeThink(content.substring(0, thinkStartPos));
                handleThink(content.substring(thinkStartPos + 7));
                isInThinkTag = true;
            } else if (thinkEndPos !== -1) {
                // 只有结束标签
                if (isInThinkTag) {
                    handleThink(content.substring(0, thinkEndPos));
                    handleAfterThink(content.substring(thinkEndPos + 8));
                    isInThinkTag = false;
                } else {
                    // 错误的结束标签，当作普通文本处理
                    handleNormalContent(content);
                }
            } else {
                // 没有特殊标签
                if (isInThinkTag) {
                    handleThink(content);
                } else {
                    handleNormalContent(content);
                }
            }
        }
        
        // 处理 <think> 标签前的内容
        function handleBeforeThink(text) {
            if (!text) return;
            
            if (!thinkDiv && !resultDiv) {
                // 如果还没有创建特殊区域，直接渲染到主容器
                contentDiv.innerHTML = marked.parse(text);
                if (window.MathJax) {
                    MathJax.typesetPromise([contentDiv]).catch(err => console.log('公式渲染错误:', err));
                }
            }
        }
        
        // 处理 <think> 标签内的内容
        function handleThink(text) {
            if (!thinkDiv) {
                // 首次创建思考区域
                thinkDiv = document.createElement('div');
                thinkDiv.className = 'think';
                contentDiv.appendChild(thinkDiv);
                thinkBuffer = '';
            }
            
            // 追加到思考缓冲区
            thinkBuffer += text;
            // 格式化LaTeX公式
            const formattedContent = formatLatex(thinkBuffer);
            thinkDiv.innerHTML = marked.parse(formattedContent);
            if (window.MathJax) {
                MathJax.typesetPromise([thinkDiv]).catch(err => console.log('公式渲染错误:', err));
            }
        }
        
        // 处理 </think> 标签后的内容
        function handleAfterThink(text) {
            if (!resultDiv) {
                // 首次创建结果区域
                resultDiv = document.createElement('div');
                resultDiv.className = 'result';
                contentDiv.appendChild(resultDiv);
                resultBuffer = '';
            }
            
            // 追加到结果缓冲区
            resultBuffer += text;
            // 格式化LaTeX公式
            const formattedContent = formatLatex(resultBuffer);
            resultDiv.innerHTML = marked.parse(formattedContent);
            if (window.MathJax) {
                MathJax.typesetPromise([resultDiv]).catch(err => console.log('公式渲染错误:', err));
            }
        }
        
        // 处理普通内容（无特殊标签）
        function handleNormalContent(text) {
            if (resultDiv) {
                // 如果已经有结果区域，追加到结果区域
                resultBuffer += text;
                // 格式化LaTeX公式
                const formattedContent = formatLatex(resultBuffer);
                resultDiv.innerHTML = marked.parse(formattedContent);
            } else {
                // 否则追加到主容器
                // 格式化LaTeX公式
                const formattedContent = formatLatex(buffer);
                contentDiv.innerHTML = marked.parse(formattedContent);
            }
            
            if (window.MathJax) {
                const targetElement = resultDiv || contentDiv;
                MathJax.typesetPromise([targetElement]).catch(err => console.log('公式渲染错误:', err));
            }
        }
        
        // 最终渲染，确保样式和结构正确
        function finalizeRendering() {
            // 如果有未处理的思考内容，确保应用正确样式
            if (thinkDiv && thinkDiv.parentNode === contentDiv) {
                const formattedThink = formatLatex(thinkBuffer);
                thinkDiv.innerHTML = marked.parse(formattedThink);
                thinkDiv.className = 'think'; // 重新应用样式
            }
            
            // 如果有未处理的结果内容，确保应用正确样式
            if (resultDiv && resultDiv.parentNode === contentDiv) {
                const formattedResult = formatLatex(resultBuffer);
                resultDiv.innerHTML = marked.parse(formattedResult);
                resultDiv.className = 'result'; // 重新应用样式
            }
            
            // 如果没有特殊标签但有内容，确保渲染
            if (!thinkDiv && !resultDiv && buffer) {
                const formattedContent = formatLatex(buffer);
                contentDiv.innerHTML = marked.parse(formattedContent);
            }
            
            // 最终渲染数学公式
            if (window.MathJax) {
                MathJax.typesetPromise([contentDiv]).catch(err => console.log('最终公式渲染错误:', err));
            }
        }
        
    } catch (error) {
        console.error('流式处理失败:', error);
        contentDiv.innerHTML = `<div class="error">流式处理失败: ${error.message}</div>`;
        throw error;
    }
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
    scrollToBottom();
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
                // console.log(history)
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
        
        scrollToBottom();
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

// 统一的消息发送函数
async function sendChatMessage({
    message,                   // 用户消息内容
    chatType = 'raw',          // 聊天类型：'raw' 或 'rag'
    endpoint = 'http://localhost:11434/api/chat', // Ollama API 端点
    contextEndpoint = null,    // 获取上下文的端点（用于RAG）
    modelName = null,          // 模型名称
    temperature = 0.7,         // 温度参数
    systemPrompt = null,       // 系统提示（可选）
    fallbackEndpoint = null    // 备选 API 端点
}) {
    if (!message || !message.trim()) return null;
    
    // 如果没有指定模型名称，从选择器获取
    if (!modelName) {
        modelName = document.getElementById('model-select')?.value || 'deepseek-r1:1.5b';
    }

    // 添加用户消息
    addMessage(message, 'user');
    
    // 清空输入框
    const messageInput = document.getElementById('message-input');
    if (messageInput) {
        messageInput.value = '';
        messageInput.style.height = 'auto';
    }

    try {
        // 显示加载动画
        const loadingDiv = addLoadingMessage();
        
        // 准备 Ollama 消息格式
        let ollamaData = {
            model: modelName,
            messages: [{ role: "user", content: message }]
        };
        
        // 如果有温度参数，添加到请求
        if (temperature !== null) {
            ollamaData.temperature = temperature;
        }
        
        // 如果是 RAG 模式且有上下文端点，获取上下文
        if (chatType === 'rag' && contextEndpoint) {
            try {
                const contextResponse = await fetch(contextEndpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message })
                });
                
                const contextData = await contextResponse.json();
                if (contextData.status === 'success') {
                    // 使用上下文数据作为系统提示
                    systemPrompt = contextData.context;
                } else {
                    throw new Error(contextData.message || '获取上下文失败');
                }
            } catch (contextError) {
                console.error('获取上下文失败:', contextError);
                throw contextError;
            }
        }
        
        // 如果有系统提示，添加到消息列表开头
        if (systemPrompt) {
            ollamaData.messages.unshift({ role: "system", content: systemPrompt });
        }
        
        // 移除加载动画
        chatMessages.removeChild(loadingDiv);
        
        // 添加助手消息
        const assistantMessageDiv = addMessage('', 'assistant');
        const contentDiv = assistantMessageDiv.querySelector('.message-content');
        
        // 调用流式处理函数
        await streamFromOllama(
            endpoint,
            ollamaData,
            contentDiv,
            () => {
                // 完成后保存对话
                saveChat(chatType, document.querySelectorAll('#chat-messages > div'));
            }
        );
        
        return contentDiv; // 返回内容元素，以便外部代码可以进一步操作
        
    } catch (error) {
        console.error('发送消息失败:', error);
        
        // 移除之前的加载动画或错误消息（如果存在）
        const lastMessage = chatMessages.lastChild;
        if (lastMessage && (lastMessage.classList.contains('loading') || 
            (lastMessage.classList.contains('assistant-message') && 
             lastMessage.querySelector('.error')))) {
            chatMessages.removeChild(lastMessage);
        }
        
        // 显示错误消息
        addMessage(`<div class="error">发送消息失败：${error.message}</div>`, 'assistant');
        
        // 如果有备选 API，尝试使用
        if (fallbackEndpoint) {
            try {
                const fallbackResponse = await fetch(fallbackEndpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message,
                        temperature: temperature,
                        stream: true
                    })
                });
                
                const data = await fallbackResponse.json();
                if (data.status === 'success') {
                    // 移除错误消息
                    chatMessages.removeChild(chatMessages.lastChild);
                    // 添加正确的响应
                    addMessage(data.response, 'assistant');
                    saveChat(chatType, document.querySelectorAll('#chat-messages > div'));
                    return true;
                }
            } catch (fallbackError) {
                console.error('备选API也失败:', fallbackError);
            }
        }
        
        throw error; // 重新抛出错误，以便外部代码可以捕获
    }
}

// 导出共用函数
export {
    addMessage,
    addLoadingMessage,
    streamFromOllama,
    formatLatex,
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
    sendChatMessage,
    scrollToBottom,
    currentChatId
}; 