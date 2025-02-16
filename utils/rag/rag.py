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
import os
import time
class Rag:
    def __init__(self):
        """
        初始化 RAG 模型
        - 支持多种文档加载器
        - 自动加载已保存的文档和向量
        - 支持增量添加文档
        """
        self.config = self.load_config("configs")

        persist_dir = self.config['rag']['vector_store']['index_path']
        self.persist_dir = Path(persist_dir)
        self.persist_dir.mkdir(parents=True, exist_ok=True)
        
        # 初始化时自动加载已有数据
        self.docs = self._load_metadata()
        self.doc_vectors = self._load_vectors()

        self.device = self.config['rag']['embedding_model']['device']
        self.embedding_model = FlagModel(self.config['rag']['embedding_model']['name'], 
                  query_instruction_for_retrieval="为这个句子生成表示以用于检索相关文章：",
                  use_fp16=True,devices=self.device)
        # self.reranker_model = 
    
    def load_config(self,config_name: str):
        config_path = Path("configs") / f"{config_name}.yaml"
        with open(config_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f)

    def _get_vector_path(self) -> Path:
        """获取向量存储路径"""
        return self.persist_dir / "doc_vectors.npy"

    def _get_metadata_path(self) -> Path:
        """获取元数据存储路径"""
        return self.persist_dir / "metadata.json"

    def _load_vectors(self) -> np.ndarray:
        """加载已保存的向量"""
        vector_path = self._get_vector_path()
        if vector_path.exists():
            return np.load(vector_path)
        return None

    def _load_metadata(self) -> List[Dict]:
        """加载已保存的元数据"""
        metadata_path = self._get_metadata_path()
        if metadata_path.exists():
            with open(metadata_path, "r", encoding="utf-8") as f:
                return json.load(f)
        return []

    def _save_data(self):
        """保存当前数据到磁盘"""
        # 保存向量
        if self.doc_vectors is not None:
            np.save(self._get_vector_path(), self.doc_vectors)
        
        # 保存元数据
        with open(self._get_metadata_path(), "w", encoding="utf-8") as f:
            json.dump(self.docs, f, ensure_ascii=False, indent=2)

        
    def load_documents(self, file_paths: List[str]) -> None:
        """
        加载多种格式的文档（优化版）
        """
        # 转换所有路径为绝对路径
        abs_paths = [str(Path(fp).absolute()) for fp in file_paths]
        
        # 过滤已加载文件（使用集合提高查询效率）
        existing_files = {doc["file_path"] for doc in self.docs}
        new_files = [fp for fp in abs_paths if fp not in existing_files]
        
        if not new_files:
            print("所有文件均已加载过")
            return

        try:
            # 将numpy数组转为列表便于追加
            if self.doc_vectors is not None:
                vectors = self.doc_vectors.tolist()
            else:
                vectors = []

            with tqdm(new_files, desc="📁 总体进度") as global_pbar:
                for file_path in global_pbar:
                    global_pbar.set_postfix_str(f'处理中: {Path(file_path).name}')
                    
                    try:
                        # 获取文件加载器
                        if file_path.endswith('.csv'):
                            loader = CSVLoader()
                        elif file_path.endswith('.md'):
                            loader = MDLoader()
                        elif file_path.endswith('.pdf'):
                            loader = PDFLoader()
                        elif file_path.endswith('.txt'):
                            loader = TXTLoader()
                        else:
                            raise ValueError(f"不支持的文件格式: {file_path}")

                        # 加载文档内容
                        chunks = loader.load(file_path)
                        
                        # 处理文档块
                        file_vectors = []
                        for chunk in tqdm(chunks, desc=f"📄 {Path(file_path).name}", leave=True):
                            # 存储元数据
                            self.docs.append({
                                "file_path": file_path,
                                "content": str(chunk),
                                "timestamp": time.time()  # 添加时间戳用于版本控制
                            })
                            # 生成向量
                            file_vectors.append(self.embedding_model.encode(str(chunk)))
                        
                        # 追加向量
                        vectors.extend(file_vectors)

                    except Exception as e:
                        print(f"处理文件 {file_path} 失败: {str(e)}")
                        continue

            # 统一转换为numpy数组
            self.doc_vectors = np.array(vectors)
            
        finally:
            # 最终保存数据
            self._save_data()

    def reset(self):
        """重置所有存储数据"""
        self.doc_vectors = None
        self.docs = []
        if self._get_vector_path().exists():
            os.remove(self._get_vector_path())
        if self._get_metadata_path().exists():
            os.remove(self._get_metadata_path())
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

# 示例用法
if __name__ == "__main__":
    rag = Rag()
    # 加载文档
    rag.load_documents(['data/documents/data.csv','data/documents/test.txt'])
    
    # 生成响应
    query = "你是谁啊？你叫什么？"
    response = rag.generate_response(query)
    print(response)