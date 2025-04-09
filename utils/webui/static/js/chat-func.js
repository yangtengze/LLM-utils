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
function addMessage(content, type, chatMode = 'rag') {
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
    
    // 如果是用户消息，且不是raw_chat模式时，添加相关问题和参考文件按钮
    if (type === 'user' && chatMode !== 'raw') {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';
        
        // 相关问题按钮
        const relatedQuestionsBtn = document.createElement('button');
        relatedQuestionsBtn.className = 'related-questions-btn';
        relatedQuestionsBtn.innerHTML = '<i class="fas fa-question-circle"></i>';
        relatedQuestionsBtn.title = '查看相关问题';
        relatedQuestionsBtn.onclick = () => fetchRelatedQuestions(content, messageDiv);
        
        // 参考文件按钮
        const referenceFilesBtn = document.createElement('button');
        referenceFilesBtn.className = 'reference-files-btn';
        referenceFilesBtn.innerHTML = '<i class="fas fa-file-alt"></i>';
        referenceFilesBtn.title = '查看参考文件';
        referenceFilesBtn.onclick = () => fetchReferenceFiles(content, messageDiv);
        
        // 相关上下文按钮
        const relatedContextsBtn = document.createElement('button');
        relatedContextsBtn.className = 'related-contexts-btn';
        relatedContextsBtn.innerHTML = '<i class="fas fa-book-open"></i>';
        relatedContextsBtn.title = '查看相关上下文';
        relatedContextsBtn.onclick = () => fetchRelatedContexts(content, messageDiv);
        
        actionsDiv.appendChild(relatedQuestionsBtn);
        actionsDiv.appendChild(referenceFilesBtn);
        actionsDiv.appendChild(relatedContextsBtn);
        
        // 将操作按钮放在内容后面，而不是直接放在消息div中
        messageDiv.appendChild(actionsDiv);
    }

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
let modelConfigLoaded = false;
async function loadModelConfig() {
    // 如果已经加载过，则跳过
    if (modelConfigLoaded) {
        return;
    }
    
    try {
        const response = await fetch('/api/config');
        const data = await response.json();
        if (data.status === 'success') {
            const modelSelect = document.getElementById('model-select');
            if (modelSelect) {
                modelSelect.innerHTML = data.available_models.map(model => 
                    `<option value="${model}" ${model === data.current_model ? 'selected' : ''}>
                        ${model}
                    </option>`
                ).join('');
                // 标记为已加载
                modelConfigLoaded = true;
            }
        }
    } catch (error) {
        console.error('加载模型配置失败:', error);
        const modelSelect = document.getElementById('model-select');
        if (modelSelect) {
            modelSelect.innerHTML = '<option value="">加载失败</option>';
        }
    }
}

// 共用的切换模型
let modelSwitchingSetup = false;
function setupModelSwitching() {
    // 如果已经设置过，则跳过
    if (modelSwitchingSetup) {
        return;
    }
    
    const modelSelect = document.getElementById('model-select');
    if (!modelSelect) {
        return;
    }
    
    modelSelect.addEventListener('change', async (e) => {
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
    
    // 标记为已设置
    modelSwitchingSetup = true;
}

// 共用的自动调整输入框高度
function autoResizeTextarea() {
    // 如果已经设置过，则返回
    if (window.textareaResizeSetup) {
        return;
    }
    
    const messageInput = document.getElementById('message-input');
    if (messageInput) {
        // 设置初始高度
        messageInput.style.height = 'auto';
        messageInput.style.height = messageInput.scrollHeight + 'px';
        
        // 为输入区域添加事件监听
        messageInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = this.scrollHeight + 'px';
        });
        
        // Enter 键发送消息，Shift+Enter 换行
        messageInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                document.getElementById('send-button').click();
            }
        });
    }
    
    // 标记为已设置
    window.textareaResizeSetup = true;
}

