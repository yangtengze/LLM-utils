// 在文件开头添加 marked 配置
marked.setOptions({
    renderer: new marked.Renderer(),
    highlight: function(code, lang) {
        return code;
    },
    breaks: true
});

// 共用的标签变量
const modelSelect = document.getElementById('model-select');
const chatMessages = document.getElementById('chat-messages');

// 添加前端缓存机制 - 用于存储API响应
const apiCache = {
    // 缓存数据存储
    data: {},
    
    // 设置缓存
    set: function(key, value, ttl = 600) { // 默认缓存10分钟
        this.data[key] = {
            value: value,
            expires: Date.now() + (ttl * 1000)
        };
    },
    
    // 获取缓存
    get: function(key) {
        const item = this.data[key];
        if (!item) return null;
        
        // 检查是否过期
        if (Date.now() > item.expires) {
            delete this.data[key];
            return null;
        }
        
        return item.value;
    },
    
    // 检查缓存是否存在且有效
    has: function(key) {
        return this.get(key) !== null;
    },
    
    // 删除缓存
    delete: function(key) {
        delete this.data[key];
    },
    
    // 清除所有缓存
    clear: function() {
        this.data = {};
    }
};

// 存储最近一次查询的信息，避免重复调用API
let lastQueryInfo = {
    query: null,
    referencesLoaded: false,
    contextsLoaded: false,
    promptGenerated: false,
    questionsLoaded: false
};

// 根据文件扩展名获取相应的图标类
function getFileIconClass(fileExt) {
    let iconClass = 'fa-file-alt'; // 默认图标
    
    switch(fileExt.toLowerCase()) {
        case 'pdf':
            iconClass = 'fa-file-pdf';
            break;
        case 'docx':
        case 'doc':
            iconClass = 'fa-file-word';
            break;
        case 'txt':
            iconClass = 'fa-file-alt';
            break;
        case 'md':
            iconClass = 'fab fa-markdown'; 
            break;
        case 'csv':
            iconClass = 'fa-file-csv';
            break;
        case 'html':
            iconClass = 'fa-file-code';
            break;
        case 'json':
            iconClass = 'fa-file-json';
            break;
        case 'jsonl':
            iconClass = 'fa-file-jsonl';
            break;
    }
    
    return iconClass;
}

// 获取相对路径的标准化函数
function normalizeFilePath(filePath) {
    let relativePath = filePath.split('/').slice(-2).join('/');
    relativePath = relativePath.replace('data\\documents\\', '');
    relativePath = relativePath.replace('\\', '/');
    return relativePath;
}

/**
 * 创建并添加加载指示器
 * @param {HTMLElement} parentElement - 要添加加载指示器的父元素
 * @param {string} message - 加载指示器显示的消息
 * @returns {HTMLElement} - 创建的加载指示器元素
 */
