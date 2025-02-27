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
    
if __name__ == "__main__":
    loader = CSVLoader()
    data = loader.load('data/documents/data.csv')
    print(data)