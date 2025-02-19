import re
import yaml
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import markdown
from bs4 import BeautifulSoup

def load_config(config_name: str):
    config_path = Path("configs") / f"{config_name}.yaml"
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)

class MDLoader:
    """
    用于加载 Markdown 文件的类
    支持标准 Markdown 语法，包括标题、列表、代码块等
    """
    
    def __init__(self):
        """初始化 MDLoader"""
        self.config = load_config('configs')
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
        从 Markdown 提取文本
        :param file_path: Markdown 文件路径
        :return: 提取的文本
        """
        try:
            # 将 Markdown 转换为 HTML
            html = markdown.markdown(self.raw_content, extensions=['tables', 'fenced_code'])
            
            # 使用 BeautifulSoup 解析 HTML
            soup = BeautifulSoup(html, 'html.parser')
            
            # 提取并格式化文本
            text = ""
            for element in soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'pre', 'ul', 'ol', 'table']):
                if element.name.startswith('h'):
                    # 处理标题
                    level = int(element.name[1])
                    text += '#' * level + ' ' + element.get_text().strip() + '\n\n'
                elif element.name == 'p':
                    # 处理段落
                    text += element.get_text().strip() + '\n\n'
                elif element.name == 'pre':
                    # 处理代码块
                    text += '```\n' + element.get_text().strip() + '\n```\n\n'
                elif element.name in ['ul', 'ol']:
                    # 处理列表
                    for li in element.find_all('li'):
                        text += '- ' + li.get_text().strip() + '\n'
                    text += '\n'
                elif element.name == 'table':
                    # 处理表格
                    rows = []
                    for tr in element.find_all('tr'):
                        cells = [td.get_text().strip() for td in tr.find_all(['th', 'td'])]
                        rows.append(' | '.join(cells))
                    text += '\n'.join(rows) + '\n\n'

            return text.strip()
            
        except Exception as e:
            print(f"处理 Markdown 文件时出错: {str(e)}")
            return ""

    def _split_text(self, text: str) -> List[str]:
        """
        将文本分割成块
        :param text: 输入文本
        :return: 文本块列表
        """
        # 按句子分割，同时保持标题结构
        chunks = []
        current_chunk = ""
        current_section = ""
        
        # 按行分割，保持段落结构
        lines = text.split('\n')
        
        for line in lines:
            # 检查是否是标题行
            if line.startswith('#'):
                # 如果有未处理的内容，先保存
                if current_chunk:
                    chunks.append(current_chunk.strip())
                    current_chunk = ""
                current_section = line + '\n'
                continue
                
            # 将当前行添加到当前块
            new_content = current_section + line + '\n' if line.strip() else '\n'
            
            if len(current_chunk) + len(new_content) <= self.chunk_size:
                current_chunk += new_content
            else:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                
                # 开始新的块，包含上一个块的结尾部分和当前部分
                if len(current_chunk) > self.chunk_overlap:
                    current_chunk = current_chunk[-self.chunk_overlap:] + new_content
                else:
                    current_chunk = current_section + new_content
        
        # 添加最后一个块
        if current_chunk:
            chunks.append(current_chunk.strip())
        
        return chunks

if __name__ == '__main__':
    loader = MDLoader()
    filepath = 'data/tmp/README.md'
    chunks = loader.load(filepath)
    for i, chunk in enumerate(chunks):
        # if i == 0:  # 只打印第二个块作为示例
        print(f"Chunk {i + 1}:\n{chunk}\n")