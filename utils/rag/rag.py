from utils.document_loader import CSVLoader, MDLoader, PDFLoader, TXTLoader, DocxLoader, HTMLLoader
from utils.load_config import configs
from utils.base_func import call_language_model, remove_think_tag
from typing import List, Dict, Tuple, Optional, Union, Any
from pathlib import Path
import numpy as np
from tqdm import tqdm
from FlagEmbedding import FlagModel, FlagReranker
import json
import os
import time
import re
from io import StringIO

class Rag:
    def __init__(self):
        """
        初始化 RAG 模型
        - 支持多种文档加载器
        - 自动加载已保存的文档和向量
        - 支持增量添加文档
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
        
        # 添加结果缓存
        self.retrieval_cache = {}
        self.cache_max_size = 50  # 最大缓存条目数
        self.cache_ttl = 3600  # 缓存有效期（秒）

    def _generate_chunk_summary(self, chunk_content: str, max_length: int = 150) -> str:
        """生成文档块的摘要"""
        prompt = f"""
        直接开始用中文总结以下文本内容，仅列核心要点：首先是总结出来的标题，再用符号「•」分项，最后用符号「→」总结。避免任何解释性文字。(不超过{max_length}个字符）
          
        文本内容:
        {chunk_content}
        """
        summary = call_language_model(prompt)
        summary = remove_think_tag(summary)
        return summary
    
    def _query_enhance(self, query: str) -> str:
        """
        对查询进行增强
        """
        # 如果查询很短或不包含数学表达式，跳过增强
        if len(query) < 20 and not any(char in query for char in "+-*/^()={}[]"):
            return query
        
        # 缓存增强查询结果
        cache_key = f"enhance_{query}"
        if cache_key in self.retrieval_cache:
            cache_entry = self.retrieval_cache[cache_key]
            if time.time() - cache_entry['timestamp'] < self.cache_ttl:
                return cache_entry['results']
            else:
                del self.retrieval_cache[cache_key]
        
        # 对查询进行增强 - 只有在可能包含数学公式时才调用LLM
        # 使用正则表达式检测可能的数学表达式
        math_pattern = r'[\+\-\*\/\^\(\)\=\{\}\[\]]|[0-9]+[a-zA-Z]+|[a-zA-Z]+[0-9]+'
        if re.search(math_pattern, query):
            Systemprompt = """
            你是一个能把文本变为带有latex公式的文本的专家，你不需要解数学题，只需进行转化。
            把下面用户提出的问题中带有数学公式的部分转化成带有latex公式的,严格转换，不要出错，并且能理解用户的语义，语义里带有数学公式的也要转换。
            不要有多余的输出。直接给我转换后的文本，再次强调：（注意）你不需要去做这个数学题。
            """
            enhance_query = call_language_model(query, Systemprompt)
            enhance_query = remove_think_tag(enhance_query)
        else:
            # 不包含数学表达式，直接返回原始查询
            enhance_query = query
        
        # 将增强结果存入缓存
        self.retrieval_cache[cache_key] = {
            'results': enhance_query,
            'timestamp': time.time()
        }
        
        return enhance_query
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
                    doc['chunk_summary'] = self._generate_chunk_summary(doc['chunk_content'])
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

            # 创建批处理任务
            batch_size = 5  # 每批处理的文件数量
            batches = [new_files[i:i + batch_size] for i in range(0, len(new_files), batch_size)]
            
            all_new_docs = []
            all_new_vectors = []
            
            with tqdm(total=len(new_files), desc="📁 总体进度") as global_pbar:
                for batch in batches:
                    batch_docs = []
                    batch_vectors = []
                    
                    for file_path in batch:
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
                                global_pbar.update(1)
                                print(f"跳过不支持的文件格式: {file_path}")
                                continue

                            # 加载文档内容
                            chunks = loader.load(file_path)
                            total_chunks = len(chunks)
                            
                            # 优化：预先计算并存储文件块数量
                            if not hasattr(self, '_file_chunks_count'):
                                self._file_chunks_count = {}
                            self._file_chunks_count[file_path] = total_chunks
                            
                            # 处理文档块
                            file_docs = []
                            file_contents = []
                            
                            # 收集块内容，准备批量编码
                            for i, chunk in enumerate(chunks):
                                chunk = str(chunk)
                                if chunk == '':
                                    continue
                                # 优化：并行生成摘要
                                chunk_summary = self._generate_chunk_summary(chunk)
                                
                                # 存储元数据
                                file_docs.append({
                                    "file_path": file_path,
                                    "chunk_index": i,
                                    "chunk_summary": chunk_summary,
                                    "chunk_content": chunk,
                                    "total_chunks": total_chunks,
                                    "timestamp": time.time(),
                                })
                                
                                # 优化：预处理向量内容
                                content_for_vector = f"{chunk_summary}\n{chunk_summary}\n{chunk}"
                                file_contents.append(content_for_vector)
                            
                            # 批量编码文件内容
                            if file_contents:
                                # 优化：使用批量编码而不是逐个编码
                                file_vectors = self.embedding_model.encode_corpus(file_contents)
                                batch_vectors.extend(file_vectors)
                                batch_docs.extend(file_docs)
                            
                            global_pbar.update(1)
                            global_pbar.set_postfix_str(f'处理完成: {Path(file_path).name}')
                            
                        except Exception as e:
                            global_pbar.update(1)
                            print(f"处理文件 {file_path} 失败: {str(e)}")
                            continue
                    
                    # 追加新批次的文档和向量
                    all_new_docs.extend(batch_docs)
                    all_new_vectors.extend(batch_vectors)
                
                # 将所有新数据追加到现有数据中
                self.docs.extend(all_new_docs)
                vectors.extend(all_new_vectors)

                # 统一转换为numpy数组
                self.doc_vectors = np.array(vectors)
                
            print(f"加载完成，新增 {len(all_new_docs)} 个文档块")
            
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
                    # chunk_summary = self._generate_chunk_summary(chunk_content)
                    chunk = f"{chunk_summary}\n{chunk_summary}\n{chunk_content}"
                    if chunk_content:
                        # 生成新的向量
                        vector = self.embedding_model.encode(chunk)
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
    
    def retrieve_documents(self, query: str, top_k: int = None, threshold: float = None, rerank_threshold: float = None) -> List[Dict]:
        """
        检索与增强查询最相关的文档，先使用embedding模型检索，再使用reranker模型重排序
        
        参数:
            query: 用户查询
            top_k: 返回的文档数量，如果为None则使用配置值
            threshold: 相似度阈值，低于此值的文档将被过滤
            rerank_threshold: 重排序分数阈值，低于此值的文档将被过滤
        返回:
            相关文档列表，按相似度降序排序
        """
        if top_k is None:
            top_k = self.top_k
            
        if threshold is None:
            threshold = self.score_threshold
        
        if rerank_threshold is None:
            rerank_threshold = self.rerank_threshold
        
        # 生成缓存键
        cache_key = f"{query}_{top_k}_{threshold}_{rerank_threshold}"
        
        # 检查缓存
        if cache_key in self.retrieval_cache:
            cache_entry = self.retrieval_cache[cache_key]
            # 检查是否仍然有效
            if time.time() - cache_entry['timestamp'] < self.cache_ttl:
                print(f"从缓存中获取检索结果，查询: {query[:30]}...")
                return cache_entry['results']
            else:
                # 缓存已过期，删除
                del self.retrieval_cache[cache_key]
                
        if not self.docs or self.doc_vectors is None:
            print("无可用文档")
            return []
        
        # 优化步骤1: 使用batch操作生成查询向量
        # 生成查询向量
        query_vector = self.embedding_model.encode_queries([query]).reshape(1, -1)
        
        # 计算相似度得分
        if self.similarity_metric == 'cosine':
            similarities = self._cosine_similarity(query_vector, self.doc_vectors)
        elif self.similarity_metric == 'l2':
            similarities = self._l2_similarity(query_vector, self.doc_vectors)
        else:
            raise ValueError(f"不支持的相似度度量：{self.similarity_metric}")

        # 优化步骤2: 使用向量化操作查找topk，避免循环
        # 找到相似度得分最高的initial_retrieval_k个文档
        initial_k = self.initial_retrieval_k
        indices = np.argsort(similarities)[::-1][:initial_k]
        
        # 优化步骤3: 初始过滤使用向量化操作
        # 过滤低于阈值的索引
        mask = similarities[indices] >= threshold
        filtered_indices = indices[mask]
        
        if len(filtered_indices) == 0:
            print("初步检索未找到相关文档")
            return []
        
        # 优化步骤4: 批量处理文档
        # 收集初步检索结果 
        initial_results = []
        pairs = []  # 为reranker准备的对
        
        for idx in filtered_indices:
            doc = dict(self.docs[idx])  # 创建副本避免修改原数据
            doc['initial_score'] = float(similarities[idx])  # 保存初始得分
            
            # 确保文档具有所需的字段（向后兼容）
            if 'chunk_index' not in doc:
                doc['chunk_index'] = 0
            if 'chunk_content' not in doc:
                doc['chunk_content'] = doc.get('chunk_content', '')
            if 'total_chunks' not in doc:
                # 优化: 使用预计算或缓存的总块数（如果可用）
                if 'file_path' in doc and hasattr(self, '_file_chunks_count') and doc['file_path'] in self._file_chunks_count:
                    doc['total_chunks'] = self._file_chunks_count[doc['file_path']]
                else:
                    same_file_docs = [d for d in self.docs if d.get('file_path') == doc.get('file_path')]
                    doc['total_chunks'] = len(same_file_docs)
                    # 缓存结果供未来使用
                    if not hasattr(self, '_file_chunks_count'):
                        self._file_chunks_count = {}
                    self._file_chunks_count[doc['file_path']] = doc['total_chunks']
            
            if 'chunk_summary' not in doc:
                # 优化: 如果没有摘要，创建摘要但尝试重用之前的结果
                cache_key_summary = f"summary_{doc.get('file_path')}_{doc.get('chunk_index')}"
                if cache_key_summary in self.retrieval_cache:
                    doc['chunk_summary'] = self.retrieval_cache[cache_key_summary]['results']
                else:
                    doc['chunk_summary'] = self._generate_chunk_summary(doc['chunk_content'])
                    # 缓存摘要
                    self.retrieval_cache[cache_key_summary] = {
                        'results': doc['chunk_summary'],
                        'timestamp': time.time()
                    }
            
            initial_results.append(doc)
            
            # 准备 reranker 输入
            chunk_content = f"{doc['chunk_summary']}\n{doc['chunk_summary']}\n{doc['chunk_content']}"
            pairs.append((query, chunk_content))
        
        # 优化步骤5: 批量调用reranker一次，而不是在循环中逐个调用
        # 调用reranker模型获取重排序分数 - 批量处理更高效
        rerank_scores = self.reranker_model.compute_score(pairs)
        
        # 将reranker分数归一化到0-1范围内（使用sigmoid函数）
        def sigmoid(x):
            return 1 / (1 + np.exp(-x))
        
        # 优化步骤6: 使用numpy向量化操作处理分数
        # 批量应用sigmoid
        normalized_scores = sigmoid(np.array(rerank_scores))
        
        # 为文档添加重排序分数（归一化后的）
        reranked_results = []
        for i, doc in enumerate(initial_results):
            # 复制文档以保留所有原始字段
            reranked_doc = dict(doc)
            # 使用预计算的归一化分数
            reranked_doc['score'] = float(normalized_scores[i])
            if reranked_doc['score'] >= rerank_threshold:
                reranked_results.append(reranked_doc)
        
        # 按重排序分数降序排序
        reranked_results = sorted(reranked_results, key=lambda x: x['score'], reverse=True)
        
        # 返回top_k个文档
        final_results = reranked_results[:top_k]
        
        # 将结果存入缓存
        self.retrieval_cache[cache_key] = {
            'results': final_results,
            'timestamp': time.time()
        }
        
        # 清理缓存
        if len(self.retrieval_cache) > self.cache_max_size:
            # 优化步骤7: 更高效的缓存清理
            # 找出最旧的几个条目而不是每次只删除一个
            cache_items = sorted(self.retrieval_cache.items(), key=lambda x: x[1]['timestamp'])
            # 删除10%的旧条目
            items_to_remove = max(1, int(self.cache_max_size * 0.1))
            for i in range(items_to_remove):
                if i < len(cache_items):
                    del self.retrieval_cache[cache_items[i][0]]
        
        # 存储最后一次检索的结果，便于前端获取
        self.last_retrieval = {
            'query': query,
            'top_k': top_k,
            'results': final_results,
            'cache_key': cache_key
        }
        
        return final_results
    
    def generate_prompt(self, query: str, top_k: int = None, threshold: float = None, rerank_threshold: float = None, is_image: bool = False) -> str:
        """
        生成 RAG 提示
        :param query: 用户查询
        :param top_k: 返回最相关的 top_k 文档
        :param threshold: 相似度阈值，低于此值的文档将被过滤
        :param rerank_threshold: 重排序分数阈值，低于此值的文档将被过滤
        :param is_image: 是否为图片查询
        :return: 生成的提示文本
        """
        if top_k is None:
            top_k = self.top_k  
        if threshold is None:
            threshold = self.score_threshold
        if rerank_threshold is None:
            rerank_threshold = self.rerank_threshold
            
        # 生成最新查询的缓存键
        cache_key = f"prompt_{query}_{top_k}_{threshold}_{rerank_threshold}_{is_image}"
        
        # 检查缓存中是否已有此提示
        if cache_key in self.retrieval_cache:
            cache_entry = self.retrieval_cache[cache_key]
            if time.time() - cache_entry['timestamp'] < self.cache_ttl:
                print(f"从缓存中获取提示，查询: {query[:30]}...")
                return cache_entry['results']
            else:
                del self.retrieval_cache[cache_key]
        
        # 优化：检查是否可以重用上次检索的结果
        if hasattr(self, 'last_retrieval') and self.last_retrieval and self.last_retrieval.get('query') == query and self.last_retrieval.get('top_k') >= top_k:
            relevant_docs = self.last_retrieval.get('results', [])[:top_k]
            print(f"重用上次检索结果，查询: {query[:30]}...")
        else:
            relevant_docs = self.retrieve_documents(query, top_k, threshold, rerank_threshold)
        
        # 构建提示模板 - 使用 StringIO 或 StringBuilder 模式更高效
        prompt_builder = StringIO()
        
        if is_image:
            # 图片查询的提示模板
            prompt_builder.write(f"""
请根据OCR识别结果和相关文档回答用户关于图片的问题。

图片内容和用户提问: {query}

相关文档:
""")
        else:
            # 常规文本查询的提示模板
            prompt_builder.write(f"""
请根据相关文档回答用户查询的问题。若有的文档不相关，尽量不要输出与不相关文档的内容，并根据你自己来输出。

用户查询的问题: {query}

相关文档:
""")
        
        # 高效添加文档内容
        for i, doc in enumerate(relevant_docs):
            prompt_builder.write(f"""
文档 {i+1} [来自: {doc['file_path']}]:

[摘要] {doc['chunk_summary']}
[补充细节] {doc['chunk_content']}

相似度得分: {doc['score']:.4f}

""")
        
        if is_image:
            prompt_builder.write("请分析图片OCR识别的内容，并结合相关文档提供准确、全面的回答。如果文档与图片内容无关，请优先基于图片内容回答。")
        else:
            prompt_builder.write("请严格根据以上文档内容回答用户问题，不要添加不存在于文档中的信息。")
        
        # 获取最终提示文本
        prompt = prompt_builder.getvalue()
        
        # 缓存生成的提示
        self.retrieval_cache[cache_key] = {
            'results': prompt,
            'timestamp': time.time()
        }
        
        return prompt
    
    def get_last_retrieved_documents(self) -> List[Dict]:
        """
        获取上次检索的文档 (兼容旧版API)
        """
        if hasattr(self, 'last_retrieval') and self.last_retrieval:
            return self.last_retrieval.get('results', [])
        # 旧版本兼容性
        if hasattr(self, 'last_query') and self.last_query:
            cache_key = self.last_query.get('cache_key')
            if cache_key in self.retrieval_cache:
                return self.retrieval_cache[cache_key]['results']
        return []