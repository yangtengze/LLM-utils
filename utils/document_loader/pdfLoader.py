import fitz  # PyMuPDF
from typing import List
import re
from utils.load_config import configs


class PDFLoader:
    """
    用于加载PDF文件的类
    使用 PyMuPDF 提供更快的处理速度和更好的文本提取
    """
    
    def __init__(self):
        """初始化 PDFLoader"""
        self.config = configs
        self.chunk_size = self.config['rag']['document_loader']['chunk_size']
        self.chunk_overlap = self.config['rag']['document_loader']['chunk_overlap']

    def load(self, file_path: str) -> List[str]:
        """
        加载并分块PDF文件
        :param file_path: PDF文件路径
        :return: 文本块列表
        """
        text = self._extract_text(file_path)
        chunks = self._split_text(text)
        return chunks

    def _extract_text(self, file_path: str) -> str:
        """
        从PDF提取文本
        :param file_path: PDF文件路径
        :return: 提取的文本
        """
        text = ""
        try:
            # 打开PDF文件
            with fitz.open(file_path) as doc:
                # 遍历每一页
                for page in doc:
                    # 获取页面的文本块
                    blocks = page.get_text("blocks")
                    # 按照垂直位置排序文本块
                    blocks.sort(key=lambda b: (b[1], b[0]))  # 按y坐标，然后x坐标排序
                    
                    # 提取并组织文本
                    for block in blocks:
                        block_text = block[4].strip()
                        if block_text:
                            # 检查是否是表格数据（通过检查制表符或多个空格）
                            if '\t' in block_text or '    ' in block_text:
                                # 处理表格数据
                                rows = block_text.split('\n')
                                formatted_rows = []
                                for row in rows:
                                    cells = [cell.strip() for cell in re.split(r'\t|    +', row)]
                                    formatted_rows.append(" | ".join(cells))
                                text += "\n".join(formatted_rows) + "\n\n"
                            else:
                                # 普通文本
                                text += block_text + "\n\n"
                                
        except Exception as e:
            print(f"处理PDF文件时出错: {str(e)}")
            return ""

        return text.strip()

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
    loader = PDFLoader()
    filepath = 'data/documents/llama2/llama2.pdf'
    chunks = loader.load(filepath)
    for i, chunk in enumerate(chunks):
        if i == 1:
            print(f"Chunk {i + 1}: {(chunk)}")
