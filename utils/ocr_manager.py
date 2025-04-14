"""
OCR 引擎管理模块
"""
from paddleocr import PaddleOCR

# 全局 OCR 引擎实例
ocr_engine = None

def initialize_ocr():
    """初始化 OCR 引擎"""
    global ocr_engine
    if ocr_engine is None:
        print("正在初始化 OCR 引擎...")
        ocr_engine = PaddleOCR(lang='ch',show_log=False)
        print("OCR 引擎初始化完成")
    return ocr_engine

def get_ocr_engine():
    """获取 OCR 引擎实例"""
    global ocr_engine
    if ocr_engine is None:
        return initialize_ocr()
    return ocr_engine 