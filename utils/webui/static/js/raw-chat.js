document.addEventListener('DOMContentLoaded', function() {
    // 设置侧边栏
    setupSidebar();
    
    // 初始化RAW聊天
    setupRawChat();
});

function setupRawChat() {
    // 获取DOM元素
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const clearButton = document.getElementById('clear-button');
    const temperatureSlider = document.getElementById('temperature-slider');
    const temperatureValue = document.getElementById('temperature-value');
    const top_p_slider = document.getElementById('top_p-slider');
    const top_p_value = document.getElementById('top_p-value');
    const topk_slider = document.getElementById('topk-slider');
    const topk_value = document.getElementById('topk-value');

    // 图片OCR相关元素
    const imageUploadInput = document.getElementById('chat-image-upload');
    const imagePreviewContainer = document.getElementById('image-preview-container');
    const previewImage = document.getElementById('preview-image');
    const removeImageBtn = document.getElementById('remove-image-btn');
    const ocrStatus = document.getElementById('ocr-status');
    
    let currentUploadedImage = null;
    let currentTop_p = 0.9;
    let currentTemperature = 0.8;
    let currentTopk = 20;

    // 处理图片上传
    imageUploadInput.addEventListener('change', handleImageUpload);
    removeImageBtn.addEventListener('click', removeUploadedImage);
    
    // 图片上传处理函数
    function handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        
        // 验证文件是否为图片
        if (!file.type.startsWith('image/')) {
            addMessage('请上传有效的图片文件', 'system');
            return;
        }
        
        // 存储当前上传的图片
        currentUploadedImage = file;
        
        // 显示图片预览
        const reader = new FileReader();
        reader.onload = function(e) {
            previewImage.src = e.target.result;
            imagePreviewContainer.classList.add('active');
            ocrStatus.textContent = '状态: 等待发送...';
            
            // 添加 has-image 类到上传按钮
            document.getElementById('image-upload-btn').classList.add('has-image');
        };
        reader.readAsDataURL(file);
    }
    
    // 移除已上传图片
    function removeUploadedImage() {
        currentUploadedImage = null;
        imagePreviewContainer.classList.remove('active');
        previewImage.src = '';
        imageUploadInput.value = '';
        
        // 移除 has-image 类
        document.getElementById('image-upload-btn').classList.remove('has-image');
    }
    
    // 加载模型配置
    loadModelConfig();
    
    // 设置模型切换
    setupModelSwitching();
    
    
    // 发送消息函数
    async function sendMessage() {
        const message = messageInput.value.trim();
        if (!message && !currentUploadedImage) return;
        
        try {
            if (currentUploadedImage) {
                // 如果有图片，先进行OCR处理
                ocrStatus.textContent = '状态: OCR处理中...';
                
                const formData = new FormData();
                formData.append('image', currentUploadedImage);
                formData.append('message', message); // 将用户输入的问题也一起发送
                
                // 显示用户消息（包含图片）
                const userMessageDiv = addMessage(message, 'user');
                
                // 在用户消息中添加图片预览
                const imgPreview = document.createElement('div');
                imgPreview.className = 'message-image-preview';
                imgPreview.innerHTML = `<img src="${previewImage.src}" alt="用户上传图片">`;
                userMessageDiv.querySelector('.message-content').appendChild(imgPreview);
                
                // 添加加载消息
                const loadingMessage = addLoadingMessage();
                
                try {
                    // 发送OCR请求
                    const ocrResponse = await fetch('/api/ocr_process', {
                        method: 'POST',
                        body: formData
                    });
                    
                    const ocrResult = await ocrResponse.json();
                    if (ocrResult.status === 'success') {
                        // 移除加载消息
                        loadingMessage.remove();
                        console.log(ocrResult);
                        // 显示OCR结果和AI回答
                        // const combined_prompt = ocrResult.combined_prompt;
                        const combined_prompt = ocrResult.ocr_text;
                        
                        // 为图像消息设置真实提示作为数据属性，用于历史标题
                        userMessageDiv.dataset.actualPrompt = combined_prompt;
                        
                        // 发送组合后的消息进行对话，使用 raw 聊天模式
                        await sendChatMessage({
                            message: combined_prompt,
                            chatType: 'raw',
                            temperature: currentTemperature,
                            top_p: currentTop_p,
                            top_k: currentTopk,
                            fallbackEndpoint: '/api/chat_completions',
                            additionalData: { 
                                is_image: true,
                                titlePrompt: combined_prompt // 传递给标题使用
                            }
                        });
                        
                        // 清除上传的图片
                        removeUploadedImage();
                    } else {
                        // 显示错误信息
                        loadingMessage.remove();
                        addMessage('OCR处理失败: ' + ocrResult.message, 'system');
                    }
                } catch (error) {
                    loadingMessage.remove();
                    addMessage('OCR处理过程中发生错误', 'system');
                    console.error('OCR处理错误:', error);
                }
            } else {
                // 没有图片，正常发送文本消息
                await sendChatMessage({
                    message: message,
                    chatType: 'raw',
                    temperature: currentTemperature,
                    top_p: currentTop_p,
                    top_k: currentTopk,
                    fallbackEndpoint: '/api/chat_completions'
                });
            }
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
    
    temperatureSlider.addEventListener('input', (e) => {
        currentTemperature = parseFloat(e.target.value);
        temperatureValue.textContent = currentTemperature.toFixed(1);
    });

    top_p_slider.addEventListener('input', (e) => {
        currentTop_p = parseFloat(e.target.value);
        top_p_value.textContent = currentTop_p.toFixed(1);
    });

    topk_slider.addEventListener('input', (e) => {
        currentTopk = parseInt(e.target.value);
        topk_value.textContent = currentTopk;
    });
    
    // 设置输入区域自动调整大小
    autoResizeTextarea();
    
    // 设置输入折叠功能
    setupInputCollapse();
    
    // 设置聊天历史记录
    setupChatHistory('raw');
    
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
        clearChat('raw');
        
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