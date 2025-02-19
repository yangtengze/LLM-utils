from docx import Document
import yaml
from pathlib import Path
from typing import List, Union
import re

def load_config(config_name: str):
    config_path = Path("configs") / f"{config_name}.yaml"
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)
    
class DocxLoader:
    """
    用于加载.docx文件的类，包括段落和表格内容
    """

    def __init__(self):
        """
        初始化 DocxLoader
        """
        self.config = load_config('configs')
        self.chunk_size = self.config['rag']['document_loader']['chunk_size']
        self.chunk_overlap = self.config['rag']['document_loader']['chunk_overlap']

    def load(self, file_path: str) -> List[str]:
        """
        加载并分块 docx 文件
        :param file_path: 文件路径
        :return: 文本块列表
        """
        doc = Document(file_path)
        data = []  # 存储解析出的内容

        # 使用 XML 解析提取内容
        for element in doc.element.body:
            if element.tag.endswith('p'):  # 段落
                para = element.xpath('./w:r/w:t/text()')
                para_text = ''.join(para).strip()
                if para_text:
                    data.append(para_text)
            elif element.tag.endswith('tbl'):  # 表格
                table = []
                for row in element.xpath('.//w:tr'):
                    row_data = []
                    for cell in row.xpath('.//w:tc'):
                        cell_text = ''.join(cell.xpath('.//w:p/w:r/w:t/text()')).strip()
                        row_data.append(cell_text)
                    table.append(row_data)
                data.append(table)

        # 将数据转换为文本
        text = self._convert_to_text(data)
        
        # 分块
        chunks = self._split_text(text)
        return chunks

    def _convert_to_text(self, data: List[Union[str, List[List[str]]]]) -> str:
        """
        将解析的数据转换为文本
        :param data: 解析出的数据
        :return: 转换后的文本
        """
        text = ""
        for item in data:
            if isinstance(item, str):  # 段落
                text += item + "\n\n"
            elif isinstance(item, list):  # 表格
                table_text = []
                for row in item:
                    table_text.append(" | ".join(row))
                text += "\n".join(table_text) + "\n\n"
        return text

    def _split_text(self, text: str) -> List[str]:
        """
        将文本分割成块
        :param text: 输入文本
        :return: 文本块列表
        """
        # 按句子分割
        sentences = re.split(r'([。！？.!?])', text)
        sentences = [''.join(i) for i in zip(sentences[0::2], sentences[1::2] + [''])]
        
        chunks = []
        current_chunk = ""
        
        for sentence in sentences:
            # 如果当前块加上新句子不超过块大小，直接添加
            if len(current_chunk) + len(sentence) <= self.chunk_size:
                current_chunk += sentence
            else:
                # 保存当前块
                if current_chunk:
                    chunks.append(current_chunk.strip())
                
                # 开始新的块，包含上一个块的结尾部分
                if len(current_chunk) > self.chunk_overlap:
                    current_chunk = current_chunk[-self.chunk_overlap:] + sentence
                else:
                    current_chunk = sentence
        
        # 添加最后一个块
        if current_chunk:
            chunks.append(current_chunk.strip())
        
        return chunks

if __name__ == '__main__':
    loader = DocxLoader()
    filepath = 'data/tmp/1.docx'
    chunks = loader.load(filepath)
    for i, chunk in enumerate(chunks):
        print(f"Chunk {i + 1}: {chunk}")
