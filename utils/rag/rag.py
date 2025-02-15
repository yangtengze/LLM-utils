from utils.document_loader import CSVLoader, MDLoader, PDFLoader, TXTLoader
from typing import List, Dict
import yaml
from pathlib import Path
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np
import requests
from tqdm import tqdm
from FlagEmbedding import FlagModel
import numpy as np
import json

class Rag:
    def __init__(self):
        """
        初始化 RAG 模型
        - 支持多种文档加载器
        - 使用 TF-IDF 向量化器进行文档检索
        """
        self.docs: List[str] = []  # 存储加载的文档内容
        self.config = self.load_config("configs")
        self.deivce = self.config['rag']['embedding_model']['device']
        self.embedding_model = FlagModel(self.config['rag']['embedding_model']['name'], 
                  query_instruction_for_retrieval="为这个句子生成表示以用于检索相关文章：",
                  use_fp16=True,devices=self.deivce)
        # self.reranker_model = 
        self.doc_vectors: np.ndarray = None  # 文档向量
    def load_config(self,config_name: str):
        config_path = Path("configs") / f"{config_name}.yaml"
        with open(config_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f)
        
    def load_documents(self, file_paths: List[str]) -> None:
        """
        加载多种格式的文档
        :param file_paths: 文件路径列表
        """
        with tqdm(file_paths, desc="📁 总体进度", position=0) as global_pbar:
            for file_path in global_pbar:
                global_pbar.set_postfix_str(f'正在处理：{Path(file_path).name}')
                if file_path.endswith('.csv'):
                    loader = CSVLoader()
                # elif file_path.endswith('.docx'):
                #     loader = docxLoader()
                elif file_path.endswith('.md'):
                    loader = MDLoader()
                elif file_path.endswith('.pdf'):
                    loader = PDFLoader()
                elif file_path.endswith('.txt'):
                    loader = TXTLoader()
                else:
                    raise ValueError(f"不支持的文件格式: {file_path}")
                # 加载文档内容并保留路径信息
                chunks = loader.load(file_path)


                file_name = Path(file_path).name  # 获取带扩展名的文件名
                # 为当前文件创建文档条目和向量
                file_vectors = []
                for chunk in tqdm(chunks, 
                                desc=f"📄 {file_name}",position=1):  # 保留进度条痕迹
                    # 存储文档信息
                    self.docs.append({
                        "file_path": str(Path(file_path).absolute()),
                        "content": str(chunk)
                    })
                    # 生成并存储向量
                    file_vectors.append(self.embedding_model.encode(str(chunk)))
                # 合并向量到总数组
                if self.doc_vectors is None:
                    self.doc_vectors = np.array(file_vectors)
                else:
                    self.doc_vectors = np.vstack((self.doc_vectors, file_vectors))
    def retrieve_documents(self, query: str, top_k: int = 3) -> List[Dict]:
        """
        检索相关文档并返回带路径的结果
        :param query: 查询文本
        :param top_k: 返回结果数量
        :return: 包含路径和内容的文档列表
        """
        if self.doc_vectors is None:
            raise ValueError("请先加载文档")

        # 生成查询向量
        query_vector = self.embedding_model.encode(query).reshape(1, -1)
        
        # 计算相似度
        similarities = cosine_similarity(query_vector, self.doc_vectors).flatten()
        sorted_indices = np.argsort(similarities)[::-1][:top_k]

        return [{
            "score": similarities[i],
            "content": self.docs[i]["content"],
            "file_path": self.docs[i]["file_path"]
        } for i in sorted_indices]
    
    def generate_prompt(self, query: str, top_k: int = 3) -> str:
        """
        生成 RAG 提示
        :param query: 用户查询
        :param top_k: 返回最相关的 top_k 文档
        :return: 生成的提示文本
        """
        relevant_docs = self.retrieve_documents(query, top_k)
        prompt = f"用户查询: {query}\n\n相关文档:\n"
        for i, doc in enumerate(relevant_docs):
            prompt += f"""
            文档 {i+1} [来自: {doc['file_path']}]:
            {doc['content']}
            相似度得分: {doc['score']:.4f}\n\n
            """
        return prompt

    def generate_response(self, query: str) -> str:
        """
        生成最终响应
        :param query: 用户查询
        :return: 生成的响应文本
        """
        prompt = self.generate_prompt(query)
        print("[DEBUG] 生成的提示:\n", prompt)
        # 调用生成模型（这里用伪代码表示）
        response = self._call_language_model(prompt)
        return response

    def _call_language_model(self, prompt: str) -> str:
        """
        调用语言模型生成响应（伪代码）
        :param prompt: 提示文本
        :return: 生成的响应
        """
        # 这里可以替换为实际的模型调用，例如 OpenAI API 或本地模型
        # 例如：
        # response = openai.Completion.create(prompt=prompt, ...)
        # return response.choices[0].text
        self.llm_model = self.config['ollama']['default_model']
        data = {
            "model": self.llm_model,
            "prompt": prompt,
            "stream": self.config['ollama']['stream'],
            "options": {
                "temperature": self.config['ollama']['temperature']
            },
        }
        url = self.config['ollama']['endpoint'] + '/api/generate'
        response = requests.post(url, json=json.dumps(data))
        return response
        # return f"基于以下信息生成响应:\n{prompt}"

# # 示例用法
# if __name__ == "__main__":
#     rag = Rag()
    
#     # 加载文档
#     rag.load_documents(['data/documents/data.csv','data/documents/test.txt'])
    
#     # 生成响应
#     query = "你是谁啊？你叫什么？"
#     response = rag.generate_response(query)
#     print(response)