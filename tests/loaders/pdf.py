from utils.document_loader.pdfLoader import PDFLoader

file_path = 'data/documents/llama2.pdf'

loader = PDFLoader()

lines,paragraphs = loader.load(file_path,min_line_length=10)

print(paragraphs[1])