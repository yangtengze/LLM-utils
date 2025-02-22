from flask import Blueprint, request, jsonify
from utils.agent.base_agent import BaseAgent
from utils.rag import Rag
from utils.agent.tools import *
# import utils.multimodal_utils as multimodal_utils
import os
api = Blueprint('api', __name__)
# 初始化 Agent 和 RAG
agent = BaseAgent()

rag = Rag()
# 注册工具
agent.register_tool(Tool(
    name="get_local_ip",
    description="获取本机的IP地址信息",
    func=get_local_ip
))
# 注册带参数的工具
agent.register_tool(Tool(
    name="search_documents",
    description="搜索文档库中的相关内容",
    func=search_documents,
    parameters={
        "query": {
            "description": "搜索查询文本",
            "type": "string",
            "required": True
        },
        "top_k": {
            "description": "返回的最大结果数量",
            "type": "integer",
            "default": 3,
            "required": False
        }
    }
)) 

@api.route('/chat/raw', methods=['POST'])
def raw_chat():
    """原始对话接口"""
    data = request.get_json()
    message = data.get('message', '')
    temperature = data.get('temperature', 0.7)  # 获取温度参数
    
    try:
        # 添加用户消息到历史
        agent.add_to_history(message, 'user')
        
        # 临时更新温度设置
        original_temp = rag.config['ollama']['temperature']
        rag.config['ollama']['temperature'] = temperature
        
        # 调用 LLM
        response = rag._call_language_model(message)
        
        # 恢复原始温度设置
        rag.config['ollama']['temperature'] = original_temp
        
        # 添加助手回复到历史
        agent.add_to_history(response, 'assistant')
        
        return jsonify({
            'status': 'success',
            'response': response
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@api.route('/chat/rag', methods=['POST'])
def rag_chat():
    """RAG 对话接口"""
    data = request.get_json()
    message = data.get('message', '')
    
    try:
        response = rag.generate_response(message)
        return jsonify({
            'status': 'success',
            'response': response
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@api.route('/chat/agent', methods=['POST'])
def agent_chat():
    """Agent 对话接口"""
    data = request.get_json()
    message = data.get('message', '')
    
    try:
        response = agent.run(message)
        return jsonify({
            'status': 'success',
            'response': response
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500
@api.route('/documents', methods=['GET'])
def get_documents():
    """获取已加载的文档列表"""
    try:
        docs = rag.docs  # 假设 rag 实例有 docs 属性存储文档信息
        # 转换为相对路径
        documents = []
        for doc in docs:
            file_path = doc.get('file_path', '')
            # 将绝对路径转换为相对于项目根目录的路径
            relative_path = os.path.relpath(file_path, os.getcwd())
            documents.append({
                'file_path': relative_path,
                'timestamp': doc.get('timestamp', '')
            })
        return jsonify(documents)
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@api.route('/tools', methods=['GET'])
def get_tools():
    """获取可用工具列表"""
    try:
        tools = agent.get_available_tools()
        # print(tools)
        return jsonify(tools)
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

# @api.route('/api/multimodal', methods=['POST'])
# def multimodal_api():
#     data = request.json
#     response = multimodal_utils.generate_response(data['message'])
#     return jsonify({'response': response})
