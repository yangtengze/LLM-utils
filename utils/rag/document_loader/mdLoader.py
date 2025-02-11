import re
import yaml
from pathlib import Path
from typing import Dict, List, Optional, Tuple

class MDLoader:
    def __init__(self, file_path: Optional[str] = None):
        """
        Markdown 文件加载与解析工具
        功能：
        - 自动解析 Front Matter 元数据（YAML格式）
        - 提取标题结构（h1-h6）
        - 提取所有链接和图片
        - 支持内容预处理和格式转换
        """
        self.file_path = file_path
        self.raw_content = ""          # 原始文本内容
        self.metadata: Dict = {}       # Front Matter 元数据
        self.content = ""              # 去除了 Front Matter 的正文
        self.titles: List[Dict] = []   # 标题列表 {level: int, text: str}
        self.links: List[Dict] = []    # 链接列表 {text: str, url: str}
        self.images: List[Dict] = []   # 图片列表 {alt: str, url: str}

        if file_path:
            self.load(file_path)

    def load(self, file_path: str) -> None:
        """加载 Markdown 文件"""
        self.file_path = file_path
        if not Path(file_path).exists():
            raise FileNotFoundError(f"Markdown 文件不存在: {file_path}")
        
        with open(file_path, 'r', encoding='utf-8') as f:
            self.raw_content = f.read()
        
        self._parse_front_matter()
        self._extract_titles()
        self._extract_links()
        self._extract_images()

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
            import markdown
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

# 示例用法
if __name__ == "__main__":
    loader = MDLoader("example.md")
    
    print("元数据:", loader.metadata)
    print("主标题:", loader.titles[0]['text'] if loader.titles else None)
    print("第一个链接:", loader.links[0] if loader.links else None)
    
    print("\n摘要信息:")
    print(loader.summary())
    
    # print("\nHTML 转换:")
    # print(loader.to_html())