import re
import yaml
from pathlib import Path
from typing import Dict, List
import markdown
from bs4 import BeautifulSoup
from utils.load_config import configs

class MDLoader:
    """
    用于加载 Markdown 文件的类
    支持标准 Markdown 语法，包括标题、列表、代码块等
    """
    
    def __init__(self):
        """初始化 MDLoader"""
        self.config = configs
        self.chunk_size = self.config['rag']['document_loader']['chunk_size']
        self.chunk_overlap = self.config['rag']['document_loader']['chunk_overlap']
        self.file_path = None
        self.raw_content = ""          # 原始文本内容
        self.metadata: Dict = {}       # Front Matter 元数据
        self.content = ""              # 去除了 Front Matter 的正文
        self.titles: List[Dict] = []   # 标题列表 {level: int, text: str}
        self.links: List[Dict] = []    # 链接列表 {text: str, url: str}
        self.images: List[Dict] = []   # 图片列表 {alt: str, url: str}

    def load(self, file_path: str) -> List[str]:
        """
        加载并分块 Markdown 文件
        :param file_path: Markdown 文件路径
        :return: 文本块列表
        """
        self.file_path = file_path
        if not Path(file_path).exists():
            raise FileNotFoundError(f"Markdown 文件不存在: {file_path}")
        
        with open(file_path, 'r', encoding='utf-8') as f:
            self.raw_content = f.read()
        
        self._parse_front_matter()
        self._extract_titles()
        self._extract_links()
        self._extract_images()

        text = self._extract_text(file_path)
        chunks = self._split_text(text)
        return chunks

    def _parse_front_matter(self) -> None:
        """解析 Front Matter 元数据（YAML格式）"""
        front_matter_pattern = r'^---\n(.*?)\n---\n(.*)'
        match = re.search(front_matter_pattern, self.raw_content, re.DOTALL)
        
        if match:
            yaml_content, self.content = match.groups()
            try:
                self.metadata = yaml.safe_load(yaml_content) or {}
            except yaml.YAMLError as e:
                print(f"Front Matter 解析错误: {str(e)}")
                self.metadata = {}
        else:
            self.content = self.raw_content

    def _extract_titles(self) -> None:
        """提取所有标题（h1-h6）"""
        title_pattern = r'^(#{1,6})\s+(.*)'
        for line in self.content.split('\n'):
            match = re.match(title_pattern, line)
            if match:
                level = len(match.group(1))
                text = match.group(2).strip()
                self.titles.append({"level": level, "text": text})

    def _extract_md_elements(self, pattern: str) -> List[Dict]:
        """通用方法：提取 Markdown 元素（链接/图片）"""
        elements = []
        for match in re.finditer(pattern, self.content):
            groups = match.groups()
            if '![' in match.group(0):  # 图片
                elements.append({"alt": groups[0], "url": groups[1]})
            else:  # 链接
                elements.append({"text": groups[0], "url": groups[1]})
        return elements

    def _extract_links(self) -> None:
        """提取所有链接"""
        link_pattern = r'\[(.*?)\]\((.*?)\)'
        self.links = [
            elem for elem in self._extract_md_elements(link_pattern) 
            if 'alt' not in elem
        ]

    def _extract_images(self) -> None:
        """提取所有图片"""
        img_pattern = r'!\[(.*?)\]\((.*?)\)'
        self.images = self._extract_md_elements(img_pattern)

    def to_html(self) -> str:
        """转换为 HTML（需安装 markdown 库）"""
        try:
            return markdown.markdown(self.content)
        except ImportError:
            raise ImportError("请先安装 markdown 库：pip install markdown")

    def summary(self) -> Dict:
        """获取文件摘要信息"""
        return {
            "file_path": self.file_path,
            "metadata": self.metadata,
            "titles": [t["text"] for t in self.titles],
            "link_count": len(self.links),
            "image_count": len(self.images)
        }

    def _extract_text(self, file_path: str) -> str:
        """
        从 Markdown 提取文本，保持原始格式
        :param file_path: Markdown 文件路径
        :return: 提取的文本
        """
        # 直接使用原始内容，保留格式
        return self.raw_content

    def _split_text(self, text: str) -> List[str]:
        """
        将文本分割成块，尝试在语义边界处分割
        :param text: 输入文本
        :return: 文本块列表
        """
        chunks = []
        lines = text.split('\n')
        current_chunk = ""
        current_size = 0
        
        i = 0
        while i < len(lines):
            line = lines[i]
            line_with_newline = line + '\n'
            line_size = len(line_with_newline)
            
            # 如果当前行是标题，并且当前块不为空，先保存当前块
            if line.startswith('#') and current_chunk.strip():
                chunks.append(current_chunk.strip())
                current_chunk = ""
                current_size = 0
            
            # 尝试添加当前行到当前块
            if current_size + line_size <= self.chunk_size:
                current_chunk += line_with_newline
                current_size += line_size
                i += 1
            else:
                # 如果当前行太长，无法添加到当前块
                if current_chunk.strip():
                    # 保存当前块
                    chunks.append(current_chunk.strip())
                    
                    # 计算重叠部分
                    if self.chunk_overlap > 0:
                        # 找到最后n行作为重叠
                        overlap_lines = current_chunk.split('\n')
                        # 取最后几行但不超过当前块的行数
                        overlap_count = min(3, len(overlap_lines))  # 使用固定的3行作为重叠
                        current_chunk = '\n'.join(overlap_lines[-overlap_count:]) + '\n' if overlap_count > 0 else ""
                        current_size = len(current_chunk)
                    else:
                        current_chunk = ""
                        current_size = 0
                else:
                    # 如果一行太长，强制分割
                    chunks.append(line.strip())
                    current_chunk = ""
                    current_size = 0
                    i += 1
        
        # 添加最后一个块
        if current_chunk.strip():
            chunks.append(current_chunk.strip())
        
        return chunks

if __name__ == '__main__':
    loader = MDLoader()
    filepath = 'data/documents/README.md'
    chunks = loader.load(filepath)
    for i, chunk in enumerate(chunks):
        # if i == 1:  
        print(f"Chunk {i + 1}:\n{chunk}\n")