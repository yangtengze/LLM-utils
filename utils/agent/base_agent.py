from utils.load_config import configs
from utils.base_func import parse_response
from abc import ABC
from typing import Any, Dict, List, Optional, Union
from .tools import Tool, ToolRegistry
import logging
from pathlib import Path
import time
import requests
import json
import re
import os


class BaseAgent(ABC):
    """
    基础Agent类，提供了Agent的核心功能框架
    - 工具管理
    - 状态管理
    - 记忆管理
    - 执行历史
    - 日志系统
    - LLM调用
    - Prompt管理
    """
    
    DEFAULT_PROMPT_TEMPLATE = """
    # 智能助手操作指南

    ## 介绍
    您好，您是一名多功能智能助手，能够理解用户需求并利用一系列工具来提供帮助。

    ## 工具箱
    以下是您可用的工具列表及其简要描述：
    {tools_description}

    ## 使用工具的规则
    - **无参数工具**：使用格式 `<tool name="工具名称" />`
    - **带参数工具**：使用格式 `<tool name="工具名称" params="{{参数名: 参数值, 参数名: 参数值, ...}}" />`
    - **示例**：
    - 无参数：`<tool name="get_local_ip" />`
    - 带参数：`<tool name="search_documents" params="{{query: '关键词', topk: 10}}" />`

    ## 对话历史
    在此查看与用户的对话历史记录，以便更好地理解上下文：
    {chat_history}

    ## 当前问题
    用户提出的问题是：
    {query}

    ## 执行步骤
    1. **理解**：仔细阅读用户的问题，确保完全理解其意图。
    2. **决策**：根据问题的性质，决定是否需要使用工具来获取答案。
    3. **行动**：
    - 如果需要使用工具，请遵循上述规则进行操作。
    - 如果不需要工具，直接利用您的知识库回答。
    4. **评估**：
    - 如果使用了工具，检查返回结果是否满足需求。
    - 如果未使用工具，确保您的回答准确无误。
    5. **回复**：
    - 使用清晰、准确的语言回答用户。
    - 如果使用了工具，请提供对结果的解释。
    - 根据情况，可能需要提供额外的信息或建议。

    请确保您的回答格式规范，使用Markdown进行排版。
    """


    def __init__(self, config: Dict[str, Any] = None):
        """
        初始化Agent
        :param config: 配置字典，包含：
            - max_history_length: 历史记录最大长度
            - state_path: 状态保存路径
            - log_path: 日志保存路径
            - prompt_template: 自定义prompt模板
            - llm: LLM配置
                - endpoint: API端点
                - model: 模型名称
                - temperature: 温度参数
                - stream: 是否流式响应
        """
        self.default_config = {
            'maxhistorylength': 100,
            'state_path': 'data/agent_state.json',
            'logpath': 'logs',
            'llm': {
                'endpoint': configs['ollama']['endpoint'],
                'model': configs['ollama']['default_model'],
                'temperature': configs['ollama']['temperature'],
                'stream': configs['ollama']['stream']
            }
        }
        self.config = config if config is not None else self.default_config

        self.tool_registry = ToolRegistry()
        self.history: List[Dict[str, str]] = []  # 修改类型注解
        self.memory: Dict[str, Any] = {}  # 代理记忆/状态存储
        self.max_history_length = self.config.get('max_history_length', 100)
        self.llm_config = self.config.get('llm', {
            'endpoint': 'http://localhost:11434',
            'model': 'deepseek-r1:7b',
            'temperature': 0.7,
            'stream': False
        })
        
        # 设置日志
        self._setup_logging()
        
        # 加载已保存的状态
        self._load_initial_state()
        
        # 初始化prompt模板
        self.prompt_template = self.config.get('prompt_template', self.DEFAULT_PROMPT_TEMPLATE)
    
    def _setup_logging(self) -> None:
        """配置日志系统"""
        log_path = Path(self.config.get('log_path', 'logs'))
        log_path.mkdir(parents=True, exist_ok=True)
        
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler(
                    log_path / f'log-{time.strftime("%Y%m%d")}.log',
                    encoding='utf-8'
                ),
                logging.StreamHandler()
            ]
        )
        self.logger = logging.getLogger(self.__class__.__name__)
    
    def _load_initial_state(self) -> None:
        """加载初始状态"""
        state_path = self.config.get('state_path')
        if state_path:
            # 确保目录存在
            state_dir = os.path.dirname(state_path)
            if not os.path.exists(state_dir):
                os.makedirs(state_dir)
            
            # 如果文件不存在，创建一个空的状态文件
            if not os.path.exists(state_path):
                initial_state = {
                    'history': [],
                    'memory': {}
                }
                with open(state_path, 'w', encoding='utf-8') as f:
                    json.dump(initial_state, f, ensure_ascii=False, indent=2)
            
            self.load_state(state_path)
    
    def register_tool(self, tool: Union[Tool, List[Tool]]) -> None:
        """
        注册新工具到代理
        :param tool: 单个工具或工具列表
        """
        if isinstance(tool, list):
            for t in tool:
                self.tool_registry.register(t)
                self.logger.info(f"Registered tool: {t.name}")
        else:
            self.tool_registry.register(tool)
            self.logger.info(f"Registered tool: {tool.name}")
    
    def use_tool(self, tool_name: str, **kwargs) -> Any:
        """
        使用指定的工具
        :param tool_name: 工具名称
        :param kwargs: 工具参数
        :return: 工具执行结果
        """
        tool = self.tool_registry.get_tool(tool_name)
        if not tool:
            self.logger.error(f"Tool not found: {tool_name}")
            raise ValueError(f"Tool not found: {tool_name}")
        
        try:
            self.logger.info(f"Using tool: {tool_name} with params: {kwargs}")
            result = tool.func(**kwargs)
            
            # 记录工具使用历史
            self.add_to_history({
                'timestamp': time.time(),
                'type': 'tool_use',
                'tool': tool_name,
                'parameters': kwargs,
                'result': result,
                'status': 'success'
            })
            
            return result
        except Exception as e:
            self.logger.error(f"Tool execution failed: {str(e)}")
            # 记录失败历史
            self.add_to_history({
                'timestamp': time.time(),
                'type': 'tool_use',
                'tool': tool_name,
                'parameters': kwargs,
                'error': str(e),
                'status': 'failed'
            })
            raise
    
    def add_to_history(self, message: str, role: str = 'user') -> None:
        """
        添加消息到历史记录
        :param message: 消息内容
        :param role: 角色(user/assistant)
        """
        self.history.append({
            'role': role,
            'content': message
        })
        
        # 如果超出最大长度，移除最早的消息
        while len(self.history) > self.max_history_length:
            self.history.pop(0)
        
        # 保存状态
        self.save_state()
    
    def _auto_save_state(self) -> None:
        """自动保存状态"""
        state_path = self.config.get('state_path')
        if state_path:
            self.save_state(state_path)
    
    def get_history(self, 
                   last_n: Optional[int] = None, 
                   filter_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        获取执行历史
        :param last_n: 获取最后n条记录，None表示获取全部
        :param filter_type: 按类型筛选历史记录
        :return: 历史记录列表
        """
        history = self.history
        if filter_type:
            history = [h for h in history if h.get('type') == filter_type]
        if last_n is not None:
            history = history[-last_n:]
        return history
    
    def clear_history(self, before_timestamp: Optional[float] = None) -> None:
        """
        清除历史记录
        :param before_timestamp: 清除此时间戳之前的记录，None表示清除所有
        """
        if before_timestamp is None:
            self.history = []
        else:
            self.history = [h for h in self.history 
                          if h.get('timestamp', 0) >= before_timestamp]
        self.logger.info(f"Cleared history before {before_timestamp}")
    
    def format_chat_history(self) -> str:
        """
        格式化对话历史
        :return: 格式化后的历史记录
        """
        formatted_history = []
        for msg in self.history:
            formatted_history.append(
                {f"{msg['role'].upper()}: {msg['content']}"}
            )
        formatted_history_str = "\n".join([str(msg) for msg in formatted_history])
        return formatted_history_str
    
    def generate_prompt(self, query: str) -> str:
        """
        生成完整的prompt
        :param query: 用户查询
        :return: 格式化后的prompt
        """
        tools_description = self.get_tools_description()
        chat_history = self.format_chat_history()
        
        prompt = self.prompt_template.format(
            tools_description=tools_description,
            chat_history=chat_history,
            query=query
        )
        
        return prompt
    
    def update_last_response(self, response: str) -> None:
        """
        更新最后一条查询的响应
        :param response: 响应内容
        """
        for entry in reversed(self.history):
            if entry.get('type') == 'query':
                entry['response'] = response
                # 记录日志
                self.logger.info(f"Updated response for query: {entry['content']}")
                # 自动保存状态
                self._auto_save_state()
                break
    
    def _call_llm(self, prompt: str) -> str:
        """
        调用LLM模型
        :param prompt: 提示文本
        :return: 模型响应
        """
        data = {
            "model": self.llm_config.get('model', 'deepseek-r1:7b'),
            "prompt": prompt,
            "stream": self.llm_config.get('stream', False),
            "options": {
                "temperature": self.llm_config.get('temperature', 0.7)
            }
        }
        url = f"{self.llm_config.get('endpoint', 'http://localhost:11434')}/api/generate"
        
        try:
            self.logger.debug(f"Calling LLM with prompt: {prompt}")
            response = requests.post(url, data=json.dumps(data))
            
            if response.status_code == 200:
                result = parse_response(response, data['stream'])
                self.logger.debug(f"LLM response: {result}")
                return result
            else:
                error_msg = f"LLM调用失败: HTTP {response.status_code} - {response.text}"
                self.logger.error(error_msg)
                raise Exception(error_msg)
                
        except Exception as e:
            self.logger.error(f"LLM调用出错: {str(e)}")
            raise

    def run(self, query: str) -> str:
        """
        处理用户查询
        :param query: 用户输入
        :return: 回复内容
        """
        # 添加用户消息到历史
        self.add_to_history(query, 'user')
        
        # 生成prompt
        prompt = self.generate_prompt(query)
        
        try:
            # 调用LLM
            response = self._call_llm(prompt)
            # self.logger.info(f'LLM prompt: {prompt}')
            # 处理工具调用
            processed_response = self._process_tool_calls(response)
            
            # 添加助手回复到历史
            self.add_to_history(processed_response, 'assistant')
            
            return processed_response
            
        except Exception as e:
            error_msg = f"处理查询时出错: {str(e)}"
            self.logger.error(error_msg)
            return error_msg

    def _process_tool_calls(self, response: str) -> str:
        """处理响应中的工具调用"""
        # 使用更复杂的正则表达式匹配带参数的工具调用
        tool_pattern = r'<tool\s+name="([^"]+)"(?:\s+params=({[^}]+}))?\s*/>'
        tool_matches = re.finditer(tool_pattern, response)
        
        if not tool_matches:
            return response
            
        processed_response = response
        for match in tool_matches:
            tool_name = match.group(1)
            params_str = match.group(2)
            
            try:
                # 解析参数
                params = {}
                if params_str:
                    params = json.loads(params_str)
                
                # 调用工具
                self.logger.info(f"正在调用工具: {tool_name} 参数: {params}")
                tool_result = self.use_tool(tool_name, **params)
                
                # 格式化工具结果
                formatted_result = (
                    f"\n### 工具执行结果\n"
                    f"```json\n{json.dumps(tool_result, ensure_ascii=False, indent=2)}\n```\n"
                )
                
                # 替换原始的工具调用标记
                processed_response = processed_response.replace(
                    match.group(0),
                    formatted_result
                )
                
            except Exception as e:
                error_msg = f"\n### 工具调用失败\n```\n{str(e)}\n```\n"
                self.logger.error(f"工具 {tool_name} 调用失败: {str(e)}")
                processed_response = processed_response.replace(
                    match.group(0),
                    error_msg
                )
        
        return processed_response
    
    def reset(self) -> None:
        """
        重置agent状态
        - 清空历史记录
        - 清空记忆
        - 保留工具注册
        """
        self.history = []
        self.memory = {}
        self.logger.info("Agent state reset")
    
    def get_available_tools(self) -> List[Dict[str, str]]:
        """获取所有可用工具列表"""
        return self.tool_registry.list_tools()
    
    def set_memory(self, key: str, value: Any) -> None:
        """
        存储信息到代理记忆中
        :param key: 键
        :param value: 值
        """
        self.memory[key] = value
    
    def get_memory(self, key: str, default: Any = None) -> Any:
        """
        从代理记忆中获取信息
        :param key: 键
        :param default: 默认值
        :return: 存储的值
        """
        return self.memory.get(key, default)
    
    def save_state(self, path: str = None) -> None:
        """
        保存代理状态到文件
        :param path: 状态文件路径，如果为None则使用配置中的路径
        """
        if path is None:
            path = self.config.get('state_path')
            if not path:
                self.logger.warning("No state path configured, skipping state save")
                return

        try:
            # 确保目录存在
            state_dir = os.path.dirname(path)
            if not os.path.exists(state_dir):
                os.makedirs(state_dir)

            # 保存状态
            state = {
                'history': self.history,
                'memory': self.memory
            }
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(state, f, ensure_ascii=False, indent=2)
            
            self.logger.debug(f"State saved to {path}")
        except Exception as e:
            self.logger.error(f"Failed to save state: {str(e)}")
    
    def load_state(self, path: str) -> None:
        """
        从文件加载代理状态
        :param path: 状态文件路径
        """
        try:
            with open(path, 'r', encoding='utf-8') as f:
                state = json.load(f)
                self.history = state.get('history', [])
                self.memory = state.get('memory', {})
        except FileNotFoundError:
            self.logger.warning(f"State file not found: {path}")
            self.history = []
            self.memory = {}
        except json.JSONDecodeError:
            self.logger.error(f"Invalid JSON in state file: {path}")
            self.history = []
            self.memory = {}
            # 重新创建有效的状态文件
            self.save_state(path) 

    def get_tools_description(self) -> str:
        """
        获取所有可用工具的描述
        :return: 格式化的工具描述字符串
        """
        tools = self.get_available_tools()
        
        # 生成工具描述
        descriptions = []
        for tool in tools:
            desc = f"- {tool['name']}: {tool['description']}"
            # 如果工具有参数，添加参数说明
            if 'parameters' in tool:
                params_desc = []
                for param_name, param_info in tool['parameters'].items():
                    param_desc = f"  - {param_name}"
                    if param_info.get('required', False):
                        param_desc += " (必填)"
                    if 'default' in param_info:
                        param_desc += f" (默认值: {param_info['default']})"
                    if 'description' in param_info:
                        param_desc += f": {param_info['description']}"
                    params_desc.append(param_desc)
                if params_desc:
                    desc += "\n  参数:\n" + "\n".join(params_desc)
            descriptions.append(desc)
        
        return "\n".join(descriptions) 