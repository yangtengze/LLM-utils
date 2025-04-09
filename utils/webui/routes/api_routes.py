from flask import Blueprint, request, jsonify
from utils.rag import Rag
from utils.load_config import configs
from werkzeug.utils import secure_filename
from utils.documents_preview import *
from utils.ocr_manager import get_ocr_engine
from utils.base_func import *
import os
import re

api = Blueprint('api', __name__)

# 直接初始化 Rag 实例
rag = Rag()
rag.load_documents(rag.files)

@api.route('/config', methods=['GET'])
def get_config():
    """获取配置信息"""
    try:
        return jsonify({
            'status': 'success',
            'current_model': configs['ollama']['default_model'],
            'available_models': configs['ollama']['models']
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@api.route('/config/model', methods=['POST'])
def update_model():
    """更新当前使用的模型"""
    try:
        data = request.get_json()
        model_name = data.get('model')
        
        if model_name not in configs['ollama']['models']:
            return jsonify({
                'status': 'error',
                'message': '不支持的模型'
            }), 400
            
        # 更新 RAG 模型配置
        rag.llm_model = model_name
        
        return jsonify({
            'status': 'success',
            'model': model_name
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@api.route('/chat_completions', methods=['POST'])
def chat_completions():
    """与聊天模型进行交互，生成基于用户输入的自然语言响应"""
    data = request.get_json()
    message = data.get('message', '')
    temperature = data.get('temperature', 0.7)
    model_name = data.get('model', configs['ollama']['default_model'])
    system_prompt = data.get('system_prompt', '')
    
    try:
        # 临时更新温度设置
        original_temp = rag.config['ollama']['temperature']
        rag.config['ollama']['temperature'] = temperature
        
        # 调用 LLM，传递系统提示
        response = call_language_model(message, system_prompt=system_prompt)
        
        # 恢复原始温度设置
        rag.config['ollama']['temperature'] = original_temp

        return jsonify({
            'status': 'success',
            'response': response,
            'model': model_name,
            'latex': re.findall(r'\\(?:begin|end)\{[a-z]*\}|\\.|[{}]|\$', response)  # 公式检测
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@api.route('/related_questions', methods=['POST'])
def related_questions():
    """获取与用户提供的问题相关的问题列表"""
    data = request.get_json()
    question = data.get('question', '')
    count = data.get('count', 5)  # 默认返回5个相关问题
    
    try:
        # 使用 RAG 系统生成相关问题
        # 这里使用一个特定的提示词来引导模型生成相关问题
        system_prompt = f"""
        请基于以下问题，生成{count}个相关的、用户可能会感兴趣的后续问题。
        问题应该多样化，覆盖不同的角度和相关主题。
        只返回问题列表，每个问题一行，前面加上数字编号。
        """
        # 调用语言模型，使用系统提示和问题内容
        response = call_language_model(question, system_prompt=system_prompt)
        
        # 解析出单独的问题
        questions = []
        for line in response.strip().split('\n'):
            line = line.strip()
            # 匹配形如 "1. 问题内容" 的格式
            match = re.match(r'^\d+\.?\s+(.+)$', line)
            if match and match.group(1):
                questions.append(match.group(1))
        
        # 如果没有提取到有效问题，或者提取的问题少于要求，返回一个错误
        if len(questions) < 1:
            return jsonify({
                'status': 'error',
                'message': '无法生成相关问题'
            }), 500
        
        return jsonify({
            'status': 'success',
            'questions': questions
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@api.route('/reference_files', methods=['POST'])
def reference_files():
    """检索与特定问题相关的参考文件"""
    data = request.get_json()
    question_id = data.get('question_id')
    question = data.get('question', '')
    
    try:
        # 如果有问题ID但没有问题内容，尝试从某处获取问题内容
        if question_id and not question:
            # 这里假设有一个存储问题的机制，可以根据ID查询问题内容
            # 实际实现时需要替换为真实的查询逻辑
            # question = get_question_by_id(question_id)
            pass
        
        if not question:
            return jsonify({
                'status': 'error',
                'message': '未提供有效的问题内容'
            }), 400
        
        # 使用 RAG 系统进行文档检索
        # 获取与问题最相关的文档
        relevant_docs = rag.retrieve_documents(question)
        
        # 处理结果，提取文件信息并确保可序列化
        reference_contents = []
        reference_files = []
        for doc in relevant_docs:
            file_content = doc.get('content', '')

            file_path = doc.get('file_path', '')
            # 将绝对路径转换为相对于项目根目录的路径
            relative_path = os.path.relpath(file_path, os.getcwd()) if file_path else ''
            
            # 确保分数是标准Python浮点数
            score = float(doc.get('score', 0))
            
            # 获取文件类型
            file_ext = os.path.splitext(file_path)[1].lower().lstrip('.')
            
            # 检查这个文件是否已经在列表中
            if not any(ref['file_path'] == relative_path for ref in reference_files):
                reference_files.append({
                    'file_path': relative_path,
                    'score': score,
                    'file_type': file_ext,
                    'timestamp': str(doc.get('timestamp', ''))
                })
            reference_contents.append({
                'file_path': relative_path,
                'score': score,
                'content': file_content
            })
        
        return jsonify({
            'status': 'success',
            'question': question,
            'question_id': question_id,
            'reference_files': reference_files,
            'reference_contents': reference_contents
        })
    
    except Exception as e:
        print(f"获取参考文件失败: {e}")
        return jsonify({
            'status': 'error',
            'message': f'获取参考文件失败: {str(e)}'
        }), 500

@api.route('/chat/rag/prompt', methods=['POST'])
def get_rag_prompt():
    """获取完整的 RAG prompt"""
    data = request.get_json()
    message = data.get('message', '')
    
    try:
        # 生成 RAG 提示
        prompt = rag.generate_prompt(message)
        
        return jsonify({
            'status': 'success',
            'context': prompt
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
            
            # 检查路径是否已经存在于列表中
            if not any(doc['file_path'] == relative_path for doc in documents):
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

@api.route('/documents/preview', methods=['POST'])
def preview_document():
    """预览文档内容"""
    data = request.get_json()
    file_path = data.get('file_path')
    
    try:
        allowed_extensions = ['.txt', '.md', '.csv', '.log', '.pdf', '.docx', '']
        
        if not file_path or not any(file_path.endswith(ext) for ext in allowed_extensions):
            return jsonify({
                'status': 'error',
                'message': '不支持预览此类型文件'
            }), 400
        
        file_ext = os.path.splitext(file_path)[1].lower()
        
        preview_func_map = {
            '.csv': preview_csv,
            '.docx': preview_docx,
            '.pdf': preview_pdf,
            '.md': preview_markdown,
            '.txt': lambda path: {
                'type': 'text', 
                'content': open(path, 'r', encoding='utf-8').read()
            },
            '': lambda path: {
                'type': 'text', 
                'content': open(path, 'r', encoding='utf-8').read()
            }
        }
        
        preview_result = preview_func_map.get(file_ext, lambda path: {
            'type': 'text', 
            'content': f"不支持预览 {file_ext} 类型文件"
        })(file_path)
        
        return jsonify({
            'status': 'success',
            'file_path': file_path,
            **preview_result
        })
    
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'预览失败：{str(e)}'
        }), 500

@api.route('/upload', methods=['POST'])
def upload_files():
    """处理文件上传"""
    if 'files' not in request.files:
        return jsonify({
            'status': 'error',
            'message': '没有文件被上传'
        }), 400
        
    files = request.files.getlist('files')
    if not files:
        return jsonify({
            'status': 'error',
            'message': '没有选择文件'
        }), 400

    try:
        # 确保上传目录存在
        upload_dir = os.path.join('data', 'documents')
        os.makedirs(upload_dir, exist_ok=True)
        
        uploaded_files = []
        for file in files:
            if file.filename:
                filename = secure_filename(file.filename)
                filepath = os.path.join(upload_dir, filename)
                file.save(filepath)
                uploaded_files.append(filepath)
        
        # 加载文档到 RAG 系统
        rag.load_documents(uploaded_files)
        
        return jsonify({
            'status': 'success',
            'message': f'成功上传 {len(uploaded_files)} 个文件'
        })
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'上传文件失败: {str(e)}'
        }), 500

