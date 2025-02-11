from docx import Document

class DocxLoader:
    def __init__(self,file_path):
        self.file_path = file_path
        doc = Document(self.file_path)
        # for para in doc.paragraphs:
        #     print(para.text)
        return doc.paragraphs
        pass
    