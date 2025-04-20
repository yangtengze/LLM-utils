"""
PPStructure 引擎管理模块
"""
from paddleocr import PPStructure,draw_structure_result,save_structure_res

# 全局 OCR 引擎实例
table_engine = None

def initialize_ppstructure():
    """初始化 PPStructure 引擎"""
    global table_engine
    if table_engine is None:
        print("正在初始化 PPStructure 引擎...")
        table_engine = PPStructure(lang='ch',show_log=False)

        print("PPStructure 引擎初始化完成")
    return table_engine

def get_ppstructure_engine():
    """获取 PPStructure 引擎实例"""
    global table_engine
    if table_engine is None:
        return initialize_ppstructure()
    return table_engine 