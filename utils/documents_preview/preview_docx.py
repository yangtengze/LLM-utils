import base64

def preview_docx(file_path):
    """预览DOCX文件"""
    relative_url = f"/{file_path}"
    
    # 读取文件二进制数据并进行base64编码
    with open(file_path, 'rb') as f:
        file_data = base64.b64encode(f.read()).decode('utf-8')
    
    return {
        'status': 'success',
        'file_path': file_path,
        'type': 'docx',
        'url': relative_url,
        'data': file_data
    }