from utils.document_loader import CSVLoader, MDLoader, PDFLoader, TXTLoader, DocxLoader, HTMLLoader
from utils.load_config import configs
from utils.base_func import *
from typing import List, Dict, Tuple, Optional
from pathlib import Path
from tqdm import tqdm
from FlagEmbedding import FlagModel, FlagReranker
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
        - 支持多轮对话
        """
        self.config = configs
        self.documents_path = Path(self.config['rag']['document_path'])
        self.files = self.get_all_files_in_directory()
        print('documents files:', self.files)
        self.vector_store_path = Path(self.config['rag']['vector_store']['index_path'])
        self.vector_store_path.mkdir(parents=True, exist_ok=True)
        
        # 初始化时自动加载已有数据
        self.docs = self._load_metadata()
        self.doc_vectors = self._load_vectors()

        self.device = self.config['rag']['embedding_model']['device']
        self.embedding_model = FlagModel(self.config['rag']['embedding_model']['path'], 
                  query_instruction_for_retrieval="为这个句子生成表示以用于检索相关文章：",
                  use_fp16=True,devices=self.device)
        self.embedding_model.dimension = self.config['rag']['embedding_model']['dimension']
        
        # 初始化重排序模型
        self.reranker_device = self.config['rag']['reranker_model']['device']
        self.reranker_model = FlagReranker(
            self.config['rag']['reranker_model']['path'],
            use_fp16=True,
            device=self.reranker_device
        )
        
        # 检索参数
        self.top_k = self.config['rag']['retrieval']['top_k']
        self.initial_retrieval_k = self.config['rag']['retrieval']['initial_retrieval_k']
        self.score_threshold = self.config['rag']['retrieval']['score_threshold']
        self.rerank_threshold = self.config['rag']['retrieval']['rerank_score_threshold']
        self.similarity_metric = self.config['rag']['vector_store']['similarity_metric']
        
        # 多轮对话历史
        self.conversation_history = []
        self.max_history_length = 5  # 保留5条历史记录
    
    def add_to_history(self, query: str, response: str) -> None:
        """
        将当前的对话添加到历史记录中
        
        参数:
            query: 用户查询
            response: 系统回复
        """
        self.conversation_history.append({"user": query, "assistant": response})
        
        # 保持历史记录不超过设定的最大长度
        if len(self.conversation_history) > self.max_history_length:
            self.conversation_history = self.conversation_history[-self.max_history_length:]
    
    def get_conversation_context(self) -> str:
        """
        获取格式化的对话历史上下文
        
        返回:
            格式化的对话历史字符串
        """
        if not self.conversation_history:
            return ""
            
        context = "以下是之前的对话历史：\n\n"
        for i, exchange in enumerate(self.conversation_history):
            context += f"用户: {exchange['user']}\n"
            context += f"助手: {exchange['assistant']}\n\n"
        
        return context
    
    def clear_history(self) -> None:
        """
        清空对话历史
        """
        self.conversation_history = []
    
    def _generate_chunk_summary(self, chunk_content: str, max_length: int = 150) -> str:
        """
        使用语言模型为文档块生成标题/简介
        
        参数:
            chunk_content: 文档块内容
            max_length: 标题最大长度
            
        返回:
            生成的标题/简介
        """
        try:

            # 准备提示
            prompt = f"""           
            直接开始用中文总结以下文本内容，仅列核心要点：首先是总结出来的标题，再用符号「•」分项，最后用符号「→」总结。避免任何解释性文字。(不超过{max_length}个字符）
          
            文本内容:
            {chunk_content}
            """
            response = call_language_model(prompt=prompt)
            response = remove_think_tag(response)
            summary = response.strip()
            # 如果标题过长，截断
            if len(summary) > max_length:
                summary = summary[:max_length-3] + "..."
            return summary
                
        except Exception as e:
            print(f"生成标题时出错: {str(e)}")
            return self._generate_default_summary(chunk_content)
    
    def _generate_default_summary(self, chunk_content: str, max_length: int = 150) -> str:
        """
        当LLM生成失败时，使用简单规则生成默认标题
        """
        # 简单取内容的前部分作为标题
        text = chunk_content.strip().replace('\n', ' ')
        if len(text) > max_length:
            summary = text[:max_length-3] + "..."
        else:
            summary = text
        return summary
    
    def get_all_files_in_directory(self) -> List[str]:
        directory_path = Path(self.documents_path)  # 确保这是一个 Path 对象
        return [str(file) for file in directory_path.rglob('*') if file.is_file()]

    def _get_vector_path(self) -> Path:
        """获取向量存储路径"""
        return self.vector_store_path / "doc_vectors.npy"

    def _get_metadata_path(self) -> Path:
        """获取元数据存储路径"""
        return self.vector_store_path / "metadata.json"

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

    def _save_data(self,vectors=True,docs=True):
        """保存当前数据到磁盘"""
        # 保存向量
        if vectors and self.doc_vectors is not None:
            np.save(self._get_vector_path(), self.doc_vectors)
        
        # 确保所有文档都有新的元数据格式字段
        if docs:
            for doc in self.docs:
                if 'chunk_index' not in doc:
                    doc['chunk_index'] = 0
                if 'chunk_content' not in doc:
                    doc['chunk_content'] = doc.get('content', '')
                if 'total_chunks' not in doc:
                    # 计算此文件的总块数
                    file_path = doc.get('file_path')
                    same_file_docs = [d for d in self.docs if d.get('file_path') == file_path]
                    doc['total_chunks'] = len(same_file_docs)
                if 'chunk_summary' not in doc:
                    # 如果没有标题，使用规则生成一个默认标题
                    doc['chunk_summary'] = self._generate_default_summary(doc['chunk_content'])
            # 保存元数据
            with open(self._get_metadata_path(), "w", encoding="utf-8") as f:
                json.dump(self.docs, f, ensure_ascii=False, indent=2)
    
    def _cosine_similarity(self, query_vector, doc_vectors):
        """
        计算余弦相似度 - 向量化计算
        
        余弦相似度计算公式:
        cos(θ) = (A·B) / (|A|·|B|)
        其中,A和B是两个向量,A·B是它们的点积,|A|和|B|是它们的模。
        
        参数:
            query_vector: 查询向量，形状为 (1, embedding_dim)
            doc_vectors: 文档向量，形状为 (num_docs, embedding_dim)
        返回:
            一维numpy数组，包含所有文档的相似度分数
        """
        # 计算点积
        dot_products = np.dot(query_vector, doc_vectors.T).flatten()
        
        # 计算模
        query_norm = np.linalg.norm(query_vector)
        doc_norms = np.linalg.norm(doc_vectors, axis=1)
        
        # 计算余弦相似度
        similarities = dot_products / (query_norm * doc_norms)
        
        return similarities
    
    def _l2_similarity(self, query_vector, doc_vectors):
        """
        计算L2相似度（欧氏距离）- 向量化计算
        
        L2相似度计算公式:
        d(A,B) = sqrt(sum((A_i - B_i)^2))
        
        参数:
            query_vector: 查询向量，形状为 (1, embedding_dim)
            doc_vectors: 文档向量，形状为 (num_docs, embedding_dim)
        返回:
            一维numpy数组，包含所有文档的相似度分数（距离越小，相似度越高）
        """
        # 计算欧氏距离
        # 使用广播机制：(1, dim) - (num_docs, dim) => (num_docs, dim)
        distances = np.linalg.norm(query_vector - doc_vectors, axis=1)
        
        # 由于欧氏距离越小表示越相似，为了保持与余弦相似度一致（值越大越相似）
        # 我们可以对距离取负值或倒数，这里选择取负值
        similarities = -distances
        
        return similarities
        
    def load_documents(self, file_paths: List[str]) -> None:
        """
        加载多种格式的文档
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
                        elif file_path.endswith('.docx'):
                            loader = DocxLoader()
                        elif file_path.endswith('.md'):
                            loader = MDLoader()
                        elif file_path.endswith('.pdf'):
                            loader = PDFLoader()
                        elif file_path.endswith('.html') or file_path.endswith('.htm'):
                            loader = HTMLLoader()
                        elif (file_path.endswith('.txt') or (Path(file_path).suffix == '' and Path(file_path).is_file())):
                            loader = TXTLoader()
                        else:
                            raise ValueError(f"不支持的文件格式: {file_path}")

                        # 加载文档内容
                        chunks = loader.load(file_path)
                        total_chunks = len(chunks)
                        
                        # 处理文档块
                        file_vectors = []
                        for i, chunk in enumerate(tqdm(chunks, desc=f"📄 {Path(file_path).name}", leave=True)):
                            chunk_content = str(chunk)
                            
                            # 使用模型为文档块生成标题
                            chunk_summary = self._generate_chunk_summary(chunk_content)
                            
                            # 存储元数据 - 使用新的格式
                            self.docs.append({
                                "file_path": file_path,
                                "chunk_index": i,  # 记录块索引
                                "chunk_content": chunk_content,  # 文档内容
                                "chunk_summary": chunk_summary,  # 新增：文档块标题
                                "total_chunks": total_chunks,  # 记录总块数
                                "timestamp": time.time()  # 添加时间戳用于版本控制
                            })
                            
                            # 结合摘要和内容生成向量，增强语义理解
                            indexed_text = f"{chunk_summary}\n{chunk_summary}\n{chunk_content}"
                            file_vectors.append(self.embedding_model.encode(indexed_text))
                            
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
    
    def rebuild_vector_db(self, file_path=None, chunk_indices=None):
        """
        重建向量数据库
        在修改了元数据中的文档内容后调用此方法来更新向量
        
        参数:
            file_path: 可选，指定要重建的文件路径
            chunk_indices: 可选，指定要重建的chunk索引列表(当file_path提供时有效)
        """
        if not self.docs:
            print("无可用文档，无法重建向量库")
            return
        
        try:
            # 如果已有向量存储，加载它
            if self.doc_vectors is not None:
                vectors = self.doc_vectors.tolist()
            else:
                vectors = [None] * len(self.docs)
            
            # 确定需要重建的文档索引
            rebuild_indices = []
            if file_path is not None:
                # 只重建指定文件的指定块
                file_path = os.path.abspath(file_path)
                for i, doc in enumerate(self.docs):
                    if doc.get('file_path') == file_path:
                        if chunk_indices is None or int(doc.get('chunk_index', 0)) in chunk_indices:
                            rebuild_indices.append(i)
                print(f"将重建文件 {file_path} 的 {len(rebuild_indices)} 个分块向量")
            else:
                # 重建所有文档
                rebuild_indices = list(range(len(self.docs)))
                print(f"将重建所有 {len(rebuild_indices)} 个分块向量")
            
            if not rebuild_indices:
                print("没有找到需要重建的文档")
                return
                
            print("正在重建向量数据库...")
            
            with tqdm(rebuild_indices, desc="📁 重建向量进度") as pbar:
                for i in pbar:
                    doc = self.docs[i]
                    chunk_content = doc.get('chunk_content', '')
                    chunk_summary = doc.get('chunk_summary', '')
                    
                    if chunk_content:
                        # 组合内容和摘要，给予摘要更高的权重
                        if chunk_summary:
                            # 重复摘要内容以增加其在向量中的权重
                            indexed_text = f"{chunk_summary}\n{chunk_summary}\n{chunk_content}"
                        else:
                            indexed_text = chunk_content
                            
                        # 生成新的向量
                        vector = self.embedding_model.encode(indexed_text)
                        vectors[i] = vector
                    else:
                        print(f"警告: 文档 {doc.get('file_path')} 没有内容，跳过")
                        # 添加一个空向量以保持索引对齐
                        vectors[i] = np.zeros(self.embedding_model.dimension)
            
            # 更新向量存储
            self.doc_vectors = np.array(vectors)
            
            # 保存到磁盘
            self._save_data()
            
            print(f"向量数据库重建完成，更新了 {len(rebuild_indices)} 个文档向量")
        
        except Exception as e:
            print(f"重建向量数据库失败: {str(e)}")
            raise
    
    def _enhance_query(self, query: str) -> str:
        """
        使用专门的提示来增强原始查询，提取关键概念并扩展查询
        
        参数:
            query: 原始用户查询
            
        返回:
            增强后的查询
        """
        try:
            # 对于短查询，可能不需要增强
            if len(query) < 30 and not self.conversation_history:
                return query
                
            # 获取对话历史上下文
            conversation_context = self.get_conversation_context()
            
            # 查询增强专用提示
            prompt = f"""
            {conversation_context if conversation_context else ""}
            分析以下用户查询，提取核心概念、关键词和实体。然后，重写此查询以便更好地用于文档检索。
            你的输出应该是原始查询的扩展版本，包含同义词和相关概念。
            不要使用markdown，不要分点，直接输出增强后的查询文本。
            不要使用任何前缀或解释，只返回增强后的查询。
            
            用户原始查询: {query}
            增强后的查询:
            """
            
            enhanced_query = call_language_model(prompt=prompt)
            enhanced_query = remove_think_tag(enhanced_query).strip()
            
            # 如果增强失败或结果异常，返回原始查询
            if not enhanced_query or len(enhanced_query) < len(query)/2:
                return query
                
            # 组合原始查询和增强查询，保留原始含义的同时扩展搜索范围
            final_query = f"{enhanced_query}\n{query}"
            return final_query
                
        except Exception as e:
            print(f"查询增强失败: {str(e)}")
            return query  # 出错时返回原始查询
            
    def retrieve_documents(self, query: str, top_k: int = None, threshold: float = None, rerank_threshold: float = None, use_history: bool = True) -> List[Dict]:
        """
        检索与查询最相关的文档，先使用embedding模型检索，再使用reranker模型重排序
        
        参数:
            query: 用户查询
            top_k: 返回的文档数量，如果为None则使用配置值
            threshold: 相似度阈值，低于此值的文档将被过滤
            rerank_threshold: 重排序分数阈值，低于此值的文档将被过滤
            use_history: 是否在检索时考虑对话历史
            
        返回:
            相关文档列表，按相似度降序排序
        """
        if top_k is None:
            top_k = self.top_k
            
        if threshold is None:
            threshold = self.score_threshold
        
        if rerank_threshold is None:
            rerank_threshold = self.rerank_threshold
        
        if not self.docs or self.doc_vectors is None:
            print("无可用文档")
            return []

        # 使用专门的方法增强查询，可选择是否使用历史
        try:
            enhanced_query = self._enhance_query(query)
        except:
            enhanced_query = query
            print("查询增强失败，使用原始查询")
        
        # 生成查询向量
        query_vector = self.embedding_model.encode(enhanced_query).reshape(1, -1)  # 确保形状是 (1, dim)
        
        # 计算相似度得分
        if self.similarity_metric == 'cosine':
            similarities = self._cosine_similarity(query_vector, self.doc_vectors)
        elif self.similarity_metric == 'l2':
            similarities = self._l2_similarity(query_vector, self.doc_vectors)
        else:
            raise ValueError(f"不支持的相似度度量：{self.similarity_metric}")

        # 找到相似度得分最高的initial_retrieval_k个文档
        initial_k = self.initial_retrieval_k
        indices = np.argsort(similarities)[::-1][:initial_k]
        # 收集初步检索结果
        initial_results = []
        for idx in indices:
            if similarities[idx] >= threshold:  # 仍然应用阈值过滤
                doc = dict(self.docs[idx])  # 创建副本避免修改原数据
                doc['initial_score'] = float(similarities[idx])  # 保存初始得分
                
                # 确保文档具有所需的字段（向后兼容）
                if 'chunk_index' not in doc:
                    doc['chunk_index'] = 0
                if 'chunk_content' not in doc:
                    doc['chunk_content'] = doc.get('chunk_content', '')
                if 'total_chunks' not in doc:
                    # 计算此文件的总块数
                    same_file_docs = [d for d in self.docs if d.get('file_path') == doc.get('file_path')]
                    doc['total_chunks'] = len(same_file_docs)
                if 'chunk_summary' not in doc:
                    # 如果没有标题，生成一个默认标题
                    doc['chunk_summary'] = self._generate_default_summary(doc['chunk_content'])
                    
                initial_results.append(doc)
        
        if not initial_results:
            print("初步检索未找到相关文档")
            return []
            
        # 第二阶段：使用reranker模型进行重排序
        pairs = []
        
        # 重排序时考虑对话历史
        rerank_query = query
        if use_history and self.conversation_history:
            context_str = ""
            # 只使用最近的几轮对话作为上下文
            for exchange in self.conversation_history[-3:]:  # 使用最近3轮对话
                context_str += f"用户: {exchange['user']}\n"
                context_str += f"助手: {exchange['assistant']}\n"
            rerank_query = f"{context_str}\n当前问题: {query}"
        
        for doc in initial_results:
            # 在重排序时，考虑摘要信息
            context = f"{doc['chunk_summary']}\n\n{doc['chunk_content']}"
            pairs.append((rerank_query, context))
        
        # 调用reranker模型获取重排序分数
        rerank_scores = self.reranker_model.compute_score(pairs)
        
        # 将reranker分数归一化到0-1范围内（使用sigmoid函数）
        def sigmoid(x):
            return 1 / (1 + np.exp(-x))
        
        # 为文档添加重排序分数（归一化后的）
        reranked_results = []
        for i, doc in enumerate(initial_results):
            # 复制文档以保留所有原始字段
            reranked_doc = dict(doc)
            # 使用sigmoid将得分归一化到0-1范围
            normalized_score = float(sigmoid(rerank_scores[i]))
            reranked_doc['score'] = normalized_score  # reranker归一化分数作为最终分数
            if reranked_doc['score'] >= rerank_threshold:
                reranked_results.append(reranked_doc)
        
        # 按重排序分数降序排序
        reranked_results = sorted(reranked_results, key=lambda x: x['score'], reverse=True)
        
        # 返回top_k个文档
        final_results = reranked_results[:top_k]
        
        return final_results
    
    def generate_prompt(self, query: str, top_k: int = None, threshold: float = None, rerank_threshold: float = None, is_image: bool = False, use_history: bool = True) -> str:
        """
        生成 RAG 提示
        :param query: 用户查询
        :param top_k: 返回最相关的 top_k 文档
        :param threshold: 相似度阈值，低于此值的文档将被过滤
        :param rerank_threshold: 重排序分数阈值，低于此值的文档将被过滤
        :param is_image: 是否为图片查询
        :param use_history: 是否在提示中包含对话历史
        :return: 生成的提示文本
        """
        if top_k is None:
            top_k = self.top_k  
        if threshold is None:
            threshold = self.score_threshold
        if rerank_threshold is None:
            rerank_threshold = self.rerank_threshold
            
        # 检索相关文档
        relevant_docs = self.retrieve_documents(query, top_k, threshold, rerank_threshold, use_history)
        
        # 获取对话历史上下文
        conversation_context = self.get_conversation_context() if use_history and self.conversation_history else ""
        
        if is_image:
            # 图片查询的提示模板
            prompt = f"""
            {conversation_context}
            请根据OCR识别结果和相关文档回答用户关于图片的问题。

            图片内容和用户提问: {query}

            相关文档:\n
            """
        else:
            # 常规文本查询的提示模板
            prompt = f"""
            {conversation_context}
            请根据相关文档回答用户查询的问题。若有的文档不相关，尽量不要输出与不相关文档的内容，并根据你自己来输出。
            
            {"当前" if conversation_context else ""}用户查询的问题: {query}

            相关文档:\n
            """
            
        for i, doc in enumerate(relevant_docs):
            # 添加文档标题和内容
            prompt += f"""
            文档 {i+1} [来自: {doc['file_path']}]:
            总结: {doc.get('chunk_summary', '无总结')}
            
            内容:
            {doc['chunk_content']}
            相似度得分: {doc['score']:.4f}\n\n
            """
        
        if is_image:
            prompt += "请分析图片OCR识别的内容，并结合相关文档提供准确、全面的回答。如果文档与图片内容无关，请优先基于图片内容回答。"
        else:
            if conversation_context:
                prompt += "请基于以上文档内容并考虑对话历史，连贯地回答用户当前的问题。回答应当与之前的对话保持一致性。"
            else:
                prompt += "请严格根据以上文档内容回答用户问题，不要添加不存在于文档中的信息。"
            
        return prompt