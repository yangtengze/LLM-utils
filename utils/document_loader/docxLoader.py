from docx import Document
from typing import List, Union
import re
import os
import io
import numpy as np
from utils.load_config import configs
from utils.ocr_manager import get_ocr_engine
from PIL import Image

class DocxLoader:
    """
    用于加载.docx文件的类，包括段落、表格和图片内容
    """

    def __init__(self):
        """
        初始化 DocxLoader
        """
        self.config = configs
        self.chunk_size = self.config['rag']['document_loader']['chunk_size']
        self.chunk_overlap = self.config['rag']['document_loader']['chunk_overlap']
        # 使用共享的OCR引擎
        self.ocr_engine = get_ocr_engine()

    def load(self, file_path: str) -> List[str]:
        """
        加载并分块 docx 文件
        :param file_path: 文件路径
        :return: 文本块列表
        """
        try:
            doc = Document(file_path)
            data = []  # 存储解析出的内容

            # 使用 XML 解析提取内容
            for element in doc.element.body:
                if element.tag.endswith('p'):  # 段落
                    para = element.xpath('./w:r/w:t/text()')
                    para_text = ''.join(para).strip()
                    
                    # 检查段落中是否有图片 - 使用新的图片查找方法
                    images = element.xpath('.//pic:pic')
                    
                    if para_text:
                        data.append(para_text)
                    
                    # 处理图片
                    if images:
                        for img_idx, img in enumerate(images):
                            img_data = self._process_image_new(doc, img, img_idx)
                            if img_data:
                                data.append(img_data)
                    
                elif element.tag.endswith('tbl'):  # 表格
                    table = []
                    for row in element.xpath('.//w:tr'):
                        row_data = []
                        for cell in row.xpath('.//w:tc'):
                            cell_text = ''.join(cell.xpath('.//w:p/w:r/w:t/text()')).strip()
                            
                            # 检查单元格中是否有图片 - 使用新的图片查找方法
                            cell_images = cell.xpath('.//pic:pic')
                            
                            row_data.append(cell_text)
                            
                            # 处理单元格中的图片
                            if cell_images:
                                for cell_img_idx, cell_img in enumerate(cell_images):
                                    img_data = self._process_image_new(doc, cell_img, cell_img_idx, "表格单元格")
                                    if img_data:
                                        data.append(img_data)
                        
                        table.append(row_data)
                    data.append(table)

            # 将数据转换为文本
            text = self._convert_to_text(data)
            
            # 分块
            chunks = self._split_text(text)
            return chunks
        except Exception as e:
            print(f"处理文件 {file_path} 失败: {str(e)}")
            # 如果处理失败，返回空列表而不是让整个过程失败
            return []

    def _process_image_new(self, doc, img_element, img_index, location="文档"):
        """
        使用新方法处理Word文档中的图片
        :param doc: 文档对象
        :param img_element: 图片元素
        :param img_index: 图片索引
        :param location: 图片所在位置描述
        :return: 处理后的图片数据（OCR文本）
        """
        try:
            # 使用新的XPath查询获取图片ID
            embed_elements = img_element.xpath('.//a:blip/@r:embed')
            
            if not embed_elements:
                return None
                
            img_id = embed_elements[0]
            
            # 通过关系ID获取图片数据
            try:
                img_part = doc.part.related_parts[img_id]
                img_bytes = img_part.blob
            except KeyError:
                # 如果找不到关系ID对应的部分，尝试使用旧方法
                return None
            result = self.ocr_engine.ocr(img_bytes, cls=False)
            # print(result)
            img_content = ''
            for idx in range(len(result)):
                res = result[idx]
                for line in res:
                    img_content += (f'{line[1][0]}') + '\n'


            # # 使用PIL打开图片
            pil_image = Image.open(io.BytesIO(img_bytes))
            width, height = pil_image.size
            
            # print(f"处理图片: 位于{location}的第{img_index+1}张图片 (尺寸: {width}x{height})")
            
            # # 转换为numpy数组供OCR处理
            # image_array = np.array(pil_image)
            
            # # 使用OCR进行识别
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
                return f"{img_info}\n" + img_content
            else:
                return f"{img_info} [未能识别图片中的文本内容]"
            
        except Exception as e:
            print(f"处理DOCX图片时出错 (图片 {img_index+1}): {str(e)}")
            return f"[图片内容] [处理图片时出错: {str(e)}]"

    def _convert_to_text(self, data: List[Union[str, List[List[str]]]]) -> str:
        """
        将解析的数据转换为文本
        :param data: 解析出的数据
        :return: 转换后的文本
        """
        text = ""
        for item in data:
            if isinstance(item, str):  # 段落或图片内容
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
    filepath = 'data/documents/实验四3 建模.docx'
    chunks = loader.load(filepath)
    for i, chunk in enumerate(chunks):
        print(f"Chunk {i + 1}: {(chunk)}")
