from typing import Dict, Any, List
import requests
import json
from .base_agent import BaseAgent
from ..rag.rag import Rag

class RAGAgent(BaseAgent):
    """
    基于RAG的Agent实现
    集成了文档检索和LLM生成功能
    """
    
    # 自定义RAG的prompt模板
    RAG_PROMPT_TEMPLATE = """你是一个智能助手，具备以下能力：
1. 文档检索和理解
2. 使用各种工具完成任务

可用工具：
{tools_description}

历史对话：
{chat_history}

用户问题：{query}

请按照以下步骤回答：
1. 分析用户问题的意图
2. 根据需要使用文档检索或其他工具
3. 综合工具结果和上下文生成回答
4. 如果使用了检索结果，请说明信息来源

请用markdown格式回复。
"""

    def __init__(self, config: Dict[str, Any]):
        # 使用自定义的prompt模板
        config['prompt_template'] = self.RAG_PROMPT_TEMPLATE
        super().__init__(config)
        self.rag = Rag()
    
    def run(self, query: str) -> str:
        """
        处理用户查询
        1. 使用RAG检索相关文档
        2. 构建提示
        3. 调用LLM生成回答
        """
        # 使用RAG检索相关文档
        docs = self.rag.retrieve_documents(query)
        
        # 将检索结果添加到记忆中
        self.set_memory('retrieved_docs', docs)
        
        # 调用父类的run方法处理查询
        return super().run(query)
    
    def reset(self):
        """重置Agent状态"""
        super().reset()
        self.rag.reset() 