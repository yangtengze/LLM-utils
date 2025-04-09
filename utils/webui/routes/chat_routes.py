from flask import Blueprint, render_template

chat = Blueprint('chat', __name__)

@chat.route('/raw')
def raw_chat():
    """原始对话页面"""
    return render_template('raw_chat.html')

@chat.route('/rag')
def rag_chat():
    """RAG 对话页面"""
    return render_template('rag_chat.html')