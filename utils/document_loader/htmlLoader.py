import re
from bs4 import BeautifulSoup
import os
from typing import List

class HTMLLoader:
    """用于加载和处理 HTML 文件的加载器"""
    
    def __init__(self, chunk_size: int = 1000, chunk_overlap: int = 100):
        """
        初始化 HTML 加载器
        
        参数:
            chunk_size: 每个文本块的最大字符数
            chunk_overlap: 相邻块之间的重叠字符数
        """
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        
    def load(self, file_path: str) -> List[str]:
        """
        加载并处理 HTML 文件
        
        参数:
            file_path: HTML 文件的路径
            
        返回:
            分块后的文本列表
        """
        # 检查文件是否存在
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"文件不存在: {file_path}")
            
        # 读取文件内容
        with open(file_path, 'r', encoding='utf-8') as f:
            html_content = f.read()
            
        # 使用 BeautifulSoup 解析 HTML
        soup = BeautifulSoup(html_content, 'html.parser')
        
        # 提取纯文本内容
        # 移除 script 和 style 元素
        for script_or_style in soup(['script', 'style']):
            script_or_style.extract()
            
        # 获取所有文本
        text = soup.get_text()
        
        # 清理文本（删除多余空格和空行）
        cleaned_text = re.sub(r'\s+', ' ', text).strip()
        
        # 分割成段落
        paragraphs = re.split(r'\n{2,}', cleaned_text)
        paragraphs = [p.strip() for p in paragraphs if p.strip()]
        
        # 将段落组合成块
        chunks = []
        current_chunk = ""
        
        for paragraph in paragraphs:
            # 如果当前块加上新段落超出最大尺寸，将当前块添加到结果中
            if len(current_chunk) + len(paragraph) > self.chunk_size:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                    # 保留一部分重叠内容
                    words = current_chunk.split()
                    if len(words) > self.chunk_overlap // 5:  # 假设平均每个词5个字符
                        current_chunk = " ".join(words[-(self.chunk_overlap // 5):])
                    else:
                        current_chunk = ""
                
                # 处理非常长的段落
                if len(paragraph) > self.chunk_size:
                    # 分割长段落
                    words = paragraph.split()
                    temp_chunk = ""
                    for word in words:
                        if len(temp_chunk) + len(word) + 1 > self.chunk_size:
                            chunks.append(temp_chunk.strip())
                            temp_chunk = word
                        else:
                            temp_chunk += " " + word if temp_chunk else word
                    
                    if temp_chunk:
                        current_chunk += " " + temp_chunk if current_chunk else temp_chunk
                else:
                    current_chunk += " " + paragraph if current_chunk else paragraph
            else:
                current_chunk += " " + paragraph if current_chunk else paragraph
        
        # 添加最后一个块
        if current_chunk.strip():
            chunks.append(current_chunk.strip())
            
        # 提取链接（可选，添加到元数据）
        links = []
        for link in soup.find_all('a'):
            href = link.get('href')
            text = link.get_text().strip()
            if href and text:
                links.append(f"{text} ({href})")
                
        # 如果有链接信息，可以添加到最后一个块
        if links and chunks:
            links_text = "\n相关链接:\n" + "\n".join(links[:10])  # 限制链接数量
            # 如果最后一个块加上链接不会太长，则添加链接
            if len(chunks[-1]) + len(links_text) <= self.chunk_size:
                chunks[-1] += links_text
            else:
                # 否则创建新块存放链接
                chunks.append(f"文档中的重要链接:\n{links_text}")
        
        return chunks
        
    def _extract_metadata(self, soup: BeautifulSoup) -> dict:
        """提取 HTML 页面的元数据（标题、描述等）"""
        metadata = {}
        
        # 获取标题
        title_tag = soup.find('title')
        if title_tag:
            metadata['title'] = title_tag.get_text().strip()
        
        # 获取元描述
        meta_desc = soup.find('meta', attrs={'name': 'description'})
        if meta_desc and meta_desc.get('content'):
            metadata['description'] = meta_desc.get('content').strip()
            
        # 获取其他元标签
        for meta in soup.find_all('meta'):
            name = meta.get('name') or meta.get('property')
            content = meta.get('content')
            if name and content:
                metadata[name] = content
                
        return metadata

if __name__ == "__main__":
    # 测试代码
    loader = HTMLLoader()
    try:
        chunks = loader.load("data/documents/data.html")
        print(f"成功加载 HTML 文件并分成 {len(chunks)} 个文本块")
        for i, chunk in enumerate(chunks[:2]):  # 只打印前两个块进行预览
            print(f"\n--- 块 {i+1} {'='*30}")
            # print(chunk)
            print(chunk[:200] + "..." if len(chunk) > 200 else chunk)
    except Exception as e:
        print(f"加载 HTML 文件时出错: {e}") 