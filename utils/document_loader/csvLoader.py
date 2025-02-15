import csv

class CSVLoader:
    def __init__(self):
        pass
    def load(self,file_path):
        documents = []
        with open(file_path, mode='r', encoding='utf-8') as file:
            csv_reader = csv.DictReader(file)
            for row in csv_reader:
                documents.append(row)
        return documents