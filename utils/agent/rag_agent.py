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

当前用户问题：{query}

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
        
        # 添加用户消息到历史
        self.add_to_history(query, 'user')
        
        # 生成prompt并调用LLM
        prompt = self.generate_prompt(query)
        try:
            response = self._call_language_model(prompt)
            processed_response = self._process_tool_calls(response)
            
            # 添加助手回复到历史
            self.add_to_history(processed_response, 'assistant')
            
            return processed_response
            
        except Exception as e:
            error_msg = f"处理查询时出错: {str(e)}"
            self.logger.error(error_msg)
            return error_msg
    
    def reset(self):
        """重置Agent状态"""
        super().reset()
        self.rag.reset() 