// 添加输入区域折叠功能
let inputCollapseSetup = false;
function setupInputCollapse() {
    // 如果已经设置过，则跳过
    if (inputCollapseSetup) {
        return;
    }
    
    const chatInput = document.querySelector('.chat-input');
    const chatMessages = document.getElementById('chat-messages');
    
    if (!chatInput || !chatMessages) {
        return;
    }
    
    // 检查是否已经存在折叠按钮
    if (document.querySelector('.input-collapse-btn')) {
        inputCollapseSetup = true;
        return;
    }
    
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
        scrollToBottom();
    }
    
    // 监听折叠按钮点击
    collapseBtn.addEventListener('click', toggleCollapse);
    
    // 标记为已设置
    inputCollapseSetup = true;
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
            
            // 如果是用户消息，且不是raw_chat模式，添加相关问题和参考文件按钮
            if (msg.type === 'user' && chatType !== 'raw') {
                const actionsDiv = document.createElement('div');
                actionsDiv.className = 'message-actions';
                
                // 相关问题按钮
                const relatedQuestionsBtn = document.createElement('button');
                relatedQuestionsBtn.className = 'related-questions-btn';
                relatedQuestionsBtn.innerHTML = '<i class="fas fa-question-circle"></i>';
                relatedQuestionsBtn.title = '查看相关问题';
                relatedQuestionsBtn.onclick = () => fetchRelatedQuestions(msg.content, messageDiv);
                
                // 参考文件按钮
                const referenceFilesBtn = document.createElement('button');
                referenceFilesBtn.className = 'reference-files-btn';
                referenceFilesBtn.innerHTML = '<i class="fas fa-file-alt"></i>';
                referenceFilesBtn.title = '查看参考文件';
                referenceFilesBtn.onclick = () => fetchReferenceFiles(msg.content, messageDiv);
                
                // 相关上下文按钮
                const relatedContextsBtn = document.createElement('button');
                relatedContextsBtn.className = 'related-contexts-btn';
                relatedContextsBtn.innerHTML = '<i class="fas fa-book-open"></i>';
                relatedContextsBtn.title = '查看相关上下文';
                relatedContextsBtn.onclick = () => fetchRelatedContexts(msg.content, messageDiv);
                
                actionsDiv.appendChild(relatedQuestionsBtn);
                actionsDiv.appendChild(referenceFilesBtn);
                actionsDiv.appendChild(relatedContextsBtn);
                
                // 将操作按钮放在内容后面
                messageDiv.appendChild(actionsDiv);
            }
            
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
    // 初始化标记
    const setupKey = `${chatType}_history_setup`;
    
    // 如果已设置，则返回
    if (window[setupKey]) {
        return;
    }
    
    // 加载历史对话
    loadChatHistory(chatType);
    
    // 新对话按钮事件
    const newChatBtn = document.getElementById('new-chat-btn');
    if (newChatBtn) {
        // 检查是否已经有点击事件
        if (!newChatBtn._hasClickHandler) {
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
            newChatBtn._hasClickHandler = true;
        }
    }
    
    // 标记为已设置
    window[setupKey] = true;
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
                    console.log(systemPrompt);
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
    }
}

