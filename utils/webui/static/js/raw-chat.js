document.addEventListener('DOMContentLoaded', function() {
    // 设置侧边栏
    setupSidebar();
    
    // 初始化RAW聊天
    setupRawChat();
});

function setupRawChat() {
    // 获取DOM元素
    const chatMessages = document.getElementById('chat-messages');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const clearButton = document.getElementById('clear-button');
    const temperatureSlider = document.getElementById('temperature-slider');
    const temperatureValue = document.getElementById('temperature-value');
    const modelSelect = document.getElementById('model-select');
    
    // 加载模型配置
    loadModelConfig();
    
    // 设置模型切换
    setupModelSwitching();
    
    // 设置温度滑块
    let currentTemperature = 0.7;
    
    // 更新温度值显示
    temperatureSlider.addEventListener('input', (e) => {
        currentTemperature = parseFloat(e.target.value);
        temperatureValue.textContent = currentTemperature.toFixed(1);
    });
    
    // 发送消息函数
    async function sendMessage() {
        const message = messageInput.value.trim();
        if (!message) return;
        
        try {
            // 使用统一的发送函数
            await sendChatMessage({
                message: message,
                chatType: 'raw',
                temperature: currentTemperature,
                fallbackEndpoint: '/api/chat_completions'
            });
        } catch (error) {
            console.error('消息发送失败:', error);
        }
    }
    
    // 清空对话函数
    function clearChatMessages() {
        clearChat('raw');
    }
    
    // 添加事件监听器
    sendButton.addEventListener('click', sendMessage);
    clearButton.addEventListener('click', clearChatMessages);
    messageInput.addEventListener('input', autoResizeTextarea);
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
    setupChatHistory('raw');
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
    setupSidebar
} from '/static/js/chat-func.js'; 