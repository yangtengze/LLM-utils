import pandas as pd

class CSVLoader:
    def __init__(self):
        pass
    def load(self,file_path):
        data = pd.read_csv(file_path)
        return data.to_numpy()
    