// 获取相关问题
async function fetchRelatedQuestions(question, messageDiv) {
    try {
        // 检查是否已经有相关问题容器
        const existingContainer = messageDiv.querySelector('.related-questions-container');
        if (existingContainer) {
            existingContainer.style.display = existingContainer.style.display === 'none' ? 'block' : 'none';
            return;
        }
        
        // 创建加载指示器
        const loadingIndicator = document.createElement('div');
        loadingIndicator.className = 'loading-indicator';
        loadingIndicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 加载相关问题...';
        messageDiv.appendChild(loadingIndicator);
        
        // 请求相关问题
        const response = await fetch('/api/related_questions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ question })
        });
        
        const data = await response.json();
        
        // 移除加载指示器
        messageDiv.removeChild(loadingIndicator);
        
        if (data.status === 'success') {
            // 创建相关问题容器
            const container = document.createElement('div');
            container.className = 'related-questions-container';
            
            // 添加标题
            const title = document.createElement('h4');
            title.innerHTML = '<i class="fas fa-question-circle"></i> 相关问题';
            container.appendChild(title);
            
            // 创建问题列表
            const questionsList = document.createElement('ul');
            questionsList.className = 'related-questions-list';
            
            data.questions.forEach(q => {
                const questionItem = document.createElement('li');
                questionItem.className = 'related-question-item';
                questionItem.textContent = q;
                
                // 点击问题时，将其填入输入框
                questionItem.addEventListener('click', () => {
                    document.getElementById('message-input').value = q;
                    document.getElementById('message-input').focus();
                    autoResizeTextarea();
                    
                    // 隐藏相关问题容器
                    container.style.display = 'none';
                });
                
                questionsList.appendChild(questionItem);
            });
            
            container.appendChild(questionsList);
            
            // 添加到消息操作按钮之后
            const actionsDiv = messageDiv.querySelector('.message-actions');
            if (actionsDiv) {
                // 将相关问题容器插入到操作按钮后面
                messageDiv.insertBefore(container, actionsDiv.nextSibling);
            } else {
                // 如果没有操作按钮，直接添加到消息末尾
                messageDiv.appendChild(container);
            }
        } else {
            console.error('获取相关问题失败:', data.message);
        }
    } catch (error) {
        console.error('获取相关问题出错:', error);
    }
}

