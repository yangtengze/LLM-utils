import re
from bs4 import BeautifulSoup
import os
import io
import requests
from pathlib import Path
from PIL import Image
import numpy as np
from typing import List, Dict, Optional
from utils.ppstructure_manager import get_ppstructure_engine
from utils.load_config import configs

class HTMLLoader:
    """用于加载和处理 HTML 文件的加载器"""
    
    def __init__(self):
        """
        初始化 HTML 加载器
        
        参数:
            chunk_size: 每个文本块的最大字符数
            chunk_overlap: 相邻块之间的重叠字符数
        """
        self.config = configs
        self.chunk_size = self.config['rag']['document_loader']['chunk_size']
        self.chunk_overlap = self.config['rag']['document_loader']['chunk_overlap']
        self.ppstructure_engine = get_ppstructure_engine()

        
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
        
        # 提取纯文本内容和处理图片
        text = self._extract_content(soup, file_path)

        chunks = self._split_text(text)
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
    
    def _extract_content(self, soup: BeautifulSoup, file_path: str) -> str:
        """
        从HTML提取文本内容，并处理图片，保持原始内容顺序
        :param soup: BeautifulSoup对象
        :param file_path: HTML文件路径
        :return: 提取的文本，包括图片处理结果
        """
        # 移除script和style元素
        for script_or_style in soup(['script', 'style']):
            script_or_style.extract()
        
        # 获取基本文本和图片，按顺序处理
        content_items = []
        img_index = 0
        base_dir = os.path.dirname(file_path)
        
        # 找到主体内容容器
        body = soup.body if soup.body else soup
        
        # 按顺序处理所有元素
        for element in body.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div', 'li', 'img', 'figure', 'figcaption', 'span']):
            # 处理图片元素
            if element.name == 'img':
                if self.ppstructure_engine is not None:
                    img_src = element.get('src')
                    alt_text = element.get('alt', '')
                    
            # figure:https://picx.zhimg.com/50/v2-47544172fd5acc7f06fdb9e744250151_720w.jpg?source=1def8aca
            # https://picx.zhimg.com/50/v2-47544172fd5acc7f06fdb9e744250151_720w.jpg?source=1def8aca
            # https://picx.zhimg.com/80/v2-47544172fd5acc7f06fdb9e744250151_720w.webp?source=1def8aca

                    # if img_src:
                    #     img_content = self._process_image(img_src, alt_text, img_index, base_dir)
                    #     if img_content:
                    #         content_items.append(img_content)
                    #     img_index += 1
            # 处理figure中的图片
            elif element.name == 'figure':
                # 尝试从figure中提取图片
                img = element.find('img')
                figcaption = element.find('figcaption')
                
                if img and self.ppstructure_engine is not None:
                    img_src = img.get('src')
                    # 使用figcaption作为alt_text如果存在
                    alt_text = figcaption.get_text().strip() if figcaption else img.get('alt', '')
                    
                    if img_src:
                        img_content = self._process_image(img_src, alt_text, img_index, base_dir)
                        if img_content:
                            content_items.append(img_content)
                        img_index += 1
            # 跳过单独的figcaption，因为已在figure中处理
            elif element.name == 'figcaption':
                continue
            # 处理文本元素
            else:
                # 检查元素是否包含图片但不是img标签本身
                if element.name != 'img' and element.find('img'):
                    # 已经在单独的img处理中处理过，跳过
                    pass
                else:
                    # 处理纯文本元素
                    text = element.get_text().strip()
                    if text and not any(text in item for item in content_items):  # 避免重复内容
                        content_items.append(text)
        
        return '\n\n'.join(content_items)
        
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
    
    def _process_image(self, img_src: str, alt_text: str, img_index: int, base_dir: str) -> Optional[str]:
        """
        处理HTML中的图片
        :param img_src: 图片源URL
        :param alt_text: 图片的alt文本
        :param img_index: 图片索引
        :param base_dir: HTML文件所在目录
        :return: 处理后的图片文本
        """
        try:
            # 获取图片数据
            img_bytes = None
            
            # 处理不同类型的图片路径
            if img_src.startswith(('http://', 'https://')):
                # 网络图片
                response = requests.get(img_src, timeout=10)
                if response.status_code == 200:
                    img_bytes = response.content
            else:
                # 本地图片
                img_path = img_src
                if not os.path.isabs(img_path):
                    img_path = os.path.join(base_dir, img_path)
                
                if os.path.exists(img_path):
                    with open(img_path, 'rb') as f:
                        img_bytes = f.read()
            
            if img_bytes is None:
                return f"[图片: {alt_text or f'图片{img_index+1}'}] [无法获取图片数据]"
            
            # 使用PIL打开图片
            pil_image = Image.open(io.BytesIO(img_bytes))
            width, height = pil_image.size
            
            # 转换为numpy数组供OCR处理
            image_array = np.array(pil_image)
            
            # 使用OCR进行识别
            result = self.ppstructure_engine(image_array)
            
            # 处理识别结果
            img_content = []
            for item in result:
                if item.get('type') == 'table':
                    # 处理表格
                    img_content.append(f"{item['res'].get('html', '')}")
                else:
                    # 处理文本
                    text_content = ""
                    for content in item.get('res', []):
                        if isinstance(content, dict) and 'text' in content:
                            text_content += content["text"] + " "
                    if text_content:
                        img_content.append(f"{text_content}")
            
            # 添加图片信息
            img_description = alt_text if alt_text else f"图片{img_index+1}"
            img_info = f"[图片: {img_description} (尺寸: {width}x{height})]"
            
            if img_content:
                return f"{img_info}\n" + "\n".join(img_content) + "[图片结束]"
            else:
                return f"{img_info} [未能识别图片中的文本内容]"
            
        except Exception as e:
            print(f"处理HTML图片时出错 (图片 {img_index+1}): {str(e)}")
            return f"[图片: {alt_text or f'图片{img_index+1}'}] [处理图片时出错: {str(e)}]"

    def _split_text(self, text: str) -> List[str]:
        """
        将文本分割成块，确保块之间有正确的重叠
        :param text: 输入文本
        :return: 文本块列表
        """
        # 按句子分割
        sentences = re.split(r'([。！？.!?])', text)
        sentences = [''.join(i) for i in zip(sentences[0::2], sentences[1::2] + [''])]
        sentences = [s for s in sentences if s.strip()]  # 过滤空句子
        
        chunks = []
        current_chunk = ""
        last_sentences = []  # 存储最近的句子用于重叠
        
        for sentence in sentences:
            # 将句子添加到当前块
            if len(current_chunk) + len(sentence) <= self.chunk_size:
                current_chunk += sentence
                last_sentences.append(sentence)
                
                # 保持last_sentences只包含足够用于重叠的句子
                while len(''.join(last_sentences)) > self.chunk_overlap * 2:
                    last_sentences.pop(0)
            else:
                # 当前块已满，保存它
                if current_chunk:
                    chunks.append(current_chunk.strip())
                
                # 创建新块，包含重叠部分
                overlap_text = ""
                if self.chunk_overlap > 0:
                    # 从last_sentences中构建重叠文本
                    temp_overlap = ""
                    for s in reversed(last_sentences):
                        if len(temp_overlap) + len(s) <= self.chunk_overlap:
                            temp_overlap = s + temp_overlap
                        else:
                            break
                    overlap_text = temp_overlap
                
                # 新块以重叠文本开始
                current_chunk = overlap_text + sentence
                
                # 重置last_sentences为当前重叠文本加新句子
                last_sentences = [overlap_text, sentence] if overlap_text else [sentence]
        
        # 添加最后一个块
        if current_chunk:
            chunks.append(current_chunk.strip())
        
        return chunks

if __name__ == "__main__":
    loader = HTMLLoader()
    chunks = loader.load("data/documents/data.html")
    # for i, chunk in enumerate(chunks):
    #     print(f"\n--- 块 {i+1} {'='*30}")
    #     print(chunk)
        # print(chunk[:200] + "..." if len(chunk) > 200 else chunk)