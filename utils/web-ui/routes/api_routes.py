from flask import Blueprint, request, jsonify
from rag.rag import Rag
# import utils.rag_utils as rag_utils
# import utils.agent_utils as agent_utils
# import utils.multimodal_utils as multimodal_utils
# import utils.model_utils as model_utils

api_bp = Blueprint('api', __name__)

@api_bp.route('/api/rag', methods=['POST'])
def rag_api():
    data = request.json
    response = Rag().generate_response(data['message'])
    return jsonify({'response': response})

# @api_bp.route('/api/agent', methods=['POST'])
# def agent_api():
#     data = request.json
#     response = agent_utils.generate_response(data['message'])
#     return jsonify({'response': response})

# @api_bp.route('/api/multimodal', methods=['POST'])
# def multimodal_api():
#     data = request.json
#     response = multimodal_utils.generate_response(data['message'])
#     return jsonify({'response': response})

# @api_bp.route('/api/raw', methods=['POST'])
# def raw_api():
#     data = request.json
#     response = model_utils.generate_response(data['message'])
#     return jsonify({'response': response})