// 获取参考文件
async function fetchReferenceFiles(question, messageDiv) {
    try {
        // 检查是否已经有参考文件容器
        const existingContainer = messageDiv.querySelector('.reference-files-container');
        if (existingContainer) {
            existingContainer.style.display = existingContainer.style.display === 'none' ? 'block' : 'none';
            return;
        }
        
        // 创建加载指示器
        const loadingIndicator = document.createElement('div');
        loadingIndicator.className = 'loading-indicator';
        loadingIndicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 加载参考文件...';
        messageDiv.appendChild(loadingIndicator);
        
        // 请求参考文件
        const response = await fetch('/api/reference_files', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ question })
        });
        
        const data = await response.json();
        
        // 移除加载指示器
        messageDiv.removeChild(loadingIndicator);
        
        if (data.status === 'success') {
            // 创建参考文件容器
            const container = document.createElement('div');
            container.className = 'reference-files-container';
            
            // 添加标题
            const title = document.createElement('h4');
            title.innerHTML = '<i class="fas fa-file-alt"></i> 参考文件';
            container.appendChild(title);
            
            if (data.reference_files.length === 0) {
                const noFiles = document.createElement('p');
                noFiles.className = 'no-files-message';
                noFiles.textContent = '没有找到相关参考文件';
                container.appendChild(noFiles);
            } else {
                // 创建文件列表
                const filesList = document.createElement('ul');
                filesList.className = 'reference-files-list';
                
                data.reference_files.forEach(file => {
                    const fileItem = document.createElement('li');
                    fileItem.className = 'reference-file-item';
                    
                    // 根据文件类型选择图标
                    let iconClass = 'fa-file-alt';
                    switch(file.file_type) {
                        case 'pdf':
                            iconClass = 'fa-file-pdf';
                            break;
                        case 'docx':
                        case 'doc':
                            iconClass = 'fa-file-word';
                            break;
                        case 'csv':
                            iconClass = 'fa-file-csv';
                            break;
                        case 'md':
                            iconClass = 'fab fa-markdown';
                            break;
                    }
                    
                    fileItem.innerHTML = `
                        <i class="fas ${iconClass}"></i>
                        <span class="file-name">${file.file_path}</span>
                        <span class="file-score">${(file.score * 100).toFixed(1)}%</span>
                    `;
                    
                    // 点击文件时，预览文件
                    fileItem.addEventListener('click', async () => {
                        try {
                            const previewResponse = await fetch('/api/documents/preview', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({ file_path: file.file_path })
                            });
                            
                            const previewData = await previewResponse.json();
                            
                            if (previewData.status === 'success') {
                                
                                // 创建预览模态框
                                const previewModal = document.createElement('div');
                                previewModal.className = 'preview-modal';
                                
                                let previewContent = '';
                                switch(previewData.type) {
                                    case 'html_table':
                                        previewContent = `
                                            <div class="preview-modal-content csv-preview">
                                                <span class="preview-close">&times;</span>
                                                <h3>CSV文件预览：${file.file_path}</h3>
                                                <div class="table-container">
                                                    ${previewData.content}
                                                </div>
                                            </div>
                                        `;
                                        break;
                                    case 'html':
                                        previewContent = `
                                            <div class="preview-modal-content rich-preview">
                                                <span class="preview-close">&times;</span>
                                                <h3>文档预览：${file.file_path}</h3>
                                                <div class="preview-content">
                                                    ${previewData.content}
                                                </div>
                                            </div>
                                        `;
                                        break;
                                    case 'pdf':
                                        // 将绝对路径转换为相对路径，并将反斜杠替换为正斜杠
                                        previewData.url = previewData.url.replace(/\\/g, '/');
                                        previewContent = `
                                            <div class="preview-modal-content pdf-preview">
                                                <span class="preview-close">&times;</span>
                                                <h3>PDF文档预览：${file.file_path}</h3>
                                                <div class="preview-content">
                                                    <embed src="${previewData.url}" type="application/pdf" width="100%" height="600px">
                                                    <noembed>
                                                        <p>
                                                            您的浏览器不支持PDF嵌入式查看。
                                                            <a href="${previewData.url}" target="_blank">点击此处下载PDF文件</a>
                                                        </p>
                                                    </noembed>
                                                </div>
                                            </div>
                                        `;
                                        break;
                                    default:
                                        previewContent = `
                                            <div class="preview-modal-content text-preview">
                                                <span class="preview-close">&times;</span>
                                                <h3>文档预览：${file.file_path}</h3>
                                                <pre>${previewData.content}</pre>
                                            </div>
                                        `;
                                }
                                
                                previewModal.innerHTML = previewContent;
                                
                                document.body.appendChild(previewModal);
                                
                                // 关闭模态框
                                previewModal.querySelector('.preview-close').addEventListener('click', () => {
                                    document.body.removeChild(previewModal);
                                });
                            } else {
                                console.error('预览文件失败:', previewData.message);
                            }
                        } catch (error) {
                            console.error('预览文件时出错:', error);
                        }
                    });
                    
                    filesList.appendChild(fileItem);
                });
                
                container.appendChild(filesList);
            }
            
            // 添加到消息操作按钮之后
            const actionsDiv = messageDiv.querySelector('.message-actions');
            if (actionsDiv) {
                // 将参考文件容器插入到操作按钮后面，如果有相关问题容器，则插在其后
                const questionsContainer = messageDiv.querySelector('.related-questions-container');
                if (questionsContainer) {
                    messageDiv.insertBefore(container, questionsContainer.nextSibling);
                } else {
                    messageDiv.insertBefore(container, actionsDiv.nextSibling);
                }
            } else {
                // 如果没有操作按钮，直接添加到消息末尾
                messageDiv.appendChild(container);
            }
        } else {
            console.error('获取参考文件失败:', data.message);
        }
    } catch (error) {
        console.error('获取参考文件出错:', error);
    }
}

