document.addEventListener('DOMContentLoaded', function() {
    // 设置侧边栏
    setupSidebar();
    
    // 初始化RAG聊天
    setupRAGChat();
});

function setupRAGChat() {
    // 获取DOM元素
    const chatMessages = document.getElementById('chat-messages');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const clearButton = document.getElementById('clear-button');
    const uploadForm = document.getElementById('upload-form');
    const fileInput = document.getElementById('file-input');
    const documentsList = document.getElementById('documents-list');
    const modelSelect = document.getElementById('model-select');
    
    // 图片OCR相关元素
    const imageUploadInput = document.getElementById('chat-image-upload');
    const imagePreviewContainer = document.getElementById('image-preview-container');
    const previewImage = document.getElementById('preview-image');
    const removeImageBtn = document.getElementById('remove-image-btn');
    const ocrStatus = document.getElementById('ocr-status');
    
    // 存储当前上传的图片
    let currentUploadedImage = null;
    
    // 加载模型配置
    loadModelConfig();
    
    // 设置模型切换
    setupModelSwitching();
    
    // 加载已上传的文档
    loadDocuments();
    
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
                        const combined_prompt = ocrResult.combined_prompt;
                        
                        // 为图像消息设置真实提示作为数据属性，用于历史标题
                        userMessageDiv.dataset.actualPrompt = combined_prompt;
                        
                        // 发送组合后的消息进行对话，注意传递is_image标记
                        await sendChatMessage({
                            message: combined_prompt,
                            chatType: 'rag',
                            contextEndpoint: '/api/chat/rag/prompt',
                            additionalData: { 
                                is_image: true,
                                titlePrompt: combined_prompt  // 传递给标题使用
                            }
                        })
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
                    chatType: 'rag',
                    contextEndpoint: '/api/chat/rag/prompt'
                });
            }
        } catch (error) {
            console.error('消息发送失败:', error);
        }
    }
    
    // 清空对话函数
    async function clearChatMessages() {
        clearChat('rag');
        
        // 清空RAG系统中的对话历史
        try {
            const response = await fetch('/api/chat/clear_history', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            const data = await response.json();
            console.log('清空对话历史结果:', data);
        } catch (error) {
            console.error('清空对话历史失败:', error);
        }
    }
    
    // 上传文件函数
    async function uploadDocuments(e) {
        e.preventDefault();
        const files = fileInput.files;
        if (!files.length) return;
        
        const formData = new FormData();
        for (let file of files) {
            formData.append('files', file);
        }
        
        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            if (data.status === 'success') {
                addMessage('文件上传成功！', 'system');
                loadDocuments();  // 重新加载文档列表
            } else {
                addMessage('文件上传失败：' + data.message, 'error');
            }
        } catch (error) {
            console.error('上传文件失败:', error);
            addMessage('上传文件失败，请重试', 'error');
        }
    }
    
    // 加载文档列表
    async function loadDocuments() {
        try {
            const response = await fetch('/api/documents');
            const data = await response.json();
            if (data && Array.isArray(data)) {
                documentsList.innerHTML = data.map(doc => {
                    const relativePath = doc.file_path.split('/').slice(-2).join('/');
                    const fileExt = relativePath.split('.').pop().toLowerCase();
                    // 根据文件类型选择不同的图标
                    let iconClass = 'fa-file-alt';
                    switch(fileExt) {
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
                    
                    return `
                        <div class="document-item" data-path="${doc.file_path}">
                            <i class="fas ${iconClass}"></i>
                            <span class="document-name">${relativePath}</span>
                        </div>
                    `;
                }).join('');
                
                // 添加预览事件监听
                setupDocumentPreviews();
            }
        } catch (error) {
            console.error('加载文档失败:', error);
            documentsList.innerHTML = '<div class="error-message">加载文档失败</div>';
        }
    }
    
    // 设置文档预览功能
    function setupDocumentPreviews() {
        document.querySelectorAll('.document-item').forEach(documentItem => {
            documentItem.addEventListener('click', async (e) => {
                const filePath = documentItem.dataset.path;
                
                try {
                    const previewResponse = await fetch('/api/documents/preview', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ file_path: filePath })
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
                                        <h3>CSV文件预览：${filePath}</h3>
                                        <div class="table-container">
                                            ${previewData.content}
                                        </div>
                                    </div>
                                `;
                                break;
                            case 'html_iframe':
                                // HTML文件通过iframe预览
                                previewContent = `
                                    <div class="preview-modal-content html-iframe-preview">
                                        <span class="preview-close">&times;</span>
                                        <h3>HTML文件预览：${filePath}</h3>
                                        <div class="iframe-container">
                                            <iframe src="${previewData.url}" frameborder="0" width="100%" height="600px"></iframe>
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
                                            <div class="docx-container" style="width: 100%; height: 600px; border: 1px solid #ddd; overflow: auto;"></div>
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
                    } else {
                        addMessage(previewData.message, 'error');
                    }
                } catch (error) {
                    console.error('预览文档失败:', error);
                    addMessage('预览文档失败', 'error');
                }
            });
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
                    console.log('文档渲染成功');
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
                    console.log('文档渲染成功');
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
                        console.log('文档渲染成功');
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
    
    // 添加事件监听器
    sendButton.addEventListener('click', sendMessage);
    clearButton.addEventListener('click', clearChatMessages);
    uploadForm.addEventListener('submit', uploadDocuments);
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
    setupChatHistory('rag');
    
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
        clearChat('rag');
        
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
    addLoadingMessage,
    setupChatHistory, 
    sendChatMessage, 
    clearChat,
    setupSidebar,
    currentChatId
} from '/static/js/chat-func.js'; 