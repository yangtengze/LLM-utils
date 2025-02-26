// 创建新文件，存放共用的聊天功能
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const chatMessages = document.getElementById('chat-messages');
const clearButton = document.getElementById('clear-button');

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

// 共用的消息格式化函数
function formatMessage(content) {
    return content.replace(/<think>([\s\S]*?)<\/think>/g, '<div class="think">thinking: $1</div>');
}

// 添加流式输出函数
function streamMessage(content, messageDiv) {
    const contentDiv = messageDiv.querySelector('.message-content');
    let index = 0;
    const chars = content.split('');
    
    function appendNextChar() {
        if (index < chars.length) {
            // 处理HTML标签
            if (chars[index] === '<') {
                let tagContent = '<';
                let j = index + 1;
                while (j < chars.length && chars[j] !== '>') {
                    tagContent += chars[j];
                    j++;
                }
                tagContent += '>';
                
                // 检查是否是think标签
                if (tagContent.startsWith('<think>')) {
                    const thinkStart = index;
                    // 找到结束标签
                    while (j < chars.length && !chars.slice(j, j + 8).join('').includes('</think>')) {
                        j++;
                    }
                    j += 8; // 跳过</think>
                    const thinkContent = chars.slice(thinkStart, j).join('');
                    contentDiv.innerHTML += formatMessage(thinkContent);
                    index = j;
                } else {
                    contentDiv.innerHTML += tagContent;
                    index = j + 1;
                }
            } else {
                contentDiv.innerHTML += chars[index];
                index++;
            }
            
            // 自动滚动到底部
            chatMessages.scrollTop = chatMessages.scrollHeight;
            setTimeout(appendNextChar, 20); // 控制打字速度
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

// 加载模型配置
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

// 切换模型
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

// 自动调整输入框高度
function autoResizeTextarea() {
    messageInput.style.height = 'auto';
    messageInput.style.height = messageInput.scrollHeight + 'px';
}


// 导出共用函数
export {
    formatMessage,
    addMessage,
    addLoadingMessage,
    streamMessage,
    loadModelConfig,
    setupModelSwitching,
    autoResizeTextarea
}; 