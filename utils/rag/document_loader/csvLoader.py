import pandas as pd

class CSVLoader:
    def __init__(self,file_path):
        self.file_path = file_path
        data = pd.read_csv(self.file_path)
        return data
        pass
    