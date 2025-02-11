from flask import Blueprint, render_template

chat_bp = Blueprint('chat', __name__)

@chat_bp.route('/rag')
def rag_chat():
    return render_template('rag_chat.html')

@chat_bp.route('/agent')
def agent_chat():
    return render_template('agent_chat.html')

@chat_bp.route('/multimodal')
def multimodal_chat():
    return render_template('multimodal_chat.html')

@chat_bp.route('/raw')
def raw_chat():
    return render_template('raw_chat.html')