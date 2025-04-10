def preview_html(file_path):
    # 构建相对URL路径
    relative_url = f"/{file_path}"
            
    return {
        'status': 'success',
        'file_path': file_path,
        'type': 'html_iframe',
        'url': relative_url
    }
