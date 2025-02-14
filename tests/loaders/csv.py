from utils.rag.document_loader.csvLoader import CSVLoader
from utils.rag.rag import Rag
loader = CSVLoader()

file_path = 'data/documents/data.csv'

data = loader.load(file_path)

print(data)