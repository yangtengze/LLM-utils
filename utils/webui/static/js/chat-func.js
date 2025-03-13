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
function addMessage(content, type, streaming = false) {
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
        streamMessage(content, messageDiv);
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
function streamMessage(content, messageDiv) {
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

// 导出共用函数
export {
    formatMessage,
    addMessage,
    addLoadingMessage,
    streamMessage,
    loadModelConfig,
    setupModelSwitching,
    autoResizeTextarea,
    setupInputCollapse
}; 