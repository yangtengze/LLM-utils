document.addEventListener('DOMContentLoaded', function() {
    // 设置侧边栏
    if (typeof setupSidebar === 'function') {
        setupSidebar();
    }
    
    // 初始化Chunks Manager
    setupChunksManager();
});

function setupChunksManager() {
    // 获取DOM元素
    const documentslist = document.getElementById('documents-list');
    const chunksContent = document.getElementById('chunks-content');
    const reloadButton = document.getElementById('reload-chunks');
    const chunkFilter = document.getElementById('chunk-filter');
    const clearFilterButton = document.getElementById('clear-filter');
    
    // 加载文档列表
    loadDocumentsList();
    
    // 事件监听
    reloadButton.addEventListener('click', () => {
        loadDocumentsList();
    });
    
    chunkFilter.addEventListener('input', filterChunks);
    
    clearFilterButton.addEventListener('click', () => {
        chunkFilter.value = '';
        filterChunks();
    });
    
    // 加载文档列表
    async function loadDocumentsList() {
        try {
            const response = await fetch('/api/documents');
            const data = await response.json();
            
            if (data && Array.isArray(data)) {
                documentslist.innerHTML = data.map(doc => {
                    const relativePath = doc.file_path.split('/').slice(-2).join('/');
                    const fileExt = relativePath.split('.').pop().toLowerCase();
                    // 根据文件类型选择不同的图标
                    let iconClass = 'fa-file-alt';
                    switch(fileExt) {
                        case 'pdf': iconClass = 'fa-file-pdf'; break;
                        case 'docx': case 'doc': iconClass = 'fa-file-word'; break;
                        case 'txt': iconClass = 'fa-file-alt'; break;
                        case 'md': iconClass = 'fab fa-markdown'; break;
                        case 'csv': iconClass = 'fa-file-csv'; break;
                        case 'html': iconClass = 'fa-file-code'; break;
                        case 'json': iconClass = 'fa-file-json'; break;
                    }
                    
                    return `
                        <div class="document-item" data-path="${doc.file_path}">
                            <div class="document-content">
                                <i class="fas ${iconClass}"></i>
                                <span class="document-name">${relativePath}</span>
                            </div>
                            <div class="document-actions">
                                <button class="delete-document-btn" title="删除文档">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </div>
                        </div>
                    `;
                }).join('');
                
                // 添加文档点击事件监听
                setupDocumentClickHandlers();
                // 添加删除按钮事件监听
                setupDeleteButtonHandlers();
            }
        } catch (error) {
            console.error('加载文档失败:', error);
            documentslist.innerHTML = '<div class="error-message">加载文档失败</div>';
        }
    }
    
    // 设置文档点击事件处理
    function setupDocumentClickHandlers() {
        document.querySelectorAll('.document-item').forEach(docItem => {
            // 获取文档内容部分
            const documentContent = docItem.querySelector('.document-content');
            if (documentContent) {
                documentContent.addEventListener('click', async () => {
                    const filePath = docItem.dataset.path;
                    loadDocumentChunks(filePath);
                    
                    // 添加活动状态样式
                    document.querySelectorAll('.document-item').forEach(item => {
                        item.classList.remove('active');
                    });
                    docItem.classList.add('active');
                });
            }
        });
    }
    
    // 设置删除按钮事件处理
    function setupDeleteButtonHandlers() {
        document.querySelectorAll('.delete-document-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation(); // 阻止冒泡以避免触发文档点击事件
                
                const docItem = btn.closest('.document-item');
                const filePath = docItem.dataset.path;
                const fileName = docItem.querySelector('.document-name').textContent;
                
                if (confirm(`确定要删除文档 "${fileName}" 吗？\n该操作将从知识库中删除此文档的所有分块，并会删除实际文件。`)) {
                    await deleteDocument(filePath, docItem);
                }
            });
        });
    }
    
    // 删除文档函数
    async function deleteDocument(filePath, docItem) {
        try {
            // 显示删除中状态
            docItem.classList.add('deleting');
            docItem.innerHTML = `
                <div class="document-content">
                    <i class="fas fa-spinner fa-spin"></i>
                    <span>正在删除...</span>
                </div>
            `;
            
            // 发送删除请求
            const response = await fetch('/api/documents/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ file_path: filePath })
            });
            
            const result = await response.json();
            
            if (result.status === 'success') {
                // 成功删除，移除文档项
                docItem.style.animation = 'fade-out 0.5s';
                setTimeout(() => {
                    docItem.remove();
                    
                    // 如果当前正在查看被删除的文档，清空内容区域
                    if (docItem.classList.contains('active')) {
                        chunksContent.innerHTML = `
                            <div class="welcome-message">
                                <i class="fas fa-puzzle-piece"></i>
                                <h3>文档已删除</h3>
                                <p>该文档已从知识库中移除。</p>
                                <p>请在左侧选择其他文档查看分块内容...</p>
                            </div>
                        `;
                    }
                    
                    // 显示临时成功提示
                    const successMsg = document.createElement('div');
                    successMsg.className = 'floating-success-message';
                    successMsg.innerHTML = `<i class="fas fa-check"></i> ${result.message}`;
                    document.body.appendChild(successMsg);
                    
                    // 3秒后移除提示
                    setTimeout(() => {
                        successMsg.style.opacity = '0';
                        setTimeout(() => {
                            successMsg.remove();
                        }, 500);
                    }, 3000);
                    
                }, 500);
            } else {
                // 删除失败，显示错误
                alert('删除失败: ' + result.message);
                // 重新加载文档列表
                loadDocumentsList();
            }
        } catch (error) {
            console.error('删除文档失败:', error);
            alert('删除文档失败: ' + error.message);
            // 重新加载文档列表
            loadDocumentsList();
        }
    }
    
    // 加载文档的分块内容
    async function loadDocumentChunks(filePath) {
        try {
            chunksContent.innerHTML = `
                <div class="loading-message">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>正在加载分块内容...</p>
                </div>
            `;
            // console.log(filePath);
            const response = await fetch('/api/chunks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ file_path: filePath })
            });

            const data = await response.json();
            
            if (data.status === 'success') {
                // console.log(data.chunks);
                if (data.chunks.length === 0) {
                    chunksContent.innerHTML = `
                        <div class="no-chunks-message">
                            <i class="fas fa-exclamation-circle"></i>
                            <p>该文档没有分块内容</p>
                        </div>
                    `;
                    return;
                }
                
                // 渲染分块列表
                chunksContent.innerHTML = `
                    <div class="document-info">
                        <h3>${filePath.split('/').pop()}</h3>
                        <p>共 ${data.chunks.length} 个分块</p>
                    </div>
                    <div class="chunks-list" id="chunks-list">
                        ${renderChunks(data.chunks)}
                    </div>
                `;
                
                // 设置分块展开/折叠事件
                setupChunkToggleHandlers();
            } else {
                chunksContent.innerHTML = `
                    <div class="error-message">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p>${data.message || '加载分块失败'}</p>
                    </div>
                `;
            }
        } catch (error) {
            console.error('加载分块失败:', error);
            chunksContent.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>加载分块失败: ${error.message}</p>
                </div>
            `;
        }
    }
    
    // 渲染分块列表
    function renderChunks(chunks) {
        return chunks.map((chunk, index) => {
            return `
                <div class="chunk-item" data-index="${index}">
                    <div class="chunk-header">
                        <span class="chunk-index">分块 ${parseInt(chunk.chunk_index) + 1}/${chunk.total_chunks}</span>
                        <div class="chunk-actions">
                            <button class="chunk-toggle" title="展开/折叠">
                                <i class="fas fa-chevron-down"></i>
                            </button>
                        </div>
                    </div>
                    <div class="chunk-content">
                        <pre contenteditable="true" class="editable-chunk" data-file-path="${chunk.file_path}" data-chunk-index="${chunk.chunk_index}">${chunk.chunk_content}</pre>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    // 设置分块展开/折叠事件
    function setupChunkToggleHandlers() {
        document.querySelectorAll('.chunk-toggle').forEach(button => {
            button.addEventListener('click', () => {
                const chunkItem = button.closest('.chunk-item');
                chunkItem.classList.toggle('expanded');
                
                // 切换图标
                const icon = button.querySelector('i');
                if (chunkItem.classList.contains('expanded')) {
                    icon.classList.remove('fa-chevron-down');
                    icon.classList.add('fa-chevron-up');
                } else {
                    icon.classList.remove('fa-chevron-up');
                    icon.classList.add('fa-chevron-down');
                }
            });
        });

        // 添加编辑内容保存功能
        document.querySelectorAll('.editable-chunk').forEach(chunk => {
            chunk.addEventListener('keydown', async (event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    
                    const filePath = chunk.dataset.filePath;
                    const chunkIndex = chunk.dataset.chunkIndex;
                    const newContent = chunk.textContent;
                    try {
                        // 显示保存中状态
                        const originalContent = chunk.innerHTML;
                        chunk.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 保存中...';
                        
                        // 发送请求保存修改后的内容
                        const response = await fetch('/api/update_chunk', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                file_path: filePath,
                                chunk_index: chunkIndex,
                                chunk_content: newContent
                            })
                        });
                        
                        const result = await response.json();
                        
                        if (result.status === 'success') {
                            // 显示成功状态
                            chunk.innerHTML = newContent;
                            
                            // 显示临时提示
                            const chunkItem = chunk.closest('.chunk-item');
                            const successMsg = document.createElement('div');
                            successMsg.className = 'save-success-message';
                            successMsg.innerHTML = '<i class="fas fa-check"></i> 分块内容已更新，向量重建成功';
                            chunkItem.appendChild(successMsg);
                            
                            // 3秒后移除提示
                            setTimeout(() => {
                                successMsg.remove();
                            }, 3000);
                        } else {
                            // 恢复原始内容并显示错误
                            chunk.innerHTML = originalContent;
                            alert('保存失败: ' + result.message);
                        }
                    } catch (error) {
                        console.error('保存分块内容失败:', error);
                        alert('保存分块内容失败: ' + error.message);
                    }
                }
            });
        });
    }
    
    // 过滤分块
    function filterChunks() {
        const filterText = chunkFilter.value.toLowerCase();
        const chunkItems = document.querySelectorAll('.chunk-item');
        
        chunkItems.forEach(item => {
            const content = item.querySelector('.chunk-content pre').textContent.toLowerCase();
            if (filterText === '' || content.includes(filterText)) {
                item.style.display = '';
                // 如果包含过滤文本，高亮显示
                if (filterText !== '') {
                    item.classList.add('expanded');
                    item.querySelector('.chunk-toggle i').classList.remove('fa-chevron-down');
                    item.querySelector('.chunk-toggle i').classList.add('fa-chevron-up');
                }
            } else {
                item.style.display = 'none';
            }
        });
    }
}

// 导入公共函数
import { setupSidebar } from '/static/js/chat-func.js'; 