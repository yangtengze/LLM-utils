from pdfminer.high_level import extract_pages
from pdfminer.layout import LTTextContainer
from typing import List, Tuple

class PDFLoader1:
    def __init__(self):
        pass

    def load(self, file_path: str, page_numbers: List[int] = None, 
             min_line_length: int = 1, join_hyphenated: bool = True) -> Tuple[List[str], List[str]]:
        """
        加载并解析PDF文档
        
        参数:
            file_path: PDF文件路径
            page_numbers: 需要加载的页码列表（从0开始）
            min_line_length: 被视为有效行的最小长度
            join_hyphenated: 是否自动连接被连字符分隔的单词
            
        返回:
            (lines, paragraphs) 元组：
                lines - 原始文本行列表
                paragraphs - 合并后的段落列表
        """
        raw_lines = self._extract_lines(file_path, page_numbers)
        cleaned_lines = self._clean_lines(raw_lines, min_line_length)
        paragraphs = self._merge_paragraphs(cleaned_lines, join_hyphenated)
        return cleaned_lines, paragraphs

    def _extract_lines(self, file_path: str, page_numbers: List[int]) -> List[str]:
        """提取原始文本行"""
        raw_text = []
        for page_num, page_layout in enumerate(extract_pages(file_path)):
            if page_numbers is not None and page_num not in page_numbers:
                continue
            for element in page_layout:
                if isinstance(element, LTTextContainer):
                    raw_text.append(element.get_text())
        return ''.join(raw_text).split('\n')

    def _clean_lines(self, lines: List[str], min_len: int) -> List[str]:
        """清洗和过滤文本行"""
        processed = []
        for line in lines:
            # 清理前后空白并替换非常规空格
            cleaned = line.strip().replace('\x0c', ' ')  # 替换换页符
            cleaned = ' '.join(cleaned.split())  # 合并多个空白
            
            if len(cleaned) >= min_len:
                processed.append(cleaned)
        return processed

    def _merge_paragraphs(self, lines: List[str], join_hyphenated: bool) -> List[str]:
        """合并文本行为段落"""
        paragraphs = []
        buffer = ''
        
        for i, line in enumerate(lines):
            if not line:  # 处理空行作为段落分隔符
                if buffer:
                    paragraphs.append(buffer)
                    buffer = ''
                continue
            
            # 处理连字符连接
            if join_hyphenated and buffer.endswith('-'):
                buffer = buffer[:-1] + line
                continue
                
            # 检查下一行是否是当前行的延续
            if self._is_continuation(line, lines, i, join_hyphenated):
                buffer += ' ' + line if buffer else line
            else:
                if buffer:
                    paragraphs.append(buffer)
                buffer = line
        
        if buffer:
            paragraphs.append(buffer)
        return paragraphs

    def _is_continuation(self, current_line: str, lines: List[str], 
                        current_index: int, join_hyphenated: bool) -> bool:
        """判断当前行是否是上一行的延续"""
        if current_index == 0:
            return False
        
        prev_line = lines[current_index - 1]
        
        # 以连字符结尾的行需要连接
        if join_hyphenated and prev_line.endswith('-'):
            return True
        
        # 当前行以小写字母开头（可能为前一句的延续）
        if current_line and current_line[0].islower():
            return True
            
        # 前一行没有句子结束符号
        end_chars = {'.', '?', '!', '。', '！', '？', '"', "'", '”'}
        if prev_line and prev_line[-1] not in end_chars:
            return True
            
        return False



from pdfminer.high_level import extract_pages
from pdfminer.layout import LTTextContainer

class PDFLoader:
    def __init__(self):
        pass
    def load(self,file_path,page_numbers=None, min_line_length=1):
        paragraphs = []
        buffer = ''
        full_text = ''
        for i, page_layout in enumerate(extract_pages(file_path)):
            if page_numbers is not None and i not in page_numbers:
                continue
            for element in page_layout:
                if isinstance(element, LTTextContainer):
                    full_text += element.get_text() + '\n'
        lines = full_text.split('\n')
        for text in lines:
            if len(text) >= min_line_length:
                buffer += (' '+text) if not text.endswith('-') else text.strip('-')
            elif buffer:
                paragraphs.append(buffer)
                buffer = ''
        if buffer:
            paragraphs.append(buffer)
        return paragraphs