function createLoadingIndicator(parentElement, message = '加载中...') {
    const loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'loading-indicator';
    loadingIndicator.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${message}`;
    parentElement.appendChild(loadingIndicator);
    return loadingIndicator;
}

/**
 * 检查指定类型的容器是否已存在
 * @param {HTMLElement} parentElement - 父元素
 * @param {string} containerClass - 容器的CSS类名
 * @returns {HTMLElement|null} - 已存在的容器或null
 */
function checkExistingContainer(parentElement, containerClass) {
    const existingContainer = parentElement.querySelector(`.${containerClass}`);
    if (existingContainer) {
        // 切换显示/隐藏状态
        existingContainer.style.display = existingContainer.style.display === 'none' ? 'block' : 'none';
        return existingContainer;
    }
    return null;
}

/**
 * 在适当位置插入容器
 * @param {HTMLElement} parentElement - 父元素
 * @param {HTMLElement} container - 要插入的容器
 * @param {Array<string>} containerPriorities - 容器的优先级顺序，最高优先级在前
 */
function insertContainerInPosition(parentElement, container, containerPriorities = [
    'message-actions',
    'related-questions-container',
    'reference-files-container',
    'related-contexts-container',
    'rag-prompt-container'
]) {
    // 找到消息操作按钮
    const actionsDiv = parentElement.querySelector('.message-actions');
    
    if (actionsDiv) {
        // 根据优先级查找已存在的容器
        let insertAfterElement = actionsDiv;
        
        for (const className of containerPriorities) {
            const existingContainer = parentElement.querySelector(`.${className}`);
            if (existingContainer) {
                insertAfterElement = existingContainer;
                break;
            }
        }
        
        // 插入到找到的元素之后
        parentElement.insertBefore(container, insertAfterElement.nextSibling);
    } else {
        // 如果没有找到任何参考点，直接添加到消息末尾
        parentElement.appendChild(container);
    }
}

/**
 * 通用的带缓存的API请求函数
 * @param {string} endpoint - API端点
 * @param {Object} requestData - 请求数据
 * @param {string} cacheKey - 缓存键
 * @param {string} lastQueryField - lastQueryInfo中对应的字段名
 * @param {number} cacheTTL - 缓存有效期（秒）
 * @returns {Promise<Object>} - API响应数据
 */
async function fetchWithCache(endpoint, requestData, cacheKey, lastQueryField, cacheTTL = 1800) {
    let data;
    
    // 检查是否可以使用缓存
    if (lastQueryInfo.query === requestData.question && lastQueryInfo[lastQueryField]) {
        console.log(`使用缓存的${lastQueryField}数据`);
        data = apiCache.get(cacheKey);
    }
    
    // 如果没有缓存数据，则发起API请求
    if (!data) {
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            });
            
            data = await response.json();
            console.log(`${lastQueryField}数据:`, data);
            
            // 缓存成功的结果
            if (data.status === 'success') {
                apiCache.set(cacheKey, data, cacheTTL);
                // 更新最近查询信息
                lastQueryInfo.query = requestData.question;
                lastQueryInfo[lastQueryField] = true;
            }
        } catch (error) {
            console.error(`请求${lastQueryField}失败:`, error);
            throw error;
        }
    }
    
    return data;
}

// 设置侧边栏功能
function setupSidebar() {
    const sidebar = document.getElementById('history-sidebar');
    const toggle = document.getElementById('sidebar-toggle');
    
    if (!sidebar || !toggle) return;
    
    // 侧边栏切换
    toggle.addEventListener('click', () => {
        sidebar.classList.toggle('expanded');
    });
    
    // 加载全局历史记录
    loadGlobalChatHistory();
    
    // 为侧边栏中的新建按钮添加事件
    const newChatBtn = sidebar.querySelector('#new-chat-btn');
    if (newChatBtn) {
        newChatBtn.addEventListener('click', () => {
            // 获取当前页面类型
            const currentPage = window.location.pathname.includes('agent') ? 'agent' 
                  : window.location.pathname.includes('raw') ? 'raw' 
                  : 'rag';
            // 重置当前对话ID
            currentChatId = null;
            // 清空对话
            clearChat(currentPage);
            // 清除活动状态
            document.querySelectorAll('.chat-history-item').forEach(item => {
                item.classList.remove('active');
            });
        });
    }
}

// 加载全局历史记录
function loadGlobalChatHistory() {
    const historyList = document.getElementById('global-chat-history-list');
    if (!historyList) return;
    
    // 获取所有类型的历史记录
    const rawHistory = JSON.parse(localStorage.getItem('raw_history') || '[]');
    const ragHistory = JSON.parse(localStorage.getItem('rag_history') || '[]');
    const agentHistory = JSON.parse(localStorage.getItem('agent_history') || '[]');
    // 合并历史记录并按日期排序
    const allHistory = [...rawHistory, ...ragHistory, ...agentHistory].sort((a, b) => 
        new Date(b.date) - new Date(a.date)
    );
    
    historyList.innerHTML = allHistory.length ? 
        allHistory.map(chat => `
            <div class="chat-history-item" data-id="${chat.id}" data-type="${(chat.id.startsWith('agent') ? 'agent' : (chat.id.startsWith('raw') ? 'raw' : (chat.id.startsWith('rag') ? 'rag' : 'default')))}">
                <i class="fas ${(chat.id.startsWith('agent') ? 'fa-tools' : (chat.id.startsWith('raw') ? 'fa-comments' : (chat.id.startsWith('rag') ? 'fa-book' : 'fa-comments')))}"></i>
                <div class="chat-history-title">${chat.title}</div>
                <div class="chat-history-date">${new Date(chat.date).toLocaleDateString()}</div>
                <div class="chat-history-delete" data-id="${chat.id}" data-type="${(chat.id.startsWith('agent') ? 'agent' : (chat.id.startsWith('raw') ? 'raw' : (chat.id.startsWith('rag') ? 'rag' : 'default')))}">
                    <i class="fas fa-times"></i>
                </div>
            </div>
        `).join('') : 
        '<div class="empty-history">无历史对话</div>';
        
    // 添加事件监听
    document.querySelectorAll('#global-chat-history-list .chat-history-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.chat-history-delete')) {
                // 删除对话
                const id = e.target.closest('.chat-history-delete').dataset.id;
                const type = e.target.closest('.chat-history-delete').dataset.type;
                deleteChat(type, id);
                e.stopPropagation();
            } else {
                // 获取类型和ID
                const id = item.dataset.id;
                const type = item.dataset.type;
                // 判断是否需要切换页面
                const currentPage = window.location.pathname.includes('agent') ? 'agent' 
                  : window.location.pathname.includes('raw') ? 'raw' 
                  : 'rag';
                if (type !== currentPage) {
                    // 需要跳转页面
                    localStorage.setItem('pending_chat_id', id);
                    localStorage.setItem('pending_chat_type', type);
                    // 跳转到对应页面
                    if (type === 'agent') {
                        window.location.href = '/chat/agent';
                    } else if (type === 'raw') {
                        window.location.href = '/chat/raw';
                    } else if (type === 'rag') {
                        window.location.href = '/chat/rag';
                    }
                } else {
                    // 同一页面，直接加载
                    loadChat(type, id);
                }
            }
        });
    });
    
    // 检查是否有等待加载的对话
    const pendingId = localStorage.getItem('pending_chat_id');
    const pendingType = localStorage.getItem('pending_chat_type');
    
    if (pendingId && pendingType) {
        // 清除等待标记
        localStorage.removeItem('pending_chat_id');
        localStorage.removeItem('pending_chat_type');
        
        // 加载对话
        loadChat(pendingType, pendingId);
    }
}

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
    
    // 如果是用户消息，且是rag_chat模式时，添加相关问题和参考文件按钮
    if (type === 'user' && chatMode === 'rag' ) {
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
        referenceFilesBtn.onclick = () => fetchReferenceFiles(content, messageDiv, window.currentTopk || 3);
        
        // 相关上下文按钮
        const relatedContextsBtn = document.createElement('button');
        relatedContextsBtn.className = 'related-contexts-btn';
        relatedContextsBtn.innerHTML = '<i class="fas fa-book-open"></i>';
        relatedContextsBtn.title = '查看相关上下文';
        relatedContextsBtn.onclick = () => fetchRelatedContexts(content, messageDiv, window.currentTopk || 3);
        
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
async function streamFromOllama(url, data, options, contentDiv, callback = null) {
    try {
        // 发送请求获取流式响应
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ...data,
                stream: true,
                options: {...options}
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
    const chatHeader = document.querySelector('.chat-header'); // 添加chat-header元素
    const headerNewChatBtn = document.getElementById('header-new-chat-btn'); // 获取头部新对话按钮
    
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
    collapseBtn.innerHTML = '<i class="fas fa-chevron-down">折叠界面</i>';
    chatInput.parentElement.insertBefore(collapseBtn, chatInput);
    
    // 记录输入区域原始高度
    let inputHeight = chatInput.offsetHeight;
    
    // 折叠/展开功能
    function toggleCollapse() {
        const isCollapsed = chatInput.classList.toggle('collapsed');
        
        // 同时切换header的折叠状态
        if (chatHeader) {
            chatHeader.classList.toggle('collapsed', isCollapsed);
        }
        
        // 调整消息区域高度
        if (isCollapsed) {
            chatMessages.style.height = `auto`;
            chatInput.style.display = 'none';
            collapseBtn.innerHTML = '<i class="fas fa-chevron-up">展开界面</i>';

        } else {
            // 重新计算输入区域高度
            chatInput.style.height = 'auto';
            inputHeight = chatInput.offsetHeight;
            // chatMessages.style.height = `calc(100% - ${inputHeight}px)`;
            collapseBtn.innerHTML = '<i class="fas fa-chevron-down">折叠界面</i>';
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

function saveChat(chatType, messages, titlePrompt = null) {
    // 如果没有实质性消息则不保存
    if (messages.length <= 0 || 
        (messages.length === 1 && messages[0].classList.contains('welcome-message'))) {
        return null;
    }
    
    // 获取当前对话的第一条消息作为标题
    let title = "新对话";
    
    // 如果提供了标题提示文本，优先使用它
    if (titlePrompt) {
        // 从OCR提示中提取一个更合适的标题
        const titleMatch = titlePrompt.match(/用户提问: (.+?)$/m);
        if (titleMatch && titleMatch[1]) {
            title = titleMatch[1].trim();
        } else {
            // 如果没有找到用户提问部分，使用前30个字符
            title = titlePrompt.split('\n')[0].trim();
        }
        title = title.length > 30 ? title.substring(0, 30) + '...' : title;
    } else {
        // 常规方式获取标题：从第一条用户消息
        for (const msg of messages) {
            if (msg.classList.contains('user-message')) {
                // 检查这条消息是否有存储的实际提示（用于图片消息）
                if (msg.dataset.actualPrompt) {
                    const titleMatch = msg.dataset.actualPrompt.match(/用户提问: (.+?)$/m);
                    if (titleMatch && titleMatch[1]) {
                        title = titleMatch[1].trim();
                    } else {
                        // 使用第一行作为标题
                        title = msg.dataset.actualPrompt.split('\n')[0].trim();
                    }
                } else {
                    // 常规文本消息
                    const content = msg.querySelector('.message-content').textContent.trim();
                    title = content;
                }
                title = title.length > 30 ? title.substring(0, 30) + '...' : title;
                break;
            }
        }
    }
    
    // 提取消息内容
    const chatData = [];
    messages.forEach(msg => {
        // 跳过欢迎消息
        if (msg.classList.contains('welcome-message')) return;
        
        const type = msg.classList.contains('user-message') ? 'user' : 
                    msg.classList.contains('assistant-message') ? 'assistant' : 'system';
        
        // 获取消息内容 - 保存HTML内容以保留格式和LaTeX公式
        const contentDiv = msg.querySelector('.message-content');
        let content = contentDiv.innerHTML;
        
        // 确保LaTeX公式被正确保存
        chatData.push({ 
            type, 
            content,
            // 保存实际提示（如果有）用于图片OCR消息
            actualPrompt: msg.dataset?.actualPrompt
        });
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
            currentChatId = `${chatType}_${Date.now()}`;
            history.push({
                id: currentChatId,
                title,
                date: new Date().toISOString(),
                messages: chatData
            });
        }
    } else {
        // 创建新对话
        currentChatId = `${chatType}_${Date.now()}`;
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
    // 更新全局历史列表
    loadGlobalChatHistory();
    
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
            
            // 如果消息有存储的实际提示，恢复它
            if (msg.actualPrompt) {
                messageDiv.dataset.actualPrompt = msg.actualPrompt;
            }
            
            // 如果是用户消息，且是rag_chat模式，添加相关问题和参考文件按钮
            if (msg.type === 'user' && chatType === 'rag') {
                const actionsDiv = document.createElement('div');
                actionsDiv.className = 'message-actions';
                
                // 相关问题按钮
                const relatedQuestionsBtn = document.createElement('button');
                relatedQuestionsBtn.className = 'related-questions-btn';
                relatedQuestionsBtn.innerHTML = '<i class="fas fa-question-circle"></i>';
                relatedQuestionsBtn.title = '查看相关问题';
                relatedQuestionsBtn.onclick = () => fetchRelatedQuestions(msg.actualPrompt || contentDiv.textContent, messageDiv);
                
                // 参考文件按钮
                const referenceFilesBtn = document.createElement('button');
                referenceFilesBtn.className = 'reference-files-btn';
                referenceFilesBtn.innerHTML = '<i class="fas fa-file-alt"></i>';
                referenceFilesBtn.title = '查看参考文件';
                referenceFilesBtn.onclick = () => fetchReferenceFiles(msg.actualPrompt || contentDiv.textContent, messageDiv, window.currentTopk || 3);
                
                // 相关上下文按钮
                const relatedContextsBtn = document.createElement('button');
                relatedContextsBtn.className = 'related-contexts-btn';
                relatedContextsBtn.innerHTML = '<i class="fas fa-book-open"></i>';
                relatedContextsBtn.title = '查看相关上下文';
                relatedContextsBtn.onclick = () => fetchRelatedContexts(msg.actualPrompt || contentDiv.textContent, messageDiv, window.currentTopk || 3);
                
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
        
        // 重新渲染LaTeX公式
        if (window.MathJax) {
            MathJax.typesetPromise([chatMessages]).catch(err => console.log('历史对话公式渲染错误:', err));
        }
    }
}

function deleteChat(chatType, chatId) {
    if (confirm('确定要删除此对话？')) {
        let history = JSON.parse(localStorage.getItem(`${chatType}_history`) || '[]');
        history = history.filter(chat => chat.id !== chatId);
        localStorage.setItem(`${chatType}_history`, JSON.stringify(history));
        
        // 更新页面中的历史列表
        loadChatHistory(chatType);
        
        // 更新侧边栏的全局历史列表
        loadGlobalChatHistory();
        
        // 直接从DOM中移除被删除的元素（即时反馈）
        const deletedItems = document.querySelectorAll(`.chat-history-item[data-id="${chatId}"]`);
        deletedItems.forEach(item => item.remove());
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
                clearChat(chatType);
                
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

// 统一的消息发送函数
async function sendChatMessage({
    message,                   // 用户消息内容
    chatType = 'raw',          // 聊天类型：'raw' 或 'rag' 或 'agent'
    endpoint = 'http://localhost:11434/api/chat', // Ollama API 端点
    contextEndpoint = null,    // 获取上下文的端点（用于RAG）
    modelName = null,          // 模型名称
    temperature = 0.8,         // 温度参数
    top_k = 3,                  // TopK参数
    top_p = 0.9,               // Top_p参数
    systemPrompt = null,       // 系统提示（可选）
    additionalData = {}        // 额外数据参数（可选，如is_image等）
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
        let ollamaData_options = {
            temperature: temperature,
            top_p: top_p,
            top_k: top_k
        }

        // 如果是 RAG 模式且有上下文端点，获取上下文
        if (chatType === 'rag' && contextEndpoint) {
            try {
                const contextResponse = await fetch(contextEndpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        message,
                        top_k,
                        ...additionalData  // 包含额外数据，如 is_image 等
                    })
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
            ollamaData_options,
            contentDiv,
            () => {
                // 提取标题提示（如果有）
                const titlePrompt = additionalData.titlePrompt || null;
                
                // 完成后保存对话
                saveChat(chatType, document.querySelectorAll('#chat-messages > div'), titlePrompt);
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
        // 检查是否已有相关问题容器
        const existingContainer = checkExistingContainer(messageDiv, 'related-questions-container');
        if (existingContainer) {
            return;
        }
        
        // 创建加载指示器
        const loadingIndicator = createLoadingIndicator(messageDiv, '加载相关问题...');
        
        // 使用通用缓存获取数据
        const data = await fetchWithCache(
            '/api/related_questions',
            { question },
            `related_questions_${question}`,
            'questionsLoaded'
        );
        
        // 移除加载指示器
        messageDiv.removeChild(loadingIndicator);
        
            // 创建相关问题容器
        const { container } = createTitledContainer('related-questions-container', 'fa-question-circle', '相关问题');
        
        if (data.status === 'success' && data.questions && data.questions.length > 0) {
            // 创建问题列表
            const ul = document.createElement('ul');
            ul.className = 'related-questions-list';
            
            data.questions.forEach(q => {
                const li = document.createElement('li');
                const questionText = typeof q === 'object' ? q.question : q;
                const similarity = typeof q === 'object' && q.similarity ? ` (相似度: ${(q.similarity * 100).toFixed(1)}%)` : '';
                
                li.innerHTML = `<a href="#" class="related-question-link">${questionText}</a>${similarity}`;
                li.querySelector('a').addEventListener('click', (e) => {
                    e.preventDefault();
                    document.getElementById('user-input').value = questionText;
                    // 可选：自动提交问题
                    // document.querySelector('.send-button').click();
                });
                
                ul.appendChild(li);
            });
            
            container.appendChild(ul);
            
            // 添加时间信息（如果有提供）
            if (data.time_info) {
                const timeInfo = document.createElement('div');
                timeInfo.className = 'time-info';
                timeInfo.innerHTML = `<small>处理时间: ${(data.time_info.total * 1000).toFixed(0)}ms</small>`;
                container.appendChild(timeInfo);
            }
        } else {
            // 显示未找到相关问题
            const noQuestions = document.createElement('p');
            noQuestions.className = 'no-results';
            noQuestions.textContent = '未找到相关问题';
            container.appendChild(noQuestions);
        }
        
        // 插入到适当位置
        insertContainerInPosition(messageDiv, container);
    } catch (error) {
        console.error('加载相关问题出错:', error);
    }
}

// 获取参考文件
async function fetchReferenceFiles(question, messageDiv, topk = 3) {
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
        
        // 检查是否有缓存
        const cacheKey = `reference_files_${question}_${topk}`;
        let data;
        
        // 首先检查当前问题是否与上一次查询相同
        if (lastQueryInfo.query === question && lastQueryInfo.referencesLoaded) {
            console.log('使用上次查询的参考文件结果');
            data = apiCache.get(cacheKey);
        }
        
        // 如果没有缓存数据，则发起API请求
        if (!data) {
        // 请求参考文件
        const response = await fetch('/api/reference_files', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
                body: JSON.stringify({ question: question, top_k: topk })
            });
            
            data = await response.json();
            
            // 缓存结果
            if (data.status === 'success') {
                apiCache.set(cacheKey, data);
                // 更新最近查询信息
                lastQueryInfo.query = question;
                lastQueryInfo.referencesLoaded = true;
            }
        }
        
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
                    
                    // 点击文件时，预览文件 - 使用缓存机制
                    fileItem.addEventListener('click', async () => {
                        await previewFile(file.file_path, fileItem);
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

// 文件预览辅助函数 - 整合了预览逻辑并添加缓存
async function previewFile(filePath, fileItem) {
    try {
        // 检查是否有缓存的预览数据
        const cacheKey = `preview_${filePath}`;
        let previewData = apiCache.get(cacheKey);
        
        if (!previewData) {
            // 创建临时加载指示器
            const originalContent = fileItem.innerHTML;
            fileItem.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 加载预览...';
            
            const previewResponse = await fetch('/api/documents/preview', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ file_path: filePath })
            });
            
            previewData = await previewResponse.json();
            
            // 恢复原始内容
            fileItem.innerHTML = originalContent;
            
            // 缓存预览结果
            if (previewData.status === 'success') {
                apiCache.set(cacheKey, previewData, 1800); // 缓存30分钟
            }
        }
        
        if (previewData.status === 'success') {
            // 创建预览模态框
            showPreviewModal(previewData, filePath);
        } else {
            console.error('预览文件失败:', previewData.message);
        }
    } catch (error) {
        console.error('预览文件时出错:', error);
    }
}

// 获取相关上下文
async function fetchRelatedContexts(question, messageDiv, topk = 3) {
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
        
        // 检查是否有缓存
        const cacheKey = `related_contexts_${question}_${topk}`;
        let data;
        
        // 首先检查当前问题是否与上一次查询相同
        if (lastQueryInfo.query === question && lastQueryInfo.contextsLoaded) {
            console.log('使用上次查询的相关上下文结果');
            data = apiCache.get(cacheKey);
        }
        
        // 如果没有缓存数据，则发起API请求
        if (!data) {
        // 请求相关上下文
        const response = await fetch('/api/reference_files', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
                body: JSON.stringify({ question, top_k: topk })
        });
        
            data = await response.json();
        console.log('query related_object: \n', data);
            
            // 缓存结果
            if (data.status === 'success') {
                apiCache.set(cacheKey, data);
                // 更新最近查询信息
                lastQueryInfo.query = question;
                lastQueryInfo.contextsLoaded = true;
            }
        }
        
        // 移除加载指示器
        messageDiv.removeChild(loadingIndicator);
        
        // 创建相关上下文容器
        const container = document.createElement('div');
        container.className = 'related-contexts-container';
        
        // 添加标题
        const title = document.createElement('h4');
        title.innerHTML = '<i class="fas fa-book-open"></i> 相关上下文';
        container.appendChild(title);
        
        if (data.status === 'success' && data.reference_contents && data.reference_contents.length > 0) {
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
        } else if (data.status === 'success' && data.reference_files && data.reference_files.length > 0) {
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
                titleBar.addEventListener('click', () => {
                    contextItem.classList.toggle('expanded');
                    
                    // 如果已经加载了内容，就不再重复加载
                    if (contentArea.querySelector('.context-preview-loading')) {
                        loadContextContent(file.file_path, contentArea);
                    }
                });
                
                // 将标题栏和内容添加到项目中
                contextItem.appendChild(titleBar);
                contextItem.appendChild(contentArea);
                
                contextsList.appendChild(contextItem);
            });
            
            container.appendChild(contextsList);
        } else {
            // 没有找到相关上下文时显示提示信息
            const noContexts = document.createElement('p');
            noContexts.className = 'no-contexts-message';
            noContexts.textContent = '没有找到相关上下文';
            container.appendChild(noContexts);
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
    } catch (error) {
        console.error('获取相关上下文出错:', error);
    }
}

// 加载上下文内容 - 使用缓存加载文件内容
async function loadContextContent(filePath, contentArea) {
    try {
        // 检查是否有缓存的预览数据
        const cacheKey = `preview_${filePath}`;
        let previewData = apiCache.get(cacheKey);
        
        // 显示加载中
                            contentArea.innerHTML = `<div class="context-preview-loading">加载中...</div>`;
                            
        if (!previewData) {
                            // 请求文件预览
                            const previewResponse = await fetch('/api/documents/preview', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                body: JSON.stringify({ file_path: filePath })
                            });
                            
            previewData = await previewResponse.json();
                            
            // 缓存预览结果
                            if (previewData.status === 'success') {
                apiCache.set(cacheKey, previewData, 1800); // 缓存30分钟
            }
        }

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
                                } else if (previewData.type === 'docx' && previewData.data) {
                                    // 创建DOCX预览容器
                const docxContainerId = `docx-container-${Date.now()}`;
                                    contentArea.innerHTML = `
                                        <div id="${docxContainerId}" style="width: 100%; height: 400px; border: 1px solid #ddd; overflow: auto;"></div>
                                    `;
                                    
                // 渲染DOCX内容
                const container = document.getElementById(docxContainerId);
                if (container) {
                    renderDocxPreview(previewData.data, { querySelector: () => container });
                }
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

// 清空对话
function clearChat(pagename) {
    showWelcomeMessage(pagename);
}

// 显示预览模态框 - 将预览逻辑提取到单独的函数
function showPreviewModal(previewData, filePath) {
    // 创建预览模态框
    const previewModal = document.createElement('div');
    previewModal.className = 'preview-modal';
    
    let previewContent = '';
    switch(previewData.type) {
        case 'html_table':
            previewContent = `
                <div class="preview-modal-content csv-preview">
                    <span class="preview-close">&times;</span>
                    <h3>CSV文件预览：${filePath}</h3>
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
                    <h3>文档预览：${filePath}</h3>
                    <div class="preview-content">
                        ${previewData.content}
                    </div>
                </div>
            `;
            break;
        case 'docx':
            previewContent = `
                <div class="preview-modal-content docx-preview">
                    <span class="preview-close">&times;</span>
                    <h3>Word文档预览：${filePath}</h3>
                    <div class="preview-content">
                        <div id="docx-container-${new Date().getTime()}" class="docx-container" style="width: 100%; height: 600px; border: 1px solid #ddd; overflow: auto;"></div>
                    </div>
                </div>
            `;
            break;
        case 'pdf':
            // 将绝对路径转换为相对路径，并将反斜杠替换为正斜杠
            previewData.url = previewData.url?.replace(/\\/g, '/');
            previewContent = `
                <div class="preview-modal-content pdf-preview">
                    <span class="preview-close">&times;</span>
                    <h3>PDF文档预览：${filePath}</h3>
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
                    <h3>文档预览：${filePath}</h3>
                    <pre>${previewData.content}</pre>
                </div>
            `;
    }
    
    previewModal.innerHTML = previewContent;
    
    document.body.appendChild(previewModal);
    
    // 处理DOCX文件的渲染
    if (previewData.type === 'docx' && previewData.data) {
        renderDocxPreview(previewData.data, previewModal);
    }
    
    // 关闭模态框
    previewModal.querySelector('.preview-close').addEventListener('click', () => {
        document.body.removeChild(previewModal);
    });
}

// 渲染DOCX预览
function renderDocxPreview(base64Data, previewModal) {
                                    try {
                                        // 将base64数据转换为ArrayBuffer
        const binaryString = atob(base64Data);
                                        const bytes = new Uint8Array(binaryString.length);
                                        for (let i = 0; i < binaryString.length; i++) {
                                            bytes[i] = binaryString.charCodeAt(i);
                                        }
                                        const arrayBuffer = bytes.buffer;
                                        
                                        // 使用docx-preview库渲染文档
        const container = previewModal.querySelector('.docx-container');
                                        if (!container) {
                                            console.error('找不到DOCX容器元素');
                                            return;
                                        }
                                        
                                        // 检查docxPreview是否可用
                                        if (typeof docx !== 'undefined' && docx.renderAsync) {
                                            // 使用全局docx对象
                                            docx.renderAsync(arrayBuffer, container, null, {
                                                className: 'docx-rendered',
                                                inWrapper: true,
                                                ignoreWidth: false,
                                                ignoreHeight: false,
                                                ignoreFonts: false,
                                                breakPages: true,
                                                ignoreLastRenderedPageBreak: true,
                                                renderHeaders: true,
                                                renderFooters: true,
                                                renderFootnotes: true,
                                                renderEndnotes: true
                                            }).then(() => {
                                                // console.log('文档渲染成功');
                                            }).catch(error => {
                                                console.error('文档渲染失败:', error);
                                                container.innerHTML = `<div class="error-message">文档渲染失败: ${error.message}</div>`;
                                            });
                                        } else if (typeof window.docxPreview !== 'undefined') {
                                            // 尝试使用 docxPreview 对象
                                            window.docxPreview.renderAsync(arrayBuffer, container, null, {
                                                className: 'docx-rendered',
                                                inWrapper: true,
                                                ignoreWidth: false,
                                                ignoreHeight: false,
                                                ignoreFonts: false,
                                                breakPages: true,
                                                ignoreLastRenderedPageBreak: true,
                                                renderHeaders: true,
                                                renderFooters: true,
                                                renderFootnotes: true,
                                                renderEndnotes: true
                                            }).then(() => {
                                                // console.log('文档渲染成功');
                                            }).catch(error => {
                                                console.error('文档渲染失败:', error);
                                                container.innerHTML = `<div class="error-message">文档渲染失败: ${error.message}</div>`;
                                            });
                                        } else {
                                            // 尝试查找全局暴露的DocxJS对象
                                            const DocxJS = window.DocxJS || window.docxjs || window.docxJS;
                                            if (DocxJS) {
                                                try {
                                                    const renderer = new DocxJS.DocxRenderer();
                                                    renderer.render(arrayBuffer, container);
                                                    // console.log('文档渲染成功');
                                                } catch (error) {
                                                    console.error('文档渲染失败:', error);
                                                    container.innerHTML = `<div class="error-message">文档渲染失败: ${error.message}</div>`;
                                                }
                                            } else {
                                                console.error('找不到docx-preview库');
                                                container.innerHTML = `<div class="error-message">找不到docx-preview库，无法渲染文档</div>`;
                                            }
                                        }
                                    } catch (error) {
                                        console.error('处理DOCX文件失败:', error);
        const container = previewModal.querySelector('.docx-container');
        if (container) {
            container.innerHTML = `<div class="error-message">处理DOCX文件失败: ${error.message}</div>`;
        }
    }
}

// 获取RAG提示
async function fetchRagPrompt(question, messageDiv) {
    try {
        // 检查是否已有RAG提示容器
        const existingContainer = checkExistingContainer(messageDiv, 'rag-prompt-container');
        if (existingContainer) {
            return;
        }
        
        // 创建加载指示器
        const loadingIndicator = createLoadingIndicator(messageDiv, '生成RAG提示中...');
        
        // 使用通用缓存获取数据
        const data = await fetchWithCache(
            '/api/get_rag_prompt',
            { question },
            `rag_prompt_${question}`,
            'promptGenerated'
        );
        
        // 移除加载指示器
        messageDiv.removeChild(loadingIndicator);
        
        // 创建RAG提示容器
        const { container } = createTitledContainer('rag-prompt-container', 'fa-lightbulb', 'RAG提示');
        
        if (data.status === 'success' && data.prompt) {
            // 创建提示内容区
            const promptContent = document.createElement('div');
            promptContent.className = 'rag-prompt-content';
            
            // 根据是否提供formattedPrompt来决定显示方式
            if (data.formatted_prompt) {
                promptContent.innerHTML = data.formatted_prompt;
        } else {
                promptContent.textContent = data.prompt;
            }
            
            container.appendChild(promptContent);
            
            // 添加复制按钮
            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-btn';
            copyBtn.innerHTML = '<i class="fas fa-copy"></i> 复制提示';
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(data.prompt)
                    .then(() => {
                        copyBtn.innerHTML = '<i class="fas fa-check"></i> 已复制';
                        setTimeout(() => {
                            copyBtn.innerHTML = '<i class="fas fa-copy"></i> 复制提示';
                        }, 2000);
                    })
                    .catch(err => {
                        console.error('复制失败:', err);
                        copyBtn.innerHTML = '<i class="fas fa-times"></i> 复制失败';
                        setTimeout(() => {
                            copyBtn.innerHTML = '<i class="fas fa-copy"></i> 复制提示';
                        }, 2000);
                    });
            });
            container.appendChild(copyBtn);
            
            // 添加时间信息（如果有提供）
            if (data.time_info) {
                const timeInfo = document.createElement('div');
                timeInfo.className = 'time-info';
                timeInfo.innerHTML = `<small>处理时间: ${(data.time_info.total * 1000).toFixed(0)}ms</small>`;
                container.appendChild(timeInfo);
            }
        } else {
            // 显示错误信息
            const errorMsg = document.createElement('p');
            errorMsg.className = 'error-message';
            errorMsg.textContent = data.message || '无法生成RAG提示';
            container.appendChild(errorMsg);
        }
        
        // 插入到适当位置
        insertContainerInPosition(messageDiv, container);
    } catch (error) {
        console.error('获取RAG提示出错:', error);
    }
}

/**
 * 创建带标题的通用容器
 * @param {string} containerClass - 容器CSS类名
 * @param {string} titleIcon - 标题图标的FontAwesome类名
 * @param {string} titleText - 标题文本
 * @returns {Object} - 包含container和titleElement的对象
 */
function createTitledContainer(containerClass, titleIcon, titleText) {
    // 创建容器
    const container = document.createElement('div');
    container.className = containerClass;
    
    // 添加标题
    const title = document.createElement('h4');
    title.innerHTML = `<i class="fas ${titleIcon}"></i> ${titleText}`;
    container.appendChild(title);
    
    return { container, titleElement: title };
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
    clearChat,
    setupSidebar,
    loadGlobalChatHistory,
    fetchRagPrompt,
    // 新增工具函数
    getFileIconClass,
    normalizeFilePath,
    createLoadingIndicator,
    checkExistingContainer,
    insertContainerInPosition,
    fetchWithCache,
    createTitledContainer
};


