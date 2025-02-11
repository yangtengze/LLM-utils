import re

class TXTLoader:
    def __init__(self,file_path):
        self.file_path = file_path

        with open(self.file_path,'r') as f:
            data = f.read()
        format_data = re.split(r'\\n',data)
        return format_data
        pass