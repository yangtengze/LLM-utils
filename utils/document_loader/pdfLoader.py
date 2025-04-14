import fitz  # PyMuPDF
from typing import List
import re
import os
import tempfile
import numpy as np
import io
from utils.load_config import configs
from utils.ocr_manager import get_ocr_engine
from PIL import Image, ImageFile
from tqdm import tqdm
fitz.TOOLS.mupdf_display_errors(False)

class PDFLoader:
    """
    用于加载PDF文件的类
    使用 PyMuPDF 提取文本和图片，使用 PaddleOCR 分析图片内容
    """
    
    def __init__(self):
        """初始化 PDFLoader"""
        self.config = configs
        self.chunk_size = self.config['rag']['document_loader']['chunk_size']
        self.chunk_overlap = self.config['rag']['document_loader']['chunk_overlap']
        # 使用共享的 OCR 引擎而不是创建新实例
        self.ocr_engine = get_ocr_engine()

    def load(self, file_path: str) -> List[str]:
        """
        加载并分块PDF文件
        :param file_path: PDF文件路径
        :return: 文本块列表
        """
        text = self._extract_text_and_images(file_path)
        chunks = self._split_text(text)
        return chunks

    def _process_image(self, image_data, width=0, height=0, page_num=0, img_index=0):
        """
        处理图片数据并使用OCR提取文本内容
        
        :param image_data: 图片的二进制数据
        :param width: 图片宽度
        :param height: 图片高度
        :param page_num: 页码，用于日志
        :param img_index: 图片索引，用于日志
        :return: 提取的文本内容
        """
        try:
            # # 使用PaddleOCR进行识别
            result = self.ocr_engine.ocr(image_data, cls=False)
            # print(result)
            img_content = ''
            for idx in range(len(result)):
                res = result[idx]
                for line in res:
                    img_content += (f'{line[1][0]}') + '\n'

            # # 使用PPStructure进行识别
            # # print(f"处理图片: 第{page_num}页 第{img_index}张 (尺寸: {width}x{height})")
            # # 将图片字节数据转换为PIL Image对象
            # pil_image = Image.open(io.BytesIO(image_data))
            
            # # 可以选择保存图片用于调试
            # # pil_image.save(f'debug_image_page{page_num}_img{img_index}.jpeg')
            
            # # 转换为numpy数组供PaddleOCR处理
            # image_array = np.array(pil_image)
            
            # result = self.ocr_engine(image_array)
            
            # # 处理识别结果
            # img_content = []
            # for item in result:
            #     if item.get('type') == 'table':
            #         # 处理表格
            #         img_content.append(f"{item['res'].get('html', '')}")
            #     else:
            #         # 处理文本
            #         text_content = ""
            #         for content in item.get('res', []):
            #             if isinstance(content, dict) and 'text' in content:
            #                 text_content += content["text"] + " "
            #         if text_content:
            #             img_content.append(f"{text_content}")
            
            # 添加图片尺寸信息
            img_info = f"[图片内容 {width}x{height}]"
            
            if img_content:
                return f"{img_info}\n" + "\n".join(img_content)
            else:
                return f"{img_info} [未能识别图片中的文本内容]"
        
        except Exception as e:
            print(f"处理图片时出错 (页 {page_num}, 图片 {img_index}): {str(e)}")
            return f"[图片内容] [处理图片时出错: {str(e)}]"

    def _extract_text_and_images(self, file_path: str) -> str:
        """
        从PDF提取文本和图片内容，保持内容的原始顺序
        :param file_path: PDF文件路径
        :return: 提取的文本
        """
        text = ""
        try:
            # 打开PDF文件
            with fitz.open(file_path) as doc:
                # 显示处理PDF页面的进度条
                print(f"正在处理PDF文件: {os.path.basename(file_path)}")
                # 遍历每一页
                for page_num, page in tqdm(enumerate(doc), total=len(doc), desc="处理PDF页面"):
                    # 获取页面上的所有文本和图像引用
                    # 使用 "dict" 模式获取带有更多结构信息的文本
                    page_dict = page.get_text("dict")
                    blocks = page_dict["blocks"]
                    
                    
                    # 处理每个块（文本块或图片块）
                    for block_idx, block in enumerate(blocks):
                        block_type = block["type"]
                        # 处理文本块
                        if block_type == 0:  # 0 表示文本
                            block_text = ""
                            # 收集块中的所有文本
                            for line in block["lines"]:
                                for span in line["spans"]:
                                    block_text += span["text"] + " "
                        
                            block_text = block_text.strip()
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
                        
                        # 处理图片块
                        elif block_type == 1:  # 1 表示图片
                            try:
                                # 获取图片信息
                                img_index = block.get("number", 0)
                                width = block.get("width", 0)
                                height = block.get("height", 0)
                                
                                # 直接从块中获取图片数据
                                image_bytes = block.get("image")
                                
                                if image_bytes:  # 确保有图片数据
                                    # 处理图片
                                    img_text = self._process_image(
                                        image_bytes, 
                                        width, 
                                        height, 
                                        page_num + 1, 
                                        img_index
                                    )
                                    text += img_text + "\n\n"
                                else:
                                    # 尝试通过替代方法获取图片（如果有xref的情况）
                                    xref = block.get("xref", 0)
                                    if xref > 0:
                                        try:
                                            base_image = page.parent.extract_image(xref)
                                            if base_image:
                                                # 处理图片
                                                img_text = self._process_image(
                                                    base_image["image"], 
                                                    width, 
                                                    height, 
                                                    page_num + 1, 
                                                    img_index
                                                )
                                                text += img_text + "\n\n"
                                        except Exception as e:
                                            print(f"通过xref处理图片时出错: {str(e)}")
                                            text += f"[图片内容] [通过xref处理图片时出错: {str(e)}]\n\n"
                            
                            except Exception as e:
                                print(f"处理图片块时出错 (页 {page_num+1}): {str(e)}")
                                text += f"[图片内容] [处理图片块时出错: {str(e)}]\n\n"
                    
                    # 添加页面分隔符（可选）
                    if page_num < len(doc) - 1:
                        text += f"[第{page_num+1}页结束]\n\n"
                    
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
    filepath = 'data/documents/222.pdf'
    chunks = loader.load(filepath)
    for i, chunk in enumerate(chunks):
        # if i == 1:
        #     print(f"Chunk {i + 1}: {(chunk)}")
        print(f"Chunk {i + 1}: {(chunk)}")
        
