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
    
    // 加载模型配置
    loadModelConfig();
    
    // 设置模型切换
    setupModelSwitching();
    
    // 加载已上传的文档
    loadDocuments();
    
    // 发送消息函数
    async function sendMessage() {
        const message = messageInput.value.trim();
        if (!message) return;
        
        try {
            // 使用统一的发送函数
            await sendChatMessage({
                message: message,
                chatType: 'rag',
                contextEndpoint: '/api/chat/rag/prompt'
            });
        } catch (error) {
            console.error('消息发送失败:', error);
        }
    }
    
    // 清空对话函数
    function clearChatMessages() {
        clearChat('rag');
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