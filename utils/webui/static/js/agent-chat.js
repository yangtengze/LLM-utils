document.addEventListener('DOMContentLoaded', function() {
    // 设置侧边栏
    if (typeof setupSidebar === 'function') {
        setupSidebar();
    }
    
    // 初始化Agent Chat
    setupAgentChat();
});


function setupAgentChat() {
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const chatMessages = document.getElementById('chat-messages');
    const clearButton = document.getElementById('clear-button');
    const toolsList = document.getElementById('tools-list');

    // 添加温度滑块
    const temperatureSlider = document.getElementById('temperature-slider');
    const temperatureValue = document.getElementById('temperature-value');
    let currentTemperature = 0.7;

    
    // 加载模型配置
    loadModelConfig();
    
    // 设置模型切换
    setupModelSwitching();
    
    // 加载已上传的工具
    loadTools();

    // 发送消息函数
    async function sendMessage() {
        const message = messageInput.value.trim();
        if (!message) return;
        try {
            await sendChatMessage({
                message: message,
                chatType: 'agent',
                temperature: currentTemperature,
                fallbackEndpoint: '/api/chat/agent'
            });

        // addMessage(message, 'user');
        // messageInput.value = '';
        // messageInput.style.height = 'auto';

        // const loadingMessage = addLoadingMessage();

        // try {
        //     const response = await fetch('/api/chat/agent', {
        //         method: 'POST',
        //         headers: {
        //             'Content-Type': 'application/json'
        //         },
        //         body: JSON.stringify({ message })
        //     });
            
        //     const data = await response.json();
        //     loadingMessage.remove();
            
        //     if (data.status === 'success') {
        //         // 使用流式输出            
        //         addMessage(data.response, 'assistant', true, () => {
        //             console.log(document.querySelectorAll('#chat-messages > div'))
        //             // 渲染完成后保存对话
        //             saveChat('agent', document.querySelectorAll('#chat-messages > div'));
        //         });
        //     } else {
        //         addMessage('发送消息失败：' + data.message, 'error');
        //     }
        } catch (error) {
            console.error('发送消息失败:', error);
            addMessage('发送消息失败，请重试', 'error');
        }
    }

    // 加载可用工具
    async function loadTools() {
        try {
            const response = await fetch('/api/tools');
            const tools = await response.json();
            // console.log(tools)
            toolsList.innerHTML = tools.map(tool => `
                <div class="tool-item">
                    <div class="tool-header">
                        <i class="fas fa-tools"></i>
                        <span class="tool-name">${tool.name}</span>
                    </div>
                    <div class="tool-description">${tool.description}</div>
                    ${tool.parameters ? `
                        <div class="tool-parameters">
                            <div class="parameter-title">参数：</div>
                            ${Object.entries(tool.parameters).map(([name, param]) => `
                                <div class="parameter-item">
                                    <span class="parameter-name">${name}</span>
                                    <span class="parameter-desc">${param.description}</span>
                                    ${param.required ? '<span class="parameter-required">必填</span>' : ''}
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            `).join('');
        } catch (error) {
            console.error('加载工具失败:', error);
            toolsList.innerHTML = '<div class="error-message">加载工具失败</div>';
        }
    }

    // 清空对话函数
    function clearChatMessages() {
        clearChat('agent');
    }

        
    // 事件监听
    sendButton.addEventListener('click', sendMessage);
    clearButton.addEventListener('click', clearChat);
    messageInput.addEventListener('input', autoResizeTextarea);
    
    // 更新温度值显示
    temperatureSlider.addEventListener('input', (e) => {
        currentTemperature = parseFloat(e.target.value);
        temperatureValue.textContent = currentTemperature.toFixed(1);
    });

    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // 设置输入区域自动调整大小
    autoResizeTextarea();

    // 设置输入折叠功能
    setupInputCollapse();
    
    // 设置聊天历史记录
    setupChatHistory('agent');

    
    // 新对话按钮事件
    const newChatBtn = document.getElementById('new-chat-btn');
    const headerNewChatBtn = document.getElementById('header-new-chat-btn');
    
    if (newChatBtn) {
        // 检查是否已经有点击事件
        if (!newChatBtn._hasClickHandler) {
            newChatBtn.addEventListener('click', startNewChat);
            newChatBtn._hasClickHandler = true;
        }
    }
    
    // 为头部的新对话按钮添加相同的事件处理
    if (headerNewChatBtn) {
        headerNewChatBtn.addEventListener('click', startNewChat);
    }

    // 统一的新对话处理函数
    function startNewChat() {
        // 重置当前对话ID
        // currentChatId = null;
        
        // 显示欢迎信息
        clearChat('agent');
        
        // 清除活动状态
        document.querySelectorAll('.chat-history-item').forEach(item => {
            item.classList.remove('active');
        });
    }
}





// 从chat-func.js导入必要的函数
import { 
    addMessage, 
    loadModelConfig, 
    setupModelSwitching, 
    autoResizeTextarea, 
    setupInputCollapse, 
    setupChatHistory, 
    sendChatMessage, 
    clearChat,
    setupSidebar,
    addLoadingMessage,
} from '/static/js/chat-func.js'; 


