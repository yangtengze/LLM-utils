from typing import Dict, Any
from .base_agent import BaseAgent

class TestAgent(BaseAgent):
    """
    用于测试的简单Agent实现
    继承BaseAgent的所有功能，不添加额外的特殊功能
    """
    
    # 可以定制自己的prompt模板
    TEST_PROMPT_TEMPLATE = """你是一个测试用的智能助手。

可用工具：
{tools_description}

历史对话：
{chat_history}

用户问题：{query}

请理解用户问题并给出合适的回答。如果需要使用工具，请明确指出。
请用markdown格式回复。
"""

    def __init__(self, config: Dict[str, Any]):
        # 使用自定义的prompt模板
        config['prompt_template'] = self.TEST_PROMPT_TEMPLATE
        super().__init__(config) 