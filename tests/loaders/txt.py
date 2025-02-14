from utils.document_loader.txtLoader import TXTLoader

file_path = 'data/documents/test.txt'

loader = TXTLoader()

data = loader.load(file_path)

# print(data)
for item in data:
    print('line start')
    print(item)
print(len(data))