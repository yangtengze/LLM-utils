from document_loader import csvLoader, docxLoader, mdLoader, pdfLoader, txtLoader
from typing import List, Dict, Optional
import yaml
from pathlib import Path
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np
import requests
import torch
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
        self.config = self.load_config("rag-config")

        # self.vectorizer = TfidfVectorizer()  # 文本向量化器
        # self.embedding_model = self.config['rag']['embedding_model']['name']
        self.embedding_model = FlagModel(self.config['rag']['embedding_model']['name'], 
                  query_instruction_for_retrieval="为这个句子生成表示以用于检索相关文章：",
                  use_fp16=True)
        self.deivce = self.config['rag']['embedding_model']['device']
        self.embedding_model.to(torch.device(self.deivce))
        # self.reranker_model = 
        self.doc_vectors = None  # 文档向量
    def load_config(config_name: str):
        config_path = Path("configs") / f"{config_name}.yaml"
        with open(config_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f)
        
    def load_documents(self, file_paths: List[str]) -> None:
        """
        加载多种格式的文档
        :param file_paths: 文件路径列表
        """
        for file_path in file_paths:
            if file_path.endswith('.csv'):
                loader = csvLoader()
            elif file_path.endswith('.docx'):
                loader = docxLoader()
            elif file_path.endswith('.md'):
                loader = mdLoader()
            elif file_path.endswith('.pdf'):
                loader = pdfLoader()
            elif file_path.endswith('.txt'):
                loader = txtLoader()
            else:
                raise ValueError(f"不支持的文件格式: {file_path}")
            
            content = loader.load(file_path)
            # self.docs.extend(content)  # 假设 loader.load 返回一个字符串列表
            self.docs.append(content)
        # 向量化文档
        if self.docs:
            self.doc_vectors = self.embedding_model.encode(self.docs)

    def generate_docs(self, vec_query: str) -> List[str]:
        """
        根据查询向量检索相关文档
        :param vec_query: 查询文本
        :return: 相关文档列表
        """
        if not self.doc_vectors:
            raise ValueError("未加载文档，请先调用 load_documents 方法")
        
        # 将查询文本向量化
        query_vector = self.embedding_model.encode([vec_query])
        # 计算余弦相似度
        similarities = cosine_similarity(query_vector, self.doc_vectors).flatten()
        # 按相似度排序并返回相关文档
        sorted_indices = np.argsort(similarities)[::-1]
        return [self.docs[i] for i in sorted_indices]

    def generate_prompt(self, query: str, top_k: int = 3) -> str:
        """
        生成 RAG 提示
        :param query: 用户查询
        :param top_k: 返回最相关的 top_k 文档
        :return: 生成的提示文本
        """
        relevant_docs = self.generate_docs(query)[:top_k]
        prompt = f"用户查询: {query}\n\n相关文档:\n"
        for i, doc in enumerate(relevant_docs):
            prompt += f"文档 {i + 1}:\n{doc}\n\n"
        return prompt

    def generate_response(self, query: str) -> str:
        """
        生成最终响应
        :param query: 用户查询
        :return: 生成的响应文本
        """
        prompt = self.generate_prompt(query)
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
        ollama_config = self.load_config('ollama')
        self.llm_model = ollama_config['ollama']['default_model']
        data = {
            "model": self.llm_model,
            "prompt": prompt,
            "stream": ollama_config['ollama']['stream'],
            "options": {
                "temperature": ollama_config['ollama']['temperature']
            },
        }
        url = ollama_config['ollama']['endpoint'] + '/api/generate'
        response = requests.post(url, json=json.dumps(data))
        return response
        # return f"基于以下信息生成响应:\n{prompt}"

# # 示例用法
# if __name__ == "__main__":
#     rag = Rag()
    
#     # 加载文档
#     rag.load_documents(["example.csv", "example.docx", "example.md"])
    
#     # 生成响应
#     query = "什么是 RAG 模型？"
#     response = rag.generate_response(query)
#     print(response)