// 获取相关上下文
async function fetchRelatedContexts(question, messageDiv) {
    try {
        // 检查是否已经有相关上下文容器
        const existingContainer = messageDiv.querySelector('.related-contexts-container');
        if (existingContainer) {
            existingContainer.style.display = existingContainer.style.display === 'none' ? 'block' : 'none';
            return;
        }
        
        // 创建加载指示器
        const loadingIndicator = document.createElement('div');
        loadingIndicator.className = 'loading-indicator';
        loadingIndicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 加载相关上下文...';
        messageDiv.appendChild(loadingIndicator);
        
        // 请求相关上下文
        const response = await fetch('/api/reference_files', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ question })
        });
        
        const data = await response.json();
        console.log(data);
        
        // 移除加载指示器
        messageDiv.removeChild(loadingIndicator);
        
        if (data.status === 'success' && data.reference_contents && data.reference_contents.length > 0) {
            console.log(data.reference_contents);
            // 创建相关上下文容器
            const container = document.createElement('div');
            container.className = 'related-contexts-container';
            
            // 添加标题
            const title = document.createElement('h4');
            title.innerHTML = '<i class="fas fa-book-open"></i> 相关上下文';
            container.appendChild(title);
            
            if (data.reference_contents.length === 0) {
                const noContexts = document.createElement('p');
                noContexts.className = 'no-contexts-message';
                noContexts.textContent = '没有找到相关上下文';
                container.appendChild(noContexts);
            } else {
                // 创建上下文列表
                const contextsList = document.createElement('div');
                contextsList.className = 'related-contexts-list';
                
                data.reference_contents.forEach((ctx, index) => {
                    const contextItem = document.createElement('div');
                    contextItem.className = 'related-context-item';
                    
                    // 创建标题栏
                    const titleBar = document.createElement('div');
                    titleBar.className = 'context-title-bar';
                    
                    // 获取文件名（不带路径）
                    const fileName = ctx.file_path.split('/').pop();
                    titleBar.innerHTML = `
                        <span class="file-name"><i class="fas fa-file-alt"></i> ${fileName}</span>
                        <span class="context-score">${(ctx.score * 100).toFixed(1)}%</span>
                    `;
                    
                    // 创建内容区域
                    const contentArea = document.createElement('div');
                    contentArea.className = 'context-content';
                    contentArea.textContent = ctx.content;
                    
                    // 将标题栏和内容添加到项目中
                    contextItem.appendChild(titleBar);
                    contextItem.appendChild(contentArea);
                    
                    // 添加展开/收起切换功能
                    titleBar.addEventListener('click', () => {
                        contextItem.classList.toggle('expanded');
                    });
                    
                    contextsList.appendChild(contextItem);
                });
                
                container.appendChild(contextsList);
            }
            
            // 添加到消息操作按钮之后
            const actionsDiv = messageDiv.querySelector('.message-actions');
            if (actionsDiv) {
                // 确定插入位置，考虑到可能已有其他容器
                const questionsContainer = messageDiv.querySelector('.related-questions-container');
                const filesContainer = messageDiv.querySelector('.reference-files-container');
                
                if (filesContainer) {
                    messageDiv.insertBefore(container, filesContainer.nextSibling);
                } else if (questionsContainer) {
                    messageDiv.insertBefore(container, questionsContainer.nextSibling);
                } else {
                    messageDiv.insertBefore(container, actionsDiv.nextSibling);
                }
            } else {
                // 如果没有操作按钮，直接添加到消息末尾
                messageDiv.appendChild(container);
            }
        } else if (data.status === 'success' && data.reference_files && data.reference_files.length > 0) {
            // 创建相关上下文容器
            const container = document.createElement('div');
            container.className = 'related-contexts-container';
            
            // 添加标题
            const title = document.createElement('h4');
            title.innerHTML = '<i class="fas fa-book-open"></i> 相关上下文';
            container.appendChild(title);
            
            // 创建上下文列表
            const contextsList = document.createElement('div');
            contextsList.className = 'related-contexts-list';
            
            data.reference_files.forEach((file, index) => {
                const contextItem = document.createElement('div');
                contextItem.className = 'related-context-item';
                
                // 创建标题栏
                const titleBar = document.createElement('div');
                titleBar.className = 'context-title-bar';
                
                // 获取文件名（不带路径）和文件类型
                const fileName = file.file_path.split('/').pop();
                const fileExt = file.file_path.split('.').pop().toLowerCase();
                
                // 根据文件类型选择图标
                let iconClass = 'fa-file-alt';
                switch(fileExt) {
                    case 'pdf':
                        iconClass = 'fa-file-pdf';
                        break;
                    case 'docx':
                    case 'doc':
                        iconClass = 'fa-file-word';
                        break;
                    case 'csv':
                        iconClass = 'fa-file-csv';
                        break;
                    case 'md':
                        iconClass = 'fab fa-markdown';
                        break;
                }
                
                titleBar.innerHTML = `
                    <span class="file-name"><i class="fas ${iconClass}"></i> ${fileName}</span>
                    <span class="context-score">${(file.score * 100).toFixed(1)}%</span>
                `;
                
                // 创建内容区域
                const contentArea = document.createElement('div');
                contentArea.className = 'context-content';
                contentArea.innerHTML = `<div class="context-preview-loading">点击查看文件内容...</div>`;
                
                // 点击标题栏时加载文件内容
                titleBar.addEventListener('click', async () => {
                    contextItem.classList.toggle('expanded');
                    
                    // 如果已经加载了内容，就不再重复加载
                    if (contentArea.querySelector('.context-preview-loading')) {
                        try {
                            // 显示正在加载
                            contentArea.innerHTML = `<div class="context-preview-loading">加载中...</div>`;
                            
                            // 请求文件预览
                            const previewResponse = await fetch('/api/documents/preview', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({ file_path: file.file_path })
                            });
                            
                            const previewData = await previewResponse.json();
                            
                            if (previewData.status === 'success') {
                                // 提取内容，根据类型处理

                                if (previewData.type === 'pdf') {
                                    // 处理PDF URL，确保正确的路径格式
                                    previewData.url = previewData.url.replace(/\\/g, '/');
                                    // 确保URL以斜杠开头（从网站根目录开始）
                                    if (!previewData.url.startsWith('/')) {
                                        previewData.url = '/' + previewData.url;
                                    }
                                    
                                    // PDF文件嵌入式预览
                                    contentArea.innerHTML = `
                                        <div class="pdf-embed-container">
                                            <embed src="${previewData.url}" type="application/pdf" width="100%" height="400px">
                                            <noembed>
                                                <p>
                                                    您的浏览器不支持PDF嵌入式查看。
                                                    <a href="${previewData.url}" target="_blank">点击此处下载PDF文件</a>
                                                </p>
                                            </noembed>
                                        </div>
                                    `;
                                } else if (previewData.type === 'html' || previewData.type === 'html_table') {
                                    contentArea.innerHTML = previewData.content;
                                } else {
                                    contentArea.textContent = previewData.content;
                                }
                            } else {
                                contentArea.textContent = '无法加载文件内容';
                            }
                        } catch (error) {
                            contentArea.textContent = '加载内容时出错';
                            console.error('加载文件内容出错:', error);
                        }
                    }
                });
                
                // 将标题栏和内容添加到项目中
                contextItem.appendChild(titleBar);
                contextItem.appendChild(contentArea);
                
                contextsList.appendChild(contextItem);
            });
            
            container.appendChild(contextsList);
            
            // 添加到消息操作按钮之后
            const actionsDiv = messageDiv.querySelector('.message-actions');
            if (actionsDiv) {
                // 确定插入位置，考虑到可能已有其他容器
                const questionsContainer = messageDiv.querySelector('.related-questions-container');
                const filesContainer = messageDiv.querySelector('.reference-files-container');
                
                if (filesContainer) {
                    messageDiv.insertBefore(container, filesContainer.nextSibling);
                } else if (questionsContainer) {
                    messageDiv.insertBefore(container, questionsContainer.nextSibling);
                } else {
                    messageDiv.insertBefore(container, actionsDiv.nextSibling);
                }
            } else {
                // 如果没有操作按钮，直接添加到消息末尾
                messageDiv.appendChild(container);
            }
        } else {
            console.error('获取相关上下文失败:', data.message || '未找到相关上下文');
        }
    } catch (error) {
        console.error('获取相关上下文出错:', error);
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
    fetchReferenceFiles,
    fetchRelatedQuestions,
    fetchRelatedContexts,
    currentChatId
}; 