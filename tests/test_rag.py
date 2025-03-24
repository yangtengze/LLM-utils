from utils.rag import Rag

query = input(">>> 请输入问题：")

rag = Rag()
rag.load_documents(rag.files)
prompt = rag.generate_prompt(query=query)

print('>>> ' + prompt)