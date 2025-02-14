import re
import numpy as np
class TXTLoader:
    def __init__(self):
        pass
    def load(self,file_path):
        with open(file_path,'r',encoding='utf-8') as f:
            data = f.read()
        format_data = re.split(r'\n{2,}', data)
        return np.array(format_data)